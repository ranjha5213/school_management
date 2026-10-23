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
import { classesApi, timetableApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Timetable() {
  const { sectionId: urlSectionId } = useParams();
  const [search, setSearch] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [classId, setClassId] = useState(search.get('class') || '');
  const [sectionId, setSectionId] = useState(urlSectionId || search.get('section') || '');

  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

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
      const d = await timetableApi.bySection(sectionId);
      setGrid(d);
    } catch (e) { toast.error(e.message); setGrid(null); }
    finally { setLoading(false); }
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

      {/* Grid */}
      {!sectionId ? (
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
