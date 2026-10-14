import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function page(){
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',hidden:false,style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){}});return nodes.get(id)};
 let requests=0,redirect;
 const context={document:{querySelector:el,getElementById:el,querySelectorAll:()=>[],addEventListener(){}},window:{},location:{hostname:'mkdd07.github.io',search:'',hash:'#students',replace:url=>{redirect=url}},staticPreview:false,staticLoginPreview:false,fetch:async()=>{requests++;throw Error('API should not be called')},URLSearchParams,setTimeout,console};
 return {context,requests:()=>requests,redirect:()=>redirect};
}
test('app JS redirects an older GitHub Pages document without starting API calls',()=>{
 const p=page();vm.runInNewContext(readFileSync('app.js','utf8'),p.context);
 assert.equal(p.requests(),0);assert.equal(p.redirect(),'https://adotrip-campus-crm.mkmkataria07.workers.dev/#students');
});
test('login JS redirects an older GitHub Pages document without requesting a session',()=>{
 const p=page();p.context.location.search='?change=1';vm.runInNewContext(readFileSync('login.js','utf8'),p.context);
 assert.equal(p.requests(),0);assert.equal(p.redirect(),'https://adotrip-campus-crm.mkmkataria07.workers.dev/login?change=1');
});
test('data errors do not throw when an older document lacks the error banner',()=>{
 const source=readFileSync('app.js','utf8');const handler=source.slice(source.indexOf('function showDataError('),source.indexOf("if($('#retryData'))"));
 assert.doesNotThrow(()=>vm.runInNewContext(handler+'showDataError(new Error("Offline"))',{propertiesLoading:true,propertiesError:false,renderProperties(){},$:()=>null,console:{error(){}}}));
});
