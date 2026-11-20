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

// ─── CUSTOM ROUTES (Must be above /:id) ───

// Weekly grid for one section
router.get('/section/:sectionId/weekly', async (req, res) => {
  try {
    const rows = await Timetable.weeklyForSection(req.params.sectionId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full grid for a day (all sections)
router.get('/grid/:day', async (req, res) => {
  try {
    const data = await Timetable.gridForDay(req.params.day);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher load
router.get('/teacher-load', async (req, res) => {
  try {
    const data = await Timetable.teacherLoad(req.query.day || null);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk upsert for one day
router.post('/bulk', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries[] required' });
    }
    const result = await Timetable.bulkUpsert(entries);
    res.json(result);
  } catch (err) {
    console.error('bulkUpsert:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch subjects for a specific section
router.get('/subjects/:sectionId', async (req, res) => {
  try {
    const subjects = await Timetable.subjectsForSection(req.params.sectionId);
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch teachers for a specific section
router.get('/teachers/:sectionId', async (req, res) => {
  try {
    const teachers = await Timetable.teachersForSection(req.params.sectionId);
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STANDARD CRUD ROUTES ───

// LIST (with optional filters)
router.get('/', async (req, res) => {
  try {
    const { section_id, class_id, teacher_id, day } = req.query;
    const slots = await Timetable.list({ section_id, class_id, teacher_id, day });
    res.json(slots);
  } catch (err) {
    console.error('list timetable:', err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE (with conflict checks)
router.post('/', async (req, res) => {
  try {
    const { section_id, subject_id, teacher_id, day_of_week, start_time, end_time } = req.body;

    if (!section_id || !subject_id || !day_of_week || !start_time || !end_time) {
      return res.status(400).json({
        error: 'section_id, subject_id, day_of_week, start_time, end_time are required',
      });
    }

    const secConflict = await Timetable.sectionConflict({
      section_id, day_of_week, start_time, end_time,
    });
    if (secConflict) {
      return res.status(409).json({
        error: 'Section already has a slot in that time range',
        conflict: secConflict,
      });
    }

    if (teacher_id) {
      const teachConflict = await Timetable.teacherConflict({
        teacher_id, day_of_week, start_time, end_time,
      });
      if (teachConflict) {
        return res.status(409).json({
          error: 'Teacher is already booked in that time range',
          conflict: teachConflict,
        });
      }
    }

    const result = await Timetable.create({
      section_id, subject_id, teacher_id, day_of_week, start_time, end_time,
    });
    res.status(201).json({ ...req.body, id: result.lastID ?? result.id });
  } catch (err) {
    console.error('create timetable:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET ONE (MUST BE BELOW CUSTOM ROUTES)
router.get('/:id', async (req, res) => {
  try {
    const slot = await Timetable.findById(req.params.id);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    res.json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE (with conflict checks, excluding self)
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await Timetable.findById(id);
    if (!existing) return res.status(404).json({ error: 'Slot not found' });

    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => ALLOWED_FIELDS.includes(key))
    );

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const merged = { ...existing, ...patch };

    if (patch.section_id || patch.day_of_week || patch.start_time || patch.end_time) {
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

    if (merged.teacher_id) {
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
    console.error('update timetable:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const existing = await Timetable.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Slot not found' });
    await Timetable.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

