import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('notifications group by actor, use separate colors and clear read cards from their tab',()=>{
 const nodes=new Map(),get=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',hidden:false,setAttribute(){}});return nodes.get(selector)};
 const notifications=[{id:'h1',actorId:'hitesh',actorName:'Hitesh',title:'Hitesh change',message:'Real student update',unread:true},{id:'p1',actorId:'pooja',actorName:'Pooja',title:'Pooja change',unread:true},{id:'r1',title:'Scheduled reminder',unread:true},{id:'old',actorId:'hitesh',actorName:'Hitesh',title:'Already read',unread:false}];
 const ctx={$:get,notifications,activeNotifFilter:'all',notificationError:'',signedInUser:{id:'viewer'},esc:String,icons(){}};vm.createContext(ctx);const source=readFileSync('app.js','utf8');vm.runInContext(source.slice(source.indexOf('const notificationActorColors='),source.indexOf('function initNotificationHandlers()')),ctx);
 vm.runInContext('renderNotifications()',ctx);assert.match(get('#notificationActorTabs').innerHTML,/Hitesh/);assert.match(get('#notificationActorTabs').innerHTML,/Pooja/);assert.match(get('#notificationActorTabs').innerHTML,/Reminders/);assert.match(get('#notificationList').innerHTML,/notif-tone-0/);assert.match(get('#notificationList').innerHTML,/notif-tone-1/);assert.ok(!get('#notificationList').innerHTML.includes('Already read'));assert.equal(get('#notificationBadge').textContent,3);
 vm.runInContext("activeNotifFilter='actor:hitesh';renderNotifications()",ctx);assert.match(get('#notificationList').innerHTML,/Hitesh change/);assert.ok(!get('#notificationList').innerHTML.includes('Pooja change'));
 notifications[0].unread=false;vm.runInContext('renderNotifications()',ctx);assert.match(get('#notificationList').innerHTML,/All caught up/);assert.equal(get('#notificationBadge').textContent,2);assert.equal(get('#markAllReadBtn').disabled,true);
 vm.runInContext("activeNotifFilter='reminders';renderNotifications()",ctx);assert.match(get('#notificationList').innerHTML,/Scheduled reminder/);assert.ok(!get('#notificationList').innerHTML.includes('Pooja change'));
});
