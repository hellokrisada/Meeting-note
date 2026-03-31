export interface Participant {
  name: string;
  email: string;
}

export interface EmailStatus {
  sent: string[];
  failed: string[];
  lastSentAt?: string;
}

export interface MeetingRecord {
  meetingId: string;
  userId: string;
  topic: string;
  discussion: string;
  nextSteps: string;
  participants: Participant[];
  summary?: string;
  summaryModelId?: string;
  emailStatus?: EmailStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AIModel {
  modelId: string;
  displayName: string;
  provider: string;
  isDefault: boolean;
}

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  requestId: string;
}

export interface CreateMeetingRequest {
  topic: string;
  discussion: string;
  nextSteps: string;
  participants: Participant[];
}

export interface UpdateMeetingRequest {
  topic?: string;
  discussion?: string;
  nextSteps?: string;
  participants?: Participant[];
}

export interface SummarizeRequest {
  modelId?: string;
}

export interface SendEmailRequest {
  participantEmails?: string[];
}
