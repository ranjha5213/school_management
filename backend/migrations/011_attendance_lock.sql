ALTER TABLE attendance ADD COLUMN marked_at DATETIME;
UPDATE attendance SET marked_at = CURRENT_TIMESTAMP WHERE marked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_date_student ON attendance(date, student_id);
