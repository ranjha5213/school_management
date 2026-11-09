import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api/client';

const fmtMonth = (d) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const iso = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dotColor = { present: 'bg-emerald-500', absent: 'bg-rose-500', leave: 'bg-amber-500' };

export default function StudentAttendanceHistory() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const fromSection = search.get('sectionId');

  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const isCurrentOrFuture = () => {
    const now = new Date();
    return month.getFullYear() > now.getFullYear() ||
      (month.getFullYear() === now.getFullYear() && month.getMonth() >= now.getMonth());
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const from = iso(month);
    const to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    api.get(`/attendance/student/${studentId}`, { params: { from, to } })
      .then(({ data }) => {
        if (cancelled) return;
        // Response: { success, message, data: [ { date, status, ... } ] }
        setRecords(Array.isArray(data?.data) ? data.data : []);
      })
      .catch(() => { if (!cancelled) setRecords([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId, month]);

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, leave: 0 };
    for (const r of records) s[r.status] = (s[r.status] || 0) + 1;
    return s;
  }, [records]);

  const grid = useMemo(() => {
    const byDay = new Map();
    for (const r of records) {
      const d = new Date(r.date + 'T00:00:00');
      byDay.set(d.getDate(), r.status);
    }
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const startWeekday = first.getDay();
    const totalDays = daysInMonth(month);
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) {
      cells.push({ day: d, status: byDay.get(d) || null });
    }
    return cells;
  }, [records, month]);

  return (
    <div className="p-6 space-y-4">
      <button
        onClick={() => fromSection
          ? navigate(`/attendance/section/${fromSection}`)
          : navigate('/attendance/view')}
        className="inline-flex items-center gap-1 text-sm text-slate-600
                   dark:text-slate-300 hover:text-brand-600">
        <ChevronLeft className="w-4 h-4" />
        {fromSection ? 'Back to section' : 'All Sections'}
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Attendance History — Student #{studentId}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(m => addMonths(m, -1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[140px] text-center">{fmtMonth(month)}</span>
          <button onClick={() => setMonth(m => addMonths(m, +1))}
            disabled={isCurrentOrFuture()}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800
                       disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-sm flex-wrap">
        <Pill color="bg-emerald-500" label="Present"  value={summary.present} />
        <Pill color="bg-rose-500"    label="Absent"   value={summary.absent} />
        <Pill color="bg-amber-500"   label="On Leave" value={summary.leave} />
      </div>

      {loading ? <p className="text-slate-500 text-sm">Loading…</p> : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="grid grid-cols-7 text-center text-xs text-slate-500 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, i) => (
              <div key={i} className="aspect-square flex items-center justify-center">
                {cell && (
                  <div className={`relative w-9 h-9 rounded-lg flex items-center justify-center text-sm
                    ${cell.status ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}
                    title={cell.status || 'unmarked'}>
                    {cell.day}
                    {cell.status && (
                      <span className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${dotColor[cell.status]}`} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ color, label, value }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                    bg-slate-50 dark:bg-slate-800/60">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
