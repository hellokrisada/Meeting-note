import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi, ApiError } from '../api';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const passedEmail = (location.state as { email?: string })?.email || '';

  const [email, setEmail] = useState(passedEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authApi.verifyEmail({ email, code });
      navigate('/login', { state: { verified: true } });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>Meeting Minutes AI</h1>
        <h2>ยืนยันอีเมล</h2>
        <p style={{ color: '#666', marginBottom: 20 }}>
          กรุณากรอกรหัสยืนยันที่ส่งไปยังอีเมลของคุณ
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="อีเมล"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="text"
            placeholder="รหัสยืนยัน"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="one-time-code"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'กำลังยืนยัน...' : 'ยืนยันอีเมล'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <div className="toggle">
          <button onClick={() => navigate('/login')}>กลับไปหน้าเข้าสู่ระบบ</button>
        </div>
      </div>
    </div>
  );
}
