import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';

// Components
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

// Pages
import Attendance from './pages/Attendance';
import AttendanceOverview from './pages/AttendanceOverview';
import Classes from './pages/Classes';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Exams from './pages/Exams';
import Fees from './pages/Fees';
import ForgotPassword from './pages/ForgotPassword';
import Homework from './pages/Homework';
import Library from './pages/Library';
import Login from './pages/Login';
import Mcq from './pages/Mcq';
import McqAttempts from './pages/McqAttempts';
import MyAttendance from './pages/MyAttendance';
import MyResults from './pages/MyResults';
import Notices from './pages/Notices';
import PendingUsers from './pages/PendingUsers';
import Profile from './pages/Profile';
import Register from './pages/Register';
import ReportCard from './pages/ReportCard';
import ResetPassword from './pages/ResetPassword';
import SectionDetail from './pages/SectionDetail';
import Settings from './pages/Settings';
import StudentAttendanceHistory from './pages/StudentAttendanceHistory';
import StudentDetail from './pages/StudentDetail';
import Students from './pages/Students';
import Subjects from './pages/Subjects';
import TakeMcq from './pages/TakeMcq';
import TeacherDetail from './pages/TeacherDetail';
import Teachers from './pages/Teachers';
import Timetable from './pages/Timetable';
import TimetableGridPage from './pages/TimetableGridPage';
import TimetableSettings from './pages/TimetableSettings';
import VerifyOtp from './pages/VerifyOtp';

function Protected({ children, adminOnly = false, roles = null }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden print:block print:h-auto print:overflow-visible">
      <div className="print:hidden flex shrink-0">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        <div className="print:hidden">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 print:p-0 print:overflow-visible print:h-auto print:block">
          <Outlet />
        </main>
      </div>
    </div>
  );
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
                  duration: 2000,
                  className: 'text-sm',
                  style: {
                    background: 'var(--toast-bg, #fff)',
                    color: 'var(--toast-fg, #0f172a)',
                    border: '1px solid var(--toast-border, #e2e8f0)',
                  },
                  success: { duration: 1000, iconTheme: { primary: '#10b981', secondary: '#fff' } },
                  error:   { duration: 2000, iconTheme: { primary: '#ef4444', secondary: '#fff' } },
                }}
              />

              <Routes>
                {/* Auth pages */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/verify-otp" element={<VerifyOtp />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* App shell */}
                <Route path="/" element={<Protected><AppLayout /></Protected>}>
                  <Route index element={<Navigate to="/dashboard" replace />} />

                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="classes" element={<Classes />} />
                  <Route path="classes/:classId" element={<Classes />} />
                  <Route path="classes/:classId/sections/:sectionId" element={<Classes />} />

                  {/* Subjects Route properly nested inside AppLayout */}
                  <Route path="subjects" element={<Subjects />} />

                  <Route path="students" element={<Students />} />
                  <Route path="students/:studentId" element={<StudentDetail />} />
                  <Route path="teachers" element={<Teachers />} />
                  <Route path="teachers/:teacherId" element={<TeacherDetail />} />

                  <Route path="attendance" element={<Attendance />} />
                  <Route path="attendance/view" element={<Protected roles={['admin', 'teacher']}><AttendanceOverview /></Protected>} />
                  <Route path="attendance/section/:sectionId" element={<Protected roles={['admin', 'teacher']}><SectionDetail /></Protected>} />
                  <Route path="attendance/student/:studentId" element={<Protected roles={['admin', 'teacher']}><StudentAttendanceHistory /></Protected>} />
                  <Route path="my-attendance" element={<Protected roles={['student']}><MyAttendance /></Protected>} />

                  <Route path="exams" element={<Exams />} />
                  <Route path="exams/:examId" element={<Exams />} />
                  <Route path="homework" element={<Homework />} />
                  <Route path="homework/:homeworkId" element={<Homework />} />
                  <Route path="documents" element={<Documents />} />

                  {/* Timetable Routes — specific sub-paths must come before :sectionId */}
                  <Route path="timetable" element={<Timetable />} />
                  <Route
                    path="timetable/settings"
                    element={<Protected adminOnly><TimetableSettings /></Protected>}
                  />
                  <Route
                    path="timetable/grid"
                    element={<Protected roles={['admin', 'teacher']}><TimetableGridPage /></Protected>}
                  />
                  <Route path="timetable/:sectionId" element={<TimetableGridPage />} />

                  <Route path="fees" element={<Fees />} />
                  <Route path="mcq" element={<Protected roles={['admin', 'teacher', 'student']}><Mcq /></Protected>} />
                  <Route path="mcq/:examId" element={<Protected roles={['admin', 'teacher', 'student']}><Mcq /></Protected>} />
                  <Route path="mcq/:examId/take" element={<Protected roles={['student']}><TakeMcq /></Protected>} />
                  <Route path="mcq/:examId/attempts" element={<Protected roles={['admin', 'teacher']}><McqAttempts /></Protected>} />

                  <Route path="my-results" element={<Protected roles={['student']}><MyResults /></Protected>} />
                  <Route path="students/:studentId/report-card" element={<ReportCard />} />
                  <Route path="library" element={<Library />} />
                  <Route path="notices" element={<Notices />} />
                  <Route path="notices/:noticeId" element={<Notices />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="settings" element={<Protected adminOnly><Settings /></Protected>} />
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

