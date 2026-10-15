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

test('members propose status drafts, only admins finalize and every proposal or decision generates a notification',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'status-approvals-')),file=join(directory,'db.sqlite');
 try{
  execFileSync('sqlite3',[file],{input:readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort().map(n=>readFileSync('migrations/'+n,'utf8')).join('\n')});
  const DB=database(file),env={DB},tokens={admin:'a'.repeat(64),agent:'b'.repeat(64)};
  for(const role of ['admin','agent']){
   await DB.prepare('INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,0)').bind(role,role,role+'@example.com','fixture',role).run();
   await DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(tokens[role]).digest('hex'),role,Date.now()+3600000).run();
  }
  const call=(role,path,method='GET',body)=>worker.fetch(new Request('https://crm.example'+path,{method,headers:{Cookie:'crm_session='+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
  const state=async()=> (await call('admin','/api/state')).json();
  const student=await (await call('admin','/api/students','POST',{name:'Review Person',mobile:'review-person'})).json();
  const property=await (await call('admin','/api/properties','POST',{name:'Review apartment',location:'London',price:239000})).json();
  const lead=await (await call('admin','/api/leads','POST',{student_id:student.id,property_id:property.id,status:'New Lead'})).json();
  const path='/api/students/'+student.id;
  let response=await call('agent',path,'PATCH',{status:'Converted'});assert.equal(response.status,200);assert.equal((await response.json()).draft,true);
  let current=await state();assert.equal(current.students[0].status,'New Lead');assert.equal(current.leads[0].status,'New Lead');assert.equal(current.status_requests.length,1);
  const request=current.status_requests[0];
  await call('agent',path,'PATCH',{status:'Converted'});assert.equal((await state()).status_requests.length,1);
  let feed=(await (await call('admin','/api/notifications')).json()).notifications;
  assert.ok(feed.some(n=>n.title==='Status draft submitted'&&n.statusRequestId===request.id&&n.statusRequestState==='Pending'&&n.priority==='normal'&&n.message.includes('New Lead → Converted')));
  assert.equal((await call('agent','/api/status-requests/'+request.id+'/approve','POST',{})).status,403);
  assert.equal((await call('agent','/api/status-requests/'+request.id+'/reject','POST',{})).status,403);
  await call('agent','/api/leads/'+lead.id,'PATCH',{status:'Lost'});assert.equal((await state()).leads[0].status,'New Lead');
  response=await call('admin','/api/status-requests/'+request.id+'/approve','POST',{});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  current=await state();assert.equal(current.students[0].status,'Converted');assert.equal(current.leads[0].status,'Converted');assert.equal(current.status_requests.length,0);
  assert.equal((await call('admin','/api/status-requests/'+request.id+'/approve','POST',{})).status,409);
  feed=(await (await call('agent','/api/notifications')).json()).notifications;assert.ok(feed.some(n=>n.title==='Status finalized'&&n.message.includes('New Lead → Converted')));assert.ok(!feed.some(n=>n.title==='Status draft submitted'));
  await call('agent',path,'PATCH',{status:'Lost'});let pending=(await state()).status_requests[0];
  assert.equal((await call('admin','/api/status-requests/'+pending.id+'/reject','POST',{})).status,200);assert.equal((await state()).students[0].status,'Converted');
  feed=(await (await call('agent','/api/notifications')).json()).notifications;assert.ok(feed.some(n=>n.title==='Status draft rejected'&&n.message.includes('Converted → Lost')));
  assert.equal((await call('admin',path,'PATCH',{status:'Contacted'})).status,200);assert.equal((await state()).students[0].status,'Contacted');
  await call('agent',path,'PATCH',{status:'Interested'});pending=(await state()).status_requests[0];
  const outcomes=await Promise.all([call('admin','/api/status-requests/'+pending.id+'/approve','POST',{}),call('admin','/api/status-requests/'+pending.id+'/reject','POST',{})]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  const created=await (await call('agent','/api/students','POST',{name:'Member-created',mobile:'member-created',status:'Converted'})).json();
  current=await state();assert.equal(current.students.find(s=>s.id===created.id).status,'New Lead');assert.ok(current.status_requests.some(r=>r.student_id===created.id&&r.proposed_status==='Converted'));
  await call('agent','/api/students/import','POST',{rows:[{name:'Imported',mobile:'imported-person',status:'Converted'}]});
  current=await state();const imported=current.students.find(s=>s.mobile==='imported-person');assert.equal(imported.status,'New Lead');assert.ok(current.status_requests.some(r=>r.student_id===imported.id));
  await call('agent','/api/payments','POST',{student_id:created.id,property_id:property.id,amount:100,status:'Successful'});assert.equal((await state()).students.find(s=>s.id===created.id).status,'New Lead');
  const extra=await (await call('agent','/api/leads','POST',{student_id:created.id,property_id:property.id,status:'Converted'})).json();current=await state();assert.equal(current.leads.find(l=>l.id===extra.id).status,'New Lead');assert.equal(current.students.find(s=>s.id===created.id).status,'New Lead');
  // Explicit status edits to demo students also appear in the notification bar.
  const demo=await (await call('admin','/api/students','POST',{name:'Demo status',mobile:'demo-status',profile:{is_demo:true}})).json();
  await call('agent','/api/students/'+demo.id,'PATCH',{status:'Contacted'});feed=(await (await call('admin','/api/notifications')).json()).notifications;assert.ok(feed.some(n=>n.studentId===demo.id&&n.title==='Status draft submitted'));
  await call('admin','/api/students/'+created.id,'DELETE');assert.equal((await state()).status_requests.some(r=>r.student_id===created.id),false);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test('status controls show member drafts and admin review actions while the header reflects the approved status',async()=>{
 const vm=await import('node:vm'),nodes=new Map();
 const el=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',hidden:false,dataset:{},style:{},attributes:{},setAttribute(name,value){this.attributes[name]=value},classList:{add(){},remove(){},toggle(){},contains(){return true}},addEventListener(){}});return nodes.get(selector)};
 const context=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},window:{},staticPreview:true,URLSearchParams,setTimeout,console});
 vm.runInContext(readFileSync('app.js','utf8'),context);
 context.fixture={students:[{id:'S1',name:'Review Student',status:'Interested',budget:239000}],properties:[],leads:[],payments:[],followups:[],status_requests:[{id:'R1',entity:'students',record_id:'S1',student_id:'S1',from_status:'Interested',proposed_status:'Converted',state:'Pending',requested_by:'agent',requested_by_name:'Agent'}]};
 vm.runInContext("data=fixture;selectedStudentId='S1';signedInUser={id:'agent',name:'Agent',role:'agent'};renderStudentProfile()",context);
 assert.match(el('#profileBody').innerHTML,/Submit draft/);assert.doesNotMatch(el('#profileBody').innerHTML,/data-status-decision/);assert.match(el('#profileBody').innerHTML,/awaiting approval/);assert.equal(el('#studentProfileHeader').attributes['data-status'],'Interested');
 vm.runInContext("signedInUser={id:'admin',name:'Admin',role:'admin'};renderStudentProfile()",context);
 assert.match(el('#profileBody').innerHTML,/Finalize status/);assert.match(el('#profileBody').innerHTML,/data-status-decision="approve"/);assert.match(el('#profileBody').innerHTML,/data-status-decision="reject"/);
 vm.runInContext("notifications=[{id:'N1',actorId:'agent',actorName:'Agent',title:'Status draft submitted',message:'Interested → Converted',unread:true,statusRequestId:'R1',statusRequestState:'Pending'}];renderNotifications()",context);
 assert.match(el('#notificationList').innerHTML,/data-status-decision="approve"/);
 vm.runInContext("signedInUser.role='agent';renderNotifications();data.students[0].status='Converted';updateStudentProgress(data.students[0])",context);
 assert.doesNotMatch(el('#notificationList').innerHTML,/data-status-decision/);assert.equal(el('#studentProfileHeader').attributes['data-status'],'Converted');
});
