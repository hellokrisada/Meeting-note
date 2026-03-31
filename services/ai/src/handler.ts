import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ERROR_CODES, MEETINGS_TABLE, DEFAULT_MODEL_ID, SUPPORTED_MODELS } from '../../../shared/src/constants';
import { ErrorResponse } from '../../../shared/src/types';
import { requireAuth } from '../../auth/src/middleware';

const bedrock = new BedrockRuntimeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await bedrock.send(
        new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          }),
        })
      );
      const responseBody = JSON.parse(new TextDecoder().decode(result.body));
      return responseBody.content?.[0]?.text || '';
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
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

  // Extract meetingId from path like /meetings/{meetingId}/summarize or /meetings/{meetingId}/summary
  const pathMatch = path.match(/\/meetings\/([^/]+)\/(summarize|summary)/);
  const meetingId = pathMatch?.[1];
  const action = pathMatch?.[2];

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
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Route not found', requestId);
  } catch (err: any) {
    console.error('Unhandled error:', err);
    return errorResponse(500, ERROR_CODES.INTERNAL_ERROR, 'Internal server error', requestId);
  }
}
