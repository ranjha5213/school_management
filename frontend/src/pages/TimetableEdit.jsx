import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, X, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function TimetableEdit() {
  const navigate = useNavigate();
  const [day, setDay] = useState('monday');
  const [data, setData] = useState({ periods: [], sections: [], teacherLoad: [] });
  const [draft, setDraft] = useState({});
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get('/timetable/grid', { params: { day } }),
      api.get('/subjects'),
      api.get('/teachers'),
    ]).then(([gridRes, subRes, tchRes]) => {
      if (cancelled) return;
      const grid = gridRes.data.data;
      setData(grid);

      // Normalize subject/teacher lists — API may return different shapes
      const subList = subRes.data?.data || subRes.data || [];
      const tchList = tchRes.data?.data || tchRes.data || [];
      setSubjects(Array.isArray(subList) ? subList : []);
      setTeachers(Array.isArray(tchList) ? tchList : []);

      // Seed draft from current grid
      const d = {};
      for (const sec of grid.sections) {
        for (const p of grid.periods) {
          const slot = sec.periods[p.start];
          if (slot) {
            d[`${sec.sectionId}:${p.start}`] = {
              subjectId: slot.subjectId || '',
              teacherId: slot.teacherId || '',
            };
          }
        }
      }
      setDraft(d);
    }).catch(() => toast.error('Failed to load'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [day]);

  const updateCell = (sectionId, start, field, value) => {
    setDraft((prev) => {
      const key = `${sectionId}:${start}`;
      const current = prev[key] || {};
      return { ...prev, [key]: { ...current, [field]: value } };
    });
  };

  // Live teacher load from draft
  const liveTeacherLoad = useMemo(() => {
    const counts = {};
    for (const slot of Object.values(draft)) {
      if (slot.teacherId) {
        counts[slot.teacherId] = (counts[slot.teacherId] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([id, count]) => {
        const t = teachers.find((t) => String(t.id) === String(id));
        return {
          teacherId: Number(id),
          teacherName: t?.name || `#${id}`,
          periods: count,
        };
      })
      .sort((a, b) => b.periods - a.periods);
  }, [draft, teachers]);

  const saveAll = async () => {
    setSaving(true);
    try {
      const entries = [];
      for (const sec of data.sections) {
        for (const p of data.periods) {
          const key = `${sec.sectionId}:${p.start}`;
          const val = draft[key];
          entries.push({
            section_id: sec.sectionId,
            day_of_week: day,
            start_time: p.start,
            end_time: p.end,
            subject_id: val?.subjectId ? Number(val.subjectId) : null,
            teacher_id: val?.teacherId ? Number(val.teacherId) : null,
          });
        }
      }
      const res = await api.post('/timetable/bulk-edit', { day, entries });
      const r = res.data?.data || {};
      toast.success(
        `Saved — ${r.inserted || 0} new, ${r.updated || 0} updated, ${r.deleted || 0} cleared`
      );
      navigate('/timetable/view');
    } catch (e) {
      toast.error(e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Edit Timetable</h1>
        <div className="flex items-center gap-2">
          <select value={day} onChange={(e) => setDay(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-900 px-3 py-1.5 text-sm capitalize">
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => navigate('/timetable/view')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       bg-slate-100 dark:bg-slate-800 text-sm">
            <X className="w-4 h-4" /> Cancel
          </button>
          <button onClick={saveAll} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       bg-green-600 text-white text-sm hover:bg-green-700
                       disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </div>

      {/* Live teacher load */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {liveTeacherLoad.slice(0, 8).map((t) => (
          <div key={t.teacherId}
            className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> {t.teacherName}
            </div>
            <div className="text-lg font-bold">{t.periods}</div>
            <div className="text-xs text-slate-400">periods</div>
          </div>
        ))}
        {liveTeacherLoad.length === 0 && (
          <div className="col-span-2 sm:col-span-4 text-xs text-slate-500">
            No teacher assigned yet — pick a teacher for any cell below to see live counts.
          </div>
        )}
      </div>

      {/* Editable grid */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 bg-slate-50 dark:bg-slate-800/50 z-10">
                  Section
                </th>
                {data.periods.map((p) => (
                  <th key={p.start} className="text-left px-3 py-2 min-w-[180px]">
                    <div className="text-xs text-slate-500">{p.label}</div>
                    <div className="font-mono text-xs text-slate-400">
                      {p.start}–{p.end}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((sec) => (
                <tr key={sec.sectionId}
                  className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-white dark:bg-slate-900">
                    {sec.className} — {sec.sectionName}
                  </td>
                  {data.periods.map((p) => {
                    const key = `${sec.sectionId}:${p.start}`;
                    const val = draft[key] || {};
                    return (
                      <td key={p.start} className="px-2 py-2">
                        <div className="space-y-1">
                          <select value={val.subjectId || ''}
                            onChange={(e) => updateCell(sec.sectionId, p.start, 'subjectId', e.target.value)}
                            className="w-full rounded border border-slate-200 dark:border-slate-700
                                       bg-white dark:bg-slate-900 px-1.5 py-1 text-xs">
                            <option value="">—</option>
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>{s.subject_name}</option>
                            ))}
                          </select>
                          <select value={val.teacherId || ''}
                            onChange={(e) => updateCell(sec.sectionId, p.start, 'teacherId', e.target.value)}
                            className="w-full rounded border border-slate-200 dark:border-slate-700
                                       bg-white dark:bg-slate-900 px-1.5 py-1 text-xs">
                            <option value="">—</option>
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
