import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse } from '../../../shared/src/types';
import { ERROR_CODES } from '../../../shared/src/constants';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

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

function errorResponse(
  statusCode: number,
  error: string,
  message: string,
  requestId: string
): APIGatewayProxyResult {
  const body: ErrorResponse = { statusCode, error, message, requestId };
  return response(statusCode, body);
}

async function register(body: any, requestId: string) {
  const { email, password, name } = body;
  if (!email || !password || !name) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'email, password, name are required', requestId);
  }
  try {
    const result = await cognito.send(
      new SignUpCommand({
        ClientId: USER_POOL_CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'name', Value: name },
        ],
      })
    );
    return response(201, { message: 'Registration successful. Please verify your email.', userId: result.UserSub });
  } catch (err: any) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, err.message || 'Registration failed', requestId);
  }
}

async function verifyEmail(body: any, requestId: string) {
  const { email, code } = body;
  if (!email || !code) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'email and code are required', requestId);
  }
  try {
    await cognito.send(
      new ConfirmSignUpCommand({
        ClientId: USER_POOL_CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      })
    );
    return response(200, { message: 'Email verified successfully' });
  } catch (err: any) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, err.message || 'Verification failed', requestId);
  }
}

async function login(body: any, requestId: string) {
  const { email, password } = body;
  if (!email || !password) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'email and password are required', requestId);
  }
  try {
    const result = await cognito.send(
      new InitiateAuthCommand({
        ClientId: USER_POOL_CLIENT_ID,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: email, PASSWORD: password },
      })
    );
    return response(200, {
      accessToken: result.AuthenticationResult?.IdToken,
      refreshToken: result.AuthenticationResult?.RefreshToken,
      expiresIn: result.AuthenticationResult?.ExpiresIn,
    });
  } catch (err: any) {
    if (err.name === 'NotAuthorizedException') {
      return errorResponse(401, ERROR_CODES.UNAUTHORIZED, 'Invalid credentials', requestId);
    }
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, err.message || 'Login failed', requestId);
  }
}

async function refreshToken(body: any, requestId: string) {
  const { refreshToken: token } = body;
  if (!token) {
    return errorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'refreshToken is required', requestId);
  }
  try {
    const result = await cognito.send(
      new InitiateAuthCommand({
        ClientId: USER_POOL_CLIENT_ID,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { REFRESH_TOKEN: token },
      })
    );
    return response(200, {
      accessToken: result.AuthenticationResult?.AccessToken,
      expiresIn: result.AuthenticationResult?.ExpiresIn,
    });
  } catch (err: any) {
    return errorResponse(401, ERROR_CODES.TOKEN_EXPIRED, err.message || 'Token refresh failed', requestId);
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId || 'unknown';
  const path = event.path.replace(/^\/auth/, '');
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  if (method === 'OPTIONS') {
    return response(200, {});
  }

  try {
    switch (path) {
      case '/register':
        return await register(body, requestId);
      case '/verify-email':
        return await verifyEmail(body, requestId);
      case '/login':
        return await login(body, requestId);
      case '/refresh-token':
        return await refreshToken(body, requestId);
      default:
        return errorResponse(404, ERROR_CODES.NOT_FOUND, `Route not found: ${path}`, requestId);
    }
  } catch (err: any) {
    console.error('Unhandled error:', err);
    return errorResponse(500, ERROR_CODES.INTERNAL_ERROR, 'Internal server error', requestId);
  }
}
