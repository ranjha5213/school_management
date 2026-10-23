import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, FileText, Plus, Clock, KeyRound, Camera, Globe } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { examsApi, classesApi, mcqApi } from '../api/endpoints';

function toLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(local) { return local ? new Date(local).toISOString() : null; }

export default function ExamModal({ mode = 'create', initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    exam_name: initial?.exam_name || initial?.title || '',
    exam_type_id: initial?.exam_type_id || '',
    class_id: initial?.class_id || '',
    start_date: initial?.start_date || '',
    end_date: initial?.end_date || '',
    total_marks: initial?.total_marks ?? '',
    passing_marks: initial?.passing_marks ?? '',
    // Online MCQ settings
    is_published: !!initial?.is_published,
    has_timer: initial?.time_limit_minutes != null,
    time_limit_minutes: initial?.time_limit_minutes ?? 30,
    use_code: !!initial?.access_code,
    access_code: initial?.access_code || '',
    proctoring_enabled: !!initial?.proctoring_enabled,
    schedule: !!initial?.scheduled_start_at,
    scheduled_start_at: toLocal(initial?.scheduled_start_at),
    scheduled_end_at: toLocal(initial?.scheduled_end_at),
  });

  const [types, setTypes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [saving, setSaving] = useState(false);

  // New type inline
  const [newType, setNewType] = useState('');
  const [addingType, setAddingType] = useState(false);

  useEffect(() => {
    Promise.all([
      examsApi.types().catch(() => []),
      classesApi.list().catch(() => []),
    ]).then(([t, c]) => {
      setTypes(t || []);
      setClasses(c || []);
    });
  }, []);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const addType = async () => {
    if (!newType.trim()) return;
    setAddingType(true);
    try {
      const res = await examsApi.createType({ type_name: newType.trim() });
      toast.success('Exam type added');
      setNewType('');
      const updated = await examsApi.types();
      setTypes(updated);
      setForm({ ...form, exam_type_id: res.id });
    } catch (e) { toast.error(e.message); }
    finally { setAddingType(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.exam_name.trim()) return toast.error('Exam name required');
    if (!form.class_id) return toast.error('Pick a class');

    setSaving(true);
    try {
      const payload = {
        exam_name: form.exam_name.trim(),
        exam_type_id: form.exam_type_id ? Number(form.exam_type_id) : null,
        class_id: form.class_id ? Number(form.class_id) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        total_marks: form.total_marks === '' ? null : Number(form.total_marks),
        passing_marks: form.passing_marks === '' ? null : Number(form.passing_marks),
      };

      let examId = initial?.id;

      if (mode === 'create') {
        const res = await examsApi.create(payload);
        examId = res?.id;
        toast.success('Exam created');
      } else {
        await examsApi.update(initial.id, payload);
        toast.success('Exam updated');
      }

      // If online MCQ schedule / settings are supported on update/create:
      if (examId) {
        try {
          await mcqApi.updateExamSettings?.(examId, {
            is_published: form.schedule ? false : form.is_published,
            time_limit_minutes: form.has_timer ? Number(form.time_limit_minutes) : null,
            access_code: form.use_code ? form.access_code.trim() : null,
            proctoring_enabled: form.proctoring_enabled,
          });
          await mcqApi.updateExamSchedule?.(examId, {
            scheduled_start_at: form.schedule ? toIso(form.scheduled_start_at) : null,
            scheduled_end_at: form.schedule ? toIso(form.scheduled_end_at) : null,
          });
        } catch {
          // Fallback if backend endpoints differ slightly
        }
      }

      onSaved?.(examId);
      onClose?.();
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? 'Create Exam' : 'Edit Exam & Settings'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Create Exam' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Exam name *" name="exam_name" value={form.exam_name} onChange={onChange}
               placeholder="e.g. Mid-Term Mathematics 2026" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Exam type</label>
            <div className="flex gap-2">
              <select name="exam_type_id" value={form.exam_type_id} onChange={onChange} className="input">
                <option value="">—</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.type_name}</option>
                ))}
              </select>
              <Button type="button" size="sm" variant="secondary" icon={Plus}
                onClick={() => setAddingType(!addingType)}>New</Button>
            </div>
            {addingType && (
              <div className="flex gap-2 mt-2">
                <input className="input" placeholder="Type name (e.g. Mid-Term)"
                  value={newType} onChange={(e) => setNewType(e.target.value)} />
                <Button type="button" size="sm" onClick={addType} loading={addingType}>Add</Button>
              </div>
            )}
          </div>

          <div>
            <label className="label">Class *</label>
            <select name="class_id" value={form.class_id} onChange={onChange} className="input">
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Start date" name="start_date" type="date" value={form.start_date} onChange={onChange} />
          <Input label="End date" name="end_date" type="date" value={form.end_date} onChange={onChange} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Total marks" name="total_marks" type="number" value={form.total_marks} onChange={onChange} placeholder="100" />
          <Input label="Passing marks" name="passing_marks" type="number" value={form.passing_marks} onChange={onChange} placeholder="40" />
        </div>

        <hr className="border-slate-200 dark:border-slate-700 my-4" />

        <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Online MCQ Configuration &amp; Schedule</h4>

        {/* Publish */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
          <input type="checkbox" checked={form.is_published}
            onChange={(e) => setForm({ ...form, is_published: e.target.checked })} className="mt-1" disabled={form.schedule} />
          <div>
            <div className="flex items-center gap-2 font-medium text-sm">
              <Globe className="w-4 h-4" /> Publish online immediately
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {form.schedule ? 'Disabled while a schedule is set (publishes automatically).' : 'Allow students to see and start this exam.'}
            </div>
          </div>
        </label>

        {/* Timer */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
          <input type="checkbox" checked={form.has_timer}
            onChange={(e) => setForm({ ...form, has_timer: e.target.checked })} className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Clock className="w-4 h-4" /> Time limit
            </div>
            {form.has_timer ? (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} max={600} value={form.time_limit_minutes}
                  onChange={(e) => setForm({ ...form, time_limit_minutes: e.target.value })} className="input w-24" />
                <span className="text-sm text-slate-500">minutes</span>
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-1">No timer.</div>
            )}
          </div>
        </label>

        {/* Access Code */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
          <input type="checkbox" checked={form.use_code}
            onChange={(e) => setForm({ ...form, use_code: e.target.checked })} className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium text-sm">
              <KeyRound className="w-4 h-4" /> Access code
            </div>
            {form.use_code ? (
              <input type="text" value={form.access_code}
                onChange={(e) => setForm({ ...form, access_code: e.target.value })}
                placeholder="e.g. MATH2026" className="input mt-2 w-full" />
            ) : (
              <div className="text-xs text-slate-500 mt-1">No code required.</div>
            )}
          </div>
        </label>

        {/* Proctoring */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
          <input type="checkbox" checked={form.proctoring_enabled}
            onChange={(e) => setForm({ ...form, proctoring_enabled: e.target.checked })} className="mt-1" />
          <div>
            <div className="flex items-center gap-2 font-medium text-sm">
              <Camera className="w-4 h-4" /> Proctoring
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Webcam snapshots + tab/blur events will be recorded during the test.
            </div>
          </div>
        </label>

        {/* Schedule */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
          <input type="checkbox" checked={form.schedule}
            onChange={(e) => setForm({ ...form, schedule: e.target.checked })} className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium text-sm">
              ⏰ Automated Scheduler
            </div>
            {form.schedule ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Opens at</label>
                  <input type="datetime-local" value={form.scheduled_start_at}
                    onChange={(e) => setForm({ ...form, scheduled_start_at: e.target.value })} className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Closes at</label>
                  <input type="datetime-local" value={form.scheduled_end_at}
                    onChange={(e) => setForm({ ...form, scheduled_end_at: e.target.value })} className="input w-full" />
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-1">
                No schedule — opens manually when published.
              </div>
            )}
          </div>
        </label>

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <FileText className="w-3.5 h-3.5" />
          After saving, you can add questions and view student attempts/results.
        </div>
      </form>
    </Modal>
  );
}

