import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, ApiError } from '../api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authApi.login({ email, password });
      localStorage.setItem('accessToken', res.accessToken);
      if (res.refreshToken) {
        localStorage.setItem('refreshToken', res.refreshToken);
      }
      navigate('/meetings');
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
        <h2>เข้าสู่ระบบ</h2>
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
            type="password"
            placeholder="รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <div className="toggle">
          <span>ยังไม่มีบัญชี? </span>
          <button onClick={() => navigate('/register')}>ลงทะเบียน</button>
        </div>
      </div>
    </div>
  );
}
