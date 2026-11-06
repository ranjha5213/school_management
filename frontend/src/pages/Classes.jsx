import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  School, Plus, Pencil, Trash2, ChevronRight, Layers, Building2,
  Users, ArrowLeft, UserCheck,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import { classesApi, studentsApi } from '../api/endpoints';
import Modal from '../components/Modal';
import Input from '../components/Input';
import { Save } from 'lucide-react';

// ────────────────────────────────────────────────────────────
// MAIN ROUTER COMPONENT (decides which screen to show)
// ────────────────────────────────────────────────────────────
export default function Classes() {
  const { classId, sectionId } = useParams();
  const nav = useNavigate();

  // Screen 3: Student detail
  if (sectionId) {
    return <StudentsScreen classId={classId} sectionId={sectionId} nav={nav} />;
  }

  // Screen 2: Sections (wizard step 2)
  if (classId) {
    return <SectionsScreen classId={classId} nav={nav} />;
  }

  // Screen 1: Classes list
  return <ClassesList nav={nav} />;
}

// ────────────────────────────────────────────────────────────
// SCREEN 1 — Classes list
// ────────────────────────────────────────────────────────────
function ClassesList({ nav }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [classModal, setClassModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await classesApi.list();
      setClasses(data || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    try {
      await classesApi.remove(confirm.id);
      toast.success('Class removed');
      setConfirm(null);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleSave = async (payload) => {
    if (classModal.mode === 'create') {
      const res = await classesApi.create(payload);
      toast.success('Class created');
      setClassModal(null);
      if (res?.id) nav(`/classes/${res.id}`);
    } else {
      await classesApi.update(classModal.data.id, payload);
      toast.success('Class updated');
      setClassModal(null);
      load();
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <School className="w-4 h-4 text-brand-600" /> Classes ({classes.length})
          </h3>
          <Button size="sm" icon={Plus} onClick={() => setClassModal({ mode: 'create', data: {} })}>
            New Class
          </Button>
        </div>

        {loading ? <Loader /> : classes.length === 0 ? (
          <Empty title="No classes yet" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {classes.map((c) => (
              <div
                key={c.id}
                onClick={() => nav(`/classes/${c.id}`)}
                className="relative group rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <div className="w-full text-left p-3 pr-16 pointer-events-none">
                  <div className="font-medium flex items-center gap-1.5">
                    {c.class_name}
                    {c.class_code && <span className="text-xs font-mono text-slate-500">({c.class_code})</span>}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.section_count || 0} section(s) · {c.student_count || 0} student(s)
                  </div>
                </div>

                <div className="absolute right-2 top-2 flex gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); nav(`/classes/${c.id}`); }}
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600"
                    title="View sections"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirm({ id: c.id, name: c.class_name }); }}
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {classModal && (
        <ClassFormModal
          mode={classModal.mode}
          initial={classModal.data}
          onClose={() => setClassModal(null)}
          onSave={handleSave}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete class?"
        message={`${confirm?.name || ''} — this will delete all sections and students in it.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SCREEN 2 — Sections for a class
// ────────────────────────────────────────────────────────────
function SectionsScreen({ classId, nav }) {
  const [currentClass, setCurrentClass] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sectionModal, setSectionModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [cls, secs] = await Promise.all([
        classesApi.get(classId),
        classesApi.sections(classId),
      ]);
      setCurrentClass(cls);
      setSections(secs || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [classId]);

  const handleDelete = async () => {
    try {
      await classesApi.removeSection(confirm.id, true);
      toast.success('Section removed');
      setConfirm(null);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleSave = async (payload) => {
    if (sectionModal.mode === 'create') {
      await classesApi.createSection(classId, payload);
    } else {
      await classesApi.updateSection(sectionModal.data.id, payload);
    }
    toast.success('Section saved');
    setSectionModal(null);
    load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav('/classes')} className="text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              {currentClass?.class_name || 'Class'}
            </h2>
            <p className="text-xs text-slate-500">{sections.length} section(s)</p>
          </div>
          <Button size="sm" icon={Plus} onClick={() => setSectionModal({ mode: 'create', data: {} })}>
            New Section
          </Button>
        </div>

        {loading ? <Loader /> : sections.length === 0 ? (
          <Empty title="No sections yet" hint="Create a section to add students." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sections.map((s) => (
              <div key={s.id} className="relative group rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition">
                <button
                  onClick={() => nav(`/classes/${classId}/sections/${s.id}`)}
                  className="w-full text-left p-4 pr-16"
                >
                  <div className="font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-purple-500" />
                    Section {s.section_name}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {s.student_count || 0} student(s) · Room {s.room_number || '—'}
                  </div>
                </button>

                <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => setSectionModal({ mode: 'edit', data: s })}
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirm({ id: s.id, name: `Section ${s.section_name}` })}
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {sectionModal && (
        <SectionFormModal
          mode={sectionModal.mode}
          initial={sectionModal.data}
          onClose={() => setSectionModal(null)}
          onSave={handleSave}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete section?"
        message={`${confirm?.name || ''} — this will delete all students in this section.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SCREEN 3 — Students in a section
// ────────────────────────────────────────────────────────────
function StudentsScreen({ classId, sectionId, nav }) {
  const [students, setStudents] = useState([]);
  const [section, setSection] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [secs, studs] = await Promise.all([
          classesApi.sections(classId),
          studentsApi.list({ section_id: sectionId }),
        ]);
        const sec = secs.find((s) => String(s.id) === String(sectionId));
        setSection(sec);
        setStudents(studs || []);
      } catch (e) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, [classId, sectionId]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(`/classes/${classId}`)} className="text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-600" />
              Section {section?.section_name || sectionId}
            </h2>
            <p className="text-xs text-slate-500">{students.length} student(s)</p>
          </div>
        </div>

        {loading ? <Loader /> : students.length === 0 ? (
          <Empty title="No students" hint="Add students via the Students page." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => nav(`/students/${s.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center font-bold text-brand-700">
                  {s.student_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.student_name}</div>
                  <div className="text-xs text-slate-500">
                    Roll {s.roll_number || '—'} · {s.admission_number || '—'}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// MODALS
// ────────────────────────────────────────────────────────────
function ClassFormModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.class_name || '');
  const [code, setCode] = useState(initial.class_code || '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Class name required');
    setSaving(true);
    try {
      await onSave({ class_name: name.trim(), class_code: code.trim() || null });
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open onClose={onClose}
      title={mode === 'create' ? 'Create Class' : 'Edit Class'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Class name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 5" />
        <Input label="Class code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. G5" />
      </form>
    </Modal>
  );
}

function SectionFormModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.section_name || '');
  const [room, setRoom] = useState(initial.room_number || '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Section name required');
    setSaving(true);
    try {
      await onSave({ section_name: name.trim(), room_number: room.trim() || null });
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open onClose={onClose}
      title={mode === 'create' ? 'New Section' : 'Edit Section'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Section name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. A" />
        <Input label="Room number" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. 101" />
      </form>
    </Modal>
  );
}
