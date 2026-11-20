// src/pages/TimetableGridPage.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Copy, Filter, RotateCcw, Settings } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import PrintHeader from '../components/PrintHeader';
import PrintShare from '../components/PrintShare';
import TimetableGrid, { periodKey } from '../components/TimetableGrid';
import {
  DEFAULT_PERIODS,
  DEFAULT_FRIDAY_PERIODS,
  parseJsonSetting,
} from './TimetableSettings';
import api from '../api/client';
import { classesApi, settingsApi, timetableApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const OTHER_DAYS = ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const asArray = (d) => {
  if (Array.isArray(d)) return d;
  if (!d) return [];
  for (const k of ['data', 'slots', 'rows', 'subjects', 'teachers', 'items']) {
    if (Array.isArray(d[k])) return d[k];
  }
  return [];
};

const cellKey = (day, pIdx) => `${String(day).toLowerCase()}::${Number(pIdx)}`;

const normalizeTeacher = (name) => String(name || '').trim().toLowerCase();

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
  const [classId, setClassId] = useState(search.get('class') || '');
  const [sectionId, setSectionId] = useState(routeSectionId || search.get('section') || '');

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

  // Load saved timing settings
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

  // Load classes & sections
  useEffect(() => {
    classesApi.list().then((d) => setClasses(asArray(d))).catch(() => setClasses([]));
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
    setSearch(next, { replace: true });
  }, [classId, sectionId, setSearch]);

  // Load subjects strictly scoped to the section under edit, plus teachers
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

  // Fetch slots across other sections to detect and highlight teacher double-bookings
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

  // Load other-section slots whenever sectionId changes for live highlighting
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
      `You have ${pendingCount} unsaved slot edit(s). Discard them and ${nextActionLabel}?`
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
    setSectionId(nextSectionId);
  };

  // Merge backend slots with buffered edits so the grid shows unsaved changes immediately
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

  // Compute live teacher conflicts across active grid slots (same section + other sections)
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

  // Buffer cell changes locally until "Submit Timetable" is clicked
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

  // Check teacher conflicts, then batch-save all buffered edits via Promise.allSettled
  const handleSubmit = async () => {
    if (!sectionId) return toast.error('Select a Class and Section first.');
    if (busy) return;

    const editsToSave = Object.values(pendingEdits);
    setBusy(true);
    try {
      if (editsToSave.length) {
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
      } else {
        await loadSlots();
        toast.success('Timetable submitted!', { duration: 4000 });
      }
    } catch (e) {
      logApiErrorDetails('handleSubmit', e, { sectionId });
      toast.error(extractApiError(e) || 'Failed to submit timetable', { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PrintHeader title="Class Timetable" />

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
                disabled={!sectionId || busy}
                onClick={handleCopyMondaySlots}
              >
                Copy Monday Slots to All Other Days
              </Button>
              <Button
                size="sm"
                icon={CheckCircle2}
                disabled={!sectionId || busy}
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

          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700">
              <AlertTriangle className="w-3.5 h-3.5" />
              {pendingCount} unsaved edit{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <PrintShare title="Class Timetable" />
      </div>

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
    </div>
  );
}

