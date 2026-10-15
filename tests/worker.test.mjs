import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import worker from '../worker/index.mjs';
globalThis.crypto ||= webcrypto;
const python = `import sqlite3,json,sys
x=json.load(sys.stdin)
c=sqlite3.connect(x['file']);c.row_factory=sqlite3.Row
with c:
 if 'schema' in x:c.executescript(x['schema']);r=[]
 else:
  r=[]
  for s in x['statements']:
   q=c.execute(s['sql'],s['values']);r.append({'results':[dict(a) for a in q.fetchall()] if q.description else [],'success':True})
print(json.dumps(r))`;
function database(file) {
 const execute = statements => JSON.parse(execFileSync('python3',['-c',python],{input:JSON.stringify({file,statements}),encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 const db={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this},async first(){return execute([this])[0].results[0]||null},async run(){return execute([this])[0]}}},async batch(statements){return execute(statements)}};return db;
}
const call = (env,path,method='GET',body) => worker.fetch(new Request(`https://crm.example${path}`,{method,headers:{'Content-Type':'application/json','Cookie':'crm_session='+ 'a'.repeat(64)},...(body?{body:JSON.stringify(body)}:{})}),env);
test('D1 routes persist profiles, status, follow-up outcomes and payments',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'campus-d1-')),file=join(dir,'test.db');
 try {
  execFileSync('python3',['-c',python],{input:JSON.stringify({file,schema:readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort().map(name=>readFileSync('migrations/'+name,'utf8')).join('\n')})});
  const objects=new Map(),MEDIA={async put(key,bytes,options){objects.set(key,{bytes:new Uint8Array(bytes),mime:options.httpMetadata.contentType})},async get(key){const object=objects.get(key);return object?{body:object.bytes,httpEtag:'"mock-etag"',writeHttpMetadata(headers){headers.set('Content-Type',object.mime)}}:null},async delete(key){objects.delete(key)}};
  const env={DB:database(file),MEDIA,ASSETS:{fetch:async()=>new Response('asset')}};
  const token=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('a'.repeat(64)))).toString('hex');
  await env.DB.prepare("INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES('fixture','Fixture','fixture@example.com','test-only','admin',0)").run();await env.DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(token,'fixture',Date.now()+3600000).run();
  const student=await (await call(env,'/api/students','POST',{name:"O'Connor",mobile:'9876543210',status:'Contacted',notes:'Needs a studio'})).json();
  assert.ok(student.id.startsWith('STU-'));
  const duplicate=await call(env,'/api/students','POST',{name:'Duplicate',mobile:'9876543210'});assert.equal(duplicate.status,409);
  const property=await (await call(env,'/api/properties','POST',{name:'Studio',location:'Delhi',price:15000})).json();
  const lead=await call(env,'/api/leads','POST',{student_id:student.id,property_id:property.id,status:'Interested'});assert.equal(lead.status,201);
  const followup=await (await call(env,'/api/followups','POST',{student_id:student.id,starts_at:'2026-10-14T14:30',purpose:'Callback',priority:'High'})).json();
  assert.equal((await call(env,`/api/followups/${followup.id}`,'PATCH',{status:'Done'})).status,400);
  assert.equal((await call(env,`/api/followups/${followup.id}`,'PATCH',{status:'Done',outcome:'Discussed studio; visit agreed.'})).status,200);
  assert.equal((await call(env,`/api/students/${student.id}`,'PATCH',{status:'Follow-up Required'})).status,200);
  let state=await (await call(env,'/api/state')).json();
  assert.equal(state.students[0].name,"O'Connor");assert.equal(state.students[0].status,'Follow-up Required');assert.equal(state.leads[0].status,'Follow-up Required');
  assert.equal(state.followups[0].status,'Done');assert.equal(state.followups[0].outcome,'Discussed studio; visit agreed.');assert.ok(state.followups[0].completed_at);
  assert.equal((await call(env,'/api/payments','POST',{student_id:student.id,property_id:property.id,amount:15000,status:'Successful'})).status,201);
  state=await (await call(env,'/api/state')).json();assert.equal(state.students[0].status,'Converted');assert.equal(state.leads[0].status,'Converted');assert.equal(state.payments[0].booking,'Confirmed');
  assert.equal((await call(env,'/api/followups/missing','PATCH',{status:'Done',outcome:'Done'})).status,404);
  assert.equal((await call(env,`/api/students/${student.id}`,'PATCH',{status:'Invalid'})).status,400);
  assert.equal((await call(env,'/')).status,200);
  const uploaded=await (await call(env,'/api/properties','POST',{name:'Uploaded stay',location:'Pune',price:18000,image_data:'data:image/jpeg;base64,/9j/2Q=='})).json();
  const photoResponse=await call(env,`/api/media/properties/${uploaded.id}`);assert.equal(photoResponse.status,200);assert.equal(photoResponse.headers.get('Content-Type'),'image/jpeg');assert.deepEqual([...new Uint8Array(await photoResponse.arrayBuffer())],[255,216,255,217]);
  const uploadedState=await (await call(env,'/api/state')).json();assert.equal(uploadedState.properties.find(p=>p.id===uploaded.id).image,`/api/media/properties/${uploaded.id}`);
  assert.equal((await call(env,'/api/properties','POST',{name:'Invalid',location:'Pune',image_data:'data:image/jpeg;base64,YWJj'})).status,400);
  assert.equal((await call(env,'/api/property-images/missing')).status,404);
  const withPhoto=await (await call(env,'/api/students','POST',{name:'Photo Student',mobile:'0000001001',image_data:'data:image/jpeg;base64,/9j/2Q=='})).json();
  assert.ok(objects.has(`students/${withPhoto.id}`));
  const studentPhoto=await call(env,`/api/media/students/${withPhoto.id}?download=1`);assert.equal(studentPhoto.status,200);assert.match(studentPhoto.headers.get('Content-Disposition'),/^attachment;/);assert.equal(studentPhoto.headers.get('Content-Type'),'image/jpeg');
  const photoState=await (await call(env,'/api/state')).json();assert.equal(photoState.students.find(s=>s.id===withPhoto.id).image,`/api/media/students/${withPhoto.id}`);
  const before=objects.size;assert.equal((await call(env,'/api/students','POST',{name:'Duplicate Photo',mobile:'0000001001',image_data:'data:image/jpeg;base64,/9j/2Q=='})).status,409);assert.equal(objects.size,before);
  assert.equal((await call({...env,MEDIA:null},'/api/students','POST',{name:'Missing R2',mobile:'0000001002',image_data:'data:image/jpeg;base64,/9j/2Q=='})).status,503);
  assert.equal((await call(env,'/api/media/students/missing')).status,404);

  const survivor=await (await call(env,'/api/students','POST',{name:'Keep Person',mobile:'0000001003'})).json();
  const deletionPath=`/api/students/${student.id}`;
  assert.equal((await worker.fetch(new Request('https://crm.test'+deletionPath,{method:'DELETE'}),env)).status,401);
  const crossOrigin=await worker.fetch(new Request('https://crm.test'+deletionPath,{method:'DELETE',headers:{Cookie:'crm_session='+'a'.repeat(64),Origin:'https://other.example'}}),env);assert.equal(crossOrigin.status,403);
  const failedEnv={...env,DB:{prepare:query=>env.DB.prepare(query),batch:async()=>{throw Error('Deletion transaction failed')}}};assert.equal((await call(failedEnv,deletionPath,'DELETE')).status,503);assert.ok((await (await call(env,'/api/state')).json()).students.some(s=>s.id===student.id));
  const history=await env.DB.prepare('SELECT id FROM crm_activity WHERE student_id=?').bind(student.id).first();await env.DB.prepare('INSERT INTO notification_receipts(user_id,notification_id,is_read,dismissed) VALUES(?,?,1,0)').bind('fixture',history.id).run();
  assert.equal((await call(env,deletionPath,'DELETE')).status,200);assert.ok((await env.DB.prepare('SELECT archived_at FROM students WHERE id=?').bind(student.id).first()).archived_at);assert.equal((await call(env,deletionPath+'/permanent','DELETE')).status,200);const afterDelete=await (await call(env,'/api/state')).json();assert.ok(!afterDelete.students.some(s=>s.id===student.id));for(const table of ['leads','followups','payments'])assert.ok(!afterDelete[table].some(r=>r.student_id===student.id));assert.ok(afterDelete.properties.some(p=>p.id===property.id));assert.ok(afterDelete.students.some(s=>s.id===withPhoto.id));assert.equal(await env.DB.prepare('SELECT * FROM notification_receipts WHERE notification_id=?').bind(history.id).first(),null);const deletionLog=await env.DB.prepare('SELECT * FROM crm_activity WHERE student_id=?').bind(student.id).first();assert.equal(deletionLog.action,'deleted');assert.equal(deletionLog.label.includes("O'Connor"),false);
  const feed=await (await call(env,'/api/notifications')).json();assert.ok(feed.notifications.some(n=>n.title==='Student deleted'&&n.studentId===null));assert.equal((await call(env,deletionPath,'DELETE')).status,404);
  assert.equal((await call(env,`/api/students/${withPhoto.id}`,'DELETE')).status,200);assert.equal(objects.has(`students/${withPhoto.id}`),true);assert.equal((await call(env,`/api/students/${withPhoto.id}/permanent`,'DELETE')).status,200);assert.equal(objects.has(`students/${withPhoto.id}`),false);

  for(let i=0;i<2;i++)execFileSync('python3',['-c',python],{input:JSON.stringify({file,schema:readFileSync('data/demo.sql','utf8')})});
  const seeded=await (await call(env,'/api/state')).json(),demo=seeded.students.filter(s=>s.id.startsWith('DEMO-STU-'));
  assert.equal(demo.length,10);assert.equal(seeded.followups.filter(f=>f.id.startsWith('DEMO-FU-')).length,20);
  for(const s of demo){const p=JSON.parse(s.profile_json);assert.equal(p.nationality,'Indian');assert.ok(p.college&&p.guardian_name&&p.move_in_date&&p.image_query);assert.ok(seeded.leads.some(l=>l.student_id===s.id));assert.ok(seeded.payments.some(t=>t.student_id===s.id))}
  assert.ok(seeded.students.some(s=>s.id===survivor.id));assert.ok(!seeded.students.some(s=>s.id===student.id));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
