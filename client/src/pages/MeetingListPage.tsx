import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { meetingApi, ApiError } from '../api';

interface Participant {
  name: string;
  email: string;
}

interface MeetingRecord {
  meetingId: string;
  topic: string;
  participants: Participant[];
  createdAt: string;
  summary?: string;
}

export default function MeetingListPage() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchMeetings() {
      try {
        const res = await meetingApi.list();
        setMeetings(res.meetings);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('ไม่สามารถโหลดรายการประชุมได้');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchMeetings();
  }, []);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="meeting-list-container">
      <div className="meeting-list-box">
        <div className="meeting-list-header">
          <h2>รายการประชุม</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link to="/meetings/new" className="btn-new-meeting">
            + สร้างการประชุมใหม่
          </Link>
            <button className="btn-logout" onClick={() => { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); navigate('/login'); }}>
              ออกจากระบบ
            </button>
          </div>
        </div>

        {loading && <p className="loading-text">กำลังโหลด...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && meetings.length === 0 && (
          <div className="empty-state">
            <p>ยังไม่มีรายการประชุม</p>
            <Link to="/meetings/new" className="btn-new-meeting">
              สร้างการประชุมแรกของคุณ
            </Link>
          </div>
        )}

        {!loading && meetings.length > 0 && (
          <div className="meeting-cards">
            {meetings.map((m) => (
              <Link
                key={m.meetingId}
                to={`/meetings/${m.meetingId}`}
                className="meeting-card"
              >
                <div className="meeting-card-header">
                  <h3>{m.topic}</h3>
                  {m.summary && <span className="badge-ai">AI สรุปแล้ว</span>}
                </div>
                <div className="meeting-card-meta">
                  <span>{formatDate(m.createdAt)}</span>
                  <span>ผู้เข้าร่วม {m.participants.length} คน</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
