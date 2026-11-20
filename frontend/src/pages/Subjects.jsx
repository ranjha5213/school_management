// src/pages/Subjects.jsx
import React, { useState, useEffect } from 'react';
import api from '../api/client';

export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('');

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [formData, setFormData] = useState({
    subject_name: '',
    subject_code: '',
    class_id: '',
    section_id: '' // Added section support
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch subjects, classes, and sections concurrently with graceful fallbacks
      const [subRes, classRes, secRes] = await Promise.all([
        api.get('/subjects'),
        api.get('/classes').catch(() => ({ data: { data: [] } })),
        api.get('/sections').catch(() => ({ data: { data: [] } }))
      ]);

      if (subRes.data.success) {
        setSubjects(subRes.data.data);
      }
      if (classRes.data && classRes.data.success) {
        setClasses(classRes.data.data);
      }
      if (secRes.data && secRes.data.success) {
        setSections(secRes.data.data);
      }
    } catch (err) {
      setError('Failed to load subjects data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const openAddModal = () => {
    setEditingSubject(null);
    setFormData({ subject_name: '', subject_code: '', class_id: '', section_id: '' });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (sub) => {
    setEditingSubject(sub);
    setFormData({
      subject_name: sub.subject_name || '',
      subject_code: sub.subject_code || '',
      class_id: sub.class_id || '',
      section_id: sub.section_id || ''
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.subject_name.trim()) {
      setFormError('Subject name is required');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      
      const payload = {
        subject_name: formData.subject_name,
        subject_code: formData.subject_code || null,
        class_id: formData.class_id ? Number(formData.class_id) : null,
        section_id: formData.section_id ? Number(formData.section_id) : null
      };

      if (editingSubject) {
        const res = await api.put(`/subjects/${editingSubject.id}`, payload);
        if (res.data.success) {
          setIsModalOpen(false);
          fetchData();
        }
      } else {
        const res = await api.post('/subjects', payload);
        if (res.data.success) {
          setIsModalOpen(false);
          fetchData();
        }
      }
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to save subject');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubject = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const res = await api.delete(`/subjects/${id}`);
      if (res.data.success) {
        setSubjects(subjects.filter((sub) => sub.id !== id));
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete subject');
    }
  };

  // Filter subjects based on search input and class filter dropdown
  const filteredSubjects = subjects.filter((sub) => {
    const term = searchTerm.toLowerCase();
    const nameMatch = sub.subject_name?.toLowerCase().includes(term);
    const codeMatch = sub.subject_code?.toLowerCase().includes(term);
    const classMatch = (sub.class_name || 'general / shared').toLowerCase().includes(term);
    
    const matchesSearch = nameMatch || codeMatch || classMatch;
    const matchesClassFilter = selectedClassFilter === '' || String(sub.class_id) === selectedClassFilter;

    return matchesSearch && matchesClassFilter;
  });

  // Filter sections inside modal based on selected class
  const availableSections = formData.class_id
    ? sections.filter(sec => String(sec.class_id) === String(formData.class_id))
    : sections;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Subjects Management</h1>
          <p className="text-sm text-gray-500">View, create, edit, and organize subjects by class and section.</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow"
        >
          + Add New Subject
        </button>
      </div>

      {error && <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 text-red-700">{error}</div>}

      {/* Search and Filter Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by subject name or code..."
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
        />
        <select
          value={selectedClassFilter}
          onChange={(e) => setSelectedClassFilter(e.target.value)}
          className="w-full md:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
        >
          <option value="">All Classes (General & Specific)</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.class_name}
            </option>
          ))}
        </select>
      </div>

      {/* Subjects Table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class / Section</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="4" className="px-6 py-10 text-center text-gray-500">Loading subjects...</td>
              </tr>
            ) : filteredSubjects.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-10 text-center text-gray-500">
                  {subjects.length === 0 ? 'No subjects found. Click "Add New Subject" to create one.' : 'No matching subjects found.'}
                </td>
              </tr>
            ) : (
              filteredSubjects.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sub.subject_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.subject_code || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${sub.class_name ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {sub.class_name ? `${sub.class_name} ${sub.section_name ? `(${sub.section_name})` : ''}` : 'General / Shared'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => openEditModal(sub)}
                      className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSubject(sub.id, sub.subject_name)}
                      className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Subject Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {editingSubject ? 'Edit Subject' : 'Add New Subject'}
            </h2>
            
            {formError && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{formError}</div>}

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name *</label>
                <input
                  type="text"
                  name="subject_name"
                  value={formData.subject_name}
                  onChange={handleInputChange}
                  placeholder="e.g. Physics, Mathematics"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject Code</label>
                <input
                  type="text"
                  name="subject_code"
                  value={formData.subject_code}
                  onChange={handleInputChange}
                  placeholder="e.g. PHYS-101"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class (Optional)</label>
                <select
                  name="class_id"
                  value={formData.class_id}
                  onChange={(e) => {
                    handleInputChange(e);
                    // Reset section if class changes
                    setFormData(prev => ({ ...prev, class_id: e.target.value, section_id: '' }));
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">General / Shared (All Classes)</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section (Optional)</label>
                <select
                  name="section_id"
                  value={formData.section_id}
                  onChange={handleInputChange}
                  disabled={!formData.class_id}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">All Sections in Class</option>
                  {availableSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.section_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingSubject ? 'Update Subject' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

