import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('presence failure does not hide a working team directory and retry recovers failed directory loading',async()=>{
 const source=readFileSync('app.js','utf8');
 const refresh=source.slice(source.indexOf('async function refreshTeam(){'),source.indexOf('function showMessageError'));
 const list={innerHTML:'',querySelector(){return this.innerHTML==='members'?{}:null}};
 let failDirectory=false,renders=0;
 const context=vm.createContext({signedInUser:{id:'me'},teamMembers:[],activeChatId:null,document:{hidden:false},$:()=>list,esc:text=>text,console:{warn(){}},renderTeam(){renders++;list.innerHTML='members'},api:async path=>{
  if(path.endsWith('/presence'))throw Error('Heartbeat unavailable');
  if(failDirectory)throw Error('Directory unavailable');
  return {users:[{id:'other',name:'Other member',online:false}]};
 }});
 vm.runInContext(refresh,context);
 await vm.runInContext('refreshTeam()',context);
 assert.equal(renders,1);assert.equal(list.innerHTML,'members');
 vm.runInContext('teamMembers=[]',context);failDirectory=true;
 await vm.runInContext('refreshTeam()',context);assert.match(list.innerHTML,/Directory unavailable/);assert.match(list.innerHTML,/data-team-retry/);
 failDirectory=false;await vm.runInContext('refreshTeam()',context);assert.equal(list.innerHTML,'members');assert.equal(renders,2);
});
