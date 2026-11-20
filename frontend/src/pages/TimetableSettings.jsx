// src/pages/TimetableSettings.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Clock, Save, Sliders } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import { settingsApi } from '../api/endpoints';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DEFAULT_PERIODS = Array.from({ length: 10 }, (_, i) => {
  const start = 480 + i * 35; // 08:00 start, 35 mins each
  return {
    name: `Period ${i + 1}`,
    start_time: minsToTime(start),
    end_time: minsToTime(start + 35),
    isBreak: false,
  };
});

export const DEFAULT_FRIDAY_PERIODS = Array.from({ length: 7 }, (_, i) => {
  const start = 480 + i * 35;
  return {
    name: `Period ${i + 1}`,
    start_time: minsToTime(start),
    end_time: minsToTime(start + 35),
    isBreak: false,
  };
});

function timeToMins(str) {
  if (!str) return 480;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(mins) {
  const h = String(Math.floor((mins / 60) % 24)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseJsonSetting(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  const val = raw.setting_value !== undefined ? raw.setting_value : raw;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return val ?? fallback;
}

export default function TimetableSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hiddenDays, setHiddenDays] = useState([]);
  const [config, setConfig] = useState({
    startTime: '08:00',
    totalPeriods: 10,
    periodDuration: 35,
    recessAfter: 4,
    recessDuration: 25,

    fridayStartTime: '08:00',
    fridayTotalPeriods: 7,
    fridayPeriodDuration: 35,
    fridayRecessAfter: 4,
    fridayRecessDuration: 15,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [rawHidden, rawCounts, rawPeriods, rawFri] = await Promise.all([
          settingsApi.get('hidden_days').catch(() => null),
          settingsApi.get('period_counts').catch(() => null),
          settingsApi.get('default_periods').catch(() => null),
          settingsApi.get('default_friday_periods').catch(() => null),
        ]);
        if (cancelled) return;

        const hd = parseJsonSetting(rawHidden, []);
        const counts = parseJsonSetting(rawCounts, { regular: 10, friday: 7 });
        const p = parseJsonSetting(rawPeriods, []);
        const fp = parseJsonSetting(rawFri, []);

        if (Array.isArray(hd)) setHiddenDays(hd);
        setConfig((prev) => ({
          ...prev,
          startTime: p[0]?.start_time || prev.startTime,
          totalPeriods: Number(counts.regular) || prev.totalPeriods,
          fridayStartTime: fp[0]?.start_time || prev.fridayStartTime,
          fridayTotalPeriods: Number(counts.friday) || prev.fridayTotalPeriods,
        }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDay = (day) => {
    setHiddenDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const buildSchedule = (startStr, count, dur, recessAfter, recessDur) => {
    let cur = timeToMins(startStr);
    const list = [];
    for (let i = 1; i <= Number(count); i++) {
      const end = cur + Number(dur);
      list.push({
        name: `Period ${i}`,
        start_time: minsToTime(cur),
        end_time: minsToTime(end),
        isBreak: false,
      });
      cur = end;
      if (i === Number(recessAfter) && Number(recessDur) > 0) {
        const bEnd = cur + Number(recessDur);
        list.push({
          name: 'Break / Recess',
          start_time: minsToTime(cur),
          end_time: minsToTime(bEnd),
          isBreak: true,
        });
        cur = bEnd;
      }
    }
    return list;
  };

  const handleSave = async (goToGrid = false) => {
    setSaving(true);
    try {
      const regular = buildSchedule(
        config.startTime,
        config.totalPeriods,
        config.periodDuration,
        config.recessAfter,
        config.recessDuration
      );
      const friday = buildSchedule(
        config.fridayStartTime,
        config.fridayTotalPeriods,
        config.fridayPeriodDuration,
        config.fridayRecessAfter,
        config.fridayRecessDuration
      );

      await Promise.all([
        settingsApi.save('default_periods', regular),
        settingsApi.save('default_friday_periods', friday),
        settingsApi.save('hidden_days', hiddenDays),
        settingsApi.save('period_counts', {
          regular: regular.length,
          friday: friday.length,
        }),
      ]);

      toast.success('Timetable timings saved!');
      if (goToGrid) navigate('/timetable/grid');
    } catch (e) {
      toast.error(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Step 1: School Timetable Settings</h1>
        <Button
          size="sm"
          variant="secondary"
          icon={ArrowRight}
          onClick={() => navigate('/timetable/grid')}
        >
          Skip to Grid
        </Button>
      </div>

      {/* Visible Days */}
      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold">Active School Days</div>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const active = !hiddenDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  active
                    ? 'bg-brand-100 border-brand-300 text-brand-700'
                    : 'bg-slate-100 border-slate-300 text-slate-500'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Mon–Sat Schedule */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-brand-700">
          <Sliders className="w-4 h-4" /> Monday – Saturday Timings
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="label">Start Time</label>
            <input
              type="time"
              className="input"
              value={config.startTime}
              onChange={(e) => setConfig({ ...config, startTime: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Total Periods</label>
            <input
              type="number"
              min="1"
              max="15"
              className="input"
              value={config.totalPeriods}
              onChange={(e) => setConfig({ ...config, totalPeriods: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Period Mins</label>
            <input
              type="number"
              min="10"
              max="120"
              className="input"
              value={config.periodDuration}
              onChange={(e) => setConfig({ ...config, periodDuration: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Break After Period</label>
            <input
              type="number"
              min="0"
              max="12"
              className="input"
              value={config.recessAfter}
              onChange={(e) => setConfig({ ...config, recessAfter: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Break Mins</label>
            <input
              type="number"
              min="0"
              max="60"
              className="input"
              value={config.recessDuration}
              onChange={(e) => setConfig({ ...config, recessDuration: e.target.value })}
            />
          </div>
        </div>
      </Card>

      {/* Friday Schedule */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-amber-700">
          <Clock className="w-4 h-4" /> Friday Special Timings
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="label">Start Time</label>
            <input
              type="time"
              className="input"
              value={config.fridayStartTime}
              onChange={(e) => setConfig({ ...config, fridayStartTime: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Total Periods</label>
            <input
              type="number"
              min="1"
              max="12"
              className="input"
              value={config.fridayTotalPeriods}
              onChange={(e) => setConfig({ ...config, fridayTotalPeriods: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Period Mins</label>
            <input
              type="number"
              min="10"
              max="120"
              className="input"
              value={config.fridayPeriodDuration}
              onChange={(e) => setConfig({ ...config, fridayPeriodDuration: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Break After Period</label>
            <input
              type="number"
              min="0"
              max="10"
              className="input"
              value={config.fridayRecessAfter}
              onChange={(e) => setConfig({ ...config, fridayRecessAfter: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Break Mins</label>
            <input
              type="number"
              min="0"
              max="60"
              className="input"
              value={config.fridayRecessDuration}
              onChange={(e) => setConfig({ ...config, fridayRecessDuration: e.target.value })}
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" icon={Save} disabled={saving} onClick={() => handleSave(false)}>
          Save Only
        </Button>
        <Button icon={ArrowRight} disabled={saving} onClick={() => handleSave(true)}>
          {saving ? 'Saving…' : 'Save & Next: Timetable Grid'}
        </Button>
      </div>
    </div>
  );
}

