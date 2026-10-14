import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { webcrypto,pbkdf2Sync,createHash } from 'node:crypto';
import worker from '../worker/index.mjs';
import { hashPassword,verifyPassword,generatePassword } from '../worker/auth.mjs';
import { database } from './helpers/d1.mjs';
globalThis.crypto ||= webcrypto;
const legacyHash=password=>'pbkdf2-sha512$210000$'+'ab'.repeat(24)+'$'+pbkdf2Sync(password,Buffer.from('ab'.repeat(24),'hex'),210000,64,'sha512').toString('hex');
const passwordFields=password=>{const salt='cd'.repeat(24);return {new_password:password,new_password_salt:salt,new_password_key:pbkdf2Sync(password,Buffer.from(salt,'hex'),210000,64,'sha512').toString('hex')}};
test('SHA-256 verifiers preserve salted PBKDF2 work and legacy PBKDF2 passwords still verify',async()=>{
 const password=generatePassword();assert.match(password,/^Campus-[A-Za-z0-9]{8}-[A-Za-z0-9]{8}-[a-f0-9]{4}!$/);assert.notEqual(password,generatePassword());
 const hash=await hashPassword(password),parts=hash.split('$');assert.equal(parts[0],'pbkdf2-sha512-client');assert.equal(parts[1],'210000');assert.equal(parts[3],createHash('sha256').update(pbkdf2Sync(password,Buffer.from(parts[2],'hex'),210000,64,'sha512')).digest('hex'));assert.equal(await verifyPassword(password,hash),true);assert.equal(await verifyPassword('wrong password',hash),false);assert.notEqual(hash,await hashPassword(password));const legacy=legacyHash(password);assert.equal(await verifyPassword(password,legacy),true);assert.equal(await verifyPassword('wrong password',legacy),false);assert.equal(await verifyPassword(password,hash+'$extra'),false);assert.equal(await verifyPassword(password,hash.replace('$210000$','$999999$')),false);
});
test('first login gates CRM data, password change rotates sessions, and logout revokes access',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'crm-auth-')),file=join(directory,'test.db');
 try{
  execFileSync('sqlite3',[file],{input:readFileSync('migrations/0007_auth.sql')});const db=database(file),env={DB:db,ASSETS:{fetch:async()=>new Response('page')}};
  const starter=generatePassword();await db.prepare("INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,1)").bind('pooja','Pooja','pooja@example.com',legacyHash(starter),'admin').run();
  const call=(path,method='GET',body,cookie,origin)=>worker.fetch(new Request('https://crm.example'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  assert.equal((await call('/api/state')).status,401);assert.equal((await call('/')).status,302);assert.equal((await call('/login')).status,200);const canonicalEnv={...env,ASSETS:{fetch:async request=>new URL(request.url).pathname==='/login.html'?Response.redirect('https://crm.example/login',301):new Response('login page')}};assert.equal((await worker.fetch(new Request('https://crm.example/login'),canonicalEnv)).status,200);
  assert.equal((await call('/api/auth/login','POST',{email:'pooja@example.com',password:starter},null,'https://evil.example')).status,403);
  const metadata=await (await call('/api/auth/login-info','POST',{email:'pooja@example.com'})).json();assert.equal(metadata.algorithm,'PBKDF2');assert.equal(metadata.iterations,210000);assert.equal(metadata.length,512);assert.equal(Object.hasOwn(metadata,'password_hash'),false);const proof=pbkdf2Sync(starter,Buffer.from(metadata.salt,'hex'),metadata.iterations,64,'sha512').toString('hex');const wrapped=(await db.prepare('SELECT password_hash FROM auth_users WHERE id=?').bind('pooja').first()).password_hash;assert.match(wrapped,/^pbkdf2-sha512-client\$210000\$/);assert.equal(wrapped.includes(proof),false);assert.equal(await verifyPassword(starter,wrapped),true);assert.equal((await call('/api/auth/login','POST',{email:'pooja@example.com',password_key:'00'.repeat(64)})).status,401);
  const login=await call('/api/auth/login','POST',{email:'pooja@example.com',password_key:proof});assert.equal(login.status,200);assert.match(login.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict.*Secure/);const oldCookie=login.headers.get('Set-Cookie').split(';')[0];assert.equal((await login.json()).user.must_change_password,true);
  assert.equal((await call('/api/state','GET',null,oldCookie)).status,403);assert.equal((await call('/api/media/students/demo','GET',null,oldCookie)).status,403);assert.equal((await call('/api/images','GET',null,oldCookie)).status,403);
  assert.equal((await call('/api/auth/password','POST',{...passwordFields('short')},oldCookie)).status,400);
  const generation=await call('/api/auth/generate-password','POST',{},oldCookie);assert.equal(generation.status,200);
  const changed=await call('/api/auth/password','POST',{...passwordFields('My new private password 2026!')},oldCookie);assert.equal(changed.status,200);const cookie=changed.headers.get('Set-Cookie').split(';')[0];assert.notEqual(cookie,oldCookie);assert.equal((await changed.json()).user.must_change_password,false);
  assert.equal((await call('/api/auth/session','GET',null,oldCookie)).status,200);assert.equal((await (await call('/api/auth/session','GET',null,oldCookie)).json()).user,null);
  assert.equal((await call('/','GET',null,cookie)).status,200);
  await db.prepare('UPDATE auth_users SET password_hash=? WHERE id=?').bind(legacyHash('My new private password 2026!'),'pooja').run();
  assert.equal((await call('/api/auth/password','POST',{current_password:'incorrect',...passwordFields('A different private password!')},cookie)).status,400);
  assert.equal((await call('/api/auth/password','POST',{current_password:'My new private password 2026!',...passwordFields('My new private password 2026!')},cookie)).status,400);
  const currentInfo=await (await call('/api/auth/login-info','POST',{email:'pooja@example.com'})).json(),currentKey=pbkdf2Sync('My new private password 2026!',Buffer.from(currentInfo.salt,'hex'),210000,64,'sha512').toString('hex');assert.equal((await call('/api/auth/password','POST',{current_password_key:'00'.repeat(64),...passwordFields('A different private password!')},cookie)).status,400);
  const secondChange=await call('/api/auth/password','POST',{current_password:'My new private password 2026!',current_password_key:currentKey,...passwordFields('A different private password!')},cookie);assert.equal(secondChange.status,200);const nextCookie=secondChange.headers.get('Set-Cookie').split(';')[0];assert.equal((await (await call('/api/auth/session','GET',null,cookie)).json()).user,null);assert.match((await db.prepare('SELECT password_hash FROM auth_users WHERE id=?').bind('pooja').first()).password_hash,/^pbkdf2-sha512-client\$210000\$/);
  const generated=await (await call('/api/auth/generate-password','POST',{},nextCookie)).json();const create=await call('/api/auth/users','POST',{name:'Agent',email:'agent@example.com',temporary_password:generated.password,password_salt:generated.salt,password_key:pbkdf2Sync(generated.password,Buffer.from(generated.salt,'hex'),210000,64,'sha512').toString('hex')},nextCookie);assert.equal(create.status,201);const account=await create.json();assert.ok(account.temporary_password);const agent=await db.prepare('SELECT * FROM auth_users WHERE email=?').bind('agent@example.com').first();assert.equal(agent.must_change_password,1);assert.ok(!agent.password_hash.includes(account.temporary_password));
  await call('/api/auth/logout','POST',{},nextCookie);assert.equal((await (await call('/api/auth/session','GET',null,nextCookie)).json()).user,null);
  for(let i=0;i<5;i++)assert.equal((await call('/api/auth/login','POST',{email:'unknown@example.com',password:'incorrect'})).status,401);assert.equal((await call('/api/auth/login','POST',{email:'unknown@example.com',password:'incorrect'})).status,429);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
