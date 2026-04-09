const API_URL = import.meta.env.VITE_API_URL || '';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data: TokenResponse = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (!skipAuth) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  let res = await fetch(`${API_URL}${path}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle token refresh on 401
  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      reqHeaders['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.message || res.statusText, error.error);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// --- Auth API ---

export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    apiRequest<{ message: string; userId: string }>('/auth/register', {
      method: 'POST',
      body: data,
      skipAuth: true,
    }),

  login: (data: { email: string; password: string }) =>
    apiRequest<TokenResponse>('/auth/login', {
      method: 'POST',
      body: data,
      skipAuth: true,
    }),

  verifyEmail: (data: { email: string; code: string }) =>
    apiRequest<{ message: string }>('/auth/verify-email', {
      method: 'POST',
      body: data,
      skipAuth: true,
    }),

  refreshToken: (refreshToken: string) =>
    apiRequest<TokenResponse>('/auth/refresh-token', {
      method: 'POST',
      body: { refreshToken },
      skipAuth: true,
    }),
};

// --- Meeting API ---

interface Participant {
  name: string;
  email: string;
}

interface MeetingInput {
  topic: string;
  discussion: string;
  nextSteps: string;
  participants: Participant[];
}

interface MeetingRecord extends MeetingInput {
  meetingId: string;
  userId: string;
  summary?: string;
  summaryModelId?: string;
  emailStatus?: { sent: string[]; failed: string[]; lastSentAt?: string };
  createdAt: string;
  updatedAt: string;
}

export const meetingApi = {
  create: (data: MeetingInput) =>
    apiRequest<{ meetingId: string; meeting: MeetingRecord }>('/meetings', {
      method: 'POST',
      body: data,
    }),

  list: () =>
    apiRequest<{ meetings: MeetingRecord[]; count: number }>('/meetings'),

  get: (meetingId: string) =>
    apiRequest<{ meeting: MeetingRecord }>(`/meetings/${meetingId}`),

  update: (meetingId: string, data: Partial<MeetingInput>) =>
    apiRequest<{ meeting: MeetingRecord }>(`/meetings/${meetingId}`, {
      method: 'PUT',
      body: data,
    }),

  delete: (meetingId: string) =>
    apiRequest<{ message: string }>(`/meetings/${meetingId}`, {
      method: 'DELETE',
    }),
};

// --- AI API ---

interface AIModel {
  modelId: string;
  displayName: string;
  provider: string;
  isDefault: boolean;
}

export const aiApi = {
  summarize: (meetingId: string, modelId?: string) =>
    apiRequest<{ summary: string; modelUsed: string }>(
      `/ai/summarize/${meetingId}`,
      { method: 'POST', body: modelId ? { modelId } : {} }
    ),

  listModels: () =>
    apiRequest<{ models: AIModel[]; defaultModel: string }>('/ai/models'),

  updateSummary: (meetingId: string, summary: string) =>
    apiRequest<{ meeting: MeetingRecord }>(`/ai/summary/${meetingId}`, {
      method: 'PUT',
      body: { summary },
    }),
};

// --- Email API ---

export const emailApi = {
  send: (meetingId: string, participantEmails?: string[]) =>
    apiRequest<{ sent: string[]; failed: string[]; messageId: string }>(
      `/ai/send-email/${meetingId}`,
      { method: 'POST', body: participantEmails ? { participantEmails } : {} }
    ),

  resend: (meetingId: string, participantEmails: string[]) =>
    apiRequest<{ sent: string[]; failed: string[] }>(
      `/ai/resend-email/${meetingId}`,
      { method: 'POST', body: { participantEmails } }
    ),
};
