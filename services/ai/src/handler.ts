import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ERROR_CODES, MEETINGS_TABLE, DEFAULT_MODEL_ID, SUPPORTED_MODELS } from '../../../shared/src/constants';
import { ErrorResponse, MeetingRecord, EmailStatus } from '../../../shared/src/types';
import { requireAuth } from '../../auth/src/middleware';

const bedrock = new BedrockRuntimeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new (require('@aws-sdk/client-ses').SESClient)({});
const SendEmailCommand = require('@aws-sdk/client-ses').SendEmailCommand;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@meeting-minutes.example.com';

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(statusCode: number, error: string, message: string, requestId: string): APIGatewayProxyResult {
  const body: ErrorResponse = { statusCode, error, message, requestId };
  return response(statusCode, body);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeBedrockWithRetry(modelId: string, prompt: string, maxRetries = 3): Promise<string> {
  const isAmazonModel = modelId.startsWith('amazon.');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let requestBody: string;
      if (isAmazonModel) {
        // Amazon Nova format
        requestBody = JSON.stringify({
          messages: [{ role: 'user', content: [{ text: prompt }] }],
          inferenceConfig: { maxTokens: 4096 },
        });
      } else {
        // Anthropic Claude format
        requestBody = JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        });
      }

      const result = await bedrock.send(
        new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: requestBody,
        })
      );
      const responseBody = JSON.parse(new TextDecoder().decode(result.body));

      if (isAmazonModel) {
        return responseBody.output?.message?.content?.[0]?.text || '';
      } else {
        return responseBody.content?.[0]?.text || '';
      }
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

async function summarize(userId: string, meetingId: string, body: any, requestId: string) {
  const meeting = await ddb.send(
    new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  if (!meeting.Item || meeting.Item.userId !== userId) {
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Meeting not found', requestId);
  }

  const modelId = body.modelId || DEFAULT_MODEL_ID;
  const isSupported = SUPPORTED_MODELS.some((m) => m.modelId === modelId);
  if (!isSupported) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, `Unsupported model: ${modelId}`, requestId);
  }

  const prompt = `สรุปรายงานการประชุมต่อไปนี้ให้กระชับและเข้าใจง่าย:

หัวข้อการประชุม: ${meeting.Item.topic}

ข้อหารือ:
${meeting.Item.discussion}

Next Steps:
${meeting.Item.nextSteps || 'ไม่ระบุ'}

ผู้เข้าร่วมประชุม:
${(meeting.Item.participants || []).map((p: any) => `- ${p.name} (${p.email})`).join('\n')}

กรุณาสรุปประเด็นสำคัญ ข้อตกลง และสิ่งที่ต้องดำเนินการต่อ`;

  try {
    const summary = await invokeBedrockWithRetry(modelId, prompt);
    return response(200, { summary, modelUsed: modelId });
  } catch (err: any) {
    return errorResponse(502, ERROR_CODES.AI_SERVICE_ERROR, 'AI summarization failed. Please try again or select a different model.', requestId);
  }
}

async function listModels(requestId: string) {
  return response(200, { models: SUPPORTED_MODELS, defaultModel: DEFAULT_MODEL_ID });
}

