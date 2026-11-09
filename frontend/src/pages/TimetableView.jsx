import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Users } from 'lucide-react';
import api from '../api/client';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function TimetableView() {
  const navigate = useNavigate();
  const [day, setDay] = useState('monday');
  const [data, setData] = useState({ periods: [], sections: [], teacherLoad: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/timetable/grid', { params: { day } })
      .then(({ data }) => { if (!cancelled) setData(data.data); })
      .catch(() => { if (!cancelled) setData({ periods: [], sections: [], teacherLoad: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [day]);

  const rows = useMemo(() => {
    return data.sections.map((sec) => {
      const filled = data.periods.filter((p) => sec.periods[p.start]).length;
      const isFull = data.periods.length > 0 && filled === data.periods.length;
      return { ...sec, filled, isFull };
    });
  }, [data]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Timetable Overview</h1>
        <div className="flex items-center gap-2">
          <select value={day} onChange={(e) => setDay(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-900 px-3 py-1.5 text-sm capitalize">
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => navigate('/timetable/add')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       bg-brand-600 text-white text-sm hover:bg-brand-700">
            <Plus className="w-4 h-4" /> Add
          </button>
          <button onClick={() => navigate('/timetable/edit')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       bg-slate-100 dark:bg-slate-800 text-sm hover:bg-slate-200">
            <Pencil className="w-4 h-4" /> Edit
          </button>
        </div>
      </div>

      {data.teacherLoad.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.teacherLoad.slice(0, 8).map((t) => (
            <div key={t.teacherId}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3" /> {t.teacherName}
              </div>
              <div className="text-lg font-bold">{t.periods}</div>
              <div className="text-xs text-slate-400">periods on {day}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : data.periods.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-500">No timetable defined for {day}.</p>
          <button onClick={() => navigate('/timetable/add')}
            className="mt-3 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm">
            Add first slot
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-slate-50 dark:bg-slate-800/50 z-10">
                    Section
                  </th>
                  {data.periods.map((p) => (
                    <th key={p.start} className="text-left px-3 py-2 min-w-[140px]">
                      <div className="text-xs text-slate-500">{p.label}</div>
                      <div className="font-mono text-xs text-slate-400">
                        {p.start}–{p.end}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((sec) => (
                  <tr key={sec.sectionId}
                    className={`border-t border-slate-100 dark:border-slate-800 ${
                      sec.isFull ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : ''
                    }`}>
                    <td className="px-3 py-2 font-medium sticky left-0 bg-white dark:bg-slate-900">
                      {sec.className} — {sec.sectionName}
                      {sec.isFull && (
                        <span className="ml-2 text-xs text-emerald-600">✓ Full</span>
                      )}
                    </td>
                    {data.periods.map((p) => {
                      const slot = sec.periods[p.start];
                      return (
                        <td key={p.start} className="px-3 py-2 text-xs">
                          {slot ? (
                            <div>
                              <div className="font-medium">{slot.subjectName}</div>
                              <div className="text-slate-500">{slot.teacherName || '—'}</div>
                            </div>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
