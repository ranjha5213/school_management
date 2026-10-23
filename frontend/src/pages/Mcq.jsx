import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileText, Plus, Trash2, ChevronRight, ArrowLeft, Save,
  Printer, Camera, CheckCircle2, XCircle, AlertCircle, Upload, Users, FileUp,
  Globe,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import Modal from '../components/Modal';
import ConfirmDelete from '../components/ConfirmDelete';
import BulkImportModal from '../components/BulkImportModal';
import McqPublishModal from '../components/McqPublishModal';
import { mcqApi, classesApi, studentsApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Mcq() {
  const { examId } = useParams();
  return examId ? <McqDetail examId={Number(examId)} /> : <McqList />;
}

// ════════════════════════════════════════════════════════════
// LIST
// ════════════════════════════════════════════════════════════

function McqList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [publishTarget, setPublishTarget] = useState(null);

  const load = () => {
    setLoading(true);
    mcqApi.list().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async () => {
    try {
      await mcqApi.remove(confirm.id);
      toast.success('Deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-600" /> MCQ Tests ({rows.length})
          </h3>
          {canWrite && (
            <Button size="sm" icon={Plus} onClick={() => setModal(true)}>New MCQ</Button>
          )}
        </div>

        {loading ? <Loader /> : rows.length === 0 ? (
          <Empty title="No MCQ tests" hint="Create one to get started" />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map((r) => (
              <button key={r.id} onClick={() => nav(`/mcq/${r.id}`)}
                className="w-full text-left py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-slate-500">
                    {r.class_name || '—'} {r.section_name ? `· ${r.section_name}` : ''}
                    {' · '}{r.question_count} questions
                    {' · '}{r.submission_count} scanned
                    {r.scheduled_start_at && (
                      <span className="ml-1 text-amber-600 font-medium">
                        · scheduled {new Date(r.scheduled_start_at).toLocaleString()}
                      </span>
                    )}
                    {!r.scheduled_start_at && r.is_published ? (
                      <span className="ml-1 text-emerald-600 font-medium">· live</span>
                    ) : null}
                  </div>
                </div>
                {canWrite && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setPublishTarget(r); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setPublishTarget(r); } }}
                    title="Publish & schedule"
                    className="p-1.5 rounded hover:bg-brand-50 dark:hover:bg-brand-500/10 text-brand-600 cursor-pointer"
                  >
                    <Globe className="w-4 h-4" />
                  </span>
                )}
                {canWrite && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setConfirm(r); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setConfirm(r); } }}
                    title="Delete"
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {modal && (
        <NewMcqModal onClose={() => setModal(false)}
          onCreated={async (id) => { setModal(false); await load(); nav(`/mcq/${id}`); }} />
      )}

      <ConfirmDelete open={!!confirm} title="Delete MCQ test?"
        message={`"${confirm?.title || ''}" and all its data will be removed.`}
        onClose={() => setConfirm(null)} onConfirm={handleDelete} />

      {publishTarget && (
        <McqPublishModal
          exam={publishTarget}
          onClose={() => setPublishTarget(null)}
          onSaved={() => { setPublishTarget(null); load(); }}
        />
      )}
    </div>
  );
}

function NewMcqModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', class_id: '', section_id: '', subject_id: '',
    total_questions: 20, marks_per_question: 1, negative_marks: 0, exam_date: '',
    sheet_mode: 'full',
  });
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    classesApi.list().then((d) => setClasses(d || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.class_id) { setSections([]); return; }
    classesApi.sections(form.class_id).then((d) => setSections(d || [])).catch(() => {});
  }, [form.class_id]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    if (!form.class_id) return toast.error('Pick a class');
    setSaving(true);
    try {
      const res = await mcqApi.create({
        title: form.title.trim(),
        class_id: Number(form.class_id),
        section_id: form.section_id ? Number(form.section_id) : null,
        subject_id: form.subject_id ? Number(form.subject_id) : null,
        total_questions: Number(form.total_questions),
        marks_per_question: Number(form.marks_per_question),
        negative_marks: Number(form.negative_marks),
        exam_date: form.exam_date || null,
        sheet_mode: form.sheet_mode,
      });
      toast.success('Created');
      onCreated(res.id);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New MCQ Test"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>Create</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Title *" name="title" value={form.title} onChange={onChange} placeholder="e.g. Math Quiz 1" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Class *</label>
            <select name="class_id" value={form.class_id} onChange={onChange} className="input">
              <option value="">Select class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Section</label>
            <select name="section_id" value={form.section_id} onChange={onChange} className="input" disabled={!form.class_id}>
              <option value="">All</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.section_name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Questions" name="total_questions" type="number" value={form.total_questions} onChange={onChange} />
          <Input label="Marks/Q" name="marks_per_question" type="number" step="0.5" value={form.marks_per_question} onChange={onChange} />
          <Input label="Negative" name="negative_marks" type="number" step="0.25" value={form.negative_marks} onChange={onChange} />
        </div>
        <Input label="Exam date" name="exam_date" type="date" value={form.exam_date} onChange={onChange} />

        <div>
          <label className="label">Sheet type</label>
          <div className="flex gap-2">
            {[
              { value: 'full', label: 'Full (with questions)' },
              { value: 'tick_only', label: 'Tick-only (separate question paper)' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, sheet_mode: opt.value })}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition ${
                  form.sheet_mode === opt.value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL
// ════════════════════════════════════════════════════════════

function McqDetail({ examId }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('builder'); // builder | print | scan
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await mcqApi.get(examId);
      setData(d);
      // Fill questions array
      const total = d.exam.total_questions || 20;
      const map = {};
      (d.questions || []).forEach((q) => { map[q.q_number] = q; });
      const list = [];
      for (let i = 1; i <= total; i++) {
        list.push(map[i] || {
          q_number: i,
          question_text: '',
          option_a: '', option_b: '', option_c: '', option_d: '',
          correct_option: 'A',
        });
      }
      setQuestions(list);
    } catch (e) { toast.error(e.message); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [examId]);

  if (loading) return <Loader />;
  if (!data?.exam) return <Card><Empty title="MCQ test not found" /></Card>;

  const updateQ = (idx, patch) => {
    setQuestions((qs) => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  };

  const saveAll = async () => {
    const cleaned = questions.filter((q) => q.question_text?.trim() || q.option_a?.trim());
    if (!cleaned.length) return toast.error('Add at least one question');
    setSaving(true);
    try {
      await mcqApi.saveQuestions(examId, cleaned);
      toast.success(`Saved ${cleaned.length} question(s)`);
      await load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav('/mcq')} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to MCQ list
      </button>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">{data.exam.title}</h2>
        <div className="text-sm text-slate-500 mt-1">
          {data.exam.class_name || '—'} {data.exam.section_name ? `· ${data.exam.section_name}` : ''}
          {' · '}{data.exam.total_questions} questions
          {' · '}{data.exam.marks_per_question} mark(s) each
          {Number(data.exam.negative_marks) > 0 && ` · -${data.exam.negative_marks} per wrong`}
          {' · '}<span className="badge badge-blue">
            {data.exam.sheet_mode === 'tick_only' ? 'Tick-only sheet' : 'Full sheet'}
          </span>
        </div>

        {canWrite && (
          <div className="mt-3 flex gap-2">
            {[
              { value: 'full', label: 'Full sheet (with questions)' },
              { value: 'tick_only', label: 'Tick-only sheet' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={async () => {
                  try {
                    await mcqApi.update(examId, { sheet_mode: opt.value });
                    toast.success('Sheet mode updated');
                    await load();
                  } catch (e) { toast.error(e.message); }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  (data.exam.sheet_mode || 'full') === opt.value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mt-4">
          {[
            { id: 'builder', label: 'Questions', icon: FileText },
            { id: 'print', label: 'Print Sheets', icon: Printer },
            { id: 'scan', label: 'Scan Sheets', icon: Camera },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px ${
                tab === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </Card>

      {tab === 'builder' && (
        <Card className="p-5">
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <h3 className="font-semibold">Questions ({questions.length})</h3>
            {canWrite && (
              <div className="flex gap-2">
                <Button variant="secondary" icon={FileUp} onClick={() => setImportOpen(true)}>
                  Bulk Import
                </Button>
                <Button onClick={saveAll} loading={saving} icon={Save}>
                  Save All
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div key={q.q_number} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Q{q.q_number}
                  </span>
                </div>
                <Input value={q.question_text || ''} placeholder="Question text (optional)"
                  onChange={(e) => updateQ(idx, { question_text: e.target.value })} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {['A','B','C','D'].map((opt) => {
                    const field = `option_${opt.toLowerCase()}`;
                    const isCorrect = q.correct_option === opt;
                    return (
                      <div key={opt} className="relative">
                        <button type="button"
                          onClick={() => updateQ(idx, { correct_option: opt })}
                          className={`absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center z-10 ${
                            isCorrect ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
                          }`}>
                          {opt}
                        </button>
                        <input
                          value={q[field] || ''}
                          onChange={(e) => updateQ(idx, { [field]: e.target.value })}
                          placeholder={`Option ${opt}`}
                          className="input pl-9"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'print' && <PrintTab exam={data.exam} />}
      {tab === 'scan' && <ScanTab exam={data.exam} submissions={data.submissions} onReload={load} />}

      {importOpen && (
        <BulkImportModal
          examId={examId}
          onClose={() => setImportOpen(false)}
          onImported={async () => { setImportOpen(false); await load(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PRINT TAB
// ════════════════════════════════════════════════════════════

function PrintTab({ exam }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentsApi.list({ class_id: exam.class_id, section_id: exam.section_id })
      .then((d) => setStudents(d || []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [exam.id]);

  const download = async (studentId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/mcq/${exam.id}/print/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mcq-${exam.id}-${studentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Users className="w-4 h-4" /> Students ({students.length})
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Download a sheet per student. Each sheet has the roll number and name pre-printed at the top.
      </p>
      {loading ? <Loader /> : students.length === 0 ? (
        <Empty title="No students in this class/section" />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {students.map((s) => (
            <div key={s.id} className="py-2 flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">{s.student_name}</div>
                <div className="text-xs text-slate-500">
                  Roll {s.roll_number || '—'} · {s.admission_number}
                </div>
              </div>
              <Button size="sm" variant="secondary" icon={Printer} onClick={() => download(s.id)}>
                Download
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════
// SCAN TAB
// ════════════════════════════════════════════════════════════

function ScanTab({ exam, submissions, onReload }) {
  const [files, setFiles] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);

  const addFiles = (fl) => {
    const list = Array.from(fl).slice(0, 4 - files.length);
    if (!list.length) return toast.error('Max 4 sheets per batch');
    setFiles((prev) => [...prev, ...list].slice(0, 4));
  };

  const removeFile = (i) => setFiles((p) => p.filter((_, idx) => idx !== i));

  const scan = async () => {
    if (!files.length) return toast.error('Add at least one photo');
    setScanning(true);
    setResults(null);
    try {
      const res = await mcqApi.scan(exam.id, files);
      setResults(res.results || []);
      toast.success(`Scanned ${res.results?.length || 0} sheet(s)`);
      setFiles([]);
      await onReload();
    } catch (e) { toast.error(e.message); }
    finally { setScanning(false); }
  };

  const confirmOne = async (subId, studentId, score) => {
    try {
      await mcqApi.confirm(subId, { student_id: studentId, score });
      toast.success('Confirmed');
      await onReload();
    } catch (e) { toast.error(e.message); }
  };

  const removeSub = async (subId) => {
    if (!window.confirm('Delete this submission?')) return;
    try {
      await mcqApi.removeSubmission(subId);
      toast.success('Deleted');
      await onReload();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4" /> Scan Sheets (max 4)
        </h3>

        <label className="block w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
          <div className="text-sm font-medium">Tap to pick photos</div>
          <div className="text-xs text-slate-500 mt-1">
            Or take photos with your camera. Max 4 sheets, 8 MB each.
          </div>
          <input type="file" accept="image/*" capture="environment" multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>

        {files.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative group">
                <img src={URL.createObjectURL(f)} alt=""
                  className="w-full h-24 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                <button type="button" onClick={() => removeFile(i)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white text-xs">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={scan} loading={scanning} icon={Camera} disabled={!files.length}>
            Scan {files.length ? `(${files.length})` : ''}
          </Button>
        </div>
      </Card>

      {results && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Scan Results</h3>
          <div className="space-y-3">
            {results.map((r) => (
              <div key={r.submission_id}
                className={`rounded-xl border p-3 ${
                  r.status === 'failed' ? 'border-red-300 dark:border-red-500/30' :
                  r.status === 'unmatched' ? 'border-amber-300 dark:border-amber-500/30' :
                  'border-green-300 dark:border-green-500/30'
                }`}>
                <div className="flex items-start gap-3">
                  {r.image_path && (
                    <img src={`${r.image_path}`} alt="" className="w-20 h-24 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {r.status === 'failed' && <XCircle className="w-4 h-4 text-red-600" />}
                      {r.status === 'unmatched' && <AlertCircle className="w-4 h-4 text-amber-600" />}
                      {r.status === 'pending' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                      <span className="font-medium">
                        {r.matched_student_name || r.detected_name || 'Unknown'}
                      </span>
                      {r.detected_roll && (
                        <span className="text-xs text-slate-500">Roll {r.detected_roll}</span>
                      )}
                    </div>
                    {r.error && <div className="text-xs text-red-600 mt-1">{r.error}</div>}
                    <div className="text-xs text-slate-500 mt-1">
                      Correct: {r.correct} · Wrong: {r.wrong} · Blank: {r.blank} · Score: {r.score}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {r.status === 'pending' && (
                      <Button size="sm" onClick={() => confirmOne(r.submission_id, r.student_id, r.score)}>
                        Confirm
                      </Button>
                    )}
                    <button onClick={() => removeSub(r.submission_id)}
                      className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {submissions?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">All Submissions ({submissions.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-2">Student</th>
                  <th className="text-left p-2">Roll</th>
                  <th className="text-right p-2">Score</th>
                  <th className="text-right p-2">C/W/B</th>
                  <th className="text-center p-2">Status</th>
                  <th className="text-right p-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="p-2">{s.student_name_db || s.detected_name || '—'}</td>
                    <td className="p-2 text-xs">{s.detected_roll || s.student_roll || '—'}</td>
                    <td className="p-2 text-right">{s.score ?? '—'}</td>
                    <td className="p-2 text-right text-xs">
                      {s.correct_count}/{s.wrong_count}/{s.blank_count}
                    </td>
                    <td className="p-2 text-center">
                      <span className={`badge ${
                        s.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        s.status === 'failed' ? 'bg-red-100 text-red-700' :
                        s.status === 'unmatched' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{s.status}</span>
                    </td>
                    <td className="p-2 text-right">
                      <button onClick={() => removeSub(s.id)}
                        className="text-xs text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
