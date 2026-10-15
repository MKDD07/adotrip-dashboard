import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){
 const nodes=new Map(),el=selector=>{
  if(!nodes.has(selector)){const classes=new Set();nodes.set(selector,{value:'',innerHTML:'',textContent:'',hidden:false,dataset:{},style:{},attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,v){if(v)classes.add(k);else classes.delete(k)},contains:k=>classes.has(k)},addEventListener(k,fn){this.listeners[k]=fn}})}return nodes.get(selector);
 };
 const context=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},window:{},staticPreview:true,URLSearchParams,setTimeout,console});
 vm.runInContext(readFileSync('app.js','utf8'),context);
 const state={students:[{id:'A',student_code:'ADO24-001',name:'Anika Shah',mobile:'+91 98765 43210',email:'anika@example.com',city:'London',course:'MSc',agent:'Arjun',status:'Interested',budget:239000,created_at:'2024-03-12',notes:'Needs a furnished studio',profile_json:JSON.stringify({college:'UCL',guardian_name:'Guardian Shah'})},{id:'B',student_code:'ADO25-001',name:'Kabir Khan',city:'Toronto',course:'MBA',agent:'Priya',status:'Converted',budget:200000,created_at:'2025-09-01'},{id:'C',student_code:'ADO26-001',name:'Meera Iyer',city:'London',course:'MSc',agent:'Arjun',status:'Contacted',budget:220000,created_at:'2025-12-31 21:00:00'}],properties:[{id:'P1',name:'Bloomsbury Studio',location:'London',price:239000}],leads:[{id:'L1',student_id:'A',property_id:'P1',status:'Interested'}],payments:[{student_id:'A',property_id:'P1',status:'Successful',amount:23900}],followups:[{student_id:'A',starts_at:'2026-10-16T10:00',priority:'High',status:'Pending',purpose:'Callback'},{student_id:'A',starts_at:'2026-10-15T10:00',priority:'Medium',status:'Pending'},{student_id:'B',starts_at:'2025-09-01T10:00',priority:'High',status:'Done'}],status_requests:[{id:'R1',student_id:'A',entity:'students',record_id:'A',from_status:'Interested',proposed_status:'Converted',requested_by:'agent',requested_by_name:'Agent',state:'Pending'}]};
 context.fixture=state;
 vm.runInContext("data=fixture;studentListReady=true;propertiesLoading=false;signedInUser={id:'agent',name:'Agent',role:'agent'}",context);
 return {el,state,context,run:code=>vm.runInContext(code,context),json:code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context))};
}
test('student list combines year, month, approved status, priority, owner, city, course and approval filters',()=>{
 const {json,run}=setup();
 const result=filters=>json(`filterStudentList(studentListRecords(),${JSON.stringify(filters)}).map(r=>r.student.id)`);
 assert.deepEqual(result({year:'2024',month:'03',status:'Interested',priority:'High',owner:'Arjun',city:'London',course:'MSc',approval:'pending'}),['A']);
 assert.deepEqual(result({year:'2024',month:'09'}),[]);
 assert.deepEqual(result({status:'Converted'}),['B']); // A's proposed status does not count as approved.
 assert.deepEqual(result({priority:'High'}),['A']); // B's completed high-priority task is excluded.
 assert.deepEqual(result({priority:'None'}),['C','B']);
 assert.deepEqual(result({year:'2026',month:'01'}),['C']); // UTC database timestamp crosses into India year 2026.
 for(const search of ['ADO24-001','9876543210','guardian shah','Bloomsbury','furnished studio'])assert.deepEqual(result({search}),['A']);
 assert.deepEqual(result({sort:'oldest'}),['A','B','C']);
 assert.equal(json('studentListRecords()[0].received'),23900);
 assert.equal(json('studentListRecords()[0].open[0].priority'),'Medium');
 run("data.followups.push({student_id:'A',status:'Done',priority:'High'})");assert.deepEqual(result({priority:'High'}),['A']);
});
test('student list paginates, clamps after filtering and resets filters without losing the directory data',()=>{
 const {el,run,json}=setup();
 run("data.students=Array.from({length:60},(_,i)=>({...fixture.students[0],id:'S'+i,name:'Student '+i,student_code:'ADO24-'+String(i+1).padStart(3,'0')}));renderStudentList()");
 assert.equal((el('#studentListRows').innerHTML.match(/data-directory-row=/g)||[]).length,25);
 assert.match(el('#studentListRange').textContent,/1–25 of 60/);
 run('studentListPage=3;renderStudentList()');assert.match(el('#studentListRange').textContent,/51–60 of 60/);
 el('#studentListSearch').value='ADO24-001';run('renderStudentList()');assert.equal(json('studentListPage'),1);assert.match(el('#studentListRange').textContent,/1–1 of 1/);
 el('#studentListYear').value='2025';run('renderStudentList()');assert.match(el('#studentListRows').innerHTML,/No students match/);
 run('resetStudentListFilters()');assert.equal(el('#studentListYear').value,'');assert.equal(el('#studentListSearch').value,'');assert.equal(json('data.students.length'),60);
});
test('clicking a list row opens Overview in the correct pending/finalized workspace and returning preserves filters',()=>{
 const {el,run}=setup();
 el('#studentListYear').value='2025';el('#studentListMonth').value='09';
 run("activeProfileTab='payments';showView('directory')");assert.equal(el('#viewTitle').textContent,'Students');
 el('#studentListRows').listeners.click({target:{closest:()=>({dataset:{directoryRow:'B'}})}});
 assert.equal(el('#profileTitle').textContent,'Kabir Khan');assert.equal(el('#viewTitle').textContent,'Finalized');assert.match(el('#profileBody').innerHTML,/id="student-tab-overview" class="student-profile-tab active"/);assert.equal(el('#returnToStudentList').hidden,false);
 el('#returnToStudentList').onclick();assert.equal(el('#viewTitle').textContent,'Students');assert.equal(el('#studentListYear').value,'2025');assert.equal(el('#studentListMonth').value,'09');assert.equal(el('#returnToStudentList').hidden,true);
});
