import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { feesApi, studentsApi } from '../api/endpoints';

export default function InvoiceModal({ initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    student_id: initial?.student_id || '',
    amount: initial?.amount || '',
    due_date: initial?.due_date || '',
  });
  const [students, setStudents] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    studentsApi.list().then((d) => setStudents(d || [])).catch(() => setStudents([]));
  }, []);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.student_id) return toast.error('Pick a student');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Amount must be > 0');
    setSaving(true);
    try {
      await feesApi.createInvoice({
        student_id: Number(form.student_id),
        amount: Number(form.amount),
        due_date: form.due_date || null,
      });
      toast.success('Invoice created');
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Invoice"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>Create</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Student *</label>
          <select name="student_id" value={form.student_id} onChange={onChange} className="input">
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.student_name} ({s.admission_number})
              </option>
            ))}
          </select>
        </div>
        <Input label="Amount *" name="amount" type="number" value={form.amount} onChange={onChange} />
        <Input label="Due date" name="due_date" type="date" value={form.due_date} onChange={onChange} />
      </form>
    </Modal>
  );
}
