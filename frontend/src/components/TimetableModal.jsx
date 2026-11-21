// src/components/TimetableModal.jsx
import { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { teachersApi } from '../api/endpoints';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function TimetableModal({
  open,
  onClose,
  sectionId,
  initial = null,
  subjects = [],
  onSaved,
}) {
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState({
    subject_id: '',
    teacher_id: '',
    day_of_week: 'monday',
    start_time: '08:00',
    end_time: '08:40',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    teachersApi
      .list()
      .then((d) => setTeachers(Array.isArray(d) ? d : d?.data || []))
      .catch(() => setTeachers([]));

    setForm({
      subject_id: initial?.subject_id || '',
      teacher_id: initial?.teacher_id || '',
      day_of_week: (initial?.day_of_week || 'monday').toLowerCase(),
      start_time: initial?.start_time ? String(initial.start_time).slice(0, 5) : '08:00',
      end_time: initial?.end_time ? String(initial.end_time).slice(0, 5) : '08:40',
    });
  }, [open, initial]);

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!sectionId) return;
    setSaving(true);
    try {
      await onSaved?.({
        section_id: Number(sectionId),
        subject_id: form.subject_id ? Number(form.subject_id) : null,
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        end_time: form.end_time,
      });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? 'Edit Timetable Slot' : 'Add Timetable Slot'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Save Slot
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Select
          label="Subject"
          value={form.subject_id}
          onChange={set('subject_id')}
          options={subjects.map((s) => ({
            value: s.id ?? s.subject_id,
            label: s.subject_name || s.name,
          }))}
          placeholder="Select subject"
        />

        <Select
          label="Teacher"
          value={form.teacher_id}
          onChange={set('teacher_id')}
          options={teachers.map((t) => ({
            value: t.id ?? t.teacher_id,
            label: t.name || t.teacher_name,
          }))}
          placeholder="Select teacher"
        />

        <Select
          label="Day of Week"
          value={form.day_of_week}
          onChange={set('day_of_week')}
          options={DAYS.map((d) => ({
            value: d,
            label: d[0].toUpperCase() + d.slice(1),
          }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start Time"
            type="time"
            value={form.start_time}
            onChange={set('start_time')}
          />
          <Input
            label="End Time"
            type="time"
            value={form.end_time}
            onChange={set('end_time')}
          />
        </div>
      </form>
    </Modal>
  );
}

