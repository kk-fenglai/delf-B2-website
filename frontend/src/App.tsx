import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import PageLoader from './components/PageLoader';
import { useAuthStore } from './stores/auth';
import { useGeoStore } from './stores/geo';

const AdminLayout = lazy(() => import('./components/AdminLayout'));
const RequireAdmin = lazy(() => import('./components/RequireAdmin'));

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PracticeHub = lazy(() => import('./pages/PracticeHub'));
const SkillPractice = lazy(() => import('./pages/SkillPractice'));
const SpeakingExam = lazy(() => import('./pages/SpeakingExam'));
const ExamRunner = lazy(() => import('./pages/ExamRunner'));
const ReviewResult = lazy(() => import('./pages/ReviewResult'));
const MyExams = lazy(() => import('./pages/MyExams'));
const MyExamEdit = lazy(() => import('./pages/MyExamEdit'));
const MistakeNotebook = lazy(() => import('./pages/MistakeNotebook'));
const Pricing = lazy(() => import('./pages/Pricing'));
const ExamGuide = lazy(() => import('./pages/ExamGuide'));
const Orders = lazy(() => import('./pages/Orders'));
const StripeCheckoutReturn = lazy(() => import('./pages/StripeCheckoutReturn'));
const StripeEmbeddedCheckout = lazy(() => import('./pages/StripeEmbeddedCheckout'));
const StripeCheckoutComplete = lazy(() => import('./pages/StripeCheckoutComplete'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const VerificationSent = lazy(() => import('./pages/VerificationSent'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminLoginHistory = lazy(() => import('./pages/admin/AdminLoginHistory'));
const AdminExams = lazy(() => import('./pages/admin/AdminExams'));
const AdminExamEdit = lazy(() => import('./pages/admin/AdminExamEdit'));
const AdminExamImport = lazy(() => import('./pages/admin/AdminExamImport'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'));
const AdminChangePassword = lazy(() => import('./pages/admin/AdminChangePassword'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const fetchGeo = useGeoStore((s) => s.fetchGeo);
  useEffect(() => {
    if (localStorage.getItem('accessToken')) fetchMe();
    fetchGeo();
  }, [fetchMe, fetchGeo]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* --- Admin routes (separate layout, no top-bar) --- */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="change-password" element={<AdminChangePassword />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="logins" element={<AdminLoginHistory />} />
          <Route path="exams" element={<AdminExams />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="exams/import" element={<AdminExamImport />} />
          <Route path="exams/:id" element={<AdminExamEdit />} />
        </Route>

        {/* --- Public + user routes --- */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/exam-guide" element={<ExamGuide />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/checkout/stripe" element={<RequireAuth><StripeEmbeddedCheckout /></RequireAuth>} />
          <Route path="/checkout/stripe/complete" element={<RequireAuth><StripeCheckoutComplete /></RequireAuth>} />
          <Route path="/checkout/stripe/success" element={<RequireAuth><StripeCheckoutReturn mode="success" /></RequireAuth>} />
          <Route path="/checkout/stripe/cancel" element={<RequireAuth><StripeCheckoutReturn mode="cancel" /></RequireAuth>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/verification-sent" element={<VerificationSent />} />

          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />

          {/* Practice hub + per-skill entries */}
          <Route path="/practice" element={<RequireAuth><PracticeHub /></RequireAuth>} />
          <Route path="/practice/listening" element={<RequireAuth><SkillPractice skill="CO" /></RequireAuth>} />
          <Route path="/practice/reading" element={<RequireAuth><SkillPractice skill="CE" /></RequireAuth>} />
          <Route path="/practice/writing" element={<RequireAuth><SkillPractice skill="PE" /></RequireAuth>} />
          <Route path="/practice/speaking" element={<RequireAuth><SkillPractice skill="PO" /></RequireAuth>} />
          <Route path="/practice/mock" element={<RequireAuth><SkillPractice mockMode /></RequireAuth>} />

          {/* Runner routes — skill-scoped and mock */}
          <Route path="/practice/listening/:examId" element={<RequireAuth><ExamRunner skill="CO" /></RequireAuth>} />
          <Route path="/practice/reading/:examId" element={<RequireAuth><ExamRunner skill="CE" /></RequireAuth>} />
          <Route path="/practice/writing/:examId" element={<RequireAuth><ExamRunner skill="PE" /></RequireAuth>} />
          <Route path="/practice/speaking/:examId" element={<RequireAuth><SpeakingExam /></RequireAuth>} />
          <Route path="/practice/mock/:examId" element={<RequireAuth><ExamRunner /></RequireAuth>} />
          {/* Legacy: /practice/:examId preserved for old session links (full mock) */}
          <Route path="/practice/:examId" element={<RequireAuth><ExamRunner /></RequireAuth>} />

          <Route path="/my-exams" element={<RequireAuth><MyExams /></RequireAuth>} />
          <Route path="/my-exams/:id/edit" element={<RequireAuth><MyExamEdit /></RequireAuth>} />

          <Route path="/review/:sessionId" element={<RequireAuth><ReviewResult /></RequireAuth>} />
          <Route path="/mistakes" element={<RequireAuth><MistakeNotebook /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
