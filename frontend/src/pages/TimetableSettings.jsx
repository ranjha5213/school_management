// src/pages/TimetableSettings.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Clock, Plus, RefreshCw, Save, Sliders, Trash2 } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import { settingsApi } from '../api/endpoints';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeToMins(str) {
  if (!str) return 480;
  const [h, m] = String(str).split(':').map(Number);
  return (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0);
}

function minsToTime(mins) {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalized / 60)).padStart(2, '0');
  const m = String(normalized % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function buildSchedule(startStr, count, dur, recessAfter, recessDur) {
  let cur = timeToMins(startStr);
  const list = [];
  const total = Math.max(1, Number(count) || 1);
  const pDur = Math.max(5, Number(dur) || 35);
  const rAfter = Number(recessAfter) || 0;
  const rDur = Math.max(0, Number(recessDur) || 0);

  let periodNum = 1;
  for (let i = 1; i <= total; i++) {
    const end = cur + pDur;
    list.push({
      name: `Period ${periodNum}`,
      start_time: minsToTime(cur),
      end_time: minsToTime(end),
      isBreak: false,
    });
    cur = end;
    if (rAfter > 0 && periodNum === rAfter && rDur > 0) {
      const bEnd = cur + rDur;
      list.push({
        name: 'Break / Recess',
        start_time: minsToTime(cur),
        end_time: minsToTime(bEnd),
        isBreak: true,
      });
      cur = bEnd;
    }
    periodNum += 1;
  }
  return list;
}

export const DEFAULT_PERIODS = buildSchedule('08:00', 10, 35, 4, 25);
export const DEFAULT_FRIDAY_PERIODS = buildSchedule('08:00', 7, 35, 4, 15);

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

function extractTimingMeta(arr, fallbackDur, fallbackRecessAfter, fallbackRecessDur) {
  if (!Array.isArray(arr) || !arr.length) {
    return {
      periodDuration: fallbackDur,
      recessAfter: fallbackRecessAfter,
      recessDuration: fallbackRecessDur,
    };
  }

  const teachingItems = arr.filter((item) => !item.isBreak);
  const firstTeaching = teachingItems[0];
  const periodDuration = firstTeaching
    ? Math.max(5, timeToMins(firstTeaching.end_time) - timeToMins(firstTeaching.start_time))
    : fallbackDur;

  const breakIdx = arr.findIndex((item) => item.isBreak);
  if (breakIdx === -1) {
    return {
      periodDuration,
      recessAfter: 0,
      recessDuration: 0,
      teachingCount: teachingItems.length,
    };
  }

  const teachingBeforeBreak = arr.slice(0, breakIdx).filter((item) => !item.isBreak).length;
  const breakItem = arr[breakIdx];
  const recessDuration = Math.max(
    0,
    timeToMins(breakItem.end_time) - timeToMins(breakItem.start_time)
  );

  return {
    periodDuration,
    recessAfter: teachingBeforeBreak,
    recessDuration,
    teachingCount: teachingItems.length,
  };
}

function normalizePeriodRow(item, idx) {
  const isBreak = Boolean(item?.isBreak);
  return {
    name: item?.name || (isBreak ? 'Break / Recess' : `Period ${idx + 1}`),
    start_time: item?.start_time || '08:00',
    end_time: item?.end_time || '08:35',
    isBreak,
  };
}

function IndividualPeriodEditor({
  title,
  accentClass,
  icon: Icon,
  presetConfig,
  onPresetChange,
  onApplyPreset,
  rows,
  onChangeRow,
  onAddRow,
  onRemoveRow,
}) {
  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`text-sm font-semibold flex items-center gap-2 ${accentClass}`}>
          <Icon className="w-4 h-4" /> {title}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={onApplyPreset}
          >
            Generate / Reset From Quick Timings
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={() => onAddRow(false)}
          >
            Add Period
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={() => onAddRow(true)}
          >
            Add Break
          </Button>
        </div>
      </div>

      {/* Quick preset generator bar */}
      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3">
        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">
          Quick Generator (optional — click &ldquo;Generate / Reset From Quick Timings&rdquo; to rebuild rows)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
          <div>
            <label className="label">Start Time</label>
            <input
              type="time"
              className="input"
              value={presetConfig.startTime}
              onChange={(e) => onPresetChange({ ...presetConfig, startTime: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Teaching Periods</label>
            <input
              type="number"
              min="1"
              max="20"
              className="input"
              value={presetConfig.totalPeriods}
              onChange={(e) => onPresetChange({ ...presetConfig, totalPeriods: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Period Mins</label>
            <input
              type="number"
              min="5"
              max="180"
              className="input"
              value={presetConfig.periodDuration}
              onChange={(e) => onPresetChange({ ...presetConfig, periodDuration: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Break After Period</label>
            <input
              type="number"
              min="0"
              max="15"
              className="input"
              value={presetConfig.recessAfter}
              onChange={(e) => onPresetChange({ ...presetConfig, recessAfter: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Break Mins</label>
            <input
              type="number"
              min="0"
              max="120"
              className="input"
              value={presetConfig.recessDuration}
              onChange={(e) => onPresetChange({ ...presetConfig, recessDuration: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Individual period-by-period timing table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-left border-collapse text-xs min-w-[600px]">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
              <th className="p-2.5 w-12 text-center">#</th>
              <th className="p-2.5">Slot / Period Label</th>
              <th className="p-2.5 w-36">Start Time</th>
              <th className="p-2.5 w-36">End Time</th>
              <th className="p-2.5 w-24 text-center">Break</th>
              <th className="p-2.5 w-14 text-center">Remove</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row, idx) => (
              <tr
                key={idx}
                className={
                  row.isBreak
                    ? 'bg-amber-50/60 dark:bg-amber-950/20'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                }
              >
                <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                <td className="p-2">
                  <input
                    type="text"
                    className="input text-xs py-1.5"
                    value={row.name}
                    onChange={(e) => onChangeRow(idx, { ...row, name: e.target.value })}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="time"
                    className="input text-xs py-1.5 font-mono"
                    value={row.start_time}
                    onChange={(e) => onChangeRow(idx, { ...row, start_time: e.target.value })}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="time"
                    className="input text-xs py-1.5 font-mono"
                    value={row.end_time}
                    onChange={(e) => onChangeRow(idx, { ...row, end_time: e.target.value })}
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={Boolean(row.isBreak)}
                    onChange={(e) => {
                      const nextBreak = e.target.checked;
                      const defaultName = nextBreak
                        ? 'Break / Recess'
                        : `Period ${rows.slice(0, idx + 1).filter((r) => !r.isBreak).length || idx + 1}`;
                      onChangeRow(idx, {
                        ...row,
                        isBreak: nextBreak,
                        name:
                          row.name === 'Break / Recess' || /^Period \d+$/i.test(row.name)
                            ? defaultName
                            : row.name,
                      });
                    }}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="p-2 text-center">
                  <button
                    type="button"
                    disabled={rows.length <= 1}
                    onClick={() => onRemoveRow(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded"
                    title="Remove row"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function TimetableSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hiddenDays, setHiddenDays] = useState([]);
  const [regularRows, setRegularRows] = useState(DEFAULT_PERIODS);
  const [fridayRows, setFridayRows] = useState(DEFAULT_FRIDAY_PERIODS);

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
        const counts = parseJsonSetting(rawCounts, null);
        const p = parseJsonSetting(rawPeriods, DEFAULT_PERIODS);
        const fp = parseJsonSetting(rawFri, DEFAULT_FRIDAY_PERIODS);

        const normReg = Array.isArray(p) && p.length ? p.map(normalizePeriodRow) : DEFAULT_PERIODS;
        const normFri =
          Array.isArray(fp) && fp.length ? fp.map(normalizePeriodRow) : DEFAULT_FRIDAY_PERIODS;

        const regMeta = extractTimingMeta(normReg, 35, 4, 25);
        const friMeta = extractTimingMeta(normFri, 35, 4, 15);

        if (Array.isArray(hd)) setHiddenDays(hd);
        setRegularRows(normReg);
        setFridayRows(normFri);

        setConfig((prev) => ({
          ...prev,
          startTime: normReg[0]?.start_time || prev.startTime,
          totalPeriods:
            Number(counts?.regular) || regMeta.teachingCount || prev.totalPeriods,
          periodDuration: regMeta.periodDuration,
          recessAfter: regMeta.recessAfter,
          recessDuration: regMeta.recessDuration,

          fridayStartTime: normFri[0]?.start_time || prev.fridayStartTime,
          fridayTotalPeriods:
            Number(counts?.friday) || friMeta.teachingCount || prev.fridayTotalPeriods,
          fridayPeriodDuration: friMeta.periodDuration,
          fridayRecessAfter: friMeta.recessAfter,
          fridayRecessDuration: friMeta.recessDuration,
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

  const handleApplyRegularPreset = () => {
    const generated = buildSchedule(
      config.startTime,
      config.totalPeriods,
      config.periodDuration,
      config.recessAfter,
      config.recessDuration
    );
    setRegularRows(generated);
    toast.success('Monday–Saturday period rows updated from quick timings');
  };

  const handleApplyFridayPreset = () => {
    const generated = buildSchedule(
      config.fridayStartTime,
      config.fridayTotalPeriods,
      config.fridayPeriodDuration,
      config.fridayRecessAfter,
      config.fridayRecessDuration
    );
    setFridayRows(generated);
    toast.success('Friday period rows updated from quick timings');
  };

  const handleChangeRegularRow = (idx, updated) => {
    setRegularRows((prev) => prev.map((r, i) => (i === idx ? updated : r)));
  };

  const handleAddRegularRow = (isBreak) => {
    setRegularRows((prev) => {
      const last = prev[prev.length - 1];
      const startMins = last ? timeToMins(last.end_time) : timeToMins(config.startTime);
      const dur = isBreak
        ? Math.max(5, Number(config.recessDuration) || 15)
        : Math.max(5, Number(config.periodDuration) || 35);
      const nextPeriodNum = prev.filter((r) => !r.isBreak).length + 1;
      return [
        ...prev,
        {
          name: isBreak ? 'Break / Recess' : `Period ${nextPeriodNum}`,
          start_time: minsToTime(startMins),
          end_time: minsToTime(startMins + dur),
          isBreak,
        },
      ];
    });
  };

  const handleRemoveRegularRow = (idx) => {
    setRegularRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleChangeFridayRow = (idx, updated) => {
    setFridayRows((prev) => prev.map((r, i) => (i === idx ? updated : r)));
  };

  const handleAddFridayRow = (isBreak) => {
    setFridayRows((prev) => {
      const last = prev[prev.length - 1];
      const startMins = last ? timeToMins(last.end_time) : timeToMins(config.fridayStartTime);
      const dur = isBreak
        ? Math.max(5, Number(config.fridayRecessDuration) || 15)
        : Math.max(5, Number(config.fridayPeriodDuration) || 35);
      const nextPeriodNum = prev.filter((r) => !r.isBreak).length + 1;
      return [
        ...prev,
        {
          name: isBreak ? 'Break / Recess' : `Period ${nextPeriodNum}`,
          start_time: minsToTime(startMins),
          end_time: minsToTime(startMins + dur),
          isBreak,
        },
      ];
    });
  };

  const handleRemoveFridayRow = (idx) => {
    setFridayRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleSave = async (goToGrid = false) => {
    setSaving(true);
    try {
      const regular = regularRows.map(normalizePeriodRow);
      const friday = fridayRows.map(normalizePeriodRow);

      await Promise.all([
        settingsApi.save('default_periods', regular),
        settingsApi.save('default_friday_periods', friday),
        settingsApi.save('hidden_days', hiddenDays),
        settingsApi.save('period_counts', {
          regular: regular.length,
          friday: friday.length,
        }),
      ]);

      toast.success('Individual period timings saved!');
      if (goToGrid) navigate('/timetable/grid');
    } catch (e) {
      toast.error(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-4 max-w-5xl">
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

      <IndividualPeriodEditor
        title="Monday – Saturday Individual Period Timings"
        accentClass="text-brand-700"
        icon={Sliders}
        presetConfig={{
          startTime: config.startTime,
          totalPeriods: config.totalPeriods,
          periodDuration: config.periodDuration,
          recessAfter: config.recessAfter,
          recessDuration: config.recessDuration,
        }}
        onPresetChange={(next) => setConfig((prev) => ({ ...prev, ...next }))}
        onApplyPreset={handleApplyRegularPreset}
        rows={regularRows}
        onChangeRow={handleChangeRegularRow}
        onAddRow={handleAddRegularRow}
        onRemoveRow={handleRemoveRegularRow}
      />

      <IndividualPeriodEditor
        title="Friday Individual Period Timings"
        accentClass="text-amber-700"
        icon={Clock}
        presetConfig={{
          startTime: config.fridayStartTime,
          totalPeriods: config.fridayTotalPeriods,
          periodDuration: config.fridayPeriodDuration,
          recessAfter: config.fridayRecessAfter,
          recessDuration: config.fridayRecessDuration,
        }}
        onPresetChange={(next) =>
          setConfig((prev) => ({
            ...prev,
            fridayStartTime: next.startTime,
            fridayTotalPeriods: next.totalPeriods,
            fridayPeriodDuration: next.periodDuration,
            fridayRecessAfter: next.recessAfter,
            fridayRecessDuration: next.recessDuration,
          }))
        }
        onApplyPreset={handleApplyFridayPreset}
        rows={fridayRows}
        onChangeRow={handleChangeFridayRow}
        onAddRow={handleAddFridayRow}
        onRemoveRow={handleRemoveFridayRow}
      />

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

