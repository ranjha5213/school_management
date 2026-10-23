import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bell, Plus, Pencil, Trash2, ChevronRight, ArrowLeft,
  Users, Clock, User, AlertCircle, Inbox,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import NoticeModal from '../components/NoticeModal';
import { noticesApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Notices() {
  const { noticeId } = useParams();
  return noticeId
    ? <NoticeDetail noticeId={Number(noticeId)} />
    : <NoticeList />;
}

// ════════════════════════════════════════════════════════════

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function roleLabel(role) {
  const map = {
    all: 'Everyone', student: 'Students', teacher: 'Teachers',
    parent: 'Parents', accountant: 'Accountants',
    admin: 'Admins',
  };
  return map[role] || role;
}

function isExpired(expires_at) {
  if (!expires_at) return false;
  const today = new Date().toISOString().slice(0, 10);
  return expires_at < today;
}

// ════════════════════════════════════════════════════════════
// LIST
// ════════════════════════════════════════════════════════════

function NoticeList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showExpired, setShowExpired] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    noticesApi.list().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) load(); }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const handleDelete = async () => {
    try {
      await noticesApi.remove(confirm.id);
      toast.success('Notice deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const filtered = useMemo(() => {
    let list = rows;
    if (!showExpired) list = list.filter((r) => !isExpired(r.expires_at));
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((r) =>
        (r.title || '').toLowerCase().includes(needle) ||
        (r.content || '').toLowerCase().includes(needle));
    }
    return list;
  }, [rows, q, showExpired]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-600" /> Notices ({filtered.length})
          </h3>
          {canWrite && (
            <Button size="sm" icon={Plus} onClick={() => setModal({ mode: 'create' })}>
              Post Notice
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <div className="sm:col-span-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Search notices…" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={showExpired}
                   onChange={(e) => setShowExpired(e.target.checked)}
                   className="rounded" />
            Show expired
          </label>
        </div>

        {loading ? <Loader /> : filtered.length === 0 ? (
          <Empty title="No notices" hint={canWrite ? 'Click "Post Notice" to create one' : null} />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
            {filtered.map((n) => {
              const expired = isExpired(n.expires_at);
              return (
                <div key={n.id} className="group relative">
                  <button onClick={() => nav(`/notices/${n.id}`)}
                    className="w-full text-left py-3 pr-20 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800/50 rounded transition">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        expired ? 'bg-slate-100 dark:bg-slate-800' : 'bg-brand-50 dark:bg-brand-500/10'
                      }`}>
                        <Bell className={`w-4 h-4 ${expired ? 'text-slate-400' : 'text-brand-600'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          {n.title}
                          {expired && <span className="badge badge-gray">expired</span>}
                          {n.target_role !== 'all' && (
                            <span className="badge badge-blue">{roleLabel(n.target_role)}</span>
                          )}
                          {n.target_class_name && (
                            <span className="badge badge-purple">{n.target_class_name}</span>
                          )}
                          {n.target_section_name && (
                            <span className="badge badge-gray">{n.target_section_name}</span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                          {n.content}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-3">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> {n.posted_by_name || '—'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatDateTime(n.posted_at)}
                          </span>
                          {n.expires_at && (
                            <span>Expires {n.expires_at}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                    </div>
                  </button>

                  {(canWrite && (isAdmin || n.posted_by === user?.id)) && (
                    <div className="absolute right-2 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', data: n }); }}
                        className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-600"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirm({ id: n.id, name: n.title }); }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {modal && (
        <NoticeModal
          mode={modal.mode}
          initial={modal.data}
          onClose={() => setModal(null)}
          onSaved={async (id) => {
            setModal(null);
            await load();
            if (modal.mode === 'create' && id) nav(`/notices/${id}`);
          }}
        />
      )}

      <ConfirmDelete
        open={!!confirm}
        title="Delete notice?"
        message={`"${confirm?.name || ''}" will be removed for all recipients.`}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DETAIL
// ════════════════════════════════════════════════════════════

function NoticeDetail({ noticeId }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    noticesApi.get(noticeId).then(setNotice).catch(() => setNotice(null)).finally(() => setLoading(false));
  }, [noticeId]);

  if (loading) return <Loader />;
  if (!notice) return <Card><Empty title="Notice not found" /></Card>;

  const expired = isExpired(notice.expires_at);

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav('/notices')}
        className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-100 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to notices
      </button>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            expired ? 'bg-slate-100 dark:bg-slate-800' : 'bg-brand-50 dark:bg-brand-500/10'
          }`}>
            <Bell className={`w-5 h-5 ${expired ? 'text-slate-400' : 'text-brand-600'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold flex items-center gap-2 flex-wrap">
              {notice.title}
              {expired && <span className="badge badge-gray">expired</span>}
              {!notice.is_active && <span className="badge badge-gray">inactive</span>}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="badge badge-blue">{roleLabel(notice.target_role)}</span>
              {notice.target_class_name && (
                <span className="badge badge-purple">{notice.target_class_name}</span>
              )}
              {notice.target_section_name && (
                <span className="badge badge-gray">Section {notice.target_section_name}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-400 flex flex-wrap gap-4">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> Posted by <b className="text-slate-600 dark:text-slate-300">{notice.posted_by_name || '—'}</b>
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatDateTime(notice.posted_at)}
          </span>
          {notice.expires_at && <span>Expires {notice.expires_at}</span>}
        </div>

        <div className="prose dark:prose-invert max-w-none mt-4 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {notice.content}
        </div>
      </Card>
    </div>
  );
}
