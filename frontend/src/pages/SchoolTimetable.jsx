import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { timetableApi } from '../api/endpoints';

const ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function SchoolTimetable() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    timetableApi.school()
      .then((d) => setRows(Array.isArray(d) ? d : (d?.data || [])))
      .catch((e) => { toast.error(e.message); setRows([]); });
  }, []);

  const grouped = useMemo(() => {
    if (!rows) return [];
    const byClass = {};
    for (const r of rows) {
      const key = `${r.class_name} / ${r.section_name || '—'}`;
      if (!byClass[key]) byClass[key] = [];
      byClass[key].push(r);
    }
    return Object.entries(byClass).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  if (rows === null) return <Loader />;
  if (!rows.length)  return <Empty title="No timetable slots yet" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-sm text-slate-500 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-lg font-semibold">School Timetable</h1>
      </div>

      {grouped.map(([label, slots]) => (
        <Card key={label} className="p-4">
          <h3 className="font-semibold mb-2">{label}</h3>
          {ORDER.map((day) => {
            const daySlots = slots
              .filter((s) => String(s.day_of_week).toLowerCase() === day.toLowerCase())
              .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
            if (!daySlots.length) return null;
            return (
              <div key={day} className="mb-3 last:mb-0">
                <div className="text-xs font-medium uppercase text-slate-400 mb-1">{day}</div>
                <ul className="space-y-0.5 text-sm">
                  {daySlots.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>{String(s.start_time).slice(0,5)}–{String(s.end_time).slice(0,5)} · {s.subject_name || '—'}</span>
                      <span className="text-slate-500">{s.teacher_name || 'Unassigned'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}
