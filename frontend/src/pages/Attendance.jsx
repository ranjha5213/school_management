import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck, Save, CheckCircle2, XCircle, Clock, AlertCircle,
  Users, BookOpen, Layers, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import Empty from '../components/Empty';
import { attendanceApi, studentsApi, classesApi } from '../api/endpoints';
import { useSocket } from '../context/SocketContext';

const STATUSES = [
  { id: 'present', label: 'Present', color: 'green',  icon: CheckCircle2 },
  { id: 'absent',  label: 'Absent',  color: 'red',    icon: XCircle },
  { id: 'late',    label: 'Late',    color: 'yellow', icon: Clock },
  { id: 'excused', label: 'Excused', color: 'gray',   icon: AlertCircle },
];

const chipActiveClass = {
  green:  'bg-green-100 text-green-700 ring-2 ring-green-500 dark:bg-green-500/20 dark:text-green-300',
  red:    'bg-red-100 text-red-700 ring-2 ring-red-500 dark:bg-red-500/20 dark:text-red-300',
  yellow: 'bg-amber-100 text-amber-700 ring-2 ring-amber-500 dark:bg-amber-500/20 dark:text-amber-300',
  gray:   'bg-slate-200 text-slate-700 ring-2 ring-slate-500 dark:bg-slate-600/40 dark:text-slate-300',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(todayISO());

  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState({});
  const [lock, setLock] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { socket } = useSocket();

  // ─── Live section subscription ───
  useEffect(() => {
    if (!socket || !sectionId) return;
    socket.emit('subscribe:section', Number(sectionId));
    return () => socket.emit('unsubscribe:section', Number(sectionId));
  }, [socket, sectionId]);

  useEffect(() => {
    if (!socket) return;
    const onMarked = (p) => {
      if (String(p.section_id) === String(sectionId) && p.date === date) {
        toast(`Attendance was submitted by ${p.marked_by_name || 'user'}`, { icon: '🔒' });
        if (typeof loadGrid === 'function') loadGrid();
      }
    };
    socket.on('attendance:marked', onMarked);
    return () => socket.off('attendance:marked', onMarked);
  }, [socket, sectionId, date]);

  const locked = !!lock;

  useEffect(() => {
    (async () => {
      setLoadingClasses(true);
      try {
        const data = await classesApi.list();
        setClasses(Array.isArray(data) ? data : []);
      } catch (e) { toast.error(e.message); }
      finally { setLoadingClasses(false); }
    })();
  }, []);

  useEffect(() => {
    if (!classId) { setSections([]); setSectionId(''); return; }
    (async () => {
      setLoadingSections(true);
      setSectionId('');
      try {
        const data = await classesApi.sections(classId);
        const list = Array.isArray(data) ? data : [];
        setSections(list);
        if (list.length === 1) setSectionId(String(list[0].id));
      } catch (e) { toast.error(e.message); }
      finally { setLoadingSections(false); }
    })();
  }, [classId]);

  const loadGrid = async () => {
    if (!classId || !sectionId) return toast.error('Select class and section');
    if (date !== todayISO()) return toast.error('Attendance can only be marked for today');

    setLoadingStudents(true);
    setLoaded(false);
    setLock(null);
    try {
      const [s, a] = await Promise.all([
        studentsApi.byClassSection(classId, sectionId),
        attendanceApi.byDate(date, sectionId).catch(() => ({ records: [], lock: null })),
      ]);

      const list = Array.isArray(s) ? s : [];
      setStudents(list);

      const serverRecords = a?.records || [];
      const existing = {};
      serverRecords.forEach((r) => { existing[r.student_id] = r.status; });

      const initial = {};
      list.forEach((st) => { initial[st.id] = existing[st.id] || 'present'; });
      setRecords(initial);
      setLock(a?.lock || null);

      setLoaded(true);
      if (!list.length) toast('No students in this section yet');
      else if (a?.lock) toast(`Loaded — locked by ${a.lock.marked_by_name || 'user'} at ${a.lock.marked_at}`);
      else toast.success(`Loaded ${list.length} students`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingStudents(false);
    }
  };

  const setStatus = (id, status) => {
    if (locked) return toast.error('Attendance is locked. Only remarks can be edited.');
    setRecords((r) => ({ ...r, [id]: status }));
  };

  const markAll = (status) => {
    if (locked) return toast.error('Attendance is locked.');
    const next = {};
    students.forEach((st) => { next[st.id] = status; });
    setRecords(next);
    toast.success(`All marked ${status}`);
  };

  const saveAll = async () => {
    if (!students.length) return toast.error('Nothing to save');
    if (date !== todayISO()) return toast.error('Can only mark today');
    const missing = students.filter((s) => !records[s.id]);
    if (missing.length) return toast.error(`${missing.length} student(s) unmarked`);

    setSaving(true);
    try {
      const payload = students.map((s) => ({
        student_id: s.id,
        date,
        status: records[s.id],
      }));
      await attendanceApi.bulk(payload, sectionId);
      toast.success(`Saved ${payload.length} records`);
      await loadGrid();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    Object.values(records).forEach((v) => { if (c[v] !== undefined) c[v]++; });
    return c;
  }, [records]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-brand-600" /> Mark Attendance
          {locked && (
            <span className="badge badge-gray ml-auto flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {lock.marked_by_name || 'user'} · {lock.marked_at}
            </span>
          )}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" /> Class
            </label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input" disabled={loadingClasses}>
              <option value="">{loadingClasses ? 'Loading…' : 'Select class'}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.class_name}{c.class_code ? ` (${c.class_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> Section
            </label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input" disabled={!classId || loadingSections}>
              <option value="">
                {!classId ? 'Select class first'
                  : loadingSections ? 'Loading…'
                  : sections.length ? 'Select section'
                  : 'No sections'}
              </option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.section_name}</option>
              ))}
            </select>
          </div>

          <Input
            label="Date"
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />

          <div className="flex items-end">
            <Button onClick={loadGrid} icon={Users} className="w-full" disabled={!classId || !sectionId || loadingStudents} loading={loadingStudents}>
              Load Students
            </Button>
          </div>
        </div>
      </Card>

      {!loaded ? (
        <Card><Empty title="No attendance loaded" hint="Pick a class, section, and date, then click Load Students" /></Card>
      ) : students.length === 0 ? (
        <Card><Empty title="No students in this section" /></Card>
      ) : (
        <>
          {!locked && (
            <div className="flex flex-wrap gap-2 items-center">
              <Button size="sm" variant="secondary" onClick={() => markAll('present')}>All Present</Button>
              <Button size="sm" variant="secondary" onClick={() => markAll('absent')}>All Absent</Button>
              <Button size="sm" variant="secondary" onClick={() => markAll('late')}>All Late</Button>
              <Button size="sm" variant="secondary" onClick={() => markAll('excused')}>All Excused</Button>
              <div className="flex-1" />
              <Button onClick={saveAll} loading={saving} icon={Save} className="bg-green-600 hover:bg-green-700">
                Save Attendance
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUSES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl ${counts[s.id] ? chipActiveClass[s.color] : 'bg-slate-50 dark:bg-slate-800 text-slate-500'}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium capitalize">{s.label}</span>
                  </div>
                  <span className="text-lg font-bold">{counts[s.id]}</span>
                </div>
              );
            })}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left p-3 w-12">#</th>
                    <th className="text-left p-3">Admission #</th>
                    <th className="text-left p-3">Roll</th>
                    <th className="text-left p-3">Student</th>
                    <th className="text-center p-3">Mark Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                  {students.map((s, i) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 text-slate-500">{i + 1}</td>
                      <td className="p-3 font-mono text-xs">{s.admission_number}</td>
                      <td className="p-3 text-slate-500">{s.roll_number || '—'}</td>
                      <td className="p-3 font-medium">{s.student_name}</td>
                      <td className="p-3">
                        <div className="flex justify-center gap-1.5 flex-wrap">
                          {STATUSES.map((st) => {
                            const Icon = st.icon;
                            const active = records[s.id] === st.id;
                            return (
                              <button
                                key={st.id}
                                type="button"
                                disabled={locked}
                                onClick={() => setStatus(s.id, st.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                                  active ? chipActiveClass[st.color]
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'
                                } ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{st.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {!locked && (
            <div className="flex justify-end">
              <Button onClick={saveAll} loading={saving} icon={Save} className="bg-green-600 hover:bg-green-700">
                Save Attendance ({students.length})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
