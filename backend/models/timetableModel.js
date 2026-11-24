const { run, get, all, transaction } = require('../config/database');

// ─── Day-of-week normalizer ───
const DAY_ALIASES = {
  mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday',
  thu: 'thursday', thur: 'thursday', thurs: 'thursday',
  fri: 'friday', sat: 'saturday', sun: 'sunday',
  monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
  thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday',
};

const normalizeDay = (d) => {
  if (d == null) return d;
  const key = String(d).trim().toLowerCase();
  return DAY_ALIASES[key] || key;
};

// ─── Time normalizer: handles "8:00", "08:00", "08:00:00", "8:00 AM", "1:30pm"
// Always returns HH:MM:SS. Throws on out-of-range hours/min/sec. ───
const normalizeTime = (t) => {
  if (t == null || t === '') return t;
  if (typeof t !== 'string') return t;

  let s = t.trim();

  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const mm = Number(ampm[2]);
    const ss = ampm[3] != null ? Number(ampm[3]) : 0;
    if (h < 1 || h > 12 || mm > 59 || ss > 59) {
      throw new Error(`Invalid time: "${t}"`);
    }
    const isPM = ampm[4].toLowerCase() === 'p';
    if (h === 12) h = isPM ? 12 : 0;
    else if (isPM) h += 12;
    s = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`Invalid time format: "${t}"`);

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] != null ? Number(m[3]) : 0;

  if (hh > 23 || mm > 59 || ss > 59) {
    throw new Error(`Time out of range: "${t}"`);
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const isValidTime = (t) => {
  if (typeof t !== 'string') return false;
  const m = t.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]), mm = Number(m[2]), ss = Number(m[3]);
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59;
};

const assertTimeRange = (startRaw, endRaw) => {
  const s = normalizeTime(startRaw);
  const e = normalizeTime(endRaw);
  if (!isValidTime(s)) throw new Error(`Invalid start_time: "${startRaw}"`);
  if (!isValidTime(e)) throw new Error(`Invalid end_time: "${endRaw}"`);
  if (s >= e) throw new Error(`start_time (${s}) must be < end_time (${e})`);
  return { start: s, end: e };
};

const normName = (s) =>
  s == null ? '' : String(s).trim().toLowerCase().replace(/\s+/g, ' ');

