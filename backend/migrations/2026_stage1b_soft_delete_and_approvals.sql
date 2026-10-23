
-- Soft-delete / supersede support for attendance
ALTER TABLE attendance ADD COLUMN superseded_by INTEGER;
ALTER TABLE attendance ADD COLUMN superseded_at DATETIME;

-- Polymorphic approvals table (used by timetable, notices, and later features)
CREATE TABLE IF NOT EXISTS approvals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT    NOT NULL,                       -- 'timetable' | 'notice' | ...
  action        TEXT    NOT NULL,                       -- 'create' | 'update' | 'delete'
  resource_id   INTEGER,                                -- null for 'create'
  payload       TEXT,                                   -- JSON of proposed values
  status        TEXT    NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
  requested_by  INTEGER NOT NULL,
  requested_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by   INTEGER,
  reviewed_at   DATETIME,
  review_note   TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_status  ON approvals(status, resource_type);
CREATE INDEX IF NOT EXISTS idx_approvals_req     ON approvals(requested_by, status);
