import * as fc from 'fast-check';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { MeetingRecord } from '../../shared/src/types';

// In-memory DynamoDB store
let store: Record<string, MeetingRecord> = {};

// Mock uuid to generate deterministic IDs
jest.mock('uuid', () => ({
  v4: () => `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
}));

// Mock DynamoDB SDK with in-memory store
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: () => ({
        send: jest.fn().mockImplementation((command: any) => {
          const cmdName = command.constructor.name;

          if (cmdName === 'PutCommand') {
            const item = command.input.Item;
            store[item.meetingId] = { ...item };
            return Promise.resolve({});
          }

          if (cmdName === 'GetCommand') {
            const key = command.input.Key.meetingId;
            const item = store[key];
            return Promise.resolve({ Item: item ? { ...item } : undefined });
          }

          if (cmdName === 'DeleteCommand') {
            const key = command.input.Key.meetingId;
            delete store[key];
            return Promise.resolve({});
          }

          if (cmdName === 'QueryCommand') {
            const userId = command.input.ExpressionAttributeValues[':uid'];
            const scanForward = command.input.ScanIndexForward;
            const items = Object.values(store)
              .filter((item) => item.userId === userId)
              .sort((a, b) => {
                const cmp = a.createdAt.localeCompare(b.createdAt);
                return scanForward === false ? -cmp : cmp;
              });
            return Promise.resolve({ Items: items, Count: items.length });
          }

          if (cmdName === 'UpdateCommand') {
            return Promise.resolve({ Attributes: {} });
          }

          return Promise.resolve({});
        }),
      }),
    },
    PutCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'PutCommand' } })),
    GetCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'GetCommand' } })),
    DeleteCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'DeleteCommand' } })),
    QueryCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'QueryCommand' } })),
    UpdateCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'UpdateCommand' } })),
  };
});

import { handler } from '../../services/meeting/src/handler';

// Helper: create a minimal APIGatewayProxyEvent with authenticated user
function makeEvent(overrides: Partial<APIGatewayProxyEvent> & { userId?: string } = {}): APIGatewayProxyEvent {
  const { userId = 'test-user-123', ...rest } = overrides;
  return {
    body: null,
    headers: { Authorization: 'Bearer mock-token' },
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/meetings',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '',
      apiId: '',
      authorizer: { claims: { sub: userId } },
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {
        accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
        caller: null, clientCert: null, cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null, cognitoIdentityId: null,
        cognitoIdentityPoolId: null, principalOrgId: null,
        sourceIp: '127.0.0.1', user: null, userAgent: null, userArn: null,
      },
      path: '/meetings',
      stage: 'dev',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '',
    },
    ...rest,
  } as APIGatewayProxyEvent;
}

// --- Generators ---

const alphanumChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''));
const alphaChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''));

// Valid email generator
const validEmailArb = fc.tuple(
  fc.array(alphanumChar, { minLength: 1, maxLength: 10 }).map((a) => a.join('')),
  fc.array(alphanumChar, { minLength: 1, maxLength: 10 }).map((a) => a.join('')),
  fc.array(alphaChar, { minLength: 2, maxLength: 5 }).map((a) => a.join(''))
).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Valid participant generator
const validParticipantArb = fc.tuple(
  fc.array(alphaChar, { minLength: 1, maxLength: 20 }).map((a) => a.join('')),
  validEmailArb
).map(([name, email]) => ({ name, email }));

// Valid meeting input generator (constrained to valid inputs)
const validMeetingInputArb = fc.record({
  topic: fc.array(alphanumChar, { minLength: 1, maxLength: 50 }).map((a) => a.join('')),
  discussion: fc.array(alphanumChar, { minLength: 1, maxLength: 100 }).map((a) => a.join('')),
  nextSteps: fc.array(alphanumChar, { minLength: 0, maxLength: 50 }).map((a) => a.join('')),
  participants: fc.array(validParticipantArb, { minLength: 1, maxLength: 5 }),
});

// Clear store before each test
beforeEach(() => {
  store = {};
});

/**
 * Feature: meeting-minutes-ai, Property 2: การบันทึกรายงานการประชุมที่ถูกต้อง
 *
 * For any ข้อมูลการประชุมที่มี topic ไม่ว่าง, discussion ไม่ว่าง,
 * และ participants ที่มีอีเมลถูกต้อง การบันทึกจะต้องสำเร็จและส่งกลับ
 * Meeting_Record ที่มีข้อมูลตรงกับที่ส่งเข้ามา
 *
 * **Validates: Requirements 2.1**
 */
describe('Property 2: การบันทึกรายงานการประชุมที่ถูกต้อง', () => {
  it('should successfully save valid meeting data and return matching record', async () => {
    // **Validates: Requirements 2.1**
    await fc.assert(
      fc.asyncProperty(validMeetingInputArb, async (input) => {
        store = {}; // reset per iteration

        const event = makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify(input),
        });

        const result = await handler(event);
        const body = JSON.parse(result.body);

        // Must succeed with 201
        if (result.statusCode !== 201) return false;

        // Must return a meetingId
        if (!body.meetingId || typeof body.meetingId !== 'string') return false;

        // Returned meeting must match input data
        const meeting = body.meeting as MeetingRecord;
        if (meeting.topic !== input.topic) return false;
        if (meeting.discussion !== input.discussion) return false;
        if (meeting.nextSteps !== (input.nextSteps || '')) return false;
        if (meeting.participants.length !== input.participants.length) return false;

        // Each participant must match
        for (let i = 0; i < input.participants.length; i++) {
          if (meeting.participants[i].name !== input.participants[i].name) return false;
          if (meeting.participants[i].email !== input.participants[i].email) return false;
        }

        // Must have timestamps
        if (!meeting.createdAt || !meeting.updatedAt) return false;

        // Must have userId
        if (meeting.userId !== 'test-user-123') return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: meeting-minutes-ai, Property 5: รายการประชุมเรียงตามวันที่ล่าสุด
 *
 * For any ชุดของ Meeting_Record ที่เป็นของผู้ใช้คนเดียวกัน
 * เมื่อเรียกดูรายการ ผลลัพธ์จะต้องเรียงตาม createdAt จากล่าสุดไปเก่าสุด
 *
 * **Validates: Requirements 3.1**
 */
describe('Property 5: รายการประชุมเรียงตามวันที่ล่าสุด', () => {
  it('should return meetings sorted by createdAt descending', async () => {
    // **Validates: Requirements 3.1**
    await fc.assert(
      fc.asyncProperty(
        fc.array(validMeetingInputArb, { minLength: 2, maxLength: 8 }),
        async (inputs) => {
          store = {}; // reset per iteration

          // Create multiple meetings
          for (const input of inputs) {
            const event = makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify(input),
            });
            await handler(event);
            // Small delay to ensure distinct timestamps
            await new Promise((r) => setTimeout(r, 2));
          }

          // List meetings
          const listEvent = makeEvent({ httpMethod: 'GET' });
          const result = await handler(listEvent);
          const body = JSON.parse(result.body);

          if (result.statusCode !== 200) return false;
          if (body.meetings.length !== inputs.length) return false;

          // Verify descending order by createdAt
          for (let i = 1; i < body.meetings.length; i++) {
            const prev = body.meetings[i - 1].createdAt;
            const curr = body.meetings[i].createdAt;
            if (prev < curr) return false; // prev should be >= curr (descending)
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: meeting-minutes-ai, Property 6: การลบรายงานแล้วค้นหาไม่พบ
 *
 * For any Meeting_Record ที่มีอยู่ในระบบ หลังจากลบแล้ว
 * การเรียกดูด้วย meetingId เดิมจะต้องส่งกลับ HTTP 404 Not Found
 *
 * **Validates: Requirements 3.4**
 */
describe('Property 6: การลบรายงานแล้วค้นหาไม่พบ', () => {
  it('should return 404 when getting a deleted meeting', async () => {
    // **Validates: Requirements 3.4**
    await fc.assert(
      fc.asyncProperty(validMeetingInputArb, async (input) => {
        store = {}; // reset per iteration

        // Create a meeting
        const createEvent = makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify(input),
        });
        const createResult = await handler(createEvent);
        const createBody = JSON.parse(createResult.body);

        if (createResult.statusCode !== 201) return false;
        const meetingId = createBody.meetingId;

        // Verify it exists first
        const getEvent = makeEvent({
          httpMethod: 'GET',
          pathParameters: { meetingId },
        });
        const getResult = await handler(getEvent);
        if (getResult.statusCode !== 200) return false;

        // Delete the meeting
        const deleteEvent = makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { meetingId },
        });
        const deleteResult = await handler(deleteEvent);
        if (deleteResult.statusCode !== 200) return false;

        // Try to get the deleted meeting - must be 404
        const getAfterDeleteEvent = makeEvent({
          httpMethod: 'GET',
          pathParameters: { meetingId },
        });
        const getAfterDeleteResult = await handler(getAfterDeleteEvent);

        return getAfterDeleteResult.statusCode === 404;
      }),
      { numRuns: 100 }
    );
  });
});
