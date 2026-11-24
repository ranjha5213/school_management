// routes/timetable.js
const express = require('express');
const router = express.Router();
const Timetable = require('../models/timetableModel');

const ALLOWED_FIELDS = [
  'section_id',
  'subject_id',
  'teacher_id',
  'day_of_week',
  'start_time',
  'end_time',
];

// ─── Time parsing: mirrors Timetable.normalizeTime ───
const toMinutes = (timeStr) => {
  if (typeof timeStr !== 'string') return null;
  const s = timeStr.trim();

  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const mm = Number(ampm[2]);
    const ss = ampm[3] != null ? Number(ampm[3]) : 0;
    if (h < 1 || h > 12 || mm > 59 || ss > 59) return null;
    const isPM = ampm[4].toLowerCase() === 'p';
    if (h === 12) h = isPM ? 12 : 0;
    else if (isPM) h += 12;
    return h * 60 + mm + ss / 60;
  }

  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] != null ? Number(m[3]) : 0;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return hh * 60 + mm + ss / 60;
};

const validateTimeRange = (startTime, endTime) => {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (s === null || e === null) {
    return 'start_time and end_time must be valid times (HH:MM, HH:MM:SS, or h:mm AM/PM)';
  }
  if (e <= s) {
    return 'end_time must be later than start_time';
  }
  return null;
};

const normalizeDay = (day) =>
  typeof day === 'string' && day.trim() ? day.trim().toLowerCase() : day;

const parseId = (raw) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Rejects booleans/objects before Number() coerces them (true → 1, false → 0)
const coercePositiveId = (raw, field) => {
  if (typeof raw === 'boolean' || typeof raw === 'object' || raw === '') {
    return { error: `${field} must be a positive integer or null` };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { error: `${field} must be a positive integer or null` };
  }
  return { value: n };
};

const VALIDATION_PATTERNS = [
  /^Invalid /i,
  /^Invalid time/i,
  /^Invalid time format/i,
  /^Time out of range/i,
  /^Invalid start_time/i,
  /^Invalid end_time/i,
  /must be < end_time/i,
  /^Teacher .* is inactive or missing/i,
  /^Teacher not found/i,
  /^Ambiguous teacher name/i,
  /^Timetable id .* not found/i,
  /^entries must be an array/i,
  /^Entry id .* belongs to section/i,
];

const isValidationError = (msg) =>
  VALIDATION_PATTERNS.some((re) => re.test(msg));

const sendRouteError = (res, context, err, fallbackStatus = 500) => {
  console.error(`${context}:`, err);
  const msg = String(err?.message || 'Internal server error');

  const isConstraint =
    err?.code === 'SQLITE_CONSTRAINT' ||
    msg.includes('SQLITE_CONSTRAINT') ||
    msg.startsWith('timetable:');
  if (isConstraint) {
    const cleanMsg = msg.startsWith('timetable:')
      ? msg.replace(/^timetable:\s*/, '')
      : 'Invalid reference or constraint violation on timetable slot';
    return res.status(400).json({ error: cleanMsg });
  }

  const payload = { error: msg };
  if (err?.entryIndex !== undefined) payload.entryIndex = err.entryIndex;
  if (err?.entry !== undefined)      payload.entry = err.entry;

  if (/conflict/i.test(msg)) {
    return res.status(409).json(payload);
  }
  if (isValidationError(msg)) {
    return res.status(400).json(payload);
  }
  return res.status(fallbackStatus).json(payload);
};

const buildNumericFilters = (raw, keys) => {
  const out = {};
  for (const k of keys) {
    const v = raw[k];
    if (v === undefined || v === null || v === '') continue;
    const n = parseId(v);
    if (!n) return { error: `${k} must be a positive integer when provided` };
    out[k] = n;
  }
  return { filters: out };
};

// ═══════════════════════════════════════════════════════════
// CUSTOM ROUTES (registered BEFORE /:id)
// ═══════════════════════════════════════════════════════════

router.get('/section/:sectionId/weekly', async (req, res) => {
  const sectionId = parseId(req.params.sectionId);
  if (!sectionId) {
    return res.status(400).json({ error: 'sectionId must be a positive integer' });
  }
  try {
    const rows = await Timetable.weeklyForSection(sectionId);
    res.json(rows);
  } catch (err) {
    sendRouteError(res, 'weeklyForSection', err);
  }
});

router.get('/grid/:day', async (req, res) => {
  try {
    const data = await Timetable.gridForDay(normalizeDay(req.params.day));
    res.json(data);
  } catch (err) {
    sendRouteError(res, 'gridForDay', err);
  }
});

