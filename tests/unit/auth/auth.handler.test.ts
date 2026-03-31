import { APIGatewayProxyEvent } from 'aws-lambda';
import { ERROR_CODES } from '../../../shared/src/constants';

// Mock Cognito SDK before importing handler
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  return {
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
    SignUpCommand: jest.fn((input: any) => ({ input, _type: 'SignUp' })),
    ConfirmSignUpCommand: jest.fn((input: any) => ({ input, _type: 'ConfirmSignUp' })),
    InitiateAuthCommand: jest.fn((input: any) => ({ input, _type: 'InitiateAuth' })),
  };
});

import { handler } from '../../../services/auth/src/handler';

// Helper: build a minimal APIGatewayProxyEvent
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
      requestId: 'test-req-id',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '',
    },
    ...overrides,
  } as APIGatewayProxyEvent;
}

function parseBody(result: { body: string }) {
  return JSON.parse(result.body);
}

beforeEach(() => {
  mockSend.mockReset();
});

// ============================================================
// Register endpoint tests
// Validates: Requirements 1.1
// ============================================================
describe('POST /auth/register', () => {
  it('should register a new user successfully', async () => {
    mockSend.mockResolvedValueOnce({ UserSub: 'user-123-abc' });

    const result = await handler(makeEvent({
      path: '/auth/register',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'Pass1234!', name: 'Test User' }),
    }));

    expect(result.statusCode).toBe(201);
    const body = parseBody(result);
    expect(body.userId).toBe('user-123-abc');
    expect(body.message).toContain('verify');
  });

  it('should return 400 when email is missing', async () => {
    const result = await handler(makeEvent({
      path: '/auth/register',
      httpMethod: 'POST',
      body: JSON.stringify({ password: 'Pass1234!', name: 'Test' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 400 when password is missing', async () => {
    const result = await handler(makeEvent({
      path: '/auth/register',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com', name: 'Test' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 400 when name is missing', async () => {
    const result = await handler(makeEvent({
      path: '/auth/register',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'Pass1234!' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 400 when Cognito throws an error (e.g. duplicate email)', async () => {
    mockSend.mockRejectedValueOnce(new Error('User already exists'));

    const result = await handler(makeEvent({
      path: '/auth/register',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'dup@example.com', password: 'Pass1234!', name: 'Dup' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).message).toBe('User already exists');
  });
});

// ============================================================
// Login endpoint tests
// Validates: Requirements 1.3, 1.4
// ============================================================
describe('POST /auth/login', () => {
  it('should login successfully and return tokens', async () => {
    mockSend.mockResolvedValueOnce({
      AuthenticationResult: {
        AccessToken: 'access-token-xyz',
        RefreshToken: 'refresh-token-xyz',
        ExpiresIn: 3600,
      },
    });

    const result = await handler(makeEvent({
      path: '/auth/login',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'Pass1234!' }),
    }));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.accessToken).toBe('access-token-xyz');
    expect(body.refreshToken).toBe('refresh-token-xyz');
    expect(body.expiresIn).toBe(3600);
  });

  it('should return 400 when email is missing', async () => {
    const result = await handler(makeEvent({
      path: '/auth/login',
      httpMethod: 'POST',
      body: JSON.stringify({ password: 'Pass1234!' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 400 when password is missing', async () => {
    const result = await handler(makeEvent({
      path: '/auth/login',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 401 for invalid credentials (NotAuthorizedException)', async () => {
    const err = new Error('Incorrect username or password');
    (err as any).name = 'NotAuthorizedException';
    mockSend.mockRejectedValueOnce(err);

    const result = await handler(makeEvent({
      path: '/auth/login',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
    }));

    expect(result.statusCode).toBe(401);
    expect(parseBody(result).error).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(parseBody(result).message).toBe('Invalid credentials');
  });

  it('should return 400 for other Cognito errors during login', async () => {
    mockSend.mockRejectedValueOnce(new Error('UserNotConfirmedException'));

    const result = await handler(makeEvent({
      path: '/auth/login',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'Pass1234!' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });
});

// ============================================================
// Verify-email endpoint tests
// Validates: Requirements 1.2
// ============================================================
describe('POST /auth/verify-email', () => {
  it('should verify email successfully', async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent({
      path: '/auth/verify-email',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
    }));

    expect(result.statusCode).toBe(200);
    expect(parseBody(result).message).toContain('verified');
  });

  it('should return 400 when email is missing', async () => {
    const result = await handler(makeEvent({
      path: '/auth/verify-email',
      httpMethod: 'POST',
      body: JSON.stringify({ code: '123456' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 400 when code is missing', async () => {
    const result = await handler(makeEvent({
      path: '/auth/verify-email',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 400 for expired or invalid verification code', async () => {
    mockSend.mockRejectedValueOnce(new Error('Invalid verification code'));

    const result = await handler(makeEvent({
      path: '/auth/verify-email',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'test@example.com', code: 'wrong' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).message).toBe('Invalid verification code');
  });
});

// ============================================================
// Refresh-token endpoint tests
// Validates: Requirements 1.3
// ============================================================
describe('POST /auth/refresh-token', () => {
  it('should refresh token successfully', async () => {
    mockSend.mockResolvedValueOnce({
      AuthenticationResult: {
        AccessToken: 'new-access-token',
        ExpiresIn: 3600,
      },
    });

    const result = await handler(makeEvent({
      path: '/auth/refresh-token',
      httpMethod: 'POST',
      body: JSON.stringify({ refreshToken: 'valid-refresh-token' }),
    }));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.accessToken).toBe('new-access-token');
    expect(body.expiresIn).toBe(3600);
  });

  it('should return 400 when refreshToken is missing', async () => {
    const result = await handler(makeEvent({
      path: '/auth/refresh-token',
      httpMethod: 'POST',
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should return 401 for expired refresh token', async () => {
    mockSend.mockRejectedValueOnce(new Error('Refresh token has expired'));

    const result = await handler(makeEvent({
      path: '/auth/refresh-token',
      httpMethod: 'POST',
      body: JSON.stringify({ refreshToken: 'expired-token' }),
    }));

    expect(result.statusCode).toBe(401);
    expect(parseBody(result).error).toBe(ERROR_CODES.TOKEN_EXPIRED);
  });
});

// ============================================================
// Routing and edge case tests
// ============================================================
describe('Auth handler routing', () => {
  it('should return 404 for unknown routes', async () => {
    const result = await handler(makeEvent({
      path: '/auth/unknown',
      httpMethod: 'POST',
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(404);
    expect(parseBody(result).error).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('should return 200 for OPTIONS (CORS preflight)', async () => {
    const result = await handler(makeEvent({
      path: '/auth/login',
      httpMethod: 'OPTIONS',
    }));

    expect(result.statusCode).toBe(200);
  });

  it('should include CORS headers in responses', async () => {
    mockSend.mockResolvedValueOnce({ UserSub: 'u1' });

    const result = await handler(makeEvent({
      path: '/auth/register',
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'a@b.com', password: 'Pass1234!', name: 'A' }),
    }));

    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});
