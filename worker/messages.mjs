import {AuthError} from './auth.mjs';
const stmt=(db,sql,values=[])=>db.prepare(sql).bind(...values);
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handleMessages(request,env,user,path){
 const db=env.DB;
 if(path==='/api/team/presence'&&request.method==='POST'){
  const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)throw new AuthError(403,'Cross-origin changes are not allowed');
  const now=Date.now();await stmt(db,'UPDATE auth_sessions SET last_seen=? WHERE token_hash=? AND last_seen<?',[now,user.token_hash,now-15000]).run();
  return json({ok:true});
 }

 if(path==='/api/team'&&request.method==='GET'){
  const rows=await db.batch([stmt(db,`SELECT u.id,u.name,u.role,u.image_url,
   EXISTS(SELECT 1 FROM auth_sessions s WHERE s.user_id=u.id AND s.last_seen>? AND s.expires_at>?) AS online,
   (SELECT count(*) FROM direct_messages m WHERE m.sender_id=u.id AND m.recipient_id=? AND m.read_at IS NULL) AS unread_count,
   (SELECT body FROM direct_messages m WHERE m.sender_id=u.id AND m.recipient_id=? AND m.read_at IS NULL ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS unread_preview
   FROM auth_users u WHERE u.id!=? ORDER BY CASE WHEN u.role='admin' THEN 0 ELSE 1 END,u.name,u.id`,[Date.now()-60000,Date.now(),user.id,user.id,user.id])]);
  return json({users:rows[0].results.map(({image_url,...account})=>({...account,online:Boolean(account.online),avatar_url:image_url?`/api/team/${encodeURIComponent(account.id)}/avatar`:null}))});
 }
 const avatar=path.match(/^\/api\/team\/([^/]+)\/avatar$/);
 if(avatar&&request.method==='GET'){
  const member=await stmt(db,'SELECT id FROM auth_users WHERE id=?',[decodeURIComponent(avatar[1])]).first();if(!member)throw new AuthError(404,'Team member not found');
  const photo=await env.MEDIA?.get(`accounts/${member.id}`);if(!photo)throw new AuthError(404,'Profile photo not found');
  const headers=new Headers({'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});photo.writeHttpMetadata(headers);return new Response(photo.body,{headers});
 }
 const match=path.match(/^\/api\/messages\/([^/]+)(\/read)?$/);if(!match)throw new AuthError(404,'Message route not found');
 const target=decodeURIComponent(match[1]);if(target===user.id)throw new AuthError(400,'Choose another team member');
 const member=await stmt(db,'SELECT id,name,role FROM auth_users WHERE id=?',[target]).first();if(!member)throw new AuthError(404,'Team member not found');
 if(request.method==='GET'&&!match[2]){
  const rows=await db.batch([stmt(db,'SELECT id,sender_id,recipient_id,body,created_at,read_at FROM direct_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at DESC,id DESC LIMIT 80',[user.id,target,target,user.id])]);
  return json({member,messages:rows[0].results.reverse()});
 }
 if(request.method!=='POST')throw new AuthError(404,'Message route not found');
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)throw new AuthError(403,'Cross-origin changes are not allowed');
 let body;try{body=await request.json()}catch{throw new AuthError(400,'Invalid JSON')}
 if(match[2]){
  if(!Array.isArray(body?.ids)||body.ids.length>80||body.ids.some(id=>typeof id!=='string'))throw new AuthError(400,'Provide up to 80 message IDs');
  if(body.ids.length)await db.batch([...new Set(body.ids)].map(id=>stmt(db,'UPDATE direct_messages SET read_at=? WHERE id=? AND sender_id=? AND recipient_id=? AND read_at IS NULL',[new Date().toISOString(),id,target,user.id])));
  return json({ok:true});
 }
 const text=typeof body?.body==='string'?body.body.trim():'';if(!text||text.length>2000)throw new AuthError(400,'Write a message between 1 and 2000 characters');
 const id='message-'+crypto.randomUUID();await stmt(db,'INSERT INTO direct_messages(id,sender_id,recipient_id,body,created_at) VALUES(?,?,?,?,?)',[id,user.id,target,text,new Date().toISOString()]).run();
 return json({id},201);
}
