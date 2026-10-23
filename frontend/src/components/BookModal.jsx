import { useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { libraryApi } from '../api/endpoints';

export default function BookModal({ initial = null, onClose, onSaved }) {
  const mode = initial ? 'edit' : 'create';
  const [form, setForm] = useState({
    title: initial?.title || '',
    author: initial?.author || '',
    isbn: initial?.isbn || '',
    publisher: initial?.publisher || '',
    publication_year: initial?.publication_year || '',
    total_copies: initial?.total_copies || 1,
    category: initial?.category || '',
    shelf_location: initial?.shelf_location || '',
  });
  const [saving, setSaving] = useState(false);
  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    setSaving(true);
    try {
      const payload = {
        ...form,
        total_copies: Number(form.total_copies || 1),
        publication_year: form.publication_year ? Number(form.publication_year) : null,
      };
      if (mode === 'create') {
        await libraryApi.createBook(payload);
        toast.success('Book added');
      } else {
        await libraryApi.updateBook(initial.id, payload);
        toast.success('Book updated');
      }
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={mode === 'create' ? 'Add Book' : 'Edit Book'}
      size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>{mode === 'create' ? 'Add' : 'Save'}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Title *" name="title" value={form.title} onChange={onChange} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Author" name="author" value={form.author} onChange={onChange} />
          <Input label="ISBN" name="isbn" value={form.isbn} onChange={onChange} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Publisher" name="publisher" value={form.publisher} onChange={onChange} />
          <Input label="Year" name="publication_year" type="number" value={form.publication_year} onChange={onChange} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Total copies" name="total_copies" type="number" value={form.total_copies} onChange={onChange} />
          <Input label="Category" name="category" value={form.category} onChange={onChange} />
          <Input label="Shelf" name="shelf_location" value={form.shelf_location} onChange={onChange} />
        </div>
      </form>
    </Modal>
  );
}
