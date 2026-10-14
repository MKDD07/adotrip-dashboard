import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import worker from '../worker/index.mjs';
import {calendarReminders} from '../worker/notifications.mjs';
import {database} from './helpers/d1.mjs';
globalThis.crypto ||= webcrypto;
test('calendar reminders start two days before, use India dates and disappear after completion',()=>{
 const tasks=[{id:'due',student_id:'S',student_name:'Aditi',purpose:'Callback',priority:'High',status:'Pending',starts_at:'2026-10-16T10:00'},
 {id:'future',status:'Pending',starts_at:'2026-10-17T10:00'},
 {id:'past',status:'Pending',starts_at:'2026-10-13T10:00'},
 {id:'done',status:'Done',starts_at:'2026-10-15T10:00'},
 {id:'today',status:'Pending',starts_at:'2026-10-13T20:00:00Z'}];
 const reminders=calendarReminders(tasks,new Date('2026-10-13T23:00:00Z'));
 assert.equal(reminders.length,2);assert.equal(reminders[0].time,'In 2 days');assert.equal(reminders[0].priority,'urgent');assert.equal(reminders[1].time,'Today');
 tasks[0].status='Done';assert.equal(calendarReminders(tasks,new Date('2026-10-14')).length,1);
});
test('real activity reaches other users and read/dismiss state persists separately per account',async()=>{
 const root=mkdtempSync(join(tmpdir(),'crm-notifications-')),file=join(root,'db.sqlite');
 try{
  execFileSync('sqlite3',[file],{input:readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('migrations/'+f,'utf8')).join('\n')});
  const db=database(file),env={DB:db};
  const cookies={};
  for(const [id,name,token] of [['alice','Alice','a'.repeat(64)],['bob','Bob','b'.repeat(64)]]){
   await db.prepare('INSERT INTO auth_users(id,name,email,password_hash,must_change_password) VALUES(?,?,?,?,0)').bind(id,name,id+'@example.com','test-only').run();
   const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
   await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(hash,id,Date.now()+3600000).run();cookies[id]='crm_session='+token;
  }
  const call=(user,path,method='GET',body)=>worker.fetch(new Request('https://crm.example'+path,{method,headers:{Cookie:cookies[user],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
  assert.deepEqual((await (await call('bob','/api/notifications')).json()).notifications,[]);
  const demo=await (await call('alice','/api/students','POST',{name:'Mock Person',mobile:'999-demo',profile:{is_demo:true}})).json();await call('alice','/api/followups','POST',{student_id:demo.id,starts_at:new Date().toISOString(),purpose:'Callback',priority:'High'});assert.deepEqual((await (await call('bob','/api/notifications')).json()).notifications,[]);
  const student=await (await call('alice','/api/students','POST',{name:'Aditi',mobile:'00000'})).json();
  assert.equal((await call('alice','/api/students','POST',{name:'Duplicate',mobile:'00000'})).status,409);
  let feed=(await (await call('bob','/api/notifications')).json()).notifications;
  assert.equal(feed.length,1);assert.equal(feed[0].actorId,'alice');assert.equal(feed[0].actorName,'Alice');assert.match(feed[0].message,/Alice · Aditi/);assert.equal(feed[0].studentId,student.id);assert.equal(feed[0].unread,true);
  const eventId=feed[0].id;
  await call('bob','/api/notifications/read','POST',{ids:[eventId]});
  assert.equal((await (await call('bob','/api/notifications')).json()).notifications[0].unread,false);
  assert.equal((await (await call('alice','/api/notifications')).json()).notifications[0].unread,true);
  const followup=await (await call('alice','/api/followups','POST',{student_id:student.id,starts_at:new Date(Date.now()+2*86400000).toISOString(),purpose:'Callback',priority:'High'})).json();
  feed=(await (await call('bob','/api/notifications')).json()).notifications;
  assert.ok(feed.some(n=>n.id.startsWith('reminder:'+followup.id)));assert.ok(feed.some(n=>n.title==='Follow-up created'));
  await call('alice','/api/followups/'+followup.id,'PATCH',{status:'Done',outcome:'Completed'});
  await call('alice','/api/students/'+student.id,'PATCH',{status:'Contacted'});
  feed=(await (await call('bob','/api/notifications')).json()).notifications;
  assert.ok(!feed.some(n=>n.id.startsWith('reminder:'+followup.id)));assert.ok(feed.some(n=>n.title==='Student updated'&&n.message.includes('Contacted')));
  await call('bob','/api/notifications/dismiss','POST',{ids:[eventId]});
  assert.ok(!(await (await call('bob','/api/notifications')).json()).notifications.some(n=>n.id===eventId));
  await call('bob','/api/notifications/read-all','POST',{});
  assert.ok((await (await call('bob','/api/notifications')).json()).notifications.every(n=>!n.unread));
  assert.ok((await (await call('alice','/api/notifications')).json()).notifications.some(n=>n.unread));
  await call('bob','/api/notifications/clear-read','POST',{});
  assert.deepEqual((await (await call('bob','/api/notifications')).json()).notifications,[]);
  assert.equal((await worker.fetch(new Request('https://crm.example/api/notifications'),env)).status,401);
  assert.equal((await call('bob','/api/notifications/read','POST',{ids:'invalid'})).status,400);
 }finally{rmSync(root,{recursive:true,force:true})}
});
