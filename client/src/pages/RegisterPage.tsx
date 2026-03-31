import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, ApiError } from '../api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authApi.register({ email, password, name });
      navigate('/verify-email', { state: { email } });
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
        <h2>ลงทะเบียน</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="ชื่อ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
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
            placeholder="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <div className="toggle">
          <span>มีบัญชีแล้ว? </span>
          <button onClick={() => navigate('/login')}>เข้าสู่ระบบ</button>
        </div>
      </div>
    </div>
  );
}
