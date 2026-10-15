import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {webcrypto,createHash} from 'node:crypto';
import worker from '../worker/index.mjs';
import {database} from './helpers/d1.mjs';
import {stageBalances} from '../worker/stage-payments.mjs';
globalThis.crypto ||= webcrypto;

test('stage receipts auto-link assigned properties, preserve receipt metadata and enforce balances and duplicate references',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'stage-receipts-')),file=join(directory,'db.sqlite');
 try{
  execFileSync('sqlite3',[file],{input:readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort().map(n=>readFileSync('migrations/'+n,'utf8')).join('\n')});
  const DB=database(file),env={DB,ASSETS:{fetch:async()=>new Response('asset')}};
  for(const role of ['admin','agent']){
   await DB.prepare('INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,0)').bind(role,role,role+'@example.com','fixture',role).run();
   await DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update((role==='admin'?'a':'b').repeat(64)).digest('hex'),role,Date.now()+3600000).run();
  }
  const call=(path,body,role='agent',method='POST')=>worker.fetch(new Request('https://crm.example'+path,{method,headers:{Cookie:'crm_session='+(role==='admin'?'a':'b').repeat(64),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
  const student=await (await call('/api/students',{name:'Receipt Person',mobile:'123456',budget:250000,status:'Interested'},'admin')).json();
  const property=await (await call('/api/properties',{name:'Assigned apartment',location:'London',price:239000})).json();
  const unrelated=await (await call('/api/properties',{name:'Other apartment',location:'Toronto',price:300000})).json();
  await call('/api/leads',{student_id:student.id,property_id:property.id,status:'Interested'},'admin');
  let number=0;
  const receipt=(extra={})=>({property_id:property.id,payment_stage:'initial',payment_method:'UPI',amount:'10000.00',transaction_id:'TX-INITIAL',utr:'UTR-INITIAL',paid_at:new Date().toISOString(),notes:'Arrival deposit',request_key:'receipt-request-'+String(++number).padStart(10,'0'),...extra});
  const path='/api/students/'+student.id+'/payments';
  assert.equal((await call(path,receipt({utr:''}))).status,400);
  assert.equal((await call(path,receipt({property_id:unrelated.id}))).status,400);
  assert.equal((await call(path,receipt({payment_method:'Card',transaction_id:''}))).status,400);
  assert.equal((await call(path,receipt({amount:'-1'}))).status,400);
  assert.equal((await call(path,receipt({paid_at:'2099-01-01T00:00:00Z'}))).status,400);
  const first=receipt(),response=await call(path,first);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
  const saved=await DB.prepare('SELECT * FROM payments WHERE request_key=?').bind(first.request_key).first();
  assert.equal(saved.property_id,property.id);assert.equal(saved.amount,10000);assert.equal(saved.payment_stage,'initial');assert.equal(saved.payment_method,'UPI');assert.equal(saved.transaction_id,'TX-INITIAL');assert.equal(saved.utr,'UTR-INITIAL');assert.equal(saved.notes,'Arrival deposit');assert.equal(saved.recorded_by,'agent');
  assert.equal((await call(path,first)).status,201);
  assert.equal((await call(path,{...first,amount:'9999.00'})).status,409);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM payments').first()).count,1);
  assert.equal((await call(path,receipt({payment_stage:'final',transaction_id:'OTHER',utr:'UTR-INITIAL'}))).status,409);
  assert.equal((await call(path,receipt({amount:'14000.00',transaction_id:'OVER',utr:'OVER'}))).status,409);
  assert.equal((await call(path,receipt({amount:'13900.00',payment_method:'Card',transaction_id:'CARD-INITIAL',utr:''}))).status,201);
  assert.equal((await call(path,receipt({payment_stage:'final',amount:'71700.00',payment_method:'Cash',transaction_id:'',utr:''}))).status,201);
  let rows=(await DB.batch([DB.prepare('SELECT * FROM payments')]))[0].results;
  assert.deepEqual(stageBalances(239000,rows).map(s=>s.due),[0,14340000,0]);
  assert.equal((await DB.prepare('SELECT status FROM students WHERE id=?').bind(student.id).first()).status,'Interested');
  assert.equal((await call(path,receipt({payment_stage:'accommodation',amount:'143400.00',payment_method:'Bank transfer',transaction_id:'BANK-60',utr:'NEFT-60'}))).status,201);
  rows=(await DB.batch([DB.prepare('SELECT * FROM payments')]))[0].results;
  assert.equal(rows.reduce((sum,p)=>sum+p.amount,0),239000);
  assert.deepEqual(stageBalances(239000,rows).map(s=>s.due),[0,0,0]);
  // Two 60 INR receipts compete for a 100 INR stage balance. Only one may commit.
  const concurrent=await (await call('/api/students',{name:'Concurrent Person',mobile:'123457',budget:1000})).json();
  const small=await (await call('/api/properties',{name:'Small apartment',location:'London',price:1000})).json();
  await call('/api/leads',{student_id:concurrent.id,property_id:small.id,status:'Interested'});
  const concurrentPath='/api/students/'+concurrent.id+'/payments';
  const a=receipt({property_id:small.id,amount:'60.00',transaction_id:'CONCURRENT-A',utr:'CONCURRENT-A'}),b=receipt({property_id:small.id,amount:'60.00',transaction_id:'CONCURRENT-B',utr:'CONCURRENT-B'});
  const responses=await Promise.all([call(concurrentPath,a),call(concurrentPath,b)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM payments WHERE student_id=?').bind(concurrent.id).first()).count,1);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM crm_activity WHERE entity='payments' AND student_id=?").bind(concurrent.id).first()).count,1);
  await call('/api/students/'+concurrent.id,null,'admin','DELETE');
  assert.equal((await call(concurrentPath,receipt({property_id:small.id,amount:'1.00'}))).status,404);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
