export class StatusError extends Error {constructor(status,message){super(message);this.status=status}}
const statuses=['New Lead','Contacted','Interested','Follow-up Required','Converted','Lost'];
const sql=(db,text,values=[])=>db.prepare(text).bind(...values);
const uuid=()=>crypto.randomUUID();
function check(status){if(!statuses.includes(status))throw new StatusError(400,'Choose a valid status')}
export function statusEvent(db,user,action,studentId,label,requestId=null,token=null){
 return sql(db,`INSERT INTO crm_activity(id,actor_id,actor_name,entity,action,student_id,label,created_at,status_request_id)
 SELECT ?,?,?,'students',?,?,?,?,?${token?' WHERE EXISTS(SELECT 1 FROM status_requests WHERE id=? AND decision_token=?)':''}`,
 ['status-event-'+uuid(),user.id,user.name,action,studentId,label,new Date().toISOString(),requestId,...(token?[requestId,token]:[])]);
}
export function creationStatusStatements(db,user,{entity,id,student_id,name,status}){
 check(status);if(status==='New Lead')return [];
 if(user.role==='admin')return [statusEvent(db,user,'status_finalized',student_id,`${name||'Student'} · New Lead → ${status}`)];
 return draftStatements(db,user,{entity,id,student_id,name,status:'New Lead'},status);
}
function draftStatements(db,user,record,status){
 const id='STATUS-'+uuid(),now=new Date().toISOString();
 return [
  sql(db,"UPDATE status_requests SET state='Superseded',decided_at=? WHERE entity=? AND record_id=? AND requested_by=? AND state='Pending'",[now,record.entity,record.id,user.id]),
  sql(db,"INSERT INTO status_requests(id,entity,record_id,student_id,from_status,proposed_status,requested_by,requested_by_name,created_at) VALUES(?,?,?,?,?,?,?,?,?)",[id,record.entity,record.id,record.student_id,record.status,status,user.id,user.name,now]),
  statusEvent(db,user,'status_draft',record.student_id,`${record.name||'Student'} · ${record.status} → ${status} · awaiting admin approval`,id)
 ];
}
async function target(db,entity,id){
 if(!['students','leads'].includes(entity))throw new StatusError(400,'Invalid status target');
 const record=entity==='students'?await sql(db,'SELECT id,id AS student_id,status,name,student_code FROM students WHERE id=? AND archived_at IS NULL',[id]).first():await sql(db,'SELECT l.id,l.student_id,l.status,s.name,s.student_code FROM leads l JOIN students s ON s.id=l.student_id WHERE l.id=? AND s.archived_at IS NULL',[id]).first();
 if(!record)throw new StatusError(404,'Active student or opportunity not found');
 return {...record,entity};
}
export async function changeStatus(db,user,entity,id,status){
 check(status);const record=await target(db,entity,id);
 if(record.status===status)return {ok:true,unchanged:true};
 if(user.role!=='admin'){
  const existing=await sql(db,"SELECT id FROM status_requests WHERE entity=? AND record_id=? AND requested_by=? AND proposed_status=? AND state='Pending'",[entity,id,user.id,status]).first();
  if(!existing)await db.batch(draftStatements(db,user,record,status));
  return {ok:true,draft:true};
 }
 return finalize(db,user,record,status);
}
async function finalize(db,user,record,status,request=null){
 const requestId=request?.id||'STATUS-'+uuid(),token=uuid(),now=new Date().toISOString();
 const active=record.entity==='students'?'archived_at IS NULL':'student_id IN (SELECT id FROM students WHERE archived_at IS NULL)';
 const guard=`EXISTS(SELECT 1 FROM status_requests WHERE id=? AND decision_token=?)`;
 const values=[requestId,token];
 const claim=request?
  sql(db,`UPDATE status_requests SET state='Approved',decided_by=?,decided_by_name=?,decided_at=?,decision_token=? WHERE id=? AND state='Pending' AND EXISTS(SELECT 1 FROM ${record.entity} WHERE id=? AND status=? AND ${active}) RETURNING id`,[user.id,user.name,now,token,requestId,record.id,request.from_status]):
  sql(db,`INSERT INTO status_requests(id,entity,record_id,student_id,from_status,proposed_status,state,requested_by,requested_by_name,created_at,decided_by,decided_by_name,decided_at,decision_token) SELECT ?,?,?,?,?,?,'Approved',?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${record.entity} WHERE id=? AND status=? AND ${active}) RETURNING id`,[requestId,record.entity,record.id,record.student_id,record.status,status,user.id,user.name,now,user.id,user.name,now,token,record.id,record.status]);
 const statements=[claim,sql(db,`UPDATE ${record.entity} SET status=? WHERE id=? AND ${guard}`,[status,record.id,...values])];
 if(record.entity==='leads')statements.push(sql(db,`UPDATE students SET status=? WHERE id=? AND archived_at IS NULL AND ${guard}`,[status,record.student_id,...values]));
 else statements.push(sql(db,`UPDATE leads SET status=? WHERE student_id=? AND status NOT IN ('Converted','Lost') AND ${guard}`,[status,record.student_id,...values]));
 statements.push(sql(db,`UPDATE status_requests SET state='Superseded',decided_at=? WHERE student_id=? AND state='Pending' AND ${guard}`,[now,record.student_id,...values]),statusEvent(db,user,'status_finalized',record.student_id,`${record.name} · ${record.status} → ${status}${request?' · draft approved':''}`,requestId,token));
 const result=await db.batch(statements);
 if(!result[0].results?.length)throw new StatusError(409,'This status or draft changed. Refresh before finalizing.');
 return {ok:true,finalized:true};
}
export async function decideStatus(db,user,id,decision){
 if(user.role!=='admin')throw new StatusError(403,'Only administrators can approve or reject status drafts');
 const request=await sql(db,"SELECT r.* FROM status_requests r JOIN students s ON s.id=r.student_id WHERE r.id=? AND s.archived_at IS NULL",[id]).first();
 if(!request)throw new StatusError(404,'Status draft not found');
 if(request.state!=='Pending')throw new StatusError(409,'This draft has already been reviewed or superseded');
 const record=await target(db,request.entity,request.record_id);
 if(decision==='approve')return finalize(db,user,record,request.proposed_status,request);
 const token=uuid(),now=new Date().toISOString();
 const result=await db.batch([sql(db,"UPDATE status_requests SET state='Rejected',decided_by=?,decided_by_name=?,decided_at=?,decision_token=? WHERE id=? AND state='Pending' RETURNING id",[user.id,user.name,now,token,id]),statusEvent(db,user,'status_rejected',request.student_id,`${record.name} · ${request.from_status} → ${request.proposed_status} · draft rejected`,id,token)]);
 if(!result[0].results?.length)throw new StatusError(409,'This draft has already been reviewed');
 return {ok:true,rejected:true};
}
