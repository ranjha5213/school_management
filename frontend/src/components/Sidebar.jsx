import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  LayoutDashboard, CalendarCheck, Users, GraduationCap, BookOpen,
  FileText, DollarSign, Library as LibraryIcon, ClipboardList, Bell, User,
  School, UserCheck, Award, Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const NAV_BY_ROLE = {
  admin: [
    { to: '/dashboard',      label: 'Dashboard',     icon: LayoutDashboard },
    { to: '/pending-users',  label: 'Pending Users', icon: UserCheck },
    { to: '/classes',        label: 'Classes',       icon: School },
    { to: '/students',       label: 'Students',      icon: Users },
    { to: '/teachers',       label: 'Teachers',      icon: GraduationCap },
    { to: '/attendance',     label: 'Attendance',    icon: CalendarCheck },
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
    { to: '/attendance',     label: 'Attendance',    icon: CalendarCheck },
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

  const nav = NAV_BY_ROLE[user?.role] || NAV_BY_ROLE.student;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
      isActive
        ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
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
