import { APIGatewayProxyEvent } from 'aws-lambda';
import { ERROR_CODES } from '../../../shared/src/constants';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn(() => ({})) }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  PutCommand: jest.fn((i: any) => ({ i })),
  GetCommand: jest.fn((i: any) => ({ i })),
  UpdateCommand: jest.fn((i: any) => ({ i })),
  DeleteCommand: jest.fn((i: any) => ({ i })),
  QueryCommand: jest.fn((i: any) => ({ i })),
}));
jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));

import { handler } from '../../../services/meeting/src/handler';

const UID = 'user-abc-123';

function ev(o: any): APIGatewayProxyEvent {
  const { userId, meetingId, ...rest } = o;
  return {
    body: null, headers: {}, multiValueHeaders: {}, isBase64Encoded: false,
    pathParameters: meetingId ? { meetingId, proxy: meetingId } : null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '', path: '/meetings',
    requestContext: {
      accountId: '', apiId: '',
      authorizer: userId ? { claims: { sub: userId } } : null,
      protocol: 'HTTP/1.1', httpMethod: o.httpMethod,
      identity: {
        accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
        caller: null, clientCert: null, cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null, cognitoIdentityId: null,
        cognitoIdentityPoolId: null, principalOrgId: null,
        sourceIp: '127.0.0.1', user: null, userAgent: null, userArn: null,
      },
      path: '/meetings', stage: 'dev', requestId: 'req-1',
      requestTimeEpoch: Date.now(), resourceId: '', resourcePath: '',
    },
    ...rest,
  } as APIGatewayProxyEvent;
}

const pb = (r: any) => JSON.parse(r.body);
beforeEach(() => mockSend.mockReset());

const VB = {
  topic: 'Sprint Planning',
  discussion: 'Discussed backlog items',
  nextSteps: 'Assign tasks',
  participants: [{ name: 'Alice', email: 'alice@example.com' }],
};

// Auth tests
describe('Auth', () => {
  it('returns 401 without auth claims', async () => {
    const r = await handler(ev({ httpMethod: 'GET' }));
    expect(r.statusCode).toBe(401);
    expect(pb(r).error).toBe(ERROR_CODES.UNAUTHORIZED);
  });
  it('returns 200 for OPTIONS', async () => {
    const r = await handler(ev({ httpMethod: 'OPTIONS' }));
    expect(r.statusCode).toBe(200);
  });
});

// POST /meetings - Validates: Requirements 2.1, 2.4
describe('POST /meetings', () => {
  it('creates meeting successfully', async () => {
    mockSend.mockResolvedValueOnce({});
    const r = await handler(ev({ httpMethod: 'POST', userId: UID, body: JSON.stringify(VB) }));
    expect(r.statusCode).toBe(201);
    expect(pb(r).meetingId).toBe('mock-uuid-1234');
    expect(pb(r).meeting.topic).toBe(VB.topic);
    expect(pb(r).meeting.userId).toBe(UID);
  });
  it('returns 400 for empty topic', async () => {
    const r = await handler(ev({ httpMethod: 'POST', userId: UID, body: JSON.stringify({ ...VB, topic: '' }) }));
    expect(r.statusCode).toBe(400);
    expect(pb(r).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });
  it('returns 400 for whitespace discussion', async () => {
    const r = await handler(ev({ httpMethod: 'POST', userId: UID, body: JSON.stringify({ ...VB, discussion: '   ' }) }));
    expect(r.statusCode).toBe(400);
    expect(pb(r).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });
  it('returns 400 for invalid participant email', async () => {
    const r = await handler(ev({ httpMethod: 'POST', userId: UID, body: JSON.stringify({ ...VB, participants: [{ name: 'B', email: 'bad' }] }) }));
    expect(r.statusCode).toBe(400);
    expect(pb(r).error).toBe(ERROR_CODES.VALIDATION_ERROR);
  });
  it('creates meeting without optional fields', async () => {
    mockSend.mockResolvedValueOnce({});
    const r = await handler(ev({ httpMethod: 'POST', userId: UID, body: JSON.stringify({ topic: 'Sync', discussion: 'Update' }) }));
    expect(r.statusCode).toBe(201);
    expect(pb(r).meeting.nextSteps).toBe('');
    expect(pb(r).meeting.participants).toEqual([]);
  });
  it('returns 500 on DynamoDB PutCommand failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('DB err'));
    const r = await handler(ev({ httpMethod: 'POST', userId: UID, body: JSON.stringify(VB) }));
    expect(r.statusCode).toBe(500);
    expect(pb(r).error).toBe(ERROR_CODES.INTERNAL_ERROR);
  });
});

// GET /meetings - Validates: Requirements 3.1
describe('GET /meetings', () => {
  it('lists meetings for user', async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ meetingId: 'm1' }, { meetingId: 'm2' }], Count: 2 });
    const r = await handler(ev({ httpMethod: 'GET', userId: UID }));
    expect(r.statusCode).toBe(200);
    expect(pb(r).meetings).toHaveLength(2);
    expect(pb(r).count).toBe(2);
  });
  it('returns empty list when no meetings', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], Count: 0 });
    const r = await handler(ev({ httpMethod: 'GET', userId: UID }));
    expect(r.statusCode).toBe(200);
    expect(pb(r).meetings).toEqual([]);
    expect(pb(r).count).toBe(0);
  });
  it('returns 500 on DynamoDB QueryCommand failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('DB err'));
    const r = await handler(ev({ httpMethod: 'GET', userId: UID }));
    expect(r.statusCode).toBe(500);
    expect(pb(r).error).toBe(ERROR_CODES.INTERNAL_ERROR);
  });
});

