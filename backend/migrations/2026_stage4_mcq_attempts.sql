ALTER TABLE mcq_exams ADD COLUMN is_published       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mcq_exams ADD COLUMN access_code        TEXT DEFAULT NULL;
ALTER TABLE mcq_exams ADD COLUMN time_limit_minutes INTEGER DEFAULT NULL;
ALTER TABLE mcq_exams ADD COLUMN proctoring_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS mcq_attempts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  mcq_exam_id        INTEGER NOT NULL,
  student_id         INTEGER NOT NULL,
  started_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_at       DATETIME,
  answers            TEXT,
  score              INTEGER DEFAULT 0,
  correct_count      INTEGER DEFAULT 0,
  wrong_count        INTEGER DEFAULT 0,
  blank_count        INTEGER DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'in_progress',
  time_limit_seconds INTEGER,
  total_questions    INTEGER,
  flagged_count      INTEGER DEFAULT 0,
  reviewed_by        INTEGER,
  reviewed_at        DATETIME,
  review_note        TEXT,
  UNIQUE (mcq_exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_exam    ON mcq_attempts(mcq_exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON mcq_attempts(student_id);

CREATE TABLE IF NOT EXISTS proctoring_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT,
  at         DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_proctor_attempt ON proctoring_events(attempt_id);
CREATE INDEX IF NOT EXISTS idx_proctor_kind    ON proctoring_events(kind);

CREATE TABLE IF NOT EXISTS proctoring_recordings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL,
  seq        INTEGER NOT NULL,
  file_url   TEXT NOT NULL,
  size_bytes INTEGER,
  mime_type  TEXT DEFAULT 'video/webm',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (attempt_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_proctor_rec_attempt ON proctoring_recordings(attempt_id, seq);
