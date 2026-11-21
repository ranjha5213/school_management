// src/components/TimetableGrid.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Calendar, User, X } from 'lucide-react';
import Card from './Card';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const fmtTime = (v) => (v ? String(v).slice(0, 5) : '--:--');
export const periodKey = (v) => (v ? String(v).slice(0, 5) : '');

const normalizeText = (name) => String(name || '').trim().toLowerCase();

const getSubjectName = (s) =>
  typeof s === 'string'
    ? s.trim()
    : String(s?.subject_name || s?.name || s?.title || '').trim();

const getTeacherName = (t) =>
  typeof t === 'string'
    ? t.trim()
    : String(t?.name || t?.teacher_name || t?.full_name || '').trim();

const getTeacherLinkedSubject = (t, subjectIdToName) => {
  if (!t || typeof t === 'string') return '';
  if (t.subject_name || t.subject) return String(t.subject_name || t.subject).trim();
  if (Array.isArray(t.subjects) && t.subjects.length) {
    const first = t.subjects[0];
    if (typeof first === 'string') return first.trim();
    const linked = getSubjectName(first);
    if (linked) return linked;
  }
  const sid = t.subject_id ?? t.subjectId;
  if (sid !== undefined && sid !== null && subjectIdToName.has(String(sid))) {
    return subjectIdToName.get(String(sid));
  }
  return '';
};