// ─── Numeric ID guard: rejects booleans/objects before Number() coerces them ───
const coercePositiveId = (raw, field) => {
  if (typeof raw === 'boolean' || typeof raw === 'object' || raw === '') {
    throw new Error(`Invalid ${field}: ${String(raw)} (expected positive integer)`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${field}: ${String(raw)} (expected positive integer)`);
  }
  return n;
};

// ─── Intra-batch overlap helpers ───
const overlaps = (a, b) => a.start < b.end && a.end > b.start;
const pushRange = (map, key, range) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(range);
};
const findOverlap = (map, key, range) => {
  const list = map.get(key);
  if (!list) return null;
  return list.find((r) => overlaps(r, range)) || null;
};

const DAY_ORDER_SQL = `CASE LOWER(t.day_of_week)
  WHEN 'monday'    THEN 1
  WHEN 'tuesday'   THEN 2
  WHEN 'wednesday' THEN 3
  WHEN 'thursday'  THEN 4
  WHEN 'friday'    THEN 5
  WHEN 'saturday'  THEN 6
  WHEN 'sunday'    THEN 7
  ELSE 8 END`;

// Helper for update() — extracted so the time-validating branch stays readable
async function writeUpdate(id, patch, keys) {
  const values = keys.map((k) => {
    if (k === 'day_of_week') return normalizeDay(patch[k]);
    if (k === 'start_time' || k === 'end_time') return normalizeTime(patch[k]);
    return patch[k];
  });
  const sql = `UPDATE timetables SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  return run(sql, [...values, id]);
}

const TimetableModel = {
  // ─── Read ───
  list: (filters = {}) => {
    let sql = `
      SELECT t.*,
             sub.subject_name, sub.subject_code,
             sec.section_name, sec.room_number,
             c.id AS class_id, c.class_name, c.class_code,
             u.name AS teacher_name, te.employee_code
      FROM timetables t
      LEFT JOIN subjects sub ON t.subject_id = sub.id
      LEFT JOIN sections sec ON t.section_id = sec.id
      LEFT JOIN classes c ON sec.class_id = c.id
      LEFT JOIN teachers te ON t.teacher_id = te.id
      LEFT JOIN users u ON te.user_id = u.id
    `;
    const where = ['t.is_active = 1'];
    const params = [];

    if (filters.section_id) { where.push('t.section_id = ?'); params.push(filters.section_id); }
    if (filters.teacher_id) { where.push('t.teacher_id = ?'); params.push(filters.teacher_id); }
    if (filters.class_id)   { where.push('c.id = ?');         params.push(filters.class_id); }
    if (filters.day)        { where.push('LOWER(t.day_of_week) = ?'); params.push(normalizeDay(filters.day)); }

    sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY ${DAY_ORDER_SQL}, t.start_time`;
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT t.*,
              sub.subject_name, sub.subject_code,
              sec.section_name, c.class_name,
              u.name AS teacher_name
       FROM timetables t
       LEFT JOIN subjects sub ON t.subject_id = sub.id
       LEFT JOIN sections sec ON t.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       LEFT JOIN teachers te ON t.teacher_id = te.id
       LEFT JOIN users u ON te.user_id = u.id
       WHERE t.id = ?`,
      [id]
    ),

  // ─── Conflict detection ───
  sectionConflict: ({ section_id, day_of_week, start_time, end_time, except_id = null }) => {
    const { start, end } = assertTimeRange(start_time, end_time);
    const cleanExceptId =
      except_id === null || except_id === undefined || except_id === ''
        ? null : Number(except_id);

    return get(
      `SELECT id, start_time, end_time
       FROM timetables
       WHERE section_id = ? AND LOWER(day_of_week) = ? AND is_active = 1
         AND (? IS NULL OR id != ?)
         AND (start_time < ? AND end_time > ?)`,
      [section_id, normalizeDay(day_of_week), cleanExceptId, cleanExceptId, end, start]
    );
  },

  teacherConflict: ({ teacher_id, day_of_week, start_time, end_time, except_id = null }) => {
    if (!teacher_id) return Promise.resolve(null);
    const { start, end } = assertTimeRange(start_time, end_time);
    const cleanExceptId =
      except_id === null || except_id === undefined || except_id === ''
        ? null : Number(except_id);

    return get(
      `SELECT t.id, t.start_time, t.end_time, sec.section_name, c.class_name
       FROM timetables t
       LEFT JOIN sections sec ON t.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE t.teacher_id = ? AND LOWER(t.day_of_week) = ? AND t.is_active = 1
         AND (? IS NULL OR t.id != ?)
         AND (t.start_time < ? AND t.end_time > ?)`,
      [teacher_id, normalizeDay(day_of_week), cleanExceptId, cleanExceptId, end, start]
    );
  },

  // ─── Write ───
  create: ({ section_id, subject_id, teacher_id = null, day_of_week, start_time, end_time }) => {
    const { start, end } = assertTimeRange(start_time, end_time);
    return run(
      `INSERT INTO timetables
         (section_id, subject_id, teacher_id, day_of_week, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [section_id, subject_id, teacher_id ?? null, normalizeDay(day_of_week), start, end]
    );
  },

  update: (id, patch) => {
    const allowed = [
      'section_id', 'subject_id', 'teacher_id',
      'day_of_week', 'start_time', 'end_time', 'is_active',
    ];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });

    const needsRangeCheck = 'start_time' in patch || 'end_time' in patch;
    const doWrite = () => writeUpdate(id, patch, keys);

    if (!needsRangeCheck) return doWrite();

    return get(`SELECT start_time, end_time FROM timetables WHERE id = ?`, [id])
      .then((row) => {
        if (!row) throw new Error(`Timetable id ${id} not found`);
        assertTimeRange(
          'start_time' in patch ? patch.start_time : row.start_time,
          'end_time'   in patch ? patch.end_time   : row.end_time
        );
        return doWrite();
      });
  },

  remove: (id) => run(`DELETE FROM timetables WHERE id = ?`, [id]),

  // ─── Lookups for the form ───
  subjectsForSection: (section_id) =>
    all(
      `SELECT DISTINCT sub.id, sub.subject_name, sub.subject_code
       FROM subjects sub
       JOIN sections sec ON sec.id = ?
       WHERE sub.class_id = sec.class_id OR sub.class_id IS NULL
       ORDER BY sub.subject_name`,
      [section_id]
    ),

  teachersForSection: async (section_id) => {
    const rows = await all(
      `SELECT DISTINCT t.id, t.employee_code, u.name, u.email
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       JOIN sections sec ON sec.id = ?
       JOIN classes c ON c.id = sec.class_id
       LEFT JOIN teacher_classes tc
         ON tc.teacher_id = t.id AND tc.class_id = c.id
       WHERE u.status = 'active'
         AND (
              tc.teacher_id IS NOT NULL
           OR t.employee_code LIKE 'TCH-' || printf('%02d', c.id) || '-%'
           OR EXISTS (
                SELECT 1 FROM timetables tt
                WHERE tt.teacher_id = t.id
                  AND tt.is_active = 1
                  AND tt.section_id = sec.id
              )
           OR EXISTS (
                SELECT 1 FROM timetables tt2
                JOIN sections s2 ON s2.id = tt2.section_id
                WHERE tt2.teacher_id = t.id
                  AND tt2.is_active = 1
                  AND s2.class_id = c.id
              )
         )
       ORDER BY u.name, t.employee_code`,
      [section_id]
    );
    if (rows.length > 0) return rows;

    return all(
      `SELECT t.id, t.employee_code, u.name, u.email
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       WHERE u.status = 'active'
       ORDER BY u.name`
    );
  },

  teachersList: () =>
    all(
      `SELECT t.id, t.employee_code, u.name, u.email
       FROM teachers t
       JOIN users u ON t.user_id = u.id
       WHERE u.status = 'active'
       ORDER BY u.name`
    ),

  // ─── Weekly grid & queries ───
  byTeacher: (teacher_id) =>
    all(
      `SELECT t.id, t.day_of_week, t.start_time, t.end_time,
              sub.id AS subject_id, sub.subject_name,
              sec.id AS section_id, sec.section_name,
              c.id AS class_id, c.class_name
       FROM timetables t
       LEFT JOIN subjects sub ON sub.id = t.subject_id
       LEFT JOIN sections sec ON sec.id = t.section_id
       LEFT JOIN classes c ON c.id = sec.class_id
       JOIN teachers te ON te.id = t.teacher_id
       JOIN users u ON u.id = te.user_id
       WHERE t.teacher_id = ? AND t.is_active = 1 AND u.status = 'active'
       ORDER BY ${DAY_ORDER_SQL}, t.start_time`,
      [teacher_id]
    ),

  searchSlots: (filters = {}) => {
    let sql = `
      SELECT c.id AS class_id, c.class_name,
             sec.id AS section_id, sec.section_name,
             t.id, t.day_of_week, t.start_time, t.end_time,
             sub.subject_name, sub.subject_code,
             u.name AS teacher_name, te.employee_code
      FROM timetables t
      LEFT JOIN sections sec ON sec.id = t.section_id
      LEFT JOIN classes c ON c.id = sec.class_id
      LEFT JOIN subjects sub ON sub.id = t.subject_id
      LEFT JOIN teachers te ON te.id = t.teacher_id
      LEFT JOIN users u ON u.id = te.user_id
      WHERE t.is_active = 1`;
    const where = [];
    const params = [];

    if (filters.class_id)   { where.push('c.id = ?');   params.push(filters.class_id); }
    if (filters.section_id) { where.push('sec.id = ?'); params.push(filters.section_id); }
    if (filters.teacher_id) { where.push('te.id = ?');  params.push(filters.teacher_id); }
    if (filters.subject_id) { where.push('sub.id = ?'); params.push(filters.subject_id); }
    if (filters.day)        { where.push('LOWER(t.day_of_week) = ?'); params.push(normalizeDay(filters.day)); }
    if (filters.period)     { where.push('t.start_time = ?'); params.push(normalizeTime(filters.period)); }
    if (filters.q) {
      where.push('(u.name LIKE ? OR sub.subject_name LIKE ? OR c.class_name LIKE ?)');
      const like = `%${filters.q}%`;
      params.push(like, like, like);
    }

    if (where.length) sql += ` AND ${where.join(' AND ')}`;
    sql += ` ORDER BY c.id, sec.section_name, ${DAY_ORDER_SQL}, t.start_time`;
    return all(sql, params);
  },

  schoolGrid: () =>
    all(
      `SELECT c.id AS class_id, c.class_name,
              sec.id AS section_id, sec.section_name,
              t.id, t.day_of_week, t.start_time, t.end_time,
              sub.subject_name,
              u.name AS teacher_name
       FROM timetables t
       LEFT JOIN sections sec ON sec.id = t.section_id
       LEFT JOIN classes c ON c.id = sec.class_id
       LEFT JOIN subjects sub ON sub.id = t.subject_id
       LEFT JOIN teachers te ON te.id = t.teacher_id
       LEFT JOIN users u ON u.id = te.user_id
       WHERE t.is_active = 1
       ORDER BY c.id, sec.section_name, ${DAY_ORDER_SQL}, t.start_time`
    ),

  weeklyForSection: (section_id) =>
    all(
      `SELECT t.id, t.day_of_week, t.start_time, t.end_time,
              sub.id AS subject_id, sub.subject_name,
              te.id AS teacher_id, u.name AS teacher_name
       FROM timetables t
       LEFT JOIN subjects sub ON t.subject_id = sub.id
       LEFT JOIN teachers te ON t.teacher_id = te.id
       LEFT JOIN users u ON te.user_id = u.id
       WHERE t.section_id = ? AND t.is_active = 1
       ORDER BY ${DAY_ORDER_SQL}, t.start_time`,
      [section_id]
    ),

  // ─── Teacher → class relationship management ───
  assignTeacherToClass: (teacher_id, class_id) =>
    run(
      `INSERT OR IGNORE INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)`,
      [teacher_id, class_id]
    ),

  unassignTeacherFromClass: (teacher_id, class_id) =>
    run(
      `DELETE FROM teacher_classes WHERE teacher_id = ? AND class_id = ?`,
      [teacher_id, class_id]
    ),

  classesForTeacher: (teacher_id) =>
    all(
      `SELECT c.id, c.class_name, c.class_code
       FROM teacher_classes tc
       JOIN classes c ON c.id = tc.class_id
       WHERE tc.teacher_id = ?
       ORDER BY c.class_name`,
      [teacher_id]
    ),
};

/* ════════════════════════════════════════════════════════════════
   DRILL-DOWN helpers
   ════════════════════════════════════════════════════════════════ */

const periodsForDay = async (day) => {
  const rows = await all(
    `SELECT DISTINCT start_time, end_time
     FROM timetables
     WHERE is_active = 1 AND LOWER(day_of_week) = ?
     ORDER BY start_time`,
    [normalizeDay(day)]
  );
  return rows.map((r, i) => ({
    index: i + 1,
    label: `Period ${i + 1}`,
    start: r.start_time,
    end: r.end_time,
  }));
};

const gridForDay = async (day) => {
  const normalized = normalizeDay(day);
  const periods = await periodsForDay(normalized);

  const rows = await all(
    `SELECT
       sec.id AS sectionId, sec.section_name AS sectionName,
       cls.id AS classId, cls.class_name AS className,
       t.start_time AS startTime, t.end_time AS endTime,
       t.subject_id AS subjectId, sub.subject_name AS subjectName,
       t.teacher_id AS teacherId, u.name AS teacherName
     FROM sections sec
     JOIN classes cls ON cls.id = sec.class_id
     LEFT JOIN timetables t ON t.section_id = sec.id
                           AND LOWER(t.day_of_week) = ?
                           AND t.is_active = 1
     LEFT JOIN subjects sub ON sub.id = t.subject_id
     LEFT JOIN teachers tr ON tr.id = t.teacher_id
     LEFT JOIN users u ON u.id = tr.user_id
     ORDER BY cls.class_name ASC, sec.section_name ASC, t.start_time ASC`,
    [normalized]
  );

  const bySection = new Map();
  for (const r of rows) {
    const key = String(r.sectionId);
    if (!bySection.has(key)) {
      bySection.set(key, {
        sectionId: r.sectionId,
        sectionName: r.sectionName,
        classId: r.classId,
        className: r.className,
        periods: {},
      });
    }
    if (r.startTime) {
      bySection.get(key).periods[r.startTime] = {
        startTime: r.startTime,
        endTime: r.endTime,
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        teacherId: r.teacherId,
        teacherName: r.teacherName,
      };
    }
  }

  return { periods, sections: Array.from(bySection.values()) };
};

const teacherLoad = async (day = null) => {
  const sql = day
    ? `SELECT tr.id AS teacherId, u.name AS teacherName, COUNT(*) AS periods
       FROM timetables t
       JOIN teachers tr ON tr.id = t.teacher_id
       JOIN users u ON u.id = tr.user_id
       WHERE t.is_active = 1 AND u.status = 'active' AND LOWER(t.day_of_week) = ?
       GROUP BY tr.id, u.name
       ORDER BY periods DESC, u.name ASC`
    : `SELECT tr.id AS teacherId, u.name AS teacherName, COUNT(*) AS periods
       FROM timetables t
       JOIN teachers tr ON tr.id = t.teacher_id
       JOIN users u ON u.id = tr.user_id
       WHERE t.is_active = 1 AND u.status = 'active'
       GROUP BY tr.id, u.name
       ORDER BY periods DESC, u.name ASC`;
  return all(sql, day ? [normalizeDay(day)] : []);
};

const resolveTeacher = async (teacher_id, teacher_name) => {
  if (teacher_id != null && teacher_id !== '') {
    const n = coercePositiveId(teacher_id, 'teacher_id');
    const row = await get(
      `SELECT t.id FROM teachers t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = ? AND u.status = 'active'`,
      [n]
    );
    if (!row) throw new Error(`Teacher ${n} is inactive or missing`);
    return row.id;
  }
  if (!teacher_name) return null;

  const target = normName(teacher_name);
  const matches = await all(
    `SELECT t.id, u.name FROM teachers t
     JOIN users u ON u.id = t.user_id
     WHERE u.status = 'active' AND LOWER(TRIM(u.name)) = ?`,
    [target]
  );

  if (matches.length === 0) throw new Error(`Teacher not found: "${teacher_name}"`);
  if (matches.length > 1) {
    const list = matches.map((m) => `${m.id}:${m.name}`).join(', ');
    throw new Error(`Ambiguous teacher name "${teacher_name}" — matches: ${list}`);
  }
  return matches[0].id;
};

// Single atomic transaction, intra-batch overlap detection, conflict checks,
// soft-delete revival, id-based updates, and numeric-id hardening.
const bulkUpsert = async (entries, { skipConflictCheck = false } = {}) => {
  if (!Array.isArray(entries)) throw new Error('entries must be an array');

  const results = { inserted: 0, updated: 0, deleted: 0, revived: 0 };

  return transaction(async () => {
    const seenBySection = new Map();
    const seenByTeacher = new Map();

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      try {
        const cleanDay = normalizeDay(e.day_of_week);
        const { start: cleanStart, end: cleanEnd } =
          assertTimeRange(e.start_time, e.end_time);
        const range = { start: cleanStart, end: cleanEnd, index: i };

        const sectionId = coercePositiveId(e.section_id, 'section_id');
        const subjectId = e.subject_id == null || e.subject_id === ''
          ? null
          : coercePositiveId(e.subject_id, 'subject_id');

        let teacher_id = null;
        if (e.teacher_id != null && e.teacher_id !== '') {
          teacher_id = await resolveTeacher(e.teacher_id, null);
        } else if (e.teacher_name) {
          teacher_id = await resolveTeacher(null, e.teacher_name);
        }

        // ── Delete path ──
        if (!subjectId) {
          await run(
            `DELETE FROM timetables
             WHERE section_id = ? AND LOWER(day_of_week) = ? AND start_time = ?`,
            [sectionId, cleanDay, cleanStart]
          );
          results.deleted += 1;
          continue;
        }

        // ── Find existing row ──
        let existing = null;
        if (e.id != null && e.id !== '') {
          const rowId = coercePositiveId(e.id, 'id');
          existing = await get(
            `SELECT id, is_active, section_id, day_of_week
             FROM timetables WHERE id = ?`,
            [rowId]
          );
          if (!existing) throw new Error(`Timetable id ${rowId} not found`);
          const sameSection = sectionId === existing.section_id;
          const sameDay = cleanDay === String(existing.day_of_week).toLowerCase();
          if (!sameSection || !sameDay) {
            throw new Error(
              `Entry id ${rowId} belongs to section ${existing.section_id}/${existing.day_of_week}; ` +
              `cannot reassign section/day via id. Delete and re-create instead.`
            );
          }
        } else {
          existing = await get(
            `SELECT id, is_active FROM timetables
             WHERE section_id = ? AND LOWER(day_of_week) = ? AND start_time = ?`,
            [sectionId, cleanDay, cleanStart]
          );
        }

        // ── Intra-batch overlap ──
        if (!skipConflictCheck) {
          const secKey = `${sectionId}|${cleanDay}`;
          const secHit = findOverlap(seenBySection, secKey, range);
          if (secHit) {
            throw new Error(
              `Intra-batch section conflict: entry ${i} overlaps entry ${secHit.index} ` +
              `(${secHit.start}–${secHit.end} vs ${cleanStart}–${cleanEnd})`
            );
          }
          if (teacher_id) {
            const tKey = `${teacher_id}|${cleanDay}`;
            const tHit = findOverlap(seenByTeacher, tKey, range);
            if (tHit) {
              throw new Error(
                `Intra-batch teacher conflict: entry ${i} overlaps entry ${tHit.index} ` +
                `(teacher ${teacher_id}, ${tHit.start}–${tHit.end} vs ${cleanStart}–${cleanEnd})`
              );
            }
          }
        }

        // ── DB-backed conflicts ──
        const exceptId = existing?.id ?? null;
        if (!skipConflictCheck) {
          const secClash = await TimetableModel.sectionConflict({
            section_id: sectionId,
            day_of_week: cleanDay,
            start_time: cleanStart,
            end_time: cleanEnd,
            except_id: exceptId,
          });
          if (secClash) {
            throw new Error(
              `Section conflict: existing slot ${secClash.start_time}–${secClash.end_time} (id ${secClash.id})`
            );
          }
          if (teacher_id) {
            const tClash = await TimetableModel.teacherConflict({
              teacher_id,
              day_of_week: cleanDay,
              start_time: cleanStart,
              end_time: cleanEnd,
              except_id: exceptId,
            });
            if (tClash) {
              throw new Error(
                `Teacher conflict: ${tClash.class_name}/${tClash.section_name} ` +
                `${tClash.start_time}–${tClash.end_time} (id ${tClash.id})`
              );
            }
          }
        }

        // ── Write ──
        if (existing) {
          await run(
            `UPDATE timetables
             SET start_time = ?, end_time = ?, subject_id = ?, teacher_id = ?,
                 day_of_week = ?, is_active = 1
             WHERE id = ?`,
            [cleanStart, cleanEnd, subjectId, teacher_id, cleanDay, existing.id]
          );
          if (existing.is_active === 0) results.revived += 1;
          else results.updated += 1;
        } else {
          await run(
            `INSERT INTO timetables
             (section_id, subject_id, teacher_id, day_of_week, start_time, end_time, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [sectionId, subjectId, teacher_id, cleanDay, cleanStart, cleanEnd]
          );
          results.inserted += 1;
        }

        pushRange(seenBySection, `${sectionId}|${cleanDay}`, range);
        if (teacher_id) pushRange(seenByTeacher, `${teacher_id}|${cleanDay}`, range);
      } catch (err) {
        err.entryIndex = i;
        err.entry = e;
        throw err;
      }
    }
    return results;
  });
};

TimetableModel.periodsForDay  = periodsForDay;
TimetableModel.gridForDay     = gridForDay;
TimetableModel.teacherLoad    = teacherLoad;
TimetableModel.bulkUpsert     = bulkUpsert;
TimetableModel.resolveTeacher = resolveTeacher;
TimetableModel.normalizeTime  = normalizeTime;
TimetableModel.normalizeDay   = normalizeDay;

module.exports = TimetableModel;

