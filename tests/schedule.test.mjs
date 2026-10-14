import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('today schedule excludes historical and completed tasks and sorts using India date boundaries',()=>{
 const source=readFileSync('app.js','utf8');
 const date=source.slice(source.indexOf('function dashboardDateKey('),source.indexOf('function dashboardData('));
 const tasks=source.slice(source.indexOf('function todaysFollowups('),source.indexOf('function renderTodaySchedule('));
 const context=vm.createContext({tasks:[
  {id:'old',status:'Pending',starts_at:'2026-08-14T14:00:00+05:30'},
  {id:'done',status:'Done',starts_at:'2026-10-14T09:00:00+05:30'},
  {id:'late',status:'Pending',starts_at:'2026-10-14T16:00:00+05:30'},
  {id:'early',status:'Pending',starts_at:'2026-10-14T10:00:00+05:30'},
  {id:'india-midnight',status:'Pending',starts_at:'2026-10-13T20:00:00Z'},
  {id:'tomorrow',status:'Pending',starts_at:'2026-10-14T20:00:00Z'},
  {id:'invalid',status:'Pending',starts_at:'invalid'}
 ]});
 vm.runInContext(date+tasks,context);
 const ids=JSON.parse(vm.runInContext("JSON.stringify(todaysFollowups(tasks,new Date('2026-10-13T23:00:00Z')).map(t=>t.id))",context));
 assert.deepEqual(ids,['india-midnight','early','late']);
});
