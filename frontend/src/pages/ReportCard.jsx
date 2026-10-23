import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Printer, FileText, User, Calendar, DollarSign, Download } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { reportsApi } from '../api/endpoints';

export default function ReportCard() {
  const { studentId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportsApi.reportCard(studentId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <Loader />;
  if (!data?.student) return <Card><Empty title="Student not found" /></Card>;

  const s = data.student;
  const a = data.attendance || {};
  const f = data.fees || {};

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center print:hidden">
        <button onClick={() => nav(-1)} className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-100 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex gap-2">
          <Button icon={Printer} variant="secondary" onClick={() => window.print()}>Print</Button>
          <a
            href={`/api/reports/student/${studentId}/report-card.pdf`}
            onClick={(e) => {
              // Use fetch to attach auth header
              e.preventDefault();
              const token = localStorage.getItem('token');
              fetch(`/api/reports/student/${studentId}/report-card.pdf`, {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then((r) => {
                  if (!r.ok) throw new Error('Download failed');
                  return r.blob();
                })
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `report-card-${studentId}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                })
                .catch((err) => alert(err.message));
            }}
          >
            <Button icon={Download} className="bg-brand-600 hover:bg-brand-700">
              Download PDF
            </Button>
          </a>
        </div>
      </div>

      <Card className="p-6 print:shadow-none print:border-0">
        <div className="text-center border-b border-slate-200 dark:border-slate-800 dark:border-slate-700 pb-4">
          <h1 className="text-2xl font-bold">School Management</h1>
          <p className="text-sm text-slate-500">Student Report Card</p>
        </div>

        {/* Student info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-sm">
          <div className="space-y-1">
            <div><span className="text-slate-500">Name:</span> <b>{s.name}</b></div>
            <div><span className="text-slate-500">Admission #:</span> {s.admission_number}</div>
            <div><span className="text-slate-500">Roll #:</span> {s.roll_number || '—'}</div>
          </div>
          <div className="space-y-1">
            <div><span className="text-slate-500">Class:</span> {s.class_name || '—'}</div>
            <div><span className="text-slate-500">Section:</span> {s.section_name || '—'}</div>
            <div><span className="text-slate-500">Guardian:</span> {s.guardian_name || '—'}</div>
          </div>
        </div>

        {/* Attendance */}
        <h2 className="text-base font-semibold mt-6 mb-2 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Attendance
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          <Cell label="Present" value={a.present_days || 0} />
          <Cell label="Absent"  value={a.absent_days || 0} />
          <Cell label="Late"    value={a.late_days || 0} />
          <Cell label="Excused" value={a.excused_days || 0} />
          <Cell label="Rate" value={`${a.attendance_percentage || 0}%`} strong />
        </div>

        {/* Exams */}
        <h2 className="text-base font-semibold mt-6 mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Exam Results
        </h2>
        {!data.exams?.length ? (
          <div className="text-sm text-slate-500 italic">No exams recorded yet.</div>
        ) : (
          <div className="space-y-4">
            {data.exams.map((exam, i) => (
              <div key={i}>
                <div className="font-medium text-sm mb-1">
                  {exam.exam_name}
                  {exam.start_date && <span className="text-xs text-slate-500 ml-2">({exam.start_date})</span>}
                </div>
                <table className="w-full text-sm border border-slate-200 dark:border-slate-800 dark:border-slate-700 rounded overflow-hidden">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-left p-2">Subject</th>
                      <th className="text-right p-2">Obtained</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-right p-2">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                    {exam.marks.map((m, j) => (
                      <tr key={j}>
                        <td className="p-2">{m.subject}</td>
                        <td className="p-2 text-right">{m.obtained}</td>
                        <td className="p-2 text-right">{m.total}</td>
                        <td className={`p-2 text-right font-medium ${
                          m.percentage >= 80 ? 'text-green-600' :
                          m.percentage >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>{m.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* Fees */}
        <h2 className="text-base font-semibold mt-6 mb-2 flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Fees
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Cell label="Billed" value={(f.total_billed || 0).toFixed(2)} />
          <Cell label="Paid" value={(f.total_paid || 0).toFixed(2)} tone="green" />
          <Cell label="Balance" value={(f.pending || 0).toFixed(2)} tone={f.pending > 0 ? 'amber' : 'green'} />
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 dark:border-slate-700 flex justify-between text-xs text-slate-400">
          <span>Generated {new Date(data.generated_at).toLocaleString()}</span>
          <span>{s.class_name} · {s.section_name}</span>
        </div>
      </Card>
    </div>
  );
}

function Cell({ label, value, tone = 'slate', strong = false }) {
  const map = {
    slate: 'bg-slate-50 dark:bg-slate-800',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return (
    <div className={`p-3 rounded-xl ${map[tone]}`}>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`text-lg ${strong ? 'font-bold' : 'font-medium'}`}>{value}</div>
    </div>
  );
}
