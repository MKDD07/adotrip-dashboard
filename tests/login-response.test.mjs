import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function context(fetch){const nodes=new Map(),element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,value:'',textContent:'',focus(){},setAttribute(){}});return nodes.get(id)};const ctx={document:{getElementById:element,querySelectorAll:()=>[]},window:{},staticLoginPreview:true,fetch,console};vm.createContext(ctx);vm.runInContext(readFileSync('login.js','utf8'),ctx);return ctx}
test('login redirects local static previews to the Worker',()=>{const script=readFileSync('login.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];let redirected;vm.runInNewContext(script,{location:{protocol:'http:',hostname:'127.0.0.1',port:'5500',search:'?change=1',replace:url=>redirected=url}});assert.equal(redirected,'http://127.0.0.1:3000/login?change=1')});
test('login handles empty, HTML, malformed and valid JSON responses',async()=>{
 for(const [response,error] of [[new Response('',{status:502}),'empty response'],[new Response('<!DOCTYPE html><html></html>',{headers:{'Content-Type':'text/html'}}),'not connected'],[new Response('{',{headers:{'Content-Type':'application/json'}}),'invalid response']]){const ctx=context(async()=>response);await assert.rejects(vm.runInContext("authApi('session')",ctx),new RegExp(error))}
 const ctx=context(async()=>Response.json({user:null}));assert.equal((await vm.runInContext("authApi('session')",ctx)).user,null);
 const unauthorized=context(async()=>Response.json({error:'Email or password is incorrect'},{status:401}));await assert.rejects(vm.runInContext("authApi('login',{})",unauthorized),/Email or password is incorrect/);
});
