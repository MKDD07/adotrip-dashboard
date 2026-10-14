import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { webcrypto,pbkdf2Sync } from 'node:crypto';
import worker from '../worker/index.mjs';
import { hashPassword,verifyPassword,generatePassword } from '../worker/auth.mjs';
import { database } from './helpers/d1.mjs';
globalThis.crypto ||= webcrypto;
test('password hashes use standard salted PBKDF2-SHA-512 and random starter patterns',async()=>{
 const password=generatePassword();assert.match(password,/^Campus-[A-Za-z0-9]{8}-[A-Za-z0-9]{8}-[a-f0-9]{4}!$/);assert.notEqual(password,generatePassword());
 const hash=await hashPassword(password),parts=hash.split('$');assert.equal(parts[0],'pbkdf2-sha512');assert.equal(Number(parts[1]),210000);assert.equal(parts[3],pbkdf2Sync(password,Buffer.from(parts[2],'hex'),210000,64,'sha512').toString('hex'));assert.equal(await verifyPassword(password,hash),true);assert.equal(await verifyPassword('wrong password',hash),false);assert.notEqual(hash,await hashPassword(password));
});
test('first login gates CRM data, password change rotates sessions, and logout revokes access',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'crm-auth-')),file=join(directory,'test.db');
 try{
  execFileSync('sqlite3',[file],{input:readFileSync('migrations/0007_auth.sql')});const db=database(file),env={DB:db,ASSETS:{fetch:async()=>new Response('page')}};
  const starter=generatePassword();await db.prepare("INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,1)").bind('pooja','Pooja','pooja@example.com',await hashPassword(starter),'admin').run();
  const call=(path,method='GET',body,cookie,origin)=>worker.fetch(new Request('https://crm.example'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  assert.equal((await call('/api/state')).status,401);assert.equal((await call('/')).status,302);assert.equal((await call('/login')).status,200);const canonicalEnv={...env,ASSETS:{fetch:async request=>new URL(request.url).pathname==='/login.html'?Response.redirect('https://crm.example/login',301):new Response('login page')}};assert.equal((await worker.fetch(new Request('https://crm.example/login'),canonicalEnv)).status,200);
  assert.equal((await call('/api/auth/login','POST',{email:'pooja@example.com',password:starter},null,'https://evil.example')).status,403);
  const login=await call('/api/auth/login','POST',{email:'pooja@example.com',password:starter});assert.equal(login.status,200);assert.match(login.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict.*Secure/);const oldCookie=login.headers.get('Set-Cookie').split(';')[0];assert.equal((await login.json()).user.must_change_password,true);
  assert.equal((await call('/api/state','GET',null,oldCookie)).status,403);assert.equal((await call('/api/media/students/demo','GET',null,oldCookie)).status,403);assert.equal((await call('/api/images','GET',null,oldCookie)).status,403);
  assert.equal((await call('/api/auth/password','POST',{new_password:'short'},oldCookie)).status,400);
  const generation=await call('/api/auth/generate-password','POST',{},oldCookie);assert.equal(generation.status,200);
  const changed=await call('/api/auth/password','POST',{new_password:'My new private password 2026!'},oldCookie);assert.equal(changed.status,200);const cookie=changed.headers.get('Set-Cookie').split(';')[0];assert.notEqual(cookie,oldCookie);assert.equal((await changed.json()).user.must_change_password,false);
  assert.equal((await call('/api/auth/session','GET',null,oldCookie)).status,200);assert.equal((await (await call('/api/auth/session','GET',null,oldCookie)).json()).user,null);
  assert.equal((await call('/','GET',null,cookie)).status,200);
  const create=await call('/api/auth/users','POST',{name:'Agent',email:'agent@example.com'},cookie);assert.equal(create.status,201);const account=await create.json();assert.ok(account.temporary_password);const agent=await db.prepare('SELECT * FROM auth_users WHERE email=?').bind('agent@example.com').first();assert.equal(agent.must_change_password,1);assert.ok(!agent.password_hash.includes(account.temporary_password));
  await call('/api/auth/logout','POST',{},cookie);assert.equal((await (await call('/api/auth/session','GET',null,cookie)).json()).user,null);
  for(let i=0;i<5;i++)assert.equal((await call('/api/auth/login','POST',{email:'unknown@example.com',password:'incorrect'})).status,401);assert.equal((await call('/api/auth/login','POST',{email:'unknown@example.com',password:'incorrect'})).status,429);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
