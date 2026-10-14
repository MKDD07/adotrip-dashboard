import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

test('pricing updates linked demo budgets and payments without changing unrelated amounts or booking status',()=>{
 const sql=readFileSync('data/demo-prices.sql','utf8');
 const result=JSON.parse(execFileSync('python3',['-c',`import sqlite3,json,sys
c=sqlite3.connect(':memory:')
c.executescript("""
CREATE TABLE properties(id TEXT PRIMARY KEY,price INTEGER);
CREATE TABLE students(id TEXT PRIMARY KEY,budget INTEGER,notes TEXT);
CREATE TABLE leads(id TEXT PRIMARY KEY,student_id TEXT,property_id TEXT,status TEXT,created_at TEXT);
CREATE TABLE payments(id TEXT PRIMARY KEY,property_id TEXT,amount INTEGER,status TEXT);
CREATE TABLE followups(id TEXT PRIMARY KEY,outcome TEXT);
INSERT INTO properties VALUES('DEMO-PROP-001',14000);
INSERT INTO students VALUES('DEMO-STU-001',14500,'Budget ₹14500/month'),('REAL-STU',10000,'');
INSERT INTO leads VALUES('DEMO-LEAD-1','DEMO-STU-001','DEMO-PROP-001','Interested','2026-10-01');
INSERT INTO payments VALUES('DEMO-TXN-1','DEMO-PROP-001',5000,'Pending'),('DEMO-TXN-2','DEMO-PROP-001',14000,'Successful'),('REAL-TXN','DEMO-PROP-001',5000,'Pending');
INSERT INTO followups VALUES('DEMO-FU-1-01','Budget ₹14500');
""")
c.executescript(sys.stdin.read())
print(json.dumps({'price':c.execute('SELECT price FROM properties').fetchone()[0],'students':c.execute('SELECT * FROM students ORDER BY id').fetchall(),'payments':c.execute('SELECT * FROM payments ORDER BY id').fetchall(),'status':c.execute('SELECT status FROM leads').fetchone()[0]}))`],{input:sql,encoding:'utf8'}));
 assert.equal(result.price,307200);
 assert.deepEqual(result.students[0],['DEMO-STU-001',323000,'Budget ₹323000/month']);
 assert.equal(result.students[1][1],10000);
 assert.deepEqual(result.payments.map(row=>[row[0],row[2],row[3]]),[['DEMO-TXN-1',61440,'Pending'],['DEMO-TXN-2',307200,'Successful'],['REAL-TXN',5000,'Pending']]);
 assert.equal(result.status,'Interested');
});
