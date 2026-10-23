import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Hash, BookOpen, DollarSign, ClipboardList,
  FileText, CalendarCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { studentsApi, attendanceApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { id: 'attendance', label: 'Attendance',   icon: CalendarCheck },
  { id: 'exams',      label: 'Test Reports', icon: FileText },
  { id: 'fees',       label: 'Fees',         icon: DollarSign },
  { id: 'homework',   label: 'Homework',     icon: ClipboardList },
];

export default function StudentDetail() {
  const { studentId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('attendance');

  useEffect(() => {
    setLoading(true);
    studentsApi.overview(studentId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <Loader />;
  if (!data?.profile) return <Card><Empty title="Student not found" /></Card>;

  const { profile, attendanceSummary, fees, homework, exams } = data;

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => nav(-1)} className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-100 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <Avatar src={profile.avatar_url} name={profile.name} size={56} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{profile.name}</h2>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{profile.email}</span>
              <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />Adm {profile.admission_number}</span>
              <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{profile.class_name || '—'} — {profile.section_name || '—'}</span>
            </div>
          </div>
        </div>

        {attendanceSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
            <Stat label="Total Days" value={attendanceSummary.total_days} />
            <Stat label="Present"    value={attendanceSummary.present_days} tone="green" />
            <Stat label="Absent"     value={attendanceSummary.absent_days} tone="red" />
            <Stat label="Late"       value={attendanceSummary.late_days} tone="amber" />
            <Stat label="Rate %"     value={attendanceSummary.attendance_percentage} tone="blue" />
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 dark:border-slate-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px transition ${
              tab === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-100'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && <AttendanceTab studentId={studentId} />}
      {tab === 'exams'      && <ExamsTab rows={exams} />}
      {tab === 'fees'       && <FeesTab rows={fees} />}
      {tab === 'homework'   && <HomeworkTab rows={homework} />}
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }) {
  const map = {
    slate: 'bg-slate-50 dark:bg-slate-800',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    red:   'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
    blue:  'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
  };
  return (
    <div className={`p-3 rounded-xl ${map[tone]}`}>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-lg font-bold">{value ?? '—'}</div>
    </div>
  );
}

function AttendanceTab({ studentId }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [newRemarks, setNewRemarks] = useState('');

  const load = () => {
    setLoading(true);
    studentsApi.attendance(studentId).then((d) => setRows(d || [])).finally(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) load(); }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [studentId]);

  const startEdit = (r) => { setEditRow(r); setNewRemarks(r.remarks || ''); };
  const cancelEdit = () => { setEditRow(null); setNewRemarks(''); };

  const saveRemarks = async () => {
    try {
      await attendanceApi.updateRemarks(editRow.student_id, editRow.date, newRemarks);
      toast.success('Remarks updated');
      cancelEdit();
      load();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <Loader />;
  if (!rows.length) return <Card><Empty title="No attendance records" /></Card>;

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Remarks</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-mono text-xs">{r.date}</td>
                <td className="p-3 capitalize">{r.status}</td>
                <td className="p-3 text-slate-500">
                  {editRow?.id === r.id ? (
                    <input
                      className="input"
                      value={newRemarks}
                      onChange={(e) => setNewRemarks(e.target.value)}
                    />
                  ) : (r.remarks || '—')}
                </td>
                <td className="p-3 text-right">
                  {editRow?.id === r.id ? (
                    <div className="flex justify-end gap-1">
                      <button onClick={saveRemarks} className="text-xs text-green-600 font-medium">Save</button>
                      <button onClick={cancelEdit} className="text-xs text-slate-500">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(r)} className="text-xs text-brand-600 font-medium">Edit remarks</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ExamsTab({ rows }) {
  if (!rows?.length) return <Card><Empty title="No test reports yet" /></Card>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="text-left p-3">Exam</th>
            <th className="text-left p-3">Subject</th>
            <th className="text-left p-3">Marks</th>
            <th className="text-left p-3">Remarks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="p-3">{r.exam_name}<div className="text-xs text-slate-400">{r.type_name}</div></td>
              <td className="p-3">{r.subject_name}</td>
              <td className="p-3">{r.marks_obtained}/{r.total_marks}</td>
              <td className="p-3 text-slate-500">{r.remarks || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function FeesTab({ rows }) {
  if (!rows?.length) return <Card><Empty title="No fee records" /></Card>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="text-left p-3">Invoice</th>
            <th className="text-left p-3">Amount</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="p-3 font-mono text-xs">{r.invoice_number || r.id}</td>
              <td className="p-3">{r.total_amount ?? r.amount ?? '—'}</td>
              <td className="p-3 capitalize">{r.status || '—'}</td>
              <td className="p-3 text-slate-500">{r.created_at?.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function HomeworkTab({ rows }) {
  if (!rows?.length) return <Card><Empty title="No homework records" /></Card>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="text-left p-3">Homework</th>
            <th className="text-left p-3">Subject</th>
            <th className="text-left p-3">Due</th>
            <th className="text-left p-3">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="p-3">{r.title}</td>
              <td className="p-3">{r.subject_name || '—'}</td>
              <td className="p-3 font-mono text-xs">{r.due_date}</td>
              <td className="p-3">{r.submission_date ? '✓ Yes' : <span className="text-red-500">Pending</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
