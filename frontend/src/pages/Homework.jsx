import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ClipboardList, Plus, Pencil, Trash2, ChevronRight, ArrowLeft,
  User, Clock, BookOpen, Users, CheckCircle2, XCircle, Save, Award,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import Input from '../components/Input';
import Modal from '../components/Modal';
import ConfirmDelete from '../components/ConfirmDelete';
import HomeworkModal from '../components/HomeworkModal';
import { homeworkApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Homework() {
  const { homeworkId } = useParams();
  return homeworkId
    ? <HomeworkDetail homeworkId={Number(homeworkId)} />
    : <HomeworkList />;
}

// ════════════════════════════════════════════════════════════

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function dueBadge(due_date) {
  if (!due_date) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (due_date < today) return { text: 'Overdue', cls: 'badge bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' };
  if (due_date === today) return { text: 'Due today', cls: 'badge bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' };
  return { text: `Due ${due_date}`, cls: 'badge badge-blue' };
}

// ════════════════════════════════════════════════════════════
// LIST
// ════════════════════════════════════════════════════════════

function HomeworkList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    homeworkApi.list().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) load(); }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const handleDelete = async () => {
    try {
      await homeworkApi.remove(confirm.id);
      toast.success('Homework deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const filtered = q
    ? rows.filter((r) =>
        (r.title || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.teacher_name || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.class_name || '').toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-brand-600" /> Homework ({filtered.length})
          </h3>
          {canWrite && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ mode: 'create' })}>
              New Homework
            </Button>
          )}
        </div>

        <Input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search by title, teacher, or class…" />

        <div className="mt-3">
          {loading ? <Loader /> : filtered.length === 0 ? (
            <Empty title="No homework yet" hint={canWrite ? 'Click "New Homework" to post one' : null} />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
              {filtered.map((h) => {
                const b = dueBadge(h.due_date);
                return (
                  <div key={h.id} className="group relative">
                    <button onClick={() => nav(`/homework/${h.id}`)}
                      className="w-full text-left py-3 pr-20 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800/50 rounded transition">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center shrink-0">
                          <BookOpen className="w-4 h-4 text-brand-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center gap-2">
                            {h.title}
                            {b && <span className={b.cls}>{b.text}</span>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
                            {h.class_name && <span>{h.class_name}</span>}
                            {h.subject_name && <span>· {h.subject_name}</span>}
                            {h.teacher_name && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" /> {h.teacher_name}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Posted {formatDateTime(h.created_at)}
                            </span>
                            {h.updated_at && (
                              <span>Edited {formatDateTime(h.updated_at)}
                                {h.updated_by_name ? ` by ${h.updated_by_name}` : ''}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                      </div>
                    </button>

                    {canWrite && (
                      <div className="absolute right-2 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', data: h }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-600"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirm({ id: h.id, name: h.title }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {modal && (
        <HomeworkModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={async (id) => {
            setModal(null);
            await load();
            if (modal.mode === 'create' && id) nav(`/homework/${id}`);
          }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete homework?"
        message={`"${confirm?.name || ''}" and all its submissions will be removed.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL
// ════════════════════════════════════════════════════════════

function HomeworkDetail({ homeworkId }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gradeModal, setGradeModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await homeworkApi.get(homeworkId);
      setData(d);
    } catch (e) { toast.error(e.message); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [homeworkId]);

  if (loading) return <Loader />;
  if (!data?.homework) return <Card><Empty title="Homework not found" /></Card>;

  const { homework, submissions, roster } = data;
  const submittedCount = roster.filter((r) => r.submitted).length;
  const b = dueBadge(homework.due_date);

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav('/homework')}
        className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-100 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to homework
      </button>

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
              <BookOpen className="w-5 h-5 text-brand-600" />
              {homework.title}
              {b && <span className={b.cls}>{b.text}</span>}
            </h2>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              {homework.class_name && <span>{homework.class_name}</span>}
              {homework.subject_name && <span>· {homework.subject_name}</span>}
            </div>

            <div className="text-xs text-slate-400 mt-2 flex flex-wrap gap-4">
              {homework.teacher_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> Posted by <b className="text-slate-600 dark:text-slate-300">{homework.teacher_name}</b>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatDateTime(homework.created_at)}
              </span>
              {homework.updated_at && (
                <span>Edited {formatDateTime(homework.updated_at)}</span>
              )}
            </div>

            {homework.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 whitespace-pre-wrap">
                {homework.description}
              </p>
            )}

            {homework.attachment_url && (
              <a href={homework.attachment_url} target="_blank" rel="noopener noreferrer"
                 className="text-xs text-brand-600 hover:underline mt-2 inline-block">
                📎 View attachment
              </a>
            )}
          </div>
        </div>

        {roster.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="text-xs uppercase text-slate-500">Roster</div>
              <div className="text-lg font-bold">{roster.length}</div>
            </div>
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300">
              <div className="text-xs uppercase">Submitted</div>
              <div className="text-lg font-bold">{submittedCount}</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <div className="text-xs uppercase">Pending</div>
              <div className="text-lg font-bold">{roster.length - submittedCount}</div>
            </div>
          </div>
        )}
      </Card>

      {roster.length === 0 ? (
        <Card><Empty title="No students in this class" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Student</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Submitted at</th>
                  <th className="text-left p-3">Grade</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                {roster.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <div className="font-medium text-sm">{r.student_name}</div>
                      <div className="text-xs text-slate-500">
                        {r.section_name || ''} · Roll {r.roll_number || '—'}
                      </div>
                    </td>
                    <td className="p-3">
                      {r.submitted ? (
                        <span className="text-green-600 text-xs font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
                        </span>
                      ) : (
                        <span className="text-red-500 text-xs font-medium flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-500">
                      {r.submission?.submission_date
                        ? formatDateTime(r.submission.submission_date)
                        : '—'}
                    </td>
                    <td className="p-3">
                      {r.submission?.grade ? (
                        <span className="badge badge-blue">{r.submission.grade}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {canWrite && r.submitted && (
                        <button
                          onClick={() => setGradeModal({ student: r })}
                          className="text-xs text-brand-600 font-medium inline-flex items-center gap-1"
                        >
                          <Award className="w-3.5 h-3.5" /> Grade
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {gradeModal && (
        <GradeModal
          homeworkId={homeworkId}
          student={gradeModal.student}
          onClose={() => setGradeModal(null)}
          onSaved={async () => { setGradeModal(null); await load(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════

function GradeModal({ homeworkId, student, onClose, onSaved }) {
  const [grade, setGrade] = useState(student.submission?.grade || '');
  const [remarks, setRemarks] = useState(student.submission?.remarks || '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!grade.trim()) return toast.error('Grade required');
    setSaving(true);
    try {
      await homeworkApi.grade(homeworkId, {
        student_id: student.id,
        grade: grade.trim(),
        remarks: remarks.trim() || null,
      });
      toast.success('Graded');
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Grade — ${student.student_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>Save Grade</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Grade *" value={grade} onChange={(e) => setGrade(e.target.value)}
               placeholder="A / B+ / 85 / Excellent" />
        <div>
          <label className="label">Remarks</label>
          <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                    className="input" placeholder="Optional feedback…" />
        </div>
      </form>
    </Modal>
  );
}
