// src/pages/TimetableGridPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  RotateCcw,
  Settings,
  User,
  BookOpen,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import PrintHeader from '../components/PrintHeader';
import PrintShare from '../components/PrintShare';
import TimetableGrid, { periodKey } from '../components/TimetableGrid';
import { parseJsonSetting } from './TimetableSettings';
import api from '../api/client';
import { classesApi, settingsApi, teachersApi, timetableApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const OTHER_DAYS = ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NO_PERIODS_MSG = 'You have not entered periods yet.';
const TIME_12H_REGEX = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i;
const TIME_24H_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const WEEK_DAYS = [
  { key: 'monday', short: 'Mon' },
  { key: 'tuesday', short: 'Tue' },
  { key: 'wednesday', short: 'Wed' },
  { key: 'thursday', short: 'Thu' },
  { key: 'friday', short: 'Fri' },
  { key: 'saturday', short: 'Sat' },
];

const toText = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    return String(val.name || val.teacher_name || val.subject_name || val.full_name || '');
  }
  return '';
};

// ─── Time format normalizer ───
// Backend now returns "HH:MM:SS". UI period keys are "HH:MM".
// This makes both sides agree.
const toHHMM = (s) => {
  if (!s) return s;
  const m = String(s).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${String(Number(m[1])).padStart(2, '0')}:${m[2]}` : s;
};

// ─── Row normalizer ───
// - Normalizes start_time / end_time to HH:MM
// - Adds nested `teacher` / `subject` objects (keeps flat fields too)
const normalizeSlot = (r) => {
  if (!r || typeof r !== 'object') return r;
  return {
    ...r,
    start_time: toHHMM(r.start_time),
    end_time: toHHMM(r.end_time),
    teacher:
      r.teacher_id != null
        ? {
            id: Number(r.teacher_id),
            name: toText(r.teacher_name),
            code: toText(r.employee_code),
          }
        : r.teacher ?? null,
    subject:
      r.subject_id != null
        ? {
            id: Number(r.subject_id),
            name: toText(r.subject_name),
            code: toText(r.subject_code),
          }
        : r.subject ?? null,
  };
};

const asArray = (d) => {
  if (Array.isArray(d)) return d;
  if (!d) return [];
  for (const k of ['data', 'slots', 'rows', 'subjects', 'teachers']) {
    if (Array.isArray(d[k])) return d[k];
  }
  return [];
};

const extractClassOrderNumber = (label) => {
  const match = String(label || '').match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
};

const compareClassRows = (a, b) => {
  const numA = extractClassOrderNumber(a?.className ?? a?.class_name ?? a?.name);
  const numB = extractClassOrderNumber(b?.className ?? b?.class_name ?? b?.name);
  if (numA !== numB) return numA - numB;

  const nameA = String(a?.className ?? a?.class_name ?? a?.name ?? '');
  const nameB = String(b?.className ?? b?.class_name ?? b?.name ?? '');
  const byName = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  if (byName !== 0) return byName;

  const secA = String(a?.sectionName ?? a?.section_name ?? a?.name ?? '');
  const secB = String(b?.sectionName ?? b?.section_name ?? b?.name ?? '');
  return secA.localeCompare(secB, undefined, { numeric: true, sensitivity: 'base' });
};

const mergeById = (primary, secondary, idKeys = ['id', 'subject_id', 'teacher_id']) => {
  const seen = new Set();
  const out = [];
  for (const item of [...(primary || []), ...(secondary || [])]) {
    if (!item || typeof item !== 'object') continue;
    const rawId = idKeys.map((k) => item[k]).find((v) => v !== undefined && v !== null);
    const key = rawId !== undefined ? `id:${String(rawId)}` : JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
};

const cellKey = (day, pIdx) => `${String(day).toLowerCase()}:${pIdx}`;

const normalizeText = (name) => toText(name).trim().toLowerCase();
const normalizeTeacher = normalizeText;

const parseTimeToMinutes = (val) => {
  if (!val) return null;
  const str = String(val).trim();

  const m12 = str.toUpperCase().match(TIME_12H_REGEX);
  if (m12) {
    let h = Number(m12[1]);
    const mins = Number(m12[2]);
    const meridian = m12[3];
    if (meridian === 'AM' && h === 12) h = 0;
    if (meridian === 'PM' && h !== 12) h += 12;
    return h * 60 + mins;
  }

  const m24 = str.match(TIME_24H_REGEX);
  if (!m24) return null;
  const hours = Number(m24[1]);
  const mins = Number(m24[2]);
  if (Number.isNaN(hours) || Number.isNaN(mins) || hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
};

const to24HourTime = (val) => {
  if (!val) return '';
  const str = String(val).trim();

  const m12 = str.toUpperCase().match(TIME_12H_REGEX);
  if (m12) {
    let h = Number(m12[1]);
    const mins = m12[2];
    const meridian = m12[3];
    if (meridian === 'AM' && h === 12) h = 0;
    if (meridian === 'PM' && h !== 12) h += 12;
    return `${String(h).padStart(2, '0')}:${mins}:00`;
  }

  const m24 = str.match(TIME_24H_REGEX);
  if (m24) {
    const h = String(Number(m24[1])).padStart(2, '0');
    const mins = m24[2];
    const sec = m24[3] || '00';
    return `${h}:${mins}:${sec}`;
  }

  return '';
};

const timeRangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const s1 = parseTimeToMinutes(aStart);
  const e1 = parseTimeToMinutes(aEnd);
  const s2 = parseTimeToMinutes(bStart);
  const e2 = parseTimeToMinutes(bEnd);

  if (s1 !== null && e1 !== null && s2 !== null && e2 !== null) {
    return s1 < e2 && e1 > s2;
  }

  const k1 = periodKey(aStart);
  const k2 = periodKey(bStart);
  return Boolean(k1 && k2 && k1 === k2);
};

const findMatchingSectionSlot = (slotList, day, period, pIdx, existingSlot = null) => {
  if (!Array.isArray(slotList) || !slotList.length) return null;

  if (existingSlot?.id) {
    const byId = slotList.find((s) => s.id === existingSlot.id);
    if (byId) return byId;
  }

  const targetDay = String(day || '').trim().toLowerCase();
  const dayMatches = slotList.filter(
    (s) => String(s.day_of_week || '').trim().toLowerCase() === targetDay
  );
  if (!dayMatches.length) return null;

  const exact = dayMatches.find(
    (s) =>
      Number(s.period_index) === Number(pIdx) ||
      (period?.start_time && toHHMM(s.start_time) === toHHMM(period.start_time)) ||
      (period?.name && s.period_name === period.name)
  );
  if (exact) return exact;

  if (period?.start_time && period?.end_time) {
    return (
      dayMatches.find((s) =>
        timeRangesOverlap(period.start_time, period.end_time, s.start_time, s.end_time)
      ) || null
    );
  }

  return null;
};

function rankSuggestions(query, list) {
  const q = normalizeText(query);
  if (!q) return [];
  return list
    .map((item) => {
      const lower = normalizeText(item.name);
      if (!lower) return null;
      const words = lower.split(/\s+/).filter(Boolean);
      const fullPrefix = lower.startsWith(q);
      const wordPrefix = !fullPrefix && words.some((w) => w.startsWith(q));
      const sub = !fullPrefix && !wordPrefix && lower.includes(q);
      if (!fullPrefix && !wordPrefix && !sub) return null;
      return { ...item, rank: fullPrefix ? 0 : wordPrefix ? 1 : 2 };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 6);
}

const resolveId = (
  list,
  rawValue,
  nameKeys = ['name', 'subject_name', 'teacher_name', 'full_name', 'title']
) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;

  const trimmed = String(rawValue).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const lower = trimmed.toLowerCase();
  const match = (list || []).find((item) => {
    if (!item || typeof item !== 'object') return false;
    return nameKeys.some((k) => String(item[k] || '').trim().toLowerCase() === lower);
  });

  if (!match) return null;
  const resolved = Number(match.id ?? match.subject_id ?? match.teacher_id);
  return Number.isFinite(resolved) ? resolved : null;
};

const extractApiError = (err) => {
  const status = err?.response?.status ?? err?.status ?? null;
  const data = err?.response?.data;

  if (data && typeof data === 'object') {
    const conflict = data.conflict;
    const conflictWindow =
      conflict && (conflict.start_time || conflict.end_time)
        ? ` (${conflict.start_time || '?'}–${conflict.end_time || '?'}${
            conflict.id ? `, slot #${conflict.id}` : ''
          })`
        : '';

    if (Array.isArray(data.errors) && data.errors.length) {
      const joined = data.errors
        .map((item) =>
          typeof item === 'string'
            ? item
            : item?.message || item?.msg || JSON.stringify(item)
        )
        .join('; ');
      return `${joined}${conflictWindow}`;
    }

    const baseMsg = data.message || data.error || data.msg;
    if (baseMsg) return `${baseMsg}${conflictWindow}`;
  }

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  if (status === 409) {
    return 'This time slot overlaps with an existing slot in the timetable.';
  }
  if (status === 404) {
    return 'The requested timetable slot or record was not found.';
  }
  if (status === 403) {
    return 'You do not have permission to modify the timetable.';
  }
  if (status >= 500) {
    return 'Server error while saving timetable. Please try again.';
  }
  if (!err?.response && err?.message === 'Network Error') {
    return 'Network error: unable to reach the server. Check your connection.';
  }

  return err?.message || 'Unable to complete this timetable action.';
};

const logApiErrorDetails = (context, reason, meta = {}) => {
  const status = reason?.response?.status ?? reason?.status ?? null;
  console.error(`[Timetable ${context} Error]`, {
    ...meta,
    status,
    url: reason?.config?.url,
    method: reason?.config?.method,
    requestPayload: reason?.config?.data,
    responseData: reason?.response?.data,
    message: reason?.message,
  });
};

const formatSlotFailureLine = (reason, item) => {
  const detail = extractApiError(reason);
  const dayLabel = item?.day || 'Unknown Day';
  const periodLabel =
    item?.period?.name ||
    (item?.pIdx !== undefined ? `Period ${Number(item.pIdx) + 1}` : 'Period');
  const slotInfo = [item?.subject_name, item?.teacher_name].filter(Boolean).join(' / ');
  const target = slotInfo ? `${dayLabel}, ${periodLabel} (${slotInfo})` : `${dayLabel}, ${periodLabel}`;
  return `• ${target}: ${detail}`;
};

const samePeriodSlot = (a, b) => {
  const sameDay =
    String(a.day_of_week || '').trim().toLowerCase() ===
    String(b.day_of_week || '').trim().toLowerCase();
  if (!sameDay) return false;

  if (a.start_time && a.end_time && b.start_time && b.end_time) {
    return timeRangesOverlap(a.start_time, a.end_time, b.start_time, b.end_time);
  }

  const tA = periodKey(a.start_time);
  const tB = periodKey(b.start_time);
  if (tA && tB) return tA === tB;

  return (
    a.period_index !== undefined &&
    b.period_index !== undefined &&
    Number(a.period_index) === Number(b.period_index)
  );
};

const isSameRecord = (a, b) => {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a._cellKey && b._cellKey && a._cellKey === b._cellKey) return true;
  return a === b;
};

const formatConflictMessage = (teacherName, day, startTime, periodName, clash, isSameSection) => {
  const timeOrPeriod = toHHMM(startTime) || periodName || 'this period';
  const dayCap = String(day || '').trim();
  const formattedDay = dayCap ? dayCap.charAt(0).toUpperCase() + dayCap.slice(1) : 'Day';
  if (isSameSection) {
    return `${teacherName} is assigned more than once in this section on ${formattedDay} (${timeOrPeriod}).`;
  }
  const where =
    [clash.class_name, clash.section_name && `Sec ${clash.section_name}`]
      .filter(Boolean)
      .join(' ') || `Section ${clash.section_id || '?'}`;
  return `${teacherName} is already teaching ${where} on ${formattedDay} (${timeOrPeriod}).`;
};

function groupAssignmentsForPeriod(sectionSlots, pIdx, regPeriod, friPeriod) {
  const groups = new Map();

  for (const dayMeta of WEEK_DAYS) {
    const isFri = dayMeta.key === 'friday';
    const targetP = isFri && friPeriod ? friPeriod : regPeriod;

    const match = sectionSlots.find((s) => {
      const d = String(s.day_of_week || '').trim().toLowerCase();
      if (d !== dayMeta.key) return false;
      if (Number(s.period_index) === pIdx) return true;
      if (targetP?.start_time && toHHMM(s.start_time) === toHHMM(targetP.start_time)) {
        return true;
      }
      if (targetP?.name && s.period_name === targetP.name) return true;
      return false;
    });

    if (!match) continue;

    const subject = String(match.subject_name || match.subject || match.subject_id || '').trim();
    const teacher = toText(match.teacher_name || match.teacher).trim();
    if (!subject && !teacher) continue;

    const groupKey = `${subject.toLowerCase()}||${teacher.toLowerCase()}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        subject: subject || 'Subject',
        teacher,
        days: [],
      });
    }
    groups.get(groupKey).days.push(dayMeta.short);
  }

  return Array.from(groups.values());
}

