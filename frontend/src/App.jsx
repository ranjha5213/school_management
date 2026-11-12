import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useState } from 'react'; // 👈 Added useState
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';

// Components
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

// Pages
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
import SchoolTimetable from './pages/SchoolTimetable';
import Fees from './pages/Fees';
import Mcq from './pages/Mcq';
import TakeMcq from './pages/TakeMcq';
import McqAttempts from './pages/McqAttempts';
import MyResults from './pages/MyResults';
import ReportCard from './pages/ReportCard';
import Library from './pages/Library';
import Notices from './pages/Notices';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

// Attendance drill-down
import AttendanceOverview from './pages/AttendanceOverview';
import SectionDetail from './pages/SectionDetail';
import StudentAttendanceHistory from './pages/StudentAttendanceHistory';
import MyAttendance from './pages/MyAttendance';

// Timetable drill-down
import TimetableView from './pages/TimetableView';
import TimetableEdit from './pages/TimetableEdit';
import TimetableAdd from './pages/TimetableAdd';

function Protected({ children, adminOnly = false, roles = null }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

// 👇 Replaces the missing Layout.jsx AND handles mobile menu state
function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden print:block print:h-auto print:overflow-visible">
      
      {/* Sidebar (Hidden on Print) */}
      <div className="print:hidden flex shrink-0">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        
        {/* Topbar (Hidden on Print) - Passes the click handler */}
        <div className="print:hidden">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
        </div>

        {/* Main Content */}
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
                  <Route path="students" element={<Students />} />
                  <Route path="students/:studentId" element={<StudentDetail />} />
                  <Route path="teachers" element={<Teachers />} />
                  <Route path="teachers/:teacherId" element={<TeacherDetail />} />

                  <Route path="attendance" element={<Attendance />} />

                  <Route
                    path="attendance/view"
                    element={<Protected roles={['admin', 'teacher']}><AttendanceOverview /></Protected>}
                  />
                  <Route
                    path="attendance/section/:sectionId"
                    element={<Protected roles={['admin', 'teacher']}><SectionDetail /></Protected>}
                  />
                  <Route
                    path="attendance/student/:studentId"
                    element={<Protected roles={['admin', 'teacher']}><StudentAttendanceHistory /></Protected>}
                  />
                  <Route
                    path="my-attendance"
                    element={<Protected roles={['student']}><MyAttendance /></Protected>}
                  />

                  <Route path="exams" element={<Exams />} />
                  <Route path="exams/:examId" element={<Exams />} />
                  <Route path="homework" element={<Homework />} />
                  <Route path="homework/:homeworkId" element={<Homework />} />

                  <Route path="timetable" element={<Timetable />} />
                  <Route
                    path="timetable/school"
                    element={<Protected roles={['admin']}><SchoolTimetable /></Protected>}
                  />
                  <Route path="timetable/:sectionId" element={<Timetable />} />

                  <Route
                    path="timetable/view"
                    element={<Protected roles={['admin', 'teacher']}><TimetableView /></Protected>}
                  />
                  <Route
                    path="timetable/add"
                    element={<Protected roles={['admin']}><TimetableAdd /></Protected>}
                  />
                  <Route
                    path="timetable/edit"
                    element={<Protected roles={['admin']}><TimetableEdit /></Protected>}
                  />

                  <Route path="fees" element={<Fees />} />
                  <Route path="mcq" element={<Protected roles={['admin', 'teacher', 'student']}><Mcq /></Protected>} />
                  <Route path="mcq/:examId" element={<Protected roles={['admin', 'teacher', 'student']}><Mcq /></Protected>} />
                  <Route
                    path="mcq/:examId/take"
                    element={<Protected roles={['student']}><TakeMcq /></Protected>}
                  />
                  <Route
                    path="mcq/:examId/attempts"
                    element={<Protected roles={['admin', 'teacher']}><McqAttempts /></Protected>}
                  />
                  <Route
                    path="my-results"
                    element={<Protected roles={['student']}><MyResults /></Protected>}
                  />
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
