import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, AlertTriangle, Check, X } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { mcqApi } from '../api/endpoints';

export default function McqAttempts() {
  const { examId } = useParams();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState([]);
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(null);
  const [events, setEvents] = useState([]);
  const [chunks, setChunks] = useState([]);

  useEffect(() => {
    setLoading(true);
    mcqApi.listExamAttempts(examId)
      .then((d) => { setAttempts(d.attempts || []); setStats(d.stats || null); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [examId]);

  const openAttempt = async (id) => {
    try {
      const d = await mcqApi.attemptDetail(id);
      setOpen(d.attempt);
      setEvents(d.events || []);
      const rec = await mcqApi.listRecordings(id).catch(() => ({ chunks: [] }));
      setChunks(rec.chunks || []);
    } catch (e) { toast.error(e.message); }
  };

  const review = async (id, status) => {
    const note = prompt('Optional note:') || null;
    try {
      await mcqApi.reviewAttempt(id, { status, note });
      toast.success('Reviewed');
      setAttempts((a) => a.map((x) => x.id === id ? { ...x, status } : x));
      setOpen((o) => o && o.id === id ? { ...o, status } : o);
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <Loader />;

  if (open) return (
    <div className="space-y-3">
      <button onClick={() => setOpen(null)} className="text-sm text-slate-500 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to list
      </button>
      <Card>
        <h2 className="text-lg font-semibold">{open.student_name} — {open.exam_title}</h2>
        <div className="text-sm text-slate-500 mt-1">
          Score: <b>{open.score}</b> · {open.correct_count} correct · {open.wrong_count} wrong · {open.blank_count} blank
        </div>
        <div className="text-sm mt-1">
          Status: <b className={open.status === 'flagged' ? 'text-amber-600' : ''}>{open.status}</b>
          {open.flagged_count > 0 && <> · <span className="text-amber-600">{open.flagged_count} flagged events</span></>}
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" icon={Check} onClick={() => review(open.id, 'submitted')}>Mark reviewed</Button>
          <Button size="sm" variant="secondary" icon={X} onClick={() => review(open.id, 'invalidated')}>Invalidate</Button>
        </div>
      </Card>

      {chunks.length > 0 && (
        <Card>
          <div className="font-medium mb-2">Recordings ({chunks.length})</div>
          <div className="space-y-2">
            {chunks.map((c) => (
              <video key={c.id} controls className="w-full rounded-lg bg-black" src={c.file_url} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="font-medium mb-2">Event timeline ({events.length})</div>
        <div className="space-y-1 max-h-96 overflow-auto">
          {events.map((e) => (
            <div key={e.id} className="flex gap-3 text-xs items-start border-b border-slate-100 dark:border-slate-800 py-1.5">
              <span className="text-slate-400 font-mono w-28 shrink-0">{e.at}</span>
              <span className={`font-medium ${/tab_hidden|blur|fullscreen_exit|face|gaze|copy|paste/.test(e.kind) ? 'text-amber-600' : 'text-slate-600'}`}>
                {e.kind}
              </span>
              {e.payload && <span className="text-slate-400 truncate">{e.payload}</span>}
            </div>
          ))}
          {events.length === 0 && <div className="text-slate-400 text-sm">No events</div>}
        </div>
      </Card>
    </div>
  );

  return (
    <div className="space-y-3">
      <button onClick={() => nav(`/mcq/${examId}`)} className="text-sm text-slate-500 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to exam
      </button>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[['Attempts', stats.total_attempts], ['Submitted', stats.submitted],
            ['Flagged', stats.flagged], ['Avg score', stats.avg_score?.toFixed?.(1) ?? '—']]
            .map(([l, v]) => (
              <Card key={l} className="!p-3">
                <div className="text-xs text-slate-500">{l}</div>
                <div className="text-lg font-semibold">{v ?? '—'}</div>
              </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="font-medium mb-2">Attempts ({attempts.length})</div>
        {attempts.length === 0 ? <Empty title="No attempts yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2">Student</th><th>Score</th><th>C/W/B</th>
                  <th>Status</th><th>Flags</th><th>Started</th><th></th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2">{a.student_name} <span className="text-slate-400 text-xs">#{a.roll_number}</span></td>
                    <td className="font-semibold">{a.score}</td>
                    <td className="text-slate-500">{a.correct_count}/{a.wrong_count}/{a.blank_count}</td>
                    <td>{a.status}</td>
                    <td>{a.flagged_count > 0 && <span className="text-amber-600"><AlertTriangle className="w-3.5 h-3.5 inline -mt-0.5" /> {a.flagged_count}</span>}</td>
                    <td className="text-xs text-slate-500">{a.started_at}</td>
                    <td><Button size="sm" variant="secondary" onClick={() => openAttempt(a.id)}>View</Button></td>
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
