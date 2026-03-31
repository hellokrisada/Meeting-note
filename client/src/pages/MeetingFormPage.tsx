import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingApi, ApiError } from '../api';

interface Participant {
  name: string;
  email: string;
}

interface FormErrors {
  topic?: string;
  discussion?: string;
  nextSteps?: string;
  participants?: Record<number, { name?: string; email?: string }>;
}

const VALIDATION = {
  TOPIC_MAX_LENGTH: 200,
  DISCUSSION_MAX_LENGTH: 10000,
  NEXT_STEPS_MAX_LENGTH: 5000,
  PARTICIPANT_NAME_MAX_LENGTH: 100,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm(
  topic: string,
  discussion: string,
  nextSteps: string,
  participants: Participant[]
): FormErrors {
  const errors: FormErrors = {};

  if (!topic.trim()) {
    errors.topic = 'หัวข้อการประชุมต้องไม่ว่าง';
  } else if (topic.length > VALIDATION.TOPIC_MAX_LENGTH) {
    errors.topic = `หัวข้อการประชุมต้องไม่เกิน ${VALIDATION.TOPIC_MAX_LENGTH} ตัวอักษร`;
  }

  if (!discussion.trim()) {
    errors.discussion = 'ข้อหารือต้องไม่ว่าง';
  } else if (discussion.length > VALIDATION.DISCUSSION_MAX_LENGTH) {
    errors.discussion = `ข้อหารือต้องไม่เกิน ${VALIDATION.DISCUSSION_MAX_LENGTH} ตัวอักษร`;
  }

  if (nextSteps.length > VALIDATION.NEXT_STEPS_MAX_LENGTH) {
    errors.nextSteps = `Next steps ต้องไม่เกิน ${VALIDATION.NEXT_STEPS_MAX_LENGTH} ตัวอักษร`;
  }

  const pErrors: Record<number, { name?: string; email?: string }> = {};
  participants.forEach((p, i) => {
    const e: { name?: string; email?: string } = {};
    if (!p.name.trim()) {
      e.name = 'ชื่อผู้ร่วมประชุมต้องไม่ว่าง';
    } else if (p.name.length > VALIDATION.PARTICIPANT_NAME_MAX_LENGTH) {
      e.name = `ชื่อต้องไม่เกิน ${VALIDATION.PARTICIPANT_NAME_MAX_LENGTH} ตัวอักษร`;
    }
    if (!EMAIL_REGEX.test(p.email.trim())) {
      e.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    }
    if (e.name || e.email) pErrors[i] = e;
  });
  if (Object.keys(pErrors).length > 0) errors.participants = pErrors;

  return errors;
}

export default function MeetingFormPage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [discussion, setDiscussion] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([
    { name: '', email: '' },
  ]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  function addParticipant() {
    setParticipants([...participants, { name: '', email: '' }]);
  }

  function removeParticipant(index: number) {
    if (participants.length <= 1) return;
    setParticipants(participants.filter((_, i) => i !== index));
  }

  function updateParticipant(index: number, field: keyof Participant, value: string) {
    const updated = [...participants];
    updated[index] = { ...updated[index], [field]: value };
    setParticipants(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    const validationErrors = validateForm(topic, discussion, nextSteps, participants);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await meetingApi.create({
        topic: topic.trim(),
        discussion: discussion.trim(),
        nextSteps: nextSteps.trim(),
        participants: participants.map((p) => ({
          name: p.name.trim(),
          email: p.email.trim(),
        })),
      });
      navigate(`/meetings/${res.meetingId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="meeting-form-container">
      <div className="meeting-form-box">
        <div className="meeting-form-header">
          <h2>บันทึกรายงานการประชุม</h2>
          <button type="button" className="btn-back" onClick={() => navigate('/meetings')}>
            ← กลับ
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="topic">หัวข้อการประชุม *</label>
            <input
              id="topic"
              type="text"
              placeholder="หัวข้อการประชุม"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={VALIDATION.TOPIC_MAX_LENGTH}
              aria-invalid={!!errors.topic}
              aria-describedby={errors.topic ? 'topic-error' : undefined}
            />
            <span className="char-count">{topic.length}/{VALIDATION.TOPIC_MAX_LENGTH}</span>
            {errors.topic && <p id="topic-error" className="field-error">{errors.topic}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="discussion">ข้อหารือ *</label>
            <textarea
              id="discussion"
              placeholder="รายละเอียดข้อหารือในการประชุม"
              value={discussion}
              onChange={(e) => setDiscussion(e.target.value)}
              maxLength={VALIDATION.DISCUSSION_MAX_LENGTH}
              rows={6}
              aria-invalid={!!errors.discussion}
              aria-describedby={errors.discussion ? 'discussion-error' : undefined}
            />
            <span className="char-count">{discussion.length}/{VALIDATION.DISCUSSION_MAX_LENGTH}</span>
            {errors.discussion && <p id="discussion-error" className="field-error">{errors.discussion}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="nextSteps">Next Steps</label>
            <textarea
              id="nextSteps"
              placeholder="สิ่งที่ต้องทำต่อไป (ไม่บังคับ)"
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              maxLength={VALIDATION.NEXT_STEPS_MAX_LENGTH}
              rows={4}
              aria-invalid={!!errors.nextSteps}
              aria-describedby={errors.nextSteps ? 'nextsteps-error' : undefined}
            />
            <span className="char-count">{nextSteps.length}/{VALIDATION.NEXT_STEPS_MAX_LENGTH}</span>
            {errors.nextSteps && <p id="nextsteps-error" className="field-error">{errors.nextSteps}</p>}
          </div>

          <div className="participants-section">
            <div className="participants-header">
              <label>ผู้ร่วมประชุม</label>
              <button type="button" className="btn-add" onClick={addParticipant}>
                + เพิ่มผู้ร่วมประชุม
              </button>
            </div>
            {participants.map((p, i) => (
              <div key={i} className="participant-row">
                <div className="participant-fields">
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="ชื่อ"
                      value={p.name}
                      onChange={(e) => updateParticipant(i, 'name', e.target.value)}
                      maxLength={VALIDATION.PARTICIPANT_NAME_MAX_LENGTH}
                      aria-label={`ชื่อผู้ร่วมประชุมคนที่ ${i + 1}`}
                      aria-invalid={!!errors.participants?.[i]?.name}
                    />
                    {errors.participants?.[i]?.name && (
                      <p className="field-error">{errors.participants[i].name}</p>
                    )}
                  </div>
                  <div className="form-group">
                    <input
                      type="email"
                      placeholder="อีเมล"
                      value={p.email}
                      onChange={(e) => updateParticipant(i, 'email', e.target.value)}
                      aria-label={`อีเมลผู้ร่วมประชุมคนที่ ${i + 1}`}
                      aria-invalid={!!errors.participants?.[i]?.email}
                    />
                    {errors.participants?.[i]?.email && (
                      <p className="field-error">{errors.participants[i].email}</p>
                    )}
                  </div>
                </div>
                {participants.length > 1 && (
                  <button
                    type="button"
                    className="btn-remove"
                    onClick={() => removeParticipant(i)}
                    aria-label={`ลบผู้ร่วมประชุมคนที่ ${i + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {submitError && <p className="error">{submitError}</p>}

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'กำลังบันทึก...' : 'บันทึกรายงาน'}
          </button>
        </form>
      </div>
    </div>
  );
}
