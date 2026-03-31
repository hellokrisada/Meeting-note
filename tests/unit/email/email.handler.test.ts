import { APIGatewayProxyEvent } from 'aws-lambda';
import { ERROR_CODES } from '../../../shared/src/constants';

// Mock SES SDK
const mockSesSend = jest.fn();
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn((input: any) => ({ input, _type: 'SendEmail' })),
}));

// Mock DynamoDB SDK
const mockDdbSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn(() => ({})) }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDdbSend })) },
  GetCommand: jest.fn((i: any) => ({ i, _type: 'Get' })),
  UpdateCommand: jest.fn((i: any) => ({ i, _type: 'Update' })),
}));

// Set env before importing handler
process.env.SENDER_EMAIL = 'noreply@meeting-minutes.example.com';

import { handler } from '../../../services/email/src/handler';

const USER_ID = 'user-abc-123';

const MEETING_WITH_SUMMARY = {
  meetingId: 'meeting-1',
  userId: USER_ID,
  topic: 'Sprint Planning',
  discussion: 'Discussed backlog items',
  nextSteps: 'Assign tasks',
  participants: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
  ],
  summary: 'สรุป: Sprint Planning ดำเนินไปด้วยดี',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const MEETING_NO_SUMMARY = {
  ...MEETING_WITH_SUMMARY,
  summary: undefined,
};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> & { path: string; httpMethod: string; userId?: string }): APIGatewayProxyEvent {
  const { userId, ...rest } = overrides;
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '', apiId: '',
      authorizer: userId ? { claims: { sub: userId } } : null,
      protocol: 'HTTP/1.1', httpMethod: overrides.httpMethod,
      identity: {
        accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
        caller: null, clientCert: null, cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null, cognitoIdentityId: null,
        cognitoIdentityPoolId: null, principalOrgId: null,
        sourceIp: '127.0.0.1', user: null, userAgent: null, userArn: null,
      },
      path: overrides.path, stage: 'dev', requestId: 'test-req-id',
      requestTimeEpoch: Date.now(), resourceId: '', resourcePath: '',
    },
    ...rest,
  } as APIGatewayProxyEvent;
}

function parseBody(result: { body: string }) {
  return JSON.parse(result.body);
}

beforeEach(() => {
  mockSesSend.mockReset();
  mockDdbSend.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ============================================================
// POST /meetings/:meetingId/send-email - Send email to all participants
// Validates: Requirements 5.1, 5.3
// ============================================================
describe('POST /meetings/:meetingId/send-email', () => {
  it('should send email to all participants successfully', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: MEETING_WITH_SUMMARY }) // GetCommand
      .mockResolvedValueOnce({});                             // UpdateCommand (save status)
    mockSesSend.mockResolvedValue({});

    const resultPromise = handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    await jest.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.sent).toEqual(['alice@example.com', 'bob@example.com']);
    expect(body.failed).toEqual([]);
    expect(mockSesSend).toHaveBeenCalledTimes(2);
  });

  it('should send email to specific participants when participantEmails provided', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: MEETING_WITH_SUMMARY })
      .mockResolvedValueOnce({});
    mockSesSend.mockResolvedValue({});

    const resultPromise = handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({ participantEmails: ['alice@example.com'] }),
    }));

    await jest.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.sent).toEqual(['alice@example.com']);
    expect(body.failed).toEqual([]);
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  it('should return 404 when meeting not found', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent({
      path: '/meetings/nonexistent/send-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(404);
    expect(parseBody(result).error).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('should return 404 when meeting belongs to another user', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: { ...MEETING_WITH_SUMMARY, userId: 'other-user' },
    });

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(404);
    expect(parseBody(result).error).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('should return 400 when meeting has no summary', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: MEETING_NO_SUMMARY });

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(parseBody(result).message).toContain('no summary');
  });

  it('should return 401 when not authenticated', async () => {
    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'POST',
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(401);
    expect(parseBody(result).error).toBe(ERROR_CODES.UNAUTHORIZED);
  });
});


// ============================================================
// Partial failure - some emails fail
// Validates: Requirements 5.4
// ============================================================
describe('Partial email failure', () => {
  it('should return 207 when some emails fail', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: MEETING_WITH_SUMMARY })
      .mockResolvedValueOnce({});
    // Alice succeeds, Bob fails on all retries
    mockSesSend
      .mockResolvedValueOnce({})                                    // Alice OK
      .mockRejectedValueOnce(new Error('SES throttle'))             // Bob retry 1
      .mockRejectedValueOnce(new Error('SES throttle'));            // Bob retry 2

    const resultPromise = handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    // Advance past retry delays (exponential backoff: 1s)
    await jest.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    expect(result.statusCode).toBe(207);
    const body = parseBody(result);
    expect(body.sent).toEqual(['alice@example.com']);
    expect(body.failed).toEqual(['bob@example.com']);
  });

  it('should return 502 when all emails fail', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: MEETING_WITH_SUMMARY })
      .mockResolvedValueOnce({});
    mockSesSend.mockRejectedValue(new Error('SES down'));

    const resultPromise = handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    await jest.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;

    expect(result.statusCode).toBe(502);
    const body = parseBody(result);
    expect(body.error).toBe(ERROR_CODES.EMAIL_SERVICE_ERROR);
  });
});

// ============================================================
// POST /meetings/:meetingId/resend-email - Resend to specific participants
// Validates: Requirements 5.4
// ============================================================
describe('POST /meetings/:meetingId/resend-email', () => {
  it('should resend email to specified participants', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: MEETING_WITH_SUMMARY })
      .mockResolvedValueOnce({});
    mockSesSend.mockResolvedValue({});

    const resultPromise = handler(makeEvent({
      path: '/meetings/meeting-1/resend-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({ participantEmails: ['bob@example.com'] }),
    }));

    await jest.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.sent).toEqual(['bob@example.com']);
    expect(body.failed).toEqual([]);
  });

  it('should handle resend partial failure', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: MEETING_WITH_SUMMARY })
      .mockResolvedValueOnce({});
    mockSesSend
      .mockResolvedValueOnce({})                          // alice OK
      .mockRejectedValueOnce(new Error('SES error'))      // bob retry 1
      .mockRejectedValueOnce(new Error('SES error'));     // bob retry 2

    const resultPromise = handler(makeEvent({
      path: '/meetings/meeting-1/resend-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({ participantEmails: ['alice@example.com', 'bob@example.com'] }),
    }));

    await jest.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    expect(result.statusCode).toBe(207);
    const body = parseBody(result);
    expect(body.sent).toEqual(['alice@example.com']);
    expect(body.failed).toEqual(['bob@example.com']);
  });
});

// ============================================================
// Routing and edge cases
// ============================================================
describe('Email handler routing', () => {
  it('should return 200 for OPTIONS (CORS preflight)', async () => {
    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'OPTIONS',
    }));

    expect(result.statusCode).toBe(200);
  });

  it('should return 404 for unknown routes', async () => {
    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/unknown-action',
      httpMethod: 'POST',
      userId: USER_ID,
    }));

    expect(result.statusCode).toBe(404);
    expect(parseBody(result).error).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('should include CORS headers in responses', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/send-email',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});
