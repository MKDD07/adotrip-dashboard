import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {webcrypto,pbkdf2Sync} from 'node:crypto';
function context(fetch){const nodes=new Map(),element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,value:'',textContent:'',focus(){},setAttribute(){}});return nodes.get(id)};const ctx={document:{getElementById:element,querySelectorAll:()=>[]},window:{},staticLoginPreview:true,fetch,console,crypto:webcrypto,TextEncoder,Uint8Array};vm.createContext(ctx);vm.runInContext(readFileSync('login.js','utf8'),ctx);return ctx}
test('login redirects local static previews to the Worker',()=>{const script=readFileSync('login.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];let redirected;vm.runInNewContext(script,{location:{protocol:'http:',hostname:'127.0.0.1',port:'5500',search:'?change=1',replace:url=>redirected=url}});assert.equal(redirected,'http://127.0.0.1:3000/login?change=1')});
test('login handles empty, HTML, malformed and valid JSON responses',async()=>{
 for(const [response,error] of [[new Response('',{status:502}),'empty response'],[new Response('<!DOCTYPE html><html></html>',{headers:{'Content-Type':'text/html'}}),'not connected'],[new Response('{',{headers:{'Content-Type':'application/json'}}),'invalid response']]){const ctx=context(async()=>response);await assert.rejects(vm.runInContext("authApi('session')",ctx),new RegExp(error))}
 const ctx=context(async()=>Response.json({user:null}));assert.equal((await vm.runInContext("authApi('session')",ctx)).user,null);
 const unauthorized=context(async()=>Response.json({error:'Email or password is incorrect'},{status:401}));await assert.rejects(vm.runInContext("authApi('login',{})",unauthorized),/Email or password is incorrect/);
});

test('GitHub Pages sign-in redirects to the deployed login with first-login state',()=>{
 const script=readFileSync('login.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];let redirected;
 vm.runInNewContext(script,{location:{protocol:'https:',hostname:'mkdd07.github.io',port:'',search:'?change=1',replace:url=>redirected=url}});
 assert.equal(redirected,'https://adotrip-campus-crm.mkmkataria07.workers.dev/login?change=1');
});

test('first sign-in changes the password without requiring a current password',async()=>{
 const requests=[];const ctx=context(async(url,options)=>{requests.push({url,body:options.body&&JSON.parse(options.body)});return Response.json(url.endsWith('/session')?{user:{name:'Alice',must_change_password:true}}:{ok:true})});
 let destination;ctx.location={replace:url=>destination=url};
 ctx.document.getElementById('newPassword').value='New_password_2026!';ctx.document.getElementById('confirmPassword').value='New_password_2026!';
 const button={disabled:false};await ctx.document.getElementById('changePasswordForm').onsubmit({preventDefault(){},target:{querySelector:()=>button}});
 assert.equal(requests[1].body.new_password,'New_password_2026!');assert.equal(requests[1].body.new_password_key,pbkdf2Sync('New_password_2026!',Buffer.from(requests[1].body.new_password_salt,'hex'),210000,64,'sha512').toString('hex'));assert.equal(requests[1].body.current_password_key,undefined);assert.equal(destination,'/');assert.equal(button.disabled,false);
});
test('existing accounts request the current password and send it on retry',async()=>{
 const requests=[];const ctx=context(async(url,options)=>{requests.push({url,body:options.body&&JSON.parse(options.body)});return Response.json(url.endsWith('/session')?{user:{name:'Alice',email:'alice@example.com',must_change_password:false}}:url.endsWith('/login-info')?{algorithm:'PBKDF2',hash:'SHA-512',iterations:210000,salt:'ab'.repeat(24),length:512}:{ok:true})});
 ctx.location={replace(){}};ctx.document.getElementById('newPassword').value='New_password_2026!';ctx.document.getElementById('confirmPassword').value='New_password_2026!';
 const event={preventDefault(){},target:{querySelector:()=>({disabled:false})}};
 await ctx.document.getElementById('changePasswordForm').onsubmit(event);
 assert.equal(requests.length,1);assert.equal(ctx.document.getElementById('currentPasswordField').hidden,false);assert.equal(ctx.document.getElementById('currentPassword').required,true);
 ctx.document.getElementById('currentPassword').value='Old_password_2026!';
 await ctx.document.getElementById('changePasswordForm').onsubmit(event);
 const payload=requests.find(request=>request.url.endsWith('/password')).body;assert.equal(payload.new_password,'New_password_2026!');assert.equal(payload.current_password,'Old_password_2026!');assert.equal(payload.current_password_key,pbkdf2Sync('Old_password_2026!',Buffer.from('ab'.repeat(24),'hex'),210000,64,'sha512').toString('hex'));assert.equal(payload.new_password_key,pbkdf2Sync(payload.new_password,Buffer.from(payload.new_password_salt,'hex'),210000,64,'sha512').toString('hex'));
});
test('expired password-change sessions return to sign-in without posting a password',async()=>{
 let requests=0;const ctx=context(async()=>{requests++;return Response.json({user:null})});
 ctx.document.getElementById('newPassword').value='New_password_2026!';ctx.document.getElementById('confirmPassword').value='New_password_2026!';
 await ctx.document.getElementById('changePasswordForm').onsubmit({preventDefault(){},target:{querySelector:()=>({disabled:false})}});
 assert.equal(requests,1);assert.equal(ctx.document.getElementById('loginForm').hidden,false);assert.equal(ctx.document.getElementById('changePasswordForm').hidden,true);assert.match(ctx.document.getElementById('loginError').textContent,/session expired/);assert.equal(ctx.document.getElementById('newPassword').value,'');
});

test('password errors preserve structured server reasons and include status when no reason is returned',async()=>{
 const structured=context(async()=>Response.json({errors:[{message:'Password service unavailable'}]},{status:503}));
 await assert.rejects(vm.runInContext("authApi('password',{})",structured),/Password service unavailable/);
 const empty=context(async()=>Response.json({},{status:400}));
 await assert.rejects(vm.runInContext("authApi('password',{})",empty),/Password update failed \(HTTP 400\)/);
});

test('legacy credentials derive in the browser and never send a password hash verifier',async()=>{
 const salt='ab'.repeat(24),ctx=context(async()=>Response.json({algorithm:'PBKDF2',hash:'SHA-512',iterations:210000,salt,length:512}));
 const credential=await vm.runInContext("passwordCredential('alice@example.com','Browser-only legacy password!')",ctx);
 assert.equal(credential.password,undefined);assert.equal(credential.password_key,pbkdf2Sync('Browser-only legacy password!',Buffer.from(salt,'hex'),210000,64,'sha512').toString('hex'));
});
