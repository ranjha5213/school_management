import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, GraduationCap } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import PasswordInput from './PasswordInput';
import { teachersApi } from '../api/endpoints';

export default function AddTeacherModal({ mode = 'create', initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    password: '',
    employee_code: initial?.employee_code || '',
    department_id: initial?.department_id || '',
    qualification: initial?.qualification || '',
    join_date: initial?.join_date || '',
    salary: initial?.salary ?? '',
  });
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    teachersApi.departments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name required');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Valid email required');
    if (mode === 'create' && form.password && form.password.length < 6)
      return toast.error('Password must be at least 6 characters');

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone || null,
        employee_code: form.employee_code.trim() || null,
        department_id: form.department_id ? Number(form.department_id) : null,
        qualification: form.qualification || null,
        join_date: form.join_date || null,
        salary: form.salary === '' ? null : Number(form.salary),
      };
      if (mode === 'create' && form.password) payload.password = form.password;

      if (mode === 'create') {
        const res = await teachersApi.create(payload);
        toast.success(`Added ${res?.name || 'teacher'} (${res?.employee_code || ''})`);
      } else {
        await teachersApi.update(initial.id, payload);
        toast.success('Teacher updated');
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
      title={mode === 'create' ? 'Add Teacher' : 'Edit Teacher'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>
            {mode === 'create' ? 'Add Teacher' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Full name *" name="name" value={form.name} onChange={onChange} />
          <Input label="Email *" name="email" type="email" value={form.email} onChange={onChange} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Phone" name="phone" value={form.phone} onChange={onChange} />
          <Input label="Employee code (auto if blank)" name="employee_code" value={form.employee_code} onChange={onChange} />
        </div>

        {mode === 'create' && (
          <PasswordInput
            label="Password (optional — default: changeme123)"
            name="password"
            value={form.password}
            onChange={onChange}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Department</label>
            <select name="department_id" value={form.department_id} onChange={onChange} className="input">
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.department_name}</option>
              ))}
            </select>
          </div>
          <Input label="Qualification" name="qualification" value={form.qualification} onChange={onChange} placeholder="e.g. M.Sc Math" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Join date" name="join_date" type="date" value={form.join_date} onChange={onChange} />
          <Input label="Salary" name="salary" type="number" value={form.salary} onChange={onChange} placeholder="0" />
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <GraduationCap className="w-3.5 h-3.5" />
          {mode === 'create'
            ? 'Teacher is created active — can log in immediately.'
            : 'Only fill in fields you want to change.'}
        </div>
      </form>
    </Modal>
  );
}
