/**
 * Integration Tests: End-to-End Flow
 * ทดสอบ flow ทั้งหมด: register → login → create meeting → summarize → send email
 * ด้วย mock AWS services (Cognito, DynamoDB, Bedrock, SES)
 *
 * Validates: Requirements 2.5, 4.8, 5.4
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ============================================================
// In-memory stores for mock AWS services
// ============================================================
const cognitoUsers: Map<string, { password: string; name: string; verified: boolean; sub: string }> = new Map();
const dynamoStore: Map<string, any> = new Map();
const sentEmails: Array<{ to: string; subject: string; body: string }> = [];
let bedrockShouldFail = false;
let sesShouldFail = false;
let sesFailEmails: Set<string> = new Set();

// ============================================================
// Mock Cognito
// ============================================================
const mockCognitoSend = jest.fn(async (cmd: any) => {
  if (cmd._type === 'SignUp') {
    const { Username, Password, UserAttributes } = cmd.input;
    if (cognitoUsers.has(Username)) {
      throw new Error('User already exists');
    }
    const name = UserAttributes?.find((a: any) => a.Name === 'name')?.Value || '';
    const sub = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cognitoUsers.set(Username, { password: Password, name, verified: false, sub });
    return { UserSub: sub };
  }
  if (cmd._type === 'ConfirmSignUp') {
    const { Username, ConfirmationCode } = cmd.input;
    const user = cognitoUsers.get(Username);
    if (!user) throw new Error('User not found');
    if (ConfirmationCode !== '123456') throw new Error('Invalid verification code');
    user.verified = true;
    return {};
  }
  if (cmd._type === 'InitiateAuth') {
    const { AuthFlow, AuthParameters } = cmd.input;
    if (AuthFlow === 'USER_PASSWORD_AUTH') {
      const user = cognitoUsers.get(AuthParameters.USERNAME);
      if (!user || user.password !== AuthParameters.PASSWORD) {
        const err = new Error('Incorrect username or password');
        (err as any).name = 'NotAuthorizedException';
        throw err;
      }
      return {
        AuthenticationResult: {
          AccessToken: `access-${user.sub}`,
          RefreshToken: `refresh-${user.sub}`,
          ExpiresIn: 3600,
        },
      };
    }
    if (AuthFlow === 'REFRESH_TOKEN_AUTH') {
      return {
        AuthenticationResult: {
          AccessToken: `refreshed-access-token`,
          ExpiresIn: 3600,
        },
      };
    }
  }
  throw new Error('Unknown command');
});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: mockCognitoSend })),
  SignUpCommand: jest.fn((input: any) => ({ input, _type: 'SignUp' })),
  ConfirmSignUpCommand: jest.fn((input: any) => ({ input, _type: 'ConfirmSignUp' })),
  InitiateAuthCommand: jest.fn((input: any) => ({ input, _type: 'InitiateAuth' })),
}));

// ============================================================
// Mock DynamoDB (in-memory)
// ============================================================
const mockDdbSend = jest.fn(async (cmd: any) => {
  const input = cmd.i || cmd.input || cmd;

  // PutCommand
  if (cmd._type === 'Put') {
    const item = input.Item;
    dynamoStore.set(item.meetingId, { ...item });
    return {};
  }
  // GetCommand
  if (cmd._type === 'Get') {
    const key = input.Key.meetingId;
    const item = dynamoStore.get(key);
    return { Item: item || undefined };
  }
  // QueryCommand
  if (cmd._type === 'Query') {
    const userId = input.ExpressionAttributeValues[':uid'];
    const items = Array.from(dynamoStore.values())
      .filter((item: any) => item.userId === userId)
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
    return { Items: items, Count: items.length };
  }
  // UpdateCommand
  if (cmd._type === 'Update') {
    const key = input.Key.meetingId;
    const item = dynamoStore.get(key);
    if (!item) return {};
    // Parse SET expression to apply updates
    const expr = input.UpdateExpression || '';
    const values = input.ExpressionAttributeValues || {};
    const names = input.ExpressionAttributeNames || {};
    const setPart = expr.replace(/^SET\s+/, '');
    const assignments = setPart.split(',').map((s: string) => s.trim());
    for (const assignment of assignments) {
      const [lhs, rhs] = assignment.split('=').map((s: string) => s.trim());
      const fieldName = names[lhs] || lhs;
      const value = values[rhs];
      if (value !== undefined) {
        item[fieldName] = value;
      }
    }
    dynamoStore.set(key, item);
    return { Attributes: item };
  }
  // DeleteCommand
  if (cmd._type === 'Delete') {
    const key = input.Key.meetingId;
    dynamoStore.delete(key);
    return {};
  }
  return {};
});

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDdbSend })) },
  PutCommand: jest.fn((i: any) => ({ i, _type: 'Put', input: i })),
  GetCommand: jest.fn((i: any) => ({ i, _type: 'Get', input: i })),
  UpdateCommand: jest.fn((i: any) => ({ i, _type: 'Update', input: i })),
  DeleteCommand: jest.fn((i: any) => ({ i, _type: 'Delete', input: i })),
  QueryCommand: jest.fn((i: any) => ({ i, _type: 'Query', input: i })),
}));

// ============================================================
// Mock Bedrock
// ============================================================
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({
    send: jest.fn(async () => {
      if (bedrockShouldFail) {
        throw new Error('Bedrock service unavailable');
      }
      return {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: 'สรุป: การประชุมเรื่อง Sprint Planning ได้ข้อสรุปเรื่อง backlog items' }],
          })
        ),
      };
    }),
  })),
  InvokeModelCommand: jest.fn((i: any) => i),
}));

// ============================================================
// Mock SES
// ============================================================
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({
    send: jest.fn(async (cmd: any) => {
      if (sesShouldFail) {
        throw new Error('SES service unavailable');
      }
      const toEmail = cmd.Destination?.ToAddresses?.[0];
      if (sesFailEmails.has(toEmail)) {
        throw new Error(`Failed to send to ${toEmail}`);
      }
      sentEmails.push({
        to: toEmail,
        subject: cmd.Message?.Subject?.Data || '',
        body: cmd.Message?.Body?.Text?.Data || '',
      });
      return { MessageId: `msg-${Date.now()}` };
    }),
  })),
  SendEmailCommand: jest.fn((i: any) => i),
}));

// Mock uuid
jest.mock('uuid', () => ({ v4: () => `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }));

// ============================================================
// Import handlers after mocks
// ============================================================
import { handler as authHandler } from '../../services/auth/src/handler';
import { handler as meetingHandler } from '../../services/meeting/src/handler';
import { handler as aiHandler } from '../../services/ai/src/handler';
import { handler as emailHandler } from '../../services/email/src/handler';

// ============================================================
// Helpers
// ============================================================
function makeEvent(overrides: Partial<APIGatewayProxyEvent> & { path: string; httpMethod: string }): APIGatewayProxyEvent {
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
      accountId: '',
      apiId: '',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: overrides.httpMethod,
      identity: {
        accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
        caller: null, clientCert: null, cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null, cognitoIdentityId: null,
        cognitoIdentityPoolId: null, principalOrgId: null,
        sourceIp: '127.0.0.1', user: null, userAgent: null, userArn: null,
      },
      path: overrides.path,
      stage: 'dev',
      requestId: 'integration-test-req',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '',
    },
    ...overrides,
  } as APIGatewayProxyEvent;
}

function authEvent(path: string, method: string, body?: any): APIGatewayProxyEvent {
  return makeEvent({
    path: `/auth${path}`,
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
  });
}

function authenticatedEvent(
  userId: string,
  path: string,
  method: string,
  body?: any,
  pathParams?: Record<string, string>
): APIGatewayProxyEvent {
  const event = makeEvent({
    path,
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    pathParameters: pathParams || null,
  });
  // Override requestContext to include authorizer claims
  (event.requestContext as any).authorizer = { claims: { sub: userId } };
  return event;
}

const parse = (r: { body: string }) => JSON.parse(r.body);

// ============================================================
// Reset state between tests
// ============================================================
beforeEach(() => {
  cognitoUsers.clear();
  dynamoStore.clear();
  sentEmails.length = 0;
  bedrockShouldFail = false;
  sesShouldFail = false;
  sesFailEmails.clear();
});

// ============================================================
// Happy Path: Full E2E Flow
// Validates: Requirements 2.5, 4.8, 5.4
// ============================================================
describe('E2E Happy Path: register → login → create meeting → summarize → send email', () => {
  it('should complete the full flow successfully', async () => {
    // Step 1: Register
    const registerResult = await authHandler(
      authEvent('/register', 'POST', {
        email: 'user@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
      })
    );
    expect(registerResult.statusCode).toBe(201);
    const { userId } = parse(registerResult);
    expect(userId).toBeDefined();

    // Step 2: Verify email
    const verifyResult = await authHandler(
      authEvent('/verify-email', 'POST', {
        email: 'user@example.com',
        code: '123456',
      })
    );
    expect(verifyResult.statusCode).toBe(200);

    // Step 3: Login
    const loginResult = await authHandler(
      authEvent('/login', 'POST', {
        email: 'user@example.com',
        password: 'SecurePass123!',
      })
    );
    expect(loginResult.statusCode).toBe(200);
    const { accessToken } = parse(loginResult);
    expect(accessToken).toBeDefined();

    // Step 4: Create meeting
    const meetingData = {
      topic: 'Sprint Planning Q1',
      discussion: 'หารือเรื่อง backlog items สำหรับ sprint ถัดไป',
      nextSteps: 'Assign tasks ให้ทีม',
      participants: [
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
      ],
    };
    const createResult = await meetingHandler(
      authenticatedEvent(userId, '/meetings', 'POST', meetingData)
    );
    expect(createResult.statusCode).toBe(201);
    const { meetingId, meeting } = parse(createResult);
    expect(meetingId).toBeDefined();
    expect(meeting.topic).toBe(meetingData.topic);
    expect(meeting.participants).toHaveLength(2);

    // Step 5: Summarize with AI
    const summarizeResult = await aiHandler(
      authenticatedEvent(userId, `/meetings/${meetingId}/summarize`, 'POST', {})
    );
    expect(summarizeResult.statusCode).toBe(200);
    const { summary, modelUsed } = parse(summarizeResult);
    expect(summary).toContain('สรุป');
    expect(modelUsed).toBe('anthropic.claude-opus-4-0-20250514');

    // Step 5b: Save the summary to the meeting record
    const saveSummaryResult = await aiHandler(
      authenticatedEvent(userId, `/meetings/${meetingId}/summary`, 'PUT', { summary })
    );
    expect(saveSummaryResult.statusCode).toBe(200);

    // Step 6: Send email to participants
    const sendEmailResult = await emailHandler(
      authenticatedEvent(userId, `/meetings/${meetingId}/send-email`, 'POST', {})
    );
    expect(sendEmailResult.statusCode).toBe(200);
    const emailResponse = parse(sendEmailResult);
    expect(emailResponse.sent).toEqual(['alice@example.com', 'bob@example.com']);
    expect(emailResponse.failed).toEqual([]);

    // Verify emails were actually sent
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[0].to).toBe('alice@example.com');
    expect(sentEmails[1].to).toBe('bob@example.com');
    // Verify email content includes meeting topic
    expect(sentEmails[0].body).toContain('Sprint Planning Q1');
  });
});

// ============================================================
// Error Handling: Cross-Service Failures
// Validates: Requirements 2.5, 4.8, 5.4
// ============================================================
describe('Error handling across services', () => {
  // Helper: set up a user and meeting for error tests
  async function setupUserAndMeeting() {
    // Register + verify + login
    cognitoUsers.set('user@test.com', {
      password: 'Pass123!',
      name: 'Tester',
      verified: true,
      sub: 'test-user-id',
    });
    const userId = 'test-user-id';

    // Create meeting directly in DynamoDB store
    const meetingId = 'test-meeting-001';
    dynamoStore.set(meetingId, {
      meetingId,
      userId,
      topic: 'Error Test Meeting',
      discussion: 'Testing error scenarios',
      nextSteps: 'Fix bugs',
      participants: [
        { name: 'Alice', email: 'alice@test.com' },
        { name: 'Bob', email: 'bob@test.com' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return { userId, meetingId };
  }

  it('should return 401 when accessing meeting service without auth', async () => {
    const result = await meetingHandler(
      makeEvent({ path: '/meetings', httpMethod: 'GET' })
    );
    expect(result.statusCode).toBe(401);
    expect(parse(result).error).toBe('UNAUTHORIZED');
  });

  it('should return 502 when AI service fails during summarization (Req 4.8)', async () => {
    const { userId, meetingId } = await setupUserAndMeeting();
    bedrockShouldFail = true;

    const result = await aiHandler(
      authenticatedEvent(userId, `/meetings/${meetingId}/summarize`, 'POST', {})
    );
    expect(result.statusCode).toBe(502);
    expect(parse(result).error).toBe('AI_SERVICE_ERROR');
    expect(parse(result).message).toContain('try again');
  });

  it('should return 400 when sending email without summary first', async () => {
    const { userId, meetingId } = await setupUserAndMeeting();

    const result = await emailHandler(
      authenticatedEvent(userId, `/meetings/${meetingId}/send-email`, 'POST', {})
    );
    expect(result.statusCode).toBe(400);
    expect(parse(result).message).toContain('summary');
  });

  it('should handle partial email failure (Req 5.4)', async () => {
    const { userId, meetingId } = await setupUserAndMeeting();

    // Add summary to the meeting
    dynamoStore.get(meetingId).summary = 'Test summary for email';

    // Make Bob's email fail
    sesFailEmails.add('bob@test.com');

    const result = await emailHandler(
      authenticatedEvent(userId, `/meetings/${meetingId}/send-email`, 'POST', {})
    );
    expect(result.statusCode).toBe(207);
    const body = parse(result);
    expect(body.sent).toEqual(['alice@test.com']);
    expect(body.failed).toEqual(['bob@test.com']);
  });

  it('should return 502 when all emails fail', async () => {
    const { userId, meetingId } = await setupUserAndMeeting();
    dynamoStore.get(meetingId).summary = 'Test summary';

    // Make all emails fail
    sesFailEmails.add('alice@test.com');
    sesFailEmails.add('bob@test.com');

    const result = await emailHandler(
      authenticatedEvent(userId, `/meetings/${meetingId}/send-email`, 'POST', {})
    );
    expect(result.statusCode).toBe(502);
    expect(parse(result).error).toBe('EMAIL_SERVICE_ERROR');
  });

  it('should return 400 for invalid meeting data (Req 2.5)', async () => {
    const userId = 'test-user-id';

    // Missing required fields
    const result = await meetingHandler(
      authenticatedEvent(userId, '/meetings', 'POST', {
        topic: '',
        discussion: '',
      })
    );
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toBe('VALIDATION_ERROR');
  });

  it('should return 404 when summarizing a non-existent meeting', async () => {
    const userId = 'test-user-id';

    const result = await aiHandler(
      authenticatedEvent(userId, '/meetings/non-existent-id/summarize', 'POST', {})
    );
    expect(result.statusCode).toBe(404);
    expect(parse(result).error).toBe('NOT_FOUND');
  });

  it('should return 401 when login with wrong password', async () => {
    // Register first
    await authHandler(
      authEvent('/register', 'POST', {
        email: 'wrong@test.com',
        password: 'CorrectPass1!',
        name: 'Wrong',
      })
    );

    const result = await authHandler(
      authEvent('/login', 'POST', {
        email: 'wrong@test.com',
        password: 'WrongPassword1!',
      })
    );
    expect(result.statusCode).toBe(401);
    expect(parse(result).error).toBe('UNAUTHORIZED');
  });
});
