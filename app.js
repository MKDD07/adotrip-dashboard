const hostedStaticPage=globalThis.location?.hostname==='mkdd07.github.io';
if(hostedStaticPage)globalThis.location.replace('https://adotrip-campus-crm.mkmkataria07.workers.dev/'+(globalThis.location.search||'')+(globalThis.location.hash||''));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let data={students:[],properties:[],leads:[],followups:[],payments:[]},calendar,leadChart,statusChart,propertyType='',calendarFilter='all',propertiesLoading=true,propertiesError=false;

const imageRequests = new Map();
let photoObserver;
function profileInfo(student){try{return JSON.parse(student.profile_json||'{}')}catch{return {}}}
function imagePlaceholder(label=''){
 const initials=label.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase().replace(/[^A-Z]/g,'');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#eeeee7"/><text x="200" y="164" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#858677">${initials||'◇'}</text></svg>`;
 return 'data:image/svg+xml,'+encodeURIComponent(svg);
}
function photoDownload(record,kind){
 if(record.image&&/^\/api\/(?:media\/(?:students|properties)\/|property-images\/)[A-Za-z0-9-]+$/.test(record.image))return record.image+'?download=1';
 const query=kind==='person'?(profileInfo(record).image_query||'Indian university student portrait'):(record.image_query||`${record.location} furnished serviced apartment ${record.type||'studio'} interior`);
 return '/api/images/file?'+new URLSearchParams({target:record.id,query,kind,download:'1'});
}
const studentReference=student=>student.student_code||student.id||'—';
function personImage(student,css=''){
 if(student.image&&/^\/api\/media\/students\/[A-Za-z0-9-]+$/.test(student.image))return `<img class="${css}" src="${esc(student.image)}" alt="${esc(student.name||'Student')}" loading="lazy">`;
 const profile=profileInfo(student),query=profile.image_query||'international university student portrait';
 return `<img class="${css}" src="${imagePlaceholder(student.name||'Student')}" data-target="${esc(student.id||'student')}" data-query="${esc(query)}" data-kind="person" alt="Illustrative student portrait" loading="lazy">`;
}
function hydrateImages(){
 for(const photo of $$('img[data-property-photo]:not([data-photo-observed])')){
  photo.dataset.photoObserved='true';
  if(!photo.dataset.target){
   photo.dataset.imageState=photo.complete&&photo.naturalWidth?'loaded':'loading';
   photo.onload=()=>{photo.dataset.imageState='loaded'};
   photo.onerror=()=>{photo.dataset.imageState='unavailable';photo.src=imagePlaceholder()};
  }
 }
 const images=$$('img[data-target][data-query]:not([data-image-state])');
 for(const image of images){image.dataset.imageState='waiting';if(typeof IntersectionObserver==='undefined')loadQueryImage(image);else{photoObserver ||= new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){photoObserver.unobserve(entry.target);loadQueryImage(entry.target)}},{rootMargin:'120px'});photoObserver.observe(image)}}
}
async function loadQueryImage(image){
 if(hostedStaticPage){image.dataset.imageState='unavailable';return}
 const {target,query,kind='other'}=image.dataset,key=JSON.stringify([target,query,kind]);image.dataset.imageState='loading';
 try{
  if(!imageRequests.has(key))imageRequests.set(key,api('/api/images?'+new URLSearchParams({target,query,kind})).catch(error=>{imageRequests.delete(key);throw error}));
  const photo=await imageRequests.get(key);if(!image.isConnected)return;
  image.onload=()=>{image.dataset.imageState='loaded'};image.dataset.imageState='loading';image.src='/api/images/file?'+new URLSearchParams({target,query,kind});image.title=`Illustrative photo by ${photo.photographer} on Pexels`;image.dataset.photoPage=photo.url;image.style.backgroundColor=photo.color||'#eeeee7';
  image.onerror=()=>{image.onerror=null;image.src=imagePlaceholder();image.dataset.imageState='unavailable'};
 }catch(error){image.dataset.imageState='unavailable';const status=$('#imageStatus');if(status)status.textContent=error.message}
}
const API_ORIGIN='';
const api=async(url,options={})=>{let r;try{r=await fetch(API_ORIGIN+url,{cache:'no-store',headers:{'Content-Type':'application/json'},...options})}catch{throw Error('Unable to reach the Cloudflare CRM API. Open the deployed CRM and retry.')}const raw=await r.text();let out={};if(raw){try{out=JSON.parse(raw)}catch{throw Error(`Server returned ${r.status} ${r.statusText} instead of JSON. Open the CRM at http://localhost:3000 or its deployed Worker URL`)}}if(!r.ok){if(r.status===401||r.status===403&&/starter password/.test(out.error||'')){globalThis.location?.replace('/login');throw Error('Please sign in to continue')}throw Error(out.error||`Request failed (${r.status})`)};return out};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN'),esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])),find=(type,id)=>data[type].find(x=>x.id===id)||{};
function statusBadge(value){const c=['Converted','Successful','Confirmed','Done'].includes(value)?'green':['Interested','Pending','Follow-up Required','On hold'].includes(value)?'amber':['Lost','Failed','Refunded'].includes(value)?'red':['Contacted','High'].includes(value)?'blue':'gray';return `<span class="status ${c}">${esc(value)}</span>`}
function icons(){window.lucide?.createIcons();hydrateImages()};function notify(message){$('#toastText').textContent=message;icons();if(window.bootstrap)bootstrap.Toast.getOrCreateInstance($('#appToast'),{delay:2500}).show();else{$('#appToast').classList.add('show');setTimeout(()=>$('#appToast').classList.remove('show'),2500)}};function closeModal(id){bootstrap.Modal.getInstance($(id))?.hide()}
let dashboardLoading=true;
function setDashboardLoadState(state){
 const dashboard=$('#dashboardView');if(dashboard?.dataset)dashboard.dataset.loadState=state;
 for(const panel of $$('[data-skeleton-panel]'))panel.setAttribute('aria-busy',String(state==='loading'));
 for(const message of $$('.dashboard-panel-error'))message.hidden=state!=='error';
 if($('#statCards'))$('#statCards').setAttribute('aria-busy',String(state==='loading'));
 if($('#dashboardLoadingStatus'))$('#dashboardLoadingStatus').textContent=state==='loading'?'Loading dashboard…':state==='error'?'Dashboard could not load. Retry the connection.':'Dashboard loaded.';
 dashboardLoading=state!=='ready';
}
async function load(){if(dashboardLoading)setDashboardLoadState('loading');if(propertiesLoading)renderProperties();const state=await api('/api/state');for(const key of ['students','properties','leads','followups','payments']){if(!Array.isArray(state[key]))throw Error('The CRM server returned invalid data. Check the Cloudflare D1 connection and retry.')}data=state;propertiesLoading=false;propertiesError=false;if($('#dataNotice'))$('#dataNotice').hidden=true;await render();setDashboardLoadState('ready');if(signedInUser)await refreshNotifications().catch(()=>{});}
function showDataError(error){
 if(typeof dashboardLoading!=='undefined'&&dashboardLoading)setDashboardLoadState('error');
 if(propertiesLoading){propertiesLoading=false;propertiesError=true;renderProperties()}
 const text=$('#dataNoticeText'),notice=$('#dataNotice');
 if(text)text.textContent=error.message;
 if(notice)notice.hidden=false;
 else console.error('CRM data unavailable:',error.message);
}
if($('#retryData'))$('#retryData').onclick=()=>load().catch(showDataError);
function render(){renderWorkspaceHeroes();renderStats();renderStudents();renderProperties();renderLeads();renderSchedule();renderPayments();fillOptions();renderStudentArchive();const chart=renderCharts();icons();return chart}
let dashboardPeriod='month';
let dashboardYear=null;
let studentDirectoryMode='pending';
const studentGroup=()=>data.students.filter(student=>(student.status==='Converted')===(studentDirectoryMode==='finalized'));
function dashboardDateKey(value){
 if(!value)return '';
 const text=String(value);
 if(/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}(?::\d{2})?$)/.test(text))return text.slice(0,10);
 const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=type=>parts.find(p=>p.type===type).value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
