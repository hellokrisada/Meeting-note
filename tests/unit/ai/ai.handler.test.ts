import { APIGatewayProxyEvent } from 'aws-lambda';
import { ERROR_CODES, DEFAULT_MODEL_ID, SUPPORTED_MODELS } from '../../../shared/src/constants';

// Mock Bedrock SDK
const mockBedrockSend = jest.fn();
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockBedrockSend })),
  InvokeModelCommand: jest.fn((input: any) => ({ input, _type: 'InvokeModel' })),
}));

// Mock DynamoDB SDK
const mockDdbSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn(() => ({})) }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDdbSend })) },
  GetCommand: jest.fn((i: any) => ({ i, _type: 'Get' })),
  UpdateCommand: jest.fn((i: any) => ({ i, _type: 'Update' })),
}));

import { handler } from '../../../services/ai/src/handler';

const USER_ID = 'user-abc-123';

const MEETING_ITEM = {
  meetingId: 'meeting-1',
  userId: USER_ID,
  topic: 'Sprint Planning',
  discussion: 'Discussed backlog items and priorities',
  nextSteps: 'Assign tasks to team members',
  participants: [{ name: 'Alice', email: 'alice@example.com' }],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
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

function bedrockResponse(text: string) {
  return {
    body: new TextEncoder().encode(JSON.stringify({
      content: [{ text }],
    })),
  };
}

beforeEach(() => {
  mockBedrockSend.mockReset();
  mockDdbSend.mockReset();
});

// ============================================================
// GET /ai/models - List models
// Validates: Requirements 4.2
// ============================================================
describe('GET /ai/models', () => {
  it('should return supported models and default model', async () => {
    const result = await handler(makeEvent({
      path: '/ai/models',
      httpMethod: 'GET',
    }));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.models).toEqual(SUPPORTED_MODELS);
    expect(body.defaultModel).toBe(DEFAULT_MODEL_ID);
  });

  it('should not require authentication', async () => {
    // No userId in event - should still work
    const result = await handler(makeEvent({
      path: '/ai/models',
      httpMethod: 'GET',
    }));

    expect(result.statusCode).toBe(200);
  });
});

// ============================================================
// POST /meetings/:meetingId/summarize
// Validates: Requirements 4.1, 4.2, 4.8
// ============================================================
describe('POST /meetings/:meetingId/summarize', () => {
  it('should summarize meeting with default model when no modelId provided', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: MEETING_ITEM });
    mockBedrockSend.mockResolvedValueOnce(bedrockResponse('สรุป: Sprint Planning ดำเนินไปด้วยดี'));

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summarize',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.summary).toBe('สรุป: Sprint Planning ดำเนินไปด้วยดี');
    expect(body.modelUsed).toBe(DEFAULT_MODEL_ID);
  });

  it('should use specified modelId when provided', async () => {
    const selectedModel = 'anthropic.claude-sonnet-4-20250514';
    mockDdbSend.mockResolvedValueOnce({ Item: MEETING_ITEM });
    mockBedrockSend.mockResolvedValueOnce(bedrockResponse('Summary from Sonnet'));

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summarize',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({ modelId: selectedModel }),
    }));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.summary).toBe('Summary from Sonnet');
    expect(body.modelUsed).toBe(selectedModel);
  });

  it('should return 400 for unsupported model ID', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: MEETING_ITEM });

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summarize',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({ modelId: 'invalid.model-id' }),
    }));

    expect(result.statusCode).toBe(400);
    const body = parseBody(result);
    expect(body.error).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(body.message).toContain('invalid.model-id');
  });

  it('should return 404 when meeting not found', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent({
      path: '/meetings/nonexistent/summarize',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(404);
    expect(parseBody(result).error).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('should return 404 when meeting belongs to another user', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: { ...MEETING_ITEM, userId: 'other-user' },
    });

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summarize',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(404);
    expect(parseBody(result).error).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('should return 502 when Bedrock fails', async () => {
    jest.useFakeTimers();
    mockDdbSend.mockResolvedValueOnce({ Item: MEETING_ITEM });
    mockBedrockSend.mockRejectedValue(new Error('Bedrock service unavailable'));

    const resultPromise = handler(makeEvent({
      path: '/meetings/meeting-1/summarize',
      httpMethod: 'POST',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    // Advance timers past retry delays (1s + 2s + 4s)
    await jest.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;

    expect(result.statusCode).toBe(502);
    const body = parseBody(result);
    expect(body.error).toBe(ERROR_CODES.AI_SERVICE_ERROR);
    expect(body.message).toContain('try again');
    jest.useRealTimers();
  });

  it('should return 401 when not authenticated', async () => {
    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summarize',
      httpMethod: 'POST',
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(401);
    expect(parseBody(result).error).toBe(ERROR_CODES.UNAUTHORIZED);
  });
});

// ============================================================
// PUT /meetings/:meetingId/summary - Update summary
// Validates: Requirements 4.5, 4.6
// ============================================================
describe('PUT /meetings/:meetingId/summary', () => {
  it('should update summary successfully', async () => {
    const updatedItem = { ...MEETING_ITEM, summary: 'Updated summary', summaryModelId: 'manual' };
    mockDdbSend
      .mockResolvedValueOnce({ Item: MEETING_ITEM })   // GetCommand (ownership check)
      .mockResolvedValueOnce({})                         // UpdateCommand
      .mockResolvedValueOnce({ Item: updatedItem });     // GetCommand (return updated)

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summary',
      httpMethod: 'PUT',
      userId: USER_ID,
      body: JSON.stringify({ summary: 'Updated summary' }),
    }));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.meeting.summary).toBe('Updated summary');
  });

  it('should return 400 when summary is missing', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: MEETING_ITEM });

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summary',
      httpMethod: 'PUT',
      userId: USER_ID,
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 404 when meeting not found', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summary',
      httpMethod: 'PUT',
      userId: USER_ID,
      body: JSON.stringify({ summary: 'test' }),
    }));

    expect(result.statusCode).toBe(404);
    expect(parseBody(result).error).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('should return 401 when not authenticated', async () => {
    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summary',
      httpMethod: 'PUT',
      body: JSON.stringify({ summary: 'test' }),
    }));

    expect(result.statusCode).toBe(401);
  });
});

// ============================================================
// Routing and edge cases
// ============================================================
describe('AI handler routing', () => {
  it('should return 200 for OPTIONS (CORS preflight)', async () => {
    const result = await handler(makeEvent({
      path: '/meetings/meeting-1/summarize',
      httpMethod: 'OPTIONS',
    }));

    expect(result.statusCode).toBe(200);
  });

  it('should return 404 for unknown routes', async () => {
    const result = await handler(makeEvent({
      path: '/ai/unknown',
      httpMethod: 'GET',
      userId: USER_ID,
    }));

    expect(result.statusCode).toBe(404);
    expect(parseBody(result).error).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('should include CORS headers in responses', async () => {
    const result = await handler(makeEvent({
      path: '/ai/models',
      httpMethod: 'GET',
    }));

    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});
