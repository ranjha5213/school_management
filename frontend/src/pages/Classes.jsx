import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  School, Layers, Users, ChevronRight, Plus, Trash2, Pencil,
  X, Save, Building2,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import Modal from '../components/Modal';
import AddStudentModal from '../components/AddStudentModal';
import ConfirmDelete from '../components/ConfirmDelete';
import { classesApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function Classes() {
  const { classId, sectionId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Modal state
  const [classModal, setClassModal] = useState(null);   // null | {mode:'create'|'edit', data}
  const [sectionModal, setSectionModal] = useState(null); // null | {mode:'create'|'bulk'|'edit', data}
  const [confirm, setConfirm] = useState(null);
  const [addStudentModal, setAddStudentModal] = useState(false);           // null | {type:'class'|'section', id, name}

  // ─── Loaders ───
  const loadClasses = async () => {
    setLoadingClasses(true);
    try {
      const d = await classesApi.list();
      setClasses(d || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingClasses(false); }
  };

  const loadSections = async (cid) => {
    if (!cid) { setSections([]); return; }
    setLoadingSections(true);
    try {
      const d = await classesApi.sections(cid);
      setSections(d || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingSections(false); }
  };

  const loadStudents = async (sid) => {
    if (!sid) { setStudents([]); return; }
    setLoadingStudents(true);
    try {
      const d = await classesApi.students(sid);
      setStudents(d || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingStudents(false); }
  };

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => { loadSections(classId); }, [classId]);
  useEffect(() => { loadStudents(sectionId); }, [sectionId]);

  // ─── Class actions ───
  const saveClass = async (values) => {
    try {
      if (classModal?.mode === 'create') {
        const res = await classesApi.createClass(values);
        toast.success('Class created');
        setClassModal(null);
        await loadClasses();
        if (res?.id) nav(`/classes/${res.id}`);
      } else {
        await classesApi.update(classId, values);
        toast.success('Class updated');
        setClassModal(null);
        await loadClasses();
      }
    } catch (e) { toast.error(e.message); }
  };

  const deleteClass = async () => {
    try {
      const id = confirm.id;
      await classesApi.remove(id, true);
      toast.success('Class deleted');
      setConfirm(null);
      if (String(id) === String(classId)) nav('/classes');
      await loadClasses();
    } catch (e) { toast.error(e.message); }
  };

  // ─── Section actions ───
  const saveSection = async (values) => {
    try {
      if (sectionModal?.mode === 'bulk') {
        const res = await classesApi.createSectionBulk(classId, values.names);
        toast.success(`${res?.length || 0} section(s) created`);
      } else if (sectionModal?.mode === 'create') {
        await classesApi.createSection(classId, values);
        toast.success('Section created');
      } else {
        await classesApi.updateSection(sectionModal.data.id, values);
        toast.success('Section updated');
      }
      setSectionModal(null);
      await loadSections(classId);
    } catch (e) { toast.error(e.message); }
  };

  const deleteSection = async () => {
    try {
      const id = confirm.id;
      await classesApi.removeSection(id, true);
      toast.success('Section deleted');
      setConfirm(null);
      if (String(id) === String(sectionId)) nav(`/classes/${classId}`);
      await loadSections(classId);
    } catch (e) { toast.error(e.message); }
  };

  const currentClass = classes.find((c) => String(c.id) === String(classId));
  const currentSection = sections.find((s) => String(s.id) === String(sectionId));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ═══ Classes ═══ */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <School className="w-4 h-4 text-brand-600" /> Classes ({classes.length})
          </h3>
          {isAdmin && (
            <Button size="sm" icon={Plus}
              onClick={() => setClassModal({ mode: 'create', data: { class_name: '', class_code: '' } })}>
              New Class
            </Button>
          )}
        </div>

        {loadingClasses ? <Loader /> : classes.length === 0 ? (
          <Empty title="No classes yet" hint={isAdmin ? 'Click "New Class" to add one' : 'Ask admin to add classes'} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {classes.map((c) => {
              const active = String(c.id) === String(classId);
              return (
                <div key={c.id}
                  className={`relative group rounded-xl border transition ${
                    active
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                      : 'border-slate-200 dark:border-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800'
                  }`}>
                  <button
                    onClick={() => nav(`/classes/${c.id}`)}
                    className="w-full text-left p-3 pr-16"
                  >
                    <div className="font-medium flex items-center gap-1.5">
                      {c.class_name}
                      {c.class_code && (
                        <span className="text-xs font-mono text-slate-500">({c.class_code})</span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.section_count} section(s) · {c.student_count} student(s)
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation();
                          setClassModal({ mode: 'edit', data: { class_name: c.class_name, class_code: c.class_code || '' } }); }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-600"
                        title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation();
                          setConfirm({ type: 'class', id: c.id, name: c.class_name }); }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                        title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ═══ Sections ═══ */}
      {classId && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              Sections {currentClass && <span className="text-sm font-normal text-slate-500">— {currentClass.class_name}</span>}
            </h3>
            {isAdmin && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={Plus}
                  onClick={() => setSectionModal({ mode: 'bulk', data: { names: ['A', 'B', 'C'] } })}>
                  Bulk A B C
                </Button>
                <Button size="sm" icon={Plus}
                  onClick={() => setSectionModal({ mode: 'create', data: { section_name: '', room_number: '' } })}>
                  New Section
                </Button>
              </div>
            )}
          </div>

          {loadingSections ? <Loader /> : sections.length === 0 ? (
            <Empty title="No sections yet" hint={isAdmin ? 'Add sections A, B, C …' : null} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {sections.map((s) => {
                const active = String(s.id) === String(sectionId);
                return (
                  <div key={s.id}
                    className={`relative group rounded-xl border transition ${
                      active
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                        : 'border-slate-200 dark:border-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800'
                    }`}>
                    <button
                      onClick={() => nav(`/classes/${classId}/sections/${s.id}`)}
                      className="w-full text-left p-3 pr-16"
                    >
                      <div className="font-medium flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-purple-500" />
                        Section {s.section_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.student_count} student(s){s.room_number ? ` · Room ${s.room_number}` : ''}
                      </div>
                    </button>
                    {isAdmin && (
                      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => { e.stopPropagation();
                            setSectionModal({ mode: 'edit', data: { id: s.id, section_name: s.section_name, room_number: s.room_number || '' } }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-600"
                          title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation();
                            setConfirm({ type: 'section', id: s.id, name: `Section ${s.section_name}` }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                          title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ═══ Students ═══ */}
      {sectionId && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              Students {currentSection && <span className="text-sm font-normal text-slate-500">— Section {currentSection.section_name}</span>}
            </h3>
            {canWrite && (
              <Button size="sm" icon={Plus} onClick={() => setAddStudentModal(true)}>
                Add Student
              </Button>
            )}
          </div>
          {loadingStudents ? <Loader /> : students.length === 0 ? (
            <Empty title="No students in this section" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
              {students.map((st) => (
                <button
                  key={st.id}
                  onClick={() => nav(`/students/${st.id}`)}
                  className="w-full flex items-center justify-between py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800/50 px-2 rounded"
                >
                  <div className="text-left">
                    <div className="font-medium text-sm">{st.student_name}</div>
                    <div className="text-xs text-slate-500">
                      Roll {st.roll_number || '—'} · Adm {st.admission_number}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ═══ Class modal ═══ */}
      {classModal && (
        <ClassModal
          mode={classModal.mode}
          initial={classModal.data}
          onClose={() => setClassModal(null)}
          onSave={saveClass}
        />
      )}

      {/* ═══ Section modal ═══ */}
      {sectionModal && (
        <SectionModal
          mode={sectionModal.mode}
          initial={sectionModal.data}
          onClose={() => setSectionModal(null)}
          onSave={saveSection}
        />
      )}

      {/* ═══ Add student modal ═══ */}
      {addStudentModal && currentSection && (
        <AddStudentModal
          sectionId={currentSection.id}
          sectionName={currentSection.section_name}
          onClose={() => setAddStudentModal(false)}
          onSaved={async () => {
            setAddStudentModal(false);
            await loadStudents(sectionId);
            await loadSections(classId);
          }}
        />
      )}

      {/* ═══ Confirm delete ═══ */}
      <ConfirmDelete
        open={!!confirm}
        title={confirm?.type === 'class' ? 'Delete class?' : 'Delete section?'}
        message={`${confirm?.name || ''} — this cannot be undone.`}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.type === 'class' ? deleteClass : deleteSection}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════

function ClassModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.class_name || '');
  const [code, setCode] = useState(initial.class_code || '');
  const [sections, setSections] = useState(['A', 'B', 'C']);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Class name required');
    setSaving(true);
    try {
      const payload = { class_name: name.trim(), class_code: code.trim() || null };
      if (mode === 'create') payload.sections = sections.map((s) => s.trim()).filter(Boolean);
      await onSave(payload);
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
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
        <Input label="Class name *" value={name} onChange={(e) => setName(e.target.value)}
               placeholder="e.g. Grade 5" />
        <Input label="Class code" value={code} onChange={(e) => setCode(e.target.value)}
               placeholder="e.g. G5" />

        {mode === 'create' && (
          <div>
            <label className="label">Sections to create (optional)</label>
            <div className="flex flex-wrap gap-2">
              {['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => {
                const on = sections.includes(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setSections(on ? sections.filter((x) => x !== letter) : [...sections, letter])}
                    className={`w-9 h-9 rounded-lg border text-sm font-medium transition ${
                      on ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10'
                         : 'border-slate-200 dark:border-slate-800 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">Click to toggle. Skipped letters won't be created.</p>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════

function SectionModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.section_name || '');
  const [room, setRoom] = useState(initial.room_number || '');
  const [bulk, setBulk] = useState(initial.names || ['A', 'B', 'C']);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (mode === 'bulk') {
        if (!bulk.length) return toast.error('Select at least one section');
        await onSave({ names: bulk });
      } else {
        if (!name.trim()) return toast.error('Section name required');
        await onSave({ section_name: name.trim(), room_number: room.trim() || null });
      }
    } finally { setSaving(false); }
  };

  const title = mode === 'create' ? 'New Section'
              : mode === 'edit'   ? 'Edit Section'
                                  : 'Bulk Add Sections';

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'edit' ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {mode === 'bulk' ? (
          <div>
            <label className="label">Choose sections</label>
            <div className="flex flex-wrap gap-2">
              {LETTERS.map((letter) => {
                const on = bulk.includes(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setBulk(on ? bulk.filter((x) => x !== letter) : [...bulk, letter])}
                    className={`w-9 h-9 rounded-lg border text-sm font-medium transition ${
                      on ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-500/10'
                         : 'border-slate-200 dark:border-slate-800 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Existing sections are skipped automatically.
            </p>
          </div>
        ) : (
          <>
            <Input label="Section name *" value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="e.g. A" />
            <Input label="Room number" value={room} onChange={(e) => setRoom(e.target.value)}
                   placeholder="e.g. 101" />
          </>
        )}
      </form>
    </Modal>
  );
}
