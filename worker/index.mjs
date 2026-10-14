import { handleAuth, sessionUser, requireUser, AuthError } from './auth.mjs';
import { activityStatement, handleNotifications } from './notifications.mjs';
import { imageSearch, serveStockPhoto } from './images.mjs';
const TABLES = ['students', 'properties', 'leads', 'followups', 'payments'];
const STATUSES = ['New Lead', 'Contacted', 'Interested', 'Follow-up Required', 'Converted', 'Lost'];
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const optional = value => String(value ?? '').trim() || null;
function required(value, field) { const out = optional(value); if (!out) throw new HttpError(400, `${field} is required`); return out; }
function choice(value, choices, field) { if (!choices.includes(value)) throw new HttpError(400, `Invalid ${field}`); return value; }
function number(value, field) { const out = Number(value || 0); if (!Number.isFinite(out) || out < 0) throw new HttpError(400, `${field} must be a non-negative number`); return out; }
const stmt = (db, sql, values = []) => db.prepare(sql).bind(...values);
async function exists(db, table, value) { if (!await stmt(db, `SELECT id FROM ${table} WHERE id=?`, [value]).first()) throw new HttpError(404, `${table.slice(0, -1)} not found`); }
async function state(db) { const rows = await db.batch(TABLES.map(t => db.prepare(`SELECT * FROM ${t} ORDER BY ${t === 'followups' ? 'starts_at' : t === 'payments' ? 'paid_at DESC' : 'created_at DESC'}`))); return Object.fromEntries(TABLES.map((t, i) => [t, rows[i].results])); }
function studentInsert(db, x, image = null, recordId = id('STU')) { return { id: recordId, statement: stmt(db, 'INSERT INTO students(id,name,mobile,email,city,course,budget,agent,status,notes,profile_json,image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [recordId, required(x.name, 'Name'), required(x.mobile, 'Mobile'), optional(x.email), optional(x.city), optional(x.course), number(x.budget, 'Budget'), optional(x.agent) || 'Arjun Mehta', choice(x.status || 'New Lead', STATUSES, 'status'), optional(x.notes), x.profile && typeof x.profile==='object' ? JSON.stringify(x.profile) : null, image]) }; }

function parsePhoto(value){
 if(!value)return null;
 const match=String(value).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match||match[2].length>350000)throw new HttpError(400,'Upload a JPEG, PNG or WebP image under 256 KB after resizing');
 let raw;try{raw=atob(match[2])}catch{throw new HttpError(400,'Invalid image encoding')}
 const valid=match[1]==='jpeg'?raw.startsWith('\xff\xd8\xff'):match[1]==='png'?raw.startsWith('\x89PNG\r\n\x1a\n'):raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP';
 if(!valid)throw new HttpError(400,'Invalid image content');
 return {mime:'image/'+match[1],bytes:Uint8Array.from(raw,c=>c.charCodeAt(0)),extension:match[1]==='jpeg'?'jpg':match[1]};
}
async function persistPhoto(env,key,photo,save){
 if(!photo){await save();return}
 if(!env.MEDIA)throw new HttpError(503,'R2 photo storage is not connected');
 await env.MEDIA.put(key,photo.bytes,{httpMetadata:{contentType:photo.mime}});
 try{await save()}catch(error){try{await env.MEDIA.delete(key)}catch(cleanup){console.error('R2 photo cleanup failed',cleanup)}throw error}
}
async function serveMedia(request,env,kind,recordId){
 if(!env.MEDIA)throw new HttpError(503,'R2 photo storage is not connected');
 if(!/^[A-Za-z0-9-]+$/.test(recordId))throw new HttpError(400,'Invalid photo ID');
 await exists(env.DB,kind,recordId);
 const object=await env.MEDIA.get(`${kind}/${recordId}`);if(!object)throw new HttpError(404,'Photo not found');
 const headers=new Headers();object.writeHttpMetadata(headers);headers.set('ETag',object.httpEtag);headers.set('Cache-Control','private, max-age=3600');headers.set('X-Content-Type-Options','nosniff');
 if(new URL(request.url).searchParams.get('download')==='1'){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[headers.get('Content-Type')]||'jpg';headers.set('Content-Disposition',`attachment; filename="${kind}-${recordId}.${ext}"`)}
 return new Response(object.body,{headers});
}
async function handleApi(request, env, path, user) {
  const db = env.DB;
  if (!db) throw new HttpError(503, 'Cloudflare D1 binding is missing');
  if (request.method === 'GET') {
    const mediaMatch=path.match(/^\/api\/media\/(students|properties)\/([^/]+)$/);if(mediaMatch)return serveMedia(request,env,mediaMatch[1],decodeURIComponent(mediaMatch[2]));
    if (path === '/api/health') { await db.prepare('SELECT 1').first(); return json({ ok: true, database: 'Cloudflare D1' }); }
    const imageMatch=path.match(/^\/api\/property-images\/([^/]+)$/);
    if(imageMatch){const photo=await stmt(db,'SELECT mime_type,image_data FROM property_images WHERE property_id=?',[decodeURIComponent(imageMatch[1])]).first();if(!photo)throw new HttpError(404,'Property image not found');const bytes=Uint8Array.from(atob(photo.image_data),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':photo.mime_type,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff',...(new URL(request.url).searchParams.get('download')==='1'?{'Content-Disposition':`attachment; filename="property-${imageMatch[1]}.jpg"`}:{})}})}
    if (path === '/api/state') return json(await state(db));
    if (path === '/api/export') return json({ exported_at: new Date().toISOString(), ...await state(db) });
  }
  if (!['POST', 'PATCH'].includes(request.method)) throw new HttpError(404, 'Route not found');
  // Mutations must originate from the app, not another website.
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-origin changes are not allowed');
  let x; try { x = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new HttpError(400, 'Expected a JSON object');
  if (request.method === 'POST') {
    if (path === '/api/students') { const photo=parsePhoto(x.image_data),recordId=id('STU'),record=studentInsert(db,x,photo?`/api/media/students/${recordId}`:null,recordId);await persistPhoto(env,`students/${recordId}`,photo,()=>db.batch([record.statement,activityStatement(db,user,'students','created',{...x,id:recordId})]));return json({id:recordId},201); }
    if (path === '/api/students/import') {
      if (!Array.isArray(x.rows) || x.rows.length > 1000) throw new HttpError(400, 'Import up to 1,000 rows at a time');
      let added = 0, skipped = 0;
      for (const row of x.rows) { try { const record=studentInsert(db,row);await db.batch([record.statement,activityStatement(db,user,'students','created',{...row,id:record.id})]); added++; } catch (error) { if (error instanceof HttpError || /UNIQUE constraint/.test(error.message)) skipped++; else throw error; } }
      return json({ added, skipped });
    }
    if (path === '/api/properties') {
      const recordId = id('PROP');
      const photo=parsePhoto(x.image_data);
      const record=stmt(db,'INSERT INTO properties(id,name,location,price,type,rooms,amenities,image,image_query) VALUES(?,?,?,?,?,?,?,?,?)',[recordId,required(x.name,'Name'),required(x.location,'Location'),number(x.price,'Price'),optional(x.type),number(x.rooms,'Rooms'),optional(x.amenities),photo?`/api/media/properties/${recordId}`:null,optional(x.image_query)||`${x.location} furnished serviced apartment ${x.type||'studio'} interior`]);
      await persistPhoto(env,`properties/${recordId}`,photo,()=>db.batch([record,activityStatement(db,user,'properties','created',{...x,id:recordId})]));
      return json({ id: recordId }, 201);
    }
    if (['/api/leads', '/api/followups', '/api/payments'].includes(path)) {
      await exists(db, 'students', required(x.student_id, 'Student'));
      if (x.property_id) await exists(db, 'properties', x.property_id);
      const recordId = id(path === '/api/leads' ? 'LEAD' : path === '/api/followups' ? 'FU' : 'TXN');
      if (path === '/api/leads') {
        const status = choice(x.status || 'New Lead', STATUSES, 'status');
        await db.batch([stmt(db, 'INSERT INTO leads(id,student_id,property_id,status,followup,notes) VALUES(?,?,?,?,?,?)', [recordId, x.student_id, optional(x.property_id), status, optional(x.followup), optional(x.notes)]), stmt(db, 'UPDATE students SET status=? WHERE id=?', [status, x.student_id]),activityStatement(db,user,'leads','created',{...x,id:recordId})]);
      } else if (path === '/api/followups') {
        const date = required(x.starts_at, 'Date and time'); if (Number.isNaN(Date.parse(date))) throw new HttpError(400, 'Invalid follow-up date');
        const followup=stmt(db, 'INSERT INTO followups(id,student_id,starts_at,purpose,priority,status) VALUES(?,?,?,?,?,?)', [recordId, x.student_id, date, choice(x.purpose, ['Callback', 'Property discussion', 'Property visit', 'Payment reminder'], 'purpose'), choice(x.priority || 'Medium', ['Low', 'Medium', 'High'], 'priority'), 'Pending']);await db.batch([followup,activityStatement(db,user,'followups','created',{...x,id:recordId})]);
      } else {
        const status = choice(x.status, ['Successful', 'Pending', 'Failed', 'Refunded'], 'payment status');
        const statements = [stmt(db, 'INSERT INTO payments(id,student_id,property_id,amount,status,booking) VALUES(?,?,?,?,?,?)', [recordId, x.student_id, optional(x.property_id), number(x.amount, 'Amount'), status, status === 'Successful' ? 'Confirmed' : 'On hold'])];
        if (status === 'Successful') statements.push(stmt(db, "UPDATE leads SET status='Converted' WHERE student_id=? AND property_id=?", [x.student_id, optional(x.property_id)]), stmt(db, "UPDATE students SET status='Converted' WHERE id=?", [x.student_id]));
        statements.push(activityStatement(db,user,'payments','created',{...x,id:recordId}));await db.batch(statements);
      }
      return json({ id: recordId }, 201);
    }
  }
  if (request.method === 'PATCH') {
    const match = path.match(/^\/api\/(students|leads|followups)\/([^/]+)$/);
    if (match) {
      const [, table, rawId] = match, recordId = decodeURIComponent(rawId); await exists(db, table, recordId);
      if (table === 'followups') {
        const status = choice(x.status, ['Pending', 'Done'], 'follow-up status');
        const outcome = status === 'Done' ? required(x.outcome, 'Follow-up outcome') : optional(x.outcome);
        const update=stmt(db, 'UPDATE followups SET status=?,outcome=?,completed_at=? WHERE id=?', [status, outcome, status === 'Done' ? new Date().toISOString() : null, recordId]);const previous=await stmt(db,'SELECT * FROM followups WHERE id=?',[recordId]).first();await db.batch([update,activityStatement(db,user,'followups','updated',{...previous,...x})]);
      } else {
        const status = choice(x.status, STATUSES, 'status');
        const statements = [stmt(db, `UPDATE ${table} SET status=? WHERE id=?`, [status, recordId])];
        if (table === 'leads') statements.push(stmt(db, 'UPDATE students SET status=? WHERE id=(SELECT student_id FROM leads WHERE id=?)', [status, recordId]));
        // A profile status update keeps all active opportunities in step.
        else statements.push(stmt(db, "UPDATE leads SET status=? WHERE student_id=? AND status NOT IN ('Converted','Lost')", [status, recordId]));
        const previous=await stmt(db,`SELECT * FROM ${table} WHERE id=?`,[recordId]).first();statements.push(activityStatement(db,user,table,'updated',{...previous,...x,label:null}));await db.batch(statements);
      }
      return json({ ok: true });
    }
  }
  throw new HttpError(404, 'Route not found');
}
async function serveAppAsset(request, env) {
 const response=await env.ASSETS.fetch(request);
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','no-store');
 headers.set('CDN-Cache-Control','no-store');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {
 async fetch(request,env,context){
  const url=new URL(request.url),path=url.pathname;
  try{
   if(path.startsWith('/api/auth/'))return await handleAuth(request,env,path);
   const publicFiles=['/login','/login.html','/login.js','/styles.css','/favicon.ico'];
   if(publicFiles.includes(path))return serveAppAsset(request,env)
   const user=await sessionUser(request,env);
   if(!path.startsWith('/api/')){if(!user||user.must_change_password)return Response.redirect(url.origin+'/login'+(user?.must_change_password?'?change=1':''),302);return serveAppAsset(request,env)}
   requireUser(user);
   if(path.startsWith('/api/notifications'))return await handleNotifications(request,env,user,path);
   if(path==='/api/images/file'&&request.method==='GET')return serveStockPhoto(request,env,context);
   if(path==='/api/images'&&request.method==='GET')return imageSearch(request,env,context);
   return await handleApi(request,env,path,user);
  }catch(error){
   if(error instanceof AuthError||error instanceof HttpError)return json({error:error.message},error.status);
   if(/UNIQUE constraint/.test(error.message))return json({error:'Duplicate email or mobile'},409);
   console.error('CRM request failed',error);return json({error:'The request could not be completed. Please retry.'},503);
  }
 }
};
