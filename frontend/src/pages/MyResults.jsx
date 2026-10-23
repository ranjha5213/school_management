import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { mcqApi } from '../api/endpoints';

export default function MyResults() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    setLoading(true);
    mcqApi.myAttempts()
      .then((d) => setRows(d || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-3">My MCQ Results</h2>
      {rows.length === 0 ? <Empty title="No attempts yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Exam</th>
                <th>Score</th>
                <th>Correct</th>
                <th>Wrong</th>
                <th>Blank</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2">{a.exam_title}</td>
                  <td className="font-semibold">{a.score}</td>
                  <td>{a.correct_count}</td>
                  <td>{a.wrong_count}</td>
                  <td>{a.blank_count}</td>
                  <td>{a.status}</td>
                  <td className="text-xs text-slate-500">{a.submitted_at || a.started_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
