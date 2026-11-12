import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AddStudentModal from '../components/AddStudentModal';
import toast from 'react-hot-toast';
import {
  School, Plus, Pencil, Trash2, ChevronRight, Layers, Building2,
  Users, ArrowLeft, ArrowDownAZ, ListOrdered, X
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import PrintHeader from '../components/PrintHeader';
import PrintShare from '../components/PrintShare';
import { classesApi, studentsApi } from '../api/endpoints';
import Modal from '../components/Modal';
import Input from '../components/Input';
import { Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ────────────────────────────────────────────────────────────
// MAIN ROUTER COMPONENT
// ────────────────────────────────────────────────────────────
export default function Classes() {
  const { classId, sectionId } = useParams();
  const nav = useNavigate();

  if (sectionId) {
    return <StudentsScreen classId={classId} sectionId={sectionId} nav={nav} />;
  }

  if (classId) {
    return <SectionsScreen classId={classId} nav={nav} />;
  }

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

  const { user } = useAuth();
  let userPerms = {};
  try { userPerms = JSON.parse(user.permissions || '{}'); } catch (e) {}
  const isAdmin = user?.role === 'admin';
  const canAddClass = isAdmin || userPerms.add_class;
  const canDeleteClass = isAdmin || userPerms.delete_class;

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
    <div className="space-y-4 animate-fade-in print-container">
      <PrintHeader title="All Classes" subtitle="School-wide class directory" />

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <School className="w-4 h-4 text-brand-600" /> Classes ({classes.length})
          </h3>
          
          <div className="flex items-center gap-2">
            <PrintShare title="All Classes" text="Here is the list of all classes." />
            
            {canAddClass && (
              <Button size="sm" icon={Plus} onClick={() => setClassModal({ mode: 'create', data: {} })} className="no-print">
                New Class
              </Button>
            )}
          </div>
        </div>

        {loading ? <Loader /> : classes.length === 0 ? (
          <Empty title="No classes yet" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {classes.map((c) => (
              <div
                key={c.id}
                onClick={() => nav(`/classes/${c.id}`)}
                className="relative group rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer print:border-0 print:border-b print:rounded-none print:pb-2"
              >
                <div className="w-full text-left p-3 pr-16 pointer-events-none">
                  <div className="font-medium flex items-center gap-1.5">
                    {c.class_name}
                    {c.class_code && <span className="text-xs font-mono text-slate-500">({c.class_code})</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.section_count || 0} section(s) · {c.student_count || 0} student(s)
                  </div>
                </div>

                <div className="absolute right-2 top-2 flex gap-1 no-print">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); nav(`/classes/${c.id}`); }}
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  
                  {canDeleteClass && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirm({ id: c.id, name: c.class_name }); }}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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

  const { user } = useAuth();
  let userPerms = {};
  try { userPerms = JSON.parse(user.permissions || '{}'); } catch (e) {}
  const isAdmin = user?.role === 'admin';
  const canAddSection = isAdmin || userPerms.add_class;
  const canEditSection = isAdmin || userPerms.edit_class;
  const canDeleteSection = isAdmin || userPerms.delete_class;

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
    <div className="space-y-4 animate-fade-in print-container">
      <PrintHeader 
        title={`Sections - ${currentClass?.class_name || 'Class'}`} 
        subtitle={`Total Sections: ${sections.length}`} 
      />

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav('/classes')} className="text-slate-500 hover:text-slate-800 no-print">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              {currentClass?.class_name || 'Class'}
            </h2>
            <p className="text-xs text-slate-500">{sections.length} section(s)</p>
          </div>
          
          <div className="flex items-center gap-2">
            <PrintShare title="Class Sections" />
            {canAddSection && (
              <Button size="sm" icon={Plus} onClick={() => setSectionModal({ mode: 'create', data: {} })} className="no-print">
                New Section
              </Button>
            )}
          </div>
        </div>

        {loading ? <Loader /> : sections.length === 0 ? (
          <Empty title="No sections yet" hint="Create a section to add students." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sections.map((s) => (
              <div key={s.id} className="relative group rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition print:border-0 print:border-b print:rounded-none print:pb-2">
                <button
                  onClick={() => nav(`/classes/${classId}/sections/${s.id}`)}
                  className="w-full text-left p-4 pr-16"
                >
                  <div className="font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-purple-500 print:hidden" />
                    Section {s.section_name}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {s.student_count || 0} student(s) · Room {s.room_number || '—'}
                  </div>
                </button>

                <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition no-print">
                  {canEditSection && (
                    <button
                      onClick={() => setSectionModal({ mode: 'edit', data: s })}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  
                  {canDeleteSection && (
                    <button
                      onClick={() => setConfirm({ id: s.id, name: `Section ${s.section_name}` })}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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
  const [currentClass, setCurrentClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('roll'); 
  
  // Modals & Menus state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [actionMenu, setActionMenu] = useState(null);

  const pressTimer = useRef(null);

  const { user } = useAuth();
  let userPerms = {};
  try { userPerms = JSON.parse(user.permissions || '{}'); } catch (e) {}
  const isAdmin = user?.role === 'admin';
  const canAddStudent = isAdmin || userPerms.add_student;
  const canEditStudent = isAdmin || userPerms.edit_student;
  const canDeleteStudent = isAdmin || userPerms.delete_student;

  const load = async () => {
    setLoading(true);
    try {
      const [cls, secs, studs] = await Promise.all([
        classesApi.get(classId),
        classesApi.sections(classId),
        studentsApi.list({ section_id: sectionId, sort: sortBy }),
      ]);
      setCurrentClass(cls);
      const sec = secs.find((s) => String(s.id) === String(sectionId));
      setSection(sec);
      setStudents(studs || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [classId, sectionId, sortBy]);

  // ── Long press logic ──
  const handlePressStart = (e, student) => {
    if (!canEditStudent && !canDeleteStudent) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    pressTimer.current = setTimeout(() => {
      setActionMenu({ id: student.id, name: student.student_name, x, y });
    }, 1000);
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };

  useEffect(() => {
    const closeMenu = () => setActionMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    try {
      const s = editingStudent;
      const payload = {
        name: s.student_name || s.name || undefined,
        email: s.email || undefined,
        phone: s.phone || undefined,
        roll_number: s.roll_number ?? undefined,
        gender: s.gender || undefined,
        dob: s.dob || undefined,
        guardian_name: s.guardian_name || undefined,
        guardian_phone: s.guardian_phone || undefined,
      };
      await studentsApi.update(s.id, payload);
      toast.success('Student updated successfully');
      setEditingStudent(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to update student');
    }
  };

  const handleDelete = async () => {
    try {
      await studentsApi.remove(deletingId);
      toast.success('Student removed');
      setDeletingId(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete student');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in relative min-h-screen print-container">
      <PrintHeader 
        title={`Class Roster - ${currentClass?.class_name || ''}`} 
        subtitle={`Section ${section?.section_name || ''} (${students.length} Students)`} 
      />

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={() => nav(`/classes/${classId}`)} className="text-slate-500 hover:text-slate-800 no-print">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-600 print:hidden" />
              Section {section?.section_name || sectionId}
            </h2>
            <p className="text-xs text-slate-500">{students.length} student(s)</p>
          </div>

          <div className="flex items-center gap-2">
            <PrintShare title="Class Roster" text="Here is the class roster." />
            
            <Button 
              size="sm" 
              variant="secondary"
              onClick={() => setSortBy(sortBy === 'roll' ? 'name' : 'roll')}
              className="flex items-center gap-2 text-sm no-print"
            >
              {sortBy === 'roll' ? (
                <><ListOrdered className="w-4 h-4" /> Sorted by Roll</>
              ) : (
                <><ArrowDownAZ className="w-4 h-4" /> Sorted A-Z</>
              )}
            </Button>

            {canAddStudent && (
              <Button size="sm" icon={Plus} onClick={() => setIsAddOpen(true)} className="no-print">
                Add
              </Button>
            )}
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
                onMouseDown={(e) => handlePressStart(e, s)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={(e) => handlePressStart(e, s)}
                onTouchEnd={handlePressEnd}
                // 👇 Added print:block to force button to show on paper
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-left select-none print:block print:w-full print:border-0 print:bg-transparent"
              >
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center font-bold text-brand-700 print:hidden">
                  {s.student_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.student_name}</div>
                  <div className="text-xs text-slate-500">
                    Roll {s.roll_number || '—'} · {s.admission_number || '—'}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 print:hidden" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* FLOATING ACTION MENU */}
      {actionMenu && (
        <div 
          className="fixed z-50 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fade-in no-print"
          style={{ top: actionMenu.y, left: actionMenu.x, transform: 'translate(-50%, -50%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-center max-w-[150px] truncate">
            {actionMenu.name}
          </div>
          
          {canEditStudent && (
            <button 
              onClick={() => { setEditingStudent(students.find(s => s.id === actionMenu.id)); setActionMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-200"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Student
            </button>
          )}
          
          {canDeleteStudent && (
            <button 
              onClick={() => { setDeletingId(actionMenu.id); setActionMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Student
            </button>
          )}
        </div>
      )}

      {/* ADD STUDENT MODAL */}
      {isAddOpen && (
        <AddStudentModal
          sectionId={sectionId}
          sectionName={`${section?.section_name || ''}`}
          onClose={() => setIsAddOpen(false)}
          onSaved={() => { setIsAddOpen(false); load(); }}
        />
      )}

      {/* EDIT STUDENT MODAL */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto no-print" onClick={() => setEditingStudent(null)}>
          <form
            onSubmit={handleUpdateSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-2xl space-y-4 shadow-xl my-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Student</h3>
              <button type="button" onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={editingStudent.student_name || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, student_name: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Roll Number</label>
                <input
                  type="text"
                  value={editingStudent.roll_number || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, roll_number: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={editingStudent.email || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, email: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  value={editingStudent.phone || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button type="button" onClick={() => setEditingStudent(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingId && (
        <ConfirmDelete
          open={!!deletingId}
          onClose={() => setDeletingId(null)}
          onConfirm={handleDelete}
          title="Delete Student"
          message="Are you sure you want to remove this student? This action cannot be undone."
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// MODALS FOR CLASSES/SECTIONS
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
    <Modal open onClose={onClose} title={mode === 'create' ? 'Create Class' : 'Edit Class'} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>{mode === 'create' ? 'Create' : 'Save'}</Button>
      </>
    }>
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
    <Modal open onClose={onClose} title={mode === 'create' ? 'New Section' : 'Edit Section'} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>{mode === 'create' ? 'Create' : 'Save'}</Button>
      </>
    }>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Section name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. A" />
        <Input label="Room number" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. 101" />
      </form>
    </Modal>
  );
}