// GET /meetings/:meetingId - Validates: Requirements 3.2
describe('GET /meetings/:meetingId', () => {
  it('returns meeting by ID', async () => {
    mockSend.mockResolvedValueOnce({ Item: { meetingId: 'm1', userId: UID, topic: 'Review' } });
    const r = await handler(ev({ httpMethod: 'GET', userId: UID, meetingId: 'm1' }));
    expect(r.statusCode).toBe(200);
    expect(pb(r).meeting.topic).toBe('Review');
  });
  it('returns 404 when meeting not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const r = await handler(ev({ httpMethod: 'GET', userId: UID, meetingId: 'nope' }));
    expect(r.statusCode).toBe(404);
    expect(pb(r).error).toBe(ERROR_CODES.NOT_FOUND);
  });
  it('returns 404 when meeting belongs to another user', async () => {
    mockSend.mockResolvedValueOnce({ Item: { meetingId: 'm1', userId: 'other' } });
    const r = await handler(ev({ httpMethod: 'GET', userId: UID, meetingId: 'm1' }));
    expect(r.statusCode).toBe(404);
    expect(pb(r).error).toBe(ERROR_CODES.NOT_FOUND);
  });
  it('returns 500 on DynamoDB GetCommand failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('DB err'));
    const r = await handler(ev({ httpMethod: 'GET', userId: UID, meetingId: 'm1' }));
    expect(r.statusCode).toBe(500);
    expect(pb(r).error).toBe(ERROR_CODES.INTERNAL_ERROR);
  });
});

// PUT /meetings/:meetingId - Validates: Requirements 3.3
describe('PUT /meetings/:meetingId', () => {
  const existing = { meetingId: 'm1', userId: UID, topic: 'Old' };
  it('updates meeting successfully', async () => {
    const updated = { ...existing, topic: 'New', updatedAt: '2024-01-02T00:00:00Z' };
    mockSend.mockResolvedValueOnce({ Item: existing }).mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: updated });
    const r = await handler(ev({ httpMethod: 'PUT', userId: UID, meetingId: 'm1', body: JSON.stringify({ topic: 'New' }) }));
    expect(r.statusCode).toBe(200);
    expect(pb(r).meeting.topic).toBe('New');
  });
  it('returns 404 when meeting not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const r = await handler(ev({ httpMethod: 'PUT', userId: UID, meetingId: 'nope', body: JSON.stringify({ topic: 'X' }) }));
    expect(r.statusCode).toBe(404);
    expect(pb(r).error).toBe(ERROR_CODES.NOT_FOUND);
  });
  it('returns 404 when meeting belongs to another user', async () => {
    mockSend.mockResolvedValueOnce({ Item: { meetingId: 'm1', userId: 'other' } });
    const r = await handler(ev({ httpMethod: 'PUT', userId: UID, meetingId: 'm1', body: JSON.stringify({ topic: 'X' }) }));
    expect(r.statusCode).toBe(404);
    expect(pb(r).error).toBe(ERROR_CODES.NOT_FOUND);
  });
  it('returns 500 on DynamoDB failure during update', async () => {
    mockSend.mockResolvedValueOnce({ Item: existing }).mockRejectedValueOnce(new Error('DB err'));
    const r = await handler(ev({ httpMethod: 'PUT', userId: UID, meetingId: 'm1', body: JSON.stringify({ topic: 'X' }) }));
    expect(r.statusCode).toBe(500);
    expect(pb(r).error).toBe(ERROR_CODES.INTERNAL_ERROR);
  });
});

// DELETE /meetings/:meetingId - Validates: Requirements 3.4
describe('DELETE /meetings/:meetingId', () => {
  const existing = { meetingId: 'm1', userId: UID };
  it('deletes meeting successfully', async () => {
    mockSend.mockResolvedValueOnce({ Item: existing }).mockResolvedValueOnce({});
    const r = await handler(ev({ httpMethod: 'DELETE', userId: UID, meetingId: 'm1' }));
    expect(r.statusCode).toBe(200);
    expect(pb(r).message).toContain('deleted');
  });
  it('returns 404 when meeting not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const r = await handler(ev({ httpMethod: 'DELETE', userId: UID, meetingId: 'nope' }));
    expect(r.statusCode).toBe(404);
    expect(pb(r).error).toBe(ERROR_CODES.NOT_FOUND);
  });
  it('returns 404 when meeting belongs to another user', async () => {
    mockSend.mockResolvedValueOnce({ Item: { meetingId: 'm1', userId: 'other' } });
    const r = await handler(ev({ httpMethod: 'DELETE', userId: UID, meetingId: 'm1' }));
    expect(r.statusCode).toBe(404);
    expect(pb(r).error).toBe(ERROR_CODES.NOT_FOUND);
  });
  it('returns 500 on DynamoDB failure during delete', async () => {
    mockSend.mockResolvedValueOnce({ Item: existing }).mockRejectedValueOnce(new Error('DB err'));
    const r = await handler(ev({ httpMethod: 'DELETE', userId: UID, meetingId: 'm1' }));
    expect(r.statusCode).toBe(500);
    expect(pb(r).error).toBe(ERROR_CODES.INTERNAL_ERROR);
  });
});

// Routing edge cases
describe('Routing', () => {
  it('returns 404 for unsupported method', async () => {
    const r = await handler(ev({ httpMethod: 'PATCH', userId: UID, meetingId: 'm1' }));
    expect(r.statusCode).toBe(404);
    expect(pb(r).error).toBe(ERROR_CODES.NOT_FOUND);
  });
  it('includes CORS headers', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], Count: 0 });
    const r = await handler(ev({ httpMethod: 'GET', userId: UID }));
    expect(r.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(r.headers?.['Content-Type']).toBe('application/json');
  });
});
