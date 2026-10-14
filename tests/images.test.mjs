import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSearch } from '../worker/images.mjs';
import worker from '../worker/index.mjs';
const request=(target,query='Indian student portrait test')=>new Request('https://crm.example/api/images?'+new URLSearchParams({target,query,kind:'person'}));
test('Pexels search keeps the key server-side, uses query/target, and shares cached searches',async()=>{
 let calls=0;
 const upstream=async(url,options)=>{calls++;assert.equal(new URL(url).searchParams.get('query'),'Indian student portrait test');assert.equal(new URL(url).searchParams.get('orientation'),'portrait');assert.equal(options.headers.Authorization,'test-server-only-key');return Response.json({photos:Array.from({length:20},(_,i)=>({id:i,src:{portrait:`https://images.pexels.com/photos/${i}/test.jpg`},photographer:'Demo photographer',url:`https://www.pexels.com/photo/${i}`,alt:'Portrait',avg_color:'#aaa'}))})};
 const env={PEXELS_API_KEY:'test-server-only-key'};
 const first=await (await imageSearch(request('DEMO-STU-001'),env,null,upstream)).json();
 const same=await (await imageSearch(request('DEMO-STU-001'),env,null,upstream)).json();
 const other=await (await imageSearch(request('DEMO-STU-002'),env,null,upstream)).json();
 assert.equal(calls,1);assert.equal(first.id,same.id);assert.notEqual(first.id,other.id);assert.equal(first.target,'DEMO-STU-001');assert.equal(first.illustrative,true);assert.ok(!JSON.stringify(first).includes(env.PEXELS_API_KEY));
});
test('image route works independently of D1 and validates requests and missing secrets',async()=>{
 assert.equal((await worker.fetch(request('demo'),{})).status,401);
 assert.equal((await imageSearch(new Request('https://crm.example/api/images?query=test'),{PEXELS_API_KEY:'test'})).status,400);
 const fail=async()=>new Response('',{status:429});
 assert.equal((await imageSearch(request('demo','unique quota test'),{PEXELS_API_KEY:'test'},null,fail)).status,502);
});

test('photo delivery caches bytes in R2 and returns a downloadable image',async()=>{
 const {serveStockPhoto}=await import('../worker/images.mjs');const objects=new Map();let imageFetches=0;
 const MEDIA={async get(key){const obj=objects.get(key);return obj?{body:obj.bytes,httpEtag:'"photo-etag"',writeHttpMetadata(h){h.set('Content-Type',obj.mime)}}:null},async put(key,bytes,options){objects.set(key,{bytes:new Uint8Array(bytes),mime:options.httpMetadata.contentType})}};
 const upstream=async(url)=>{if(new URL(url).hostname==='api.pexels.com')return Response.json({photos:[{id:901,src:{portrait:'https://images.pexels.com/photos/901/test.jpg'},photographer:'Test',url:'https://www.pexels.com/photo/901'}]});imageFetches++;return new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}})};
 const req=new Request('https://crm.example/api/images/file?'+new URLSearchParams({target:'demo-r2',query:'unique R2 cache portrait',kind:'person',download:'1'}));
 const env={MEDIA,PEXELS_API_KEY:'test'};
 const first=await serveStockPhoto(req,env,null,upstream);assert.equal(first.status,200);assert.equal(first.headers.get('Content-Type'),'image/jpeg');assert.match(first.headers.get('Content-Disposition'),/attachment; filename="photo-901.jpg"/);assert.deepEqual([...new Uint8Array(await first.arrayBuffer())],[255,216,255,217]);
 const second=await serveStockPhoto(req,env,null,upstream);assert.equal(second.status,200);assert.equal(imageFetches,1);assert.equal(objects.size,1);
});
