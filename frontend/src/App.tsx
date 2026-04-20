import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import AppLayout from './components/AppLayout';
import AdminLayout from './components/AdminLayout';
import RequireAdmin from './components/RequireAdmin';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import PracticeHub from './pages/PracticeHub';
import SkillPractice from './pages/SkillPractice';
import SpeakingPlaceholder from './pages/SpeakingPlaceholder';
import ExamRunner from './pages/ExamRunner';
import ReviewResult from './pages/ReviewResult';
import MistakeNotebook from './pages/MistakeNotebook';
import Pricing from './pages/Pricing';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import VerificationSent from './pages/VerificationSent';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminLogs from './pages/admin/AdminLogs';
import AdminLoginHistory from './pages/admin/AdminLoginHistory';
import AdminExams from './pages/admin/AdminExams';
import AdminExamEdit from './pages/admin/AdminExamEdit';
import AdminExamImport from './pages/admin/AdminExamImport';
import { useAuthStore } from './stores/auth';

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  useEffect(() => {
    if (localStorage.getItem('accessToken')) fetchMe();
  }, [fetchMe]);

  return (
    <Routes>
      {/* --- Admin routes (separate layout, no top-bar) --- */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUserDetail />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="logins" element={<AdminLoginHistory />} />
        <Route path="exams" element={<AdminExams />} />
        <Route path="exams/import" element={<AdminExamImport />} />
        <Route path="exams/:id" element={<AdminExamEdit />} />
      </Route>

      {/* --- Public + user routes --- */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/verification-sent" element={<VerificationSent />} />

        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />

        {/* Practice hub + per-skill entries */}
        <Route path="/practice" element={<RequireAuth><PracticeHub /></RequireAuth>} />
        <Route path="/practice/listening" element={<RequireAuth><SkillPractice skill="CO" /></RequireAuth>} />
        <Route path="/practice/reading" element={<RequireAuth><SkillPractice skill="CE" /></RequireAuth>} />
        <Route path="/practice/writing" element={<RequireAuth><SkillPractice skill="PE" /></RequireAuth>} />
        <Route path="/practice/speaking" element={<RequireAuth><SpeakingPlaceholder /></RequireAuth>} />
        <Route path="/practice/mock" element={<RequireAuth><SkillPractice mockMode /></RequireAuth>} />

        {/* Runner routes — skill-scoped and mock */}
        <Route path="/practice/listening/:examId" element={<RequireAuth><ExamRunner skill="CO" /></RequireAuth>} />
        <Route path="/practice/reading/:examId" element={<RequireAuth><ExamRunner skill="CE" /></RequireAuth>} />
        <Route path="/practice/writing/:examId" element={<RequireAuth><ExamRunner skill="PE" /></RequireAuth>} />
        <Route path="/practice/mock/:examId" element={<RequireAuth><ExamRunner /></RequireAuth>} />
        {/* Legacy: /practice/:examId preserved for old session links (full mock) */}
        <Route path="/practice/:examId" element={<RequireAuth><ExamRunner /></RequireAuth>} />

        <Route path="/review/:sessionId" element={<RequireAuth><ReviewResult /></RequireAuth>} />
        <Route path="/mistakes" element={<RequireAuth><MistakeNotebook /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
