import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileText, Plus, Pencil, Trash2, ChevronRight, ArrowLeft,
  Save, Users, Percent, Award,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import ExamModal from '../components/ExamModal';
import { examsApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Exams() {
  const { examId } = useParams();
  return examId ? <ExamDetail examId={Number(examId)} /> : <ExamList />;
}

// ════════════════════════════════════════════════════════════
// LIST
// ════════════════════════════════════════════════════════════

function ExamList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    examsApi.list().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) load(); }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const handleDelete = async () => {
    try {
      await examsApi.remove(confirm.id);
      toast.success('Exam deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-600" /> Exams ({rows.length})
          </h3>
          {canWrite && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ mode: 'create' })}>
              New Exam
            </Button>
          )}
        </div>

        {loading ? <Loader /> : rows.length === 0 ? (
          <Empty title="No exams yet" hint={canWrite ? 'Click "New Exam" to create one' : null} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rows.map((e) => (
              <div
                key={e.id}
                className="relative group rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800 transition"
              >
                <button onClick={() => nav(`/exams/${e.id}`)} className="w-full text-left p-3 pr-16">
                  <div className="font-medium flex items-center gap-1.5">
                    {e.exam_name}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {e.class_name || 'All classes'}
                    {e.type_name ? ` · ${e.type_name}` : ''}
                  </div>
                  {(e.start_date || e.end_date) && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      {e.start_date} → {e.end_date || '?'}
                    </div>
                  )}
                </button>
                {canWrite && (
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setModal({ mode: 'edit', data: e }); }}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-600"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setConfirm({ id: e.id, name: e.exam_name }); }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {modal && (
        <ExamModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={async (newId) => {
            setModal(null);
            await load();
            if (modal.mode === 'create' && newId) nav(`/exams/${newId}`);
          }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete exam?"
        message={`${confirm?.name || ''} — all marks for this exam will be removed.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL + MARKS ENTRY
// ════════════════════════════════════════════════════════════

function ExamDetail({ examId }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grid, setGrid] = useState({}); // { [student_id]: { [subject_id]: { marks_obtained, remarks } } }

  const load = async () => {
    setLoading(true);
    try {
      const d = await examsApi.get(examId);
      setData(d);

      // Build editable grid from existing marks
      const g = {};
      (d.marks || []).forEach((m) => {
        g[m.student_id] = g[m.student_id] || {};
        g[m.student_id][m.subject_id] = {
          id: m.id,
          marks_obtained: m.marks_obtained,
          total_marks: m.total_marks,
          remarks: m.remarks || '',
        };
      });
      setGrid(g);
    } catch (e) { toast.error(e.message); setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [examId]);

  if (loading) return <Loader />;
  if (!data?.exam) return <Card><Empty title="Exam not found" /></Card>;

  const { exam, marks, students, subjects, summary } = data;
  const defaultTotal = exam.total_marks || 100;

  const cell = (student_id, subject_id) =>
    grid[student_id]?.[subject_id] || { marks_obtained: '', total_marks: defaultTotal, remarks: '' };

  const setCell = (student_id, subject_id, patch) => {
    setGrid((g) => ({
      ...g,
      [student_id]: {
        ...(g[student_id] || {}),
        [subject_id]: { ...cell(student_id, subject_id), ...patch },
      },
    }));
  };

  const saveAll = async () => {
    // Collect only filled-in cells
    const payload = [];
    for (const sid of Object.keys(grid)) {
      for (const subId of Object.keys(grid[sid])) {
        const c = grid[sid][subId];
        if (c.marks_obtained === '' || c.marks_obtained === null || c.marks_obtained === undefined) continue;
        const m = Number(c.marks_obtained);
        const t = Number(c.total_marks || defaultTotal);
        if (Number.isNaN(m) || Number.isNaN(t)) continue;
        if (m > t) {
          return toast.error(`Marks exceed total for one student (student ${sid})`);
        }
        payload.push({
          student_id: Number(sid),
          subject_id: Number(subId),
          marks_obtained: m,
          total_marks: t,
          remarks: c.remarks || null,
        });
      }
    }
    if (!payload.length) return toast.error('Nothing to save — enter at least one mark');

    setSaving(true);
    try {
      await examsApi.saveMarks(examId, payload);
      toast.success(`Saved ${payload.length} mark(s)`);
      await load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const totals = (student_id) => {
    let obtained = 0, total = 0;
    for (const subId of Object.keys(grid[student_id] || {})) {
      const c = grid[student_id][subId];
      const m = Number(c.marks_obtained);
      const t = Number(c.total_marks || defaultTotal);
      if (!Number.isNaN(m)) obtained += m;
      if (!Number.isNaN(t)) total += t;
    }
    return { obtained, total, pct: total ? Math.round((obtained / total) * 100) : 0 };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav('/exams')} className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-100 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to exams
      </button>

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-600" />
              {exam.exam_name}
            </h2>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              <span>{exam.class_name || 'All classes'}</span>
              {exam.type_name && <span>{exam.type_name}</span>}
              {(exam.start_date || exam.end_date) && (
                <span className="font-mono text-xs">{exam.start_date} → {exam.end_date || '?'}</span>
              )}
            </div>
          </div>
          {canWrite && (
            <Button onClick={saveAll} loading={saving} icon={Save} className="bg-green-600 hover:bg-green-700">
              Save Marks
            </Button>
          )}
        </div>

        {summary && summary.marks_count > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <Stat label="Students" value={summary.student_count || 0} icon={Users} tone="blue" />
            <Stat label="Entries" value={summary.marks_count || 0} />
            <Stat label="Avg %" value={summary.avg_percentage ? (summary.avg_percentage * 100).toFixed(1) : '—'} icon={Percent} tone="green" />
            <Stat label="Top %" value={summary.max_percentage ? (summary.max_percentage * 100).toFixed(1) : '—'} icon={Award} tone="amber" />
          </div>
        )}
      </Card>

      {!students?.length ? (
        <Card><Empty title="No students in this class" hint="Add students first, then come back to enter marks." /></Card>
      ) : !subjects?.length ? (
        <Card><Empty title="No subjects defined for this class" hint="Create subjects for the class first." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 min-w-[180px]">Student</th>
                  {subjects.map((s) => (
                    <th key={s.id} className="text-center p-2 min-w-[110px]">{s.subject_name}</th>
                  ))}
                  <th className="text-center p-2 min-w-[80px]">Total</th>
                  <th className="text-center p-2 min-w-[70px]">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                {students.map((st) => {
                  const t = totals(st.id);
                  return (
                    <tr key={st.id}>
                      <td className="p-2 sticky left-0 bg-white dark:bg-slate-900 dark:bg-slate-900 z-10">
                        <div className="font-medium text-sm">{st.student_name}</div>
                        <div className="text-xs text-slate-500">
                          {st.section_name || ''} · Roll {st.roll_number || '—'}
                        </div>
                      </td>
                      {subjects.map((sub) => {
                        const c = cell(st.id, sub.id);
                        return (
                          <td key={sub.id} className="p-1 text-center">
                            <input
                              type="number"
                              min="0"
                              max={c.total_marks || defaultTotal}
                              value={c.marks_obtained}
                              disabled={!canWrite}
                              onChange={(e) => setCell(st.id, sub.id, { marks_obtained: e.target.value })}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (v === '') return;
                                const num = Number(v);
                                const max = Number(c.total_marks || defaultTotal);
                                if (num < 0) setCell(st.id, sub.id, { marks_obtained: 0 });
                                if (num > max) setCell(st.id, sub.id, { marks_obtained: max });
                              }}
                              className="w-20 px-2 py-1 text-center rounded-lg border border-slate-200 dark:border-slate-800 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
                              placeholder="—"
                            />
                            <div className="text-[10px] text-slate-400 mt-0.5">/{c.total_marks || defaultTotal}</div>
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-medium">
                        {t.obtained}<span className="text-slate-400">/{t.total}</span>
                      </td>
                      <td className={`p-2 text-center font-bold ${
                        t.pct >= 80 ? 'text-green-600' : t.pct >= 50 ? 'text-amber-600' : t.pct > 0 ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {t.total ? `${t.pct}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canWrite && students?.length && subjects?.length && (
        <div className="flex justify-end">
          <Button onClick={saveAll} loading={saving} icon={Save} className="bg-green-600 hover:bg-green-700">
            Save Marks
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone = 'slate' }) {
  const map = {
    slate: 'bg-slate-50 dark:bg-slate-800',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    blue:  'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return (
    <div className={`p-3 rounded-xl ${map[tone]}`}>
      <div className="text-xs uppercase text-slate-500 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className="text-lg font-bold">{value ?? '—'}</div>
    </div>
  );
}
