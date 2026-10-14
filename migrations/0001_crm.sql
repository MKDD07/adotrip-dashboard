PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,name TEXT NOT NULL,mobile TEXT NOT NULL UNIQUE,email TEXT UNIQUE,city TEXT,course TEXT,budget INTEGER DEFAULT 0,agent TEXT,status TEXT DEFAULT 'New Lead',notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS properties(id TEXT PRIMARY KEY,name TEXT NOT NULL,location TEXT NOT NULL,price INTEGER NOT NULL,type TEXT,rooms INTEGER DEFAULT 0,amenities TEXT,image TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,property_id TEXT,status TEXT,followup TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS followups(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,starts_at TEXT NOT NULL,purpose TEXT,priority TEXT,status TEXT DEFAULT 'Pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,property_id TEXT,amount INTEGER NOT NULL,status TEXT,booking TEXT,paid_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS leads_student_idx ON leads(student_id);
CREATE INDEX IF NOT EXISTS followups_student_idx ON followups(student_id, starts_at);
CREATE INDEX IF NOT EXISTS payments_student_idx ON payments(student_id);
