import * as fc from 'fast-check';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { MeetingRecord, Participant } from '../../shared/src/types';
import { formatEmailBody } from '../../services/email/src/handler';

// Track which emails SES was asked to send to, and which should fail
let sesFailSet: Set<string> = new Set();

// Mock SES SDK - simulate partial failures based on sesFailSet
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockImplementation((command: any) => {
      const toEmail = command.input.Destination.ToAddresses[0];
      if (sesFailSet.has(toEmail)) {
        return Promise.reject(new Error(`Simulated SES failure for ${toEmail}`));
      }
      return Promise.resolve({ MessageId: `msg-${Date.now()}` });
    }),
  })),
  SendEmailCommand: jest.fn().mockImplementation((input: any) => ({ input })),
}));

// In-memory DynamoDB store
let store: Record<string, any> = {};

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

          if (cmdName === 'GetCommand') {
            const key = command.input.Key.meetingId;
            const item = store[key];
            return Promise.resolve({ Item: item ? { ...item } : undefined });
          }

          if (cmdName === 'UpdateCommand') {
            const key = command.input.Key.meetingId;
            if (store[key]) {
              const values = command.input.ExpressionAttributeValues;
              if (values[':status']) {
                store[key] = {
                  ...store[key],
                  emailStatus: values[':status'],
                  updatedAt: values[':now'],
                };
              }
            }
            return Promise.resolve({});
          }

          return Promise.resolve({});
        }),
      }),
    },
    GetCommand: jest.fn().mockImplementation((input: any) => ({
      input,
      constructor: { name: 'GetCommand' },
    })),
    UpdateCommand: jest.fn().mockImplementation((input: any) => ({
      input,
      constructor: { name: 'UpdateCommand' },
    })),
  };
});

// Set SENDER_EMAIL env before importing handler
process.env.SENDER_EMAIL = 'noreply@meeting-minutes.test';

import { handler } from '../../services/email/src/handler';

// Override setTimeout to resolve instantly (avoid retry delays in sendToParticipant)
const originalSetTimeout = global.setTimeout;
beforeAll(() => {
  (global as any).setTimeout = (fn: (...args: any[]) => void, _ms?: number, ...args: any[]) => {
    return originalSetTimeout(fn, 0, ...args);
  };
});
afterAll(() => {
  global.setTimeout = originalSetTimeout;
});

// --- Helpers ---

