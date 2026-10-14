import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha512 } from '@noble/hashes/sha2.js';
const encoder=new TextEncoder(),ITERATIONS=210000,TTL=8*60*60*1000;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=value=>Uint8Array.from(value.match(/../g)||[],v=>parseInt(v,16));
const random=length=>crypto.getRandomValues(new Uint8Array(length));
export class AuthError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
const sql=(db,query,values=[])=>db.prepare(query).bind(...values);
export function generatePassword(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';let text='';while(text.length<16){for(const n of random(32)){if(n<256-256%alphabet.length)text+=alphabet[n%alphabet.length];if(text.length===16)break}}return `Campus-${text.slice(0,8)}-${text.slice(8)}-${hex(random(2))}!`}
// PBKDF2 runs in the browser; the Worker stores and checks SHA-256 of its key.
// The stored verifier cannot be used as the login credential.
export async function hashPassword(password){const salt=random(24),key=await pbkdf2Async(sha512,encoder.encode(password),salt,{c:ITERATIONS,dkLen:64});return hashDerived(hex(key),hex(salt))}
async function hashDerived(key,salt){if(typeof key!=='string'||!/^[a-f0-9]{128}$/.test(key)||typeof salt!=='string'||!/^[a-f0-9]{48}$/.test(salt))throw new AuthError(400,'Refresh the password form to use the updated authentication');return `pbkdf2-sha512-client$${ITERATIONS}$${salt}$${await keyDigest(fromHex(key))}`}
const equalHex=(actual,expected)=>{if(actual.length!==expected.length)return false;let difference=0;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);return difference===0};
export async function verifyPassword(password,stored){const [algorithm,count,salt,expected,...extra]=String(stored).split('$');if(extra.length||!/^[a-f0-9]{48}$/.test(salt||''))return false;if(!['pbkdf2-sha512','pbkdf2-sha512-client'].includes(algorithm)||count!==String(ITERATIONS)||!(algorithm==='pbkdf2-sha512'?/^[a-f0-9]{128}$/:/^[a-f0-9]{64}$/).test(expected||''))return false;const key=await pbkdf2Async(sha512,encoder.encode(password),fromHex(salt),{c:ITERATIONS,dkLen:64});return equalHex(algorithm==='pbkdf2-sha512'?hex(key):await keyDigest(key),expected)}
async function keyDigest(key){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',key)))}
async function verifyDerivedKey(key,stored){const [algorithm,count,salt,expected,...extra]=String(stored).split('$');if(extra.length||algorithm!=='pbkdf2-sha512-client'||count!==String(ITERATIONS)||!/^[a-f0-9]{48}$/.test(salt||'')||!/^[a-f0-9]{64}$/.test(expected||'')||typeof key!=='string'||!/^[a-f0-9]{128}$/.test(key))return false;return equalHex(await keyDigest(fromHex(key)),expected)}

async function digest(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))))}
function cookie(request,token,maxAge=28800){const secure=new URL(request.url).protocol==='https:'?'; Secure':'';return `crm_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`}
function userInfo(user){return {id:user.id,name:user.name,email:user.email,role:user.role,image_url:user.image_url,must_change_password:!!user.must_change_password}}
export async function sessionUser(request,env){const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)crm_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token||!env.DB)return null;return sql(env.DB,'SELECT u.*,s.token_hash FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',[await digest(token),Date.now()]).first()}
export function requireUser(user){if(!user)throw new AuthError(401,'Please sign in to continue');if(user.must_change_password)throw new AuthError(403,'Change your starter password to continue')}
async function issueSession(request,db,user){const token=hex(random(32));await db.batch([sql(db,'DELETE FROM auth_attempts WHERE expires_at<=?',[Date.now()]),sql(db,'DELETE FROM auth_sessions WHERE expires_at<=?',[Date.now()]),sql(db,'INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',[await digest(token),user.id,Date.now()+TTL])]);return json({user:userInfo(user)},200,{'Set-Cookie':cookie(request,token)})}
async function input(request){if(!request.headers.get('Content-Type')?.includes('application/json'))throw new AuthError(415,'Send JSON');const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw new AuthError(403,'Request origin is not allowed');const raw=await request.text();if(raw.length>4096)throw new AuthError(413,'Request too large');try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value}catch{throw new AuthError(400,'Invalid request')}}
function validPassword(password){if(typeof password!=='string'||password.length<12||password.length>128)throw new AuthError(400,'Use a password between 12 and 128 characters')}
function validEmail(email){const value=String(email||'').trim().toLowerCase();if(value.length>254||!/^\S+@\S+\.\S+$/.test(value))throw new AuthError(400,'Enter a valid email');return value}
export async function handleAuth(request,env,path){
 const db=env.DB;if(!db)throw new AuthError(503,'Account database is unavailable');
 if(path==='/api/auth/login-info'&&request.method==='POST'){
  const x=await input(request),email=validEmail(x.email),ipKey=await digest('login-info:'+(request.headers.get('CF-Connecting-IP')||'local')),now=Date.now();
  await sql(db,'INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END',[ipKey,now+15*60*1000,now,now,now+15*60*1000]).run();
  if((await sql(db,'SELECT count FROM auth_attempts WHERE key=?',[ipKey]).first()).count>60)throw new AuthError(429,'Too many attempts. Try again in 15 minutes.');
  const account=await sql(db,'SELECT * FROM auth_users WHERE email=?',[email]).first();let stored=account?.password_hash;
  if(stored?.startsWith('pbkdf2-sha512$210000$')){
   const [algorithm,count,salt,key]=stored.split('$');if(!/^[a-f0-9]{48}$/.test(salt)||!/^[a-f0-9]{128}$/.test(key))throw new AuthError(503,'Account password format is invalid');
   const wrapped=`pbkdf2-sha512-client$${count}$${salt}$${await keyDigest(fromHex(key))}`;
   await sql(db,'UPDATE auth_users SET password_hash=? WHERE id=? AND password_hash=?',[wrapped,account.id,stored]).run();
   stored=(await sql(db,'SELECT * FROM auth_users WHERE email=?',[email]).first())?.password_hash;
  }
  if(stored?.startsWith('pbkdf2-sha512-client$210000$')){const [algorithm,count,salt]=stored.split('$');return json({algorithm:'PBKDF2',hash:'SHA-512',iterations:ITERATIONS,salt,length:512})}
  return json({algorithm:'PBKDF2',hash:'SHA-512',iterations:ITERATIONS,salt:hex(random(24)),length:512});
 }
 if(path==='/api/auth/login'&&request.method==='POST'){
  const x=await input(request),email=String(x.email||'').trim().toLowerCase(),password=String(x.password||'');if(email.length>254||password.length>128)throw new AuthError(400,'Invalid sign-in details');
  const key=await digest(`${request.headers.get('CF-Connecting-IP')||'local'}:${email}`),now=Date.now();
  const ipKey=await digest('ip:'+(request.headers.get('CF-Connecting-IP')||'local'));await sql(db,'INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END',[ipKey,now+15*60*1000,now,now,now+15*60*1000]).run();if((await sql(db,'SELECT count FROM auth_attempts WHERE key=?',[ipKey]).first()).count>30)throw new AuthError(429,'Too many attempts. Try again in 15 minutes.');
  await sql(db,'INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END',[key,now+15*60*1000,now,now,now+15*60*1000]).run();
  const attempt=await sql(db,'SELECT count FROM auth_attempts WHERE key=?',[key]).first();if(attempt.count>5)throw new AuthError(429,'Too many attempts. Try again in 15 minutes.');
  const user=await sql(db,'SELECT * FROM auth_users WHERE email=?',[email]).first();
  if(user?.password_hash.startsWith('pbkdf2-sha512')&&x.password_key===undefined)throw new AuthError(400,'Refresh the sign-in page to use the updated authentication');
  const dummy='pbkdf2-sha512-client$210000$'+'00'.repeat(24)+'$'+'00'.repeat(32);
  const correct=await verifyDerivedKey(x.password_key,user?.password_hash||dummy);if(!user||!correct)throw new AuthError(401,'Email or password is incorrect');
  await sql(db,'DELETE FROM auth_attempts WHERE key=?',[key]).run();return issueSession(request,db,user);
 }
 const user=await sessionUser(request,env);
 if(path==='/api/auth/session'&&request.method==='GET')return json({user:user?userInfo(user):null});
 if(!user)throw new AuthError(401,'Please sign in to continue');
 if(path==='/api/auth/avatar'&&request.method==='GET'){
  const photo=await env.MEDIA?.get(`accounts/${user.id}`);if(!photo)throw new AuthError(404,'Profile photo not found');const headers=new Headers({'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});photo.writeHttpMetadata(headers);return new Response(photo.body,{headers});
 }
 if(path==='/api/auth/logout'&&request.method==='POST'){await input(request);await sql(db,'DELETE FROM auth_sessions WHERE token_hash=?',[user.token_hash]).run();return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)})}
 if(path==='/api/auth/password'&&request.method==='POST'){
  const x=await input(request);validPassword(x.new_password);
  if(!user.must_change_password&&user.password_hash.startsWith('pbkdf2-sha512')&&x.current_password_key===undefined)throw new AuthError(400,'Refresh the password form to use the updated authentication');
  const currentCorrect=user.must_change_password||await verifyDerivedKey(x.current_password_key,user.password_hash);
  if(!currentCorrect)throw new AuthError(400,'Current password is incorrect');
  // First-time setup already has an authenticated starter-password session.
  // Existing accounts still verify their current password before this comparison.
  if(!user.must_change_password&&x.new_password===x.current_password)throw new AuthError(400,'Choose a different password from your current password');
  const hashed=await hashDerived(x.new_password_key,x.new_password_salt);
  await db.batch([sql(db,'UPDATE auth_users SET password_hash=?,must_change_password=0 WHERE id=?',[hashed,user.id]),sql(db,'DELETE FROM auth_sessions WHERE user_id=?',[user.id])]);
  return issueSession(request,db,{...user,must_change_password:0});
 }
 if(path==='/api/auth/generate-password'&&request.method==='POST'){await input(request);return json({password:generatePassword(),salt:hex(random(24))})}
 requireUser(user);
 if(path==='/api/auth/users'&&user.role==='admin'){
  if(request.method==='GET'){const rows=await db.prepare('SELECT id,name,email,role,must_change_password,created_at FROM auth_users ORDER BY created_at DESC').all();return json({users:rows.results})}
  if(request.method==='POST'){const x=await input(request),email=validEmail(x.email),name=String(x.name||'').trim();if(!name||name.length>100)throw new AuthError(400,'Enter a name');const role=x.role==='admin'?'admin':'agent',password=x.temporary_password;validPassword(password);if(!/^Campus-[A-Za-z0-9]{8}-[A-Za-z0-9]{8}-[a-f0-9]{4}!$/.test(password))throw new AuthError(400,'Generate a starter password before creating the account');await sql(db,'INSERT INTO auth_users(id,name,email,password_hash,role,must_change_password) VALUES(?,?,?,?,?,1)',[crypto.randomUUID(),name,email,await hashDerived(x.password_key,x.password_salt),role]).run();return json({email,temporary_password:password},201)}
 }
 throw new AuthError(404,'Account action not available');
}
