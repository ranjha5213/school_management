import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function TimetableAdd() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState({
    classId: '', sectionId: '', subjectId: '', teacherId: '',
    day: 'monday', start: '08:55', end: '09:15',
  });
  const [saving, setSaving] = useState(false);

  // Extract array from various response shapes
  const extract = (res) => {
    const d = res.data?.data ?? res.data;
    return Array.isArray(d) ? d : [];
  };

  useEffect(() => {
    api.get('/classes').then((r) => setClasses(extract(r))).catch(() => setClasses([]));
    api.get('/subjects').then((r) => setSubjects(extract(r))).catch(() => setSubjects([]));
    api.get('/teachers').then((r) => setTeachers(extract(r))).catch(() => setTeachers([]));
  }, []);

  useEffect(() => {
    if (!form.classId) { setSections([]); return; }
    api.get(`/classes/${form.classId}/sections`)
      .then((r) => {
        const d = r.data?.data ?? r.data;
        setSections(Array.isArray(d) ? d : []);
      })
      .catch(() => setSections([]));
  }, [form.classId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.sectionId || !form.subjectId) {
      return toast.error('Section and subject are required');
    }
    if (!form.start || !form.end) {
      return toast.error('Start and end time are required');
    }
    if (form.start >= form.end) {
      return toast.error('Start time must be before end time');
    }

    setSaving(true);
    try {
      // Uses the existing `createSlot` handler at POST /timetable
      // (validates, checks conflicts, respects admin-approval workflow for teachers)
      await api.post('/timetable', {
        section_id: Number(form.sectionId),
        subject_id: Number(form.subjectId),
        teacher_id: form.teacherId ? Number(form.teacherId) : null,
        day_of_week: form.day,
        start_time: form.start,
        end_time: form.end,
      });
      toast.success('Slot added');
      navigate('/timetable/view');
    } catch (e) {
      toast.error(e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add Timetable Slot</h1>
        <button
          onClick={() => navigate('/timetable/view')}
          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          ← Back to View
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-slate-500">Class</span>
            <select
              value={form.classId}
              onChange={(e) => set('classId', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">Section</span>
            <select
              value={form.sectionId}
              onChange={(e) => set('sectionId', e.target.value)}
              disabled={!form.classId}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-900 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">{form.classId ? 'Select section' : 'Select class first'}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.section_name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">Subject</span>
            <select
              value={form.subjectId}
              onChange={(e) => set('subjectId', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.subject_name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">Teacher (optional)</span>
            <select
              value={form.teacherId}
              onChange={(e) => set('teacherId', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
            >
              <option value="">—</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">Day</span>
            <select
              value={form.day}
              onChange={(e) => set('day', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-900 px-3 py-1.5 text-sm capitalize"
            >
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>

          <div />

          <label className="block">
            <span className="text-xs text-slate-500">Start time</span>
            <input
              type="time"
              value={form.start}
              onChange={(e) => set('start', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500">End time</span>
            <input
              type="time"
              value={form.end}
              onChange={(e) => set('end', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => navigate('/timetable/view')}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm
                       hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add Slot'}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Note: for teachers, this will be submitted for admin approval before taking effect.
      </p>
    </div>
  );
}
