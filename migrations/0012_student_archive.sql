ALTER TABLE students ADD COLUMN archived_at TEXT;
ALTER TABLE students ADD COLUMN archived_by TEXT;
CREATE INDEX students_archive_idx ON students(archived_at);

-- Also protect against a restore racing with permanent deletion.
CREATE TRIGGER students_require_archive_before_delete BEFORE DELETE ON students
WHEN OLD.archived_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Archive the student before permanent deletion');
END;
