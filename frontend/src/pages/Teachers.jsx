import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  GraduationCap, Search, Plus, Pencil, Trash2, ChevronRight, UserCheck,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import AddTeacherModal from '../components/AddTeacherModal';
import { teachersApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Teachers() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const [modal, setModal] = useState(null);       // null | {mode:'create'} | {mode:'edit', data}
  const [confirm, setConfirm] = useState(null);   // null | {id, name}

  const load = async () => {
    setLoading(true);
    try {
      const d = await teachersApi.list();
      setRows(d || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = q
    ? rows.filter((r) =>
        (r.name || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.email || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.employee_code || '').toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  const handleDelete = async () => {
    try {
      await teachersApi.remove(confirm.id, true);
      toast.success('Teacher removed');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-purple-600" />
            Teachers ({filtered.length})
          </h3>
          {isAdmin && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ mode: 'create' })}>
              Add Teacher
            </Button>
          )}
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

        {loading ? <Loader /> : filtered.length === 0 ? (
          <Empty
            title="No teachers yet"
            hint={isAdmin ? 'Click "Add Teacher" to add one' : null}
            icon={GraduationCap}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="relative group rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800 transition"
              >
                <button
                  onClick={() => nav(`/teachers/${t.id}`)}
                  className="w-full text-left p-3 pr-16"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold text-sm shrink-0">
                      {t.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate flex items-center gap-1.5">
                        {t.name}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {t.employee_code}
                        {t.department_name ? ` · ${t.department_name}` : ''}
                      </div>
                      {t.status === 'pending' && (
                        <span className="badge badge-gray mt-1 text-[10px]">
                          <UserCheck className="w-3 h-3 mr-1" /> pending
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {isAdmin && (
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', data: t }); }}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-600"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirm({ id: t.id, name: t.name }); }}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {modal && (
        <AddTeacherModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await load(); }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete teacher?"
        message={`${confirm?.name || ''} — this will deactivate their account. Timetable assignments must be removed first.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
