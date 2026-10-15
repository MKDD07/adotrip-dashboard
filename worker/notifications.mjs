import { AuthError } from './auth.mjs';
const query=(db,text,values=[])=>db.prepare(text).bind(...values);
const json=value=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
export function activityStatement(db,user,entity,action,record,receiptGuard=null){
 const identity=record.name||record.purpose||(entity==='payments'?`₹${Number(record.amount||0).toLocaleString('en-IN')}`:entity==='leads'?'Opportunity':record.id);
 const label=[identity,record.status].filter(Boolean).join(' · ');
 return query(db,'INSERT INTO crm_activity(id,actor_id,actor_name,entity,action,student_id,label,created_at) '+(receiptGuard?'SELECT ?,?,?,?,?,?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM payments WHERE id=?)':'VALUES(?,?,?,?,?,?,?,?)'),[
  'activity-'+crypto.randomUUID(),user.id,user.name,entity,action,entity==='students'?record.id:record.student_id||null,String(label),new Date().toISOString(),...(receiptGuard?[receiptGuard]:[])
 ]);
}
function dateKey(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]).reduce((out,[key,value])=>({...out,[key]:value}),{});}
function day(date){const p=dateKey(date);return `${p.year}-${p.month}-${p.day}`;}
export function calendarReminders(followups,now=new Date()){
 const today=day(now),end=day(new Date(now.getTime()+2*86400000));
 return followups.flatMap(task=>{
  const raw=String(task.starts_at||''),date=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)?raw:raw.replace(' ','T')+'+05:30');
  if(Number.isNaN(date.getTime())||task.status==='Done')return [];
  const key=day(date);if(key<today||key>end)return [];
  const when=key===today?'Today':key===end?'In 2 days':'Tomorrow';
  return [{id:`reminder:${task.id}:${task.starts_at}`,category:'calendar',title:`${task.purpose} · ${when.toLowerCase()}`,message:`${task.student_name||task.student_id} · ${new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date)}`,created_at:date.toISOString(),priority:task.priority==='High'?'urgent':'normal',studentId:task.student_id,actionView:'calendar',icon:'calendar-clock',iconColor:task.priority==='High'?'amber':'blue',time:when}];
 });
}
const category={students:'new-person',properties:'system',leads:'followup',followups:'calendar',payments:'payment',documents:'system'};
const singular={students:'Student',properties:'Apartment',leads:'Opportunity',followups:'Follow-up',payments:'Payment',documents:'Document'};
export async function notificationFeed(db,user,now=new Date()){
 const result=await db.batch([
  query(db,"SELECT a.*,r.state AS request_state FROM crm_activity a LEFT JOIN students s ON s.id=a.student_id LEFT JOIN status_requests r ON r.id=a.status_request_id WHERE s.archived_at IS NULL AND (a.action IN ('status_draft','status_finalized','status_rejected') OR ((a.student_id IS NULL OR a.student_id NOT LIKE 'DEMO-%') AND COALESCE(CASE WHEN json_valid(s.profile_json) THEN json_extract(s.profile_json,'$.is_demo') END,0)!=1)) ORDER BY a.created_at DESC,a.id DESC LIMIT 100"),
  query(db,"SELECT f.*,s.name AS student_name FROM followups f JOIN students s ON s.id=f.student_id WHERE s.archived_at IS NULL AND f.status!='Done' AND f.id NOT LIKE 'DEMO-%' AND s.id NOT LIKE 'DEMO-%' AND COALESCE(CASE WHEN json_valid(s.profile_json) THEN json_extract(s.profile_json,'$.is_demo') END,0)!=1 ORDER BY f.starts_at"),
  query(db,'SELECT * FROM notification_receipts WHERE user_id=?',[user.id])
 ]);
 const receipts=new Map(result[2].results.map(r=>[r.notification_id,r]));
 const activity=result[0].results.filter(event=>event.action!=='status_draft'||event.request_state==='Pending').map(event=>({id:event.id,actorId:event.actor_id,actorName:event.actor_name,category:category[event.entity]||'system',title:({status_draft:'Status draft submitted',status_finalized:'Status finalized',status_rejected:'Status draft rejected',document_submitted:'Document draft submitted',document_approved:'Document approved',document_rejected:'Document needs changes',requirements_updated:'Document checklist updated'})[event.action]||`${singular[event.entity]||'Record'} ${['created','deleted','archived','restored'].includes(event.action)?event.action:'updated'}`,message:`${event.actor_name} · ${event.label}`,created_at:event.created_at,studentId:event.action==='deleted'?null:event.student_id,actionTab:event.entity==='documents'?'details':null,actionView:{students:'students',properties:'properties',leads:'leads',followups:'calendar',payments:'payments',documents:'students'}[event.entity],icon:{students:'user-plus',properties:'building-2',leads:'list-filter',followups:'calendar-check',payments:'credit-card',documents:'files'}[event.entity]||'bell',iconColor:event.entity==='payments'?'green':'blue',priority:'normal',statusRequestId:event.status_request_id||null,statusRequestState:event.request_state||null}));
 return [...calendarReminders(result[1].results,now),...activity].filter(item=>!receipts.get(item.id)?.dismissed).map(item=>({...item,unread:!receipts.get(item.id)?.is_read}));
}
export async function handleNotifications(request,env,user,path){
 if(request.method==='GET'&&path==='/api/notifications')return json({notifications:await notificationFeed(env.DB,user)});
 if(request.method!=='POST')throw new AuthError(404,'Notification route not found');
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)throw new AuthError(403,'Cross-origin changes are not allowed');
 const action=path.split('/').pop();if(!['read','dismiss','read-all','clear-read'].includes(action))throw new AuthError(404,'Notification route not found');
 const feed=await notificationFeed(env.DB,user);let ids;
 if(action==='read-all')ids=feed.map(item=>item.id);
 else if(action==='clear-read')ids=feed.filter(item=>!item.unread).map(item=>item.id);
 else{let body;try{body=await request.json()}catch{throw new AuthError(400,'Invalid JSON')};if(!Array.isArray(body.ids)||body.ids.length>200||body.ids.some(id=>typeof id!=='string'))throw new AuthError(400,'Provide up to 200 notification IDs');const allowed=new Set(feed.map(item=>item.id));ids=[...new Set(body.ids)].filter(id=>allowed.has(id));}
 if(ids.length)await env.DB.batch(ids.map(id=>query(env.DB,'INSERT INTO notification_receipts(user_id,notification_id,is_read,dismissed) VALUES(?,?,1,?) ON CONFLICT(user_id,notification_id) DO UPDATE SET is_read=1,dismissed=MAX(notification_receipts.dismissed,excluded.dismissed)',[user.id,id,['dismiss','clear-read'].includes(action)?1:0])));
 return json({ok:true});
}
