-- MCQ exam scheduling (auto-open / auto-close)
ALTER TABLE mcq_exams ADD COLUMN scheduled_start_at TEXT;
ALTER TABLE mcq_exams ADD COLUMN scheduled_end_at   TEXT;
ALTER TABLE mcq_exams ADD COLUMN schedule_state     TEXT
  CHECK (schedule_state IN ('draft','scheduled','open','closed')) DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_mcq_exams_schedule_state
  ON mcq_exams (schedule_state, scheduled_start_at, scheduled_end_at);

ALTER TABLE mcq_attempts ADD COLUMN exam_scheduled_start_at TEXT;
