import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, School, CalendarCheck, DollarSign, ClipboardList,
  BookOpen, Bell, TrendingUp, AlertCircle, CheckCircle2,
} from 'lucide-react';
import Card from '../components/Card';
import Loader from '../components/Loader';
import {
  classesApi, reportsApi, feesApi, noticesApi, attendanceApi,
} from '../api/endpoints';

export default function Dashboard() {
  const nav = useNavigate();
  const [classes, setClasses] = useState([]);
  const [stats, setStats] = useState(null);
  const [feeSummary, setFeeSummary] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [inbox, setInbox] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      classesApi.list().catch(() => []),
      reportsApi.dashboard().catch(() => null),
      feesApi.summary().catch(() => null),
      noticesApi.inbox().catch(() => null),
    ]).then(([c, s, f, n]) => {
      setClasses(Array.isArray(c) ? c : []);
      setStats(s);
      setFeeSummary(f);
      setInbox(n);
      setTodayAttendance(s?.attendanceToday);
    }).finally(() => setLoading(false));
  }, []);

  const tiles = [
    { label: 'Students',     value: stats?.students ?? '—',    icon: Users,        to: '/students',   color: 'from-green-500' },
    { label: 'Teachers',     value: stats?.teachers ?? '—',    icon: GraduationCap,to: '/teachers',   color: 'from-amber-500' },
    { label: 'Classes',      value: stats?.classes ?? '—',     icon: School,       to: '/classes',    color: 'from-blue-500' },
    { label: 'Sections',     value: stats?.sections ?? '—',    icon: School,       to: '/classes',    color: 'from-purple-500' },
    { label: 'Attendance',   value: todayAttendance?.total ?? '—', icon: CalendarCheck, to: '/attendance', color: 'from-red-500' },
    { label: 'Homework',     value: 'Open',                    icon: ClipboardList,to: '/homework',   color: 'from-teal-500' },
    { label: 'Timetable',    value: 'Open',                    icon: BookOpen,     to: '/timetable',  color: 'from-indigo-500' },
    { label: 'Notices',      value: inbox?.unread_count ?? 0,  icon: Bell,         to: '/notices',    color: 'from-pink-500' },
  ];

  if (loading) return <Loader />;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ─── Stat tiles ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.label}
              onClick={() => nav(t.to)}
              className="group relative overflow-hidden text-left p-4 rounded-2xl bg-white dark:bg-slate-900 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:border-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.color} to-transparent opacity-70`} />
              <div className="flex items-center justify-between">
                <Icon className="w-5 h-5 text-brand-600" />
                <span className="text-2xl font-bold">{t.value}</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">{t.label}</div>
            </button>
          );
        })}
      </div>

      {/* ─── Attendance snapshot ─── */}
      {todayAttendance && todayAttendance.total > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" /> Today's Attendance
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300">
              <div className="text-xs uppercase flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Present
              </div>
              <div className="text-2xl font-bold">{todayAttendance.present || 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300">
              <div className="text-xs uppercase flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Absent
              </div>
              <div className="text-2xl font-bold">{todayAttendance.absent || 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="text-xs uppercase">Total Marked</div>
              <div className="text-2xl font-bold">{todayAttendance.total || 0}</div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Fee snapshot ─── */}
      {feeSummary && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-brand-600" /> Fees Overview
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="text-xs uppercase text-slate-500">Invoices</div>
              <div className="text-lg font-bold">{feeSummary.total_invoices || 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">
              <div className="text-xs uppercase">Billed</div>
              <div className="text-lg font-bold">{Number(feeSummary.total_billed || 0).toFixed(0)}</div>
            </div>
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300">
              <div className="text-xs uppercase">Collected</div>
              <div className="text-lg font-bold">{Number(feeSummary.total_paid || 0).toFixed(0)}</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <div className="text-xs uppercase">Pending</div>
              <div className="text-lg font-bold">
                {Number((feeSummary.total_billed || 0) - (feeSummary.total_paid || 0)).toFixed(0)}
              </div>
            </div>
          </div>
          <button onClick={() => nav('/fees')} className="text-xs text-brand-600 hover:underline mt-3">
            Manage fees →
          </button>
        </Card>
      )}

      {/* ─── Classes grid ─── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Classes</h3>
          <button onClick={() => nav('/classes')} className="text-xs text-brand-600 hover:underline">
            View all →
          </button>
        </div>
        {classes.length === 0 ? (
          <div className="text-sm text-slate-500">No classes yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => nav(`/classes/${c.id}`)}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800 text-left transition"
              >
                <div className="font-medium">{c.class_name}</div>
                <div className="text-xs text-slate-500">
                  {c.section_count} sections · {c.student_count} students
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
