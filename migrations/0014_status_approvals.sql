CREATE TABLE status_requests (
 id TEXT PRIMARY KEY,
 entity TEXT NOT NULL CHECK(entity IN ('students','leads')),
 record_id TEXT NOT NULL,
 student_id TEXT NOT NULL,
 from_status TEXT NOT NULL,
 proposed_status TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'Pending' CHECK(state IN ('Pending','Approved','Rejected','Superseded')),
 requested_by TEXT NOT NULL,
 requested_by_name TEXT NOT NULL,
 created_at TEXT NOT NULL,
 decided_by TEXT,
 decided_by_name TEXT,
 decided_at TEXT,
 decision_token TEXT
);
CREATE UNIQUE INDEX status_request_pending_author ON status_requests(entity,record_id,requested_by) WHERE state='Pending';
CREATE INDEX status_request_student ON status_requests(student_id,state,created_at);
ALTER TABLE crm_activity ADD COLUMN status_request_id TEXT;
