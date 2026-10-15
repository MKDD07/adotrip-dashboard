import { DOCUMENT_TYPES, DocumentError, handleDocuments } from './documents.mjs';
import { StatusError, changeStatus, decideStatus, creationStatusStatements, statusEvent } from './status-approvals.mjs';
import { PaymentError, recordStagePayment } from './stage-payments.mjs';
import { exchangeRatesResponse } from './exchange-rates.mjs';
import { handleAuth, sessionUser, requireUser, AuthError } from './auth.mjs';
import { handleMessages } from './messages.mjs';
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
async function exists(db, table, value) { const active=table==='students'?' AND archived_at IS NULL':['leads','followups','payments'].includes(table)?' AND student_id IN (SELECT id FROM students WHERE archived_at IS NULL)':'';if (!await stmt(db, `SELECT id FROM ${table} WHERE id=?${active}`, [value]).first()) throw new HttpError(404, `${table.slice(0, -1)} not found`); }
async function state(db) {
 const queries=TABLES.map(t=>db.prepare(`SELECT * FROM ${t}${t==='students'?' WHERE archived_at IS NULL':t==='properties'?'':' WHERE student_id IN (SELECT id FROM students WHERE archived_at IS NULL)'} ORDER BY ${t==='followups'?'starts_at':t==='payments'?'paid_at DESC':'created_at DESC'}`));
 queries.push(db.prepare("SELECT r.* FROM status_requests r JOIN students s ON s.id=r.student_id WHERE r.state='Pending' AND s.archived_at IS NULL ORDER BY r.created_at DESC"));
 queries.push(db.prepare("SELECT d.id,d.student_id,d.document_type,d.filename,d.mime_type,d.size_bytes,d.state,d.uploaded_by,d.uploaded_by_name,d.created_at,d.reviewed_by,d.reviewed_by_name,d.reviewed_at,d.review_note FROM student_documents d JOIN students s ON s.id=d.student_id WHERE s.archived_at IS NULL AND d.state!='Superseded' ORDER BY d.created_at DESC,d.id DESC"));
 queries.push(db.prepare("SELECT r.* FROM student_document_requirements r JOIN students s ON s.id=r.student_id WHERE s.archived_at IS NULL"));
 const rows=await db.batch(queries);
 return {...Object.fromEntries(TABLES.map((t,i)=>[t,rows[i].results])),status_requests:rows[TABLES.length].results,documents:rows[TABLES.length+1].results,document_requirements:rows[TABLES.length+2].results,document_types:DOCUMENT_TYPES};
}
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
    if (path === '/api/students/archive') {
      if(user.role!=='admin')throw new HttpError(403,'Only administrators can access the student archive');
      const [rows]=await db.batch([db.prepare('SELECT s.*,u.name AS archived_by_name,(SELECT COUNT(*) FROM leads WHERE student_id=s.id) AS lead_count,(SELECT COUNT(*) FROM followups WHERE student_id=s.id) AS followup_count,(SELECT COUNT(*) FROM payments WHERE student_id=s.id) AS payment_count FROM students s LEFT JOIN auth_users u ON u.id=s.archived_by WHERE s.archived_at IS NOT NULL ORDER BY s.archived_at DESC,s.id')]);
      return json({students:rows.results});
    }
    if (path === '/api/state') return json(await state(db));
    if (path === '/api/export') return json({ exported_at: new Date().toISOString(), ...await state(db) });
  }
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) throw new HttpError(404, 'Route not found');
  // Mutations must originate from the app, not another website.
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, 'Cross-origin changes are not allowed');
  if (request.method === 'DELETE') {
    const match=path.match(/^\/api\/students\/([^/]+)(\/permanent)?$/);if(!match)throw new HttpError(404,'Route not found');
    if(user.role!=='admin')throw new HttpError(403,'Only administrators can archive or permanently delete students');
    const recordId=decodeURIComponent(match[1]),student=await stmt(db,'SELECT id,archived_at FROM students WHERE id=?',[recordId]).first();
    if(!student)throw new HttpError(404,'Student not found');
    if(!match[2]){
      if(student.archived_at)throw new HttpError(409,'Student is already archived');
      await db.batch([stmt(db,'UPDATE students SET archived_at=?,archived_by=? WHERE id=? AND archived_at IS NULL',[new Date().toISOString(),user.id,recordId]),activityStatement(db,user,'students','archived',{id:recordId,name:'Student record'})]);
      return json({ok:true,archived:true});
    }
    if(!student.archived_at)throw new HttpError(409,'Archive the student before permanent deletion');
    const [documentFiles]=await db.batch([stmt(db,'SELECT r2_key FROM student_documents WHERE student_id=?',[recordId])]);
    await db.batch([
      stmt(db,'DELETE FROM student_documents WHERE student_id=?',[recordId]),
      stmt(db,'DELETE FROM student_document_requirements WHERE student_id=?',[recordId]),
      stmt(db,'DELETE FROM notification_receipts WHERE notification_id IN (SELECT id FROM crm_activity WHERE student_id=?) OR EXISTS (SELECT 1 FROM followups f WHERE f.student_id=? AND notification_id LIKE \'reminder:\'||f.id||\':%\')',[recordId,recordId]),
      stmt(db,'DELETE FROM crm_activity WHERE student_id=?',[recordId]),
      ...['leads','followups','payments'].map(table=>stmt(db,`DELETE FROM ${table} WHERE student_id=?`,[recordId])),
      stmt(db,'DELETE FROM status_requests WHERE student_id=?',[recordId]),
      stmt(db,'DELETE FROM students WHERE id=?',[recordId]),
      activityStatement(db,user,'students','deleted',{id:recordId,name:'Student record'})
    ]);
    let warning;try{for(const file of documentFiles.results)await env.MEDIA?.delete(file.r2_key);await env.MEDIA?.delete(`students/${recordId}`)}catch(error){console.error('Deleted student media cleanup failed',error);warning='Student deleted, but some uploaded files could not be removed. Contact the administrator to finish storage cleanup.'}
    return json({ok:true,...(warning?{warning}:{})});
  }
  let x; try { x = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new HttpError(400, 'Expected a JSON object');
  if (request.method === 'POST') {
    const decisionMatch=path.match(/^\/api\/status-requests\/([^/]+)\/(approve|reject)$/);
    if(decisionMatch)return json(await decideStatus(db,user,decodeURIComponent(decisionMatch[1]),decisionMatch[2]));
    const receiptMatch=path.match(/^\/api\/students\/([^/]+)\/payments$/);
    if(receiptMatch)return json(await recordStagePayment(db,user,decodeURIComponent(receiptMatch[1]),x),201);
    const restoreMatch=path.match(/^\/api\/students\/([^/]+)\/restore$/);
    if(restoreMatch){
      if(user.role!=='admin')throw new HttpError(403,'Only administrators can restore archived students');
      const recordId=decodeURIComponent(restoreMatch[1]),student=await stmt(db,'SELECT id,archived_at FROM students WHERE id=?',[recordId]).first();
      if(!student)throw new HttpError(404,'Student not found');
      if(!student.archived_at)throw new HttpError(409,'Student is not archived');
      await db.batch([stmt(db,'UPDATE students SET archived_at=NULL,archived_by=NULL WHERE id=? AND archived_at IS NOT NULL',[recordId]),activityStatement(db,user,'students','restored',{id:recordId,name:'Student record'})]);
      return json({ok:true});
    }
    if (path === '/api/students') {
      const desired=choice(x.status||'New Lead',STATUSES,'status'),actual=user.role==='admin'?desired:'New Lead',photo=parsePhoto(x.image_data),recordId=id('STU'),record=studentInsert(db,{...x,status:actual},photo?`/api/media/students/${recordId}`:null,recordId);
      const review=creationStatusStatements(db,user,{entity:'students',id:recordId,student_id:recordId,name:x.name,status:desired});
      await persistPhoto(env,`students/${recordId}`,photo,()=>db.batch([record.statement,activityStatement(db,user,'students','created',{...x,status:actual,id:recordId}),...review]));return json({id:recordId,draft:user.role!=='admin'&&desired!=='New Lead'},201);
    }
    if (path === '/api/students/import') {
      if (!Array.isArray(x.rows) || x.rows.length > 1000) throw new HttpError(400, 'Import up to 1,000 rows at a time');
      let added = 0, skipped = 0;
      for (const row of x.rows) { try { const desired=choice(row.status||'New Lead',STATUSES,'status'),actual=user.role==='admin'?desired:'New Lead',record=studentInsert(db,{...row,status:actual});await db.batch([record.statement,activityStatement(db,user,'students','created',{...row,status:actual,id:record.id}),...creationStatusStatements(db,user,{entity:'students',id:record.id,student_id:record.id,name:row.name,status:desired})]); added++; } catch (error) { if (error instanceof HttpError || /UNIQUE constraint/.test(error.message)) skipped++; else throw error; } }
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
        const desired=choice(x.status||'New Lead',STATUSES,'status'),status=user.role==='admin'?desired:'New Lead';
        const student=await stmt(db,'SELECT * FROM students WHERE id=?',[x.student_id]).first();
        const statements=[stmt(db,'INSERT INTO leads(id,student_id,property_id,status,followup,notes) VALUES(?,?,?,?,?,?)',[recordId,x.student_id,optional(x.property_id),status,optional(x.followup),optional(x.notes)]),activityStatement(db,user,'leads','created',{...x,status,id:recordId})];
        if(user.role==='admin'){
          statements.push(stmt(db,'UPDATE students SET status=? WHERE id=?',[status,x.student_id]));
          if(student.status!==status)statements.push(statusEvent(db,user,'status_finalized',student.id,`${student.name} · ${student.status} → ${status}`),stmt(db,"UPDATE status_requests SET state='Superseded',decided_at=? WHERE student_id=? AND state='Pending'",[new Date().toISOString(),student.id]));
        }else statements.push(...creationStatusStatements(db,user,{entity:'leads',id:recordId,student_id:x.student_id,name:student.name,status:desired}));
        await db.batch(statements);return json({id:recordId,draft:user.role!=='admin'&&desired!=='New Lead'},201);
      } else if (path === '/api/followups') {
        const date = required(x.starts_at, 'Date and time'); if (Number.isNaN(Date.parse(date))) throw new HttpError(400, 'Invalid follow-up date');
        const followup=stmt(db, 'INSERT INTO followups(id,student_id,starts_at,purpose,priority,status) VALUES(?,?,?,?,?,?)', [recordId, x.student_id, date, choice(x.purpose, ['Callback', 'Property discussion', 'Property visit', 'Payment reminder'], 'purpose'), choice(x.priority || 'Medium', ['Low', 'Medium', 'High'], 'priority'), 'Pending']);await db.batch([followup,activityStatement(db,user,'followups','created',{...x,id:recordId})]);
      } else {
        const status = choice(x.status, ['Successful', 'Pending', 'Failed', 'Refunded'], 'payment status');
        const statements = [stmt(db, 'INSERT INTO payments(id,student_id,property_id,amount,status,booking) VALUES(?,?,?,?,?,?)', [recordId, x.student_id, optional(x.property_id), number(x.amount, 'Amount'), status, status === 'Successful' && user.role==='admin' ? 'Confirmed' : 'On hold'])];

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
        return json(await changeStatus(db,user,table,recordId,x.status));
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
   if(path.startsWith('/api/student-documents/')||/^\/api\/students\/[^/]+\/documents\//.test(path))return await handleDocuments(request,env,user,path);
   if(path==='/api/exchange-rates'&&request.method==='GET')return exchangeRatesResponse();
   if(path==='/api/team'||path.startsWith('/api/team/')||path.startsWith('/api/messages/'))return await handleMessages(request,env,user,path);
   if(path.startsWith('/api/notifications'))return await handleNotifications(request,env,user,path);
   if(path==='/api/images/file'&&request.method==='GET')return serveStockPhoto(request,env,context);
   if(path==='/api/images'&&request.method==='GET')return imageSearch(request,env,context);
   return await handleApi(request,env,path,user);
  }catch(error){
   if(error instanceof AuthError||error instanceof HttpError||error instanceof PaymentError||error instanceof StatusError||error instanceof DocumentError)return json({error:error.message},error.status);
   if(/UNIQUE constraint/.test(error.message))return json({error:'Duplicate email or mobile'},409);
   console.error('CRM request failed',error);return json({error:'The request could not be completed. Please retry.'},503);
  }
 }
};
