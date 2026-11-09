import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api/client';

const todayISO = () => new Date().toISOString().slice(0, 10);
const shiftDate = (iso, days) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function AttendanceOverview() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/attendance/overview', { params: { date } })
      .then(({ data }) => {
        if (cancelled) return;
        setSections(data?.data?.sections || []);
      })
      .catch(() => { if (!cancelled) setSections([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const totalUnmarked = sections.reduce((sum, s) => sum + (s.unmarked || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Attendance Overview</h1>

        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => shiftDate(d, -1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-900 px-3 py-1.5 text-sm" />
          <button onClick={() => setDate(d => shiftDate(d, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setDate(todayISO())}
            className="px-3 py-1.5 rounded-lg text-sm bg-brand-50 dark:bg-brand-500/10
                       text-brand-700 dark:text-brand-300 hover:bg-brand-100">
            Today
          </button>
        </div>
      </div>

      {totalUnmarked > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200
                        dark:border-amber-500/30 rounded-lg p-3 text-amber-800
                        dark:text-amber-300 text-sm">
          ⚠️ {totalUnmarked} student{totalUnmarked === 1 ? '' : 's'} across{' '}
          {sections.filter(s => s.unmarked > 0).length} section(s) haven't been marked.
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-4 py-2">Section</th>
                <th className="text-right px-4 py-2 text-emerald-600">Present</th>
                <th className="text-right px-4 py-2 text-rose-600">Absent</th>
                <th className="text-right px-4 py-2 text-amber-600">On Leave</th>
                <th className="text-right px-4 py-2">Unmarked</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.sectionId}
                  onClick={() => navigate(`/attendance/section/${s.sectionId}?date=${date}`)}
                  className="border-t border-slate-100 dark:border-slate-800
                             hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                  <td className="px-4 py-2 font-medium">{s.className} — {s.sectionName}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">{s.present}</td>
                  <td className="px-4 py-2 text-right text-rose-600">{s.absent}</td>
                  <td className="px-4 py-2 text-right text-amber-600">{s.onLeave}</td>
                  <td className={`px-4 py-2 text-right font-medium ${
                    s.unmarked > 0 ? 'text-rose-600' : 'text-slate-400'
                  }`}>{s.unmarked}</td>
                  <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300 font-semibold">
                    {s.total}
                  </td>
                  <td className="pr-2 text-slate-400"><ChevronRight className="w-4 h-4" /></td>
                </tr>
              ))}
              {sections.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  No sections found.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
