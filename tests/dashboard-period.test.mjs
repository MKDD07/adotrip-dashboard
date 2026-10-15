import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('dashboard periods filter each record by its reporting date and use India date boundaries', () => {
 const source=readFileSync('app.js','utf8');
 const start=source.indexOf("let dashboardPeriod='month';");
 const end=source.indexOf('function updateDashboardPeriod()', start);
 const context=vm.createContext({data:{
  students:[{id:'month',created_at:'2026-10-01'},{id:'year',created_at:'2026-01-01'},{id:'old',created_at:'2025-10-01'},{id:'boundary',created_at:'2026-09-30T20:00:00Z'},{id:'invalid',created_at:'invalid'}],
  leads:[{created_at:'2026-09-01'},{created_at:'2026-10-01'}],
  payments:[{paid_at:'2026-01-01',amount:200},{paid_at:'2026-10-01',amount:100}],
  followups:[{created_at:'2026-01-01',starts_at:'2026-10-15T14:30'},{created_at:'2026-10-01',starts_at:'2026-11-01T14:30'}],properties:[]
 }});
 vm.runInContext(source.slice(start,end),context);
 const run=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context));
 assert.deepEqual(run("dashboardData(new Date('2026-10-14T00:00:00Z')).students.map(s=>s.id)"),['month','boundary']);
 assert.equal(run("dashboardData(new Date('2026-10-14')).payments.reduce((sum,p)=>sum+p.amount,0)"),100);
 assert.equal(run("dashboardData(new Date('2026-10-14')).followups.length"),1);
 assert.equal(run("dashboardBuckets(new Date('2024-02-14')).length"),29);
 vm.runInContext("dashboardPeriod='year'",context);
 assert.deepEqual(run("dashboardData(new Date('2026-10-14')).students.map(s=>s.id)"),['month','year','boundary']);
 assert.equal(run("dashboardData(new Date('2026-10-14')).payments.reduce((sum,p)=>sum+p.amount,0)"),300);
 assert.equal(run("dashboardBuckets(new Date('2026-10-14')).length"),12);
 assert.equal(context.data.students.length,5);
});

test('selected year changes enquiry, booking and payment totals and monthly chart buckets', () => {
 const source=readFileSync('app.js','utf8');
 const context=vm.createContext({data:{
  students:[{created_at:'2024-10-03'},{created_at:'2025-10-03'},{created_at:'2025-12-03'},{created_at:'2026-10-03'}],
  leads:[{created_at:'2024-10-03',status:'Converted'},{created_at:'2025-10-03',status:'Converted'},{created_at:'2025-12-03',status:'Converted'}],
  payments:[{paid_at:'2024-10-03',amount:187000},{paid_at:'2025-10-03',amount:225000}],followups:[],properties:[]
 }});
 vm.runInContext(source.slice(source.indexOf("let dashboardPeriod='month';"),source.indexOf('function updateDashboardPeriod()')),context);
 const run=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context));
 vm.runInContext("dashboardYear=2024;dashboardPeriod='year'",context);
 assert.equal(run('dashboardData().students.length'),1);
 assert.equal(run("dashboardData().leads.filter(l=>l.status==='Converted').length"),1);
 assert.equal(run('dashboardData().payments[0].amount'),187000);
 assert.equal(run('dashboardBuckets()[0].key'),'2024-01');
 assert.equal(run('dashboardBuckets()[11].key'),'2024-12');
 vm.runInContext('dashboardYear=2025',context);
 assert.equal(run('dashboardData().students.length'),2);
 assert.equal(run("dashboardData().leads.filter(l=>l.status==='Converted').length"),2);
 assert.equal(run('dashboardData().payments[0].amount'),225000);
 assert.equal(run('dashboardPeriodLabel()'),'2025');
 vm.runInContext("dashboardPeriod='month'",context);
 assert.equal(run("dashboardData(new Date('2026-10-15')).students.length"),1);
 vm.runInContext('dashboardYear=2024',context);
 assert.equal(run("dashboardBuckets(new Date('2026-02-15')).length"),29);
});
