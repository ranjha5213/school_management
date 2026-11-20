// src/pages/Timetable.jsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { fmtTime } from '../components/TimetableGrid';
import { timetableApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function PersonalSchedule({ title, emptyHint, apiFn, metaFn }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFn()
      .then((d) => !cancelled && setRows(Array.isArray(d) ? d : d?.data || d?.slots || []))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [apiFn]);

  if (rows === null) return <Loader />;
  if (!rows.length) return <Empty title="Nothing scheduled yet" hint={emptyHint} />;

  const grouped = DAYS.map((day) => ({
    day,
    slots: rows
      .filter((r) => String(r.day_of_week || '').toLowerCase() === day.toLowerCase())
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
  })).filter((g) => g.slots.length);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      {grouped.map((g) => (
        <Card key={g.day} className="p-4">
          <h3 className="font-medium mb-2">{g.day}</h3>
          <ul className="space-y-1 text-sm">
            {g.slots.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>
                  {fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {s.subject_name || '—'}
                </span>
                <span className="text-slate-500">{metaFn(s)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default function Timetable() {
  const { user } = useAuth();
  if (!user) return <Loader />;

  if (user.role === 'student') {
    return (
      <PersonalSchedule
        title="My Timetable"
        emptyHint="Your class schedule will appear here once published."
        apiFn={timetableApi.my}
        metaFn={(s) => s.teacher_name || '—'}
      />
    );
  }

  if (user.role === 'teacher') {
    return (
      <PersonalSchedule
        title="My Teaching Schedule"
        emptyHint="Your periods will appear here once scheduled."
        apiFn={timetableApi.mySchedule}
        metaFn={(s) => `${s.class_name || '?'}/${s.section_name || '?'}`}
      />
    );
  }

  return <Navigate to="/timetable/grid" replace />;
}

