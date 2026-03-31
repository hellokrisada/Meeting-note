import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { meetingApi, aiApi, emailApi, ApiError } from '../api';

interface Participant {
  name: string;
  email: string;
}

interface MeetingRecord {
  meetingId: string;
  userId: string;
  topic: string;
  discussion: string;
  nextSteps: string;
  participants: Participant[];
  summary?: string;
  summaryModelId?: string;
  emailStatus?: { sent: string[]; failed: string[]; lastSentAt?: string };
  createdAt: string;
  updatedAt: string;
}

export default function MeetingDetailPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editTopic, setEditTopic] = useState('');
  const [editDiscussion, setEditDiscussion] = useState('');
  const [editNextSteps, setEditNextSteps] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // AI Summarization state
  const [models, setModels] = useState<{ modelId: string; displayName: string; provider: string; isDefault: boolean }[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Email state
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState<{ sent: string[]; failed: string[] } | null>(null);
  const [emailError, setEmailError] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    async function fetchMeeting() {
      if (!meetingId) return;
      try {
        const res = await meetingApi.get(meetingId);
        setMeeting(res.meeting);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('ไม่สามารถโหลดข้อมูลการประชุมได้');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchMeeting();
  }, [meetingId]);

  // Fetch AI models
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await aiApi.listModels();
        setModels(res.models);
        const defaultM = res.models.find((m) => m.isDefault) || res.models[0];
        if (defaultM) setSelectedModel(defaultM.modelId);
      } catch {
        // Models will just be empty, user can still use the page
      }
    }
    fetchModels();
  }, []);

  function startEditing() {
    if (!meeting) return;
    setEditTopic(meeting.topic);
    setEditDiscussion(meeting.discussion);
    setEditNextSteps(meeting.nextSteps);
    setSaveError('');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError('');
  }

  async function handleSave() {
    if (!meetingId || !editTopic.trim() || !editDiscussion.trim()) {
      setSaveError('หัวข้อและข้อหารือต้องไม่ว่าง');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await meetingApi.update(meetingId, {
        topic: editTopic.trim(),
        discussion: editDiscussion.trim(),
        nextSteps: editNextSteps.trim(),
      });
      setMeeting(res.meeting);
      setEditing(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
      } else {
        setSaveError('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!meetingId) return;
    const confirmed = window.confirm('คุณต้องการลบรายงานการประชุมนี้หรือไม่?');
    if (!confirmed) return;
    try {
      await meetingApi.delete(meetingId);
      navigate('/meetings');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('ไม่สามารถลบได้ กรุณาลองใหม่');
      }
    }
  }

  // AI Summarization handlers
  async function handleSummarize() {
    if (!meetingId) return;
    setSummarizing(true);
    setSummaryError('');
    try {
      const res = await aiApi.summarize(meetingId, selectedModel || undefined);
      setSummaryDraft(res.summary);
    } catch (err) {
      if (err instanceof ApiError) {
        setSummaryError(err.message);
      } else {
        setSummaryError('ไม่สามารถสรุปได้ กรุณาลองใหม่หรือเลือก model อื่น');
      }
    } finally {
      setSummarizing(false);
    }
  }

  async function handleSaveSummary() {
    if (!meetingId || !summaryDraft.trim()) return;
    setSavingSummary(true);
    setSummaryError('');
    try {
      const res = await aiApi.updateSummary(meetingId, summaryDraft.trim());
      setMeeting(res.meeting);
      setSummaryDraft('');
    } catch (err) {
      if (err instanceof ApiError) {
        setSummaryError(err.message);
      } else {
        setSummaryError('ไม่สามารถบันทึกสรุปได้');
      }
    } finally {
      setSavingSummary(false);
    }
  }

  async function handleCopySummary() {
    const text = summaryDraft || meeting?.summary || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setSummaryError('ไม่สามารถคัดลอกได้');
    }
  }

  // Email handlers
  async function handleSendEmail() {
    if (!meetingId) return;
    setSendingEmail(true);
    setEmailError('');
    setEmailResult(null);
    try {
      const res = await emailApi.send(meetingId);
      setEmailResult({ sent: res.sent, failed: res.failed });
    } catch (err) {
      if (err instanceof ApiError) {
        setEmailError(err.message);
      } else {
        setEmailError('ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่');
      }
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleResend(failedEmails: string[]) {
    if (!meetingId || failedEmails.length === 0) return;
    setResending(true);
    setEmailError('');
    try {
      const res = await emailApi.resend(meetingId, failedEmails);
      setEmailResult((prev) => {
        if (!prev) return { sent: res.sent, failed: res.failed };
        const newSent = [...prev.sent, ...res.sent];
        const newFailed = res.failed;
        return { sent: newSent, failed: newFailed };
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setEmailError(err.message);
      } else {
        setEmailError('ไม่สามารถส่งซ้ำได้ กรุณาลองใหม่');
      }
    } finally {
      setResending(false);
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <div className="meeting-detail-container">
        <div className="meeting-detail-box">
          <p className="loading-text">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="meeting-detail-container">
        <div className="meeting-detail-box">
          <p className="error">{error || 'ไม่พบข้อมูลการประชุม'}</p>
          <button className="btn-back" onClick={() => navigate('/meetings')}>
            ← กลับไปรายการประชุม
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="meeting-detail-container">
      <div className="meeting-detail-box">
        <div className="meeting-detail-header">
          <button className="btn-back" onClick={() => navigate('/meetings')}>
            ← กลับ
          </button>
          <div className="meeting-detail-actions">
            {!editing && (
              <>
                <button className="btn-edit" onClick={startEditing}>แก้ไข</button>
                <button className="btn-delete" onClick={handleDelete}>ลบ</button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="meeting-edit-form">
            <div className="form-group">
              <label htmlFor="edit-topic">หัวข้อการประชุม *</label>
              <input
                id="edit-topic"
                type="text"
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-discussion">ข้อหารือ *</label>
              <textarea
                id="edit-discussion"
                value={editDiscussion}
                onChange={(e) => setEditDiscussion(e.target.value)}
                rows={6}
                maxLength={10000}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-nextsteps">Next Steps</label>
              <textarea
                id="edit-nextsteps"
                value={editNextSteps}
                onChange={(e) => setEditNextSteps(e.target.value)}
                rows={4}
                maxLength={5000}
              />
            </div>
            {saveError && <p className="error">{saveError}</p>}
            <div className="edit-buttons">
              <button className="btn-submit" onClick={handleSave} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button className="btn-cancel" onClick={cancelEditing} disabled={saving}>
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <div className="meeting-detail-content">
            <h2>{meeting.topic}</h2>
            <p className="meeting-date">สร้างเมื่อ {formatDate(meeting.createdAt)}</p>

            <section className="detail-section">
              <h3>ข้อหารือ</h3>
              <p className="detail-text">{meeting.discussion}</p>
            </section>

            {meeting.nextSteps && (
              <section className="detail-section">
                <h3>Next Steps</h3>
                <p className="detail-text">{meeting.nextSteps}</p>
              </section>
            )}

            <section className="detail-section">
              <h3>ผู้เข้าร่วมประชุม ({meeting.participants.length} คน)</h3>
              <ul className="participant-list">
                {meeting.participants.map((p, i) => (
                  <li key={i}>
                    <span className="participant-name">{p.name}</span>
                    <span className="participant-email">{p.email}</span>
                  </li>
                ))}
              </ul>
            </section>

            {meeting.summary && (
              <section className="detail-section summary-section">
                <h3>สรุปจาก AI</h3>
                <p className="detail-text">{meeting.summary}</p>
                <button className="btn-copy" onClick={handleCopySummary}>
                  {copySuccess ? '✓ คัดลอกแล้ว' : 'คัดลอกสรุป'}
                </button>
              </section>
            )}

            {/* AI Summarization Section */}
            <section className="detail-section ai-section">
              <h3>สรุปด้วย AI</h3>
              <div className="ai-controls">
                <select
                  className="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={summarizing}
                >
                  {models.length === 0 && <option value="">กำลังโหลด models...</option>}
                  {models.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.displayName} ({m.provider}){m.isDefault ? ' - ค่าเริ่มต้น' : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-summarize"
                  onClick={handleSummarize}
                  disabled={summarizing || models.length === 0}
                >
                  {summarizing ? 'กำลังสรุป...' : 'สรุปการประชุม'}
                </button>
              </div>
              {summaryError && <p className="error">{summaryError}</p>}
              {summaryDraft && (
                <div className="summary-draft">
                  <textarea
                    className="summary-textarea"
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    rows={8}
                  />
                  <div className="summary-draft-actions">
                    <button
                      className="btn-submit"
                      onClick={handleSaveSummary}
                      disabled={savingSummary || !summaryDraft.trim()}
                    >
                      {savingSummary ? 'กำลังบันทึก...' : 'บันทึกสรุป'}
                    </button>
                    <button className="btn-copy" onClick={handleCopySummary}>
                      {copySuccess ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                    <button className="btn-cancel" onClick={() => setSummaryDraft('')}>
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Email Section - only when summary exists */}
            {meeting.summary && (
              <section className="detail-section email-section">
                <h3>ส่งอีเมลสรุป</h3>
                <button
                  className="btn-send-email"
                  onClick={handleSendEmail}
                  disabled={sendingEmail}
                >
                  {sendingEmail ? 'กำลังส่ง...' : 'ส่งอีเมลไปยังผู้เข้าร่วมทั้งหมด'}
                </button>
                {emailError && <p className="error">{emailError}</p>}
                {emailResult && (
                  <div className="email-results">
                    {emailResult.sent.length > 0 && (
                      <div className="email-sent">
                        <h4>✓ ส่งสำเร็จ ({emailResult.sent.length})</h4>
                        <ul>
                          {emailResult.sent.map((email) => (
                            <li key={email} className="email-status-sent">{email}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {emailResult.failed.length > 0 && (
                      <div className="email-failed">
                        <h4>✗ ส่งไม่สำเร็จ ({emailResult.failed.length})</h4>
                        <ul>
                          {emailResult.failed.map((email) => (
                            <li key={email} className="email-status-failed">{email}</li>
                          ))}
                        </ul>
                        <button
                          className="btn-resend"
                          onClick={() => handleResend(emailResult.failed)}
                          disabled={resending}
                        >
                          {resending ? 'กำลังส่งซ้ำ...' : 'ส่งซ้ำอีเมลที่ล้มเหลว'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