async function updateSummary(userId: string, meetingId: string, body: any, requestId: string) {
  const meeting = await ddb.send(
    new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  if (!meeting.Item || meeting.Item.userId !== userId) {
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Meeting not found', requestId);
  }
  if (!body.summary) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'summary is required', requestId);
  }

  await ddb.send(
    new UpdateCommand({
      TableName: MEETINGS_TABLE,
      Key: { meetingId },
      UpdateExpression: 'SET summary = :summary, summaryModelId = :modelId, updatedAt = :now',
      ExpressionAttributeValues: {
        ':summary': body.summary,
        ':modelId': body.modelId || 'manual',
        ':now': new Date().toISOString(),
      },
    })
  );

  const updated = await ddb.send(
    new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  return response(200, { meeting: updated.Item });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId || 'unknown';
  if (event.httpMethod === 'OPTIONS') return response(200, {});

  const path = event.path;
  const method = event.httpMethod;

  // GET /ai/models - no auth needed for model list
  if (method === 'GET' && path.endsWith('/models')) {
    return await listModels(requestId);
  }

  const auth = requireAuth(event);
  if ('statusCode' in auth) return auth;
  const { userId } = auth;

  // Extract meetingId from path like /ai/summarize/{meetingId} or /ai/summary/{meetingId}
  const pathMatch = path.match(/\/ai\/(summarize|summary|send-email|resend-email)\/([^/]+)/);
  const action = pathMatch?.[1];
  const meetingId = pathMatch?.[2];

  if (!meetingId) {
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Route not found', requestId);
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (method === 'POST' && action === 'summarize') {
      return await summarize(userId, meetingId, body, requestId);
    }
    if (method === 'PUT' && action === 'summary') {
      return await updateSummary(userId, meetingId, body, requestId);
    }
    if (method === 'POST' && (action === 'send-email' || action === 'resend-email')) {
      return await sendEmail(userId, meetingId, body, requestId);
    }
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Route not found', requestId);
  } catch (err: any) {
    console.error('Unhandled error:', err);
    return errorResponse(500, ERROR_CODES.INTERNAL_ERROR, 'Internal server error', requestId);
  }
}
function formatEmailBody(meeting: MeetingRecord): string {
  const participantList = meeting.participants.map((p) => `  - ${p.name} (${p.email})`).join('\n');
  return `สรุปการประชุม: ${meeting.topic}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📋 สรุปจาก AI:\n${meeting.summary || 'ไม่มีสรุป'}\n\n👥 ผู้เข้าร่วมประชุม:\n${participantList}\n\n📌 Next Steps:\n${meeting.nextSteps || 'ไม่ระบุ'}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nส่งโดยระบบ Meeting Minutes AI`;
}

async function sendToParticipant(email: string, subject: string, body: string, maxRetries = 2): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await ses.send(new SendEmailCommand({
        Source: SENDER_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: body, Charset: 'UTF-8' } } },
      }));
      return true;
    } catch (err) {
      if (attempt < maxRetries - 1) { await sleep(Math.pow(2, attempt) * 1000); continue; }
      console.error(`Failed to send email to ${email}:`, err);
      return false;
    }
  }
  return false;
}

async function sendEmail(userId: string, meetingId: string, body: any, requestId: string) {
  const meeting = await ddb.send(new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } }));
  if (!meeting.Item || meeting.Item.userId !== userId) return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Meeting not found', requestId);
  const record = meeting.Item as MeetingRecord;
  if (!record.summary) return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'Meeting has no summary. Please summarize first.', requestId);
  const targetEmails = body.participantEmails || record.participants.map((p) => p.email);
  const subject = `สรุปการประชุม: ${record.topic}`;
  const emailBody = formatEmailBody(record);
  const sent: string[] = []; const failed: string[] = [];
  for (const email of targetEmails) { (await sendToParticipant(email, subject, emailBody)) ? sent.push(email) : failed.push(email); }
  const emailStatus: EmailStatus = { sent, failed, lastSentAt: new Date().toISOString() };
  await ddb.send(new UpdateCommand({ TableName: MEETINGS_TABLE, Key: { meetingId }, UpdateExpression: 'SET emailStatus = :status, updatedAt = :now', ExpressionAttributeValues: { ':status': emailStatus, ':now': new Date().toISOString() } }));
  if (failed.length === targetEmails.length) return errorResponse(502, ERROR_CODES.EMAIL_SERVICE_ERROR, 'All emails failed to send', requestId);
  if (failed.length > 0) return response(207, { sent, failed, message: 'Some emails failed to send' });
  return response(200, { sent, failed, message: 'All emails sent successfully' });
}


