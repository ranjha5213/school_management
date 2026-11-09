import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { X, ChevronDown, ChevronRight, CheckSquare, Eye } from 'lucide-react';
import {
  LayoutDashboard, CalendarCheck, Users, GraduationCap, BookOpen,
  FileText, DollarSign, Library as LibraryIcon, ClipboardList, Bell, User,
  School, UserCheck, Award,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

// NOTE: `Attendance` is intentionally NOT in these arrays for admin/teacher —
// it's rendered as a collapsible submenu below. Students get `My Attendance`
// as a top-level link instead.
const NAV_BY_ROLE = {
  admin: [
    { to: '/dashboard',      label: 'Dashboard',     icon: LayoutDashboard },
    { to: '/pending-users',  label: 'Pending Users', icon: UserCheck },
    { to: '/classes',        label: 'Classes',       icon: School },
    { to: '/students',       label: 'Students',      icon: Users },
    { to: '/teachers',       label: 'Teachers',      icon: GraduationCap },
    // Attendance is rendered specially below (collapsible submenu)
    { to: '/exams',          label: 'Exams',         icon: FileText },
    { to: '/mcq',            label: 'MCQ Tests',     icon: FileText },
    { to: '/homework',       label: 'Homework',      icon: ClipboardList },
    { to: '/timetable',      label: 'Timetable',     icon: BookOpen },
    { to: '/fees',           label: 'Fees',          icon: DollarSign },
    { to: '/library',        label: 'Library',       icon: LibraryIcon },
    { to: '/notices',        label: 'Notices',       icon: Bell },
    { to: '/profile',        label: 'Profile',       icon: User },
  ],
  teacher: [
    { to: '/dashboard',      label: 'Dashboard',     icon: LayoutDashboard },
    { to: '/classes',        label: 'Classes',       icon: School },
    { to: '/students',       label: 'Students',      icon: Users },
    { to: '/teachers',       label: 'Teachers',      icon: GraduationCap },
    // Attendance is rendered specially below (collapsible submenu)
    { to: '/exams',          label: 'Exams',         icon: FileText },
    { to: '/mcq',            label: 'MCQ Tests',     icon: FileText },
    { to: '/homework',       label: 'Homework',      icon: ClipboardList },
    { to: '/timetable',      label: 'Timetable',     icon: BookOpen },
    { to: '/library',        label: 'Library',       icon: LibraryIcon },
    { to: '/notices',        label: 'Notices',       icon: Bell },
    { to: '/profile',        label: 'Profile',       icon: User },
  ],
  student: [
    { to: '/dashboard',      label: 'Dashboard',     icon: LayoutDashboard },
    { to: '/my-attendance',  label: 'My Attendance', icon: CalendarCheck },  // NEW
    { to: '/mcq',            label: 'My Tests',      icon: FileText },
    { to: '/my-results',     label: 'My Results',    icon: Award },
    { to: '/homework',       label: 'Homework',      icon: ClipboardList },
    { to: '/timetable',      label: 'Timetable',     icon: BookOpen },
    { to: '/notices',        label: 'Notices',       icon: Bell },
    { to: '/profile',        label: 'Profile',       icon: User },
  ],
  accountant: [
    { to: '/dashboard',      label: 'Dashboard',     icon: LayoutDashboard },
    { to: '/fees',           label: 'Fees',          icon: DollarSign },
    { to: '/notices',        label: 'Notices',       icon: Bell },
    { to: '/profile',        label: 'Profile',       icon: User },
  ],
};

export default function Sidebar({ mobileOpen = false, onClose = () => {} }) {
  const { user } = useAuth();
  const { school_name } = useSettings();
  const location = useLocation();

  const role = user?.role;
  const hasAttendanceMenu = role === 'admin' || role === 'teacher';

  // Auto-open the attendance submenu if we're already on an attendance route
  const [attendanceOpen, setAttendanceOpen] = useState(
    location.pathname.startsWith('/attendance')
  );

  const nav = NAV_BY_ROLE[role] || NAV_BY_ROLE.student;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
      isActive
        ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  const subLinkClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition ${
      isActive
        ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  const content = (
    <>
      <div className="px-3 py-4 font-bold text-brand-600 text-lg flex items-center justify-between">
        <span className="truncate max-w-[140px]" title={school_name}>{school_name}</span>
        <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <nav className="flex flex-col gap-0.5">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass} onClick={onClose}>
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}

        {/* Collapsible Attendance submenu — admin & teacher only */}
        {hasAttendanceMenu && (
          <div>
            <button
              type="button"
              onClick={() => setAttendanceOpen((v) => !v)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                location.pathname.startsWith('/attendance')
                  ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <CalendarCheck className="w-4 h-4" />
                Attendance
              </span>
              {attendanceOpen
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />}
            </button>

            {attendanceOpen && (
              <div className="ml-5 mt-0.5 pl-2 border-l border-slate-200 dark:border-slate-800 flex flex-col gap-0.5">
                <NavLink to="/attendance/view" className={subLinkClass} onClick={onClose}>
                  <Eye className="w-3.5 h-3.5" /> View Attendance
                </NavLink>
                <NavLink to="/attendance" className={subLinkClass} onClick={onClose}>
                  <CheckSquare className="w-3.5 h-3.5" /> Mark Attendance
                </NavLink>
              </div>
            )}
          </div>
        )}
      </nav>
    </>
  );

  return (
    <>
      <aside className="w-56 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 min-h-screen p-3 hidden md:block">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="relative w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-3 overflow-y-auto">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