function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> & { userId?: string } = {}
): APIGatewayProxyEvent {
  const { userId = 'test-user-123', ...rest } = overrides;
  return {
    body: null,
    headers: { Authorization: 'Bearer mock-token' },
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/meetings/test/send-email',
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
      httpMethod: 'POST',
      identity: {
        accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
        caller: null, clientCert: null, cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null, cognitoIdentityId: null,
        cognitoIdentityPoolId: null, principalOrgId: null,
        sourceIp: '127.0.0.1', user: null, userAgent: null, userArn: null,
      },
      path: '/meetings/test/send-email',
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

// Valid participant generator with unique emails
const validParticipantArb = fc.tuple(
  fc.array(alphaChar, { minLength: 1, maxLength: 20 }).map((a) => a.join('')),
  validEmailArb
).map(([name, email]) => ({ name, email }));

// Non-empty text generator (for topic, summary, nextSteps, discussion)
const nonEmptyTextArb = fc
  .array(alphanumChar, { minLength: 1, maxLength: 80 })
  .map((a) => a.join(''));

// Generate a list of unique participants (1-8)
const uniqueParticipantsArb = fc
  .array(validParticipantArb, { minLength: 1, maxLength: 8 })
  .map((participants) => {
    // Deduplicate by email
    const seen = new Set<string>();
    return participants.filter((p) => {
      if (seen.has(p.email)) return false;
      seen.add(p.email);
      return true;
    });
  })
  .filter((arr) => arr.length >= 1);

// Generate a subset of indices to mark as "should fail" in SES
const failSubsetArb = (n: number) =>
  fc.array(fc.boolean(), { minLength: n, maxLength: n });

// Seed a meeting in the in-memory store
function seedMeeting(
  meetingId: string,
  participants: Participant[],
  overrides: Partial<MeetingRecord> = {}
): MeetingRecord {
  const meeting: MeetingRecord = {
    meetingId,
    userId: 'test-user-123',
    topic: 'Default Topic',
    discussion: 'Default discussion',
    nextSteps: 'Default next steps',
    participants,
    summary: 'Default AI summary',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  store[meetingId] = meeting;
  return meeting;
}

// Clear state before each test
beforeEach(() => {
  store = {};
  sesFailSet = new Set();
});

/**
 * Feature: meeting-minutes-ai, Property 9: การส่งอีเมลไปยังผู้เข้าร่วมทุกคน
 *
 * For any Meeting_Record ที่มี participants N คน เมื่อส่งอีเมล
 * จำนวนรวมของ sent + failed จะต้องเท่ากับ N
 * (ทุกคนต้องถูกพยายามส่ง)
 *
 * **Validates: Requirements 5.1**
 */
describe('Property 9: การส่งอีเมลไปยังผู้เข้าร่วมทุกคน', () => {
  it('sent + failed count must equal the number of participants', async () => {
    // **Validates: Requirements 5.1**
    await fc.assert(
      fc.asyncProperty(
        uniqueParticipantsArb,
        async (participants) => {
          store = {};
          sesFailSet = new Set();

          const meetingId = `meeting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          seedMeeting(meetingId, participants);

          // Randomly decide which participants should fail
          const failFlags = participants.map(() => Math.random() < 0.3);
          for (let i = 0; i < participants.length; i++) {
            if (failFlags[i]) {
              sesFailSet.add(participants[i].email);
            }
          }

          const event = makeEvent({
            httpMethod: 'POST',
            path: `/meetings/${meetingId}/send-email`,
            body: JSON.stringify({}),
          });

          const result = await handler(event);
          const body = JSON.parse(result.body);

          let sentCount: number;
          let failedCount: number;

          if (result.statusCode === 502) {
            // All emails failed - handler returns ErrorResponse without sent/failed arrays
            // Verify via the saved emailStatus in the store
            const savedMeeting = store[meetingId];
            sentCount = savedMeeting?.emailStatus?.sent?.length ?? 0;
            failedCount = savedMeeting?.emailStatus?.failed?.length ?? 0;
          } else {
            sentCount = body.sent ? body.sent.length : 0;
            failedCount = body.failed ? body.failed.length : 0;
          }

          // Core property: sent + failed must equal total participants
          return sentCount + failedCount === participants.length;
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});

/**
 * Feature: meeting-minutes-ai, Property 10: รูปแบบอีเมลมีข้อมูลครบถ้วน
 *
 * For any Meeting_Record ที่มี topic, summary, participants, และ nextSteps
 * เมื่อจัดรูปแบบอีเมล เนื้อหาอีเมลจะต้องมีหัวข้อการประชุม สรุปจาก AI
 * รายชื่อผู้เข้าร่วม และ Next step ครบทุกส่วน
 *
 * **Validates: Requirements 5.2**
 */
describe('Property 10: รูปแบบอีเมลมีข้อมูลครบถ้วน', () => {
  it('formatted email body must contain topic, summary, all participant names, and nextSteps', async () => {
    // **Validates: Requirements 5.2**
    await fc.assert(
      fc.property(
        nonEmptyTextArb,
        nonEmptyTextArb,
        uniqueParticipantsArb,
        nonEmptyTextArb,
        nonEmptyTextArb,
        (topic, discussion, participants, summary, nextSteps) => {
          const meeting: MeetingRecord = {
            meetingId: 'test-meeting',
            userId: 'test-user',
            topic,
            discussion,
            nextSteps,
            participants,
            summary,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const body = formatEmailBody(meeting);

          // Must contain the topic
          if (!body.includes(topic)) return false;

          // Must contain the AI summary
          if (!body.includes(summary)) return false;

          // Must contain every participant's name and email
          for (const p of participants) {
            if (!body.includes(p.name)) return false;
            if (!body.includes(p.email)) return false;
          }

          // Must contain the nextSteps
          if (!body.includes(nextSteps)) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
