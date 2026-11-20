import { useEffect, useState } from 'react';
import {
  FolderArchive, Upload, Download, Trash2, Search, FileText, X, Eye, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/webp',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function Documents() {
  const { user } = useAuth();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  // Upload Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState(null);

  // Delete Confirmation Modal State
  const [deletingId, setDeletingId] = useState(null);

  // Parse user permissions safely
  let userPerms = {};
  try {
    userPerms = JSON.parse(user?.permissions || '{}');
  } catch (e) {}

  const role = user?.role;
  const isAdmin = role === 'admin';
  const isStudent = role === 'student';
  const isStaff = role === 'teacher' || role === 'accountant';

  // Access Control Flags
  // 1. Everyone authenticated can upload
  const canUpload = !!user;

  // 2. View: Admin, Student (their own filtered by backend), or Teacher/Accountant with view_documents
  const canView = isAdmin || isStudent || (isStaff && !!userPerms.view_documents);

  // 3. Delete: Admin, or Teacher/Accountant with delete_documents (Students can NEVER delete)
  const canDelete = !isStudent && (isAdmin || (isStaff && !!userPerms.delete_documents));

  const fetchDocuments = async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await client.get('/documents');
      setDocuments(Array.isArray(res) ? res : res?.data || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [canView]);

  const handleFileChange = (e) => {
    setFormError(null);
    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setFormError('Invalid file type. Allowed formats: PDF, JPEG, PNG, WEBP.');
      setFile(null);
      e.target.value = '';
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setFormError('File size exceeds the 5MB maximum limit.');
      setFile(null);
      e.target.value = '';
      return;
    }

    setFile(selected);
    if (!title.trim()) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!file) {
      setFormError('Please select a file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('title', title.trim() || file.name);
    formData.append('file', file);

    setUploading(true);
    try {
      await client.post('/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Document uploaded successfully');
      setIsModalOpen(false);
      setTitle('');
      setFile(null);
      fetchDocuments();
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc, openInTab = false) => {
    try {
      const response = await client.get(`/documents/${doc.id}/download`, {
        responseType: 'blob',
      });
      const blob = response instanceof Blob ? response : new Blob([response]);
      const url = window.URL.createObjectURL(blob);

      if (openInTab) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', doc.file_name || `${doc.title}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast.error(err.message || 'Failed to access document');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    try {
      await client.delete(`/documents/${deletingId}`);
      toast.success('Document deleted successfully');
      setDocuments((prev) => prev.filter((d) => d.id !== deletingId));
      setDeletingId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete document');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (!canView) {
    return (
      <div className="p-8 text-center">
        <Card className="p-8 max-w-md mx-auto space-y-2">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-red-600">Access Denied</h2>
          <p className="text-sm text-slate-500">
            You do not have permission to view the documents repository.
          </p>
        </Card>
      </div>
    );
  }

  const filtered = q
    ? documents.filter(
        (d) =>
          d.title?.toLowerCase().includes(q.toLowerCase()) ||
          d.file_name?.toLowerCase().includes(q.toLowerCase()) ||
          d.uploader_name?.toLowerCase().includes(q.toLowerCase())
      )
    : documents;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FolderArchive className="w-5 h-5 text-brand-600" />
              {isStudent ? 'My Documents' : 'Documents Repository'} ({filtered.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isStudent
                ? 'View and download your uploaded documents.'
                : 'Centralized school document archive. Allowed: PDF, JPEG, PNG, WEBP (Max 5MB).'}
            </p>
          </div>

          {canUpload && (
            <button
              onClick={() => {
                setFormError(null);
                setTitle('');
                setFile(null);
                setIsModalOpen(true);
              }}
              className="btn btn-primary flex items-center gap-1.5 text-sm whitespace-nowrap"
            >
              <Upload className="w-4 h-4" /> Upload Document
            </button>
          )}
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              isStudent
                ? 'Search your documents by title or filename...'
                : 'Search by title, filename, or uploader...'
            }
            className="input pl-9 w-full"
          />
        </div>

        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <Empty title="No documents found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Title</th>
                  <th className="text-left p-3">File Name</th>
                  <th className="text-left p-3">Size</th>
                  {!isStudent && <th className="text-left p-3">Uploaded By</th>}
                  <th className="text-left p-3">Date</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                      <span>{doc.title}</span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-xs">{doc.file_name}</td>
                    <td className="p-3 text-slate-500 text-xs">{formatSize(doc.file_size)}</td>
                    {!isStudent && (
                      <td className="p-3 text-slate-600 dark:text-slate-300">
                        <span>{doc.uploader_name || `User #${doc.uploaded_by}`}</span>
                        {doc.uploader_role && (
                          <span className="ml-1.5 text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {doc.uploader_role}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="p-3 text-slate-500 text-xs">
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="p-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => handleDownload(doc, true)}
                        className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                        title="View Document"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(doc, false)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded"
                        title="Download Document"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setDeletingId(doc.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded"
                          title="Delete Document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── UPLOAD DOCUMENT MODAL ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleUploadSubmit}
            className="bg-white dark:bg-slate-900 rounded-lg p-6 w-full max-w-md space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Upload className="w-5 h-5 text-brand-600" /> Upload Document
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Document Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Admission Form, Fee Receipt"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Select File *</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
                required
              />
              <p className="text-xs text-slate-400 mt-1">
                Accepted formats: PDF, JPEG, PNG, WEBP (Max size: 5MB)
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="btn btn-secondary"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary flex items-center gap-1.5"
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {deletingId && (
        <ConfirmDelete
          open={!!deletingId}
          onClose={() => setDeletingId(null)}
          onConfirm={handleDeleteConfirm}
          title="Delete Document"
          message="Are you sure you want to permanently delete this document? This action cannot be undone."
        />
      )}
    </div>
  );
}