function FullTimetableMatrix({
  rows,
  periods,
  fridayPeriods,
  periodCount,
  fridayPeriodCount,
  teacherFilter,
  subjectFilter,
  onSelectSection,
}) {
  const cols = periods.slice(0, periodCount);
  const friCols = fridayPeriods.slice(0, fridayPeriodCount);
  const tQuery = normalizeText(teacherFilter);
  const sQuery = normalizeText(subjectFilter);
  const anyFilter = Boolean(tQuery || sQuery);

  if (!cols.length) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
          {NO_PERIODS_MSG}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 timetable-print print:p-2 print:shadow-none space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Full School Timetable (All Classes & Sections)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Periods along horizontal · Classes along vertical
          </p>
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-left border-collapse min-w-[780px] text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <th className="p-3 border-r border-slate-200 dark:border-slate-700">
                Class / Section
              </th>
              {cols.map((p, idx) => {
                const friP = friCols[idx];
                return (
                  <th
                    key={idx}
                    className="p-2.5 border-r border-slate-200 dark:border-slate-700 align-top"
                  >
                    <div className="font-bold">
                      P{idx + 1} · {p.name || `Period ${idx + 1}`}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      Mon–Sat: {toHHMM(p.start_time)}–{toHHMM(p.end_time)}
                    </div>
                    {friP && !friP.isBreak && (
                      <div className="text-[10px] font-mono text-amber-700 dark:text-amber-300">
                        Fri: {toHHMM(friP.start_time)}–{toHHMM(friP.end_time)}
                      </div>
                    )}
                    {friP?.isBreak && (
                      <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        Fri Recess ({toHHMM(friP.start_time)}–{toHHMM(friP.end_time)})
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((secRow) => (
              <tr
                key={secRow.sectionId}
                className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
              >
                <td className="p-3 border-r border-slate-200 dark:border-slate-700 font-semibold">
                  <button
                    type="button"
                    onClick={() => onSelectSection?.(secRow.classId, secRow.sectionId)}
                    className="print:block text-left hover:text-brand-600"
                  >
                    <div className="text-slate-800 dark:text-slate-100">{secRow.className}</div>
                    <div className="text-[11px] font-normal text-slate-500">
                      Section {secRow.sectionName}
                    </div>
                  </button>
                </td>

                {cols.map((p, pIdx) => {
                  if (p.isBreak) {
                    return (
                      <td
                        key={pIdx}
                        className="p-2 border-r border-slate-200 dark:border-slate-700 bg-amber-50/60 dark:bg-amber-950/20 text-center text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                      >
                        RECESS
                      </td>
                    );
                  }

                  const friP = friCols[pIdx];
                  const entries = groupAssignmentsForPeriod(secRow.slots, pIdx, p, friP);

                  if (!entries.length) {
                    return (
                      <td
                        key={pIdx}
                        className={`p-2 border-r border-slate-200 dark:border-slate-700 text-center text-slate-400 ${
                          anyFilter ? 'opacity-35 print:opacity-100' : ''
                        }`}
                      >
                        —
                      </td>
                    );
                  }

                  const hasMatch =
                    anyFilter &&
                    entries.some((e) => {
                      const okT = !tQuery || normalizeText(e.teacher).includes(tQuery);
                      const okS = !sQuery || normalizeText(e.subject).includes(sQuery);
                      return okT && okS;
                    });
                  const isDimmed = Boolean(anyFilter && !hasMatch);

                  return (
                    <td
                      key={pIdx}
                      className={`p-2 border-r border-slate-200 dark:border-slate-700 align-top ${
                        isDimmed
                          ? 'opacity-35 print:opacity-100'
                          : hasMatch
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/25'
                          : ''
                      }`}
                    >
                      <div className="space-y-1.5">
                        {entries.map((entry, idx) => {
                          const rowMatches =
                            anyFilter &&
                            (!tQuery || normalizeText(entry.teacher).includes(tQuery)) &&
                            (!sQuery || normalizeText(entry.subject).includes(sQuery));
                          return (
                            <div
                              key={idx}
                              className={`rounded px-2 py-1 border border-slate-200/80 dark:border-slate-700/80 ${
                                rowMatches
                                  ? 'bg-emerald-100/80 dark:bg-emerald-900/40'
                                  : 'bg-slate-50 dark:bg-slate-800/70'
                              }`}
                            >
                              <div className="font-semibold text-slate-800 dark:text-slate-100">
                                {entry.subject}
                              </div>
                              {entry.teacher && (
                                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                                  {entry.teacher}
                                </div>
                              )}
                              <div className="text-[10px] font-mono text-slate-500">
                                {entry.days.join(' ')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function TimetableGridPage() {
  const { sectionId: routeSectionId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [sectionSubjects, setSectionSubjects] = useState([]);
  const [sectionTeachers, setSectionTeachers] = useState([]);
  const [allCatalogTeachers, setAllCatalogTeachers] = useState([]);
  const [allCatalogSubjects, setAllCatalogSubjects] = useState([]);

  const [classId, setClassId] = useState(search.get('class') || '');
  const [sectionId, setSectionId] = useState(routeSectionId || search.get('section') || '');
  const [showFullTimetable, setShowFullTimetable] = useState(search.get('view') === 'full');
  const [fullRows, setFullRows] = useState([]);
  const [fullLoading, setFullLoading] = useState(false);

  const [fullTeacherFilter, setFullTeacherFilter] = useState('');
  const [fullSubjectFilter, setFullSubjectFilter] = useState('');
  const [showFullTeacherSugg, setShowFullTeacherSugg] = useState(false);
  const [showFullSubjectSugg, setShowFullSubjectSugg] = useState(false);

  const [slots, setSlots] = useState([]);
  const [otherSectionSlots, setOtherSectionSlots] = useState([]);
  const [pendingEdits, setPendingEdits] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [periods, setPeriods] = useState([]);
  const [fridayPeriods, setFridayPeriods] = useState([]);
  const [periodCount, setPeriodCount] = useState(0);
  const [fridayPeriodCount, setFridayPeriodCount] = useState(0);
  const [hiddenDays, setHiddenDays] = useState([]);

  const blurTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const scheduleBlurClose = (setter) => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => setter(false), 120);
  };

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      const [rawP, rawF, rawH, rawC] = await Promise.all([
        settingsApi.get('default_periods').catch(() => null),
        settingsApi.get('default_friday_periods').catch(() => null),
        settingsApi.get('hidden_days').catch(() => null),
        settingsApi.get('period_counts').catch(() => null),
      ]);
      if (cancelled) return;

      const parsedP = parseJsonSetting(rawP, []);
      const parsedF = parseJsonSetting(rawF, []);
      const hd = parseJsonSetting(rawH, []);
      const counts = parseJsonSetting(rawC, null);

      const p = Array.isArray(parsedP) ? parsedP : [];
      const fp = Array.isArray(parsedF) ? parsedF : [];

      setPeriods(p);
      setFridayPeriods(fp);
      setHiddenDays(Array.isArray(hd) ? hd : []);

      const regCount =
        counts?.regular !== undefined && counts?.regular !== null
          ? Math.min(p.length, Math.max(0, Number(counts.regular) || 0))
          : p.length;
      const friCount =
        counts?.friday !== undefined && counts?.friday !== null
          ? Math.min(fp.length, Math.max(0, Number(counts.friday) || 0))
          : fp.length;

      setPeriodCount(regCount);
      setFridayPeriodCount(friCount);
    }
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    classesApi
      .list()
      .then((d) => setClasses([...asArray(d)].sort(compareClassRows)))
      .catch((e) => {
        logApiErrorDetails('loadClasses', e);
        toast.error('Could not load classes list.');
        setClasses([]);
      });
    teachersApi
      .list()
      .then((d) => setAllCatalogTeachers(asArray(d)))
      .catch((e) => {
        logApiErrorDetails('loadTeachersCatalog', e);
        setAllCatalogTeachers([]);
      });
    api
      .get('/subjects')
      .then((r) => setAllCatalogSubjects(asArray(r.data)))
      .catch((e) => {
        logApiErrorDetails('loadSubjectsCatalog', e);
        setAllCatalogSubjects([]);
      });
  }, []);

  useEffect(() => {
    if (!classId) {
      setSections([]);
      return;
    }
    classesApi
      .sections(classId)
      .then((d) => setSections(asArray(d)))
      .catch((e) => {
        logApiErrorDetails('loadSections', e, { classId });
        toast.error('Could not load sections for this class.');
        setSections([]);
      });
  }, [classId]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (classId) next.set('class', classId);
    if (sectionId) next.set('section', sectionId);
    if (showFullTimetable) next.set('view', 'full');
    if (next.toString() !== search.toString()) {
      setSearch(next, { replace: true });
    }
  }, [classId, sectionId, showFullTimetable, search, setSearch]);

  useEffect(() => {
    if (!sectionId) {
      setSectionSubjects([]);
      setSectionTeachers([]);
      return;
    }

    let cancelled = false;
    async function loadSectionCatalogs() {
      const subjectPromise =
        typeof timetableApi.subjectsForSection === 'function'
          ? timetableApi.subjectsForSection(sectionId)
          : api.get(`/timetable/subjects/${sectionId}`).then((r) => r.data);

      const teacherPromise =
        typeof timetableApi.teachersForSection === 'function'
          ? timetableApi.teachersForSection(sectionId)
          : api.get(`/timetable/teachers/${sectionId}`).then((r) => r.data);

      const [subjRes, secTeachRes] = await Promise.all([
        subjectPromise.catch(() => []),
        teacherPromise.catch(() => []),
      ]);
      if (cancelled) return;

      setSectionSubjects(mergeById(asArray(subjRes), allCatalogSubjects));
      setSectionTeachers(mergeById(asArray(secTeachRes), allCatalogTeachers));
    }

    loadSectionCatalogs();
    return () => {
      cancelled = true;
    };
  }, [sectionId, allCatalogSubjects, allCatalogTeachers]);

  const loadSlots = useCallback(async () => {
    if (!sectionId) {
      setSlots([]);
      setPendingEdits({});
      return;
    }
    setLoading(true);
    try {
      const data = await timetableApi.bySection(sectionId);
      setSlots(asArray(data).map(normalizeSlot));
      setPendingEdits({});
    } catch (e) {
      logApiErrorDetails('loadSlots', e, { sectionId });
      toast.error(extractApiError(e), { duration: 6000 });
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const loadFullSchoolTimetable = useCallback(async () => {
    setFullLoading(true);
    try {
      const rawClasses = classes.length
        ? classes
        : asArray(await classesApi.list().catch(() => []));
      const allClasses = [...rawClasses].sort(compareClassRows);
      const allSlots =
        typeof timetableApi.list === 'function'
          ? asArray(await timetableApi.list().catch(() => [])).map(normalizeSlot)
          : [];

      const matrixRows = [];
      for (const cls of allClasses) {
        const cId = cls.id ?? cls.class_id;
        if (!cId) continue;
        const cName = cls.class_name ?? cls.name ?? `Class ${cId}`;
        const secs = asArray(await classesApi.sections(cId).catch(() => []));

        for (const sec of secs) {
          const sId = sec.id ?? sec.section_id;
          if (!sId) continue;
          const sName = sec.section_name ?? sec.name ?? String(sId);

          const secSlots = allSlots.length
            ? allSlots.filter((sl) => String(sl.section_id ?? '') === String(sId))
            : asArray(await timetableApi.bySection(sId).catch(() => [])).map(normalizeSlot);

          matrixRows.push({
            classId: String(cId),
            className: cName,
            sectionId: String(sId),
            sectionName: sName,
            slots: secSlots,
          });
        }
      }
      matrixRows.sort(compareClassRows);
      setFullRows(matrixRows);
    } catch (e) {
      logApiErrorDetails('loadFullSchoolTimetable', e);
      toast.error('Could not load the full school timetable.');
    } finally {
      setFullLoading(false);
    }
  }, [classes]);

  useEffect(() => {
    if (showFullTimetable) {
      loadFullSchoolTimetable();
    }
  }, [showFullTimetable, loadFullSchoolTimetable]);

  useEffect(() => {
    const handleBeforePrint = () => {
      if (showFullTimetable && !fullRows.length) {
        loadFullSchoolTimetable();
      }
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    return () => window.removeEventListener('beforeprint', handleBeforePrint);
  }, [showFullTimetable, fullRows.length, loadFullSchoolTimetable]);

  const fullTeacherOptions = useMemo(() => {
    const map = new Map();
    for (const t of allCatalogTeachers) {
      const name = toText(t?.name || t?.teacher_name || t?.full_name).trim();
      const key = normalizeText(name);
      if (key && !map.has(key)) map.set(key, { key, name });
    }
    for (const r of fullRows) {
      for (const sl of r.slots) {
        const name = toText(sl.teacher_name || sl.teacher).trim();
        const key = normalizeText(name);
        if (key && !map.has(key)) map.set(key, { key, name });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allCatalogTeachers, fullRows]);

  const fullSubjectOptions = useMemo(() => {
    const map = new Map();
    for (const s of allCatalogSubjects) {
      const name = toText(s?.subject_name || s?.name || s?.title).trim();
      const key = normalizeText(name);
      if (key && !map.has(key)) map.set(key, { key, name });
    }
    for (const r of fullRows) {
      for (const sl of r.slots) {
        const name = toText(sl.subject_name || sl.subject).trim();
        const key = normalizeText(name);
        if (key && !map.has(key)) map.set(key, { key, name });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allCatalogSubjects, fullRows]);

  const fullTeacherSuggestions = useMemo(
    () => rankSuggestions(fullTeacherFilter, fullTeacherOptions),
    [fullTeacherFilter, fullTeacherOptions]
  );
  const fullSubjectSuggestions = useMemo(
    () => rankSuggestions(fullSubjectFilter, fullSubjectOptions),
    [fullSubjectFilter, fullSubjectOptions]
  );

  const hasFullTeacherMatch =
    !normalizeText(fullTeacherFilter) || fullTeacherSuggestions.length > 0;
  const hasFullSubjectMatch =
    !normalizeText(fullSubjectFilter) || fullSubjectSuggestions.length > 0;

  const fetchOtherSectionSlots = useCallback(
    async (classList = classes) => {
      if (!sectionId) return [];

      if (typeof timetableApi.list === 'function') {
        const all = asArray(await timetableApi.list().catch(() => [])).map(normalizeSlot);
        return all.filter((s) => String(s.section_id ?? '') !== String(sectionId));
      }
      if (typeof timetableApi.all === 'function') {
        const all = asArray(await timetableApi.all().catch(() => [])).map(normalizeSlot);
        return all.filter((s) => String(s.section_id ?? '') !== String(sectionId));
      }

      const allClasses = classList.length
        ? classList
        : asArray(await classesApi.list().catch(() => []));
      const collected = [];

      for (const cls of allClasses) {
        const cId = cls.id ?? cls.class_id;
        if (!cId) continue;
        const secs = asArray(await classesApi.sections(cId).catch(() => []));
        for (const sec of secs) {
          const sId = sec.id ?? sec.section_id;
          if (!sId || String(sId) === String(sectionId)) continue;
          const secSlots = asArray(await timetableApi.bySection(sId).catch(() => [])).map(
            normalizeSlot
          );
          for (const sl of secSlots) {
            collected.push({
              ...sl,
              section_id: sl.section_id ?? sId,
              class_name: sl.class_name || cls.class_name || cls.name || '',
              section_name: sl.section_name || sec.section_name || sec.name || '',
            });
          }
        }
      }
      return collected;
    },
    [classes, sectionId]
  );

  const refreshOtherSectionSlots = useCallback(async () => {
    if (!sectionId) {
      setOtherSectionSlots([]);
      return;
    }
    try {
      const rows = await fetchOtherSectionSlots(classes);
      setOtherSectionSlots(rows);
    } catch {
      setOtherSectionSlots([]);
    }
  }, [sectionId, classes, fetchOtherSectionSlots]);

  useEffect(() => {
    let cancelled = false;
    if (!sectionId) {
      setOtherSectionSlots([]);
      return;
    }
    fetchOtherSectionSlots(classes)
      .then((rows) => {
        if (!cancelled) setOtherSectionSlots(rows);
      })
      .catch(() => {
        if (!cancelled) setOtherSectionSlots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, classes, fetchOtherSectionSlots]);

  const pendingCount = Object.keys(pendingEdits).length;

  const handleDiscardEdits = () => {
    if (!pendingCount) return;
    setPendingEdits({});
    toast('Unsaved changes discarded.');
  };

  const confirmDiscardPending = (nextActionLabel) => {
    if (!pendingCount) return true;
    return window.confirm(
      `You have ${pendingCount} unsaved change(s). Discard them before you ${nextActionLabel}?`
    );
  };

  const handleClassChange = (nextClassId) => {
    if (nextClassId === classId) return;
    if (!confirmDiscardPending('switch class')) return;
    setPendingEdits({});
    setClassId(nextClassId);
    setSectionId('');
  };

  const handleSectionChange = (nextSectionId) => {
    if (nextSectionId === sectionId) return;
    if (!confirmDiscardPending('switch section')) return;
    setPendingEdits({});
    setShowFullTimetable(false);
    setSectionId(nextSectionId);
  };

  const effectiveSlots = useMemo(() => {
    const editValues = Object.values(pendingEdits);
    if (!editValues.length) return slots;

    const merged = [...slots];
    for (const edit of editValues) {
      const idx = merged.findIndex(
        (s) =>
          (edit.existingSlot?.id && s.id === edit.existingSlot.id) ||
          (String(s.day_of_week || '').toLowerCase() === String(edit.day || '').toLowerCase() &&
            (Number(s.period_index) === Number(edit.pIdx) ||
              (edit.period?.start_time &&
                edit.period?.end_time &&
                timeRangesOverlap(
                  edit.period.start_time,
                  edit.period.end_time,
                  s.start_time,
                  s.end_time
                ))))
      );

      const safeSubjectName = toText(edit.subject_name);
      const safeTeacherName = toText(edit.teacher_name);

      const updatedRow = {
        ...(edit.existingSlot || {}),
        ...(idx >= 0 ? merged[idx] : {}),
        _cellKey: cellKey(edit.day, edit.pIdx),
        section_id: Number(sectionId),
        day_of_week: String(edit.day || '').toLowerCase(),
        start_time: toHHMM(
          to24HourTime(edit.period?.start_time ?? edit.existingSlot?.start_time ?? '')
        ),
        end_time: toHHMM(
          to24HourTime(edit.period?.end_time ?? edit.existingSlot?.end_time ?? '')
        ),
        period_name: edit.period?.name ?? edit.existingSlot?.period_name ?? '',
        period_index: edit.pIdx,
        subject_name: safeSubjectName,
        teacher_name: safeTeacherName,
        teacher:
          edit.existingSlot?.teacher_id != null || safeTeacherName
            ? {
                id: edit.existingSlot?.teacher_id ?? null,
                name: safeTeacherName,
              }
            : edit.existingSlot?.teacher ?? null,
        subject:
          edit.existingSlot?.subject_id != null || safeSubjectName
            ? {
                id: edit.existingSlot?.subject_id ?? null,
                name: safeSubjectName,
              }
            : edit.existingSlot?.subject ?? null,
      };

      if (idx >= 0) {
        merged[idx] = updatedRow;
      } else {
        merged.push(updatedRow);
      }
    }
    return merged;
  }, [slots, pendingEdits, sectionId]);

  const liveConflicts = useMemo(() => {
    if (!sectionId) return [];
    const seen = new Set();
    const list = [];

    for (const slot of effectiveSlots) {
      if (!slot) continue;
      const rawTeacher = toText(slot.teacher_name || slot.teacher).trim();
      const normTeacher = normalizeTeacher(rawTeacher);
      if (!normTeacher) continue;

      const otherClash = otherSectionSlots.find((other) => {
        if (!other) return false;
        if (slot.id && other.id === slot.id) return false;
        const otherTeacher = toText(other.teacher_name || other.teacher).trim();
        if (normalizeTeacher(otherTeacher) !== normTeacher) return false;
        return samePeriodSlot(slot, other);
      });

      if (otherClash) {
        const msg = formatConflictMessage(
          rawTeacher,
          slot.day_of_week,
          slot.start_time,
          slot.period_name,
          otherClash,
          false
        );
        if (msg && !seen.has(msg)) {
          seen.add(msg);
          list.push(msg);
        }
      }

      const sameSectionClash = effectiveSlots.find((peer) => {
        if (!peer || isSameRecord(slot, peer)) return false;
        const peerTeacher = toText(peer.teacher_name || peer.teacher).trim();
        if (normalizeTeacher(peerTeacher) !== normTeacher) return false;
        return samePeriodSlot(slot, peer);
      });

      if (sameSectionClash) {
        const msg = formatConflictMessage(
          rawTeacher,
          slot.day_of_week,
          slot.start_time,
          slot.period_name,
          sameSectionClash,
          true
        );
        if (msg && !seen.has(msg)) {
          seen.add(msg);
          list.push(msg);
        }
      }
    }

    return list;
  }, [sectionId, effectiveSlots, otherSectionSlots]);

  const findTeacherConflicts = async (editsToSave) => {
    const candidates = editsToSave
      .filter((e) => normalizeTeacher(e.teacher_name))
      .map((e) => ({
        _cellKey: cellKey(e.day, e.pIdx),
        day_of_week: String(e.day || '').toLowerCase(),
        start_time: to24HourTime(e.period?.start_time ?? e.existingSlot?.start_time ?? ''),
        end_time: to24HourTime(e.period?.end_time ?? e.existingSlot?.end_time ?? ''),
        period_index: e.pIdx,
        period_name: e.period?.name ?? e.existingSlot?.period_name ?? '',
        teacher_name: toText(e.teacher_name).trim(),
        subject_name: toText(e.subject_name).trim(),
        existingId: e.existingSlot?.id,
      }));

    if (!candidates.length) return [];

    const pool = otherSectionSlots.length
      ? otherSectionSlots
      : await fetchOtherSectionSlots(classes);
    const conflicts = [];
    const seen = new Set();

    for (const cand of candidates) {
      const candTeacher = normalizeTeacher(cand.teacher_name);

      const otherClash = pool.find((other) => {
        if (cand.existingId && other.id === cand.existingId) return false;
        const otherTeacher = normalizeTeacher(other.teacher_name || other.teacher);
        if (!otherTeacher || otherTeacher !== candTeacher) return false;
        return samePeriodSlot(cand, other);
      });

      if (otherClash) {
        const msg = formatConflictMessage(
          cand.teacher_name,
          cand.day_of_week,
          cand.start_time,
          cand.period_name,
          otherClash,
          false
        );
        if (!seen.has(msg)) {
          seen.add(msg);
          conflicts.push(msg);
        }
      }

      const sectionClash =
        candidates.find(
          (otherCand) =>
            otherCand._cellKey !== cand._cellKey &&
            normalizeTeacher(otherCand.teacher_name) === candTeacher &&
            samePeriodSlot(cand, otherCand)
        ) ||
        effectiveSlots.find((existingRow) => {
          const existingKey =
            existingRow._cellKey ||
            cellKey(existingRow.day_of_week, existingRow.period_index ?? -1);
          if (existingKey === cand._cellKey) return false;
          if (cand.existingId && existingRow.id === cand.existingId) return false;
          const rowTeacher = normalizeTeacher(existingRow.teacher_name || existingRow.teacher);
          if (!rowTeacher || rowTeacher !== candTeacher) return false;
          return samePeriodSlot(cand, existingRow);
        });

      if (sectionClash) {
        const msg = formatConflictMessage(
          cand.teacher_name,
          cand.day_of_week,
          cand.start_time,
          cand.period_name,
          sectionClash,
          true
        );
        if (!seen.has(msg)) {
          seen.add(msg);
          conflicts.push(msg);
        }
      }
    }

    return conflicts;
  };

  const buildSlotPayload = (targetSectionId, day, period, existing, subjectVal, teacherVal) => {
    const cleanSubject = toText(subjectVal).trim();
    const cleanTeacher = toText(teacherVal).trim();
    const hasSubjectInput = cleanSubject !== '';
    const hasTeacherInput = cleanTeacher !== '';

    const resolvedSubjectId = hasSubjectInput
      ? resolveId(sectionSubjects, cleanSubject, ['name', 'subject_name', 'title'])
      : existing?.subject_id ?? null;

    const resolvedTeacherId = hasTeacherInput
      ? resolveId(sectionTeachers, cleanTeacher, ['name', 'teacher_name', 'full_name'])
      : null;

    const rawStart = period?.start_time ?? existing?.start_time ?? '';
    const rawEnd = period?.end_time ?? existing?.end_time ?? '';

    return {
      section_id: Number(targetSectionId),
      subject_id: resolvedSubjectId ? Number(resolvedSubjectId) : null,
      teacher_id: resolvedTeacherId ? Number(resolvedTeacherId) : null,
      day_of_week: String(day || '').trim().toLowerCase(),
      start_time: to24HourTime(rawStart),
      end_time: to24HourTime(rawEnd),
      _hasSubjectInput: hasSubjectInput,
      _hasTeacherInput: hasTeacherInput,
    };
  };

  const saveSlot = async (
    targetSectionId,
    day,
    period,
    pIdx,
    existing,
    subject,
    teacher
  ) => {
    const resolvedExisting =
      existing || findMatchingSectionSlot(slots, day, period, pIdx, existing);

    const built = buildSlotPayload(
      targetSectionId,
      day,
      period,
      resolvedExisting,
      subject,
      teacher
    );
    const { _hasSubjectInput, _hasTeacherInput, ...payload } = built;

    if (resolvedExisting?.id && !payload.subject_id && !_hasSubjectInput) {
      await timetableApi.remove(resolvedExisting.id);
      return;
    }

    if (!payload.subject_id && !_hasSubjectInput && !_hasTeacherInput) {
      return;
    }

    if (
      !payload.section_id ||
      !payload.subject_id ||
      !payload.day_of_week ||
      !payload.start_time ||
      !payload.end_time
    ) {
      const missingLabels = [];
      if (!payload.section_id) missingLabels.push('section');
      if (!payload.subject_id) {
        missingLabels.push(
          toText(subject).trim()
            ? `valid subject ("${toText(subject).trim()}" not found)`
            : 'subject'
        );
      }
      if (!payload.day_of_week) missingLabels.push('day');
      if (!payload.start_time) missingLabels.push('valid 12h/24h start time');
      if (!payload.end_time) missingLabels.push('valid 12h/24h end time');
      throw new Error(`Please select a ${missingLabels.join(', ')}.`);
    }

    if (_hasTeacherInput && !payload.teacher_id) {
      throw new Error(
        `Teacher "${toText(teacher).trim()}" was not found in the assigned teachers list.`
      );
    }

    if (resolvedExisting?.id) {
      await timetableApi.update(resolvedExisting.id, payload);
    } else {
      await timetableApi.create(payload);
    }
  };

  const reportBatchFailures = (context, results, items) => {
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failedEntries = results
      .map((r, idx) => ({ result: r, item: items[idx] }))
      .filter(({ result }) => result.status === 'rejected');

    if (!failedEntries.length) {
      return { succeeded, failedCount: 0, lines: [] };
    }

    const lines = failedEntries.map(({ result, item }) => {
      const built = buildSlotPayload(
        sectionId,
        item?.day,
        item?.period,
        item?.existingSlot,
        item?.subject_name,
        item?.teacher_name
      );
      const { _hasSubjectInput, _hasTeacherInput, ...payload } = built;

      logApiErrorDetails(context, result.reason, {
        sectionId,
        slotId: item?.existingSlot?.id,
        day: item?.day,
        periodIndex: item?.pIdx,
        payload,
      });
      return formatSlotFailureLine(result.reason, item);
    });

    return {
      succeeded,
      failedCount: failedEntries.length,
      lines: [...new Set(lines)],
    };
  };

  const handleUpdateCell = (day, period, pIdx, existingSlot, field, value) => {
    if (day === '__period__') return;
    if (!sectionId) {
      toast.error('Please select a Class and Section first.');
      return;
    }

    const resolvedExisting =
      existingSlot || findMatchingSectionSlot(slots, day, period, pIdx, existingSlot);

    const key = cellKey(day, pIdx);
    const prevBuffered = pendingEdits[key];
    const baseSubject = toText(
      prevBuffered?.subject_name ??
        resolvedExisting?.subject_name ??
        resolvedExisting?.subject ??
        ''
    );
    const baseTeacher = toText(
      prevBuffered?.teacher_name ??
        resolvedExisting?.teacher_name ??
        resolvedExisting?.teacher ??
        ''
    );

    const safeValue = toText(value);
    const nextSubject =
      field === 'subject' || field === 'subject_name' ? safeValue : baseSubject;
    const nextTeacher =
      field === 'teacher' || field === 'teacher_name' ? safeValue : baseTeacher;

    setPendingEdits((prev) => ({
      ...prev,
      [key]: {
        day,
        period,
        pIdx,
        existingSlot: prevBuffered?.existingSlot ?? resolvedExisting,
        subject_name: nextSubject,
        teacher_name: nextTeacher,
      },
    }));
  };

  const handleCopyMondaySlots = async () => {
    if (!sectionId) return toast.error('Please select a Class and Section first.');
    if (busy) return;
    if (!periods.length) return toast.error(NO_PERIODS_MSG);

    const monSlots = effectiveSlots.filter(
      (s) => String(s.day_of_week).toLowerCase() === 'monday'
    );
    if (!monSlots.length) return toast.error('Please add Monday slots first.');

    setBusy(true);
    try {
      const regPeriods = periods.slice(0, periodCount);
      const friPeriods = fridayPeriods.slice(0, fridayPeriodCount);
      const plannedCopies = [];

      for (const targetDay of OTHER_DAYS) {
        if (hiddenDays.includes(targetDay)) continue;
        const targetList =
          targetDay === 'Friday' && friPeriods.length ? friPeriods : regPeriods;

        for (let pIdx = 0; pIdx < targetList.length; pIdx++) {
          const targetPeriod = targetList[pIdx];
          if (!targetPeriod || targetPeriod.isBreak) continue;

          const monPeriod = regPeriods[pIdx];
          const src = monSlots.find(
            (m) =>
              m.period_index === pIdx ||
              (monPeriod && toHHMM(m.start_time) === toHHMM(monPeriod.start_time)) ||
              (monPeriod && m.period_name === monPeriod.name)
          );
          if (!src) continue;

          const dest = findMatchingSectionSlot(slots, targetDay, targetPeriod, pIdx);

          plannedCopies.push({
            day: targetDay,
            period: targetPeriod,
            pIdx,
            existingSlot: dest,
            subject_name: src.subject_name ?? src.subject_id,
            teacher_name: src.teacher_name ?? src.teacher_id,
          });
        }
      }

      if (!plannedCopies.length) {
        toast('No matching target periods found to copy.');
        return;
      }

      const conflicts = await findTeacherConflicts(plannedCopies);
      if (conflicts.length) {
        const proceed = window.confirm(
          `Teacher clash detected while copying Monday slots:\n\n• ${conflicts.join(
            '\n• '
          )}\n\nCopy anyway?`
        );
        if (!proceed) {
          toast('Copy cancelled.');
          return;
        }
      }

      const results = await Promise.allSettled(
        plannedCopies.map((item) =>
          saveSlot(
            sectionId,
            item.day,
            item.period,
            item.pIdx,
            item.existingSlot,
            item.subject_name,
            item.teacher_name
          )
        )
      );

      const failedEntries = results
        .map((result, idx) => ({ result, item: plannedCopies[idx] }))
        .filter(({ result }) => result.status === 'rejected');

      await Promise.all([loadSlots(), refreshOtherSectionSlots()]);

      if (failedEntries.length) {
        const nextPending = {};
        for (const { item } of failedEntries) {
          if (!item) continue;
          nextPending[cellKey(item.day, item.pIdx)] = item;
        }
        setPendingEdits(nextPending);
      }

      const { succeeded, failedCount, lines } = reportBatchFailures(
        'handleCopyMondaySlots',
        results,
        plannedCopies
      );

      if (failedCount && succeeded) {
        toast.error(
          `Copied ${succeeded} slot(s), but ${failedCount} could not be copied:\n${lines.join(
            '\n'
          )}`,
          { duration: 8000 }
        );
      } else if (failedCount) {
        toast.error(
          `Could not copy ${failedCount} slot(s):\n${lines.join('\n')}`,
          { duration: 8000 }
        );
      } else {
        toast.success('Monday slots copied to all other days!');
      }
    } catch (e) {
      logApiErrorDetails('handleCopyMondaySlots', e, { sectionId });
      toast.error(extractApiError(e), { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!sectionId) return toast.error('Please select a Class and Section first.');
    if (busy) return;

    const editsToSave = Object.values(pendingEdits);
    if (!editsToSave.length) {
      await Promise.all([loadSlots(), refreshOtherSectionSlots()]);
      toast.success('Timetable is up to date!');
      return;
    }

    setBusy(true);
    try {
      const conflicts = await findTeacherConflicts(editsToSave);
      if (conflicts.length) {
        const proceed = window.confirm(
          `Teacher clash detected:\n\n• ${conflicts.join('\n• ')}\n\nSave anyway?`
        );
        if (!proceed) {
          toast('Submission cancelled.');
          return;
        }
      }

      const results = await Promise.allSettled(
        editsToSave.map((item) =>
          saveSlot(
            sectionId,
            item.day,
            item.period,
            item.pIdx,
            item.existingSlot,
            item.subject_name,
            item.teacher_name
          )
        )
      );

      const failedEntries = results
        .map((result, idx) => ({ result, item: editsToSave[idx] }))
        .filter(({ result }) => result.status === 'rejected');

      await Promise.all([loadSlots(), refreshOtherSectionSlots()]);

      if (failedEntries.length) {
        const nextPending = {};
        for (const { item } of failedEntries) {
          if (!item) continue;
          nextPending[cellKey(item.day, item.pIdx)] = item;
        }
        setPendingEdits(nextPending);
      }

      const { succeeded, failedCount, lines } = reportBatchFailures(
        'handleSubmit',
        results,
        editsToSave
      );

      if (failedCount && succeeded) {
        toast.error(
          `Saved ${succeeded} slot(s), but ${failedCount} failed:\n${lines.join('\n')}`,
          { duration: 8000 }
        );
      } else if (failedCount) {
        toast.error(
          `Could not save ${failedCount} slot(s):\n${lines.join('\n')}`,
          { duration: 8000 }
        );
      } else {
        toast.success(`Saved ${succeeded} slot update(s) successfully!`, {
          duration: 4000,
        });
      }
    } catch (e) {
      logApiErrorDetails('handleSubmit', e, { sectionId });
      toast.error(extractApiError(e), { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const printTitle = showFullTimetable
    ? 'Full School Timetable'
    : sectionId
    ? `Section ${sectionId} Timetable`
    : 'Timetable Grid';

  const hasConfiguredPeriods = periods.length > 0;

  return (
    <div className="space-y-4 print-container timetable-print">
      <PrintHeader title={printTitle} />

      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <h1 className="text-lg font-semibold">Timetable Grid</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant="secondary"
                icon={Settings}
                onClick={() => navigate('/timetable/settings')}
              >
                Timings Settings
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={Copy}
                disabled={!sectionId || busy || showFullTimetable || !hasConfiguredPeriods}
                onClick={handleCopyMondaySlots}
              >
                Copy Monday Slots to All Other Days
              </Button>
              <Button
                size="sm"
                icon={CheckCircle2}
                disabled={!sectionId || busy || showFullTimetable || !hasConfiguredPeriods}
                onClick={handleSubmit}
              >
                {busy
                  ? 'Saving…'
                  : pendingCount
                  ? `Submit Timetable (${pendingCount})`
                  : 'Submit Timetable'}
              </Button>
              {pendingCount > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={RotateCcw}
                  disabled={busy}
                  onClick={handleDiscardEdits}
                >
                  Discard Edits
                </Button>
              )}
            </>
          )}

          <Button
            size="sm"
            variant={showFullTimetable ? 'primary' : 'secondary'}
            icon={Eye}
            onClick={() => setShowFullTimetable((prev) => !prev)}
          >
            {showFullTimetable ? 'Back to Section Grid' : 'View Full Timetable'}
          </Button>

          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" />
              {pendingCount} unsaved edit{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <PrintShare title={printTitle} />

      {showFullTimetable ? (
        <div className="space-y-3">
          <Card className="p-3 space-y-2 no-print">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="relative flex items-center gap-1.5">
                <User className="w-4 h-4 text-brand-600 shrink-0" />
                <span className="font-semibold">Teacher:</span>
                <div className="relative">
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Type teacher name..."
                    className="input py-1 text-xs w-44"
                    value={fullTeacherFilter}
                    onFocus={() => {
                      if (fullTeacherFilter.trim()) setShowFullTeacherSugg(true);
                    }}
                    onBlur={() => scheduleBlurClose(setShowFullTeacherSugg)}
                    onChange={(e) => {
                      setFullTeacherFilter(e.target.value);
                      setShowFullTeacherSugg(Boolean(e.target.value.trim()));
                    }}
                  />
                  {showFullTeacherSugg && fullTeacherSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg py-1">
                      {fullTeacherSuggestions.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onMouseDown={() => {
                            setFullTeacherFilter(opt.name);
                            setShowFullTeacherSugg(false);
                          }}
                          className="w-full text-left px-2.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="relative flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-brand-600 shrink-0" />
                <span className="font-semibold">Subject:</span>
                <div className="relative">
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Type subject name..."
                    className="input py-1 text-xs w-44"
                    value={fullSubjectFilter}
                    onFocus={() => {
                      if (fullSubjectFilter.trim()) setShowFullSubjectSugg(true);
                    }}
                    onBlur={() => scheduleBlurClose(setShowFullSubjectSugg)}
                    onChange={(e) => {
                      setFullSubjectFilter(e.target.value);
                      setShowFullSubjectSugg(Boolean(e.target.value.trim()));
                    }}
                  />
                  {showFullSubjectSugg && fullSubjectSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg py-1">
                      {fullSubjectSuggestions.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onMouseDown={() => {
                            setFullSubjectFilter(opt.name);
                            setShowFullSubjectSugg(false);
                          }}
                          className="w-full text-left px-2.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {(fullTeacherFilter || fullSubjectFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setFullTeacherFilter('');
                    setFullSubjectFilter('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {(!hasFullTeacherMatch || !hasFullSubjectMatch) && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                No matching timetable entries found for the current filter.
              </p>
            )}
          </Card>

          {fullLoading ? (
            <Loader />
          ) : (
            <FullTimetableMatrix
              rows={fullRows}
              periods={periods}
              fridayPeriods={fridayPeriods}
              periodCount={periodCount}
              fridayPeriodCount={fridayPeriodCount}
              teacherFilter={fullTeacherFilter}
              subjectFilter={fullSubjectFilter}
              onSelectSection={(cId, sId) => {
                setClassId(cId);
                setSectionId(sId);
                setShowFullTimetable(false);
              }}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="p-4 no-print">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="label">Class</label>
                <select
                  className="input"
                  value={classId}
                  onChange={(e) => handleClassChange(e.target.value)}
                >
                  <option value="">Select class</option>
                  {classes.map((c) => {
                    const id = c.id ?? c.class_id;
                    return (
                      <option key={id} value={id}>
                        {c.class_name ?? c.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="label">Section</label>
                <select
                  className="input"
                  value={sectionId}
                  onChange={(e) => handleSectionChange(e.target.value)}
                >
                  <option value="">Select section</option>
                  {sections.map((s) => {
                    const id = s.id ?? s.section_id;
                    return (
                      <option key={id} value={id}>
                        Section {s.section_name ?? s.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </Card>

          {!hasConfiguredPeriods ? (
            <Card className="p-6 text-center space-y-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {NO_PERIODS_MSG}
              </p>
              {isAdmin && (
                <div>
                  <Button
                    size="sm"
                    icon={Settings}
                    onClick={() => navigate('/timetable/settings')}
                  >
                    Enter Periods in Settings
                  </Button>
                </div>
              )}
            </Card>
          ) : loading ? (
            <Loader />
          ) : (
            <>
              {liveConflicts.length > 0 && (
                <Card className="p-3 border-amber-300 bg-amber-50/70 dark:bg-amber-950/25 no-print">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
                    Teacher Schedule Conflicts Detected:
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
                    {liveConflicts.map((cMsg, i) => (
                      <li key={i}>{cMsg}</li>
                    ))}
                  </ul>
                </Card>
              )}

              <TimetableGrid
                periods={periods}
                fridayPeriods={fridayPeriods}
                periodCount={periodCount}
                fridayPeriodCount={fridayPeriodCount}
                hiddenDays={hiddenDays}
                timetable={effectiveSlots}
                subjects={sectionSubjects}
                teachers={sectionTeachers}
                otherSectionSlots={otherSectionSlots}
                isEditable={Boolean(sectionId)}
                onUpdateCell={handleUpdateCell}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

