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
const TIME_12H_REGEX = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i;
const NO_PERIODS_MSG = 'You have not entered periods yet.';

export function format12HourTime(totalMins) {
  if (!Number.isFinite(totalMins)) return '';
  const normalized = (((Math.round(totalMins) % 1440) + 1440) % 1440);
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const hh = String(hours12).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm} ${period}`;
}

export function parse12HourTime(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().toUpperCase();
  const match = trimmed.match(TIME_12H_REGEX);
  if (!match) return null;

  let hours12 = Number(match[1]);
  const minutes = Number(match[2]);
  const meridian = match[3];

  if (meridian === 'AM') {
    if (hours12 === 12) hours12 = 0;
  } else if (meridian === 'PM') {
    if (hours12 !== 12) hours12 += 12;
  }

  return hours12 * 60 + minutes;
}

export function normalize12HourInput(input) {
  const mins = parse12HourTime(input);
  return mins === null ? null : format12HourTime(mins);
}

function isBlank(val) {
  return val === null || val === undefined || String(val).trim() === '';
}

function validatePresetConfig(presetConfig, sectionLabel) {
  if (isBlank(presetConfig.startTime)) {
    return `${sectionLabel} → Start Time is required (enter a 12-hour time such as 08:00 AM).`;
  }
  const startMins = parse12HourTime(presetConfig.startTime);
  if (startMins === null) {
    return `${sectionLabel} → Start Time ("${presetConfig.startTime}") is invalid. Use 12-hour format like 08:00 AM or 01:30 PM.`;
  }

  if (isBlank(presetConfig.totalPeriods)) {
    return `${sectionLabel} → Teaching Periods is required (enter a whole number of 1 or more).`;
  }
  const total = Number(presetConfig.totalPeriods);
  if (!Number.isInteger(total) || total < 1) {
    return `${sectionLabel} → Teaching Periods ("${presetConfig.totalPeriods}") must be a whole number of at least 1.`;
  }

  if (isBlank(presetConfig.periodDuration)) {
    return `${sectionLabel} → Period Mins is required (enter a positive number of minutes).`;
  }
  const pDur = Number(presetConfig.periodDuration);
  if (!Number.isFinite(pDur) || pDur <= 0) {
    return `${sectionLabel} → Period Mins ("${presetConfig.periodDuration}") must be greater than 0.`;
  }

  let rAfter = 0;
  if (!isBlank(presetConfig.recessAfter)) {
    rAfter = Number(presetConfig.recessAfter);
    if (!Number.isInteger(rAfter) || rAfter < 0) {
      return `${sectionLabel} → Break After Period ("${presetConfig.recessAfter}") must be 0 or a positive whole number.`;
    }
  }

  let rDur = 0;
  if (!isBlank(presetConfig.recessDuration)) {
    rDur = Number(presetConfig.recessDuration);
    if (!Number.isFinite(rDur) || rDur < 0) {
      return `${sectionLabel} → Break Mins ("${presetConfig.recessDuration}") cannot be negative.`;
    }
  }

  if (rAfter > 0 && rDur <= 0) {
    return `${sectionLabel} → Break Mins is required and must be greater than 0 when Break After Period is set to ${rAfter}.`;
  }
  if (rDur > 0 && rAfter <= 0) {
    return `${sectionLabel} → Break After Period is required (at least 1) when Break Mins is greater than 0.`;
  }

  return null;
}

function buildSchedule(startStr, count, dur, recessAfter, recessDur) {
  const startMins = parse12HourTime(startStr);
  const total = Number(count);
  const pDur = Number(dur);
  const rAfter = isBlank(recessAfter) ? 0 : Number(recessAfter);
  const rDur = isBlank(recessDur) ? 0 : Number(recessDur);

  let cur = startMins;
  const list = [];
  let periodNum = 1;

  for (let i = 1; i <= total; i++) {
    const end = cur + pDur;
    list.push({
      name: `Period ${periodNum}`,
      start_time: format12HourTime(cur),
      end_time: format12HourTime(end),
      isBreak: false,
    });
    cur = end;

    if (rAfter > 0 && periodNum === rAfter && rDur > 0) {
      const bEnd = cur + rDur;
      list.push({
        name: 'Break / Recess',
        start_time: format12HourTime(cur),
        end_time: format12HourTime(bEnd),
        isBreak: true,
      });
      cur = bEnd;
    }
    periodNum += 1;
  }

  return list;
}

export const DEFAULT_PERIODS = [];
export const DEFAULT_FRIDAY_PERIODS = [];

export function parseJsonSetting(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  const val = raw.setting_value !== undefined ? raw.setting_value : raw;
  if (typeof val === 'string') {
    if (!val.trim()) return fallback;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return val ?? fallback;
}

function extractTimingMeta(arr) {
  if (!Array.isArray(arr) || !arr.length) {
    return {
      periodDuration: '',
      recessAfter: '',
      recessDuration: '',
      teachingCount: '',
    };
  }

  const teachingItems = arr.filter((item) => !item.isBreak);
  const firstTeaching = teachingItems[0];
  let periodDuration = '';

  if (firstTeaching) {
    const startM = parse12HourTime(firstTeaching.start_time);
    const endM = parse12HourTime(firstTeaching.end_time);
    if (startM !== null && endM !== null && endM > startM) {
      periodDuration = endM - startM;
    }
  }

  const breakIdx = arr.findIndex((item) => item.isBreak);
  if (breakIdx === -1) {
    return {
      periodDuration,
      recessAfter: '',
      recessDuration: '',
      teachingCount: teachingItems.length || '',
    };
  }

  const teachingBeforeBreak = arr.slice(0, breakIdx).filter((item) => !item.isBreak).length;
  const breakItem = arr[breakIdx];
  const bStart = parse12HourTime(breakItem?.start_time);
  const bEnd = parse12HourTime(breakItem?.end_time);
  const recessDuration =
    bStart !== null && bEnd !== null && bEnd >= bStart ? bEnd - bStart : '';

  return {
    periodDuration,
    recessAfter: teachingBeforeBreak,
    recessDuration,
    teachingCount: teachingItems.length || '',
  };
}

function normalizePeriodRow(item, idx) {
  const isBreak = Boolean(item?.isBreak);
  const formattedStart =
    normalize12HourInput(item?.start_time ?? '') ?? String(item?.start_time ?? '').trim();
  const formattedEnd =
    normalize12HourInput(item?.end_time ?? '') ?? String(item?.end_time ?? '').trim();

  return {
    name: String(item?.name ?? '').trim() || (isBreak ? 'Break / Recess' : `Period ${idx + 1}`),
    start_time: formattedStart,
    end_time: formattedEnd,
    isBreak,
  };
}

function validateRowsForSave(rows, sectionLabel) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `${sectionLabel}: ${NO_PERIODS_MSG}`;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowLabel = `${sectionLabel} → Row ${i + 1}`;

    if (isBlank(row.name)) {
      return `${rowLabel} → Slot / Period Label is required and cannot be empty.`;
    }

    if (isBlank(row.start_time)) {
      return `${rowLabel} → Start Time is required (enter a 12-hour time such as 08:00 AM).`;
    }
    const startMins = parse12HourTime(row.start_time);
    if (startMins === null) {
      return `${rowLabel} → Start Time ("${row.start_time}") is invalid. Use 12-hour format like 08:00 AM or 01:30 PM.`;
    }

    if (isBlank(row.end_time)) {
      return `${rowLabel} → End Time is required (enter a 12-hour time such as 08:35 AM).`;
    }
    const endMins = parse12HourTime(row.end_time);
    if (endMins === null) {
      return `${rowLabel} → End Time ("${row.end_time}") is invalid. Use 12-hour format like 08:35 AM or 02:05 PM.`;
    }

    if (endMins <= startMins) {
      return `${rowLabel} → End Time (${row.end_time}) must be later than Start Time (${row.start_time}).`;
    }
  }
  return null;
}

function IndividualPeriodEditor({
  title,
  accentClass,
  icon: Icon,
  presetConfig,
  errorMessage,
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={onApplyPreset}
          >
            Generate From Quick Timings
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
      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 space-y-2">
        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          Quick Generator — Enter times in 12-hour format (e.g., 08:00 AM or 01:30 PM)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
          <div>
            <label className="label">Start Time (12h) *</label>
            <input
              type="text"
              placeholder="08:00 AM"
              className="input font-mono"
              value={presetConfig.startTime}
              onChange={(e) => onPresetChange({ ...presetConfig, startTime: e.target.value })}
              onBlur={(e) => {
                const formatted = normalize12HourInput(e.target.value);
                if (formatted) {
                  onPresetChange({ ...presetConfig, startTime: formatted });
                }
              }}
            />
          </div>
          <div>
            <label className="label">Teaching Periods *</label>
            <input
              type="number"
              min="1"
              max="20"
              placeholder="e.g. 8"
              className="input"
              value={presetConfig.totalPeriods}
              onChange={(e) => onPresetChange({ ...presetConfig, totalPeriods: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Period Mins *</label>
            <input
              type="number"
              min="1"
              max="180"
              placeholder="e.g. 35"
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
              placeholder="e.g. 4"
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
              placeholder="e.g. 20"
              className="input"
              value={presetConfig.recessDuration}
              onChange={(e) => onPresetChange({ ...presetConfig, recessDuration: e.target.value })}
            />
          </div>
        </div>
        {errorMessage && (
          <div
            role="alert"
            className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300 font-medium"
          >
            {errorMessage}
          </div>
        )}
      </div>

      {/* Individual period-by-period timing table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-left border-collapse text-xs min-w-[640px]">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
              <th className="p-2.5 w-12 text-center">#</th>
              <th className="p-2.5">Slot / Period Label *</th>
              <th className="p-2.5 w-40">Start Time (12h) *</th>
              <th className="p-2.5 w-40">End Time (12h) *</th>
              <th className="p-2.5 w-24 text-center">Break</th>
              <th className="p-2.5 w-14 text-center">Remove</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-amber-700 dark:text-amber-300 font-medium">
                  {NO_PERIODS_MSG}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
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
                      placeholder="e.g. Period 1 or Break / Recess"
                      className="input text-xs py-1.5"
                      value={row.name}
                      onChange={(e) => onChangeRow(idx, { ...row, name: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      placeholder="08:00 AM"
                      className="input text-xs py-1.5 font-mono"
                      value={row.start_time}
                      onChange={(e) => onChangeRow(idx, { ...row, start_time: e.target.value })}
                      onBlur={(e) => {
                        const formatted = normalize12HourInput(e.target.value);
                        if (formatted) {
                          onChangeRow(idx, { ...row, start_time: formatted });
                        }
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      placeholder="08:35 AM"
                      className="input text-xs py-1.5 font-mono"
                      value={row.end_time}
                      onChange={(e) => onChangeRow(idx, { ...row, end_time: e.target.value })}
                      onBlur={(e) => {
                        const formatted = normalize12HourInput(e.target.value);
                        if (formatted) {
                          onChangeRow(idx, { ...row, end_time: formatted });
                        }
                      }}
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
                          : `Period ${
                              rows.slice(0, idx + 1).filter((r) => !r.isBreak).length || idx + 1
                            }`;
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
                      onClick={() => onRemoveRow(idx)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                      title="Remove row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
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

  const [errors, setErrors] = useState({
    days: '',
    regular: '',
    friday: '',
  });

  const [config, setConfig] = useState({
    startTime: '',
    totalPeriods: '',
    periodDuration: '',
    recessAfter: '',
    recessDuration: '',

    fridayStartTime: '',
    fridayTotalPeriods: '',
    fridayPeriodDuration: '',
    fridayRecessAfter: '',
    fridayRecessDuration: '',
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
        const p = parseJsonSetting(rawPeriods, []);
        const fp = parseJsonSetting(rawFri, []);

        const normReg = Array.isArray(p) ? p.map(normalizePeriodRow) : [];
        const normFri = Array.isArray(fp) ? fp.map(normalizePeriodRow) : [];

        const regMeta = extractTimingMeta(normReg);
        const friMeta = extractTimingMeta(normFri);

        if (Array.isArray(hd)) setHiddenDays(hd);
        setRegularRows(normReg);
        setFridayRows(normFri);

        setConfig((prev) => ({
          ...prev,
          startTime: normReg[0]?.start_time || '',
          totalPeriods: regMeta.teachingCount || counts?.regular || '',
          periodDuration: regMeta.periodDuration,
          recessAfter: regMeta.recessAfter,
          recessDuration: regMeta.recessDuration,

          fridayStartTime: normFri[0]?.start_time || '',
          fridayTotalPeriods: friMeta.teachingCount || counts?.friday || '',
          fridayPeriodDuration: friMeta.periodDuration,
          fridayRecessAfter: friMeta.recessAfter,
          fridayRecessDuration: friMeta.recessDuration,
        }));
      } catch (e) {
        if (!cancelled) toast.error(e?.message || 'Failed to load timetable settings');
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
    setHiddenDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      const activeCount = DAYS.filter((d) => !next.includes(d)).length;
      setErrors((e) => ({
        ...e,
        days: activeCount === 0 ? 'Active School Days → Select at least one active school day.' : '',
      }));
      return next;
    });
  };

  const applyPresetFor = (mode) => {
    const isFriday = mode === 'friday';
    const sectionLabel = isFriday ? 'Friday' : 'Monday–Saturday';
    const presetSlice = isFriday
      ? {
          startTime: config.fridayStartTime,
          totalPeriods: config.fridayTotalPeriods,
          periodDuration: config.fridayPeriodDuration,
          recessAfter: config.fridayRecessAfter,
          recessDuration: config.fridayRecessDuration,
        }
      : {
          startTime: config.startTime,
          totalPeriods: config.totalPeriods,
          periodDuration: config.periodDuration,
          recessAfter: config.recessAfter,
          recessDuration: config.recessDuration,
        };

    const validationErr = validatePresetConfig(presetSlice, sectionLabel);
    if (validationErr) {
      setErrors((prev) => ({ ...prev, [mode]: validationErr }));
      toast.error(validationErr);
      return;
    }

    const generated = buildSchedule(
      presetSlice.startTime,
      presetSlice.totalPeriods,
      presetSlice.periodDuration,
      presetSlice.recessAfter,
      presetSlice.recessDuration
    );

    setErrors((prev) => ({ ...prev, [mode]: '' }));
    if (isFriday) {
      setFridayRows(generated);
      toast.success('Friday period rows generated in 12-hour format');
    } else {
      setRegularRows(generated);
      toast.success('Monday–Saturday period rows generated in 12-hour format');
    }
  };

  const updateRowAt = (mode, idx, updated) => {
    const setter = mode === 'friday' ? setFridayRows : setRegularRows;
    setter((prev) => prev.map((r, i) => (i === idx ? updated : r)));
  };

  const addRowTo = (mode, isBreak) => {
    const isFriday = mode === 'friday';
    const sectionLabel = isFriday ? 'Friday' : 'Monday–Saturday';
    const slotTypeLabel = isBreak ? 'Break Mins' : 'Period Mins';
    const setter = isFriday ? setFridayRows : setRegularRows;
    const rows = isFriday ? fridayRows : regularRows;
    const fallbackStart = isFriday ? config.fridayStartTime : config.startTime;
    const fallbackDur = isBreak
      ? isFriday
        ? config.fridayRecessDuration
        : config.recessDuration
      : isFriday
      ? config.fridayPeriodDuration
      : config.periodDuration;

    if (isBlank(fallbackDur)) {
      const msg = `${sectionLabel} → ${slotTypeLabel} is required before adding a ${
        isBreak ? 'break' : 'period'
      }.`;
      setErrors((prev) => ({ ...prev, [mode]: msg }));
      toast.error(msg);
      return;
    }

    const dur = Number(fallbackDur);
    if (!Number.isFinite(dur) || dur <= 0) {
      const msg = `${sectionLabel} → ${slotTypeLabel} ("${fallbackDur}") must be greater than 0.`;
      setErrors((prev) => ({ ...prev, [mode]: msg }));
      toast.error(msg);
      return;
    }

    let startMins = null;
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      if (isBlank(last.end_time)) {
        const msg = `${sectionLabel} → Row ${rows.length} → End Time is empty. Enter a valid 12-hour time such as 08:35 AM.`;
        setErrors((prev) => ({ ...prev, [mode]: msg }));
        toast.error(msg);
        return;
      }
      startMins = parse12HourTime(last.end_time);
      if (startMins === null) {
        const msg = `${sectionLabel} → Row ${rows.length} → End Time ("${last.end_time}") is invalid. Enter a valid 12-hour time such as 08:35 AM.`;
        setErrors((prev) => ({ ...prev, [mode]: msg }));
        toast.error(msg);
        return;
      }
    } else {
      if (isBlank(fallbackStart)) {
        const msg = `${sectionLabel} → Start Time is required (enter a 12-hour time such as 08:00 AM) before adding a row.`;
        setErrors((prev) => ({ ...prev, [mode]: msg }));
        toast.error(msg);
        return;
      }
      startMins = parse12HourTime(fallbackStart);
      if (startMins === null) {
        const msg = `${sectionLabel} → Start Time ("${fallbackStart}") is invalid. Enter a valid 12-hour time such as 08:00 AM.`;
        setErrors((prev) => ({ ...prev, [mode]: msg }));
        toast.error(msg);
        return;
      }
    }

    setErrors((prev) => ({ ...prev, [mode]: '' }));
    const nextPeriodNum = rows.filter((r) => !r.isBreak).length + 1;
    setter([
      ...rows,
      {
        name: isBreak ? 'Break / Recess' : `Period ${nextPeriodNum}`,
        start_time: format12HourTime(startMins),
        end_time: format12HourTime(startMins + dur),
        isBreak,
      },
    ]);
  };

  const removeRowAt = (mode, idx) => {
    const setter = mode === 'friday' ? setFridayRows : setRegularRows;
    setter((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (goToGrid = false) => {
    const activeDayCount = DAYS.filter((d) => !hiddenDays.includes(d)).length;
    const daysErr =
      activeDayCount === 0
        ? 'Active School Days → At least one active school day must be selected.'
        : '';
    const regErr = validateRowsForSave(regularRows, 'Monday–Saturday') || '';
    const friErr = validateRowsForSave(fridayRows, 'Friday') || '';

    setErrors({
      days: daysErr,
      regular: regErr,
      friday: friErr,
    });

    const firstError = daysErr || regErr || friErr;
    if (firstError) {
      toast.error(firstError);
      return;
    }

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

      toast.success('12-hour period timings saved!');
      if (goToGrid) navigate('/timetable/grid');
    } catch (e) {
      toast.error(e?.message || 'Failed to save settings');
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
        <div className="text-sm font-semibold">Active School Days *</div>
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
        {errors.days && (
          <div
            role="alert"
            className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300 font-medium"
          >
            {errors.days}
          </div>
        )}
      </Card>

      <IndividualPeriodEditor
        title="Monday – Saturday Individual Period Timings (12-Hour Format)"
        accentClass="text-brand-700"
        icon={Sliders}
        presetConfig={{
          startTime: config.startTime,
          totalPeriods: config.totalPeriods,
          periodDuration: config.periodDuration,
          recessAfter: config.recessAfter,
          recessDuration: config.recessDuration,
        }}
        errorMessage={errors.regular}
        onPresetChange={(next) => setConfig((prev) => ({ ...prev, ...next }))}
        onApplyPreset={() => applyPresetFor('regular')}
        rows={regularRows}
        onChangeRow={(idx, updated) => updateRowAt('regular', idx, updated)}
        onAddRow={(isBreak) => addRowTo('regular', isBreak)}
        onRemoveRow={(idx) => removeRowAt('regular', idx)}
      />

      <IndividualPeriodEditor
        title="Friday Individual Period Timings (12-Hour Format)"
        accentClass="text-amber-700"
        icon={Clock}
        presetConfig={{
          startTime: config.fridayStartTime,
          totalPeriods: config.fridayTotalPeriods,
          periodDuration: config.fridayPeriodDuration,
          recessAfter: config.fridayRecessAfter,
          recessDuration: config.fridayRecessDuration,
        }}
        errorMessage={errors.friday}
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
        onApplyPreset={() => applyPresetFor('friday')}
        rows={fridayRows}
        onChangeRow={(idx, updated) => updateRowAt('friday', idx, updated)}
        onAddRow={(isBreak) => addRowTo('friday', isBreak)}
        onRemoveRow={(idx) => removeRowAt('friday', idx)}
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

