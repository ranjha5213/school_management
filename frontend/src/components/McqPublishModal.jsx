import { useState } from 'react';
import { X, Globe, Clock, KeyRound, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from './Button';
import { mcqApi } from '../api/endpoints';

function toLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(local) { return local ? new Date(local).toISOString() : null; }

export default function McqPublishModal({ exam, onClose, onSaved }) {
  const [isPublished, setIsPublished] = useState(!!exam.is_published);
  const [hasTimer,    setHasTimer]    = useState(exam.time_limit_minutes != null);
  const [minutes,     setMinutes]     = useState(exam.time_limit_minutes ?? 30);
  const [useCode,     setUseCode]     = useState(!!exam.access_code);
  const [code,        setCode]        = useState(exam.access_code || '');
  const [proctoring,  setProctoring]  = useState(!!exam.proctoring_enabled);
  const [schedule,    setSchedule]    = useState(!!exam.scheduled_start_at);
  const [startAt,     setStartAt]     = useState(toLocal(exam.scheduled_start_at));
  const [endAt,       setEndAt]       = useState(toLocal(exam.scheduled_end_at));
  const [saving,      setSaving]      = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await mcqApi.updateExamSettings(exam.id, {
        is_published:       schedule ? false : isPublished,
        time_limit_minutes: hasTimer ? Number(minutes) : null,
        access_code:        useCode ? code.trim() : null,
        proctoring_enabled: proctoring,
      });
      await mcqApi.updateExamSchedule(exam.id, {
        scheduled_start_at: schedule ? toIso(startAt) : null,
        scheduled_end_at:   schedule ? toIso(endAt)   : null,
      });
      toast.success('Saved');
      onSaved?.(); onClose();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg mx-4 p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Publish &amp; settings</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">{exam.title}</p>

        {/* Publish */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer mb-3">
          <input type="checkbox" checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)} className="mt-1" disabled={schedule} />
          <div>
            <div className="flex items-center gap-2 font-medium text-sm">
              <Globe className="w-4 h-4" /> Publish online
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {schedule
                ? 'Disabled while a schedule is set — the exam will publish automatically.'
                : 'Students with access can see and start this exam.'}
            </div>
          </div>
        </label>

        {/* Timer */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer mb-3">
          <input type="checkbox" checked={hasTimer}
            onChange={(e) => setHasTimer(e.target.checked)} className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Clock className="w-4 h-4" /> Time limit
            </div>
            {hasTimer ? (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} max={600} value={minutes}
                  onChange={(e) => setMinutes(e.target.value)} className="input w-24" />
                <span className="text-sm text-slate-500">minutes</span>
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-1">No timer.</div>
            )}
          </div>
        </label>

        {/* Access code */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer mb-3">
          <input type="checkbox" checked={useCode}
            onChange={(e) => setUseCode(e.target.checked)} className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium text-sm">
              <KeyRound className="w-4 h-4" /> Access code
            </div>
            {useCode ? (
              <input type="text" value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. MATH2026" className="input mt-2 w-full" />
            ) : (
              <div className="text-xs text-slate-500 mt-1">No code required.</div>
            )}
          </div>
        </label>

        {/* Proctoring */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer mb-3">
          <input type="checkbox" checked={proctoring}
            onChange={(e) => setProctoring(e.target.checked)} className="mt-1" />
          <div>
            <div className="flex items-center gap-2 font-medium text-sm">
              <Camera className="w-4 h-4" /> Proctoring
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Webcam snapshots + tab/blur events will be recorded.
            </div>
          </div>
        </label>

        {/* Schedule */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer mb-4">
          <input type="checkbox" checked={schedule}
            onChange={(e) => setSchedule(e.target.checked)} className="mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium text-sm">
              ⏰ Schedule
            </div>
            {schedule ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Opens at</label>
                  <input type="datetime-local" value={startAt}
                    onChange={(e) => setStartAt(e.target.value)} className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Closes at</label>
                  <input type="datetime-local" value={endAt}
                    onChange={(e) => setEndAt(e.target.value)} className="input w-full" />
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-1">
                No schedule — the exam opens when you press Publish.
              </div>
            )}
          </div>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </div>
      </div>
    </div>
  );
}
