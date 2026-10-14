import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const script=readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function run(url){let destination;const parsed=new URL(url),location={protocol:parsed.protocol,hostname:parsed.hostname,port:parsed.port,hash:parsed.hash,search:parsed.search,replace(value){destination=value}};vm.runInNewContext(script,{location});return destination}
test('Live Server redirects to Worker preview and preserves the selected view',()=>{
 assert.equal(run('http://127.0.0.1:5500/index.html#students'),'http://127.0.0.1:3000/#students');
 assert.equal(run('http://localhost:5501/index.html'),'http://localhost:3000/');
 assert.equal(run('file:///Users/demo/index.html'),'http://localhost:3000/');
});
test('Worker preview and hosted app keep same-origin API requests',()=>{
 assert.equal(run('http://localhost:3000/'),undefined);
 assert.equal(run('http://localhost:8787/'),undefined);
 assert.equal(run('https://crm.example.com/'),undefined);
});

test('GitHub Pages opens the deployed CRM and preserves view and query',()=>{
 assert.equal(run('https://mkdd07.github.io/adotrip-dashboard/?source=github#properties'),'https://adotrip-campus-crm.mkmkataria07.workers.dev/?source=github#properties');
 assert.equal(run('https://adotrip-campus-crm.mkmkataria07.workers.dev/#properties'),undefined);
});
