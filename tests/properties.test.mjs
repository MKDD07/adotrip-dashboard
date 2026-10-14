import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){
 const nodes=new Map();
 const el=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',hidden:false,style:{},dataset:{},attributes:{},setAttribute(k,v){this.attributes[k]=v},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){}});return nodes.get(selector)};
 const context=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},window:{},staticPreview:true,URLSearchParams,setTimeout,console});
 vm.runInContext(readFileSync('app.js','utf8'),context);
 const state={students:[{id:'S1',name:'Aditi Sharma',image:'/api/media/students/S1'},{id:'S2',name:'Rohan Nair',image:'/api/media/students/S2'}],properties:[{id:'P1',name:'London Studio',location:'London, United Kingdom',price:307200,type:'Studio',rooms:3,amenities:'Wi-Fi'}],leads:[],payments:[],followups:[]};
 context.fixture=state;
 return {context,state,el,run:code=>vm.runInContext(code,context)};
}
test('property skeletons resolve to an available card without a download button',()=>{
 const {el,run}=setup();
 run('renderProperties()');
 assert.equal(el('#propertyGrid').attributes['aria-busy'],'true');
 assert.equal((el('#propertyGrid').innerHTML.match(/class="property-card property-card-skeleton"/g)||[]).length,6);
 run('data=fixture;propertiesLoading=false;renderProperties()');
 const html=el('#propertyGrid').innerHTML;
 assert.equal(el('#propertyGrid').attributes['aria-busy'],'false');
 assert.match(html,/Shortlist/);
 assert.doesNotMatch(html,/download|property-card-skeleton/);
});
test('unpaid selection shows a student profile while paid booking fades the card and disables shortlisting',()=>{
 const {state,el,run}=setup();
 state.leads=[{student_id:'S1',property_id:'P1',status:'Converted'},{student_id:'S2',property_id:'P1',status:'Interested'}];
 state.payments=[{student_id:'S1',property_id:'P1',status:'Pending',booking:'On hold'}];
 run('data=fixture;propertiesLoading=false;renderProperties()');
 let html=el('#propertyGrid').innerHTML;
 assert.match(html,/data-student-profile="S1"/);
 assert.match(html,/src="\/api\/media\/students\/S1"/);
 assert.match(html,/Payment pending/);
 assert.doesNotMatch(html,/property-card-booked|disabled/);
 state.payments[0].status='Successful';state.payments[0].booking='Confirmed';
 run('renderProperties()');html=el('#propertyGrid').innerHTML;
 assert.match(html,/property-card-booked/);
 assert.match(html,/property-person-booked/);
 assert.match(html,/data-property-shortlist="P1" disabled/);
 assert.match(html,/data-student-profile="S2"/);
 run("shortlist('P1')"); // A booked card cannot open the booking modal.
 state.payments[0].status='Refunded';state.payments[0].booking='Cancelled';
 state.leads[0].status='Lost';
 run('renderProperties()');html=el('#propertyGrid').innerHTML;
 assert.doesNotMatch(html,/property-card-booked|data-student-profile="S1"/);
 assert.match(html,/data-student-profile="S2"/);
});
test('initial data failure replaces skeletons with a retry message',()=>{
 const {el,run,context}=setup();context.error=new Error('Connection failed');
 run('renderProperties();showDataError(error)');
 assert.equal(el('#propertyGrid').attributes['aria-busy'],'false');
 assert.match(el('#propertyGrid').innerHTML,/Retry the connection/);
 assert.doesNotMatch(el('#propertyGrid').innerHTML,/property-card-skeleton/);
});
