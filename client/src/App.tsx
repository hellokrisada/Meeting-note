import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import MeetingListPage from './pages/MeetingListPage';
import MeetingFormPage from './pages/MeetingFormPage';
import MeetingDetailPage from './pages/MeetingDetailPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/meetings" element={<MeetingListPage />} />
        <Route path="/meetings/new" element={<MeetingFormPage />} />
        <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
