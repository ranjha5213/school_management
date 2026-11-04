import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mcqApi } from '../api/endpoints';
import Card from '../components/Card';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { Clock, PlayCircle, Check, Lock } from 'lucide-react';

const LABEL = {
  waiting:     'Waiting',
  open:        'Start',
  in_progress: 'Resume',
  submitted:   'Submitted',
  closed:      'Closed',
};

const ICON = {
  waiting:     { C: Clock,      cls: 'text-brand-500'   },
  open:        { C: PlayCircle, cls: 'text-emerald-600' },
  in_progress: { C: PlayCircle, cls: 'text-brand-600'   },
  submitted:   { C: Check,      cls: 'text-emerald-600' },
  closed:      { C: Lock,       cls: 'text-slate-400'   },
};

export default function StudentExams() {
  const [exams, setExams] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    mcqApi.myExams()
      .then((r) => setExams(r?.exams ?? r?.data?.exams ?? []))
      .catch((e) => { setError(e.message || 'Failed to load'); setExams([]); });
  }, []);

  if (exams === null) return <Loader />;
  if (error)          return <Card><div className="text-red-600 text-sm">{error}</div></Card>;
  if (!exams.length)  return <Empty title="No exams available" hint="Your teacher hasn't scheduled any exams for you yet." />;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">My Exams</h1>
      {exams.map((view) => {
        const exam  = view.exam || {};
        const state = view.state || 'closed';
        const { C, cls } = ICON[state] || ICON.closed;
        const open  = state === 'open' || state === 'in_progress';

        return (
          <Card key={exam.id}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <C className={`w-4 h-4 shrink-0 ${cls}`} />
                  <h3 className="font-semibold truncate">{exam.title}</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {exam.subject_name || '—'}
                  {exam.total_questions ? ` · ${exam.total_questions} questions` : ''}
                  {exam.time_limit_minutes ? ` · ${exam.time_limit_minutes} min` : ''}
                  {exam.proctoring_enabled ? ' · proctored' : ''}
                </p>
                {exam.scheduled_start_at && (
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(exam.scheduled_start_at).toLocaleString()}
                    {exam.scheduled_end_at && ` — ${new Date(exam.scheduled_end_at).toLocaleString()}`}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {open ? (
                  <Link
                    to={`/mcq/${exam.id}/take`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
                  >
                    {LABEL[state]}
                  </Link>
                ) : (
                  <span className={`text-sm font-medium ${cls}`}>{LABEL[state]}</span>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
