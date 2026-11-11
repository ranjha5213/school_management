import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, UserPlus, Trash2, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import AddStudentModal from '../components/AddStudentModal';
import { studentsApi, classesApi } from '../api/endpoints';

export default function Students() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  // Sections state for Add Student modal
  const [sections, setSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchStudents = () => {
    setLoading(true);
    studentsApi.list()
      .then((d) => setRows(d || []))
      .catch((err) => toast.error(err.message || 'Failed to load students'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStudents();

    // Fetch classes and flatten their sections for the Add Student workflow
    classesApi.list().then(async (classList) => {
      const allSections = [];
      if (classList) {
        for (const cls of classList) {
          const secs = await classesApi.sections(cls.id).catch(() => []);
          allSections.push(...(secs || []).map((s) => ({ ...s, className: cls.class_name, name: s.section_name })));
        }
      }
      setSections(allSections);
      if (allSections.length > 0) {
        setSelectedSectionId(allSections[0].id);
      }
    }).catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await studentsApi.remove(deletingId);
      toast.success('Student removed successfully');
      setRows(rows.filter((r) => r.id !== deletingId));
      setDeletingId(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete student');
    }
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    const s = editingStudent;
    try {
      const payload = {
        // users
        name:  s.student_name || s.name || undefined,
        email: s.email        || undefined,
        phone: s.phone        || undefined,
        // students
        roll_number:      s.roll_number      ?? undefined,
        gender:           s.gender           || undefined,
        dob:              s.dob              || undefined,
        guardian_name:    s.guardian_name    || undefined,
        guardian_phone:   s.guardian_phone   || undefined,
        guardian_name_en: s.guardian_name_en || undefined,
        name_en:          s.name_en          || undefined,
      };
      await studentsApi.update(s.id, payload);
      toast.success('Student updated successfully');
      setEditingStudent(null);
      fetchStudents();
    } catch (err) {
      toast.error(err.message || 'Failed to update student');
    }
  };

  const filtered = q
    ? rows.filter((r) =>
        r.student_name?.toLowerCase().includes(q.toLowerCase()) ||
        r.admission_number?.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  const currentSectionName = (() => {
    const sec = sections.find((s) => s.id === selectedSectionId);
    return sec ? `${sec.className} - ${sec.section_name}` : 'General';
  })();


  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-600" /> Students ({filtered.length})
          </h3>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="input text-sm py-1.5"
            >
              <option value="">Select Section for New Student</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.className} - {sec.name}
                </option>
              ))}
            </select>

            <button 
              onClick={() => {
                if (!selectedSectionId) {
                  toast.error('Please select a section first');
                  return;
                }
                setIsAddOpen(true);
              }} 
              className="btn btn-primary flex items-center gap-1.5 text-sm whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" /> Add Student
            </button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name or admission #"
            className="input pl-9"
          />
        </div>

        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <Empty title="No students" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Phone</th>
                  <th className="text-left p-3">Admission #</th>
                  <th className="text-left p-3">Roll</th>
                  <th className="text-left p-3">Class</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => nav(`/students/${r.id}`)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="p-3 font-medium">{r.student_name}</td>
                    <td className="p-3 text-slate-500">{r.email || '—'}</td>
                    <td className="p-3 text-slate-500">{r.phone || '—'}</td>
                    <td className="p-3 font-mono text-xs">{r.admission_number}</td>
                    <td className="p-3">{r.roll_number || '—'}</td>
                    <td className="p-3 text-slate-500">{r.class_name} · {r.section_name}</td>
                    <td className="p-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditingStudent(r)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded"
                        title="Edit Student"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingId(r.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded"
                        title="Remove Student"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Student Modal */}
      {isAddOpen && selectedSectionId && (
        <AddStudentModal
          sectionId={selectedSectionId}
          sectionName={currentSectionName}
          onClose={() => setIsAddOpen(false)}
          onSaved={() => {
            setIsAddOpen(false);
            fetchStudents();
          }}
        />
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <form
            onSubmit={handleUpdateSubmit}
            className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-2xl space-y-4 shadow-xl my-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Student</h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* ── Identity ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name (English) *</label>
                <input
                  type="text"
                  value={editingStudent.student_name || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, student_name: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Name (Urdu)</label>
                <input
                  type="text"
                  value={editingStudent.name_en || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name_en: e.target.value })}
                  className="input w-full"
                  dir="rtl"
                  placeholder="اختیاری"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={editingStudent.email || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, email: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  value={editingStudent.phone || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                  className="input w-full"
                  placeholder="03XX-XXXXXXX"
                />
              </div>
            </div>

            {/* ── Academic ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Admission #</label>
                <input
                  type="text"
                  value={editingStudent.admission_number || ''}
                  className="input w-full bg-slate-50 dark:bg-slate-800 text-slate-500"
                  readOnly
                  title="Admission number is fixed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Roll Number</label>
                <input
                  type="text"
                  value={editingStudent.roll_number || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, roll_number: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gender</label>
                <select
                  value={editingStudent.gender || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, gender: e.target.value || null })}
                  className="input w-full"
                >
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={(editingStudent.dob || '').slice(0, 10)}
                  onChange={(e) => setEditingStudent({ ...editingStudent, dob: e.target.value || null })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Class · Section</label>
                <div className="input w-full bg-slate-50 dark:bg-slate-800 text-slate-500">
                  {editingStudent.class_name || '—'} · Section {editingStudent.section_name || '—'}
                </div>
              </div>
            </div>

            {/* ── Guardian ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Father / Guardian (English)</label>
                <input
                  type="text"
                  value={editingStudent.guardian_name_en || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, guardian_name_en: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Father / Guardian (Urdu)</label>
                <input
                  type="text"
                  value={editingStudent.guardian_name || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, guardian_name: e.target.value })}
                  className="input w-full"
                  dir="rtl"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Guardian Phone</label>
              <input
                type="tel"
                value={editingStudent.guardian_phone || ''}
                onChange={(e) => setEditingStudent({ ...editingStudent, guardian_phone: e.target.value })}
                className="input w-full"
                placeholder="03XX-XXXXXXX"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <ConfirmDelete
          open={!!deletingId}
          onClose={() => setDeletingId(null)}
          onConfirm={handleDelete}
          title="Delete Student"
          message="Are you sure you want to remove this student? This action cannot be undone."
        />
      )}
    </div>
  );
}
