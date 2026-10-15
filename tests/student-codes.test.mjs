import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('student references backfill by enquiry year, allocate on insert and never reuse deleted numbers',()=>{
 const script=`import sqlite3,json,sys
c=sqlite3.connect(':memory:')
c.executescript("""CREATE TABLE students(id TEXT PRIMARY KEY,name TEXT,mobile TEXT UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT INTO students VALUES('old-b','B','2','2024-10-02');
INSERT INTO students VALUES('old-a','A','1','2024-10-01');
INSERT INTO students VALUES('last-year','C','3','2025-10-01');
INSERT INTO students VALUES('india-new-year','D','4','2025-12-31T20:00:00Z');""")
c.executescript(sys.stdin.read())
initial=dict(c.execute('SELECT id,student_code FROM students'))
def add(id,mobile,date):
 c.execute('INSERT INTO students(id,mobile,created_at) VALUES(?,?,?)',(id,mobile,date))
 return c.execute('SELECT student_code FROM students WHERE id=?',(id,)).fetchone()[0]
next_code=add('next','5','2024-01-01')
c.execute("DELETE FROM students WHERE id='next'")
after_delete=add('after-delete','6','2024-11-01')
try: add('duplicate','6','2024-11-01')
except sqlite3.IntegrityError: pass
after_failure=add('after-failure','7','2024-11-01')
c.execute('UPDATE student_code_sequences SET last_number=999 WHERE year=2024')
over_999=add('over-999','8','2024-11-01')
print(json.dumps(dict(initial=initial,next_code=next_code,after_delete=after_delete,after_failure=after_failure,over_999=over_999)))`;
 const result=JSON.parse(execFileSync('python3',['-c',script],{input:readFileSync('migrations/0011_student_codes.sql','utf8'),encoding:'utf8'}));
 assert.deepEqual(result.initial,{'old-a':'ADO24-001','old-b':'ADO24-002','last-year':'ADO25-001','india-new-year':'ADO26-001'});
 assert.equal(result.next_code,'ADO24-003');
 assert.equal(result.after_delete,'ADO24-004');
 assert.equal(result.after_failure,'ADO24-005');
 assert.equal(result.over_999,'ADO24-1000');
});

test('the same stored reference appears in overview, recent enquiries, schedule and searchable pipeline',async()=>{
 const vm=await import('node:vm');
 const nodes=new Map();
 const el=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',hidden:false,dataset:{},style:{},setAttribute(){},classList:{add(){},remove(){},toggle(){}},addEventListener(){}});
  return nodes.get(selector);
 };
 const context=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},window:{},staticPreview:true,URLSearchParams,setTimeout,console});
 vm.runInContext(readFileSync('app.js','utf8'),context);
 context.fixture={students:[{id:'internal-student',student_code:'ADO26-012',name:'Test Student',status:'Interested',created_at:new Date().toISOString()}],properties:[],payments:[],leads:[{id:'L1',student_id:'internal-student',status:'Interested'}],followups:[{id:'F1',student_id:'internal-student',status:'Pending',purpose:'Callback',starts_at:new Date().toISOString()}]};
 vm.runInContext("data=fixture;selectedStudentId='internal-student';renderStats();renderLeads();renderTodaySchedule();renderStudentProfile()",context);
 for(const selector of ['#recentStudents','#kanban','#todaySchedule'])assert.match(el(selector).innerHTML,/ADO26-012/);
 assert.match(el('#profileSubtitle').textContent,/ADO26-012/);
 assert.doesNotMatch(el('#profileSubtitle').textContent,/internal-student/);
 el('#pipelineSearch').value='ado26-012';vm.runInContext('renderLeads()',context);
 assert.match(el('#kanban').innerHTML,/Test Student/);
});
