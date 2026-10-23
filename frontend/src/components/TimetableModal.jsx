import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { timetableApi } from '../api/endpoints';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetableModal({
  mode = 'create',
  sectionId,
  initial = null,
  subjects = [],
  teachers = [],
  defaultDay = 'Monday',
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    subject_id: initial?.subject_id || '',
    teacher_id: initial?.teacher_id || '',
    day_of_week: initial?.day_of_week || defaultDay,
    start_time: initial?.start_time ? initial.start_time.slice(0, 5) : '08:00',
    end_time: initial?.end_time ? initial.end_time.slice(0, 5) : '08:45',
  });
  const [saving, setSaving] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subject_id) return toast.error('Pick a subject');
    if (!form.start_time || !form.end_time) return toast.error('Set start and end times');
    if (form.start_time >= form.end_time) return toast.error('Start must be before end');

    setSaving(true);
    try {
      const payload = {
        section_id: sectionId,
        subject_id: Number(form.subject_id),
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        end_time: form.end_time,
      };
      if (mode === 'create') {
        await timetableApi.create(payload);
        toast.success('Slot added');
      } else {
        await timetableApi.update(initial.id, payload);
        toast.success('Slot updated');
      }
      onSaved?.();
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
      title={mode === 'create' ? 'Add Slot' : 'Edit Slot'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Add Slot' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Subject *</label>
          <select name="subject_id" value={form.subject_id} onChange={onChange} className="input">
            <option value="">Select subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.subject_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Teacher (optional)</label>
          <select name="teacher_id" value={form.teacher_id} onChange={onChange} className="input">
            <option value="">Unassigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Day *</label>
          <select name="day_of_week" value={form.day_of_week} onChange={onChange} className="input">
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Start time *" name="start_time" type="time" value={form.start_time} onChange={onChange} />
          <Input label="End time *" name="end_time" type="time" value={form.end_time} onChange={onChange} />
        </div>

        <div className="text-xs text-slate-500 pt-1">
          Conflicts with existing slots (same section or same teacher) will be rejected.
        </div>
      </form>
    </Modal>
  );
}
