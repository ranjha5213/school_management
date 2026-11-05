import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BookOpen, Plus, Pencil, Trash2, Calendar, Clock, User, Layers,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import TimetableModal from '../components/TimetableModal';
import { classesApi, timetableApi, teachersApi} from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function StudentTimetable() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    timetableApi.my()
      .then((d) => setRows(Array.isArray(d) ? d : (d?.slots || d?.data || [])))
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <Loader />;
  if (!rows.length)  return <Empty title="No timetable yet" hint="Your section's schedule will appear here once published." />;

  const ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const groups = ORDER.map((d) => ({
    day: d,
    slots: rows
      .filter((r) => String(r.day_of_week || '').toLowerCase() === d.toLowerCase())
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
  })).filter((g) => g.slots.length);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">My Timetable</h1>
      {groups.map((g) => (
        <Card key={g.day} className="p-4">
          <h3 className="font-medium mb-2">{g.day}</h3>
          <ul className="space-y-1 text-sm">
            {g.slots.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>
                  {String(s.start_time).slice(0,5)}–{String(s.end_time).slice(0,5)} · {s.subject_name || '—'}
                </span>
                <span className="text-slate-500">{s.teacher_name || '—'}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function TeacherTimetable() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    timetableApi.mySchedule()
      .then((d) => setRows(Array.isArray(d) ? d : (d?.slots || d?.data || [])))
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <Loader />;
  if (!rows.length)  return <Empty title="No classes assigned yet" hint="Your timetable will appear once the admin schedules your periods." />;

  const ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const groups = ORDER.map((d) => ({
    day: d,
    slots: rows
      .filter((r) => String(r.day_of_week || '').toLowerCase() === d.toLowerCase())
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
  })).filter((g) => g.slots.length);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">My Teaching Schedule</h1>
      {groups.map((g) => (
        <Card key={g.day} className="p-4">
          <h3 className="font-medium mb-2">{g.day}</h3>
          <ul className="space-y-1 text-sm">
            {g.slots.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>
                  {String(s.start_time).slice(0,5)}–{String(s.end_time).slice(0,5)} · {s.subject_name || '—'}
                </span>
                <span className="text-slate-500">
                  {s.class_name || '?'}/{s.section_name || '?'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default function Timetable() {
  const { sectionId: urlSectionId } = useParams();
  const [search, setSearch] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  if (user?.role === 'student') return <StudentTimetable />;
  if (user?.role === 'teacher') return <TeacherTimetable />;

  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [classId, setClassId] = useState(search.get('class') || '');
  const [sectionId, setSectionId] = useState(urlSectionId || search.get('section') || '');

  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null);

  // Filter state
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // Load classes
  useEffect(() => {
    classesApi.list().then((d) => setClasses(d || [])).catch(() => setClasses([]));
  }, []);

  // Load sections when class changes
  useEffect(() => {
    if (!classId) { setSections([]); return; }
    classesApi.sections(classId).then((d) => setSections(d || [])).catch(() => setSections([]));
  }, [classId]);

  // Load grid when section changes
  const loadGrid = async () => {
    if (!sectionId) { setGrid(null); return; }
    setLoading(true);
    try {
      const [gridData, subjects, teachers] = await Promise.all([
        timetableApi.bySection(sectionId),
        timetableApi.subjectsForSection(sectionId),
        // All teachers of the school — the dropdown lets the admin
        // assign any teacher, not just those from this section's class.
        teachersApi.list({ limit: 1000 }),
      ]);
      const slots = Array.isArray(gridData) ? gridData : (gridData?.slots || []);
      const teacherList = Array.isArray(teachers) ? teachers : (teachers?.teachers || teachers?.data || []);
      setGrid({ slots, subjects: subjects || [], teachers: teacherList });
    } catch (e) {
      toast.error(e.message);
      setGrid(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadGrid(); }, [sectionId]);

  // Keep URL in sync
  useEffect(() => {
    if (!sectionId) return;
    const next = new URLSearchParams(search);
    if (classId) next.set('class', classId);
    next.set('section', sectionId);
    setSearch(next, { replace: true });
  }, [sectionId, classId]);

  // ─── Filters ───
  const runSearch = async () => {
    const hasFilter = filterTeacher || filterDay || filterPeriod || filterQ;
    setSearching(true);
    try {
      const params = {};
      if (sectionId)     params.section_id = Number(sectionId);
      if (filterTeacher) params.teacher_id = Number(filterTeacher);
      if (filterDay)     params.day = filterDay;
      if (filterPeriod)  params.period = filterPeriod;
      if (filterQ)       params.q = filterQ;
      const rows = await timetableApi.search(params);
      setSearchResults(rows || []);
    } catch (e) {
      toast.error(e.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const clearFilters = () => {
    setFilterTeacher('');
    setFilterDay('');
    setFilterPeriod('');
    setFilterQ('');
    setSearchResults(null);
  };

  // ─── Actions ───
  const handleDelete = async () => {
    try {
      await timetableApi.remove(confirm.id);
      toast.success('Slot removed');
      setConfirm(null);
      await loadGrid();
    } catch (e) { toast.error(e.message); }
  };

  // Group slots by day
  const byDay = useMemo(() => {
    const map = {};
    DAYS.forEach((d) => { map[d] = []; });
    (grid?.slots || []).forEach((s) => {
      if (!map[s.day_of_week]) map[s.day_of_week] = [];
      map[s.day_of_week].push(s);
    });
    Object.keys(map).forEach((d) =>
      map[d].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    );
    return map;
  }, [grid]);

  const currentClass = classes.find((c) => String(c.id) === String(classId));
  const currentSection = sections.find((s) => String(s.id) === String(sectionId));

  return (
    <div className="space-y-4 animate-fade-in">
      {isAdmin && (
        <div className="flex justify-end">
          <a href="/timetable/school" className="text-sm text-brand-600 hover:underline">
            View whole school →
          </a>
        </div>
      )}
      {/* Toolbar */}
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-600" /> Timetable
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" /> Class
            </label>
            <select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }}
                    className="input">
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" /> Section
            </label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}
                    className="input" disabled={!classId}>
              <option value="">{classId ? 'Select section' : 'Pick a class first'}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>Section {s.section_name}</option>
              ))}
            </select>
          </div>

          {isAdmin && sectionId && (
            <div className="flex items-end">
              <Button icon={Plus} className="w-full" onClick={() =>
                setModal({ mode: 'create', day: DAYS[0] })
              }>
                Add Slot
              </Button>
            </div>
          )}
        </div>

        {(currentClass || currentSection) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {currentClass && <span className="badge badge-blue">Class: {currentClass.class_name}</span>}
            {currentSection && <span className="badge badge-purple">Section: {currentSection.section_name}</span>}
            {grid?.slots?.length > 0 && (
              <span className="badge badge-gray">{grid.slots.length} slot(s)</span>
            )}
          </div>
        )}
      </Card>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Filter slots</h3>
          {(filterTeacher || filterDay || filterPeriod || filterQ || searchResults !== null) && (
            <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700">
              Clear filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="label text-xs">Teacher</label>
            <select value={filterTeacher} onChange={(e) => setFilterTeacher(e.target.value)} className="input text-sm">
              <option value="">All</option>
              {(grid?.teachers || []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Day</label>
            <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="input text-sm">
              <option value="">All</option>
              {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d) => (
                <option key={d} value={d.toLowerCase()}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Period (start)</label>
            <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="input text-sm">
              <option value="">All</option>
              {['08:55','09:15','09:45','10:15','10:45','11:15','12:10','12:40','13:10'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Search</label>
            <div className="flex gap-1">
              <input
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="subject / teacher / class"
                className="input text-sm flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              />
              <button onClick={runSearch} className="btn btn-primary text-sm px-3" disabled={searching}>
                {searching ? '…' : 'Go'}
              </button>
            </div>
          </div>
        </div>
        {(filterTeacher || filterDay || filterPeriod) && searchResults === null && (
          <div className="mt-2 text-right">
            <button onClick={runSearch} className="text-xs text-brand-600 hover:underline">
              Apply filters →
            </button>
          </div>
        )}
      </Card>

      {/* Grid */}
      {searchResults !== null ? (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Search results ({searchResults.length})</h3>
            <button onClick={clearFilters} className="text-xs text-brand-600 hover:underline">
              Clear filters
            </button>
          </div>
          {searchResults.length === 0 ? (
            <Empty title="No slots match" hint="Try different filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left p-2">Class · Section</th>
                    <th className="text-left p-2">Day</th>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Subject</th>
                    <th className="text-left p-2">Teacher</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {searchResults.map((slot) => (
                    <tr key={slot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="p-2">{slot.class_name} · {slot.section_name}</td>
                      <td className="p-2 capitalize">{slot.day_of_week}</td>
                      <td className="p-2 font-mono text-xs">{slot.start_time}–{slot.end_time}</td>
                      <td className="p-2">{slot.subject_name || '—'}</td>
                      <td className="p-2 text-slate-500">{slot.teacher_name || '—'}</td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => setModal({ mode: 'edit', slot })}
                          className="text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded p-1"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : !sectionId ? (
        <Card><Empty title="Pick a class and section" hint="Then you can view or edit its weekly timetable" /></Card>
      ) : loading ? (
        <Loader />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {DAYS.map((day) => {
            const slots = byDay[day] || [];
            return (
              <Card key={day} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm">{day}</h4>
                  {isAdmin && (
                    <button
                      onClick={() => setModal({ mode: 'create', day })}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-800 text-slate-500"
                      title={`Add slot on ${day}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {slots.length === 0 ? (
                  <div className="text-xs text-slate-400 py-3 text-center">
                    No slots
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {slots.map((s) => (
                      <div
                        key={s.id}
                        className="group relative rounded-lg border border-slate-200 dark:border-slate-800 dark:border-slate-700 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800/50 transition"
                      >
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                          <Clock className="w-3 h-3" />
                          {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                        </div>
                        <div className="font-medium text-sm mt-0.5 truncate">
                          {s.subject_name || '—'}
                        </div>
                        {s.teacher_name && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" /> {s.teacher_name}
                          </div>
                        )}

                        {isAdmin && (
                          <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => setModal({ mode: 'edit', slot: s, day })}
                              className="p-1 rounded bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-600"
                              title="Edit"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setConfirm({ id: s.id, name: `${s.subject_name} on ${s.day_of_week}` })}
                              className="p-1 rounded bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {modal && grid && (
        <TimetableModal
          mode={modal.mode}
          sectionId={Number(sectionId)}
          initial={modal.slot}
          defaultDay={modal.day}
          subjects={grid.subjects || []}
          teachers={grid.teachers || []}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await loadGrid(); }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete slot?"
        message={`${confirm?.name || ''} — this cannot be undone.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
