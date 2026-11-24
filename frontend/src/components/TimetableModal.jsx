// src/components/TimetableModal.jsx
import { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { teachersApi } from '../api/endpoints';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const normalizeList = (d) => (Array.isArray(d) ? d : d?.data ?? []);

export default function TimetableModal({
  open,
  onClose,
  sectionId,
  initial = null,
  subjects = [],
  defaultStartTime = '08:00',
  defaultEndTime = '08:35',
  onSaved,
}) {
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState({
    subject_id: '',
    teacher_id: '',
    day_of_week: 'monday',
    start_time: defaultStartTime,
    end_time: defaultEndTime,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError('');

    setForm({
      subject_id: initial?.subject_id ?? '',
      teacher_id: initial?.teacher_id ?? '',
      day_of_week: String(initial?.day_of_week || 'monday').toLowerCase(),
      start_time: initial?.start_time ? String(initial.start_time).slice(0, 5) : defaultStartTime,
      end_time: initial?.end_time ? String(initial.end_time).slice(0, 5) : defaultEndTime,
    });

    teachersApi
      .list()
      .then((d) => {
        if (!cancelled) setTeachers(normalizeList(d));
      })
      .catch(() => {
        if (!cancelled) setTeachers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, initial, defaultStartTime, defaultEndTime]);

  const set = (k) => (e) => {
    if (error) setError('');
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!sectionId || saving) return;

    if (!form.subject_id) {
      setError('Please select a subject.');
      return;
    }

    if (form.start_time && form.end_time && form.end_time <= form.start_time) {
      setError('End time must be after start time.');
      return;
    }

    setSaving(true);
    setError('');
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
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save slot.');
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
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Save Slot
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-500/60 px-3 py-2 text-xs text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <Select
          label="Subject"
          value={form.subject_id}
          onChange={set('subject_id')}
          options={subjects.map((s) => ({
            value: s.id ?? s.subject_id,
            label: s.subject_name ?? s.name ?? '',
          }))}
          placeholder="Select subject"
        />

        <Select
          label="Teacher"
          value={form.teacher_id}
          onChange={set('teacher_id')}
          options={teachers.map((t) => ({
            value: t.id ?? t.teacher_id,
            label: t.name ?? t.teacher_name ?? '',
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

