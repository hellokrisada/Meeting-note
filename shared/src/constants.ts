import { AIModel } from './types';

export const DEFAULT_MODEL_ID = 'amazon.nova-lite-v1:0';

export const MEETINGS_TABLE = process.env.MEETINGS_TABLE || 'meeting-minutes-dev';

export const SUPPORTED_MODELS: AIModel[] = [
  {
    modelId: 'amazon.nova-lite-v1:0',
    displayName: 'Amazon Nova Lite',
    provider: 'Amazon',
    isDefault: true,
  },
  {
    modelId: 'amazon.nova-micro-v1:0',
    displayName: 'Amazon Nova Micro',
    provider: 'Amazon',
    isDefault: false,
  },
  {
    modelId: 'amazon.nova-pro-v1:0',
    displayName: 'Amazon Nova Pro',
    provider: 'Amazon',
    isDefault: false,
  },
  {
    modelId: 'anthropic.claude-sonnet-4-20250514-v1:0',
    displayName: 'Claude Sonnet 4',
    provider: 'Anthropic',
    isDefault: false,
  },
  {
    modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    displayName: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    isDefault: false,
  },
  {
    modelId: 'anthropic.claude-opus-4-20250514-v1:0',
    displayName: 'Claude Opus 4',
    provider: 'Anthropic',
    isDefault: false,
  },
];

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',
  EMAIL_SERVICE_ERROR: 'EMAIL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export const VALIDATION = {
  TOPIC_MAX_LENGTH: 200,
  DISCUSSION_MAX_LENGTH: 10000,
  NEXT_STEPS_MAX_LENGTH: 5000,
  PARTICIPANT_NAME_MAX_LENGTH: 100,
  PASSWORD_MIN_LENGTH: 8,
} as const;
