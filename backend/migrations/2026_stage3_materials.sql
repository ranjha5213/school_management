-- Stage 3: materials (lectures, notices, assignments, other)
CREATE TABLE IF NOT EXISTS materials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  description   TEXT,
  kind          TEXT NOT NULL DEFAULT 'other',   -- lecture | notice | assignment | other
  class_id      INTEGER,
  section_id    INTEGER,
  subject_id    INTEGER,
  file_url      TEXT NOT NULL,
  original_name TEXT,
  mime_type     TEXT,
  size_bytes    INTEGER,
  uploaded_by   INTEGER NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_materials_kind     ON materials(kind);
CREATE INDEX IF NOT EXISTS idx_materials_class    ON materials(class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_materials_uploader ON materials(uploaded_by);
