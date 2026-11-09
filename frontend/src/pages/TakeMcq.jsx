// frontend/src/pages/TakeMcq.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Clock, Check, Maximize, PlayCircle, Lock } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { mcqApi } from '../api/endpoints';

const CHUNK_MS = 30_000;   // recording chunk length
const SNAP_MS  = 30_000;   // webcam snapshot interval
const POLL_MS  = 15_000;   // student-view poll while waiting
const TICK_MS  = 1_000;    // local countdown tick

// ─── helpers ────────────────────────────────────────────────────────────
function fmt(sec) {
  if (sec == null) return '';
  if (sec <= 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// Same-day time helper (naive but fine for countdowns <24h).
function toMs(iso) {
  if (!iso) return null;
  const s = String(iso);
  const norm = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  const t = Date.parse(norm);
  return Number.isFinite(t) ? t : null;
}

export default function TakeMcq() {
  const { examId } = useParams();
  const nav = useNavigate();

  // ── student-view card state ──
  const [view, setView] = useState(null);         // { state, exam, seconds_to_start, seconds_to_end, attempt_id, server_now }
  const [skewMs, setSkewMs] = useState(0);        // client_now - server_now
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // ── attempt state (set only after attempt/start succeeds) ──
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [accessCode, setAccessCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);

  const mediaStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const snapTimerRef = useRef(null);
  const submitRef = useRef(false);

  // ────────────────────────────────────────────────────────────────────
  // 1) Load the exam card (countdown + safe metadata). No questions.
  // ────────────────────────────────────────────────────────────────────
  const loadView = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const v = await mcqApi.studentExamView(examId);
      const serverNow = toMs(v.server_now);
      if (serverNow) setSkewMs(Date.now() - serverNow);
      setView(v);

      // Resume an in-progress attempt
      if (v.state === 'in_progress' && v.attempt_id && !attempt?.id) {
        try {
          const started = await mcqApi.startAttempt(examId);
          const body = started?.data ?? started;
          if (body?.attempt) {
            setAttempt(body.attempt);
            setQuestions(body.questions || []);
            if (body.attempt.time_limit_seconds) {
              const startedAt = toMs(body.attempt.started_at);
              if (startedAt) {
                const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                setSecondsLeft(Math.max(0, body.attempt.time_limit_seconds - elapsed));
              }
            }
          }
        } catch (e) {
          toast.error(e.message || 'Could not resume attempt');
        }
      }
      return v;
    } catch (e) {
      if (!quiet) {
        if (e.status === 404)      toast.error('Exam not found');
        else if (e.status === 409) toast.error(e.message || 'Exam not scheduled');
        else                        toast.error(e.message || 'Could not load exam');
      }
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [examId, attempt?.id]);

  // initial load
  useEffect(() => { loadView(); }, [loadView]);

  // poll student-view while no attempt is active
  useEffect(() => {
    if (attempt?.id) return;
    if (!view) return;
    if (view.state === 'closed' || view.state === 'submitted' || view.state === 'in_progress') return;
    const t = setInterval(() => loadView({ quiet: true }), POLL_MS);
    return () => clearInterval(t);
  }, [attempt?.id, view, loadView]);

  // local 1s tick for smooth countdown
  useEffect(() => {
    if (attempt?.id) return;
    if (!view) return;
    if (view.state !== 'waiting' && view.state !== 'open') return;
    const t = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, [attempt?.id, view]);

  // ────────────────────────────────────────────────────────────────────
  // 2) Start the attempt
  // ────────────────────────────────────────────────────────────────────
  const start = useCallback(async (code) => {
    setStarting(true);
    try {
      const res = await mcqApi.startAttempt(examId, code);
      const body = res?.data ?? res;
      setAttempt(body.attempt);
      setQuestions(body.questions || []);
      if (body.attempt?.time_limit_seconds) {
        const startedAt = toMs(body.attempt.started_at);
        if (startedAt) {
          const elapsed = Math.floor((Date.now() - startedAt) / 1000);
          setSecondsLeft(Math.max(0, body.attempt.time_limit_seconds - elapsed));
        }
      } else {
        setSecondsLeft(null);
      }
    } catch (e) {
      // On 403/409, state may have changed — refresh the card
      if (e.status === 403 || e.status === 409) await loadView({ quiet: true });
      if (/access code/i.test(e.message || '')) setNeedsCode(true);
      else toast.error(e.message || 'Could not start exam');
    } finally {
      setStarting(false);
    }
  }, [examId, loadView]);

  // ────────────────────────────────────────────────────────────────────
  // 3) Submit
  // ────────────────────────────────────────────────────────────────────
  const submit = useCallback(async (auto = false) => {
    if (!attempt?.id || submitRef.current) return;

    // Manual submit: confirm with the student; Cancel aborts entirely.
    // Auto-submit (timer expiry): no prompt, always notify so the
    // guardian is not left uninformed.
    if (!auto) {
      if (!window.confirm('Submit and SMS result to your guardian?')) return;
    }

    if (!auto) {
      const answeredCount = Object.keys(answers).length;
      const msg = answeredCount < questions.length
        ? `You have answered ${answeredCount} of ${questions.length} questions. Submit anyway?`
        : 'Submit your test now?';
      if (!window.confirm(msg)) return;
    }

    submitRef.current = true;
    setSubmitting(true);
    try {
      const res = await mcqApi.submitAttempt(attempt.id, answers, { sms: true });
      setResult(res?.data ?? res);
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      } catch {}
      if (!auto) toast.success('Submitted successfully');
    } catch (e) {
      toast.error(e.message || 'Could not submit');
      submitRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [attempt?.id, answers, questions.length]);

  // attempt countdown → auto submit
  useEffect(() => {
    if (secondsLeft == null) return;
    if (secondsLeft <= 0) { submit(true); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, submit]);

  // ────────────────────────────────────────────────────────────────────
  // 4) Proctoring — event logging
  // ────────────────────────────────────────────────────────────────────
  const logEvent = useCallback((kind, payload) => {
    if (!attempt?.id) return;
    mcqApi.logProctorEvent(attempt.id, kind, payload).catch(() => {});
  }, [attempt?.id]);

  useEffect(() => {
    if (!attempt?.id) return;
    const onVis    = () => logEvent(document.hidden ? 'tab_hidden' : 'tab_visible');
    const onBlur   = () => logEvent('blur');
    const onFocus  = () => logEvent('focus');
    const onFs     = () => logEvent(document.fullscreenElement ? 'fullscreen_enter' : 'fullscreen_exit');
    const onCopy   = (e) => { e.preventDefault(); logEvent('copy'); };
    const onPaste  = (e) => { e.preventDefault(); logEvent('paste'); };
    const onCtx    = (e) => { e.preventDefault(); logEvent('contextmenu'); };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onCtx);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onCtx);
    };
  }, [attempt?.id, logEvent]);

  // ────────────────────────────────────────────────────────────────────
  // 5) Proctoring — webcam + recording + snapshots
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!attempt?.id) return;
    let cancelled = false;

    const onChunk = async (e) => {
      if (!e.data || e.data.size === 0) return;
      try { await mcqApi.uploadRecordingChunk(attempt.id, e.data); } catch {}
    };

    const startCam = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        logEvent('face_mismatch', { reason: 'no_media_devices' });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        mediaStreamRef.current = stream;

        // recording (rotating chunks)
        try {
          const mk = () => {
            const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
            mr.ondataavailable = onChunk;
            mr.start();
            return mr;
          };
          let mr = mk();
          recorderRef.current = mr;
          mr._cycle = setInterval(() => {
            try {
              mr.stop();
              mr = mk();
              recorderRef.current = mr;
            } catch {}
          }, CHUNK_MS);
        } catch (e) {
          console.warn('recorder failed', e);
        }

        // snapshots
        snapTimerRef.current = setInterval(async () => {
          try {
            const video = document.createElement('video');
            video.srcObject = stream;
            await video.play();
            const canvas = document.createElement('canvas');
            canvas.width = 320; canvas.height = 240;
            canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            video.pause();
            await mcqApi.uploadSnapshot(attempt.id, dataUrl);
          } catch {}
        }, SNAP_MS);
      } catch (e) {
        logEvent('face_mismatch', { reason: 'getUserMedia_failed', message: e.message });
      }
    };

    startCam();
    return () => {
      cancelled = true;
      if (snapTimerRef.current) clearInterval(snapTimerRef.current);
      try {
        if (recorderRef.current) {
          if (recorderRef.current._cycle) clearInterval(recorderRef.current._cycle);
          if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
        }
      } catch {}
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [attempt?.id, logEvent]);

  const enterFullscreen = async () => {
    try { await document.documentElement.requestFullscreen(); } catch {}
  };

  const pick = (qNum, letter) => setAnswers((a) => ({ ...a, [String(qNum)]: letter }));

  // ────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────

  if (loading) return <Loader />;

  // access code prompt
  if (needsCode) return (
    <Card>
      <h2 className="text-lg font-semibold mb-3">Enter access code</h2>
      <input
        className="input"
        value={accessCode}
        onChange={(e) => setAccessCode(e.target.value)}
        placeholder="Code from your teacher"
      />
      <div className="mt-3 flex justify-end">
        <Button onClick={() => { setNeedsCode(false); start(accessCode); }} loading={starting}>
          Start
        </Button>
      </div>
    </Card>
  );

  // submitted
  if (result) return (
    <Card>
      <div className="text-center py-6">
        <Check className="w-12 h-12 mx-auto text-emerald-500" />
        <h2 className="text-xl font-semibold mt-3">Submitted</h2>
        <p className="text-2xl font-bold mt-2">{result.score}</p>
        <p className="text-slate-500 text-sm mt-1">
          {result.correct_count} correct · {result.wrong_count} wrong · {result.blank_count} blank
        </p>
        {result.flagged_count > 0 && (
          <p className="text-amber-600 text-xs mt-3">
            {result.flagged_count} proctoring event(s) recorded
          </p>
        )}
        <div className="mt-5"><Button onClick={() => nav('/mcq')}>Done</Button></div>
      </div>
    </Card>
  );

  // ── card: waiting / open / closed / in_progress ──
  if (!attempt?.id) {
    if (!view) {
      return (
        <Card>
          <Empty title="Exam not available" hint="Ask your teacher if this is unexpected." />
        </Card>
      );
    }

    const exam = view.exam || {};
    const state = view.state;
    const serverNow = Date.now() - skewMs;
    const startMs = toMs(exam.scheduled_start_at);
    const endMs   = toMs(exam.scheduled_end_at);

    let label = '';
    let big = '';
    let canStart = false;
    let Icon = Lock;
    let iconColor = 'text-slate-400';

    if (state === 'waiting') {
      const sec = startMs ? Math.max(0, Math.ceil((startMs - serverNow) / 1000)) : 0;
      label = 'Starts in';
      big = fmt(sec);
      canStart = false;
      Icon = Clock;
      iconColor = 'text-brand-500';
    } else if (state === 'open') {
      const sec = endMs ? Math.max(0, Math.ceil((endMs - serverNow) / 1000)) : 0;
      label = 'Window closes in';
      big = fmt(sec);
      canStart = true;
      Icon = Clock;
      iconColor = 'text-emerald-500';
    } else if (state === 'submitted') {
      label = 'Already submitted'; big = '✓'; Icon = Check; iconColor = 'text-emerald-500';
    } else if (state === 'closed') {
      label = 'Window closed'; big = '—'; Icon = Lock; iconColor = 'text-slate-400';
    } else if (state === 'in_progress') {
      label = 'Resuming…'; big = '…'; Icon = PlayCircle; iconColor = 'text-brand-500';
    }

    return (
      <Card>
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold">{exam.title || 'Exam'}</h2>
          {exam.subject_name && <p className="text-sm text-slate-500 mt-1">{exam.subject_name}</p>}
          <p className="text-xs text-slate-500 mt-1">
            {exam.total_questions} question{exam.total_questions === 1 ? '' : 's'}
            {exam.time_limit_minutes ? ` · ${exam.time_limit_minutes} min` : ''}
            {exam.proctoring_enabled ? ' · proctored' : ''}
          </p>

          <div className="mt-6">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`text-4xl font-mono font-bold mt-1 ${state === 'open' ? 'text-emerald-600' : ''}`}>
              {big}
            </div>
            <Icon className={`w-5 h-5 mx-auto mt-2 ${iconColor}`} />
          </div>

          {state === 'waiting' && (
            <p className="text-xs text-slate-500 mt-4">
              The <strong>Start</strong> button will enable when the window opens.
              Keep this page open — it polls every 15 seconds.
            </p>
          )}

          <div className="mt-6">
            <Button onClick={() => start()} disabled={!canStart} loading={starting}>
              {state === 'open'
                ? 'Start test'
                : state === 'waiting'
                  ? 'Waiting…'
                  : state === 'closed'
                    ? 'Unavailable'
                    : state === 'submitted'
                      ? 'Already submitted'
                      : 'Unavailable'}
            </Button>
          </div>

          {state === 'closed' && (
            <p className="text-xs text-amber-600 mt-4">
              The exam window has ended. Contact your teacher if you believe this is a mistake.
            </p>
          )}
        </div>
      </Card>
    );
  }

  // ── exam in progress ──
  if (!questions.length) return <Card><Empty title="No questions in this exam" /></Card>;

  const q = questions[idx];
  const answered = Object.keys(answers).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => nav(-1)} className="text-sm text-slate-500 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3 text-sm">
          {!document.fullscreenElement && (
            <button onClick={enterFullscreen} className="text-amber-600 flex items-center gap-1">
              <Maximize className="w-4 h-4" /> Fullscreen
            </button>
          )}
          {secondsLeft != null && (
            <span className={`font-mono font-semibold ${secondsLeft < 60 ? 'text-red-600' : ''}`}>
              <Clock className="w-4 h-4 inline -mt-0.5" /> {fmt(secondsLeft)}
            </span>
          )}
          <span className="text-slate-500">{answered}/{questions.length} answered</span>
        </div>
      </div>

      <Card>
        <div className="text-xs text-slate-500 mb-2">Question {idx + 1} of {questions.length}</div>
        <div className="text-base font-medium mb-4">{q.question_text || '(no text)'}</div>
        <div className="space-y-2">
          {['A','B','C','D'].map((letter) => {
            const val = q[`option_${letter.toLowerCase()}`];
            if (!val) return null;
            const selected = answers[String(q.q_number)] === letter;
            return (
              <button key={letter} onClick={() => pick(q.q_number, letter)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                  selected
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-700 hover:border-brand-400'
                }`}>
                <span className="font-semibold mr-2">{letter}.</span>{val}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex justify-between items-center">
        <Button variant="secondary" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>Previous</Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => submit(false)} loading={submitting}>
            Submit Exam
          </Button>
          {idx < questions.length - 1 && (
            <Button onClick={() => setIdx((i) => i + 1)}>Next</Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 justify-center">
        {questions.map((qq, i) => {
          const done = answers[String(qq.q_number)];
          return (
            <button key={qq.q_number} onClick={() => setIdx(i)}
              className={`w-6 h-6 rounded text-xs font-medium ${
                i === idx ? 'bg-brand-600 text-white'
                : done ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
              }`}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
