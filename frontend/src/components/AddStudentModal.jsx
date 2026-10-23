import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import PasswordInput from './PasswordInput';
import { classesApi } from '../api/endpoints';

export default function AddStudentModal({ sectionId, sectionName, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    roll_number: '',
    gender: '',
    dob: '',
    guardian_name: '',
    guardian_phone: '',
    admission_number: '',
  });
  const [saving, setSaving] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name required');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Valid email required');
    if (form.password && form.password.length < 6)
      return toast.error('Password must be at least 6 characters (or leave blank)');

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        roll_number: form.roll_number || null,
        gender: form.gender || null,
        dob: form.dob || null,
        guardian_name: form.guardian_name || null,
        guardian_phone: form.guardian_phone || null,
        admission_number: form.admission_number || null,
      };
      const res = await classesApi.addStudentToSection(sectionId, payload);
      toast.success(`Added ${res?.name || 'student'} (${res?.admission_number || ''})`);
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
      title={`Add Student — Section ${sectionName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={Save}>Add Student</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Full name *" name="name" value={form.name} onChange={onChange} />
          <Input label="Email *" name="email" type="email" value={form.email} onChange={onChange} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PasswordInput
            label="Password (optional — default: changeme123)"
            name="password"
            value={form.password}
            onChange={onChange}
          />
          <Input
            label="Admission # (auto if blank)"
            name="admission_number"
            value={form.admission_number}
            onChange={onChange}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Roll number" name="roll_number" value={form.roll_number} onChange={onChange} />
          <div>
            <label className="label">Gender</label>
            <select name="gender" value={form.gender} onChange={onChange} className="input">
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Date of birth" name="dob" type="date" value={form.dob} onChange={onChange} />
          <Input label="Guardian name" name="guardian_name" value={form.guardian_name} onChange={onChange} />
        </div>

        <Input label="Guardian phone" name="guardian_phone" value={form.guardian_phone} onChange={onChange} />

        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
          <UserPlus className="w-3.5 h-3.5" />
          Student is created active — can log in immediately.
        </div>
      </form>
    </Modal>
  );
}
