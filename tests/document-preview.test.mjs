import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function preview(fetcher){
 const nodes=new Map(),revoked=[],created=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{children:[],hidden:false,textContent:'',classList:{add(){},remove(){}},replaceChildren(){this.children=[]},append(value){this.children.push(value)},showModal(){this.open=true}});return nodes.get(id)};
 const source=readFileSync('app.js','utf8'),start=source.indexOf('let documentPreviewUrl='),end=source.indexOf("$('#profileBody').addEventListener('click',event=>{const button=event.target.closest('[data-document-view]')",start);
 const context=vm.createContext({$:node,API_ORIGIN:'',selectedStudentId:'S',data:{documents:[{id:'PDF',student_id:'S',filename:'Admission.pdf',state:'Pending'},{id:'IMG',student_id:'S',filename:'Photo.png',state:'Approved'},{id:'OTHER',student_id:'Other',filename:'Private.pdf'}]},AbortController,fetch:fetcher,URL:{createObjectURL(blob){const url='blob:preview-'+created.length;created.push({url,blob});return url},revokeObjectURL:url=>revoked.push(url)},document:{body:node('body'),createElement:tag=>({tag})}});
 vm.runInContext(source.slice(start,end),context);
 return {node,context,revoked,created,run:code=>vm.runInContext(code,context)};
}
test('preview renders PDFs and images, keeps Download, and releases file URLs when closed or replaced',async()=>{
 const requests=[],p=preview(async(url,options)=>{requests.push({url,options});return new Response('fixture',{headers:{'Content-Type':url.includes('/PDF/')?'application/pdf':'image/png'}})});
 await p.run("openDocumentPreview('PDF')");
 assert.equal(p.node('#documentPreview').open,true);assert.equal(p.node('#documentPreviewTitle').textContent,'Admission.pdf');assert.equal(p.node('#documentPreviewState').textContent,'Draft · awaiting review');
 assert.equal(p.node('#documentPreviewDownload').href,'/api/student-documents/PDF/file');
 assert.equal(p.node('#documentPreviewContent').children[0].tag,'iframe');assert.equal(p.node('#documentPreviewContent').children[0].title,'Admission.pdf');
 await p.run("openDocumentPreview('IMG')");assert.deepEqual(p.revoked,['blob:preview-0']);
 const img=p.node('#documentPreviewContent').children[0];assert.equal(img.tag,'img');assert.equal(img.alt,'Photo.png');img.onload();assert.equal(p.node('#documentPreviewFeedback').hidden,true);
 p.run('clearDocumentPreview()');assert.deepEqual(p.revoked,['blob:preview-0','blob:preview-1']);assert.equal(p.node('#documentPreviewContent').children.length,0);assert.equal(requests[1].options.signal.aborted,true);
 await p.run("openDocumentPreview('OTHER')");assert.equal(requests.length,2);
});
test('preview shows file errors and ignores a response after the viewer is closed',async()=>{
 const failure=preview(async()=>Response.json({error:'Document file is unavailable'},{status:404}));
 await failure.run("openDocumentPreview('PDF')");assert.equal(failure.node('#documentPreviewFeedback').textContent,'Document file is unavailable');assert.equal(failure.created.length,0);
 let resolve;const pending=preview(()=>new Promise(done=>{resolve=done})),task=pending.run("openDocumentPreview('PDF')");
 pending.run('clearDocumentPreview()');resolve(new Response('fixture',{headers:{'Content-Type':'application/pdf'}}));await task;assert.equal(pending.created.length,0);assert.equal(pending.node('#documentPreviewContent').children.length,0);
});
