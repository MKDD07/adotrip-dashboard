import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import worker from '../worker/index.mjs';
const { build, watch } = createRequire(import.meta.url)('../scripts/build.cjs');

test('editing CSS rebuilds the served asset and changes the URL on both pages', async () => {
 const root=mkdtempSync(join(tmpdir(),'crm-assets-'));
 let watcher;
 try {
  writeFileSync(join(root,'index.html'),'<link href="styles.css"><script src="app.js"></script>');
  writeFileSync(join(root,'login.html'),'<link href="/styles.css"><script src="/login.js"></script>');
  for (const file of ['styles.css','app.js','login.js'])writeFileSync(join(root,file),'original');
  build(root);
  const oldPage=readFileSync(join(root,'dist/index.html'),'utf8');
  watcher=watch(root);
  writeFileSync(join(root,'styles.css'),'changed');
  const deadline=Date.now()+3000;
  while(readFileSync(join(root,'dist/styles.css'),'utf8')!=='changed'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(readFileSync(join(root,'dist/styles.css'),'utf8'),'changed');
  const page=readFileSync(join(root,'dist/index.html'),'utf8'),login=readFileSync(join(root,'dist/login.html'),'utf8');
  assert.notEqual(page,oldPage);
  assert.equal(page.match(/styles\.css\?v=([a-f0-9]+)/)[1],login.match(/styles\.css\?v=([a-f0-9]+)/)[1]);
  assert.match(page,/app\.js\?v=[a-f0-9]+/);
  assert.match(login,/login\.js\?v=[a-f0-9]+/);
 }finally{watcher?.close();rmSync(root,{recursive:true,force:true});}
});

test('versioned public styles and login pages are served without browser or CDN caching', async () => {
 for(const path of ['/styles.css?v=123','/login','/login.js?v=123']){
  const response=await worker.fetch(new Request('https://crm.example'+path),{ASSETS:{fetch:async()=>new Response('current',{headers:{'Cache-Control':'public, max-age=86400','Content-Type':'text/plain'}})}});
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('CDN-Cache-Control'),'no-store');
  assert.equal(await response.text(),'current');
 }
});
