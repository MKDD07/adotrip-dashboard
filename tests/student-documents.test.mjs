import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {webcrypto,createHash} from 'node:crypto';
import vm from 'node:vm';
import worker from '../worker/index.mjs';
import {DOCUMENT_TYPES,validateDocument} from '../worker/documents.mjs';
import {database} from './helpers/d1.mjs';
globalThis.crypto ||= webcrypto;
const pdf=new TextEncoder().encode('%PDF-1.7\nMock student document\n%%EOF');
test('document drafts require admin review, private R2 files survive archive and are removed on purge',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'student-documents-')),file=join(directory,'test.db');
 try{
  execFileSync('sqlite3',[file],{input:readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort().map(n=>readFileSync('migrations/'+n,'utf8')).join('\n')});
  const DB=database(file),objects=new Map(),env={DB,MEDIA:{async put(key,bytes){objects.set(key,new Uint8Array(bytes))},async get(key){return objects.has(key)?{body:objects.get(key)}:null},async delete(key){objects.delete(key)}}};
  for(const role of ['admin','agent']){
   await DB.prepare('INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,0)').bind(role,role,role+'@example.com','fixture',role).run();
   await DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update((role==='admin'?'a':'b').repeat(64)).digest('hex'),role,Date.now()+3600000).run();
  }
  const call=(role,path,method='GET',body,headers={})=>worker.fetch(new Request('https://crm.example'+path,{method,headers:{Cookie:'crm_session='+(role==='admin'?'a':'b').repeat(64),'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
  const upload=(role,path,bytes=pdf,headers={})=>worker.fetch(new Request('https://crm.example'+path,{method:'POST',headers:{Cookie:'crm_session='+(role==='admin'?'a':'b').repeat(64),'Content-Type':'application/pdf','X-Document-Name':encodeURIComponent('Student proof.pdf'),...headers},body:bytes}),env);
  const student=await (await call('admin','/api/students','POST',{name:'Document Student',mobile:'DOC-001'})).json(),path=`/api/students/${student.id}/documents/identity`;
  const draft=await (await upload('agent',path)).json();assert.equal(draft.state,'Pending');assert.ok(draft.id);
  const filePath=`/api/student-documents/${draft.id}/file`,decision=`/api/student-documents/${draft.id}/approve`;
  assert.equal((await worker.fetch(new Request('https://crm.example'+filePath),env)).status,401);
  const download=await call('agent',filePath);assert.equal(download.status,200);assert.match(download.headers.get('Cache-Control'),/no-store/);assert.match(download.headers.get('Content-Disposition'),/^attachment/);assert.deepEqual(new Uint8Array(await download.arrayBuffer()),pdf);
  assert.equal((await call('agent',decision,'POST',{})).status,403);
  assert.equal((await call('agent',path,'PATCH',{required:false})).status,403);
  assert.equal((await call('admin',decision,'POST',{})).status,200);
  assert.equal((await call('admin',decision,'POST',{})).status,409);
  let state=await (await call('agent','/api/state')).json();assert.equal(state.documents[0].state,'Approved');assert.equal(state.documents[0].reviewed_by,'admin');assert.equal('r2_key' in state.documents[0],false);assert.deepEqual(state.document_types,DOCUMENT_TYPES);
  const replacement=await (await upload('agent',path)).json();
  state=await (await call('agent','/api/state')).json();assert.deepEqual(state.documents.map(d=>d.state).sort(),['Approved','Pending']);
  const rejected=`/api/student-documents/${replacement.id}/reject`;
  assert.equal((await call('admin',rejected,'POST',{})).status,400);
  assert.equal((await call('admin',rejected,'POST',{note:'Upload the full page'})).status,200);
  state=await (await call('agent','/api/state')).json();assert.equal(state.documents.find(d=>d.id===draft.id).state,'Approved');assert.equal(state.documents.find(d=>d.id===replacement.id).review_note,'Upload the full page');
  const next=await (await upload('agent',path)).json(),newer=await (await upload('agent',path)).json();
  assert.equal((await call('admin',`/api/student-documents/${next.id}/approve`,'POST',{})).status,409);
  assert.equal((await call('admin',`/api/student-documents/${newer.id}/approve`,'POST',{})).status,200);
  state=await (await call('agent','/api/state')).json();assert.equal(state.documents.filter(d=>d.state==='Approved').length,1);assert.equal(state.documents.find(d=>d.state==='Approved').id,newer.id);
  const direct=await (await upload('admin',path.replace('/identity','/admission'))).json();assert.equal(direct.state,'Approved');
  assert.equal((await call('admin',path.replace('/identity','/visa'),'PATCH',{required:true})).status,200);
  assert.equal((await call('admin',path,'PATCH',{required:'no'})).status,400);
  state=await (await call('agent','/api/state')).json();assert.equal(state.document_requirements[0].required,1);
  const feed=await (await call('admin','/api/notifications')).json();assert.ok(feed.notifications.some(n=>n.title==='Document draft submitted'&&n.studentId===student.id));assert.ok(feed.notifications.some(n=>n.title==='Document approved'));
  const racing=await (await upload('agent',path.replace('/identity','/photo'))).json();
  const reviews=await Promise.all([call('admin',`/api/student-documents/${racing.id}/approve`,'POST',{}),call('admin',`/api/student-documents/${racing.id}/reject`,'POST',{note:'Needs correction'})]);
  assert.deepEqual(reviews.map(r=>r.status).sort(),[200,409]);
  const before=objects.size;
  assert.equal((await upload('agent',path,new TextEncoder().encode('<script>invalid</script>'))).status,400);
  assert.equal((await upload('agent',path,pdf,{'Content-Type':'text/html'})).status,400);
  assert.equal((await upload('agent',path,pdf,{'Content-Length':String(11*1024*1024)})).status,413);
  assert.equal((await upload('agent',path,new Uint8Array())).status,400);
  assert.equal((await upload('agent',path,pdf,{Origin:'https://other.example'})).status,403);
  assert.equal((await upload('agent',path.replace('identity','unknown'))).status,400);
  assert.equal(objects.size,before);
  // Roll back R2 if the database transaction cannot save the metadata.
  env.DB={...DB,batch:async()=>{throw Error('fixture database failure')}};
  assert.equal((await upload('agent',path)).status,503);assert.equal(objects.size,before);env.DB=DB;
  assert.equal((await call('admin',`/api/students/${student.id}`,'DELETE')).status,200);
  assert.equal((await call('agent',filePath)).status,404);assert.equal((await upload('agent',path)).status,404);assert.equal(objects.size,before);
  state=await (await call('agent','/api/state')).json();assert.equal(state.documents.length,0);assert.equal(state.document_requirements.length,0);
  assert.equal((await call('admin',`/api/students/${student.id}/restore`,'POST',{})).status,200);assert.equal((await call('agent',filePath)).status,200);
  await call('admin',`/api/students/${student.id}`,'DELETE');assert.equal((await call('admin',`/api/students/${student.id}/permanent`,'DELETE')).status,200);assert.equal(objects.size,0);
  assert.equal(await DB.prepare('SELECT COUNT(*) AS count FROM student_documents').first().then(r=>r.count),0);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
test('file signature validation rejects disguised files',()=>{
 for(const [mime,bytes] of [['application/pdf',pdf],['image/jpeg',new Uint8Array([255,216,255])],['image/png',new Uint8Array([137,80,78,71,13,10,26,10])],['image/webp',new TextEncoder().encode('RIFF0000WEBP')]])assert.doesNotThrow(()=>validateDocument(bytes,mime));
 assert.throws(()=>validateDocument(pdf,'image/png'),/valid PDF/);
});
test('checklist distinguishes missing requirements and drafts, and only approved files satisfy completion',()=>{
 const source=readFileSync('app.js','utf8'),context=vm.createContext({signedInUser:{role:'agent'},esc:v=>String(v??''),data:{documents:[],document_requirements:[]}});
 const helpers=source.slice(source.indexOf('const defaultDocumentTypes='),source.indexOf("$('#profileBody').addEventListener('change',event=>{\n const input=event.target,studentId=selectedStudentId;"));
 // Read just the pure checklist functions; profile rendering is outside this slice.
 vm.runInContext(helpers.slice(0,helpers.indexOf('function updateDocumentUI()')),context);
 const run=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context));
 assert.deepEqual(run('defaultDocumentTypes'),DOCUMENT_TYPES);
 assert.deepEqual(run("studentDocumentAttention({id:'S'})"),{missing:3,pending:0});
 vm.runInContext("data.documents=[{id:'D1',student_id:'S',document_type:'identity',state:'Pending',filename:'passport.pdf',size_bytes:1000,created_at:'2026-10-15'}]",context);
 assert.deepEqual(run("studentDocumentAttention({id:'S'})"),{missing:3,pending:1});
 let markup=run("studentDocumentsMarkup({id:'S'})");assert.match(markup,/In review/);assert.doesNotMatch(markup,/document-review-form|data-document-required/);
 vm.runInContext("signedInUser.role='admin'",context);markup=run("studentDocumentsMarkup({id:'S'})");assert.match(markup,/data-document-review="D1"/);assert.match(markup,/data-document-required/);
 vm.runInContext("data.documents[0].state='Approved';data.document_requirements=[{student_id:'S',document_type:'visa',required:1}]",context);
 assert.deepEqual(run("studentDocumentAttention({id:'S'})"),{missing:3,pending:0});
 vm.runInContext("data.documents.push(...['admission','photo','visa'].map(document_type=>({student_id:'S',document_type,state:'Approved',created_at:'2026-10-15'})))",context);
 assert.deepEqual(run("studentDocumentAttention({id:'S'})"),{missing:0,pending:0});assert.equal(run("documentTabIndicator({id:'S'})"),'');
});
