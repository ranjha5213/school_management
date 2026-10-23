import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, Bell } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { noticesApi, classesApi } from '../api/endpoints';

const ROLES = [
  { value: 'all', label: 'Everyone' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'parent', label: 'Parents' },
  { value: 'accountant', label: 'Accountants' },
];

export default function NoticeModal({ mode = 'create', initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    content: initial?.content || '',
    target_role: initial?.target_role || 'all',
    target_class_id: initial?.target_class_id || '',
    target_section_id: initial?.target_section_id || '',
    expires_at: initial?.expires_at || '',
  });
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    classesApi.list().then((d) => setClasses(d || [])).catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    if (!form.target_class_id) { setSections([]); return; }
    classesApi.sections(form.target_class_id).then((d) => setSections(d || [])).catch(() => setSections([]));
  }, [form.target_class_id]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    if (!form.content.trim()) return toast.error('Content required');

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        target_role: form.target_role,
        target_class_id: form.target_class_id ? Number(form.target_class_id) : null,
        target_section_id: form.target_section_id ? Number(form.target_section_id) : null,
        expires_at: form.expires_at || null,
      };

      if (mode === 'create') {
        const res = await noticesApi.create(payload);
        toast.success(`Notice posted (${res?.recipients || 0} recipient${res?.recipients === 1 ? '' : 's'})`);
        onSaved?.(res?.id);
      } else {
        await noticesApi.update(initial.id, payload);
        toast.success('Notice updated');
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
      title={mode === 'create' ? 'Post Notice' : 'Edit Notice'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Post Notice' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Input label="Title *" name="title" value={form.title} onChange={onChange}
               placeholder="e.g. Parent-teacher meeting" />

        <div>
          <label className="label">Content *</label>
          <textarea
            name="content"
            value={form.content}
            onChange={onChange}
            rows={5}
            className="input"
            placeholder="Write the announcement…"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Audience</label>
            <select name="target_role" value={form.target_role} onChange={onChange} className="input">
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Class (optional)</label>
            <select name="target_class_id" value={form.target_class_id} onChange={onChange} className="input">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Section (optional)</label>
            <select name="target_section_id" value={form.target_section_id} onChange={onChange}
                    className="input" disabled={!form.target_class_id}>
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>Section {s.section_name}</option>
              ))}
            </select>
          </div>
        </div>

        <Input label="Expires on (optional)" name="expires_at" type="date"
               value={form.expires_at} onChange={onChange} />

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <Bell className="w-3.5 h-3.5" />
          Matching users will see this in their Notices page.
        </div>
      </form>
    </Modal>
  );
}
