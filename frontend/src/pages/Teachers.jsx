import { useEffect, useState } from 'react';
import { Users, Plus, Search, Edit, Trash2, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import { teachersApi } from '../api/endpoints';

export default function Teachers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  
  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Form state for adding/editing
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', employee_code: '', qualification: '', department_id: ''
  });

  // 👇 Updated Permissions state with view_* keys
  const [permissions, setPermissions] = useState({
    view_student: true, add_student: false, edit_student: false, delete_student: false,
    view_class: true, add_class: false, edit_class: false, delete_class: false,
    view_attendance: true, edit_attendance: false
  });

  const fetchTeachers = () => {
    setLoading(true);
    teachersApi.list()
      .then((d) => setRows(d || []))
      .catch((err) => toast.error(err.message || 'Failed to load teachers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  // Load permissions when clicking Edit
  useEffect(() => {
    if (editingTeacher) {
      setFormData({
        name: editingTeacher.name || '',
        email: editingTeacher.email || '',
        phone: editingTeacher.phone || '',
        employee_code: editingTeacher.employee_code || '',
        qualification: editingTeacher.qualification || '',
        department_id: editingTeacher.department_id || '',
      });
      
      // Parse the permissions JSON from the database
      try {
        const parsed = editingTeacher.permissions ? JSON.parse(editingTeacher.permissions) : {};
        setPermissions({
          view_student: parsed.view_student ?? true, // Default to true if not set
          add_student: parsed.add_student || false,
          edit_student: parsed.edit_student || false,
          delete_student: parsed.delete_student || false,
          
          view_class: parsed.view_class ?? true,
          add_class: parsed.add_class || false,
          edit_class: parsed.edit_class || false,
          delete_class: parsed.delete_class || false,
          
          view_attendance: parsed.view_attendance ?? true,
          edit_attendance: parsed.edit_attendance || false,
        });
      } catch (e) {
        console.error("Failed to parse permissions", e);
      }
    } else {
      // Reset form when closing
      setFormData({ name: '', email: '', phone: '', employee_code: '', qualification: '', department_id: '' });
      setPermissions({
        view_student: true, add_student: false, edit_student: false, delete_student: false,
        view_class: true, add_class: false, edit_class: false, delete_class: false,
        view_attendance: true, edit_attendance: false
      });
    }
  }, [editingTeacher]);

  const handlePermissionChange = (key) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        permissions: permissions // 👈 Send permissions to backend
      };
      await teachersApi.update(editingTeacher.id, payload);
      toast.success('Teacher updated successfully');
      setEditingTeacher(null);
      fetchTeachers();
    } catch (err) {
      toast.error(err.message || 'Failed to update teacher');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await teachersApi.remove(deletingId);
      toast.success('Teacher removed successfully');
      setRows(rows.filter((r) => r.id !== deletingId));
      setDeletingId(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete teacher');
    }
  };

  const filtered = q
    ? rows.filter((r) =>
        r.name?.toLowerCase().includes(q.toLowerCase()) ||
        r.email?.toLowerCase().includes(q.toLowerCase()) ||
        r.employee_code?.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-600" /> Teachers ({filtered.length})
          </h3>
          
          <button 
            onClick={() => setIsAddOpen(true)} 
            className="btn btn-primary flex items-center gap-1.5 text-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Teacher
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name, email, or employee code"
            className="input pl-9"
          />
        </div>

        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <Empty title="No teachers found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Employee Code</th>
                  <th className="text-left p-3">Permissions</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((r) => {
                  let permsCount = 0;
                  try { permsCount = Object.values(JSON.parse(r.permissions || '{}')).filter(Boolean).length; } catch(e) {}
                  
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3 text-slate-500">{r.email || '—'}</td>
                      <td className="p-3 font-mono text-xs">{r.employee_code || '—'}</td>
                      <td className="p-3">
                        {r.role === 'admin' ? (
                          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded">Full Admin</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Shield className="w-3.5 h-3.5" /> {permsCount} privilege(s)
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-1">
                        <button
                          onClick={() => setEditingTeacher(r)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded"
                          title="Edit Teacher & Permissions"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(r.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded"
                          title="Remove Teacher"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── EDIT TEACHER MODAL ── */}
      {editingTeacher && (
        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <form
            onSubmit={handleUpdateSubmit}
            className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-3xl space-y-4 shadow-xl my-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Teacher & Privileges</h3>
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Employee Code</label>
                <input
                  type="text"
                  value={formData.employee_code}
                  onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>

            {/* 👇 PERMISSIONS SECTION 👇 */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-600" /> System Privileges
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                
                {/* Students */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Students</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition font-medium">
                    <input type="checkbox" checked={permissions.view_student || false} 
                      onChange={() => handlePermissionChange('view_student')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    View Students
                  </label>
                  <hr className="border-slate-200 dark:border-slate-700 my-1" />
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition">
                    <input type="checkbox" checked={permissions.add_student || false} 
                      onChange={() => handlePermissionChange('add_student')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    Add Student
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition">
                    <input type="checkbox" checked={permissions.edit_student || false} 
                      onChange={() => handlePermissionChange('edit_student')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    Edit Student
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition">
                    <input type="checkbox" checked={permissions.delete_student || false} 
                      onChange={() => handlePermissionChange('delete_student')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    Delete Student
                  </label>
                </div>

                {/* Classes */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Classes / Sections</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition font-medium">
                    <input type="checkbox" checked={permissions.view_class || false} 
                      onChange={() => handlePermissionChange('view_class')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    View Classes
                  </label>
                  <hr className="border-slate-200 dark:border-slate-700 my-1" />
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition">
                    <input type="checkbox" checked={permissions.add_class || false} 
                      onChange={() => handlePermissionChange('add_class')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    Add Class/Section
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition">
                    <input type="checkbox" checked={permissions.edit_class || false} 
                      onChange={() => handlePermissionChange('edit_class')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    Edit Class/Section
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition">
                    <input type="checkbox" checked={permissions.delete_class || false} 
                      onChange={() => handlePermissionChange('delete_class')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    Delete Class/Section
                  </label>
                </div>

                {/* Attendance */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attendance</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition font-medium">
                    <input type="checkbox" checked={permissions.view_attendance || false} 
                      onChange={() => handlePermissionChange('view_attendance')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    View Attendance
                  </label>
                  <hr className="border-slate-200 dark:border-slate-700 my-1" />
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand-600 transition">
                    <input type="checkbox" checked={permissions.edit_attendance || false} 
                      onChange={() => handlePermissionChange('edit_attendance')} 
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" />
                    Mark/Edit Attendance
                  </label>
                </div>

              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700 mt-4">
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
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
          title="Delete Teacher"
          message="Are you sure you want to remove this teacher? This action cannot be undone."
        />
      )}
    </div>
  );
}
