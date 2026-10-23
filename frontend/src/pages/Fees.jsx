import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { DollarSign, Plus, Trash2, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import Card from '../components/Card';
import ErrorBoundary from '../components/ErrorBoundary';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import InvoiceModal from '../components/InvoiceModal';
import PaymentModal from '../components/PaymentModal';
import { feesApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Fees() {
  const { user } = useAuth();
  const canWrite = ['admin', 'accountant'].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, sum] = await Promise.all([
        feesApi.invoices(statusFilter ? { status: statusFilter } : {}),
        canWrite ? feesApi.summary().catch(() => null) : Promise.resolve(null),
      ]);
      setRows(inv || []);
      setSummary(sum);
    } catch (e) { toast.error(e.message, { id: 'fees-error' }); }
    finally { setLoading(false); }
  }, [statusFilter, canWrite]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) load(); }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [load]);

  const handleDelete = async () => {
    try {
      await feesApi.removeInvoice(confirm.id);
      toast.success('Invoice deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const badgeFor = (s) => ({
    paid: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    unpaid: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  }[s] || 'bg-slate-100 text-slate-700');

  return (
    <div className="space-y-4 animate-fade-in">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Invoices" value={summary.total_invoices} />
          <Stat label="Billed" value={Number(summary.total_billed || 0).toFixed(0)} tone="blue" />
          <Stat label="Collected" value={Number(summary.total_paid || 0).toFixed(0)} tone="green" icon={CheckCircle2} />
          <Stat label="Pending" value={Number((summary.total_billed || 0) - (summary.total_paid || 0)).toFixed(0)} tone="amber" icon={AlertCircle} />
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-brand-600" /> Invoices ({rows.length})
          </h3>
          <div className="flex gap-2 items-center">
            <select className="input py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
            {canWrite && (
              <Button size="sm" icon={Plus} onClick={() => setInvoiceModal(true)}>New Invoice</Button>
            )}
          </div>
        </div>

        {loading ? <Loader /> : rows.length === 0 ? (
          <Empty title="No invoices" hint={canWrite ? 'Create one to get started' : null} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Invoice</th>
                  <th className="text-left p-3">Student</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-right p-3">Paid</th>
                  <th className="text-right p-3">Balance</th>
                  <th className="text-center p-3">Status</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                {rows.map((r) => {
                  const total = Number(r.total_amount || r.amount || 0);
                  const paid = Number(r.paid_amount || 0);
                  const bal = total - paid;
                  return (
                    <tr key={r.id}>
                      <td className="p-3 font-mono text-xs">{r.invoice_number}</td>
                      <td className="p-3">
                        <div className="font-medium">{r.student_name}</div>
                        <div className="text-xs text-slate-500">
                          {r.class_name} · {r.section_name} · {r.admission_number}
                        </div>
                      </td>
                      <td className="p-3 text-right">{total.toFixed(2)}</td>
                      <td className="p-3 text-right">{paid.toFixed(2)}</td>
                      <td className="p-3 text-right font-medium">{bal.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <span className={`badge capitalize ${badgeFor(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          {canWrite && bal > 0 && (
                            <button onClick={() => setPaymentTarget(r)}
                              className="text-xs text-green-600 font-medium flex items-center gap-1">
                              <Wallet className="w-3.5 h-3.5" /> Pay
                            </button>
                          )}
                          {canWrite && (
                            <button onClick={() => setConfirm({ id: r.id, name: r.invoice_number })}
                              className="text-xs text-red-600 font-medium flex items-center gap-1">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {invoiceModal && (
        <ErrorBoundary><InvoiceModal onClose={() => setInvoiceModal(false)}
          onSaved={async () => { setInvoiceModal(false); await load(); }} /></ErrorBoundary>
      )}

      {paymentTarget && (
        <ErrorBoundary><PaymentModal invoice={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSaved={async () => { setPaymentTarget(null); await load(); }} /></ErrorBoundary>
      )}

      <ConfirmDelete open={!!confirm} title="Delete invoice?"
        message={`${confirm?.name || ''} and all its payments will be removed.`}
        onClose={() => setConfirm(null)} onConfirm={handleDelete} />
    </div>
  );
}

function Stat({ label, value, tone = 'slate', icon: Icon }) {
  const map = {
    slate: 'bg-slate-50 dark:bg-slate-800',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    blue:  'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return (
    <div className={`p-3 rounded-xl ${map[tone]}`}>
      <div className="text-xs uppercase text-slate-500 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className="text-lg font-bold">{value ?? '—'}</div>
    </div>
  );
}
