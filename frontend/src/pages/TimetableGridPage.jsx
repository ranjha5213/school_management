// src/pages/TimetableGridPage.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  RotateCcw,
  Settings,
  User,
  X,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import PrintHeader from '../components/PrintHeader';
import PrintShare from '../components/PrintShare';
import TimetableGrid, { fmtTime, periodKey } from '../components/TimetableGrid';
import {
  DEFAULT_PERIODS,
  DEFAULT_FRIDAY_PERIODS,
  parseJsonSetting,
} from './TimetableSettings';
import api from '../api/client';
import { classesApi, settingsApi,  teachersApi, timetableApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const OTHER_DAYS = ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_DAYS = [
  { key: 'monday', short: 'Mon' },
  { key: 'tuesday', short: 'Tue' },
  { key: 'wednesday', short: 'Wed' },
  { key: 'thursday', short: 'Thu' },
  { key: 'friday', short: 'Fri' },
  { key: 'saturday', short: 'Sat' },
];

const asArray = (d) => {
  if (Array.isArray(d)) return d;
  if (!d) return [];
  for (const k of ['data', 'slots', 'rows', 'subjects', 'teachers', 'items']) {
    if (Array.isArray(d[k])) return d[k];
  }
  return [];
};

const cellKey = (day, pIdx) => `${String(day).toLowerCase()}::${Number(pIdx)}`;

const normalizeText = (name) => String(name || '').trim().toLowerCase();
const normalizeTeacher = normalizeText;

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
  const data = err?.response?.data;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    if (Array.isArray(data.errors) && data.errors.length) {
      return data.errors
        .map((item) =>
          typeof item === 'string'
            ? item
            : item?.message || item?.msg || JSON.stringify(item)
        )
        .join('; ');
    }
    return data.message || data.error || data.msg || JSON.stringify(data);
  }
  return err?.message || '400 Bad Request';
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
  const target = slotInfo
    ? `${dayLabel} · ${periodLabel} (${slotInfo})`
    : `${dayLabel} · ${periodLabel}`;
  return `• ${target}: ${detail}`;
};