router.get('/teacher-load', async (req, res) => {
  try {
    const dayFilter = req.query.day ? normalizeDay(req.query.day) : null;
    const data = await Timetable.teacherLoad(dayFilter);
    res.json(data);
  } catch (err) {
    sendRouteError(res, 'teacherLoad', err);
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const { entries, skipConflictCheck = false } = req.body || {};
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries[] array is required' });
    }
    const normalizedEntries = entries.map((entry) => ({
      ...entry,
      day_of_week: normalizeDay(entry?.day_of_week),
    }));
    const result = await Timetable.bulkUpsert(normalizedEntries, { skipConflictCheck });
    res.json({ ok: true, ...result });
  } catch (err) {
    sendRouteError(res, 'bulkUpsert', err);
  }
});

router.get('/subjects/:sectionId', async (req, res) => {
  const sectionId = parseId(req.params.sectionId);
  if (!sectionId) {
    return res.status(400).json({ error: 'sectionId must be a positive integer' });
  }
  try {
    const subjects = await Timetable.subjectsForSection(sectionId);
    res.json(subjects);
  } catch (err) {
    sendRouteError(res, 'subjectsForSection', err);
  }
});

router.get('/teachers/:sectionId', async (req, res) => {
  const sectionId = parseId(req.params.sectionId);
  if (!sectionId) {
    return res.status(400).json({ error: 'sectionId must be a positive integer' });
  }
  try {
    const teachers = await Timetable.teachersForSection(sectionId);
    res.json(teachers);
  } catch (err) {
    sendRouteError(res, 'teachersForSection', err);
  }
});

router.post('/teachers/:teacherId/classes/:classId', async (req, res) => {
  const teacherId = parseId(req.params.teacherId);
  const classId   = parseId(req.params.classId);
  if (!teacherId) return res.status(400).json({ error: 'teacherId must be a positive integer' });
  if (!classId)   return res.status(400).json({ error: 'classId must be a positive integer' });
  try {
    await Timetable.assignTeacherToClass(teacherId, classId);
    res.json({ ok: true });
  } catch (err) {
    sendRouteError(res, 'assignTeacherToClass', err);
  }
});

router.delete('/teachers/:teacherId/classes/:classId', async (req, res) => {
  const teacherId = parseId(req.params.teacherId);
  const classId   = parseId(req.params.classId);
  if (!teacherId) return res.status(400).json({ error: 'teacherId must be a positive integer' });
  if (!classId)   return res.status(400).json({ error: 'classId must be a positive integer' });
  try {
    await Timetable.unassignTeacherFromClass(teacherId, classId);
    res.json({ ok: true });
  } catch (err) {
    sendRouteError(res, 'unassignTeacherFromClass', err);
  }
});

router.get('/teachers/:teacherId/classes', async (req, res) => {
  const teacherId = parseId(req.params.teacherId);
  if (!teacherId) {
    return res.status(400).json({ error: 'teacherId must be a positive integer' });
  }
  try {
    const classes = await Timetable.classesForTeacher(teacherId);
    res.json(classes);
  } catch (err) {
    sendRouteError(res, 'classesForTeacher', err);
  }
});

