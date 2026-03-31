import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { MeetingRecord, ErrorResponse } from '../../../shared/src/types';
import { ERROR_CODES, MEETINGS_TABLE } from '../../../shared/src/constants';
import { validateMeetingInput } from '../../../shared/src/validators';
import { requireAuth } from '../../auth/src/middleware';

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

async function createMeeting(userId: string, body: any, requestId: string) {
  const errors = validateMeetingInput(body);
  if (errors.length > 0) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, JSON.stringify(errors), requestId);
  }
  const now = new Date().toISOString();
  const meeting: MeetingRecord = {
    meetingId: uuidv4(),
    userId,
    topic: body.topic,
    discussion: body.discussion,
    nextSteps: body.nextSteps || '',
    participants: body.participants || [],
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: MEETINGS_TABLE, Item: meeting }));
  return response(201, { meetingId: meeting.meetingId, meeting });
}

async function listMeetings(userId: string, requestId: string) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: MEETINGS_TABLE,
      IndexName: 'userId-createdAt-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ScanIndexForward: false, // descending by createdAt
    })
  );
  return response(200, { meetings: result.Items || [], count: result.Count || 0 });
}

async function getMeeting(userId: string, meetingId: string, requestId: string) {
  const result = await ddb.send(
    new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  if (!result.Item || result.Item.userId !== userId) {
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Meeting not found', requestId);
  }
  return response(200, { meeting: result.Item });
}

async function updateMeeting(userId: string, meetingId: string, body: any, requestId: string) {
  const existing = await ddb.send(
    new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  if (!existing.Item || existing.Item.userId !== userId) {
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Meeting not found', requestId);
  }

  const updates: Record<string, any> = {};
  const names: Record<string, string> = {};
  const values: Record<string, any> = {};
  let expr = 'SET ';
  const parts: string[] = [];

  if (body.topic !== undefined) {
    names['#topic'] = 'topic';
    values[':topic'] = body.topic;
    parts.push('#topic = :topic');
  }
  if (body.discussion !== undefined) {
    names['#discussion'] = 'discussion';
    values[':discussion'] = body.discussion;
    parts.push('#discussion = :discussion');
  }
  if (body.nextSteps !== undefined) {
    values[':nextSteps'] = body.nextSteps;
    parts.push('nextSteps = :nextSteps');
  }
  if (body.participants !== undefined) {
    values[':participants'] = body.participants;
    parts.push('participants = :participants');
  }

  values[':updatedAt'] = new Date().toISOString();
  parts.push('updatedAt = :updatedAt');

  await ddb.send(
    new UpdateCommand({
      TableName: MEETINGS_TABLE,
      Key: { meetingId },
      UpdateExpression: expr + parts.join(', '),
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })
  );

  const updated = await ddb.send(
    new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  return response(200, { meeting: updated.Item });
}

async function deleteMeeting(userId: string, meetingId: string, requestId: string) {
  const existing = await ddb.send(
    new GetCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  if (!existing.Item || existing.Item.userId !== userId) {
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Meeting not found', requestId);
  }
  await ddb.send(
    new DeleteCommand({ TableName: MEETINGS_TABLE, Key: { meetingId } })
  );
  return response(200, { message: 'Meeting deleted successfully' });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId || 'unknown';
  if (event.httpMethod === 'OPTIONS') return response(200, {});

  const auth = requireAuth(event);
  if ('statusCode' in auth) return auth;
  const { userId } = auth;

  const method = event.httpMethod;
  const meetingId = event.pathParameters?.proxy || event.pathParameters?.meetingId;

  try {
    if (method === 'POST' && !meetingId) {
      const body = JSON.parse(event.body || '{}');
      return await createMeeting(userId, body, requestId);
    }
    if (method === 'GET' && !meetingId) {
      return await listMeetings(userId, requestId);
    }
    if (method === 'GET' && meetingId) {
      return await getMeeting(userId, meetingId, requestId);
    }
    if (method === 'PUT' && meetingId) {
      const body = JSON.parse(event.body || '{}');
      return await updateMeeting(userId, meetingId, body, requestId);
    }
    if (method === 'DELETE' && meetingId) {
      return await deleteMeeting(userId, meetingId, requestId);
    }
    return errorResponse(404, ERROR_CODES.NOT_FOUND, 'Route not found', requestId);
  } catch (err: any) {
    console.error('Unhandled error:', err);
    return errorResponse(500, ERROR_CODES.INTERNAL_ERROR, 'Internal server error', requestId);
  }
}
