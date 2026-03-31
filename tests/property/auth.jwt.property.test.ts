import * as fc from 'fast-check';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { requireAuth, extractUserId } from '../../services/auth/src/middleware';
import { ERROR_CODES } from '../../shared/src/constants';

/**
 * Feature: meeting-minutes-ai, Property 1: คำขอที่ไม่มี JWT token ถูกปฏิเสธเสมอ
 *
 * For any API request ที่ไม่มี JWT token หรือมี token ที่ไม่ถูกต้อง
 * ระบบจะต้องส่งกลับ HTTP 401 Unauthorized เสมอ
 *
 * **Validates: Requirements 1.5**
 */

// Helper: create a minimal APIGatewayProxyEvent
function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
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
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path: '/meetings',
      stage: 'dev',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '',
    },
    ...overrides,
  } as APIGatewayProxyEvent;
}

// Helper to check if result is a 401 response
function is401Response(result: any): boolean {
  if (!result || typeof result !== 'object') return false;
  if (result.statusCode !== 401) return false;
  const body = JSON.parse(result.body);
  return body.statusCode === 401 && body.error === ERROR_CODES.UNAUTHORIZED;
}

describe('Property 1: คำขอที่ไม่มี JWT token ถูกปฏิเสธเสมอ', () => {
  // Generator: arbitrary HTTP methods
  const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH');

  // Generator: arbitrary API paths
  const pathArb = fc.constantFrom(
    '/meetings',
    '/meetings/123',
    '/meetings/abc-def/summarize',
    '/meetings/xyz/send-email',
    '/ai/models'
  );

  // Generator: arbitrary request IDs
  const requestIdArb = fc.oneof(
    fc.uuid(),
    fc.string({ minLength: 1, maxLength: 30 }),
    fc.constant('unknown')
  );

  it('should return 401 when authorizer is null (no token provided)', () => {
    // **Validates: Requirements 1.5**
    fc.assert(
      fc.property(
        httpMethodArb,
        pathArb,
        requestIdArb,
        (method, path, requestId) => {
          const event = makeEvent({
            httpMethod: method,
            path,
            requestContext: {
              ...makeEvent().requestContext,
              authorizer: null,
              requestId,
            },
          });

          const result = requireAuth(event);
          return is401Response(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 401 when authorizer is undefined', () => {
    // **Validates: Requirements 1.5**
    fc.assert(
      fc.property(
        httpMethodArb,
        pathArb,
        requestIdArb,
        (method, path, requestId) => {
          const event = makeEvent({
            httpMethod: method,
            path,
          });
          // Force authorizer to undefined
          (event.requestContext as any).authorizer = undefined;
          event.requestContext.requestId = requestId;

          const result = requireAuth(event);
          return is401Response(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 401 when authorizer has no claims', () => {
    // **Validates: Requirements 1.5**
    fc.assert(
      fc.property(
        httpMethodArb,
        pathArb,
        requestIdArb,
        (method, path, requestId) => {
          const event = makeEvent({
            httpMethod: method,
            path,
            requestContext: {
              ...makeEvent().requestContext,
              authorizer: {},
              requestId,
            },
          });

          const result = requireAuth(event);
          return is401Response(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 401 when claims exist but sub is missing', () => {
    // **Validates: Requirements 1.5**
    // Generator: arbitrary claims objects without a valid 'sub' field
    const claimsWithoutSubArb = fc.record({
      email: fc.emailAddress(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      iss: fc.string({ minLength: 1, maxLength: 50 }),
    });

    fc.assert(
      fc.property(
        httpMethodArb,
        pathArb,
        requestIdArb,
        claimsWithoutSubArb,
        (method, path, requestId, claims) => {
          const event = makeEvent({
            httpMethod: method,
            path,
            requestContext: {
              ...makeEvent().requestContext,
              authorizer: { claims },
              requestId,
            },
          });

          const result = requireAuth(event);
          return is401Response(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 401 when claims.sub is empty string', () => {
    // **Validates: Requirements 1.5**
    fc.assert(
      fc.property(
        httpMethodArb,
        pathArb,
        requestIdArb,
        (method, path, requestId) => {
          const event = makeEvent({
            httpMethod: method,
            path,
            requestContext: {
              ...makeEvent().requestContext,
              authorizer: { claims: { sub: '' } },
              requestId,
            },
          });

          const result = requireAuth(event);
          // Empty string is falsy, so should be rejected
          return is401Response(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null from extractUserId when no valid token/claims present', () => {
    // **Validates: Requirements 1.5**
    // Generator: various invalid authorizer shapes
    const invalidAuthorizerArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant({}),
      fc.constant({ claims: null }),
      fc.constant({ claims: undefined }),
      fc.constant({ claims: {} }),
      fc.constant({ claims: { sub: '' } }),
      fc.constant({ claims: { sub: null } }),
      fc.constant({ claims: { sub: undefined } })
    );

    fc.assert(
      fc.property(
        httpMethodArb,
        pathArb,
        invalidAuthorizerArb,
        (method, path, authorizer) => {
          const event = makeEvent({
            httpMethod: method,
            path,
          });
          (event.requestContext as any).authorizer = authorizer;

          const userId = extractUserId(event);
          return userId === null;
        }
      ),
      { numRuns: 100 }
    );
  });
});