function rankSubjectMatches(query, subjectList) {
  const q = normalizeText(query);
  if (!q) return [];

  return subjectList
    .map((item) => {
      const lower = normalizeText(item.name);
      if (!lower) return null;

      const words = lower.split(/\s+/).filter(Boolean);
      const fullPrefix = lower.startsWith(q);
      const wordPrefix = !fullPrefix && words.some((w) => w.startsWith(q));
      const substringMatch = !fullPrefix && !wordPrefix && lower.includes(q);

      if (!fullPrefix && !wordPrefix && !substringMatch) return null;

      return {
        ...item,
        rank: fullPrefix ? 0 : wordPrefix ? 1 : 2,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 6);
}

function rankTeacherMatches(query, teacherList, preferredSubject = '') {
  const q = normalizeText(query);
  if (!q) return [];

  const prefSubj = normalizeText(preferredSubject);

  return teacherList
    .map((entry) => {
      const nameLower = normalizeText(entry.name);
      const subjLower = normalizeText(entry.subject);
      if (!nameLower) return null;

      const words = nameLower.split(/\s+/).filter(Boolean);
      const fullPrefix = nameLower.startsWith(q);
      const wordPrefix = !fullPrefix && words.some((w) => w.startsWith(q));
      const substringMatch = !fullPrefix && !wordPrefix && nameLower.includes(q);

      if (!fullPrefix && !wordPrefix && !substringMatch) return null;

      let rank = fullPrefix ? 0 : wordPrefix ? 1 : 2;
      if (prefSubj && subjLower && subjLower.includes(prefSubj)) {
        rank -= 0.5;
      }

      return {
        ...entry,
        rank,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 6);
}

const sameDayAndPeriod = (a, b) => {
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

function SlotCell({
  day,
  period,
  pIdx,
  slot,
  currentSubject,
  currentTeacher,
  subjectCatalog,
  teacherCatalog,
  teacherSubjectMap,
  isHighlighted,
  isDimmed,
  isEditable,
  conflictText,
  onUpdateCell,
}) {
  const [subjectDraft, setSubjectDraft] = useState(currentSubject);
  const [teacherDraft, setTeacherDraft] = useState(currentTeacher);
  const [focusedField, setFocusedField] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [activeSubjectIdx, setActiveSubjectIdx] = useState(0);
  const [activeTeacherIdx, setActiveTeacherIdx] = useState(0);

  const cellRef = useRef(null);
  const subjectDraftRef = useRef(subjectDraft);
  subjectDraftRef.current = subjectDraft;

  useEffect(() => {
    if (focusedField !== 'subject') {
      setSubjectDraft(currentSubject);
    }
  }, [currentSubject, focusedField]);

  useEffect(() => {
    if (focusedField !== 'teacher') {
      setTeacherDraft(currentTeacher);
    }
  }, [currentTeacher, focusedField]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (cellRef.current && !cellRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const subjectSuggestions = useMemo(() => {
    if (!isEditable || !subjectDraft.trim()) return [];
    return rankSubjectMatches(subjectDraft, subjectCatalog);
  }, [isEditable, subjectDraft, subjectCatalog]);

  const teacherSuggestions = useMemo(() => {
    if (!isEditable || !teacherDraft.trim()) return [];
    return rankTeacherMatches(teacherDraft, teacherCatalog, subjectDraft);
  }, [isEditable, teacherDraft, teacherCatalog, subjectDraft]);

  useEffect(() => {
    setActiveSubjectIdx(0);
  }, [subjectDraft]);

  useEffect(() => {
    setActiveTeacherIdx(0);
  }, [teacherDraft]);

  const applySubjectSelection = (subjItem) => {
    const chosenSubject = subjItem.name;
    setSubjectDraft(chosenSubject);
    setOpenDropdown(null);
    setFocusedField(null);
    if (chosenSubject !== currentSubject) {
      onUpdateCell?.(day, period, pIdx, slot, 'subject', chosenSubject);
    }
  };

  const handleSubjectChange = (e) => {
    const val = e.target.value;
    setSubjectDraft(val);
    setOpenDropdown(val.trim() ? 'subject' : null);
  };

  const handleSubjectBlur = () => {
    setTimeout(() => {
      if (cellRef.current?.contains(document.activeElement)) return;
      setFocusedField(null);
      if (openDropdown === 'subject') setOpenDropdown(null);

      const trimmed = subjectDraft.trim();
      const singlePrefixMatch =
        trimmed &&
        subjectSuggestions.length === 1 &&
        normalizeText(subjectSuggestions[0].name).startsWith(normalizeText(trimmed))
          ? subjectSuggestions[0].name
          : trimmed;

      setSubjectDraft(singlePrefixMatch);
      if (singlePrefixMatch !== currentSubject) {
        onUpdateCell?.(day, period, pIdx, slot, 'subject', singlePrefixMatch);
      }
    }, 120);
  };

  const handleSubjectKeyDown = (e) => {
    if (openDropdown === 'subject' && subjectSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSubjectIdx((prev) => (prev + 1) % subjectSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSubjectIdx(
          (prev) => (prev - 1 + subjectSuggestions.length) % subjectSuggestions.length
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const chosen = subjectSuggestions[activeSubjectIdx] || subjectSuggestions[0];
        if (chosen) {
          if (e.key === 'Enter') e.preventDefault();
          applySubjectSelection(chosen);
          if (e.key === 'Enter') e.currentTarget.blur();
          return;
        }
      }
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const applyTeacherSelection = (match) => {
    const chosenName = match.name;
    const pulledSubject =
      match.subject || teacherSubjectMap.get(normalizeText(chosenName)) || '';

    setTeacherDraft(chosenName);
    setOpenDropdown(null);
    setFocusedField(null);

    if (pulledSubject && !subjectDraftRef.current.trim()) {
      setSubjectDraft(pulledSubject);
      onUpdateCell?.(day, period, pIdx, slot, 'subject', pulledSubject);
    }

    if (chosenName !== currentTeacher) {
      onUpdateCell?.(day, period, pIdx, slot, 'teacher', chosenName);
    }
  };

  const handleTeacherChange = (e) => {
    const val = e.target.value;
    setTeacherDraft(val);
    setOpenDropdown(val.trim() ? 'teacher' : null);

    const trimmed = val.trim();
    if (!trimmed) return;

    const matches = rankTeacherMatches(trimmed, teacherCatalog, subjectDraftRef.current);
    const uniquePrefix =
      matches.length === 1 && normalizeText(matches[0].name).startsWith(normalizeText(trimmed));

    const pulledSubject = uniquePrefix
      ? matches[0].subject || teacherSubjectMap.get(normalizeText(matches[0].name)) || ''
      : '';

    if (pulledSubject && !subjectDraftRef.current.trim()) {
      setSubjectDraft(pulledSubject);
      onUpdateCell?.(day, period, pIdx, slot, 'subject', pulledSubject);
    }
  };

  const handleTeacherBlur = () => {
    setTimeout(() => {
      if (cellRef.current?.contains(document.activeElement)) return;
      setFocusedField(null);
      if (openDropdown === 'teacher') setOpenDropdown(null);

      const trimmed = teacherDraft.trim();
      const topMatch = teacherSuggestions[0];
      const shouldSnap =
        trimmed &&
        topMatch &&
        normalizeText(topMatch.name).startsWith(normalizeText(trimmed)) &&
        teacherSuggestions.length === 1;

      const finalName = shouldSnap ? topMatch.name : trimmed;
      setTeacherDraft(finalName);

      const pulledSubject =
        topMatch?.subject || teacherSubjectMap.get(normalizeText(finalName)) || '';
      if (pulledSubject && !subjectDraftRef.current.trim()) {
        setSubjectDraft(pulledSubject);
        onUpdateCell?.(day, period, pIdx, slot, 'subject', pulledSubject);
      }

      if (finalName !== currentTeacher) {
        onUpdateCell?.(day, period, pIdx, slot, 'teacher', finalName);
      }
    }, 120);
  };

  const handleTeacherKeyDown = (e) => {
    if (openDropdown === 'teacher' && teacherSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveTeacherIdx((prev) => (prev + 1) % teacherSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveTeacherIdx(
          (prev) => (prev - 1 + teacherSuggestions.length) % teacherSuggestions.length
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const chosen = teacherSuggestions[activeTeacherIdx] || teacherSuggestions[0];
        if (chosen) {
          if (e.key === 'Enter') e.preventDefault();
          applyTeacherSelection(chosen);
          if (e.key === 'Enter') e.currentTarget.blur();
          return;
        }
      }
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const hasConflict = Boolean(conflictText);

  if (isEditable) {
    const printableSubject = (subjectDraft || currentSubject || '').trim();
    const printableTeacher = (teacherDraft || currentTeacher || '').trim();

    return (
      <div
        ref={cellRef}
        className={`relative flex flex-col gap-1.5 p-1 rounded border transition-all ${
          hasConflict
            ? 'bg-red-50/90 dark:bg-red-950/35 border-red-400 dark:border-red-500/70'
            : isHighlighted
            ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-400 ring-2 ring-emerald-300/60'
            : isDimmed
            ? 'opacity-40 print:opacity-100 bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        }`}
      >
        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono text-center">
          {fmtTime(period.start_time)}–{fmtTime(period.end_time)}
        </div>

        {/* Print-only text so subject & teacher appear when printing editable grids */}
        <div className="hidden print:block text-center leading-tight text-black">
          <div className="font-semibold">
            {printableSubject || '—'}
          </div>
          {printableTeacher && (
            <div className="text-[8px] mt-0.5">
              {printableTeacher}
            </div>
          )}
        </div>

        {/* Screen editing inputs (hidden during print) */}
        <div className="print:hidden flex flex-col gap-1.5">
          <div className="relative">
            <input
              type="text"
              autoComplete="off"
              className="input text-xs py-1 text-center font-semibold"
              placeholder="Subject Name"
              value={subjectDraft}
              onFocus={() => {
                setFocusedField('subject');
                if (subjectDraft.trim()) setOpenDropdown('subject');
              }}
              onChange={handleSubjectChange}
              onBlur={handleSubjectBlur}
              onKeyDown={handleSubjectKeyDown}
            />

            {openDropdown === 'subject' && subjectSuggestions.length > 0 && (
              <div
                role="listbox"
                className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-44 overflow-y-auto text-left"
              >
                {subjectSuggestions.map((item, idx) => {
                  const isActive = idx === activeSubjectIdx;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applySubjectSelection(item);
                      }}
                      onMouseEnter={() => setActiveSubjectIdx(idx)}
                      className={`w-full px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800 transition-colors ${
                        isActive
                          ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-900 dark:text-brand-100'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="font-semibold truncate">{item.name}</span>
                      {item.code && (
                        <span className="text-[10px] text-slate-400 shrink-0">{item.code}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              autoComplete="off"
              className={`input text-xs py-1 text-center ${
                hasConflict
                  ? 'border-red-400 text-red-800 dark:text-red-200 font-medium'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
              placeholder="Teacher Name"
              value={teacherDraft}
              onFocus={() => {
                setFocusedField('teacher');
                if (teacherDraft.trim()) setOpenDropdown('teacher');
              }}
              onChange={handleTeacherChange}
              onBlur={handleTeacherBlur}
              onKeyDown={handleTeacherKeyDown}
            />

            {openDropdown === 'teacher' && teacherSuggestions.length > 0 && (
              <div
                role="listbox"
                className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-44 overflow-y-auto text-left"
              >
                {teacherSuggestions.map((item, idx) => {
                  const isActive = idx === activeTeacherIdx;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyTeacherSelection(item);
                      }}
                      onMouseEnter={() => setActiveTeacherIdx(idx)}
                      className={`w-full px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800 transition-colors ${
                        isActive
                          ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-900 dark:text-brand-100'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="font-semibold truncate">{item.name}</span>
                      {item.subject && (
                        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                          <BookOpen className="w-2.5 h-2.5 text-brand-600" />
                          {item.subject}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {hasConflict && (
          <div
            className="no-print flex items-center justify-center gap-1 text-[10px] font-semibold text-red-700 dark:text-red-300 leading-tight px-1"
            title={conflictText}
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">{conflictText}</span>
          </div>
        )}
      </div>
    );
  }

  if (slot && !isDimmed) {
    return (
      <div
        className={`rounded-md p-2 text-xs shadow-sm border transition-all ${
          hasConflict
            ? 'bg-red-50/90 dark:bg-red-950/35 border-red-400 dark:border-red-500/70'
            : isHighlighted
            ? 'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-400 ring-2 ring-emerald-300/60'
            : 'bg-brand-50/80 dark:bg-brand-500/10 border-brand-200/70 dark:border-brand-500/25'
        }`}
        title={conflictText || undefined}
      >
        <div
          className={`font-semibold truncate print:whitespace-normal ${
            hasConflict
              ? 'text-red-900 dark:text-red-200'
              : isHighlighted
              ? 'text-emerald-900 dark:text-emerald-200'
              : 'text-brand-800 dark:text-brand-300'
          }`}
        >
          {currentSubject || '—'}
        </div>
        <div
          className={`truncate print:whitespace-normal text-[11px] mt-0.5 ${
            hasConflict
              ? 'text-red-700 dark:text-red-300 font-medium'
              : isHighlighted
              ? 'text-emerald-800 dark:text-emerald-300 font-semibold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          {currentTeacher || '—'}
        </div>
        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
          {fmtTime(period?.start_time || slot.start_time)}–
          {fmtTime(period?.end_time || slot.end_time)}
        </div>
        {hasConflict && (
          <div className="no-print mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">{conflictText}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      className={`text-xs italic select-none ${
        isDimmed
          ? 'text-slate-200 dark:text-slate-800 print:text-slate-400'
          : 'text-slate-400 dark:text-slate-600'
      }`}
    >
      —
    </span>
  );
}

export default function TimetableGrid({
  timetable = [],
  periods = [],
  fridayPeriods = [],
  periodCount,
  fridayPeriodCount,
  hiddenDays = [],
  isEditable,
  onUpdateCell,
  subjects = [],
  teachers = [],
  otherSectionSlots = [],
  conflicts = [],
  maxWeeklyPeriods = 30,
}) {
  const [teacherFilter, setTeacherFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);

  const visibleDays = DAYS.filter((d) => !hiddenDays.includes(d));
  const headerPeriods = periods.slice(0, periodCount);
  const activeFridayPeriods = fridayPeriods.slice(0, fridayPeriodCount);

  const subjectCatalog = useMemo(() => {
    const map = new Map();
    for (const s of subjects) {
      const name = getSubjectName(s);
      const key = normalizeText(name);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          key,
          id: s?.id ?? s?.subject_id ?? null,
          name,
          code: s?.code || s?.subject_code || '',
        });
      }
    }
    for (const slot of [...timetable, ...otherSectionSlots]) {
      const name = String(slot.subject_name || slot.subject || '').trim();
      const key = normalizeText(name);
      if (key && !map.has(key)) {
        map.set(key, { key, id: null, name, code: '' });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects, timetable, otherSectionSlots]);

  const { teacherCatalog, teacherSubjectMap } = useMemo(() => {
    const subjectIdToName = new Map();
    for (const s of subjects) {
      const id = s?.id ?? s?.subject_id;
      const name = getSubjectName(s);
      if (id !== undefined && id !== null && name) {
        subjectIdToName.set(String(id), name);
      }
    }

    const subjMap = new Map();
    const tMap = new Map();

    for (const slot of [...timetable, ...otherSectionSlots]) {
      const tName = normalizeText(slot.teacher_name || slot.teacher);
      const sName = String(slot.subject_name || slot.subject || '').trim();
      if (tName && sName && !subjMap.has(tName)) {
        subjMap.set(tName, sName);
      }
    }

    for (const t of teachers) {
      const name = getTeacherName(t);
      const key = normalizeText(name);
      if (!key) continue;

      const linkedSubj =
        getTeacherLinkedSubject(t, subjectIdToName) || subjMap.get(key) || '';
      if (linkedSubj && !subjMap.has(key)) {
        subjMap.set(key, linkedSubj);
      }

      tMap.set(key, {
        key,
        id: t?.id ?? t?.teacher_id ?? null,
        name,
        subject: linkedSubj,
      });
    }

    for (const slot of [...timetable, ...otherSectionSlots]) {
      const name = String(slot.teacher_name || slot.teacher || '').trim();
      const key = normalizeText(name);
      if (key && !tMap.has(key)) {
        tMap.set(key, { key, id: null, name, subject: subjMap.get(key) || '' });
      }
    }

    return {
      teacherCatalog: Array.from(tMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      teacherSubjectMap: subjMap,
    };
  }, [teachers, subjects, timetable, otherSectionSlots]);

  const teacherFilterQuery = normalizeText(teacherFilter);
  const subjectFilterQuery = normalizeText(subjectFilter);

  const teacherFilterSuggestions = useMemo(() => {
    if (!teacherFilterQuery) return [];
    return rankTeacherMatches(teacherFilter, teacherCatalog);
  }, [teacherFilter, teacherFilterQuery, teacherCatalog]);

  const subjectFilterSuggestions = useMemo(() => {
    if (!subjectFilterQuery) return [];
    return rankSubjectMatches(subjectFilter, subjectCatalog);
  }, [subjectFilter, subjectFilterQuery, subjectCatalog]);

  const hasTeacherMatch = !teacherFilterQuery || teacherFilterSuggestions.length > 0;
  const hasSubjectMatch = !subjectFilterQuery || subjectFilterSuggestions.length > 0;

  const teacherWorkload = useMemo(() => {
    const map = new Map();

    const ensureEntry = (rawName) => {
      const key = normalizeText(rawName);
      if (!key) return null;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: String(rawName).trim(),
          subject: teacherSubjectMap.get(key) || '',
          sectionPeriods: 0,
          otherSectionPeriods: 0,
        });
      }
      return map.get(key);
    };

    for (const slot of timetable) {
      const rawName = slot.teacher_name || slot.teacher || '';
      const entry = ensureEntry(rawName);
      if (entry) entry.sectionPeriods += 1;
    }

    for (const other of otherSectionSlots) {
      const rawName = other.teacher_name || other.teacher || '';
      const entry = ensureEntry(rawName);
      if (entry) entry.otherSectionPeriods += 1;
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        totalPeriods: item.sectionPeriods + item.otherSectionPeriods,
        overloaded:
          item.sectionPeriods + item.otherSectionPeriods >= Number(maxWeeklyPeriods || 30),
      }))
      .sort((a, b) => b.totalPeriods - a.totalPeriods || a.name.localeCompare(b.name));
  }, [timetable, otherSectionSlots, maxWeeklyPeriods, teacherSubjectMap]);

  const isSlotMatchingFilter = (slot) => {
    if (!teacherFilterQuery && !subjectFilterQuery) return false;
    if (!slot) return false;
    const tName = normalizeText(slot.teacher_name || slot.teacher || '');
    const sName = normalizeText(slot.subject_name || slot.subject || '');
    const okTeacher = !teacherFilterQuery || tName.includes(teacherFilterQuery);
    const okSubject = !subjectFilterQuery || sName.includes(subjectFilterQuery);
    return okTeacher && okSubject;
  };

  const matchedTotalPeriods = useMemo(() => {
    if (!teacherFilterQuery && !subjectFilterQuery) return 0;
    return timetable.filter((t) => isSlotMatchingFilter(t)).length;
  }, [timetable, teacherFilterQuery, subjectFilterQuery]);

  const getCellConflictText = (day, period, pIdx, slot, teacherName) => {
    const normTeacher = normalizeText(teacherName);
    if (!normTeacher) return '';

    const probe = {
      day_of_week: day,
      start_time: slot?.start_time || period?.start_time,
      period_index: pIdx,
    };

    const matchedOther = otherSectionSlots.find((other) => {
      if (slot?.id && other.id === slot.id) return false;
      if (normalizeText(other.teacher_name || other.teacher) !== normTeacher) return false;
      return sameDayAndPeriod(probe, other);
    });

    if (matchedOther) {
      const where =
        [matchedOther.class_name, matchedOther.section_name && `Sec ${matchedOther.section_name}`]
          .filter(Boolean)
          .join(' ') || `Section ${matchedOther.section_id || '?'}`;
      return `Booked in ${where}`;
    }

    const matchedInSection = timetable.find((item) => {
      if (slot && item === slot) return false;
      if (slot?.id && item.id === slot.id) return false;
      if (
        String(item.day_of_week || '').trim().toLowerCase() === String(day).trim().toLowerCase() &&
        Number(item.period_index) === Number(pIdx)
      ) {
        return false;
      }
      if (normalizeText(item.teacher_name || item.teacher) !== normTeacher) return false;
      return sameDayAndPeriod(probe, item);
    });

    if (matchedInSection) {
      return 'Duplicate in this section';
    }

    const matchedObj = conflicts.find((c) => {
      if (!c || typeof c !== 'object') return false;
      if (normalizeText(c.teacher_name) !== normTeacher) return false;
      return sameDayAndPeriod(probe, c);
    });
    if (matchedObj) {
      return (
        matchedObj.message ||
        (matchedObj.where ? `Booked in ${matchedObj.where}` : 'Teacher clash')
      );
    }

    const dayLower = String(day || '').toLowerCase();
    const timeStr = periodKey(probe.start_time);
    const matchedStr = conflicts.find((c) => {
      if (typeof c !== 'string') return false;
      const lower = c.toLowerCase();
      return (
        lower.includes(normTeacher) &&
        lower.includes(dayLower) &&
        (!timeStr || lower.includes(timeStr))
      );
    });

    return matchedStr ? 'Teacher double-booked' : '';
  };

  const fridayWindowLabel = useMemo(() => {
    const timed = activeFridayPeriods.filter((p) => p.start_time && p.end_time);
    if (!timed.length) return '';
    return `${fmtTime(timed[0].start_time)}–${fmtTime(timed[timed.length - 1].end_time)}`;
  }, [activeFridayPeriods]);

  const anyFilterActive = Boolean(teacherFilterQuery || subjectFilterQuery);

  return (
    <div className="space-y-4">
      {teacherWorkload.length > 0 && (
        <Card className="p-3 bg-slate-50 dark:bg-slate-800/50 space-y-2 no-print">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-brand-600" />
              <span>Weekly Periods Per Teacher</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Overload threshold: {maxWeeklyPeriods} periods/wk
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {teacherWorkload.map((item) => {
              const isSelected = teacherFilterQuery === normalizeText(item.name);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    setTeacherFilter((prev) =>
                      normalizeText(prev) === normalizeText(item.name) ? '' : item.name
                    )
                  }
                  title={
                    item.otherSectionPeriods > 0
                      ? `${item.name}${item.subject ? ` (${item.subject})` : ''}: ${item.sectionPeriods} here + ${item.otherSectionPeriods} in other sections`
                      : `${item.name}${item.subject ? ` (${item.subject})` : ''}: ${item.sectionPeriods} period(s) in this section`
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    item.overloaded
                      ? 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/40 dark:border-red-500/60 dark:text-red-200 font-semibold'
                      : isSelected
                      ? 'bg-brand-100 border-brand-400 text-brand-800 dark:bg-brand-900/50 dark:border-brand-500 dark:text-brand-200 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{item.name}</span>
                  {item.subject && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      · {item.subject}
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      item.overloaded
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {item.totalPeriods}p
                  </span>
                  {item.overloaded && <AlertTriangle className="w-3 h-3 text-red-600" />}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-3 bg-slate-50 dark:bg-slate-800/50 space-y-2.5 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            {/* Teacher Filter */}
            <div className="relative flex items-center gap-2">
              <User className="w-4 h-4 text-brand-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Teacher:
              </span>
              <div className="relative flex items-center gap-1">
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Type teacher name..."
                  value={teacherFilter}
                  onFocus={() => {
                    if (teacherFilter.trim()) setShowTeacherDropdown(true);
                  }}
                  onBlur={() => setTimeout(() => setShowTeacherDropdown(false), 120)}
                  onChange={(e) => {
                    setTeacherFilter(e.target.value);
                    setShowTeacherDropdown(Boolean(e.target.value.trim()));
                  }}
                  className="input text-xs py-1 w-48"
                />
                {teacherFilter && (
                  <button
                    type="button"
                    onClick={() => setTeacherFilter('')}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                    title="Clear teacher filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {showTeacherDropdown && teacherFilterSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {teacherFilterSuggestions.map((match) => (
                      <button
                        key={match.key}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTeacherFilter(match.name);
                          setShowTeacherDropdown(false);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                      >
                        <span className="font-semibold truncate">{match.name}</span>
                        {match.subject && (
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {match.subject}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Subject Filter */}
            <div className="relative flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Subject:
              </span>
              <div className="relative flex items-center gap-1">
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Type subject name..."
                  value={subjectFilter}
                  onFocus={() => {
                    if (subjectFilter.trim()) setShowSubjectDropdown(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSubjectDropdown(false), 120)}
                  onChange={(e) => {
                    setSubjectFilter(e.target.value);
                    setShowSubjectDropdown(Boolean(e.target.value.trim()));
                  }}
                  className="input text-xs py-1 w-48"
                />
                {subjectFilter && (
                  <button
                    type="button"
                    onClick={() => setSubjectFilter('')}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                    title="Clear subject filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {showSubjectDropdown && subjectFilterSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {subjectFilterSuggestions.map((match) => (
                      <button
                        key={match.key}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSubjectFilter(match.name);
                          setShowSubjectDropdown(false);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                      >
                        <span className="font-semibold truncate">{match.name}</span>
                        {match.code && (
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {match.code}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {anyFilterActive && (
            <div className="text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 px-3 py-1 rounded-full border border-brand-200 dark:border-brand-500/30">
              Matched Periods in Section:{' '}
              <span className="font-bold">{matchedTotalPeriods}</span>
            </div>
          )}
        </div>

        {!hasTeacherMatch && (
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-700 rounded-md px-3 py-1.5">
            Please add the teacher first.
          </div>
        )}

        {!hasSubjectMatch && (
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-700 rounded-md px-3 py-1.5">
            Please add the subject first.
          </div>
        )}
      </Card>

      <div className="bg-white dark:bg-slate-900 shadow rounded-lg overflow-x-auto print:overflow-visible border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left border-collapse min-w-[760px] print:min-w-0">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              <th className="p-3.5 border-r border-slate-200 dark:border-slate-700 w-36">
                Day / Period
              </th>
              {headerPeriods.map((period, idx) => (
                <th
                  key={idx}
                  className="p-3.5 border-r border-slate-200 dark:border-slate-700 text-center min-w-[170px]"
                >
                  <div className="font-bold">{period.name || `Period ${idx + 1}`}</div>
                  {period.start_time && period.end_time && (
                    <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                      {fmtTime(period.start_time)} - {fmtTime(period.end_time)}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            {visibleDays.map((day) => {
              const isFriday = day === 'Friday';
              const activeList = isFriday ? activeFridayPeriods : headerPeriods;
              const trailingCount = Math.max(0, headerPeriods.length - activeList.length);

              return (
                <tr
                  key={day}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 align-top">
                    <div>{day}</div>
                    {isFriday && (
                      <div className="mt-1 space-y-0.5">
                        <span className="block text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                          Friday Timings
                        </span>
                        {fridayWindowLabel && (
                          <span className="block text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            {fridayWindowLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {activeList.map((period, pIdx) => {
                    if (period.isBreak) {
                      return (
                        <td
                          key={pIdx}
                          className="p-2 border-r border-slate-200 dark:border-slate-700 text-center align-middle bg-amber-50/70 dark:bg-amber-900/20 font-semibold text-amber-800 dark:text-amber-300 text-xs"
                        >
                          <div className="truncate font-bold">RECESS</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {fmtTime(period.start_time)}–{fmtTime(period.end_time)}
                          </div>
                        </td>
                      );
                    }

                    const slot =
                      timetable.find(
                        (t) =>
                          t.day_of_week?.toLowerCase() === day.toLowerCase() &&
                          (Number(t.period_index) === pIdx ||
                            (periodKey(t.start_time) &&
                              periodKey(t.start_time) === periodKey(period.start_time)))
                      ) ||
                      timetable.find(
                        (t) =>
                          t.day_of_week?.toLowerCase() === day.toLowerCase() &&
                          t.period_name === period.name
                      );

                    const currentSubject = slot?.subject_name || slot?.subject || '';
                    const currentTeacher = slot?.teacher_name || slot?.teacher || '';
                    const isHighlighted = Boolean(anyFilterActive && isSlotMatchingFilter(slot));
                    const isDimmed = Boolean(anyFilterActive && !isSlotMatchingFilter(slot));
                    const conflictText = getCellConflictText(
                      day,
                      period,
                      pIdx,
                      slot,
                      currentTeacher
                    );

                    return (
                      <td
                        key={pIdx}
                        className="p-2 border-r border-slate-200 dark:border-slate-700 text-center align-middle"
                      >
                        <SlotCell
                          key={`${day}-${pIdx}-${slot?.id || 'empty'}`}
                          day={day}
                          period={period}
                          pIdx={pIdx}
                          slot={slot}
                          currentSubject={currentSubject}
                          currentTeacher={currentTeacher}
                          subjectCatalog={subjectCatalog}
                          teacherCatalog={teacherCatalog}
                          teacherSubjectMap={teacherSubjectMap}
                          isHighlighted={isHighlighted}
                          isDimmed={isDimmed}
                          isEditable={isEditable}
                          conflictText={conflictText}
                          onUpdateCell={onUpdateCell}
                        />
                      </td>
                    );
                  })}

                  {Array.from({ length: trailingCount }).map((_, padIdx) => (
                    <td
                      key={`pad-${padIdx}`}
                      className="p-2 border-r last:border-r-0 border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 text-center text-xs text-slate-300 dark:text-slate-700 select-none"
                    >
                      —
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

