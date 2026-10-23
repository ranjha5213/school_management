import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, BookOpen } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { homeworkApi, classesApi } from '../api/endpoints';

export default function HomeworkModal({ mode = 'create', initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    class_id: initial?.class_id || '',
    subject_id: initial?.subject_id || '',
    due_date: initial?.due_date || '',
    description: initial?.description || '',
    attachment_url: initial?.attachment_url || '',
  });
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    classesApi.list().then((d) => setClasses(d || [])).catch(() => setClasses([]));
  }, []);

  // Load subjects when class changes
  useEffect(() => {
    if (!form.class_id) { setSubjects([]); return; }
    // Subjects come via a lightweight call — reuse timetable or subjects endpoint.
    // Fallback: hit /classes/:id and hope it returns subjects; else empty.
    fetch(`/api/classes/${form.class_id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => r.json())
      .then((j) => setSubjects(j?.data?.subjects || []))
      .catch(() => setSubjects([]));
  }, [form.class_id]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    if (!form.class_id) return toast.error('Pick a class');
    if (!form.subject_id) return toast.error('Pick a subject');
    if (!form.due_date) return toast.error('Due date required');

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        class_id: Number(form.class_id),
        subject_id: Number(form.subject_id),
        due_date: form.due_date,
        description: form.description || null,
        attachment_url: form.attachment_url || null,
      };

      if (mode === 'create') {
        const res = await homeworkApi.create(payload);
        toast.success('Homework created');
        onSaved?.(res?.id);
      } else {
        await homeworkApi.update(initial.id, payload);
        toast.success('Homework updated');
        onSaved?.(initial.id);
      }
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
      title={mode === 'create' ? 'New Homework' : 'Edit Homework'}
      size="lg"
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
        <Input label="Title *" name="title" value={form.title} onChange={onChange}
               placeholder="e.g. Chapter 3 exercises" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Class *</label>
            <select name="class_id" value={form.class_id} onChange={onChange} className="input">
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Subject *</label>
            <select name="subject_id" value={form.subject_id} onChange={onChange} className="input"
                    disabled={!form.class_id}>
              <option value="">{form.class_id ? 'Select subject' : 'Pick a class first'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.subject_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Due date *" name="due_date" type="date" value={form.due_date} onChange={onChange} />
          <Input label="Attachment URL" name="attachment_url" value={form.attachment_url} onChange={onChange}
                 placeholder="https://…" />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            rows={4}
            className="input"
            placeholder="Details, instructions, page numbers…"
          />
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <BookOpen className="w-3.5 h-3.5" />
          {mode === 'create'
            ? 'Your name and the current time will be stamped automatically.'
            : 'Edits will be attributed to you with a timestamp.'}
        </div>
      </form>
    </Modal>
  );
}
