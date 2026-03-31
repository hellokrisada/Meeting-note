import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MeetingRecord, ErrorResponse, EmailStatus } from '../../../shared/src/types';
import { ERROR_CODES, MEETINGS_TABLE } from '../../../shared/src/constants';
import { requireAuth } from '../../auth/src/middleware';

const ses = new SESClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SENDER_EMAIL = process.env.SENDER_EMAIL!;

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

export function formatEmailBody(meeting: MeetingRecord): string {
  const participantList = meeting.participants
    .map((p) => `  - ${p.name} (${p.email})`)
    .join('\n');

  return `สรุปการประชุม: ${meeting.topic}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 สรุปจาก AI:
${meeting.summary || 'ไม่มีสรุป'}

👥 ผู้เข้าร่วมประชุม:
${participantList}

📌 Next Steps:
${meeting.nextSteps || 'ไม่ระบุ'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ส่งโดยระบบ Meeting Minutes AI`;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToParticipant(email: string, subject: string, body: string, maxRetries = 2): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await ses.send(
        new SendEmailCommand({
          Source: SENDER_EMAIL,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: { Text: { Data: body, Charset: 'UTF-8' } },
          },
        })
      );
      return true;
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      console.error(`Failed to send email to ${email}:`, err);
      return false;
    }
  }
  return false;
}

async function sendEmail(userId: string, meetingId: string, body: any, requestId: string) {
  const meeting = await ddb.send(
    new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  if (!meeting.Item || meeting.Item.userId !== userId) {
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Meeting not found', requestId);
  }

  const record = meeting.Item as MeetingRecord;
  if (!record.summary) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'Meeting has no summary. Please summarize first.', requestId);
  }

  const targetEmails = body.participantEmails || record.participants.map((p) => p.email);
  const subject = `สรุปการประชุม: ${record.topic}`;
  const emailBody = formatEmailBody(record);

  const sent: string[] = [];
  const failed: string[] = [];

  for (const email of targetEmails) {
    const success = await sendToParticipant(email, subject, emailBody);
    if (success) {
      sent.push(email);
    } else {
      failed.push(email);
    }
  }

  // Save email status
  const emailStatus: EmailStatus = { sent, failed, lastSentAt: new Date().toISOString() };
  await ddb.send(
    new UpdateCommand({
      TableName: MEETINGS_TABLE,
      Key: { meetingId },
      UpdateExpression: 'SET emailStatus = :status, updatedAt = :now',
      ExpressionAttributeValues: {
        ':status': emailStatus,
        ':now': new Date().toISOString(),
      },
    })
  );

  if (failed.length === targetEmails.length) {
    return errorResponse(502, ERROR_CODES.EMAIL_SERVICE_ERROR, 'All emails failed to send', requestId);
  }
  if (failed.length > 0) {
    return response(207, { sent, failed, message: 'Some emails failed to send' });
  }
  return response(200, { sent, failed, message: 'All emails sent successfully' });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId || 'unknown';
  if (event.httpMethod === 'OPTIONS') return response(200, {});

  const auth = requireAuth(event);
  if ('statusCode' in auth) return auth;
  const { userId } = auth;

  const path = event.path;
  const method = event.httpMethod;

  const pathMatch = path.match(/\/meetings\/([^/]+)\/(send-email|resend-email)/);
  const meetingId = pathMatch?.[1];
  const action = pathMatch?.[2];

  if (!meetingId || method !== 'POST') {
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Route not found', requestId);
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (action === 'send-email' || action === 'resend-email') {
      return await sendEmail(userId, meetingId, body, requestId);
    }
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Route not found', requestId);
  } catch (err: any) {
    console.error('Unhandled error:', err);
    return errorResponse(500, ERROR_CODES.INTERNAL_ERROR, 'Internal server error', requestId);
  }
}
