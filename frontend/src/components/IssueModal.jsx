import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { libraryApi, studentsApi } from '../api/endpoints';

export default function IssueModal({ book, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [studentId, setStudentId] = useState('');
  const [dueDate, setDueDate] = useState(in14);
  const [students, setStudents] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    studentsApi.list().then((d) => setStudents(d || [])).catch(() => setStudents([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!studentId) return toast.error('Pick a student');
    setSaving(true);
    try {
      await libraryApi.issue({ book_id: book.id, student_id: Number(studentId), due_date: dueDate });
      toast.success('Book issued');
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Issue — ${book.title}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>Issue</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Student *</label>
          <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.student_name} ({s.admission_number})</option>
            ))}
          </select>
        </div>
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <div className="text-xs text-slate-500">Fine: 5/day after due date</div>
      </form>
    </Modal>
  );
}
