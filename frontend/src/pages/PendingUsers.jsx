import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserCheck, UserX, RefreshCw } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import Modal from '../components/Modal';
import Input from '../components/Input';
import { authApi } from '../api/endpoints';

export default function PendingUsers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState('');

  const load = () => {
    setLoading(true);
    authApi.listPending().then((d) => setRows(d || [])).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) load(); }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const approve = async (id) => {
    try {
      await authApi.approve(id);
      toast.success('User approved');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    try {
      await authApi.reject(rejectTarget.id, reason);
      toast.success('User rejected');
      setRejectTarget(null); setReason('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-brand-600" /> Pending Registrations ({rows.length})
          </h3>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
        </div>

        {loading ? <Loader /> : rows.length === 0 ? (
          <Empty title="No pending registrations" hint="New sign-ups will appear here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Requested</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3">{r.email}</td>
                    <td className="p-3 capitalize">{r.role}</td>
                    <td className="p-3 text-slate-500">{r.created_at?.slice(0, 10)}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => approve(r.id)} className="text-green-600 text-xs font-medium flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => setRejectTarget(r)} className="text-red-600 text-xs font-medium flex items-center gap-1">
                          <UserX className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject registration"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={reject}>Reject</Button>
          </>
        }
      >
        <p className="text-sm text-slate-500 mb-3">
          Rejecting <b>{rejectTarget?.name}</b> ({rejectTarget?.email}).
        </p>
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}
