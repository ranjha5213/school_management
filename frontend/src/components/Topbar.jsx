import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import SearchCombobox from './SearchCombobox';
import NoticeBell from './NoticeBell';
import Avatar from './Avatar';
import { LogOut, Moon, Sun, Menu, ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { connected } = useSocket();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const canGoBack = pathname !== '/dashboard' && pathname !== '/';

  return (
    <header className="h-14 bg-white dark:bg-slate-900 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 dark:border-slate-800 flex items-center gap-2 px-3 sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-800"
        title="Menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {canGoBack && (
        <button
          onClick={() => nav(-1)}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-800"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <SearchCombobox />
      </div>

      <NoticeBell />

      <button
        onClick={toggle}
        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-800"
        title="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <button
        onClick={() => nav('/profile')}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        title="Profile"
      >
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-300'}`}
              title={connected ? 'Live' : 'Offline'} />
        <Avatar src={user?.avatar_url} name={user?.name} size={28} />
        <span className="text-sm text-slate-600 dark:text-slate-300 hidden sm:inline">{user?.name}</span>
      </button>

      <button
        onClick={logout}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                   text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10
                   transition"
        title="Log out"
      >
        <LogOut className="w-4 h-4" />
        <span className="hidden sm:inline">Log out</span>
      </button>
    </header>
  );
}
