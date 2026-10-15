import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createExchangeRateService} from '../worker/exchange-rates.mjs';
function helpers(){
 const source=readFileSync('app.js','utf8');
 const context=vm.createContext({money:n=>'₹'+Number(n||0).toLocaleString('en-IN'),esc:s=>String(s??''),Date,console});
 vm.runInContext(source.slice(source.indexOf("const profileCurrencies="),source.indexOf('function renderStudentProfile(){')),context);
 return code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context));
}
test('10/60/30 stages reconcile to the budget and only count successful receipts',()=>{
 const run=helpers();
 const plan=run("studentPaymentPlan(239000,[{amount:50000,status:'Successful'},{amount:143400,status:'Pending'},{amount:2000,status:'Refunded'}])");
 assert.deepEqual(plan.stages.map(s=>s.amount),[23900,143400,71700]);
 assert.deepEqual(plan.stages.map(s=>s.received),[23900,26100,0]);
 assert.deepEqual(plan.stages.map(s=>s.status),['Paid','Part paid','Awaiting payment']);
 assert.equal(plan.received,50000);assert.equal(plan.outstanding,189000);
 const fractional=run('studentPaymentPlan(1.01,[])');
 assert.equal(Math.round(fractional.stages.reduce((sum,s)=>sum+s.amount,0)*100),101);
 assert.deepEqual(run('studentPaymentPlan(0,[]).stages.map(s=>s.status)'),['Not set','Not set','Not set']);
 const overpaid=run("studentPaymentPlan(100,[{amount:125,status:'Successful'}])");
 assert.equal(overpaid.outstanding,0);assert.equal(overpaid.excess,25);
});
test('display conversion uses fetched rates without changing INR plan amounts',()=>{
 const run=helpers();
 assert.equal(run("(profileCurrency='USD',profileMoney(239000))"),'—');
 const markup=run("(profileFx={rates:{USD:0.01},dates:{USD:'2026-10-15'}},paymentPlanMarkup({budget:239000},[]))");
 assert.match(markup,/USD.*2,390\.00/);
 assert.match(markup,/2026-10-15/);
 assert.match(markup,/10%/);assert.match(markup,/60%/);assert.match(markup,/30%/);
 assert.equal(run('studentPaymentPlan(239000,[]).total'),239000);
});
const rows=['USD','GBP','EUR','CAD','AUD','AED','SGD'].map((quote,index)=>({base:'INR',quote,date:'2026-10-15',rate:.01+index*.001}));
test('rate service deduplicates concurrent requests, caches for one hour and labels stale fallback',async()=>{
 let time=0,calls=0,fail=false;
 const latest=createExchangeRateService({now:()=>time,fetcher:async()=>{calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>rows}}});
 const [a,b]=await Promise.all([latest(),latest()]);
 assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.rates.INR,1);assert.equal(a.stale,false);
 time=1000;await latest();assert.equal(calls,1);
 time=3600001;fail=true;const stale=await latest();
 assert.equal(calls,2);assert.equal(stale.stale,true);assert.equal(stale.dates.USD,'2026-10-15');
});
test('rate service rejects missing, invalid and unavailable rates rather than inventing conversions',async()=>{
 for(const result of [{ok:false},{ok:true,json:async()=>[]},{ok:true,json:async()=>rows.map(row=>({...row,rate:-1}))}]){
  await assert.rejects(createExchangeRateService({fetcher:async()=>result})());
 }
});
