import { activityStatement } from './notifications.mjs';
export const DOCUMENT_TYPES=[
 {id:'identity',label:'Passport / photo ID',required:true},
 {id:'admission',label:'Admission / enrolment proof',required:true},
 {id:'photo',label:'Student photo',required:true},
 {id:'visa',label:'Visa / residence permit',required:false},
 {id:'address',label:'Address proof',required:false},
 {id:'financial',label:'Financial proof',required:false},
 {id:'guarantor',label:'Guarantor documents',required:false}
];
export class DocumentError extends Error {constructor(status,message){super(message);this.status=status}}
const q=(db,sql,values=[])=>db.prepare(sql).bind(...values);
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const MAX_BYTES=10*1024*1024;
const types={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
async function activeStudent(db,id){const student=await q(db,'SELECT id,name FROM students WHERE id=? AND archived_at IS NULL',[id]).first();if(!student)throw new DocumentError(404,'Student not found');return student}
function admin(user){if(user.role!=='admin')throw new DocumentError(403,'Only administrators can finalize documents or change requirements')}
function origin(request){if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw new DocumentError(403,'Cross-origin changes are not allowed')}
async function boundedFile(request){
 if(Number(request.headers.get('Content-Length'))>MAX_BYTES)throw new DocumentError(413,'Files must be 10 MB or smaller');
 const reader=request.body?.getReader();if(!reader)throw new DocumentError(400,'Choose a file');
 const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw new DocumentError(413,'Files must be 10 MB or smaller')}chunks.push(value)}
 if(!size)throw new DocumentError(400,'Choose a non-empty file');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
}
export function validateDocument(bytes,mime){
 const start=String.fromCharCode(...bytes.slice(0,12));
 const valid=mime==='application/pdf'?start.startsWith('%PDF-'):mime==='image/jpeg'?start.startsWith('\xff\xd8\xff'):mime==='image/png'?start.startsWith('\x89PNG\r\n\x1a\n'):mime==='image/webp'?start.startsWith('RIFF')&&start.slice(8,12)==='WEBP':false;
 if(!valid)throw new DocumentError(400,'Choose a valid PDF, JPEG, PNG or WebP file');
}
export async function handleDocuments(request,env,user,path){
 const file=path.match(/^\/api\/student-documents\/([A-Za-z0-9-]+)\/file$/);
 if(file&&request.method==='GET'){
  const doc=await q(env.DB,'SELECT d.* FROM student_documents d JOIN students s ON s.id=d.student_id WHERE d.id=? AND s.archived_at IS NULL',[file[1]]).first();
  if(!doc)throw new DocumentError(404,'Document not found');
  const object=await env.MEDIA?.get(doc.r2_key);if(!object)throw new DocumentError(404,'Document file is unavailable');
  return new Response(object.body,{headers:{'Content-Type':doc.mime_type,'Content-Length':String(doc.size_bytes),'Content-Disposition':`attachment; filename="document-${doc.id}.${types[doc.mime_type]||'bin'}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
 }
 origin(request);
 const upload=path.match(/^\/api\/students\/([^/]+)\/documents\/([a-z-]+)$/);
 if(upload&&['POST','PATCH'].includes(request.method)){
  const student=await activeStudent(env.DB,decodeURIComponent(upload[1])),kind=DOCUMENT_TYPES.find(type=>type.id===upload[2]);if(!kind)throw new DocumentError(400,'Unknown document type');
  if(request.method==='PATCH'){
   admin(user);let body;try{body=await request.json()}catch{throw new DocumentError(400,'Invalid request')}
   if(typeof body.required!=='boolean')throw new DocumentError(400,'Choose required or optional');
   await env.DB.batch([q(env.DB,'INSERT INTO student_document_requirements(student_id,document_type,required,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(student_id,document_type) DO UPDATE SET required=excluded.required,updated_by=excluded.updated_by,updated_at=excluded.updated_at',[student.id,kind.id,Number(body.required),user.id,new Date().toISOString()]),activityStatement(env.DB,user,'documents','requirements_updated',{student_id:student.id,name:`${student.name} · ${kind.label} · ${body.required?'Required':'Optional'}`})]);
   return json({ok:true});
  }
  if(!env.MEDIA)throw new DocumentError(503,'R2 document storage is unavailable');
  const mime=(request.headers.get('Content-Type')||'').split(';')[0].trim();if(!types[mime])throw new DocumentError(400,'Upload PDF, JPEG, PNG or WebP');
  let filename;try{filename=decodeURIComponent(request.headers.get('X-Document-Name')||'Document')}catch{throw new DocumentError(400,'Invalid filename')}
  filename=filename.split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,180)||'Document';
  const bytes=await boundedFile(request);validateDocument(bytes,mime);
  const id='DOC-'+crypto.randomUUID(),key=`student-documents/${student.id}/${id}`,now=new Date().toISOString(),approved=user.role==='admin';
  await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:mime}});
  try{
   const updates=[q(env.DB,"UPDATE student_documents SET state='Superseded' WHERE student_id=? AND document_type=? AND state='Pending'",[student.id,kind.id])];
   if(approved)updates.push(q(env.DB,"UPDATE student_documents SET state='Superseded' WHERE student_id=? AND document_type=? AND state='Approved'",[student.id,kind.id]));
   updates.push(q(env.DB,'INSERT INTO student_documents(id,student_id,document_type,filename,mime_type,size_bytes,r2_key,state,uploaded_by,uploaded_by_name,created_at,reviewed_by,reviewed_by_name,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,student.id,kind.id,filename,mime,bytes.length,key,approved?'Approved':'Pending',user.id,user.name,now,approved?user.id:null,approved?user.name:null,approved?now:null]),activityStatement(env.DB,user,'documents',approved?'document_approved':'document_submitted',{student_id:student.id,name:`${student.name} · ${kind.label}`}));
   await env.DB.batch(updates);
  }catch(error){try{await env.MEDIA.delete(key)}catch(cleanup){console.error('Document upload cleanup failed',cleanup)}throw error}
  return json({id,state:approved?'Approved':'Pending'},201);
 }
 const decision=path.match(/^\/api\/student-documents\/([A-Za-z0-9-]+)\/(approve|reject)$/);
 if(decision&&request.method==='POST'){
  admin(user);const doc=await q(env.DB,'SELECT * FROM student_documents WHERE id=?',[decision[1]]).first();if(!doc)throw new DocumentError(404,'Document not found');
  const student=await activeStudent(env.DB,doc.student_id);if(doc.state!=='Pending')throw new DocumentError(409,'This draft has already been reviewed or replaced');
  let body;try{body=await request.json()}catch{throw new DocumentError(400,'Invalid request')}
  const note=String(body.note||'').trim().slice(0,300),approved=decision[2]==='approve';if(!approved&&!note)throw new DocumentError(400,'Add a short reason for the requested changes');
  const changes=[];
  if(approved)changes.push(q(env.DB,"UPDATE student_documents SET state='Superseded' WHERE student_id=? AND document_type=? AND state='Approved' AND EXISTS(SELECT 1 FROM student_documents WHERE id=? AND state='Pending')",[doc.student_id,doc.document_type,doc.id]));
  changes.push(q(env.DB,"UPDATE student_documents SET state=?,reviewed_by=?,reviewed_by_name=?,reviewed_at=?,review_note=? WHERE id=? AND state='Pending'",[approved?'Approved':'Rejected',user.id,user.name,new Date().toISOString(),note||null,doc.id]));
  // The activity insert follows the guarded update in the same atomic batch.
  const event=q(env.DB,"INSERT INTO crm_activity(id,actor_id,actor_name,entity,action,student_id,label,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1",['activity-'+crypto.randomUUID(),user.id,user.name,'documents',approved?'document_approved':'document_rejected',doc.student_id,`${student.name} · ${DOCUMENT_TYPES.find(type=>type.id===doc.document_type)?.label||doc.document_type}`,new Date().toISOString()]);
  const updateIndex=changes.length-1;changes.push(q(env.DB,'SELECT changes() AS changed'),event);const results=await env.DB.batch(changes);
  if(results[updateIndex+1].results[0].changed!==1)throw new DocumentError(409,'This draft has already been reviewed or replaced');
  return json({ok:true});
 }
 throw new DocumentError(404,'Document route not found');
}
