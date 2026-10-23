-- Homework: track who created it and when (already created_at exists)
-- Add updated_at + updated_by to track edits.
ALTER TABLE homework ADD COLUMN updated_at DATETIME;
ALTER TABLE homework ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Submissions: track grader + graded_at
ALTER TABLE homework_submissions ADD COLUMN graded_at DATETIME;
ALTER TABLE homework_submissions ADD COLUMN graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE homework_submissions ADD COLUMN grade VARCHAR(20);