function dashboardReportingKey(now=new Date()){
 const key=dashboardDateKey(now);
 return `${dashboardYear??key.slice(0,4)}${key.slice(4)}`;
}
function dashboardPeriodLabel(){
 const key=dashboardReportingKey();
 return dashboardPeriod==='year'?key.slice(0,4):`${new Date(`${key.slice(0,7)}-01T12:00:00+05:30`).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',month:'short'})} ${key.slice(0,4)}`;
}
function renderDashboardYears(){
 const select=$('#dashboardYear');if(!select)return;
 const current=Number(dashboardDateKey(new Date()).slice(0,4));
 const years=new Set([current,current-1,current-2,Number(dashboardYear??current)]);
 for(const [records,field] of [[data.students,'created_at'],[data.leads,'created_at'],[data.payments,'paid_at'],[data.followups,'starts_at']]){
  for(const record of records){const key=dashboardDateKey(record[field]);if(key)years.add(Number(key.slice(0,4)))}
 }
 select.innerHTML=[...years].sort((a,b)=>b-a).map(year=>`<option value="${year}">${year}</option>`).join('');
 select.value=String(dashboardYear??current);
}
function dashboardData(now=new Date()){
 const key=dashboardReportingKey(now).slice(0,dashboardPeriod==='year'?4:7);
 const within=(record,field='created_at')=>dashboardDateKey(record[field]).startsWith(key);
 return {...data,students:data.students.filter(r=>within(r)),leads:data.leads.filter(r=>within(r)),payments:data.payments.filter(r=>within(r,r.paid_at?'paid_at':'created_at')),followups:data.followups.filter(r=>within(r,'starts_at'))};
}
function dashboardBuckets(now=new Date()){
 const key=dashboardReportingKey(now),year=Number(key.slice(0,4)),month=Number(key.slice(5,7));
 return Array.from({length:dashboardPeriod==='year'?12:new Date(year,month,0).getDate()},(_,i)=>({
  key:dashboardPeriod==='year'?`${year}-${String(i+1).padStart(2,'0')}`:`${key.slice(0,7)}-${String(i+1).padStart(2,'0')}`,
  label:dashboardPeriod==='year'?new Date(year,i,1).toLocaleDateString('en-IN',{month:'short'}):String(i+1)
 }));
}
function updateDashboardPeriod(){
 const control=$('#dashboardPeriodSwitch');if(control)control.dataset.period=dashboardPeriod;
 $$('[data-dashboard-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dashboardPeriod===dashboardPeriod)));
 const label=$('#dashboardPeriodLabel');if(label)label.textContent=dashboardPeriodLabel();
 renderWorkspaceHeroes();renderStats();renderCharts();icons();
}
$$('[data-dashboard-period]').forEach(button=>button.onclick=()=>{dashboardPeriod=button.dataset.dashboardPeriod;updateDashboardPeriod()});
if($('#dashboardYear'))$('#dashboardYear').onchange=event=>{dashboardYear=Number(event.target.value);dashboardPeriod='year';updateDashboardPeriod()};
function renderWorkspaceHeroes(){
 const active=data.leads.filter(l=>!['Converted','Lost'].includes(l.status)).length,pending=data.followups.filter(f=>f.status!=='Done').length,assigned=data.students.filter(s=>s.agent).length;
 const dashboard=dashboardData(),dashboardActive=dashboard.leads.filter(l=>!['Converted','Lost'].includes(l.status)).length,dashboardPending=dashboard.followups.filter(f=>f.status!=='Done').length;
 $('#dashboardHeroFacts').innerHTML=`<span><i data-lucide="users-round"></i>${dashboard.students.length} students</span><span><i data-lucide="list-filter"></i>${dashboardActive} active opportunities</span><span><i data-lucide="calendar-clock"></i>${dashboardPending} pending follow-ups</span>`;
 const group=studentGroup(),groupIds=new Set(group.map(student=>student.id));$('#studentHeroFacts').innerHTML=`<span><i data-lucide="users-round"></i>${group.length} students</span><span><i data-lucide="user-check"></i>${group.filter(student=>student.agent).length} assigned</span><span><i data-lucide="calendar-clock"></i>${data.followups.filter(task=>task.status!=='Done'&&groupIds.has(task.student_id)).length} follow-ups</span>`;

 const facts=(id,items)=>{$(id).innerHTML=items.map(([icon,text])=>`<span><i data-lucide="${icon}"></i>${esc(text)}</span>`).join('')};
 const won=data.leads.filter(l=>l.status==='Converted').length,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),due=data.followups.filter(f=>f.status!=='Done'&&f.starts_at.slice(0,10)===today).length,owners=new Set(data.students.map(s=>s.agent).filter(Boolean)).size;
 facts('#leadHeroFacts',[['list-filter',`${active} active opportunities`],['badge-check',`${won} bookings`],['users-round',`${owners} team owners`]]);
 facts('#propertyHeroFacts',[['building-2',`${data.properties.length} properties`],['bed-double',`${data.properties.reduce((sum,p)=>sum+Number(p.rooms||0),0)} rooms`],['layout-grid',`${new Set(data.properties.map(p=>p.type).filter(Boolean)).size} room types`]]);
 facts('#calendarHeroFacts',[['calendar-clock',`${pending} pending follow-ups`],['sun',`${due} due today`],['flag',`${data.followups.filter(f=>f.status!=='Done'&&f.priority==='High').length} high priority`]]);
 facts('#paymentHeroFacts',[['credit-card',`${data.payments.length} transactions`],['badge-check',`${data.payments.filter(p=>p.booking==='Confirmed').length} confirmed bookings`],['clock-3',`${data.payments.filter(p=>p.status==='Pending').length} pending payments`]]);
 facts('#settingsHeroFacts',[['user-round',signedInUser?.name||'Team workspace'],['shield-check',signedInUser?.role==='admin'?'Administrator access':'Team access'],['database','Cloud-connected records']]);
 if(signedInUser){const hour=Number(new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',hourCycle:'h23'}).format(new Date()));$('#dashboardGreeting').textContent=`Good ${hour<12?'morning':hour<17?'afternoon':'evening'}, ${signedInUser.name.split(' ')[0]}.`;$('#dashboardHeroCopy').textContent=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'long',day:'numeric',month:'long'}).format(new Date())+' · Student arrivals and apartment bookings at a glance.'}
}
function renderStats(){
 const dashboard=dashboardData();
 const paid=dashboard.payments.filter(p=>p.status==='Successful').reduce((sum,p)=>sum+Number(p.amount),0),pending=dashboard.payments.filter(p=>p.status==='Pending').reduce((sum,p)=>sum+Number(p.amount),0),active=dashboard.leads.filter(l=>!['Converted','Lost'].includes(l.status)).length,converted=dashboard.leads.filter(l=>l.status==='Converted').length,total=dashboard.leads.length,assigned=dashboard.students.filter(s=>s.agent).length,rate=total?Math.round(converted/total*100):0;
 const metrics=[
  {label:'Total students',value:dashboard.students.length,icon:'users-round',view:'students',caption:'Students finding their next stay',detail:`${assigned} assigned to your team`,percent:dashboard.students.length?assigned/dashboard.students.length*100:0,foot:'Assignment coverage'},
  {label:'Active leads',value:active,icon:'list-filter',view:'leads',caption:'Conversations in progress',detail:`${active} of ${total} opportunities`,percent:total?active/total*100:0,foot:'Open pipeline'},
  {label:'Conversions',value:converted,icon:'badge-check',view:'finalized',caption:'Confirmed apartment bookings',detail:`${rate}% booking rate`,percent:rate,foot:'Enquiry to booking'},
  {label:'Revenue booked',value:money(paid),icon:'indian-rupee',view:'payments',caption:'Successful payments',detail:`${money(pending)} pending`,percent:paid+pending?paid/(paid+pending)*100:0,foot:'Collection progress',featured:true}
 ];
 $('#statCards').innerHTML=metrics.map(metric=>`<button type="button" class="dashboard-metric ${metric.featured?'dashboard-metric-featured':''}" data-metric-view="${metric.view}" aria-label="${metric.label}: ${metric.value}. Open ${metric.view}"><div class="dashboard-metric-head"><span>${metric.label}</span><i data-lucide="${metric.icon}"></i></div><strong class="dashboard-metric-value">${metric.value}</strong><p class="dashboard-metric-caption">${metric.caption}</p><div class="dashboard-metric-footer"><div><span>${metric.foot}</span><strong>${metric.detail}</strong></div><i data-lucide="arrow-up-right"></i></div><div class="dashboard-metric-track" role="presentation"><span style="width:${Math.max(0,Math.min(100,metric.percent))}%"></span></div></button>`).join('');
 $('#studentNavCount').textContent=data.students.filter(student=>student.status!=='Converted').length;$('#finalizedNavCount').textContent=data.students.filter(student=>student.status==='Converted').length;$('#recentStudents').innerHTML=dashboard.students.slice(0,4).map(student=>{
 const lead=dashboard.leads.find(l=>l.student_id===student.id&&l.status!=='Lost'),property=find('properties',lead?.property_id);
 return `<tr><td><button type="button" class="recent-student-link" data-student-profile="${esc(student.id)}">${personImage(student)}<span><strong>${esc(student.name)}</strong><small><span class="student-reference">${esc(studentReference(student))}</span> · ${esc(student.course||'Student enquiry')}</small></span></button></td><td><span class="recent-apartment">${esc(property.name||'Not selected')}</span><small class="recent-apartment-location">${esc(property.location||'')}</small></td><td>${statusBadge(student.status)}</td><td class="recent-followup">${lead?.followup?esc(pipelineDate(lead.followup)):'—'}</td></tr>`;
 }).join('')||'<tr><td colspan="4" class="empty-state">No enquiries in this period.</td></tr>'}

function renderStudents(){
 const query=($('#studentSearch')?.value||'').toLowerCase(),status=$('#studentStatus')?.value||'';
 const finalized=studentDirectoryMode==='finalized';$('#studentStatus').hidden=finalized;$('#studentWorkspaceActions').hidden=finalized;
 $('#studentWorkspaceEyebrow').textContent=finalized?'FINALIZED BOOKINGS':'PENDING STUDENTS';$('#studentWorkspaceTitle').textContent=finalized?'Finalized students':'Pending students';$('#studentWorkspaceCopy').textContent=finalized?'Converted students and their confirmed stays.':'Student enquiries awaiting a finalized booking.';$('#studentDirectoryTitle').textContent=finalized?'Finalized students':'Pending students';
 const students=studentGroup().filter(s=>(!query||Object.values(s).join(' ').toLowerCase().includes(query))&&(finalized||!status||s.status===status));
 if(!selectedStudentId||!students.some(s=>s.id===selectedStudentId))selectedStudentId=students.find(s=>profileInfo(s).is_demo)?.id||students[0]?.id||null;
 $('#directoryCount').textContent=students.length;
 $('#studentTable').innerHTML=students.map(s=>`<button type="button" class="directory-student ${s.id===selectedStudentId?'selected':''}" data-student-profile="${esc(s.id)}" aria-pressed="${s.id===selectedStudentId}">${personImage(s)}<span class="directory-student-copy"><strong>${esc(s.name)}</strong><span>${esc(s.city||'City not provided')} · ${esc(s.course||'Enquiry')}</span><span class="directory-student-meta">${statusBadge(s.status)}<small>${money(s.budget)}</small></span></span><i data-lucide="chevron-right"></i></button>`).join('')||'<div class="empty-state">No matching students.</div>';
 renderStudentProfile();icons();
}
function propertyPhoto(property,fallbackQuery=''){
 if(property.image&&/^\/api\/(?:property-images\/|media\/properties\/)[A-Za-z0-9-]+$/.test(property.image))return `<img data-property-photo src="${esc(property.image)}" alt="${esc(property.name||'Property')}" loading="lazy">`;
 return `<img data-property-photo src="${imagePlaceholder(property.name||'Property')}" data-target="${esc(property.id||'property')}" data-query="${esc(property.image_query||fallbackQuery||`${property.location} furnished serviced apartment ${property.type||'studio'} interior`)}" data-kind="hotel" alt="Illustrative accommodation photo" loading="lazy">`;
}
function propertySkeletonCard(){
 return `<div class="property-column"><article class="property-card property-card-skeleton" aria-busy="true" aria-label="Loading accommodation"><div class="property-image skeleton-image"><span class="rooms skeleton-pill"></span></div><div class="property-body"><div class="skeleton-line skeleton-title"></div><div class="property-location skeleton-location"><span class="skeleton-icon"></span><span class="skeleton-line skeleton-subtitle"></span></div><div class="amenity-list skeleton-amenities"><span class="skeleton-chip" style="width:52px"></span><span class="skeleton-chip" style="width:64px"></span><span class="skeleton-chip" style="width:78px"></span></div><div class="property-foot property-foot-layout skeleton-foot"><div class="skeleton-line skeleton-price"></div><div class="skeleton-actions"><span class="skeleton-btn-action"></span></div></div></div></article></div>`;
}
function propertyPeople(propertyId){
 const people=new Map();
 for(const lead of data.leads.filter(l=>l.property_id===propertyId&&l.status!=='Lost')){
  const student=find('students',lead.student_id);if(student.id)people.set(student.id,{student,booked:false});
 }
 for(const payment of data.payments.filter(p=>p.property_id===propertyId&&p.status==='Successful'&&p.booking!=='Cancelled')){
  const student=find('students',payment.student_id);if(student.id)people.set(student.id,{student,booked:true});
 }
 return [...people.values()].sort((a,b)=>Number(b.booked)-Number(a.booked));
}
function renderProperties(){
 const grid=$('#propertyGrid');if(!grid)return;
 grid.setAttribute('aria-busy',String(propertiesLoading));
 if(propertiesLoading){grid.innerHTML=Array.from({length:6},()=>propertySkeletonCard()).join('');return}
 const q=($('#propertySearch')?.value||'').toLowerCase();
 const list=data.properties.filter(p=>(!q||(p.name+p.location+p.amenities).toLowerCase().includes(q))&&(!propertyType||p.type===propertyType)).sort((a,b)=>Number(propertyPeople(a.id).some(person=>person.booked))-Number(propertyPeople(b.id).some(person=>person.booked)));
 grid.innerHTML=list.map(p=>{
  const people=propertyPeople(p.id),booked=people.some(person=>person.booked);
  const badges=people.map(({student,booked})=>`<button type="button" class="property-person ${booked?'property-person-booked':''}" data-student-profile="${esc(student.id)}" title="${esc(student.name)} · ${booked?'Booked':'Selected · Payment pending'}" aria-label="View ${esc(student.name)}: ${booked?'Booked':'Selected, payment pending'}">${personImage(student)}<span><strong>${esc(student.name)}</strong><small>${booked?'Booked':'Payment pending'}</small></span></button>`).join('');
  return `<div class="property-column"><article class="property-card ${booked?'property-card-booked':''}"><div class="property-image">${propertyPhoto(p)}<span class="rooms">${p.rooms} ROOMS</span>${booked?'<span class="property-booked-label">Booked</span>':''}${badges?`<div class="property-people" aria-label="Students for this apartment">${badges}</div>`:''}</div><div class="property-body"><h3>${esc(p.name)}</h3><p class="property-location"><i data-lucide="map-pin"></i><span>${esc(p.location)} · ${esc(p.type)}</span></p><div class="amenity-list">${String(p.amenities||'').split(',').filter(Boolean).map(a=>`<span>${esc(a)}</span>`).join('')}</div><div class="property-foot property-foot-layout"><span class="price">${money(p.price)} <small>/ month</small></span><button type="button" class="btn btn-sm btn-outline-danger" data-property-shortlist="${esc(p.id)}" ${booked?'disabled':''}>${booked?'Booked':'Shortlist'}</button></div></div></article></div>`;
 }).join('')||`<div class="empty-state">${propertiesError?'Unable to load apartments. Retry the connection above.':'No properties found.'}</div>`;
 icons();
}

let pipelineMode='active';const movingLeads=new Set();
const leadStages=['New Lead','Contacted','Interested','Follow-up Required','Converted','Lost'];
const stageMeta={
 'New Lead':{label:'New enquiries',description:'Make the first connection',color:'#a0a3ab'},
 'Contacted':{label:'In conversation',description:'Understand their requirements',color:'#7391b6'},
 'Interested':{label:'Shortlisted',description:'Arrange a tour or discussion',color:'#b6a039'},
 'Follow-up Required':{label:'Follow-up',description:'Keep the next step moving',color:'#c38b65'},
 'Converted':{label:'Booked',description:'Confirmed accommodation',color:'#518b6c'},
 'Lost':{label:'Closed enquiries',description:'No longer pursuing a booking',color:'#8b8b91'}
};
function pipelineDate(value){if(!value)return 'Not scheduled';const date=new Date(value);return Number.isNaN(date.getTime())?'Not scheduled':date.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
function renderLeads(){
 const active=data.leads.filter(l=>!['Converted','Lost'].includes(l.status)),closed=data.leads.filter(l=>['Converted','Lost'].includes(l.status)),won=data.leads.filter(l=>l.status==='Converted').length,potential=active.reduce((sum,l)=>sum+Number(find('properties',l.property_id).price||find('students',l.student_id).budget||0),0),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),due=active.filter(l=>l.followup&&l.followup.slice(0,10)<=today).length;
 $('#activePipelineCount').textContent=active.length;$('#closedPipelineCount').textContent=closed.length;
 $('#pipelineMetrics').innerHTML=[['Open opportunities',active.length,'users-round'],['Potential monthly value',money(potential),'indian-rupee'],['Follow-ups due',due,'calendar-clock'],['Booking rate',`${data.leads.length?Math.round(won/data.leads.length*100):0}%`,'trending-up']].map(([label,value,icon])=>`<div class="pipeline-metric"><div><span>${label}</span><strong>${value}</strong></div><i data-lucide="${icon}"></i></div>`).join('');
 const ownerSelect=$('#pipelineOwner'),owner=ownerSelect.value||'',query=($('#pipelineSearch').value||'').trim().toLowerCase(),owners=[...new Set(data.leads.map(l=>find('students',l.student_id).agent).filter(Boolean))].sort();
 ownerSelect.innerHTML='<option value="">All owners</option>'+owners.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');ownerSelect.value=owner;
 const stages=pipelineMode==='closed'?['Converted','Lost']:['New Lead','Contacted','Interested','Follow-up Required'];
 $('#kanban').classList.toggle('pipeline-board-closed',pipelineMode==='closed');
 $('#kanban').innerHTML=stages.map(stage=>{
  const rows=data.leads.filter(l=>{const student=find('students',l.student_id),property=find('properties',l.property_id);return l.status===stage&&(!owner||student.agent===owner)&&(!query||[student.name,student.student_code,student.city,student.course,property.name,l.id,l.notes].join(' ').toLowerCase().includes(query))}),meta=stageMeta[stage],value=rows.reduce((sum,l)=>sum+Number(find('properties',l.property_id).price||find('students',l.student_id).budget||0),0);
  return `<section class="pipeline-column" data-drop-stage="${stage}" aria-label="${esc(meta.label)}"><header class="pipeline-column-heading"><div><span class="pipeline-stage-dot" style="--stage-color:${meta.color}"></span><h3>${meta.label}</h3><span class="pipeline-stage-count">${rows.length}</span></div></header><div class="pipeline-card-list">${rows.map(lead=>{
   const student=find('students',lead.student_id),property=find('properties',lead.property_id),overdue=lead.followup&&lead.followup.slice(0,10)<today;
   return `<article class="opportunity-card" draggable="true" data-lead-id="${esc(lead.id)}"><div class="opportunity-person">${personImage(student)}<div><button class="opportunity-name" type="button" data-student-profile="${esc(lead.student_id)}">${esc(student.name||lead.student_id)}</button><small class="student-reference opportunity-student-reference">${esc(studentReference(student))}</small></div><button type="button" class="opportunity-profile-btn" data-student-profile="${esc(lead.student_id)}" aria-label="Open ${esc(student.name||'student')} profile"><i data-lucide="arrow-up-right"></i></button></div><div class="opportunity-property"><i data-lucide="building-2"></i><span>${esc(property.name||'Property to be selected')}</span></div><div class="opportunity-details"><strong>${money(property.price||student.budget)}<small> / mo</small></strong>${lead.followup?`<span class="opportunity-date ${overdue?'overdue':''}" title="Follow-up date"><i data-lucide="calendar-days"></i>${pipelineDate(lead.followup)}</span>`:''}</div><footer class="opportunity-footer"><label class="opportunity-stage"><span class="visually-hidden">Stage for ${esc(student.name||lead.id)}</span><select data-lead-status="${esc(lead.id)}" ${movingLeads.has(lead.id)?'disabled':''}>${leadStages.map(value=>`<option value="${value}" ${value===lead.status?'selected':''}>${value==='New Lead'?'New enquiry':value==='Follow-up Required'?'Follow-up':value==='Converted'?'Booked':value}</option>`).join('')}</select></label></footer></article>`
  }).join('')||`<div class="pipeline-empty"><i data-lucide="${query||owner?'search-x':'circle-dashed'}"></i><span>${query||owner?'No matching opportunities':'Ready for the next opportunity'}</span></div>`}</div></section>`
 }).join('');icons();
}
async function moveLead(id,status){
 if(movingLeads.has(id)||find('leads',id).status===status)return;
 movingLeads.add(id);renderLeads();
 try{await api(`/api/leads/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status})});await load();notify(`Moved to ${stageMeta[status]?.label||status}`)}catch(error){notify(error.message)}finally{movingLeads.delete(id);renderLeads()}
}
$('#pipelineSearch').oninput=renderLeads;$('#pipelineOwner').onchange=renderLeads;
$$('[data-pipeline-mode]').forEach(button=>button.onclick=()=>{pipelineMode=button.dataset.pipelineMode;$$('[data-pipeline-mode]').forEach(tab=>{tab.classList.toggle('active',tab===button);tab.setAttribute('aria-pressed',String(tab===button))});renderLeads()});
$('#kanban').addEventListener('change',event=>{const select=event.target.closest('[data-lead-status]');if(select)moveLead(select.dataset.leadStatus,select.value)});
$('#kanban').addEventListener('dragstart',event=>{if(event.target.closest('button,select,a,input')){event.preventDefault();return}const card=event.target.closest('[data-lead-id]');if(!card)return;event.dataTransfer.setData('text/plain',card.dataset.leadId);event.dataTransfer.effectAllowed='move';card.classList.add('dragging')});
$('#kanban').addEventListener('dragend',()=>{$$('.dragging,.pipeline-drop-active').forEach(el=>{el.classList.remove('dragging','pipeline-drop-active')})});
$('#kanban').addEventListener('dragover',event=>{const column=event.target.closest('[data-drop-stage]');if(column){event.preventDefault();event.dataTransfer.dropEffect='move';column.classList.add('pipeline-drop-active')}});
$('#kanban').addEventListener('dragleave',event=>{const column=event.target.closest('[data-drop-stage]');if(column&&!column.contains(event.relatedTarget))column.classList.remove('pipeline-drop-active')});
$('#kanban').addEventListener('drop',event=>{const column=event.target.closest('[data-drop-stage]');if(!column)return;event.preventDefault();column.classList.remove('pipeline-drop-active');const id=event.dataTransfer.getData('text/plain');if(data.leads.some(lead=>lead.id===id))moveLead(id,column.dataset.dropStage)});
function eventColor(purpose){return {'Callback':'#3978f6','Property discussion':'#9b63e6','Property visit':'#16a36a','Payment reminder':'#ec9a20'}[purpose]||'#FDE300'}
function hideCalendarTooltip(){const tip=$('#calendarTooltip');if(tip){tip.classList.remove('show');tip.setAttribute('aria-hidden','true')}}
function showCalendarTooltip(info){const p=info.event.extendedProps,tip=$('#calendarTooltip'),date=info.event.start;tip.innerHTML=`<div class="tooltip-head"><strong>${esc(p.purpose)}</strong><span class="tooltip-priority">${esc(p.priority).toUpperCase()}</span></div><div class="tooltip-row"><i data-lucide="user-round"></i><span>${esc(p.student)} · ${esc(p.studentId)}</span></div><div class="tooltip-row"><i data-lucide="phone"></i><span>${esc(p.mobile||'No mobile number')}</span></div><div class="tooltip-row"><i data-lucide="calendar-clock"></i><span>${date.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} at ${date.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span></div><div class="tooltip-row"><i data-lucide="circle-dot"></i><span>${esc(p.status)} · ${esc(p.agent||'Unassigned')}</span></div>`;icons();const r=info.el.getBoundingClientRect(),w=255,left=Math.min(window.innerWidth-w-12,Math.max(12,r.left+r.width/2-w/2)),above=r.top-tip.offsetHeight-10;tip.style.left=`${left}px`;tip.style.top=`${above>10?above:r.bottom+10}px`;tip.classList.add('show');tip.setAttribute('aria-hidden','false')}
function todaysFollowups(followups,now=new Date()){
 const today=dashboardDateKey(now);
 return followups.filter(task=>task.status!=='Done'&&dashboardDateKey(task.starts_at)===today).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
}
function renderTodaySchedule(){
 const tasks=todaysFollowups(data.followups);
 $('#todayScheduleCount').textContent=`${tasks.length} ${tasks.length===1?'task':'tasks'}`;
 $('#todaySchedule').innerHTML=tasks.slice(0,4).map(task=>{
  const student=find('students',task.student_id),time=new Date(task.starts_at).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true});
  return `<button type="button" class="schedule-item" ${student.id?`data-student-profile="${esc(student.id)}"`:'data-metric-view="calendar"'} aria-label="${esc(task.purpose)} with ${esc(student.name||task.student_id)} at ${esc(time)}${task.priority==='High'?', high priority':''}">${personImage(student,'schedule-avatar')}<span class="schedule-copy"><strong>${esc(task.purpose)}</strong><small class="schedule-student-meta"><span class="student-reference">${esc(studentReference(student))}</span><span class="schedule-student-name">${esc(student.name||task.student_id)}</span></small></span><span class="schedule-time">${esc(time)}${task.priority==='High'?'<span class="schedule-priority-dot" title="High priority" aria-label="High priority"></span>':''}</span><i data-lucide="arrow-up-right" class="schedule-open" aria-hidden="true"></i></button>`;
 }).join('')||'<div class="schedule-empty"><i data-lucide="calendar-check"></i><span>No pending tasks today.</span></div>';
}
function renderSchedule(){const sorted=[...data.followups].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)),today=dashboardDateKey(new Date()),pending=sorted.filter(f=>f.status!=='Done'),todayCount=todaysFollowups(sorted).length,high=pending.filter(f=>f.priority==='High').length,visits=pending.filter(f=>f.purpose==='Property visit').length;$('#calendarStats').innerHTML=[['calendar-check','Scheduled',pending.length,'All pending follow-ups'],['clock-3','Due today',todayCount,'Requires attention today'],['triangle-alert','High priority',high,'Priority conversations'],['map-pinned','Property visits',visits,'Visits to coordinate']].map(x=>`<div class="calendar-metric-column"><div class="stat-card"><div class="calendar-metric-heading"><div><p>${x[1]}</p><h3 class="metric-value-layout">${x[2]}</h3><span class="muted-label" style="font-size:var(--text-caption)">${x[3]}</span></div><div class="stat-icon"><i data-lucide="${x[0]}"></i></div></div></div></div>`).join('');renderTodaySchedule();$('#agendaCount').textContent=pending.length;$('#calendarAgenda').innerHTML=pending.slice(0,7).map((f,i)=>{const s=find('students',f.student_id),d=new Date(f.starts_at);return `<article class="agenda-item" style="--event-color:${eventColor(f.purpose)}"><div class="agenda-date">${d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} · ${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div><strong>${esc(f.purpose)}</strong><p>${esc(s.name||f.student_id)}</p><footer>${personImage(s,'agenda-avatar')}<span class="agenda-priority">${esc(f.priority)} priority</span></footer></article>`}).join('')||'<div class="empty-state">No upcoming follow-ups.</div>';if(!window.FullCalendar){$('#calendar').innerHTML='<div class="empty-state">Calendar library unavailable. Your follow-ups are listed in the agenda.</div>';return}if(calendar)calendar.destroy();calendar=new FullCalendar.Calendar($('#calendar'),{initialView:'dayGridMonth',height:'auto',dayMaxEvents:3,nowIndicator:true,eventDisplay:'block',headerToolbar:{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek,listWeek'},buttonText:{month:'Month',week:'Week',list:'Agenda'},events:(fetchInfo,success)=>success(data.followups.filter(f=>calendarFilter==='all'||f.purpose===calendarFilter).map(f=>{const s=find('students',f.student_id);return{id:f.id,title:`${f.purpose} · ${s.name||''}`,start:f.starts_at,backgroundColor:eventColor(f.purpose),borderColor:eventColor(f.purpose),extendedProps:{purpose:f.purpose,priority:f.priority,status:f.status,student:s.name||f.student_id,studentId:f.student_id,mobile:s.mobile,agent:s.agent}}})),eventContent:i=>({html:`<div class="calendar-event-inner"><i></i><span class="calendar-event-title">${esc(i.event.extendedProps.purpose)} · ${esc(i.event.extendedProps.student)}</span></div>`}),eventMouseEnter:showCalendarTooltip,eventMouseLeave:hideCalendarTooltip,eventClick:i=>openStudentProfile(i.event.extendedProps.studentId),datesSet:hideCalendarTooltip});calendar.render();icons()}
function renderPayments(){const paid=data.payments.filter(x=>x.status==='Successful').reduce((a,b)=>a+b.amount,0),pending=data.payments.filter(x=>x.status==='Pending').reduce((a,b)=>a+b.amount,0),confirmed=data.payments.filter(x=>x.booking==='Confirmed').length;$('#paymentStats').innerHTML=[[money(paid),'Successful payments','circle-check'],[money(pending),'Pending amount','clock-3'],[confirmed,'Confirmed bookings','calendar-check']].map(x=>`<div class="summary-column"><div class="stat-card"><div class="stat-icon"><i data-lucide="${x[2]}"></i></div><h3>${x[0]}</h3><p>${x[1]}</p></div></div>`).join('');$('#paymentTable').innerHTML=data.payments.map(p=>`<tr><td><strong>${p.id}</strong></td><td>${esc(find('students',p.student_id).name||p.student_id)}</td><td>${esc(find('properties',p.property_id).name||p.property_id)}</td><td><strong>${money(p.amount)}</strong></td><td>${String(p.paid_at).slice(0,10)}</td><td>${statusBadge(p.status)}</td><td>${statusBadge(p.booking)}</td></tr>`).join('')}
function fillOptions(){$$('.student-options').forEach(el=>el.innerHTML='<option value="">Select student</option>'+data.students.map(s=>`<option value="${s.id}">${esc(s.name)} · ${s.id}</option>`).join(''));$$('.property-options').forEach(el=>el.innerHTML='<option value="">Select property</option>'+data.properties.map(p=>`<option value="${p.id}">${esc(p.name)} · ${money(p.price)}</option>`).join(''))}
function uiFontSize(token){
 return typeof getComputedStyle==='function'?getComputedStyle(document.documentElement).getPropertyValue(token).trim()||'13px':'13px';
}
function renderCharts(){renderDashboardYears();const data=dashboardData(),months=dashboardBuckets().filter(bucket=>bucket.key<=dashboardDateKey(new Date()).slice(0,dashboardPeriod==='year'?7:10));const label=$('#dashboardPeriodLabel');if(label)label.textContent=dashboardPeriodLabel();const enquiries=months.map(m=>data.students.filter(s=>dashboardDateKey(s.created_at).startsWith(m.key)).length),conversions=months.map(m=>data.leads.filter(l=>l.status==='Converted'&&dashboardDateKey(l.created_at).startsWith(m.key)).length);const total=data.leads.length,converted=data.leads.filter(l=>l.status==='Converted').length,closed=data.leads.filter(l=>l.status==='Lost').length,active=total-converted-closed,rate=total?Math.round(converted/total*100):0;
 $('#healthRate').textContent=`${rate}%`;
 $('#healthMessage').textContent=total?`${total} ${total===1?'enquiry':'enquiries'}`:'No enquiries yet';
 $('#conversionPeriod').textContent=dashboardYear===null||String(dashboardYear)===dashboardDateKey(new Date()).slice(0,4)?(dashboardPeriod==='year'?'This year':'This month'):dashboardPeriodLabel();
 const bookedShare=total?converted/total*100:0,activeShare=total?active/total*100:0;
 const ring=$('#statusChart');ring.style.background=total?`conic-gradient(#487b63 0% ${bookedShare}%, #d4bc65 ${bookedShare}% ${bookedShare+activeShare}%, #e8eaec ${bookedShare+activeShare}% 100%)`:'#e8eaec';
 ring.setAttribute('aria-label',`${rate}% booking rate; ${converted} booked, ${active} active, ${closed} closed out of ${total} enquiries`);
 $('#statusLegend').innerHTML=[['Booked',converted,'booked'],['Active',active,'active'],['Closed',closed,'closed']].map(([name,count,key])=>`<div class="conversion-legend-row"><span><i class="conversion-dot conversion-dot-${key}" aria-hidden="true"></i>${name}</span><strong>${count}</strong></div>`).join('');
 if(!window.ApexCharts){$('#leadChart').innerHTML='<div class="empty-state">Chart library unavailable.</div>';return}if(leadChart)leadChart.destroy();leadChart=new ApexCharts($('#leadChart'),{
 chart:{type:'line',height:250,toolbar:{show:false},fontFamily:'Inter',zoom:{enabled:false},animations:{enabled:false}},
 series:[{name:'Enquiries',type:'column',data:enquiries},{name:'Bookings',type:'line',data:conversions}],
 colors:['#e5c900','#252b31'],stroke:{curve:'straight',width:[0,2.5]},
 plotOptions:{bar:{columnWidth:'38%',borderRadius:3}},fill:{opacity:[.85,1]},
 markers:{size:[0,3],strokeWidth:2,hover:{sizeOffset:2}},dataLabels:{enabled:false},
 xaxis:{categories:months.map(m=>m.label),tickAmount:Math.min(months.length-1,6),axisBorder:{show:false},axisTicks:{show:false},labels:{style:{fontSize:uiFontSize('--text-caption'),colors:'#92969d'}}},
 yaxis:{min:0,max:Math.max(...enquiries,...conversions,2),tickAmount:Math.max(2,Math.min(Math.max(...enquiries,...conversions,2),5)),forceNiceScale:true,labels:{formatter:value=>Number.isInteger(value)?String(value):'',style:{fontSize:uiFontSize('--text-caption'),colors:'#92969d'}}},
 grid:{borderColor:'#f0f1f3',strokeDashArray:3,padding:{left:0,right:8,top:0,bottom:0}},
 legend:{position:'top',horizontalAlign:'left',fontSize:uiFontSize('--text-caption'),fontWeight:400,labels:{colors:'#73777f'},markers:{width:7,height:7},itemMargin:{horizontal:12,vertical:6}},
 tooltip:{shared:true,intersect:false,y:{formatter:value=>String(value)}}
 });return leadChart.render();}
function advanceStudent(id){openStudentProfile(id)}
async function advanceLead(id){const lead=find('leads',id),flow=['New Lead','Contacted','Interested','Follow-up Required','Converted'],index=flow.indexOf(lead.status);if(index>=0&&index<flow.length-1)await moveLead(id,flow[index+1])}
function shortlist(id){if(propertyPeople(id).some(person=>person.booked))return;bootstrap.Modal.getOrCreateInstance($('#leadModal')).show();setTimeout(()=>$('#leadForm [name=property_id]').value=id,100)}
function showView(name){if(name==='pending')name='students';if(name==='students'||name==='finalized'){const mode=name==='finalized'?'finalized':'pending';if(studentDirectoryMode!==mode){studentDirectoryMode=mode;selectedStudentId=null;activeProfileTab='overview';$('#studentSearch').value='';$('#studentStatus').value='';}renderStudents();renderWorkspaceHeroes();}if($('#dashboardPeriodSwitch'))$('#dashboardPeriodSwitch').hidden=name!=='dashboard';$$('.view').forEach(x=>x.classList.remove('active'));$(`#${name==='finalized'?'students':name}View`).classList.add('active');$$('.nav-link[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===name));const labels={dashboard:['Dashboard','Indian students, overseas apartments and arrivals.'],students:['Pending','Manage student enquiries awaiting finalization.'],finalized:['Finalized','Converted students and finalized bookings.'],properties:['Properties','Find and shortlist the perfect stay.'],leads:['Lead pipeline','Move opportunities toward booking.'],calendar:['Calendar','Calls, visits and reminders.'],payments:['Payments','Transactions and confirmed bookings.'],settings:['Settings','Database and integration configuration.']};$('#viewTitle').textContent=labels[name][0];$('#viewSubtitle').textContent=labels[name][1];$('#sidebar').classList.remove('open');if(name==='settings'&&signedInUser?.role==='admin')loadStudentArchive();if(name==='calendar')setTimeout(()=>calendar?.updateSize(),50)}
function bindForm(id,route){$(id).addEventListener('submit',async event=>{
 event.preventDefault();const button=event.submitter; if(button)button.disabled=true;
 try{
  const body=Object.fromEntries(new FormData(event.target)),kind=id==='#propertyForm'?'property':id==='#studentForm'?'student':null;
  if(kind){delete body.image_file;const upload=photoUploads[kind];if($(`#${kind}ImageFile`).files.length){if(upload.error)throw Error(upload.error);body.image_data=await upload.promise}}
  const out=await api(route,{method:'POST',body:JSON.stringify(body)});event.target.reset();if(kind)clearPhotoUpload(kind);closeModal(id.replace('Form','Modal'));await load();notify(`Saved successfully${out.id?' · '+out.id:''}`);
 }catch(error){notify(error.message)}finally{if(button)button.disabled=false}
})}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));$$('[data-open-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.openView)));$('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');$('#studentSearch').oninput=renderStudents;$('#studentStatus').onchange=renderStudents;$('#propertySearch').oninput=renderProperties;$$('.filter-chip').forEach(b=>b.onclick=()=>{$$('.filter-chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');propertyType=b.dataset.type;renderProperties()});$$('[data-event-filter]').forEach(b=>b.onclick=()=>{$$('[data-event-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');calendarFilter=b.dataset.eventFilter;hideCalendarTooltip();calendar?.refetchEvents()});
const photoUploads={};
async function prepareImageUpload(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG or WebP image.');
 if(file.size>8*1024*1024)throw Error('Choose an image smaller than 8 MB.');
 const bitmap=await createImageBitmap(file),ratio=Math.min(1,960/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 let quality=.82,photo=canvas.toDataURL('image/jpeg',quality);while(photo.length>350000&&quality>.4){quality-=.1;photo=canvas.toDataURL('image/jpeg',quality)}if(photo.length>350000)throw Error('Choose a smaller photo. This image is too detailed to upload.');return photo;
}

function clearPhotoUpload(kind){const widget=photoUploads[kind];widget.promise=null;widget.error='';$(`#${kind}ImageFile`).value='';$(`#${kind}UploadPreview`).hidden=true;$(`#${kind}UploadImage`).removeAttribute('src');$(`#${kind}UploadError`).hidden=true;}
for(const kind of ['property','student']){
 photoUploads[kind]={promise:null,error:''};
 $(`#${kind}ImageFile`).onchange=()=>{
  const file=$(`#${kind}ImageFile`).files[0];if(!file){clearPhotoUpload(kind);return}
  const widget=photoUploads[kind];widget.error='';$(`#${kind}UploadError`).hidden=true;$(`#${kind}UploadPreview`).hidden=true;
  const task=prepareImageUpload(file);widget.promise=task;
  task.then(photo=>{if(widget.promise!==task)return;$(`#${kind}UploadImage`).src=photo;$(`#${kind}UploadPreview`).hidden=false}).catch(error=>{if(widget.promise!==task)return;widget.error=error.message;$(`#${kind}UploadError`).textContent=error.message;$(`#${kind}UploadError`).hidden=false});
 };
 $(`#remove${kind[0].toUpperCase()+kind.slice(1)}Image`).onclick=()=>clearPhotoUpload(kind);
}
bindForm('#studentForm','/api/students');bindForm('#propertyForm','/api/properties');bindForm('#leadForm','/api/leads');bindForm('#followupForm','/api/followups');bindForm('#paymentForm','/api/payments');
$('#importBtn').onclick=()=>$('#csvInput').click();$('#csvInput').onchange=e=>{const r=new FileReader();r.onload=async()=>{const lines=r.result.trim().split(/\r?\n/),heads=lines.shift().split(',').map(x=>x.trim().toLowerCase()),rows=lines.map(line=>{const v=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));return Object.fromEntries(heads.map((h,i)=>[h,v[i]||'']))});const out=await api('/api/students/import',{method:'POST',body:JSON.stringify({rows})});await load();notify(`${out.added} imported · ${out.skipped} skipped`)};r.readAsText(e.target.files[0])};
$('#exportBtn').onclick=async()=>{const out=await api('/api/export'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));a.download=`adotrip-crm-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)};$('#keyForm').onsubmit=e=>{e.preventDefault();localStorage.setItem('adotrip_keys',JSON.stringify(Object.fromEntries(new FormData(e.target))));notify('Keys saved locally')};

let selectedStudentId = null;let signedInUser=null;let activeProfileTab='overview';
const studentStages = ['New Lead','Contacted','Interested','Follow-up Required','Converted','Lost'];
const profileDate = value => value ? new Date(value).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Not scheduled';
const stageGuidance = {
 'New Lead':'Confirm the course, preferred city and budget.',
 'Contacted':'Confirm room preferences and shortlist suitable stays.',
 'Interested':'Arrange a tour and discuss the booking.',
 'Follow-up Required':'Complete the callback and agree on the next step.',
 'Converted':'Confirm the payment balance and move-in arrangements.',
 'Lost':'Record the reason and close any remaining tasks.'
};
function openStudentProfile(id){
 if(!data.students.some(s=>s.id===id)){notify('Student record not found');return}
 const student=find('students',id);showView(student.status==='Converted'?'finalized':'students');if(selectedStudentId!==id)activeProfileTab='overview';selectedStudentId=id;$('#studentSearch').value='';$('#studentStatus').value='';$('#profileError').hidden=true;renderStudents();if(globalThis.location)ensureProfileExchangeRates();
}
let progressStudentId=null;
function updateStudentProgress(student){
 const values={'New Lead':0,'Contacted':25,'Interested':50,'Follow-up Required':75,'Converted':100,'Lost':0},value=values[student.status]??0,track=$('#profileProgressTrack'),fill=$('#profileProgressFill');
 $('#profileProgress').hidden=false;$('#profileProgressStage').textContent=student.status==='Lost'?'Closed · no booking':student.status==='Converted'?'Booking finalized':student.status;
 $('#profileProgressPercent').textContent=value+'%';track.setAttribute('aria-valuenow',String(value));track.setAttribute('aria-valuetext',`${student.status}: ${value}% of booking stages`);
 const journey=[['New Lead','Enquiry'],['Contacted','Contacted'],['Interested','Shortlisted'],['Follow-up Required','Follow-up'],['Converted','Finalized']],current=journey.findIndex(([stage])=>stage===student.status),closed=student.status==='Lost',finalized=student.status==='Converted';
 $('#profileJourney').innerHTML=journey.map(([stage,label],index)=>{const completed=!closed&&(index<current||finalized),active=!closed&&index===current&&!finalized;return `<li class="journey-step ${completed?'journey-completed':active?'journey-current':'journey-upcoming'}" ${!closed&&index===current?'aria-current="step"':''}><span class="journey-marker" aria-hidden="true">${completed?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4 10-10"/></svg>':index+1}</span><span class="journey-label">${label}</span><span class="visually-hidden">${completed?'Completed':active?'Current step':closed?'Not finalized':'Upcoming'}</span></li>`}).join('');
 $('#profileProgress').classList.toggle('progress-complete',value===100);$('#profileProgress').classList.toggle('progress-closed',student.status==='Lost');
 if(progressStudentId!==student.id){progressStudentId=student.id;fill.style.width='0%';const apply=()=>{if(progressStudentId===student.id)fill.style.width=value+'%'};if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(apply));else setTimeout(apply,0)}else fill.style.width=value+'%';
}
const profileCurrencies=['INR','USD','GBP','EUR','CAD','AUD','AED','SGD'];
let profileCurrency='INR',profileFx=null,profileFxLoading=false,profileFxError='',profileFxFetchedAt=0;
function studentPaymentPlan(budget,payments){
 const total=Math.max(0,Math.round((Number(budget)||0)*100));
 const received=payments.filter(p=>p.status==='Successful').reduce((sum,p)=>sum+Math.max(0,Math.round((Number(p.amount)||0)*100)),0);
 const first=Math.round(total*.1),second=Math.round(total*.6),amounts=[first,second,total-first-second];
 let available=received;
 const stages=amounts.map((amount,index)=>{
  const allocated=Math.min(amount,available);available-=allocated;
  return {percent:[10,60,30][index],amount:amount/100,received:allocated/100,due:(amount-allocated)/100,status:!total?'Not set':allocated===amount?'Paid':allocated?'Part paid':'Awaiting payment'};
 });
 return {total:total/100,received:received/100,outstanding:Math.max(0,total-received)/100,excess:Math.max(0,received-total)/100,stages};
}
function profileMoney(amount){
 if(profileCurrency==='INR')return money(amount);
 const rate=profileFx?.rates?.[profileCurrency];
 return rate?'≈ '+new Intl.NumberFormat('en-IN',{style:'currency',currency:profileCurrency,currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(amount)*rate):'—';
}
function profileMoneyMarkup(amount){return `<span data-profile-amount="${Number(amount)||0}">${esc(profileMoney(amount))}</span>`}
function paymentPlanMarkup(student,payments){
 const plan=studentPaymentPlan(student.budget,payments),rate=profileFx?.rates?.[profileCurrency];
 const rateText=profileFxLoading?'Updating exchange rates…':profileCurrency==='INR'?(profileFxError||'Select a currency to see a converted estimate.'):rate?`${profileFx.stale?'Last available rate':'Daily reference rate'} · ${profileFx.dates[profileCurrency]} · 1 INR = ${rate} ${profileCurrency}`:(profileFxError||'Exchange rate unavailable. Original INR amounts are shown below.');
 return `<section class="student-payment-plan" aria-labelledby="paymentPlanTitle"><div class="payment-plan-heading"><div><span class="panel-kicker">PAYMENT PLAN · 10 / 60 / 30</span><h3 id="paymentPlanTitle">Accommodation payments</h3><p>Based on monthly budget: ${money(student.budget)} INR</p></div><label class="payment-currency-label" for="profileCurrency">Display currency<select id="profileCurrency" class="form-select form-select-sm">${profileCurrencies.map(code=>`<option value="${code}" ${profileCurrency===code?'selected':''}>${code}</option>`).join('')}</select></label></div>
 <div class="payment-plan-summary"><div><span>Planned amount</span><strong>${profileMoneyMarkup(plan.total)}</strong></div><div><span>Payments received</span><strong>${profileMoneyMarkup(plan.received)}</strong></div><div><span>Balance remaining</span><strong>${profileMoneyMarkup(plan.outstanding)}</strong></div></div>
 <div class="payment-stage-grid">${plan.stages.map((stage,index)=>`<article class="payment-stage ${stage.status==='Paid'?'payment-stage-paid':''}"><div class="payment-stage-top"><span class="payment-stage-number">0${index+1}</span><span class="payment-stage-percent">${stage.percent}%</span></div><h4>${['Initial payment','Accommodation payment','Final payment'][index]}</h4><p>${['To start the process','After accommodation completion','To complete the payment plan'][index]}</p><strong class="payment-stage-amount">${profileMoneyMarkup(stage.amount)}</strong><span class="payment-stage-status">${stage.status}</span><div class="payment-stage-track" role="progressbar" aria-label="${['Initial','Accommodation','Final'][index]} payment received" aria-valuenow="${stage.amount?Math.round(stage.received/stage.amount*100):0}" aria-valuemin="0" aria-valuemax="100"><span style="width:${stage.amount?stage.received/stage.amount*100:0}%"></span></div><div class="payment-stage-balance"><span>Received <b>${profileMoneyMarkup(stage.received)}</b></span><span>Due <b>${profileMoneyMarkup(stage.due)}</b></span></div></article>`).join('')}</div>
 ${!plan.total?'<p class="payment-plan-note">Set a monthly budget to calculate the payment stages.</p>':''}${plan.excess?`<p class="payment-plan-note">Received above this plan: ${profileMoneyMarkup(plan.excess)}.</p>`:''}
 <p class="payment-plan-note">Successful payments are applied to the initial, accommodation and final stages in order.</p>
 <div class="payment-fx-footer"><p id="profileFxStatus" role="status">${esc(rateText)}</p><button type="button" class="text-btn" data-refresh-profile-rates ${profileFxLoading?'disabled':''}>${profileFxLoading?'Updating…':'Refresh rates'}</button></div><p class="payment-plan-note">Payments are recorded in INR. Currency conversions are estimates using <a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter</a> daily rates; bank rates and fees may differ.</p></section>`;
}
function updateProfilePaymentDisplay(){
 const student=find('students',selectedStudentId);if(!student.id)return;
 const holder=$('#studentPaymentPlan'),focused=document.activeElement?.id;
 if(holder)holder.innerHTML=paymentPlanMarkup(student,data.payments.filter(p=>p.student_id===student.id));
 for(const node of $$('#profileBody [data-profile-amount]'))node.textContent=profileMoney(Number(node.dataset.profileAmount));
 if(focused==='profileCurrency')$('#profileCurrency')?.focus?.();
}
async function ensureProfileExchangeRates(force=false){
 if(profileFxLoading||!force&&profileFx&&Date.now()-profileFxFetchedAt<3600000)return;
 profileFxLoading=true;profileFxError='';updateProfilePaymentDisplay();
 try{
  const result=await api('/api/exchange-rates');
  if(result.base!=='INR'||!result.rates||!profileCurrencies.every(code=>Number.isFinite(result.rates[code])&&result.rates[code]>0)||!result.dates||!profileCurrencies.filter(c=>c!=='INR').every(c=>/^\d{4}-\d{2}-\d{2}$/.test(result.dates[c])))throw Error('Invalid exchange-rate response.');
  profileFx=result;profileFxFetchedAt=Date.now();
 }catch{profileFxError='Rates unavailable. INR amounts remain available.';if(profileFx)profileFx={...profileFx,stale:true}}
 finally{profileFxLoading=false;updateProfilePaymentDisplay()}
}
function renderStudentProfile(){
 const student=find('students',selectedStudentId);$('#deleteStudentBtn').hidden=!student.id||signedInUser?.role!=='admin';
 if(!student.id){$('#profileTitle').textContent='Select a student';$('#profileSubtitle').textContent='';$('#profilePortrait').innerHTML='';$('#profileProgress').hidden=true;$('#profileJourney').innerHTML='';$('#profileBody').innerHTML='<div class="empty-state">Select a student from the list.</div>';return}
 const profile=profileInfo(student),leads=data.leads.filter(l=>l.student_id===student.id),tasks=data.followups.filter(f=>f.student_id===student.id).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)),payments=data.payments.filter(p=>p.student_id===student.id),pending=tasks.filter(f=>f.status!=='Done'),done=tasks.filter(f=>f.status==='Done'),paid=payments.filter(p=>p.status==='Successful').reduce((sum,p)=>sum+Number(p.amount),0);
 updateStudentProgress(student);$('#profileTitle').textContent=student.name;$('#profileSubtitle').textContent=`${studentReference(student)} · ${student.agent||'Unassigned'}`;$('#profilePortrait').innerHTML=personImage(student,'profile-portrait');
 const info=(entries)=>`<dl class="profile-details">${entries.filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
 const compactDate=value=>new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
 const taskCard=task=>`<article class="profile-task"><div class="task-date"><strong>${compactDate(task.starts_at)}</strong><span>${new Date(task.starts_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span></div><div class="task-content"><div class="profile-task-heading"><strong>${esc(task.purpose)}</strong>${task.priority==='High'?'<span class="task-priority">High priority</span>':''}</div><details class="completion-details"><summary>Complete follow-up <i data-lucide="check"></i></summary><form class="task-completion-form" data-complete-followup="${esc(task.id)}"><label>Outcome<textarea class="form-control" name="outcome" required rows="2" placeholder="Conversation, decision, next step"></textarea></label><button class="followup-save-btn" type="submit">Mark complete</button></form></details></div></article>`;
 const panelContents={
 overview:`<div id="studentPaymentPlan">${paymentPlanMarkup(student,payments)}</div>
<div class="profile-task-summary"><i data-lucide="calendar-clock"></i><span>Pending tasks <strong>${pending.length}</strong> / ${tasks.length} total</span></div>
<div class="profile-facts"><span><i data-lucide="map-pin"></i>${esc(student.city||'City not provided')}</span><span><i data-lucide="graduation-cap"></i>${esc(student.course||'Course not provided')}</span>${profile.room_preference?`<span><i data-lucide="bed-double"></i>${esc(profile.room_preference)}</span>`:''}${profile.move_in_date?`<span><i data-lucide="calendar"></i>Move-in ${compactDate(profile.move_in_date)}</span>`:''}</div>
<section class="profile-next-step"><div><span class="panel-kicker">NEXT ACTION</span><h3>${esc(pending[0]?.purpose|| (student.status==='Converted'?'Coordinate move-in':'Review enquiry'))}</h3><p>${esc(stageGuidance[student.status]||stageGuidance['New Lead'])}</p></div><i data-lucide="arrow-up-right"></i></section>
`,
 followups:`<div class="followup-workspace">
 <form id="profileStatusForm" class="followup-status-form"><label for="profileStatus">Status</label><select id="profileStatus" class="form-select" name="status">${studentStages.map(stage=>`<option ${stage===student.status?'selected':''}>${stage}</option>`).join('')}</select><button class="followup-save-btn" type="submit">Save</button></form>
 <section class="followup-upcoming" aria-labelledby="followupUpcomingHeading">
  <div class="followup-section-heading"><h3 id="followupUpcomingHeading">Upcoming</h3><span>${pending.length}</span></div>
  <div class="followup-task-list">${pending.map(taskCard).join('')||'<p class="profile-empty">All caught up.</p>'}</div>
 </section>
 <details class="followup-schedule"><summary><i data-lucide="plus"></i>Add follow-up</summary><form id="profileFollowupForm" class="profile-form"><label>Date and time<input class="form-control" type="datetime-local" name="starts_at" required></label><div class="followup-selects"><label>Purpose<select class="form-select" name="purpose"><option>Callback</option><option>Property discussion</option><option>Property visit</option><option>Payment reminder</option></select></label><label>Priority<select class="form-select" name="priority"><option>Medium</option><option>High</option><option>Low</option></select></label></div><button class="followup-save-btn" type="submit">Schedule</button></form></details>
 <details class="profile-disclosure followup-history"><summary>Completed <span>${done.length}</span></summary>${[...done].sort((a,b)=>new Date(b.completed_at||b.starts_at)-new Date(a.completed_at||a.starts_at)).map(task=>`<article class="completed-task"><div><strong>${esc(task.purpose)}</strong><small>${esc(profileDate(task.completed_at||task.starts_at))}</small></div><p>${esc(task.outcome||'No outcome recorded.')}</p></article>`).join('')||'<p class="profile-empty">No completed follow-ups.</p>'}</details>
 </div>`,
 properties:`<section class="profile-section"><div class="profile-section-heading"><h3>Properties & bookings</h3><span class="section-count">${leads.length} shortlisted</span></div><div class="profile-property-list">${leads.map(l=>{const p=find('properties',l.property_id);return `<article class="profile-property">${propertyPhoto(p,`furnished serviced apartment interior`)}<div><strong>${esc(p.name||'Property not selected')}</strong><p>${esc(p.location||'Location not provided')}</p><div class="property-detail-foot"><span>${p.price?money(p.price)+'/mo':'Price pending'}</span>${statusBadge(l.status)}</div><details><summary>Opportunity notes</summary><p>${esc(l.notes||'No notes recorded.')}</p><small>Follow-up: ${esc(l.followup||'Not scheduled')}</small></details></div></article>`}).join('')||'<p class="profile-empty">No properties shortlisted yet.</p>'}</div></section>`,
 payments:`<section class="profile-section"><h3 class="profile-tab-section-title"><i data-lucide="credit-card"></i>Payments & bookings <span>${payments.length}</span></h3>${payments.map(p=>`<article class="payment-detail-row"><div><strong>${profileMoneyMarkup(p.amount)}</strong><small>${esc(find('properties',p.property_id).name||'No property')} · ${esc(p.booking)}</small><small>${esc(p.id)} · ${esc(profileDate(p.paid_at))}</small></div>${statusBadge(p.status)}</article>`).join('')||'<p class="profile-empty">No payments recorded.</p>'}</section>`,
 details:`<section class="profile-section"><h3 class="profile-tab-section-title"><i data-lucide="user-round"></i>Personal & education details</h3>${info([['Mobile',student.mobile],['Email',student.email],['Nationality',profile.nationality],['Date of birth',profile.date_of_birth],['Gender',profile.gender],['Hometown',profile.hometown],['Address',profile.address],['University',profile.college],['Destination country',profile.destination_country],['Study year',profile.study_year],['Guardian',profile.guardian_name],['Relationship',profile.guardian_relation],['Guardian mobile',profile.guardian_mobile],['Languages',profile.languages],['Source',profile.source],['Created',profileDate(student.created_at)]])}</section>
<section class="profile-section"><h3 class="profile-tab-section-title"><i data-lucide="clipboard-list"></i>Accommodation requirements</h3>${info([['Preferred area',profile.preferred_area],['Apartment',profile.room_preference],['Meals',profile.food_preference],['Move-in',profile.move_in_date],['Duration',profile.stay_duration]])}<p class="profile-notes">${esc(student.notes||'No additional requirements.')}</p></section>`
 };
 const tabs=[['overview','Overview','layout-dashboard',null],['followups','Follow-ups','calendar-clock',pending.length],['properties','Properties','building-2',leads.length],['payments','Payments','credit-card',payments.length],['details','Details','user-round',null]];
 $('#profileBody').innerHTML=`<div class="profile-status-row">${statusBadge(student.status)}${profile.is_demo?'<span class="demo-label">DEMO PROFILE</span>':''}<div class="profile-contact"><a class="profile-contact-icon contact-call" href="tel:${esc(student.mobile)}" title="Call student" aria-label="Call ${esc(student.name)}"><i data-lucide="phone"></i></a>${student.email?`<a class="profile-contact-icon contact-email" href="mailto:${esc(student.email)}" title="Email student" aria-label="Email ${esc(student.name)}"><i data-lucide="mail"></i></a>`:''}</div></div>
 <div class="student-profile-tabs" role="tablist" aria-label="Student profile sections">${tabs.map(([key,label,icon,count])=>`<button type="button" id="student-tab-${key}" class="student-profile-tab ${activeProfileTab===key?'active':''}" role="tab" aria-selected="${activeProfileTab===key}" aria-controls="student-panel-${key}" tabindex="${activeProfileTab===key?'0':'-1'}" data-profile-tab="${key}"><i data-lucide="${icon}"></i>${label}${count===null?'':`<span>${count}</span>`}</button>`).join('')}</div>
 ${tabs.map(([key])=>`<div id="student-panel-${key}" class="student-profile-panel" role="tabpanel" aria-labelledby="student-tab-${key}" ${activeProfileTab===key?'':'hidden'}>${panelContents[key]}</div>`).join('')}`;
 icons();
}
let archivedStudents=[],studentArchiveLoading=false,studentArchiveLoaded=false,studentArchiveBusy=false;
function renderStudentArchive(){
 const section=$('#studentArchiveSection');if(!section)return;
 const admin=signedInUser?.role==='admin';section.hidden=!admin;if(!admin){archivedStudents=[];studentArchiveLoaded=false;return}
 $('#studentArchiveCount').textContent=String(archivedStudents.length);
 $('#refreshStudentArchive').disabled=studentArchiveLoading||studentArchiveBusy;
 $('#studentArchiveList').setAttribute('aria-busy',String(studentArchiveLoading));
 if(studentArchiveLoading){$('#studentArchiveList').innerHTML='<div class="empty-state">Loading archived students…</div>';return}
 if(!studentArchiveLoaded){$('#studentArchiveList').innerHTML='<div class="empty-state">Open or refresh the archive to load archived students.</div>';return}
 $('#studentArchiveList').innerHTML=archivedStudents.map(student=>`<article class="student-archive-row"><div class="student-archive-person"><strong>${esc(student.name)}</strong><span class="student-reference">${esc(studentReference(student))}</span><small>Archived ${esc(profileDate(student.archived_at))}${student.archived_by_name?` by ${esc(student.archived_by_name)}`:''}</small><small>${Number(student.lead_count)||0} leads · ${Number(student.followup_count)||0} follow-ups · ${Number(student.payment_count)||0} payments</small></div><div class="student-archive-actions"><button type="button" class="btn btn-outline-secondary btn-sm" data-restore-student="${esc(student.id)}" ${studentArchiveBusy?'disabled':''}>Restore</button><button type="button" class="btn btn-outline-danger btn-sm" data-permanent-delete-student="${esc(student.id)}" ${studentArchiveBusy?'disabled':''}>Delete permanently</button></div></article>`).join('')||'<div class="empty-state">No archived students.</div>';
}
async function loadStudentArchive(){
 if(signedInUser?.role!=='admin'||studentArchiveLoading)return;
 studentArchiveLoading=true;$('#studentArchiveError').hidden=true;renderStudentArchive();
 try{const result=await api('/api/students/archive');if(!Array.isArray(result.students))throw Error('Unable to load the student archive.');archivedStudents=result.students;studentArchiveLoaded=true}
 catch(error){$('#studentArchiveError').textContent=error.message;$('#studentArchiveError').hidden=false}
 finally{studentArchiveLoading=false;renderStudentArchive()}
}
async function manageArchivedStudent(id,permanent){
 if(signedInUser?.role!=='admin'||studentArchiveBusy)return;
 const student=archivedStudents.find(row=>row.id===id);if(!student)return;
 const message=permanent?`Permanently delete ${student.name} (${studentReference(student)})?\n\nThis removes their profile, ${student.lead_count} leads, ${student.followup_count} follow-ups, ${student.payment_count} payments and uploaded photo from the archive. This cannot be undone.`:`Restore ${student.name} (${studentReference(student)}) to the active workspace?`;
 if(!window.confirm(message))return;
 studentArchiveBusy=true;$('#studentArchiveError').hidden=true;renderStudentArchive();
 try{
  const result=await api(`/api/students/${encodeURIComponent(id)}/${permanent?'permanent':'restore'}`,permanent?{method:'DELETE'}:{method:'POST',body:'{}'});
  archivedStudents=archivedStudents.filter(row=>row.id!==id);renderStudentArchive();notify(result.warning||(permanent?'Student permanently deleted':'Student restored'));
  await load();await loadStudentArchive();
 }catch(error){$('#studentArchiveError').textContent=error.message;$('#studentArchiveError').hidden=false}
 finally{studentArchiveBusy=false;renderStudentArchive()}
}
if($('#refreshStudentArchive'))$('#refreshStudentArchive').onclick=loadStudentArchive;
if($('#studentArchiveList'))$('#studentArchiveList').addEventListener('click',event=>{const remove=event.target.closest('[data-permanent-delete-student]'),restore=event.target.closest('[data-restore-student]');if(remove)manageArchivedStudent(remove.dataset.permanentDeleteStudent,true);else if(restore)manageArchivedStudent(restore.dataset.restoreStudent,false)});
async function deleteSelectedStudent(){
 const student=find('students',selectedStudentId);if(!student.id||signedInUser?.role!=='admin')return;
 const linked=table=>data[table].filter(row=>row.student_id===student.id).length;
 if(!window.confirm(`Archive ${student.name}?\n\nTheir profile, ${linked('leads')} leads, ${linked('followups')} follow-ups and ${linked('payments')} payments will move out of the active workspace. An administrator can restore or permanently delete them from Settings → Student archive.`))return;
 const button=$('#deleteStudentBtn');button.disabled=true;$('#profileError').hidden=true;
 try{
  const result=await api(`/api/students/${encodeURIComponent(student.id)}`,{method:'DELETE'});
  for(const table of ['students','leads','followups','payments'])data[table]=data[table].filter(row=>table==='students'?row.id!==student.id:row.student_id!==student.id);
  selectedStudentId=null;activeProfileTab='overview';render();notify('Student moved to archive');await loadStudentArchive();
  await refreshNotifications().catch(()=>{});
 }catch(error){$('#profileError').textContent=error.message;$('#profileError').hidden=false}finally{button.disabled=false}
}
$('#deleteStudentBtn').onclick=deleteSelectedStudent;
document.addEventListener('click',event=>{const shortlistButton=event.target.closest('[data-property-shortlist]');if(shortlistButton&&!shortlistButton.disabled)shortlist(shortlistButton.dataset.propertyShortlist);const metric=event.target.closest('[data-metric-view]');if(metric)showView(metric.dataset.metricView);const trigger=event.target.closest('[data-student-profile]');if(trigger)openStudentProfile(trigger.dataset.studentProfile)});
function selectProfileTab(key,focus=false){
 if(!['overview','followups','properties','payments','details'].includes(key))return;activeProfileTab=key;
 $$('#profileBody [data-profile-tab]').forEach(button=>{const active=button.dataset.profileTab===key;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus()});
 $$('#profileBody .student-profile-panel').forEach(panel=>panel.hidden=panel.id!=='student-panel-'+key);icons();
}
$('#profileBody').addEventListener('change',event=>{if(event.target.id==='profileCurrency'&&profileCurrencies.includes(event.target.value)){profileCurrency=event.target.value;updateProfilePaymentDisplay();ensureProfileExchangeRates()}});
$('#profileBody').addEventListener('click',event=>{const tab=event.target.closest('[data-profile-tab]');if(tab)selectProfileTab(tab.dataset.profileTab);if(event.target.closest('[data-refresh-profile-rates]'))ensureProfileExchangeRates(true)});
$('#profileBody').addEventListener('keydown',event=>{const tab=event.target.closest('[data-profile-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=['overview','followups','properties','payments','details'],index=keys.indexOf(tab.dataset.profileTab),next=event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;selectProfileTab(keys[next],true)});
$('#profileBody').addEventListener('submit',async event=>{
 const form=event.target;if(!form.matches('#profileStatusForm,#profileFollowupForm,[data-complete-followup]'))return;event.preventDefault();
 const button=form.querySelector('button[type="submit"]'),recordId=selectedStudentId;button.disabled=true;$('#profileError').hidden=true;
 try{
  const payload=Object.fromEntries(new FormData(form));
  if(form.id==='profileStatusForm')await api(`/api/students/${encodeURIComponent(selectedStudentId)}`,{method:'PATCH',body:JSON.stringify(payload)});
  else if(form.id==='profileFollowupForm')await api('/api/followups',{method:'POST',body:JSON.stringify({...payload,student_id:selectedStudentId})});
  else await api(`/api/followups/${encodeURIComponent(form.dataset.completeFollowup)}`,{method:'PATCH',body:JSON.stringify({status:'Done',outcome:payload.outcome})});
  await load();if(form.id==='profileStatusForm')openStudentProfile(recordId);notify('Student record updated');
 }catch(error){$('#profileError').textContent=error.message;$('#profileError').hidden=false}finally{button.disabled=false}
});
$('#logoutBtn').onclick=async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'});location.replace('/login')};
async function accountPasswordKey(password,saltHex){const salt=Uint8Array.from(saltHex.match(/../g),byte=>parseInt(byte,16)),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']),bytes=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-512',iterations:210000,salt},key,512));return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')}
$('#createAccountForm').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;$('#accountCreateError').hidden=true;try{const starter=await api('/api/auth/generate-password',{method:'POST',body:'{}'}),fields=Object.fromEntries(new FormData(event.target));fields.temporary_password=starter.password;fields.password_salt=starter.salt;fields.password_key=await accountPasswordKey(starter.password,starter.salt);const result=await api('/api/auth/users',{method:'POST',body:JSON.stringify(fields)});$('#starterLoginEmail').textContent=result.email;$('#starterLoginPassword').value=result.temporary_password;$('#starterLoginResult').hidden=false;event.target.reset()}catch(error){$('#accountCreateError').textContent=error.message;$('#accountCreateError').hidden=false}finally{button.disabled=false}};
$('#clearStarterLogin').onclick=()=>{$('#starterLoginPassword').value='';$('#starterLoginResult').hidden=true};
let teamMembers=[],activeChatId=null,chatSignature='',chatRefreshing=false,chatReturnFocus=null;
function renderTeam(){
 const list=$('#teamDirectoryList');if(!list)return;
 const members=teamMembers.filter(member=>member.id!==signedInUser?.id);
 $('#teamDirectoryCount').textContent=members.length;
 list.innerHTML=members.map(member=>{
  const avatar=member.avatar_url?`<img src="${esc(member.avatar_url)}" alt="" loading="lazy">`:`<img src="${imagePlaceholder(member.name)}" alt="">`;
  return `<div class="team-person-row"><button type="button" class="team-person-card" data-message-user="${esc(member.id)}" aria-label="Message ${esc(member.name)}, ${member.online?'online':'offline'}"><span class="team-person-avatar">${avatar}<span class="team-presence-dot ${member.online?'team-presence-online':'team-presence-offline'}" role="img" aria-label="${member.online?'Online':'Offline'}" title="${member.online?'Online':'Offline'}"></span></span><span class="team-person-info"><strong>${esc(member.name)}</strong><small>${member.role==='admin'?'Admin':'Team member'}</small></span><i data-lucide="message-circle" class="team-person-action" aria-hidden="true"></i></button>${member.unread_count?`<button type="button" class="team-unread-dot" data-message-user="${esc(member.id)}" data-message-preview="${esc(member.unread_preview||'New message')}" data-unread-count="${member.unread_count}" aria-label="${member.unread_count} unread messages from ${esc(member.name)}" aria-describedby="teamMessageTooltip"></button>`:''}</div>`;
 }).join('')||'<p class="team-directory-empty">No other team members yet.</p>';icons();
}
async function refreshTeam(){
 if(!signedInUser)return;
 try{
  const [,result]=await Promise.allSettled([
   !document.hidden?api('/api/team/presence',{method:'POST',body:'{}'}):Promise.resolve(),
   api('/api/team')
  ]);
  if(result.status==='rejected')throw result.reason;
  const out=result.value;if(!Array.isArray(out.users))throw Error('Unable to load team');
  const changed=JSON.stringify(teamMembers)!==JSON.stringify(out.users);teamMembers=out.users;
  if(changed||!$('#teamDirectoryList').querySelector?.('.team-person-card'))renderTeam();
  if(activeChatId&&!document.hidden)await refreshConversation();
 }catch(error){
  console.warn('Team directory refresh failed:',error.message);
  if(!teamMembers.length)$('#teamDirectoryList').innerHTML=`<p class="team-directory-empty">${esc(error.message)}</p><button type="button" class="team-retry-btn" data-team-retry>Retry</button>`;
  if(activeChatId)showMessageError(error.message);
 }
}
function showMessageError(text){const error=$('#messageError');error.textContent=text;error.hidden=false}
async function refreshConversation(){
 if(!activeChatId||chatRefreshing||document.hidden)return;chatRefreshing=true;const target=activeChatId;
 try{
  const out=await api('/api/messages/'+encodeURIComponent(target));if(target!==activeChatId)return;
  if(!Array.isArray(out.messages))throw Error('Unable to load messages');
  $('#messagePanelName').textContent=out.member.name;$('#messagePanelRole').textContent=out.member.role==='admin'?'Admin':'Team member';
  const list=$('#messageList'),signature=JSON.stringify(out.messages),nearBottom=!chatSignature||list.scrollHeight-list.scrollTop-list.clientHeight<60;
  if(signature!==chatSignature){
   list.innerHTML=out.messages.map(message=>`<article class="direct-message ${message.sender_id===signedInUser.id?'direct-message-own':''}"><p>${esc(message.body)}</p><small>${new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(message.created_at))}${message.sender_id===signedInUser.id?' · '+(message.read_at?'Read':'Sent'):''}</small></article>`).join('')||'<p class="message-empty">Start a conversation.</p>';
   chatSignature=signature;if(nearBottom)list.scrollTop=list.scrollHeight;
  }
  const unread=out.messages.filter(message=>message.recipient_id===signedInUser.id&&!message.read_at);
  if(unread.length&&!document.hidden&&target===activeChatId){
   await api('/api/messages/'+encodeURIComponent(target)+'/read',{method:'POST',body:JSON.stringify({ids:unread.map(message=>message.id)})});
   const member=teamMembers.find(member=>member.id===target);if(member){member.unread_count=Math.max(0,member.unread_count-unread.length);renderTeam()}
  }
  $('#messageError').hidden=true;
 }catch(error){if(target===activeChatId)showMessageError(error.message)}finally{chatRefreshing=false}
}
async function openDirectMessage(userId){
 if(userId===signedInUser?.id)return;
 if(!activeChatId)chatReturnFocus=document.activeElement;
 activeChatId=userId;chatSignature='';$('#messagePanel').hidden=false;$('#messageList').innerHTML='<p class="message-empty">Loading conversation…</p>';$('#messageError').hidden=true;$('#directMessageBody').value='';$('#teamMessageTooltip').hidden=true;
 const member=teamMembers.find(member=>member.id===userId);$('#messagePanelName').textContent=member?.name||'Message';
 await refreshConversation();$('#directMessageBody').focus();
}
$('#closeMessagePanel').onclick=()=>{activeChatId=null;chatSignature='';$('#messagePanel').hidden=true;chatReturnFocus?.focus?.()};
$('#teamDirectoryList').addEventListener('click',event=>{if(event.target.closest('[data-team-retry]')){refreshTeam();return}const button=event.target.closest('[data-message-user]');if(button&&!button.disabled)openDirectMessage(button.dataset.messageUser)});
function showTeamTooltip(dot){
 const tooltip=$('#teamMessageTooltip'),rect=dot.getBoundingClientRect();tooltip.textContent=`${dot.dataset.unreadCount} unread · ${dot.dataset.messagePreview}`;tooltip.hidden=false;
 tooltip.style.left=Math.max(8,Math.min(rect.right+12,window.innerWidth-268))+'px';tooltip.style.top=Math.max(8,Math.min(rect.top,window.innerHeight-tooltip.offsetHeight-8))+'px';
}
$('#teamDirectoryList').addEventListener('mouseover',event=>{const dot=event.target.closest('.team-unread-dot');if(dot)showTeamTooltip(dot)});
$('#teamDirectoryList').addEventListener('mouseout',event=>{if(event.target.closest('.team-unread-dot'))$('#teamMessageTooltip').hidden=true});
$('#teamDirectoryList').addEventListener('focusin',event=>{const dot=event.target.closest('.team-unread-dot');if(dot)showTeamTooltip(dot)});
$('#teamDirectoryList').addEventListener('focusout',()=>{$('#teamMessageTooltip').hidden=true});
$('#teamDirectoryList').addEventListener('scroll',()=>{$('#teamMessageTooltip').hidden=true});
$('#directMessageForm').onsubmit=async event=>{
 event.preventDefault();const target=activeChatId,body=$('#directMessageBody').value.trim();if(!target||!body)return;
 const button=event.target.querySelector('button[type="submit"]');button.disabled=true;$('#messageError').hidden=true;
 try{await api('/api/messages/'+encodeURIComponent(target),{method:'POST',body:JSON.stringify({body})});if(target===activeChatId){$('#directMessageBody').value='';await refreshConversation()}}
 catch(error){showMessageError(error.message)}finally{button.disabled=false}
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeChatId)$('#closeMessagePanel').click()});

let activeNotifFilter='all',notifications=[],notificationError='';
async function refreshNotifications(){
 try{const out=await api('/api/notifications');if(!Array.isArray(out.notifications))throw Error('Unable to load notifications');notifications=out.notifications.map(item=>({...item,time:item.time||new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(item.created_at))}));notificationError='';renderNotifications()}
 catch(error){notificationError='Notifications unavailable. Retrying automatically.';renderNotifications();throw error}
}
async function updateNotifications(action,ids=[]){
 try{if(action==='read'&&ids.length>200){for(let offset=0;offset<ids.length;offset+=200)await api('/api/notifications/read',{method:'POST',body:JSON.stringify({ids:ids.slice(offset,offset+200)})});}else await api('/api/notifications/'+action,{method:'POST',body:JSON.stringify({ids})});await refreshNotifications()}
 catch(error){notify(error.message)}
}
let refreshingWorkspace=false,pendingWorkspaceRender=false;
async function refreshWorkspace(){
 if(refreshingWorkspace||document.hidden||!signedInUser)return;refreshingWorkspace=true;
 try{
  const [stateResult]=await Promise.allSettled([api('/api/state'),refreshNotifications(),refreshTeam()]);
  if(stateResult.status==='rejected')throw stateResult.reason;const state=stateResult.value;
  if(!['students','properties','leads','followups','payments'].every(key=>Array.isArray(state[key])))throw Error('Invalid CRM data');
  const changed=JSON.stringify(state)!==JSON.stringify(data);data=state;
  const editing=document.activeElement?.closest?.('form')||$('#profileBody')?.querySelector?.('details[open] form')||$('.modal.show');
  pendingWorkspaceRender ||= changed;
  if(pendingWorkspaceRender&&!editing){render();pendingWorkspaceRender=false}else{
   renderTodaySchedule();
   if(changed){renderWorkspaceHeroes();renderStats();renderProperties();renderCharts();const student=data.students.find(s=>s.id===selectedStudentId);if(student)updateStudentProgress(student)}
  }
  if($('#dataNotice'))$('#dataNotice').hidden=true;icons();
 }catch(error){showDataError(error)}finally{refreshingWorkspace=false}
}

const notificationActorColors=new Map();
function notificationActorColor(actorId){if(!actorId)return 'notif-tone-reminder';if(!notificationActorColors.has(actorId))notificationActorColors.set(actorId,notificationActorColors.size%8);return 'notif-tone-'+notificationActorColors.get(actorId)}
function renderNotifications(){
 const listEl=$('#notificationList');if(!listEl)return;
 const unreadCount=notifications.filter(n=>n.unread).length;
 const badgeEl=$('#notificationBadge');
 if(badgeEl){badgeEl.textContent=unreadCount;badgeEl.hidden=unreadCount===0}
 const unreadText=$('#notificationUnreadCount');
 if(unreadText)unreadText.textContent=unreadCount;

 const unread=notifications.filter(item=>item.unread),actors=new Map();
 for(const item of notifications)if(item.actorId)actors.set(item.actorId,item.actorName||'Team member');
 Array.from(actors.keys()).sort().forEach(notificationActorColor);
 const tabs=[{id:'all',name:'All',count:unread.length},{id:'reminders',name:'Reminders',count:unread.filter(item=>!item.actorId).length},...Array.from(actors,([id,name])=>({id:'actor:'+id,name:id===signedInUser?.id?'You':name,count:unread.filter(item=>item.actorId===id).length})).sort((a,b)=>a.name.localeCompare(b.name))];
 if(!tabs.some(tab=>tab.id===activeNotifFilter))activeNotifFilter='all';
 const tabList=$('#notificationActorTabs');if(tabList)tabList.innerHTML=tabs.map(tab=>`<button type="button" class="notification-tab ${activeNotifFilter===tab.id?'active':''}" data-notif-filter="${esc(tab.id)}" role="tab" aria-selected="${activeNotifFilter===tab.id}">${esc(tab.name)} <span class="tab-count">${tab.count}</span></button>`).join('');
 const markRead=$('#markAllReadBtn');if(markRead){const label=activeNotifFilter==='all'?'Mark all as read':'Mark this tab as read';markRead.setAttribute('title',label);markRead.setAttribute('aria-label',label);markRead.disabled=!unread.some(item=>activeNotifFilter==='all'||(activeNotifFilter==='reminders'?!item.actorId:activeNotifFilter==='actor:'+item.actorId));}
 const filtered=unread.filter(item=>activeNotifFilter==='all'||(activeNotifFilter==='reminders'?!item.actorId:activeNotifFilter==='actor:'+item.actorId));
 if(filtered.length===0){
  listEl.innerHTML=`<div class="notification-empty"><div class="notification-empty-icon"><i data-lucide="bell-off"></i></div><strong>${notificationError||'All caught up!'}</strong></div>`;
 }else{
  listEl.innerHTML=filtered.map(item=>`
   <article class="notification-item unread ${notificationActorColor(item.actorId)}" data-notif-id="${esc(item.id)}">
    <div class="notif-icon-box ${item.iconColor||'blue'}"><i data-lucide="${item.icon||'bell'}"></i></div>
    <div class="notif-content">
     <div class="notif-top-row">
      <span class="notif-title">${esc(item.title)}</span>
      ${item.actionView||item.studentId?`<button type="button" class="notif-action-link" data-notif-action="${esc(item.id)}" aria-label="Open notification: ${esc(item.title)}" title="Open"><i data-lucide="arrow-up-right"></i></button>`:''}
      <button type="button" class="notif-dismiss-btn" data-notif-dismiss="${esc(item.id)}" title="Dismiss notification" aria-label="Dismiss notification"><i data-lucide="x"></i></button>
      ${item.priority==='urgent'?`<span class="notif-tag badge-urgent">Urgent</span>`:''}
     </div>
     <p class="notif-message">${esc(item.actorName&&item.message?.startsWith(item.actorName+' · ')?item.message.slice(item.actorName.length+3):item.message)}</p>
     <div class="notif-meta-row">
      ${item.actorName?`<span class="notif-author">${esc(item.actorId===signedInUser?.id?'You':item.actorName)}</span><span class="notif-meta-dot" aria-hidden="true">·</span>`:''}<span>${esc(item.time)}</span>
     </div>
    </div>
   </article>
  `).join('');
 }
 icons();
}

function initNotificationHandlers(){
 const notifBtn=$('#notificationBtn'),panel=$('#notificationPanel');
 if(!notifBtn||!panel)return;
 function toggleNotificationPanel(force){
  const isHidden=typeof force==='boolean'?!force:!panel.hidden;
  panel.hidden=isHidden;
  notifBtn.setAttribute('aria-expanded',String(!isHidden));
  if(!isHidden){notifBtn.classList.add('active');renderNotifications();if(signedInUser)refreshNotifications().catch(()=>{})}else{notifBtn.classList.remove('active')}
 }
 notifBtn.onclick=e=>{e.stopPropagation();toggleNotificationPanel()};
 const closeBtn=$('#closeNotificationBtn');
 if(closeBtn)closeBtn.onclick=e=>{e.stopPropagation();toggleNotificationPanel(false)};

 const actorTabs=$('#notificationActorTabs');if(actorTabs)actorTabs.onclick=event=>{const tab=event.target.closest?.('[data-notif-filter]');if(!tab)return;event.stopPropagation();activeNotifFilter=tab.dataset.notifFilter;renderNotifications()};

 const markAllBtn=$('#markAllReadBtn');
 if(markAllBtn)markAllBtn.onclick=e=>{e.stopPropagation();updateNotifications('read',notifications.filter(item=>item.unread&&(activeNotifFilter==='all'||(activeNotifFilter==='reminders'?!item.actorId:activeNotifFilter==='actor:'+item.actorId))).map(item=>item.id))};
 const clearReadBtn=$('#clearReadNotificationsBtn');
 if(clearReadBtn)clearReadBtn.onclick=e=>{e.stopPropagation();updateNotifications('clear-read')};

 const listEl=$('#notificationList');
 if(listEl){
  listEl.onclick=e=>{
   const dismissBtn=e.target.closest?.('[data-notif-dismiss]');
   if(dismissBtn){
    e.stopPropagation();
    updateNotifications('dismiss',[dismissBtn.dataset.notifDismiss]);
    return;
   }
   const itemEl=e.target.closest?.('[data-notif-id]');
   if(!itemEl)return;
   const notif=notifications.find(n=>n.id===itemEl.dataset.notifId);
   if(!notif)return;
   updateNotifications('read',[notif.id]);
   if(notif.id.startsWith('reminder:')){showView('calendar');calendar?.gotoDate(notif.created_at);toggleNotificationPanel(false)}else if(notif.studentId){
    showView('students');
    if(typeof openStudentProfile==='function')openStudentProfile(notif.studentId);
    toggleNotificationPanel(false);
   }else if(notif.actionView){
    showView(notif.actionView);
    toggleNotificationPanel(false);
   }
  };
 }

 document.addEventListener('click',e=>{
  if(panel&&!panel.hidden){
   const wrapper=$('#notificationWrapper');
   if(wrapper&&e.target&&typeof wrapper.contains==='function'&&!wrapper.contains(e.target)){
    toggleNotificationPanel(false);
   }
  }
 });
}

function initGlobalSearchHandlers(){
 const searchInput=$('#globalSearch'),searchDropdown=$('#searchResultsDropdown'),searchContent=$('#searchResultsContent'),clearBtn=$('#searchClearBtn');
 if(!searchInput||!searchDropdown||!searchContent)return;

 function performSearch(query){
  const q=(query||'').trim().toLowerCase();
  if(!q){searchDropdown.hidden=true;if(clearBtn)clearBtn.hidden=true;return}
  if(clearBtn)clearBtn.hidden=false;
  searchDropdown.hidden=false;

  const matchedStudents=(data.students||[]).filter(s=>
   (s.name||'').toLowerCase().includes(q)||
   (s.course||'').toLowerCase().includes(q)||
   (s.city||'').toLowerCase().includes(q)||
   (s.mobile||'').toLowerCase().includes(q)||
   (s.status||'').toLowerCase().includes(q)
  ).slice(0,4);

  const matchedProperties=(data.properties||[]).filter(p=>
   (p.name||'').toLowerCase().includes(q)||
   (p.location||'').toLowerCase().includes(q)||
   (p.type||'').toLowerCase().includes(q)
  ).slice(0,3);

  const matchedLeads=(data.leads||[]).filter(l=>{
   const s=(data.students||[]).find(st=>st.id===l.student_id);
   return (s?.name||'').toLowerCase().includes(q)||(l.notes||'').toLowerCase().includes(q);
  }).slice(0,3);

  let html='';
  if(matchedStudents.length>0){
   html+=`<div class="search-group-title">Students</div>`;
   html+=matchedStudents.map(s=>`
    <div class="search-result-item" data-search-student="${esc(s.id)}">
     <div class="search-result-icon"><i data-lucide="graduation-cap"></i></div>
     <div class="search-result-text"><strong>${esc(s.name)}</strong><small>${esc(s.course||'No course')} · ${esc(s.city||'India')} · ${esc(s.status)}</small></div>
    </div>
   `).join('');
  }

  if(matchedProperties.length>0){
   html+=`<div class="search-group-title">Properties</div>`;
   html+=matchedProperties.map(p=>`
    <div class="search-result-item" data-search-property="${esc(p.id)}">
     <div class="search-result-icon"><i data-lucide="building-2"></i></div>
     <div class="search-result-text"><strong>${esc(p.name)}</strong><small>${esc(p.location)} · ${p.price?'₹'+Number(p.price).toLocaleString('en-IN')+'/mo':''}</small></div>
    </div>
   `).join('');
  }

  if(matchedLeads.length>0){
   html+=`<div class="search-group-title">Opportunities</div>`;
   html+=matchedLeads.map(l=>{
    const s=(data.students||[]).find(st=>st.id===l.student_id);
    const p=(data.properties||[]).find(pr=>pr.id===l.property_id);
    return `
     <div class="search-result-item" data-search-lead="${esc(l.id)}">
      <div class="search-result-icon"><i data-lucide="list-filter"></i></div>
      <div class="search-result-text"><strong>${esc(s?.name||'Lead')} · ${esc(p?.name||'')}</strong><small>Stage: ${esc(l.status)} · Next: ${esc(l.followup||'None')}</small></div>
     </div>
    `;
   }).join('');
  }

  if(!html){
   html=`<div class="search-empty">No matching records found for "${esc(query)}".</div>`;
  }
  searchContent.innerHTML=html;
  icons();
 }

 searchInput.oninput=e=>performSearch(e.target.value);
 if(clearBtn){
  clearBtn.onclick=()=>{
   searchInput.value='';
   clearBtn.hidden=true;
   searchDropdown.hidden=true;
   searchInput.focus();
  };
 }

 searchContent.onclick=e=>{
  const studentItem=e.target.closest?.('[data-search-student]');
  if(studentItem){
   showView('students');
   if(typeof openStudentProfile==='function')openStudentProfile(studentItem.dataset.searchStudent);
   searchDropdown.hidden=true;
   return;
  }
  const propItem=e.target.closest?.('[data-search-property]');
  if(propItem){showView('properties');searchDropdown.hidden=true;return}
  const leadItem=e.target.closest?.('[data-search-lead]');
  if(leadItem){showView('leads');searchDropdown.hidden=true;return}
 };

 document.addEventListener('click',e=>{
  const container=$('#globalSearchContainer');
  if(container&&!searchDropdown.hidden){
   if(typeof container.contains==='function'&&!container.contains(e.target)){
    searchDropdown.hidden=true;
   }
  }
 });

 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
   searchDropdown.hidden=true;
   if($('#notificationPanel'))$('#notificationPanel').hidden=true;
  }
 });
}

async function startWorkspace(){
 if(globalThis.location){
  const session=await api('/api/auth/session');
  if(!session.user||session.user.must_change_password){location.replace('/login');return}
  signedInUser=session.user;
  $('#accountName').textContent=signedInUser.name;
  $('#accountRole').textContent=signedInUser.role==='admin'?'Administrator':'Team member';
  $('#accountSettings').hidden=signedInUser.role!=='admin';
  if(signedInUser.image_url){
   const avatar=$('#accountAvatar');
   avatar.removeAttribute('data-target');avatar.removeAttribute('data-query');avatar.src=signedInUser.image_url;
  }
  if($('#topbarUserName'))$('#topbarUserName').textContent=signedInUser.name;
  if($('#topbarUserRole'))$('#topbarUserRole').textContent=signedInUser.role==='admin'?'Admin':'Agent';
  if($('#topbarUserInitials')){
   const parts=(signedInUser.name||'').trim().split(/\s+/).filter(Boolean);
   const initials=parts.map(p=>p[0]?.toUpperCase()).slice(0,2).join('')||'TM';
   $('#topbarUserInitials').textContent=initials;
  }
 }
 const headerDate=$('#headerDateText');
 if(headerDate){
  try{
   headerDate.textContent=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date());
  }catch(_){headerDate.textContent='Wed, 14 Oct 2026'}
 }
 await load();if(signedInUser)await refreshTeam();renderNotifications();initNotificationHandlers();initGlobalSearchHandlers();if(globalThis.location)ensureProfileExchangeRates();const view=globalThis.location?.hash?.slice(1);if(['dashboard','students','pending','finalized','properties','leads','calendar','payments','settings'].includes(view))showView(view);icons();
}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();$('#globalSearch').focus()}});
if(!hostedStaticPage&&(typeof staticPreview==='undefined'||!staticPreview)){
 startWorkspace().then(()=>{if(signedInUser){setInterval(refreshWorkspace,5000);window.addEventListener?.('focus',refreshWorkspace);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWorkspace()})}}).catch(showDataError);
}
