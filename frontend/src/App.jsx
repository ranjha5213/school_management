import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import VerifyOtp from './pages/VerifyOtp';
import ResetPassword from './pages/ResetPassword';
import PendingUsers from './pages/PendingUsers';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Teachers from './pages/Teachers';
import StudentDetail from './pages/StudentDetail';
import TeacherDetail from './pages/TeacherDetail';
import Attendance from './pages/Attendance';
import Exams from './pages/Exams';
import Homework from './pages/Homework';
import Timetable from './pages/Timetable';
import Fees from './pages/Fees';
import Mcq from './pages/Mcq';
import TakeMcq from './pages/TakeMcq';
import McqAttempts from './pages/McqAttempts';
import MyResults from './pages/MyResults';
import ReportCard from './pages/ReportCard';
import Library from './pages/Library';
import Notices from './pages/Notices';
import Profile from './pages/Profile';

function Protected({ children, adminOnly = false, roles = null }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <SettingsProvider>
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              className: 'text-sm',
              style: {
                background: 'var(--toast-bg, #fff)',
                color: 'var(--toast-fg, #0f172a)',
                border: '1px solid var(--toast-border, #e2e8f0)',
              },
              success: { duration: 3000, iconTheme: { primary: '#10b981', secondary: '#fff' } },
              error:   { duration: 5000, iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-otp" element={<VerifyOtp />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="classes" element={<Classes />} />
              <Route path="classes/:classId" element={<Classes />} />
              <Route path="classes/:classId/sections/:sectionId" element={<Classes />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:studentId" element={<StudentDetail />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="teachers/:teacherId" element={<TeacherDetail />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="exams" element={<Exams />} />
              <Route path="exams/:examId" element={<Exams />} />
              <Route path="homework" element={<Homework />} />
              <Route path="homework/:homeworkId" element={<Homework />} />
              <Route path="timetable" element={<Timetable />} />
              <Route path="timetable/:sectionId" element={<Timetable />} />
              <Route path="fees" element={<Fees />} />
              <Route path="mcq" element={<Protected roles={['admin', 'teacher', 'student']}><Mcq /></Protected>} />
              <Route path="mcq/:examId" element={<Protected roles={['admin', 'teacher', 'student']}><Mcq /></Protected>} />
              <Route path="mcq/:examId/take"
                element={<Protected roles={['student']}><TakeMcq /></Protected>} />
              <Route path="mcq/:examId/attempts"
                element={<Protected roles={['admin', 'teacher']}><McqAttempts /></Protected>} />
              <Route path="my-results"
                element={<Protected roles={['student']}><MyResults /></Protected>} />
              <Route path="students/:studentId/report-card" element={<ReportCard />} />
              <Route path="library" element={<Library />} />
              <Route path="notices" element={<Notices />} />
              <Route path="notices/:noticeId" element={<Notices />} />
              <Route path="profile" element={<Profile />} />
              <Route path="pending-users" element={<Protected adminOnly><PendingUsers /></Protected>} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
    </SettingsProvider>
  );
}

