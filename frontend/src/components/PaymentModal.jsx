import { useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { feesApi } from '../api/endpoints';

const METHODS = ['cash', 'card', 'bank_transfer', 'online', 'cheque'];

export default function PaymentModal({ invoice, onClose, onSaved }) {
  const balance = Number(invoice.total_amount || invoice.amount || 0) - Number(invoice.paid_amount || 0);
  const [amount, setAmount] = useState(balance > 0 ? balance : 0);
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return toast.error('Amount must be > 0');
    if (Number(amount) > balance + 0.01) return toast.error(`Max: ${balance}`);
    setSaving(true);
    try {
      const res = await feesApi.pay({
        invoice_id: invoice.id,
        amount_paid: Number(amount),
        payment_method: method,
        notes: notes || null,
      });
      toast.success(`Payment recorded (${res?.status || 'ok'})`);
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose}
      title={`Record Payment — ${invoice.student_name}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>Record Payment</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm">
          <div className="flex justify-between"><span>Invoice</span><b>{invoice.invoice_number}</b></div>
          <div className="flex justify-between mt-1"><span>Total</span><b>{invoice.total_amount || invoice.amount}</b></div>
          <div className="flex justify-between mt-1"><span>Paid</span><b>{invoice.paid_amount || 0}</b></div>
          <div className="flex justify-between mt-1 text-brand-600 dark:text-brand-300"><span>Balance</span><b>{balance.toFixed(2)}</b></div>
        </div>

        <Input label="Amount *" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />

        <div>
          <label className="label">Method *</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
