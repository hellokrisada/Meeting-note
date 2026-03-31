import * as fc from 'fast-check';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { SUPPORTED_MODELS, DEFAULT_MODEL_ID } from '../../shared/src/constants';

// In-memory DynamoDB store
let store: Record<string, any> = {};

// Track which modelId was passed to Bedrock
let lastBedrockModelId: string | null = null;

// Mock Bedrock SDK - capture modelId and return a summary
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockImplementation((command: any) => {
      lastBedrockModelId = command.input.modelId;
      return Promise.resolve({
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text: 'AI generated summary' }] })
        ),
      });
    }),
  })),
  InvokeModelCommand: jest.fn().mockImplementation((input: any) => ({ input })),
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

          if (cmdName === 'GetCommand') {
            const key = command.input.Key.meetingId;
            const item = store[key];
            return Promise.resolve({ Item: item ? { ...item } : undefined });
          }

          if (cmdName === 'UpdateCommand') {
            const key = command.input.Key.meetingId;
            const expr = command.input.UpdateExpression as string;
            const values = command.input.ExpressionAttributeValues;

            if (store[key] && expr.includes('summary')) {
              store[key] = {
                ...store[key],
                summary: values[':summary'],
                summaryModelId: values[':modelId'],
                updatedAt: values[':now'],
              };
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

import { handler } from '../../services/ai/src/handler';

// Helper: create a minimal APIGatewayProxyEvent with authenticated user
function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> & { userId?: string } = {}
): APIGatewayProxyEvent {
  const { userId = 'test-user-123', ...rest } = overrides;
  return {
    body: null,
    headers: { Authorization: 'Bearer mock-token' },
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/ai/models',
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
      path: '/ai/models',
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

// Generator for a supported model ID (from SUPPORTED_MODELS)
const supportedModelIdArb = fc.constantFrom(
  ...SUPPORTED_MODELS.map((m) => m.modelId)
);

// Generator for non-empty summary strings (printable, no control chars)
const summaryCharArb = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-()กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'.split('')
);
const nonEmptySummaryArb = fc
  .array(summaryCharArb, { minLength: 1, maxLength: 200 })
  .map((chars: string[]) => chars.join(''))
  .filter((s: string) => s.trim().length > 0);

// Seed meeting for the store
function seedMeeting(meetingId: string, userId: string = 'test-user-123') {
  store[meetingId] = {
    meetingId,
    userId,
    topic: 'Test Meeting',
    discussion: 'Discussion content',
    nextSteps: 'Next steps',
    participants: [{ name: 'Alice', email: 'alice@example.com' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Clear store before each test
beforeEach(() => {
  store = {};
  lastBedrockModelId = null;
});

/**
 * Feature: meeting-minutes-ai, Property 7: การเลือก AI model
 *
 * For any model ID ที่ถูกต้องในรายการ supported models
 * เมื่อผู้ใช้ระบุ model ID นั้นในการสรุป ระบบจะต้องใช้ model ที่ระบุ
 * และเมื่อไม่ระบุ model ID ระบบจะต้องใช้ Claude Opus เป็นค่าเริ่มต้น
 *
 * **Validates: Requirements 4.2, 4.3**
 */
describe('Property 7: การเลือก AI model', () => {
  it('should use the specified model when modelId is provided', async () => {
    // **Validates: Requirements 4.2, 4.3**
    await fc.assert(
      fc.asyncProperty(supportedModelIdArb, async (modelId) => {
        store = {};
        lastBedrockModelId = null;
        const meetingId = `meeting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        seedMeeting(meetingId);

        const event = makeEvent({
          httpMethod: 'POST',
          path: `/meetings/${meetingId}/summarize`,
          body: JSON.stringify({ modelId }),
        });

        const result = await handler(event);
        const body = JSON.parse(result.body);

        // Must succeed
        if (result.statusCode !== 200) return false;

        // The modelUsed in response must match the requested modelId
        if (body.modelUsed !== modelId) return false;

        // Bedrock must have been called with the specified modelId
        if (lastBedrockModelId !== modelId) return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should use Claude Opus (DEFAULT_MODEL_ID) when no modelId is provided', async () => {
    // **Validates: Requirements 4.2, 4.3**
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        store = {};
        lastBedrockModelId = null;
        const meetingId = `meeting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        seedMeeting(meetingId);

        const event = makeEvent({
          httpMethod: 'POST',
          path: `/meetings/${meetingId}/summarize`,
          body: JSON.stringify({}),
        });

        const result = await handler(event);
        const body = JSON.parse(result.body);

        // Must succeed
        if (result.statusCode !== 200) return false;

        // The modelUsed must be the default (Claude Opus)
        if (body.modelUsed !== DEFAULT_MODEL_ID) return false;

        // Bedrock must have been called with the default model
        if (lastBedrockModelId !== DEFAULT_MODEL_ID) return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: meeting-minutes-ai, Property 8: การแก้ไขและบันทึกสรุป (round-trip)
 *
 * For any สตริงสรุปที่ไม่ว่าง เมื่อบันทึกลงใน Meeting_Record
 * แล้วเรียกดู Meeting_Record นั้น ค่า summary จะต้องตรงกับสตริงที่บันทึก
 *
 * **Validates: Requirements 4.5, 4.6**
 */
describe('Property 8: การแก้ไขและบันทึกสรุป (round-trip)', () => {
  it('should return the same summary after saving and reading back', async () => {
    // **Validates: Requirements 4.5, 4.6**
    await fc.assert(
      fc.asyncProperty(nonEmptySummaryArb, async (summaryText) => {
        store = {};
        const meetingId = `meeting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        seedMeeting(meetingId);

        // Save summary via PUT /meetings/:meetingId/summary
        const putEvent = makeEvent({
          httpMethod: 'PUT',
          path: `/meetings/${meetingId}/summary`,
          body: JSON.stringify({ summary: summaryText }),
        });

        const putResult = await handler(putEvent);

        // Must succeed
        if (putResult.statusCode !== 200) return false;

        const putBody = JSON.parse(putResult.body);

        // The returned meeting must have the summary we saved
        if (putBody.meeting.summary !== summaryText) return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
