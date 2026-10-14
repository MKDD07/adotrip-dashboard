import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import worker from '../worker/index.mjs';
import {database} from './helpers/d1.mjs';
globalThis.crypto ||= webcrypto;
test('team directory, private messages and unread previews are scoped to the signed-in recipient',async()=>{
 const root=mkdtempSync(join(tmpdir(),'crm-messages-')),file=join(root,'db.sqlite');
 try{
  execFileSync('sqlite3',[file],{input:readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('migrations/'+f,'utf8')).join('\n')});
  const db=database(file),env={DB:db},cookies={};
  for(const [id,role,token] of [['alice','admin','a'.repeat(64)],['bob','agent','b'.repeat(64)],['carol','agent','c'.repeat(64)]]){
   await db.prepare('INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,0)').bind(id,id,id+'@example.com','private-test-hash',role).run();
   const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
   await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(hash,id,Date.now()+3600000).run();cookies[id]='crm_session='+token;
  }
  const call=(user,path,method='GET',body,origin)=>worker.fetch(new Request('https://crm.example'+path,{method,headers:{Cookie:cookies[user],'Content-Type':'application/json',...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  const team=(await (await call('bob','/api/team')).json()).users;
  assert.equal(team.length,2);assert.ok(!team.some(u=>u.id==='bob'));assert.equal(team.find(u=>u.id==='alice').online,false);
  assert.equal((await call('alice','/api/team/presence','POST',{})).status,200);
  assert.equal((await (await call('bob','/api/team')).json()).users.find(u=>u.id==='alice').online,true);
  await db.prepare("UPDATE auth_sessions SET last_seen=? WHERE user_id='alice'").bind(Date.now()-61000).run();
  assert.equal((await (await call('bob','/api/team')).json()).users.find(u=>u.id==='alice').online,false);
  await call('alice','/api/team/presence','POST',{});assert.equal(team[0].role,'admin');assert.ok(team.every(u=>!('email' in u)&&!('password_hash' in u)));
  const sent=await call('alice','/api/messages/bob','POST',{body:'Please review the booking.'});assert.equal(sent.status,201);const {id}=await sent.json();
  let directory=(await (await call('bob','/api/team')).json()).users;
  assert.equal(directory.find(u=>u.id==='alice').unread_count,1);assert.equal(directory.find(u=>u.id==='alice').unread_preview,'Please review the booking.');
  assert.equal((await (await call('carol','/api/team')).json()).users.find(u=>u.id==='alice').unread_count,0);
  assert.deepEqual((await (await call('carol','/api/messages/alice')).json()).messages,[]);
  assert.equal((await (await call('bob','/api/messages/alice')).json()).messages[0].body,'Please review the booking.');
  await call('carol','/api/messages/alice/read','POST',{ids:[id]});
  assert.equal((await (await call('bob','/api/team')).json()).users.find(u=>u.id==='alice').unread_count,1);
  await call('bob','/api/messages/alice/read','POST',{ids:[id]});
  directory=(await (await call('bob','/api/team')).json()).users;
  assert.equal(directory.find(u=>u.id==='alice').unread_count,0);
  assert.ok((await (await call('alice','/api/messages/bob')).json()).messages[0].read_at);
  assert.equal((await call('alice','/api/messages/bob','POST',{body:' '})).status,400);
  assert.equal((await call('alice','/api/messages/alice','POST',{body:'self'})).status,400);
  assert.equal((await call('alice','/api/messages/missing','POST',{body:'test'})).status,404);
  assert.equal((await call('alice','/api/messages/bob','POST',{body:'blocked'},'https://other.example')).status,403);
  assert.equal((await worker.fetch(new Request('https://crm.example/api/team'),env)).status,401);
 }finally{rmSync(root,{recursive:true,force:true})}
});