// ═══════════════════════════════════════════════════════════
// STANDARD CRUD
// ═══════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const { section_id, class_id, teacher_id, day } = req.query;

    const { filters, error } = buildNumericFilters(
      { section_id, class_id, teacher_id },
      ['section_id', 'class_id', 'teacher_id']
    );
    if (error) return res.status(400).json({ error });

    if (day !== undefined && day !== null && day !== '') {
      filters.day = normalizeDay(day);
    }

    const slots = await Timetable.list(filters);
    res.json(slots);
  } catch (err) {
    sendRouteError(res, 'list timetable', err);
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};

    const secCheck = coercePositiveId(body.section_id, 'section_id');
    if (secCheck.error) return res.status(400).json({ error: secCheck.error });
    const section_id = secCheck.value;

    const subCheck = coercePositiveId(body.subject_id, 'subject_id');
    if (subCheck.error) return res.status(400).json({ error: subCheck.error });
    const subject_id = subCheck.value;

    // teacher_id: null / undefined / '' → unassign; otherwise must be valid positive int
    let teacher_id = null;
    if (
      body.teacher_id !== null &&
      body.teacher_id !== undefined &&
      body.teacher_id !== ''
    ) {
      const tCheck = coercePositiveId(body.teacher_id, 'teacher_id');
      if (tCheck.error) return res.status(400).json({ error: tCheck.error });
      teacher_id = tCheck.value;
    }

    const day_of_week = normalizeDay(body.day_of_week);
    const start_time = typeof body.start_time === 'string' ? body.start_time.trim() : '';
    const end_time = typeof body.end_time === 'string' ? body.end_time.trim() : '';

    if (!day_of_week || !start_time || !end_time) {
      return res.status(400).json({
        error: 'day_of_week, start_time, and end_time are required',
      });
    }

    const rangeErr = validateTimeRange(start_time, end_time);
    if (rangeErr) return res.status(400).json({ error: rangeErr });

    const secConflict = await Timetable.sectionConflict({
      section_id,
      day_of_week,
      start_time,
      end_time,
    });
    if (secConflict) {
      return res.status(409).json({
        error: 'Section already has a slot in that time range',
        conflict: secConflict,
      });
    }

    if (teacher_id) {
      const teachConflict = await Timetable.teacherConflict({
        teacher_id,
        day_of_week,
        start_time,
        end_time,
      });
      if (teachConflict) {
        return res.status(409).json({
          error: 'Teacher is already booked in that time range',
          conflict: teachConflict,
        });
      }
    }

    const result = await Timetable.create({
      section_id,
      subject_id,
      teacher_id,
      day_of_week,
      start_time,
      end_time,
    });

    const created = await Timetable.findById(result.lastID ?? result.id);
    res.status(201).json(created);
  } catch (err) {
    sendRouteError(res, 'create timetable', err);
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  try {
    const slot = await Timetable.findById(id);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    res.json(slot);
  } catch (err) {
    sendRouteError(res, 'get timetable slot', err);
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  try {
    const existing = await Timetable.findById(id);
    if (!existing) return res.status(404).json({ error: 'Slot not found' });

    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => ALLOWED_FIELDS.includes(key))
    );

    if ('day_of_week' in patch) {
      patch.day_of_week = normalizeDay(patch.day_of_week);
    }
    if ('start_time' in patch && typeof patch.start_time === 'string') {
      patch.start_time = patch.start_time.trim();
    }
    if ('end_time' in patch && typeof patch.end_time === 'string') {
      patch.end_time = patch.end_time.trim();
    }
    // '' / undefined → null (unassign). null passes through unchanged.
    if ('teacher_id' in patch && (patch.teacher_id === '' || patch.teacher_id === undefined)) {
      patch.teacher_id = null;
    }

    // Validate numeric fields in the patch — booleans/objects rejected before Number()
    for (const numField of ['section_id', 'subject_id', 'teacher_id']) {
      if (numField in patch && patch[numField] !== null) {
        const check = coercePositiveId(patch[numField], numField);
        if (check.error) return res.status(400).json({ error: check.error });
        patch[numField] = check.value;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const merged = {
      ...existing,
      ...patch,
      day_of_week: normalizeDay(patch.day_of_week ?? existing.day_of_week),
    };

    if ('start_time' in patch || 'end_time' in patch) {
      const rangeErr = validateTimeRange(merged.start_time, merged.end_time);
      if (rangeErr) return res.status(400).json({ error: rangeErr });
    }

    if (
      'section_id' in patch ||
      'day_of_week' in patch ||
      'start_time' in patch ||
      'end_time' in patch
    ) {
      const secConflict = await Timetable.sectionConflict({
        section_id: merged.section_id,
        day_of_week: merged.day_of_week,
        start_time: merged.start_time,
        end_time: merged.end_time,
        except_id: id,
      });
      if (secConflict) {
        return res.status(409).json({
          error: 'Section already has a slot in that time range',
          conflict: secConflict,
        });
      }
    }

    if (
      merged.teacher_id &&
      ('teacher_id' in patch ||
        'day_of_week' in patch ||
        'start_time' in patch ||
        'end_time' in patch)
    ) {
      const teachConflict = await Timetable.teacherConflict({
        teacher_id: merged.teacher_id,
        day_of_week: merged.day_of_week,
        start_time: merged.start_time,
        end_time: merged.end_time,
        except_id: id,
      });
      if (teachConflict) {
        return res.status(409).json({
          error: 'Teacher is already booked in that time range',
          conflict: teachConflict,
        });
      }
    }

    await Timetable.update(id, patch);

    const updated = await Timetable.findById(id);
    if (!updated) return res.status(404).json({ error: 'Slot not found' });
    res.json(updated);
  } catch (err) {
    sendRouteError(res, 'update timetable', err);
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  try {
    const existing = await Timetable.findById(id);
    if (!existing) return res.status(404).json({ error: 'Slot not found' });
    await Timetable.remove(id);
    res.json({ ok: true });
  } catch (err) {
    sendRouteError(res, 'delete timetable slot', err);
  }
});

module.exports = router;
