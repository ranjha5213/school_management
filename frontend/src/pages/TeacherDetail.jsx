import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Hash, Clock, ClipboardList } from 'lucide-react';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { teachersApi } from '../api/endpoints';

export default function TeacherDetail() {
  const { teacherId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    teachersApi.overview(teacherId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [teacherId]);

  if (loading) return <Loader />;
  if (!data?.profile) return <Card><Empty title="Teacher not found" /></Card>;

  const { profile, sections, timetable, homework, attendanceMarked } = data;

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav(-1)} className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-100 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <Avatar src={profile.avatar_url} name={profile.name} size={56} />
          <div>
            <h2 className="text-lg font-semibold">{profile.name}</h2>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{profile.email}</span>
              <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{profile.employee_code}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Sections Handled</h3>
          {!sections?.length ? <div className="text-sm text-slate-500">None assigned</div> : (
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => (
                <span key={s.section_id} className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                  {s.class_name} — {s.section_name}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Attendance Marked (last 60 days)
          </h3>
          {!attendanceMarked?.length ? <div className="text-sm text-slate-500">No records</div> : (
            <div className="max-h-64 overflow-auto divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
              {attendanceMarked.map((r) => (
                <div key={r.date} className="py-1.5 flex justify-between text-sm">
                  <span className="font-mono text-xs">{r.date}</span>
                  <span className="text-slate-500">{r.present}P · {r.absent}A · {r.total} total</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3">Timetable</h3>
          {!timetable?.length ? <div className="text-sm text-slate-500">No timetable</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left p-2">Day</th>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Subject</th>
                    <th className="text-left p-2">Class · Section</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                  {timetable.map((t) => (
                    <tr key={t.id}>
                      <td className="p-2">{t.day_of_week}</td>
                      <td className="p-2 font-mono text-xs">{t.start_time}–{t.end_time}</td>
                      <td className="p-2">{t.subject_name}</td>
                      <td className="p-2">{t.class_name} · {t.section_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Homework Posted
          </h3>
          {!homework?.length ? <div className="text-sm text-slate-500">None</div> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
              {homework.map((h) => (
                <div key={h.id} className="py-2">
                  <div className="font-medium text-sm">{h.title}</div>
                  <div className="text-xs text-slate-500">
                    {h.subject_name} · {h.class_name} · due {h.due_date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
