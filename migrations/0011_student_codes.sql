-- Stable student references, numbered separately for each enquiry year in India time.
ALTER TABLE students ADD COLUMN student_code TEXT;
CREATE UNIQUE INDEX students_code_unique ON students(student_code);
CREATE TABLE student_code_sequences (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL CHECK(last_number > 0)
);

WITH ranked AS (
  SELECT id,
    CAST(COALESCE(strftime('%Y', created_at, '+5 hours', '+30 minutes'), strftime('%Y', 'now', '+5 hours', '+30 minutes')) AS INTEGER) AS year,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(strftime('%Y', created_at, '+5 hours', '+30 minutes'), strftime('%Y', 'now', '+5 hours', '+30 minutes'))
      ORDER BY julianday(created_at), id
    ) AS sequence
  FROM students
)
UPDATE students SET student_code = (
  SELECT printf('ADO%02d-%03d', year % 100, sequence) FROM ranked WHERE ranked.id = students.id
);

INSERT INTO student_code_sequences(year, last_number)
SELECT CAST(COALESCE(strftime('%Y', created_at, '+5 hours', '+30 minutes'), strftime('%Y', 'now', '+5 hours', '+30 minutes')) AS INTEGER), COUNT(*)
FROM students GROUP BY 1;

-- SQLite serializes these writes, including concurrent app requests and CSV imports.
-- Keep counters after deletions so an issued reference is never reused.
CREATE TRIGGER students_assign_code AFTER INSERT ON students
WHEN NEW.student_code IS NULL
BEGIN
  INSERT INTO student_code_sequences(year, last_number)
  VALUES(CAST(COALESCE(strftime('%Y', NEW.created_at, '+5 hours', '+30 minutes'), strftime('%Y', 'now', '+5 hours', '+30 minutes')) AS INTEGER), 1)
  ON CONFLICT(year) DO UPDATE SET last_number = last_number + 1;

  UPDATE students SET student_code = (
    SELECT printf('ADO%02d-%03d', year % 100, last_number)
    FROM student_code_sequences
    WHERE year = CAST(COALESCE(strftime('%Y', NEW.created_at, '+5 hours', '+30 minutes'), strftime('%Y', 'now', '+5 hours', '+30 minutes')) AS INTEGER)
  ) WHERE id = NEW.id;
END;
