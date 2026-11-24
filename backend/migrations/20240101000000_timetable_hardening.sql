BEGIN;

-- 1. Teacher ↔ class relationship (fixes "no such table: teacher_classes")
CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_tc_class ON teacher_classes(class_id);

-- 3. Rebuild timetables with strict time/day CHECKs + normalize to HH:MM:SS
CREATE TABLE timetables_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES sections(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id INTEGER REFERENCES teachers(id),
  day_of_week TEXT NOT NULL CHECK (day_of_week IN
    ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'),
  end_time   TEXT NOT NULL CHECK (end_time   GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'),
  is_active INTEGER NOT NULL DEFAULT 1,
  CHECK (start_time < end_time)
);

INSERT INTO timetables_new
  (id, section_id, subject_id, teacher_id, day_of_week,
   start_time, end_time, is_active)
SELECT
  id, section_id, subject_id, teacher_id, lower(day_of_week),
  CASE WHEN length(start_time) = 5 THEN start_time || ':00'
       WHEN length(start_time) = 8 THEN start_time
       ELSE start_time END,
  CASE WHEN length(end_time) = 5 THEN end_time || ':00'
       WHEN length(end_time) = 8 THEN end_time
       ELSE end_time END,
  is_active
FROM timetables;

DROP TABLE timetables;
ALTER TABLE timetables_new RENAME TO timetables;

CREATE INDEX IF NOT EXISTS idx_tt_section_day
  ON timetables(section_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_tt_teacher_day
  ON timetables(teacher_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_tt_active
  ON timetables(is_active, day_of_week, start_time);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tt_section_slot_active
  ON timetables(section_id, day_of_week, start_time)
  WHERE is_active = 1;

COMMIT;
