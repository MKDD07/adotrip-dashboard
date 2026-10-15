CREATE TABLE student_documents (
 id TEXT PRIMARY KEY,
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 document_type TEXT NOT NULL,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL,
 r2_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('Pending','Approved','Rejected','Superseded')),
 uploaded_by TEXT NOT NULL,
 uploaded_by_name TEXT NOT NULL,
 created_at TEXT NOT NULL,
 reviewed_by TEXT,
 reviewed_by_name TEXT,
 reviewed_at TEXT,
 review_note TEXT
);
CREATE INDEX student_document_student ON student_documents(student_id,document_type,created_at DESC);
CREATE UNIQUE INDEX student_document_pending ON student_documents(student_id,document_type) WHERE state='Pending';
CREATE UNIQUE INDEX student_document_approved ON student_documents(student_id,document_type) WHERE state='Approved';
CREATE TABLE student_document_requirements (
 student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 document_type TEXT NOT NULL,
 required INTEGER NOT NULL CHECK(required IN (0,1)),
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(student_id,document_type)
);