const samePeriodSlot = (a, b) => {
  const sameDay =
    String(a.day_of_week || '').trim().toLowerCase() ===
    String(b.day_of_week || '').trim().toLowerCase();
  if (!sameDay) return false;

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
  const timeOrPeriod = periodKey(startTime) || periodName || 'Period';
  if (isSameSection) {
    return `${teacherName} on ${day} (${timeOrPeriod}) is assigned more than once in this section`;
  }
  const where =
    [clash.class_name, clash.section_name && `Sec ${clash.section_name}`]
      .filter(Boolean)
      .join(' ') || `Section ${clash.section_id || '?'}`;
  return `${teacherName} on ${day} (${timeOrPeriod}) is already booked in ${where}`;
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
      if (targetP?.start_time && periodKey(s.start_time) === periodKey(targetP.start_time)) {
        return true;
      }
      if (targetP?.name && s.period_name === targetP.name) return true;
      return false;
    });

    if (!match) continue;

    const subject = String(match.subject_name || match.subject || '—').trim();
    const teacher = String(match.teacher_name || match.teacher || '—').trim();
    const groupKey = `${subject.toLowerCase()}||${teacher.toLowerCase()}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        subject,
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

  return (
    <Card className="p-4 timetable-print print:p-2 print:shadow-none print:border-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Full School Timetable (All Classes & Sections)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Periods & timings along horizontal · Classes along vertical · Subject, Teacher & Days (Mon Tue Wed Thu Fri Sat) inside each cell
          </p>
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible border border-slate-200 dark:border-slate-800 rounded-lg">
        <table className="w-full text-left border-collapse min-w-[920px] print:min-w-0 text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
              <th className="p-3 border-r border-slate-200 dark:border-slate-700 w-40 sticky left-0 print:static bg-slate-100 dark:bg-slate-800 z-10">
                Class / Section
              </th>
              {cols.map((p, idx) => {
                const friP = friCols[idx];
                return (
                  <th
                    key={idx}
                    className="p-2.5 border-r border-slate-200 dark:border-slate-700 text-center min-w-[180px] print:min-w-0"
                  >
                    <div className="font-bold">
                      P{idx + 1} · {p.name || `Period ${idx + 1}`}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      Mon–Sat: {fmtTime(p.start_time)}–{fmtTime(p.end_time)}
                    </div>
                    {friP && !friP.isBreak && (
                      <div className="text-[10px] font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                        Fri: {fmtTime(friP.start_time)}–{fmtTime(friP.end_time)}
                      </div>
                    )}
                    {friP?.isBreak && (
                      <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mt-0.5">
                        Fri Recess ({fmtTime(friP.start_time)}–{fmtTime(friP.end_time)})
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
                <td className="p-3 border-r border-slate-200 dark:border-slate-700 font-semibold sticky left-0 print:static bg-white dark:bg-slate-900 z-10">
                  <button
                    type="button"
                    onClick={() => onSelectSection?.(secRow.classId, secRow.sectionId)}
                    className="print:block text-left hover:text-brand-600 transition-colors"
                  >
                    <div className="text-slate-800 dark:text-slate-100">{secRow.className}</div>
                    <div className="text-[11px] font-normal text-brand-600">
                      Section {secRow.sectionName}
                    </div>
                  </button>
                </td>

                {cols.map((p, pIdx) => {
                  if (p.isBreak) {
                    return (
                      <td
                        key={pIdx}
                        className="p-2 border-r border-slate-200 dark:border-slate-700 text-center align-middle bg-amber-50/70 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 font-semibold"
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
                        className={`p-2 border-r border-slate-200 dark:border-slate-700 text-center align-middle text-slate-400 italic ${
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
                      className={`p-2 border-r border-slate-200 dark:border-slate-700 align-top transition-opacity ${
                        isDimmed
                          ? 'opacity-35 print:opacity-100'
                          : hasMatch
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
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
                              className={`rounded px-2 py-1 border leading-tight ${
                                rowMatches
                                  ? 'bg-emerald-100/80 dark:bg-emerald-900/40 border-emerald-400'
                                  : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-700'
                              }`}
                            >
                              <div className="font-semibold text-brand-800 dark:text-brand-300 truncate print:whitespace-normal">
                                {entry.subject}
                              </div>
                              <div className="text-[11px] text-slate-700 dark:text-slate-200 truncate print:whitespace-normal">
                                {entry.teacher}
                              </div>
                              <div className="text-[10px] font-medium text-amber-800 dark:text-amber-300 mt-0.5">
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

  const [periods, setPeriods] = useState(DEFAULT_PERIODS);
  const [fridayPeriods, setFridayPeriods] = useState(DEFAULT_FRIDAY_PERIODS);
  const [periodCount, setPeriodCount] = useState(DEFAULT_PERIODS.length);
  const [fridayPeriodCount, setFridayPeriodCount] = useState(DEFAULT_FRIDAY_PERIODS.length);
  const [hiddenDays, setHiddenDays] = useState([]);

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

      const p = parseJsonSetting(rawP, DEFAULT_PERIODS);
      const fp = parseJsonSetting(rawF, DEFAULT_FRIDAY_PERIODS);
      const hd = parseJsonSetting(rawH, []);
      const counts = parseJsonSetting(rawC, null);

      setPeriods(p);
      setFridayPeriods(fp);
      setHiddenDays(Array.isArray(hd) ? hd : []);
      setPeriodCount(Number(counts?.regular) || p.length);
      setFridayPeriodCount(Number(counts?.friday) || fp.length);
    }
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    classesApi.list().then((d) => setClasses(asArray(d))).catch(() => setClasses([]));
    teachersApi
      .list()
      .then((d) => setAllCatalogTeachers(asArray(d)))
      .catch(() => setAllCatalogTeachers([]));
       api
      .get('/subjects')
      .then((r) => setAllCatalogSubjects(asArray(r.data)))
      .catch(() => setAllCatalogSubjects([]));
  }, []);

  useEffect(() => {
    if (!classId) {
      setSections([]);
      return;
    }
    classesApi.sections(classId).then((d) => setSections(asArray(d))).catch(() => setSections([]));
  }, [classId]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (classId) next.set('class', classId);
    if (sectionId) next.set('section', sectionId);
    if (showFullTimetable) next.set('view', 'full');
    setSearch(next, { replace: true });
  }, [classId, sectionId, showFullTimetable, setSearch]);

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

      const globalTeachersPromise = api
        .get('/teachers')
        .then((r) => r.data)
        .catch(() => []);

      const [subjRes, secTeachRes, globalTeachRes] = await Promise.all([
        subjectPromise.catch(() => []),
        teacherPromise.catch(() => []),
        globalTeachersPromise,
      ]);
      if (cancelled) return;

      const secSubjs = asArray(subjRes);
      const secTeachs = asArray(secTeachRes);
      const pubTeachs = asArray(globalTeachRes);

      setSectionSubjects(secSubjs);
      setSectionTeachers(secTeachs.length ? secTeachs : pubTeachs);
    }

    loadSectionCatalogs();
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  const loadSlots = useCallback(async () => {
    if (!sectionId) {
      setSlots([]);
      setPendingEdits({});
      return;
    }
    setLoading(true);
    try {
      const data = await timetableApi.bySection(sectionId);
      setSlots(asArray(data));
      setPendingEdits({});
    } catch (e) {
      logApiErrorDetails('loadSlots', e, { sectionId });
      toast.error(extractApiError(e) || 'Failed to load timetable', { duration: 6000 });
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
      const allClasses = classes.length
        ? classes
        : asArray(await classesApi.list().catch(() => []));
      const allSlots =
        typeof timetableApi.list === 'function'
          ? asArray(await timetableApi.list().catch(() => []))
          : [];

      const matrixRows = [];
      for (const cls of allClasses) {
        const cId = cls.id || cls.class_id;
        if (!cId) continue;
        const cName = cls.class_name || cls.name || `Class ${cId}`;
        const secs = asArray(await classesApi.sections(cId).catch(() => []));

        for (const sec of secs) {
          const sId = sec.id || sec.section_id;
          if (!sId) continue;
          const sName = sec.section_name || sec.name || String(sId);

          const secSlots = allSlots.length
            ? allSlots.filter((sl) => String(sl.section_id ?? '') === String(sId))
            : asArray(await timetableApi.bySection(sId).catch(() => []));

          matrixRows.push({
            classId: String(cId),
            className: cName,
            sectionId: String(sId),
            sectionName: sName,
            slots: secSlots,
          });
        }
      }
      setFullRows(matrixRows);
    } finally {
      setFullLoading(false);
    }
  }, [classes]);

  useEffect(() => {
    if (showFullTimetable) {
      loadFullSchoolTimetable();
    }
  }, [showFullTimetable, loadFullSchoolTimetable]);

  // Ensure full matrix data is ready before window.print() fires
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
      const name = String(t?.name || t?.teacher_name || t?.full_name || '').trim();
      const key = normalizeText(name);
      if (key && !map.has(key)) map.set(key, { key, name });
    }
    for (const r of fullRows) {
      for (const sl of r.slots) {
        const name = String(sl.teacher_name || sl.teacher || '').trim();
        const key = normalizeText(name);
        if (key && !map.has(key)) map.set(key, { key, name });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allCatalogTeachers, fullRows]);

  const fullSubjectOptions = useMemo(() => {
    const map = new Map();
    for (const s of allCatalogSubjects) {
      const name = String(s?.subject_name || s?.name || s?.title || '').trim();
      const key = normalizeText(name);
      if (key && !map.has(key)) map.set(key, { key, name });
    }
    for (const r of fullRows) {
      for (const sl of r.slots) {
        const name = String(sl.subject_name || sl.subject || '').trim();
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
        const all = asArray(await timetableApi.list().catch(() => []));
        return all.filter((s) => String(s.section_id ?? '') !== String(sectionId));
      }
      if (typeof timetableApi.all === 'function') {
        const all = asArray(await timetableApi.all().catch(() => []));
        return all.filter((s) => String(s.section_id ?? '') !== String(sectionId));
      }

      const allClasses = classList.length
        ? classList
        : asArray(await classesApi.list().catch(() => []));
      const collected = [];

      for (const cls of allClasses) {
        const cId = cls.id || cls.class_id;
        if (!cId) continue;
        const secs = asArray(await classesApi.sections(cId).catch(() => []));
        for (const sec of secs) {
          const sId = sec.id || sec.section_id;
          if (!sId || String(sId) === String(sectionId)) continue;
          const secSlots = asArray(await timetableApi.bySection(sId).catch(() => []));
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

  useEffect(() => {
    if (!sectionId) {
      setOtherSectionSlots([]);
      return;
    }
    let cancelled = false;
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
    toast('Unsaved edits discarded');
  };

  const confirmDiscardPending = (nextActionLabel) => {
    if (!pendingCount) return true;
    return window.confirm(
      `You have ${pendingCount} unsaved change(s). Discard them and ${nextActionLabel}?`
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
          (String(s.day_of_week || '').toLowerCase() === edit.day.toLowerCase() &&
            (Number(s.period_index) === Number(edit.pIdx) ||
              periodKey(s.start_time) === periodKey(edit.period.start_time)))
      );

      const updatedRow = {
        ...(edit.existingSlot || {}),
        ...(idx >= 0 ? merged[idx] : {}),
        _cellKey: cellKey(edit.day, edit.pIdx),
        section_id: Number(sectionId),
        day_of_week: String(edit.day || '').toLowerCase(),
        start_time: edit.period.start_time,
        end_time: edit.period.end_time,
        period_name: edit.period.name,
        period_index: edit.pIdx,
        subject_name: edit.subject_name,
        teacher_name: edit.teacher_name,
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
      const rawTeacher = (slot.teacher_name || slot.teacher || '').trim();
      const normTeacher = normalizeTeacher(rawTeacher);
      if (!normTeacher) continue;

      const otherClash = otherSectionSlots.find((other) => {
        if (slot.id && other.id === slot.id) return false;
        if (normalizeTeacher(other.teacher_name || other.teacher) !== normTeacher) return false;
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
        if (!seen.has(msg)) {
          seen.add(msg);
          list.push(msg);
        }
      }

      const sameSectionClash = effectiveSlots.find((peer) => {
        if (isSameRecord(slot, peer)) return false;
        if (normalizeTeacher(peer.teacher_name || peer.teacher) !== normTeacher) return false;
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
        if (!seen.has(msg)) {
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
        start_time: e.period.start_time,
        period_index: e.pIdx,
        period_name: e.period.name,
        teacher_name: e.teacher_name.trim(),
        subject_name: e.subject_name.trim(),
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
    const hasSubjectInput =
      subjectVal !== undefined && subjectVal !== null && String(subjectVal).trim() !== '';
    const hasTeacherInput =
      teacherVal !== undefined && teacherVal !== null && String(teacherVal).trim() !== '';

    const resolvedSubjectId = hasSubjectInput
      ? resolveId(sectionSubjects, subjectVal, ['name', 'subject_name', 'title'])
      : existing?.subject_id ?? null;

    const resolvedTeacherId = hasTeacherInput
      ? resolveId(sectionTeachers, teacherVal, ['name', 'teacher_name', 'full_name'])
      : existing?.teacher_id ?? null;

    return {
      section_id: Number(targetSectionId),
      subject_id: resolvedSubjectId ? Number(resolvedSubjectId) : null,
      teacher_id: resolvedTeacherId ? Number(resolvedTeacherId) : null,
      day_of_week: String(day || '').trim().toLowerCase(),
      start_time: period?.start_time ?? existing?.start_time ?? '',
      end_time: period?.end_time ?? existing?.end_time ?? '',
      _hasSubjectInput: hasSubjectInput,
      _hasTeacherInput: hasTeacherInput,
    };
  };

  const saveSlot = async (targetSectionId, day, period, pIdx, existing, subject, teacher) => {
    const built = buildSlotPayload(targetSectionId, day, period, existing, subject, teacher);
    const { _hasSubjectInput, _hasTeacherInput, ...payload } = built;

    if (existing?.id && !payload.subject_id && !_hasSubjectInput && !_hasTeacherInput) {
      await timetableApi.remove(existing.id);
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
      const missing = [];
      if (!payload.section_id) missing.push('section_id');
      if (!payload.subject_id) missing.push(`subject_id (from "${subject ?? ''}")`);
      if (!payload.day_of_week) missing.push('day_of_week');
      if (!payload.start_time) missing.push('start_time');
      if (!payload.end_time) missing.push('end_time');
      throw new Error(`Invalid/missing required field(s): ${missing.join(', ')}`);
    }

    if (_hasTeacherInput && !payload.teacher_id) {
      throw new Error(`Unknown teacher "${teacher}" (could not resolve teacher_id)`);
    }

    if (existing?.id) {
      await timetableApi.update(existing.id, payload);
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

    const key = cellKey(day, pIdx);
    const prevBuffered = pendingEdits[key];
    const baseSubject =
      prevBuffered?.subject_name ?? existingSlot?.subject_name ?? existingSlot?.subject ?? '';
    const baseTeacher =
      prevBuffered?.teacher_name ?? existingSlot?.teacher_name ?? existingSlot?.teacher ?? '';

    const nextSubject =
      field === 'subject' || field === 'subject_name' ? value : baseSubject;
    const nextTeacher =
      field === 'teacher' || field === 'teacher_name' ? value : baseTeacher;

    setPendingEdits((prev) => ({
      ...prev,
      [key]: {
        day,
        period,
        pIdx,
        existingSlot: prevBuffered?.existingSlot ?? existingSlot,
        subject_name: nextSubject,
        teacher_name: nextTeacher,
      },
    }));
  };

  const handleCopyMondaySlots = async () => {
    if (!sectionId) return toast.error('Select a Class and Section first.');
    if (busy) return;
    const monSlots = effectiveSlots.filter(
      (s) => String(s.day_of_week).toLowerCase() === 'monday'
    );
    if (!monSlots.length) return toast.error('Enter Monday slots first before copying.');

    setBusy(true);
    try {
      const regPeriods = periods.slice(0, periodCount);
      const friPeriods = fridayPeriods.slice(0, fridayPeriodCount);
      const plannedCopies = [];

      for (const targetDay of OTHER_DAYS) {
        if (hiddenDays.includes(targetDay)) continue;
        const targetList = targetDay === 'Friday' ? friPeriods : regPeriods;

        for (let pIdx = 0; pIdx < targetList.length; pIdx++) {
          const targetPeriod = targetList[pIdx];
          if (!targetPeriod || targetPeriod.isBreak) continue;

          const monPeriod = regPeriods[pIdx];
          const src = monSlots.find(
            (m) =>
              m.period_index === pIdx ||
              (monPeriod && periodKey(m.start_time) === periodKey(monPeriod.start_time)) ||
              (monPeriod && m.period_name === monPeriod.name)
          );
          if (!src) continue;

          const dest = slots.find(
            (t) =>
              String(t.day_of_week || '').toLowerCase() === targetDay.toLowerCase() &&
              (t.period_index === pIdx ||
                periodKey(t.start_time) === periodKey(targetPeriod.start_time) ||
                t.period_name === targetPeriod.name)
          );

          plannedCopies.push({
            day: targetDay,
            period: targetPeriod,
            pIdx,
            existingSlot: dest,
            subject_name: src.subject_name ?? src.subject_id ?? '',
            teacher_name: src.teacher_name ?? src.teacher_id ?? '',
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
          `Teacher conflict detected when copying Monday slots:\n\n• ${conflicts.join(
            '\n• '
          )}\n\nCopy anyway?`
        );
        if (!proceed) {
          toast.error('Copy cancelled due to teacher conflict.');
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

      await loadSlots();

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
          `Copied ${succeeded}, ${failedCount} failed:\n${lines.join('\n')}`,
          { duration: 8000 }
        );
      } else if (failedCount) {
        toast.error(
          `Copy failed for ${failedCount} slot(s):\n${lines.join('\n')}`,
          { duration: 8000 }
        );
      } else {
        toast.success('Monday slots copied to all other days!', { duration: 4000 });
      }
    } catch (e) {
      logApiErrorDetails('handleCopyMondaySlots', e, { sectionId });
      toast.error(extractApiError(e) || 'Failed to copy Monday slots', { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!sectionId) return toast.error('Select a Class and Section first.');
    if (busy) return;

    const editsToSave = Object.values(pendingEdits);
    if (!editsToSave.length) {
      await loadSlots();
      toast.success('Timetable submitted!');
      return;
    }

    setBusy(true);
    try {
      const conflicts = await findTeacherConflicts(editsToSave);
      if (conflicts.length) {
        const proceed = window.confirm(
          `Teacher conflict detected:\n\n• ${conflicts.join('\n• ')}\n\nSubmit anyway?`
        );
        if (!proceed) {
          toast.error('Submission cancelled due to teacher conflict.');
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

      await loadSlots();

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
          `Saved ${succeeded}, ${failedCount} failed:\n${lines.join('\n')}`,
          { duration: 8000 }
        );
      } else if (failedCount) {
        toast.error(
          `Failed to save ${failedCount} slot(s):\n${lines.join('\n')}`,
          { duration: 8000 }
        );
      } else {
        toast.success(`Saved ${succeeded} slot update(s) and submitted timetable!`, {
          duration: 4000,
        });
      }
    } catch (e) {
      logApiErrorDetails('handleSubmit', e, { sectionId });
      toast.error(extractApiError(e) || 'Failed to submit timetable', { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const printTitle = showFullTimetable ? 'Full School Timetable' : 'Class Timetable';

  return (
    <div className="space-y-4 print-container timetable-print">
      <PrintHeader title={printTitle} />

      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
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
                disabled={!sectionId || busy || showFullTimetable}
                onClick={handleCopyMondaySlots}
              >
                Copy Monday Slots to All Other Days
              </Button>
              <Button
                size="sm"
                icon={CheckCircle2}
                disabled={!sectionId || busy || showFullTimetable}
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
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700">
              <AlertTriangle className="w-3.5 h-3.5" />
              {pendingCount} unsaved edit{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <PrintShare title={printTitle} />
      </div>

      {showFullTimetable ? (
        <div className="space-y-3">
          <Card className="p-3 space-y-2 no-print">
            <div className="flex flex-wrap items-center gap-4">
              {/* Full Timetable Teacher Filter */}
              <div className="relative flex items-center gap-2">
                <User className="w-4 h-4 text-brand-600 shrink-0" />
                <span className="text-xs font-semibold">Teacher:</span>
                <div className="relative flex items-center gap-1">
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Type teacher name..."
                    value={fullTeacherFilter}
                    onFocus={() => {
                      if (fullTeacherFilter.trim()) setShowFullTeacherSugg(true);
                    }}
                    onBlur={() => setTimeout(() => setShowFullTeacherSugg(false), 120)}
                    onChange={(e) => {
                      setFullTeacherFilter(e.target.value);
                      setShowFullTeacherSugg(Boolean(e.target.value.trim()));
                    }}
                    className="input text-xs py-1 w-48"
                  />
                  {fullTeacherFilter && (
                    <button
                      type="button"
                      onClick={() => setFullTeacherFilter('')}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded"
                      title="Clear teacher filter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {showFullTeacherSugg && fullTeacherSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {fullTeacherSuggestions.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFullTeacherFilter(opt.name);
                            setShowFullTeacherSugg(false);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Full Timetable Subject Filter */}
              <div className="relative flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-600 shrink-0" />
                <span className="text-xs font-semibold">Subject:</span>
                <div className="relative flex items-center gap-1">
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Type subject name..."
                    value={fullSubjectFilter}
                    onFocus={() => {
                      if (fullSubjectFilter.trim()) setShowFullSubjectSugg(true);
                    }}
                    onBlur={() => setTimeout(() => setShowFullSubjectSugg(false), 120)}
                    onChange={(e) => {
                      setFullSubjectFilter(e.target.value);
                      setShowFullSubjectSugg(Boolean(e.target.value.trim()));
                    }}
                    className="input text-xs py-1 w-48"
                  />
                  {fullSubjectFilter && (
                    <button
                      type="button"
                      onClick={() => setFullSubjectFilter('')}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded"
                      title="Clear subject filter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {showFullSubjectSugg && fullSubjectSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {fullSubjectSuggestions.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFullSubjectFilter(opt.name);
                            setShowFullSubjectSugg(false);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!hasFullTeacherMatch && (
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-700 rounded-md px-3 py-1.5">
                Please add the teacher first.
              </div>
            )}

            {!hasFullSubjectMatch && (
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-700 rounded-md px-3 py-1.5">
                Please add the subject first.
              </div>
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
        <>
          <Card className="p-4 no-print">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
              <Filter className="w-4 h-4 text-brand-600" /> Select Class & Section
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <div>
                <label className="label text-xs">Class</label>
                <select
                  className="input text-sm"
                  value={classId}
                  onChange={(e) => handleClassChange(e.target.value)}
                >
                  <option value="">Choose class</option>
                  {classes.map((c) => {
                    const id = c.id || c.class_id;
                    return (
                      <option key={id} value={id}>
                        {c.class_name || c.name}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="label text-xs">Section</label>
                <select
                  className="input text-sm"
                  value={sectionId}
                  disabled={!classId}
                  onChange={(e) => handleSectionChange(e.target.value)}
                >
                  <option value="">{classId ? 'Choose section' : 'Pick class first'}</option>
                  {sections.map((s) => {
                    const id = s.id || s.section_id;
                    return (
                      <option key={id} value={id}>
                        Section {s.section_name || s.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </Card>

          {liveConflicts.length > 0 && (
            <div
              role="alert"
              className="no-print rounded-lg border border-red-300 bg-red-50/90 dark:bg-red-950/35 dark:border-red-500/60 p-3.5 text-xs text-red-900 dark:text-red-200 space-y-1.5"
            >
              <div className="flex items-center gap-2 font-semibold text-sm text-red-800 dark:text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>
                  {liveConflicts.length} Teacher Clash{liveConflicts.length > 1 ? 'es' : ''} Detected
                </span>
              </div>
              <ul className="list-disc pl-6 space-y-0.5 text-red-800 dark:text-red-200">
                {liveConflicts.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {loading ? (
            <Loader />
          ) : (
            <TimetableGrid
              timetable={effectiveSlots}
              otherSectionSlots={otherSectionSlots}
              subjects={sectionSubjects}
              teachers={sectionTeachers}
              periods={periods}
              fridayPeriods={fridayPeriods}
              periodCount={periodCount}
              fridayPeriodCount={fridayPeriodCount}
              hiddenDays={hiddenDays}
              isEditable={isAdmin && Boolean(sectionId)}
              onUpdateCell={handleUpdateCell}
            />
          )}
        </>
      )}
    </div>
  );
}

