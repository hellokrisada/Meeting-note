import * as fc from 'fast-check';
import { validateMeetingInput, validateEmail } from '../../shared/src/validators';

/**
 * Feature: meeting-minutes-ai, Property 3: การตรวจสอบฟิลด์ที่จำเป็น
 * ทดสอบว่า topic/discussion ที่เป็น whitespace ถูกปฏิเสธ
 * Validates: Requirements 2.2
 */
describe('Property 3: การตรวจสอบฟิลด์ที่จำเป็น', () => {
  // Generator for whitespace-only strings
  const whitespaceChar = fc.constantFrom(' ', '\t', '\n', '\r');
  const whitespaceArb = fc.array(whitespaceChar, { minLength: 0, maxLength: 20 }).map((arr) => arr.join(''));

  it('should reject when topic is empty or whitespace-only', () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(whitespaceArb, (topic) => {
        const errors = validateMeetingInput({
          topic,
          discussion: 'valid discussion content',
        });
        const topicErrors = errors.filter((e) => e.field === 'topic');
        return topicErrors.length > 0;
      }),
      { numRuns: 100 }
    );
  });

  it('should reject when discussion is empty or whitespace-only', () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(whitespaceArb, (discussion) => {
        const errors = validateMeetingInput({
          topic: 'valid topic',
          discussion,
        });
        const discussionErrors = errors.filter((e) => e.field === 'discussion');
        return discussionErrors.length > 0;
      }),
      { numRuns: 100 }
    );
  });

  it('should reject when both topic and discussion are whitespace-only', () => {
    // **Validates: Requirements 2.2**
    fc.assert(
      fc.property(whitespaceArb, whitespaceArb, (topic, discussion) => {
        const errors = validateMeetingInput({ topic, discussion });
        const topicErrors = errors.filter((e) => e.field === 'topic');
        const discussionErrors = errors.filter((e) => e.field === 'discussion');
        return topicErrors.length > 0 && discussionErrors.length > 0;
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: meeting-minutes-ai, Property 4: การตรวจสอบรูปแบบอีเมลผู้ร่วมประชุม
 * ทดสอบว่าอีเมลที่ไม่ถูกต้องถูกปฏิเสธ อีเมลที่ถูกต้องถูกยอมรับ
 * Validates: Requirements 2.3
 */
describe('Property 4: การตรวจสอบรูปแบบอีเมล', () => {
  // Generator for valid email addresses: local@domain.tld
  const alphanumChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''));
  const alphaChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''));

  const validEmailArb = fc
    .tuple(
      fc.array(alphanumChar, { minLength: 1, maxLength: 10 }).map((a) => a.join('')),
      fc.array(alphanumChar, { minLength: 1, maxLength: 10 }).map((a) => a.join('')),
      fc.array(alphaChar, { minLength: 2, maxLength: 5 }).map((a) => a.join(''))
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

  // Generator for invalid emails
  const invalidEmailArb = fc.oneof(
    // No @ sign at all
    fc.array(alphanumChar, { minLength: 1, maxLength: 20 }).map((a) => a.join('')),
    // Only whitespace
    fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 5 }).map((a) => a.join('')),
    // Empty string
    fc.constant(''),
    // @ but no domain part (local@)
    fc.array(alphaChar, { minLength: 1, maxLength: 5 }).map((a) => `${a.join('')}@`),
    // @ but no local part (@domain)
    fc.array(alphaChar, { minLength: 1, maxLength: 5 }).map((a) => `@${a.join('')}`),
    // Contains spaces in local part
    fc.tuple(
      fc.array(alphaChar, { minLength: 1, maxLength: 3 }).map((a) => a.join('')),
      fc.array(alphaChar, { minLength: 1, maxLength: 3 }).map((a) => a.join('')),
      fc.array(alphaChar, { minLength: 1, maxLength: 3 }).map((a) => a.join(''))
    ).map(([a, b, domain]) => `${a} ${b}@${domain}.com`)
  );

  it('should accept valid email addresses', () => {
    // **Validates: Requirements 2.3**
    fc.assert(
      fc.property(validEmailArb, (email) => {
        return validateEmail(email) === true;
      }),
      { numRuns: 100 }
    );
  });

  it('should reject invalid email addresses', () => {
    // **Validates: Requirements 2.3**
    fc.assert(
      fc.property(invalidEmailArb, (email) => {
        return validateEmail(email) === false;
      }),
      { numRuns: 100 }
    );
  });

  it('should reject invalid emails when used as participant email in meeting validation', () => {
    // **Validates: Requirements 2.3**
    fc.assert(
      fc.property(invalidEmailArb, (email) => {
        const errors = validateMeetingInput({
          topic: 'valid topic',
          discussion: 'valid discussion',
          participants: [{ name: 'Test User', email }],
        });
        const emailErrors = errors.filter((e) => e.field.includes('email'));
        return emailErrors.length > 0;
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid emails when used as participant email in meeting validation', () => {
    // **Validates: Requirements 2.3**
    fc.assert(
      fc.property(validEmailArb, (email) => {
        const errors = validateMeetingInput({
          topic: 'valid topic',
          discussion: 'valid discussion',
          participants: [{ name: 'Test User', email }],
        });
        const emailErrors = errors.filter((e) => e.field.includes('email'));
        return emailErrors.length === 0;
      }),
      { numRuns: 100 }
    );
  });
});
