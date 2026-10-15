import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {webcrypto,createHash} from 'node:crypto';
import worker from '../worker/index.mjs';
import {database} from './helpers/d1.mjs';
globalThis.crypto ||= webcrypto;

test('only admins can archive, restore or purge; archived records leave active views and remain intact until purged',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'student-archive-')),file=join(directory,'db.sqlite');
 try{
  execFileSync('sqlite3',[file],{input:readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort().map(n=>readFileSync('migrations/'+n,'utf8')).join('\n')});
  const DB=database(file),objects=new Map(),env={DB,ASSETS:{fetch:async()=>new Response('asset')},MEDIA:{async put(key,bytes){objects.set(key,bytes)},async delete(key){objects.delete(key)},async get(){return null}}};
  for(const role of ['admin','agent']){
   await DB.prepare('INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,0)').bind(role,role,role+'@example.com','fixture',role).run();
   await DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update((role==='admin'?'a':'b').repeat(64)).digest('hex'),role,Date.now()+3600000).run();
  }
  const call=(role,path,method='GET',body)=>worker.fetch(new Request('https://crm.example'+path,{method,headers:{Cookie:'crm_session='+(role==='admin'?'a':'b').repeat(64),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
  const student=await (await call('admin','/api/students','POST',{name:'Archive Person',mobile:'000001',budget:239000,image_data:'data:image/jpeg;base64,/9j/2Q=='})).json(),path='/api/students/'+student.id;
  const saved=await DB.prepare('SELECT * FROM students WHERE id=?').bind(student.id).first();
  const lead=await (await call('admin','/api/leads','POST',{student_id:student.id,status:'Interested'})).json();
  await call('admin','/api/followups','POST',{student_id:student.id,purpose:'Callback',starts_at:new Date().toISOString(),priority:'High'});
  await call('admin','/api/payments','POST',{student_id:student.id,amount:23900,status:'Pending'});
  assert.equal((await call('admin',path+'/permanent','DELETE')).status,409);
  for(const [p,method,body] of [[path,'DELETE'],[path+'/permanent','DELETE'],[path+'/restore','POST',{}],['/api/students/archive','GET']])assert.equal((await call('agent',p,method,body)).status,403);
  assert.equal((await call('admin',path,'DELETE')).status,200);
  assert.equal(objects.has('students/'+student.id),true);
  const archived=await DB.prepare('SELECT * FROM students WHERE id=?').bind(student.id).first();
  assert.ok(archived.archived_at);assert.equal(archived.archived_by,'admin');assert.equal(archived.student_code,saved.student_code);
  for(const role of ['admin','agent']){
   for(const endpoint of ['/api/state','/api/export']){
    const state=await (await call(role,endpoint)).json();
    assert.equal(state.students.some(s=>s.id===student.id),false);
    for(const table of ['leads','followups','payments'])assert.equal(state[table].some(row=>row.student_id===student.id),false);
   }
   const feed=await (await call(role,'/api/notifications')).json();assert.equal(feed.notifications.some(n=>n.studentId===student.id),false);
  }
  assert.equal((await call('agent',path,'PATCH',{status:'Contacted'})).status,404);
  assert.equal((await call('agent','/api/leads/'+lead.id,'PATCH',{status:'Contacted'})).status,404);
  assert.equal((await call('agent','/api/payments','POST',{student_id:student.id,amount:100,status:'Successful'})).status,404);
  const archive=await (await call('admin','/api/students/archive')).json();
  assert.equal(archive.students.length,1);assert.equal(archive.students[0].student_code,saved.student_code);
  assert.equal(archive.students[0].lead_count,1);assert.equal(archive.students[0].followup_count,1);assert.equal(archive.students[0].payment_count,1);
  assert.equal((await call('admin',path+'/restore','POST',{})).status,200);
  const restored=await (await call('agent','/api/state')).json();assert.equal(restored.students[0].student_code,saved.student_code);assert.equal(restored.leads.length,1);assert.equal(restored.payments.length,1);
  // A restore racing with a purge must roll back linked-record deletion as well.
  await assert.rejects(DB.batch([DB.prepare('DELETE FROM payments WHERE student_id=?').bind(student.id),DB.prepare('DELETE FROM students WHERE id=?').bind(student.id)]));
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM payments WHERE student_id=?').bind(student.id).first()).count,1);
  assert.equal((await call('admin',path,'DELETE')).status,200);
  assert.equal((await call('admin',path+'/permanent','DELETE')).status,200);
  assert.equal(await DB.prepare('SELECT id FROM students WHERE id=?').bind(student.id).first(),null);
  for(const table of ['leads','followups','payments'])assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM '+table+' WHERE student_id=?').bind(student.id).first()).count,0);
  assert.equal(objects.has('students/'+student.id),false);
  assert.equal((await (await call('admin','/api/students/archive')).json()).students.length,0);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
