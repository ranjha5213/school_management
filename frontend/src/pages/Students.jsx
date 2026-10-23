import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search } from 'lucide-react';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { studentsApi } from '../api/endpoints';

export default function Students() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    studentsApi.list().then((d) => setRows(d || [])).finally(() => setLoading(false));
  }, []);

  const filtered = q
    ? rows.filter((r) =>
        r.student_name?.toLowerCase().includes(q.toLowerCase()) ||
        r.admission_number?.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-600" /> Students ({filtered.length})
        </h3>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name or admission #"
            className="input pl-9"
          />
        </div>
        {loading ? <Loader /> : filtered.length === 0 ? <Empty title="No students" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Admission #</th>
                  <th className="text-left p-3">Roll</th>
                  <th className="text-left p-3">Class</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:divide-slate-700">
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => nav(`/students/${r.id}`)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-medium">{r.student_name}</td>
                    <td className="p-3 font-mono text-xs">{r.admission_number}</td>
                    <td className="p-3">{r.roll_number || '—'}</td>
                    <td className="p-3 text-slate-500">{r.class_name} · {r.section_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
