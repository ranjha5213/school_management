import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api/client';

const todayISO = () => new Date().toISOString().slice(0, 10);
const shiftDate = (iso, days) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const badge = {
  present: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  absent:  'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
  leave:   'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  unmarked:'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export default function SectionDetail() {
  const { sectionId } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [date, setDate] = useState(search.get('date') || todayISO());
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/attendance/section/${sectionId}`, { params: { date } })
      .then(({ data }) => {
        if (cancelled) return;
        setStudents(data?.data?.students || []);
      })
      .catch(() => { if (!cancelled) setStudents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sectionId, date]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return students;
    return students.filter(s =>
      s.name?.toLowerCase().includes(needle) ||
      String(s.rollNumber || '').toLowerCase().includes(needle)
    );
  }, [students, q]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, leave: 0, unmarked: 0 };
    for (const s of students) c[s.status] = (c[s.status] || 0) + 1;
    return c;
  }, [students]);

  return (
    <div className="p-6 space-y-4">
      <button onClick={() => navigate('/attendance/view')}
        className="inline-flex items-center gap-1 text-sm text-slate-600
                   dark:text-slate-300 hover:text-brand-600">
        <ChevronLeft className="w-4 h-4" /> All Sections
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Section {sectionId}</h1>
          <p className="text-sm text-slate-500">
            <span className="text-emerald-600 font-medium">{counts.present} present</span>
            {' · '}
            <span className="text-rose-600 font-medium">{counts.absent} absent</span>
            {' · '}
            <span className="text-amber-600 font-medium">{counts.leave} leave</span>
            {' · '}
            <span>{counts.unmarked} unmarked</span>
            {' of '}
            <span className="font-semibold">{students.length}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or roll…"
            className="rounded-lg border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-900 px-3 py-1.5 text-sm w-52" />
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
        </div>
      </div>

      {loading ? <p className="text-slate-500 text-sm">Loading…</p> : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-4 py-2">Roll</th>
                <th className="text-left px-4 py-2">Student</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.studentId}
                  onClick={() => navigate(
                    `/attendance/student/${s.studentId}?sectionId=${sectionId}`
                  )}
                  className="border-t border-slate-100 dark:border-slate-800
                             hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                  <td className="px-4 py-2 text-slate-500">{s.rollNumber ?? '—'}</td>
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium
                                      ${badge[s.status] || badge.unmarked}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="pr-2 text-slate-400"><ChevronRight className="w-4 h-4" /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  {q ? 'No students match your search.' : 'No students in this section.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
