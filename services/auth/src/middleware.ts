import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse } from '../../../shared/src/types';
import { ERROR_CODES } from '../../../shared/src/constants';

export interface AuthenticatedEvent extends APIGatewayProxyEvent {
  userId: string;
}

export function extractUserId(event: APIGatewayProxyEvent): string | null {
  // Cognito Authorizer puts claims in requestContext
  const claims = event.requestContext?.authorizer?.claims;
  if (claims && claims.sub) {
    return claims.sub as string;
  }
  return null;
}

export function requireAuth(
  event: APIGatewayProxyEvent
): { userId: string } | APIGatewayProxyResult {
  const userId = extractUserId(event);
  if (!userId) {
    const requestId = event.requestContext?.requestId || 'unknown';
    const body: ErrorResponse = {
      statusCode: 401,
      error: ERROR_CODES.UNAUTHORIZED,
      message: 'Authentication required',
      requestId,
    };
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(body),
    };
  }
  return { userId };
}
