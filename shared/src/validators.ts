import { Participant, CreateMeetingRequest } from './types';
import { VALIDATION } from './constants';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateMeetingInput(
  input: Partial<CreateMeetingRequest>
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.topic || !input.topic.trim()) {
    errors.push({ field: 'topic', message: 'หัวข้อการประชุมต้องไม่ว่าง' });
  } else if (input.topic.length > VALIDATION.TOPIC_MAX_LENGTH) {
    errors.push({
      field: 'topic',
      message: `หัวข้อการประชุมต้องไม่เกิน ${VALIDATION.TOPIC_MAX_LENGTH} ตัวอักษร`,
    });
  }

  if (!input.discussion || !input.discussion.trim()) {
    errors.push({ field: 'discussion', message: 'ข้อหารือต้องไม่ว่าง' });
  } else if (input.discussion.length > VALIDATION.DISCUSSION_MAX_LENGTH) {
    errors.push({
      field: 'discussion',
      message: `ข้อหารือต้องไม่เกิน ${VALIDATION.DISCUSSION_MAX_LENGTH} ตัวอักษร`,
    });
  }

  if (
    input.nextSteps &&
    input.nextSteps.length > VALIDATION.NEXT_STEPS_MAX_LENGTH
  ) {
    errors.push({
      field: 'nextSteps',
      message: `Next steps ต้องไม่เกิน ${VALIDATION.NEXT_STEPS_MAX_LENGTH} ตัวอักษร`,
    });
  }

  if (input.participants) {
    const participantErrors = validateParticipants(input.participants);
    errors.push(...participantErrors);
  }

  return errors;
}

export function validateParticipants(
  participants: Participant[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];

    if (!p.name || !p.name.trim()) {
      errors.push({
        field: `participants[${i}].name`,
        message: 'ชื่อผู้ร่วมประชุมต้องไม่ว่าง',
      });
    } else if (p.name.length > VALIDATION.PARTICIPANT_NAME_MAX_LENGTH) {
      errors.push({
        field: `participants[${i}].name`,
        message: `ชื่อผู้ร่วมประชุมต้องไม่เกิน ${VALIDATION.PARTICIPANT_NAME_MAX_LENGTH} ตัวอักษร`,
      });
    }

    if (!validateEmail(p.email)) {
      errors.push({
        field: `participants[${i}].email`,
        message: 'รูปแบบอีเมลไม่ถูกต้อง',
      });
    }
  }

  return errors;
}
