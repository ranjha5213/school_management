import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Clock, Check, AlertTriangle, Maximize } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { mcqApi } from '../api/endpoints';

const CHUNK_MS = 30_000;
const SNAP_MS  = 30_000;

export default function TakeMcq() {
  const { examId } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
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

  const start = useCallback(async (code) => {
    setLoading(true);
    try {
      const res = await mcqApi.startAttempt(examId, code);
      setAttempt(res.attempt);
      setQuestions(res.questions || []);
      if (res.attempt?.time_limit_seconds) {
        const started = new Date((res.attempt.started_at + 'Z')).getTime();
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSecondsLeft(Math.max(0, res.attempt.time_limit_seconds - elapsed));
      } else {
        setSecondsLeft(null);
      }
    } catch (e) {
      if (/access code/i.test(e.message)) setNeedsCode(true);
      else toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { start(); }, [start]);

  useEffect(() => {
    if (secondsLeft == null) return;
    if (secondsLeft <= 0) { submit(true); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const logEvent = useCallback((kind, payload) => {
    if (!attempt?.id) return;
    mcqApi.logProctorEvent(attempt.id, kind, payload).catch(() => {});
  }, [attempt?.id]);

  useEffect(() => {
    if (!attempt?.id) return;
    const onVis = () => logEvent(document.hidden ? 'tab_hidden' : 'tab_visible');
    const onBlur = () => logEvent('blur');
    const onFocus = () => logEvent('focus');
    const onFsChange = () => logEvent(document.fullscreenElement ? 'fullscreen_enter' : 'fullscreen_exit');
    const onCopy = (e) => { e.preventDefault(); logEvent('copy'); };
    const onPaste = (e) => { e.preventDefault(); logEvent('paste'); };
    const onCtx = (e) => { e.preventDefault(); logEvent('contextmenu'); };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onCtx);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onCtx);
    };
  }, [attempt?.id, logEvent]);

  useEffect(() => {
    if (!attempt?.id) return;
    let cancelled = false;

    const handleChunk = async (e) => {
      if (!e.data || e.data.size === 0) return;
      try { await mcqApi.uploadRecordingChunk(attempt.id, e.data); } catch {}
    };

    const startWebcam = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        logEvent('face_mismatch', { reason: 'no_media_devices' });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        mediaStreamRef.current = stream;

        try {
          const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
          recorderRef.current = mr;
          mr.ondataavailable = handleChunk;
          mr.start();
          mr._cycle = setInterval(() => {
            try {
              mr.stop();
              const nxt = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
              recorderRef.current = nxt;
              nxt.ondataavailable = handleChunk;
              nxt.start();
            } catch {}
          }, CHUNK_MS);
        } catch (e) {
          console.warn('recorder failed', e);
        }

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

    startWebcam();
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

  const submit = async (auto = false) => {
    if (!attempt?.id || submitRef.current) return;
    
    if (!auto) {
      const answeredCount = Object.keys(answers).length;
      const confirmMsg = answeredCount < questions.length 
        ? `You have answered ${answeredCount} out of ${questions.length} questions. Are you sure you want to submit?`
        : 'Are you sure you want to submit your test?';
      if (!window.confirm(confirmMsg)) return;
    }

    submitRef.current = true;
    setSubmitting(true);
    try {
      const res = await mcqApi.submitAttempt(attempt.id, answers);
      setResult(res);
      logEvent('submit');
      try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch {}
      if (!auto) toast.success('Submitted successfully');
    } catch (e) {
      toast.error(e.message);
      submitRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const pick = (qNum, letter) => setAnswers((a) => ({ ...a, [String(qNum)]: letter }));

  if (loading) return <Loader />;

  if (needsCode) return (
    <Card>
      <h2 className="text-lg font-semibold mb-3">Enter access code</h2>
      <input className="input" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
        placeholder="Code from your teacher" />
      <div className="mt-3 flex justify-end">
        <Button onClick={() => { setNeedsCode(false); start(accessCode); }}>Start</Button>
      </div>
    </Card>
  );

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
              <Clock className="w-4 h-4 inline -mt-0.5" /> {Math.floor(secondsLeft/60)}:{String(secondsLeft%60).padStart(2,'0')}
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

