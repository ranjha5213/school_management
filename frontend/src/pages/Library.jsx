import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Library as LibraryIcon, Plus, Pencil, Trash2, BookOpen, Undo2,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import BookModal from '../components/BookModal';
import IssueModal from '../components/IssueModal';
import { libraryApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'issues', label: 'Issued', icon: Undo2 },
];

export default function Library() {
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState('books');
  const [books, setBooks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [bookModal, setBookModal] = useState(null);
  const [issueTarget, setIssueTarget] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, i] = await Promise.all([
        libraryApi.books(q ? { q } : {}),
        libraryApi.issues({}),
      ]);
      setBooks(b || []);
      setIssues(i || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) load(); }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tab]);

  useEffect(() => {
    const t = setTimeout(() => { if (tab === 'books') load(); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const handleDelete = async () => {
    try {
      if (confirm.type === 'book') await libraryApi.removeBook(confirm.id);
      toast.success('Removed');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const returnBook = async (issue) => {
    try {
      const res = await libraryApi.returnBook(issue.id);
      toast.success(res?.message || 'Returned');
      await load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold flex items-center gap-2">
            <LibraryIcon className="w-4 h-4 text-brand-600" /> Library
          </h3>
          {canWrite && tab === 'books' && (
            <Button size="sm" icon={Plus} onClick={() => setBookModal({ mode: 'create' })}>
              Add Book
            </Button>
          )}
        </div>

        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 dark:border-slate-800 mb-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px transition ${
                tab === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-100'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === 'books' && (
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, author, ISBN…" />
            <div className="mt-3">
              {loading ? <Loader /> : books.length === 0 ? (
                <Empty title="No books" hint={canWrite ? 'Add one to start' : null} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {books.map((b) => (
                    <div key={b.id} className="relative group rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-700 p-3">
                      <div className="font-medium text-sm pr-16">{b.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{b.author || '—'}</div>
                      <div className="text-xs mt-1 flex items-center gap-2">
                        <span className={b.available_copies > 0
                          ? 'text-green-600 font-medium'
                          : 'text-red-600 font-medium'}>
                          {b.available_copies}/{b.total_copies} available
                        </span>
                      </div>
                      {canWrite && (
                        <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => setIssueTarget(b)}
                            className="p-1 rounded bg-white dark:bg-slate-900 dark:bg-slate-800 text-brand-600 text-xs"
                            disabled={b.available_copies < 1}>
                            Issue
                          </button>
                          <button onClick={() => setBookModal({ mode: 'edit', data: b })}
                            className="p-1 rounded bg-white dark:bg-slate-900 dark:bg-slate-800 text-slate-600">
                            <Pencil className="w-3 h-3" />
                          </button>
                          {isAdmin && (
                            <button onClick={() => setConfirm({ type: 'book', id: b.id, name: b.title })}
                              className="p-1 rounded bg-white dark:bg-slate-900 dark:bg-slate-800 text-red-600">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'issues' && (
          <>
            {loading ? <Loader /> : issues.length === 0 ? (
              <Empty title="No issues yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-left p-3">Book</th>
                      <th className="text-left p-3">Student</th>
                      <th className="text-left p-3">Issued</th>
                      <th className="text-left p-3">Due</th>
                      <th className="text-left p-3">Returned</th>
                      <th className="text-center p-3">Status</th>
                      <th className="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                    {issues.map((i) => {
                      const overdue = i.status === 'issued' && i.due_date < new Date().toISOString().slice(0, 10);
                      return (
                        <tr key={i.id}>
                          <td className="p-3">{i.book_title}</td>
                          <td className="p-3">
                            <div>{i.student_name}</div>
                            <div className="text-xs text-slate-500">{i.admission_number}</div>
                          </td>
                          <td className="p-3 font-mono text-xs">{i.issue_date}</td>
                          <td className={`p-3 font-mono text-xs ${overdue ? 'text-red-600 font-bold' : ''}`}>{i.due_date}</td>
                          <td className="p-3 font-mono text-xs">{i.return_date || '—'}</td>
                          <td className="p-3 text-center">
                            <span className={`badge ${i.status === 'returned' ? 'badge-gray' : overdue ? 'bg-red-100 text-red-700' : 'badge-blue'}`}>
                              {i.status === 'issued' && overdue ? 'overdue' : i.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {canWrite && i.status === 'issued' && (
                              <button onClick={() => returnBook(i)}
                                className="text-xs text-brand-600 font-medium">
                                Return
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {bookModal && (
        <BookModal initial={bookModal.data}
          onClose={() => setBookModal(null)}
          onSaved={async () => { setBookModal(null); await load(); }} />
      )}

      {issueTarget && (
        <IssueModal book={issueTarget}
          onClose={() => setIssueTarget(null)}
          onSaved={async () => { setIssueTarget(null); await load(); }} />
      )}

      <ConfirmDelete open={!!confirm} title="Remove book?"
        message={`${confirm?.name || ''}`}
        onClose={() => setConfirm(null)} onConfirm={handleDelete} />
    </div>
  );
}
