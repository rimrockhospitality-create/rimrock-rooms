/*
 * Rimrock Rooms
 * Product concept and operating design: Ryan Kelly
 * Original project owner: Ryan Kelly
 * Everhome Suites Denver Airport (CO534)
 * September 2026
 */
const API_URL='https://script.google.com/macros/s/AKfycby4lxHCqEsiURHZzUv93rDs5rv1Vkdv_yuyanbLVg3aU6PrBf4yhlpZogiGct0zSRmB7w/exec';
const ROLE_VIEWS={
  HOUSEKEEPER:['Home','Housekeeping'],
  INSPECTOR:['Home','Inspections'],
  MAINTENANCE:['Home','Maintenance','Preventive Maintenance'],
  'FRONT DESK':['Home','Housekeeping','Maintenance'],
  MANAGER:['Home','Housekeeping','Inspections','Maintenance','Preventive Maintenance','Reports','Property Settings','Users','Settings']
};
const ROLE_LABELS={HOUSEKEEPER:'Housekeeper',INSPECTOR:'Inspector',MAINTENANCE:'Maintenance','FRONT DESK':'Front Desk',MANAGER:'Manager'};
let currentUser=null;
const home=document.getElementById('homeView'),importView=document.getElementById('importView'),placeholder=document.getElementById('placeholder'),title=document.getElementById('placeholderTitle'),drawer=document.getElementById('drawer'),drawerLinks=document.getElementById('drawerLinks');
document.getElementById('today').textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date());

async function loadSession(){
  const [usersRes,propertiesRes]=await Promise.all([fetch('data/users.json',{cache:'no-store'}),fetch('data/properties.json',{cache:'no-store'})]);
  const users=await usersRes.json(),properties=await propertiesRes.json();
  // Section 1 session adapter. Replace this single resolver with production authentication at deployment.
  const requested=new URLSearchParams(location.search).get('user');
  currentUser=users.find(u=>u.active&&(u.userId===requested))||users.find(u=>u.active);
  if(!currentUser) throw new Error('No active user is configured.');
  const property=properties.find(p=>p.propertyId===currentUser.propertyId);
  applyIdentity(currentUser,property);
  applyPermissions(currentUser.roles);
  buildDrawer(currentUser.roles);
}
function allowedViews(roles){return [...new Set(roles.flatMap(r=>ROLE_VIEWS[r]||[]))]}
function applyIdentity(user,property){
  const roleText=user.roles.map(r=>ROLE_LABELS[r]||r).join(' / ');
  document.querySelectorAll('.profile span,.drawer-user span').forEach(el=>el.innerHTML=user.name+'<small>'+roleText+'</small>');
  document.querySelectorAll('.profile b,.drawer-user b').forEach(el=>el.textContent=user.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase());
  const propertyEl=document.querySelector('.property');
  if(propertyEl&&property) propertyEl.innerHTML='<strong>'+property.name+'</strong><span>'+property.propertyId+' &nbsp;|&nbsp; '+property.roomCount+' Rooms</span>';
  const welcome=document.querySelector('.welcome h1'); if(welcome) welcome.textContent='Good afternoon, '+user.name.split(' ')[0];
  const sub=document.querySelector('.welcome p'); if(sub&&property) sub.textContent=property.name+'  ('+property.propertyId+')';
}
function applyPermissions(roles){
  const allowed=new Set(allowedViews(roles));
  document.querySelectorAll('.nav[data-view],.mobile-nav [data-view]').forEach(el=>{el.hidden=!allowed.has(el.dataset.view)});
}
function show(view){
  if(currentUser&&!allowedViews(currentUser.roles).includes(view)) return;
  home.hidden=view!=='Home'; importView.hidden=view!=='Housekeeping'; placeholder.hidden=(view==='Home'||view==='Housekeeping'); if(!placeholder.hidden) title.textContent=view
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); drawer.hidden=true;
}
function buildDrawer(roles){
  drawerLinks.innerHTML='';
  allowedViews(roles).forEach(v=>{const b=document.createElement('button');b.className='nav';b.dataset.view=v;b.innerHTML='◆ <span>'+v+'</span>';b.addEventListener('click',()=>show(v));drawerLinks.appendChild(b)});
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
document.querySelectorAll('.tile[data-view]').forEach(b=>{ b.hidden=false; });
document.getElementById('backHome').addEventListener('click',()=>show('Home'));
document.getElementById('moreBtn').addEventListener('click',()=>drawer.hidden=false);
document.getElementById('closeDrawer').addEventListener('click',()=>drawer.hidden=true);
loadSession().catch(err=>{home.innerHTML='<div class="placeholder"><div><h2>Unable to start Rimrock Rooms</h2><p>'+err.message+'</p></div></div>'});
const hkPdf=document.getElementById('hkPdf'),dropzone=document.getElementById('dropzone'),fileStatus=document.getElementById('fileStatus'),previewPdf=document.getElementById('previewPdf'),previewPanel=document.getElementById('previewPanel'),previewSummary=document.getElementById('previewSummary'),assignmentPreview=document.getElementById('assignmentPreview'),previewMessage=document.getElementById('previewMessage'),validateImport=document.getElementById('validateImport'),validationPanel=document.getElementById('validationPanel'),validationChecks=document.getElementById('validationChecks'),validationSummary=document.getElementById('validationSummary'),validationState=document.getElementById('validationState'),comparePanel=document.getElementById('comparePanel'),compareSummary=document.getElementById('compareSummary'),compareDetails=document.getElementById('compareDetails'),importDaily=document.getElementById('importDaily'); let selectedPdf=null,lastParsed=null;
function acceptHousekeepingPdf(file){
  fileStatus.className='file-status';
  if(!file){fileStatus.textContent='';return}
  if(!(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))){fileStatus.textContent='Please choose a PDF file.';fileStatus.classList.add('error');return}
  if(file.size>10*1024*1024){fileStatus.textContent='That PDF is larger than the 10 MB Section 2 limit.';fileStatus.classList.add('error');return}
  selectedPdf=file; lastParsed=null; previewPdf.disabled=false; previewPanel.hidden=true; validateImport.disabled=true; validationPanel.hidden=true; comparePanel.hidden=true; importDaily.disabled=true;
  fileStatus.textContent='✓ '+file.name+' selected — ready for Preview (Step 2).';
  fileStatus.classList.add('ok');
}
hkPdf.addEventListener('change',()=>acceptHousekeepingPdf(hkPdf.files[0]));
['dragenter','dragover'].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop',e=>acceptHousekeepingPdf(e.dataTransfer.files[0]));

async function loadPdfJs(){
  if(window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return window.pdfjsLib;
}
function parseChoiceText(text){
  const property=(text.match(/Property\s*Code:\s*([A-Z0-9]+)/i)||[])[1]||'';
  const date=(text.match(/Business\s*Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)||[])[1]||'';
  const roomRows=[...text.matchAll(/(?:^|\s)(\d{3})\s+(NK|NQQ|SNHK|SNK|NHQQ1?|NHK1)\s+(VAC|OCC)\s+(Ready|Dirty)/g)].map(m=>({room:m[1],type:m[2],status:m[3],condition:m[4]}));
  const uniqueRooms=[...new Map(roomRows.map(r=>[r.room,r])).values()];
  const assignments=[];
  // Choice renders the report title immediately before a named assignment on some PDFs.
  // Anchor the employee name to "Business Date" and strip report-title noise before normalizing Last, First.
  const names=[...text.matchAll(/(?:Housekeeping\s+Room\s+Assignment\s+)?([A-Z][A-Za-z' -]{1,40}),\s*([A-Z][A-Za-z' -]{1,40})\s+Business\s*Date:/g)];
  for(const n of names){
    const start=n.index, next=names.find(x=>x.index>start);
    const block=text.slice(start,next?next.index:text.length);
    const assigned=[...block.matchAll(/(?:^|\s)(\d{3})\s+(?:NK|NQQ|SNHK|SNK|NHQQ1?|NHK1)\s+(?:VAC|OCC)\s+(?:Ready|Dirty)/g)].map(m=>m[1]);
    const last=n[1].replace(/Housekeeping\s+Room\s+Assignment/gi,'').trim();
    const first=n[2].trim();
    assignments.push({name:first+' '+last,rooms:[...new Set(assigned)]});
  }
  return {property,date,rooms:uniqueRooms,assignments};
}
previewPdf.addEventListener('click',async()=>{
  if(!selectedPdf)return;
  previewPdf.disabled=true; previewPdf.textContent='Reading PDF…'; previewMessage.className='preview-message'; previewMessage.textContent='';
  try{
    const pdfjs=await loadPdfJs(),bytes=new Uint8Array(await selectedPdf.arrayBuffer()),pdf=await pdfjs.getDocument({data:bytes}).promise;
    let text='';
    for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),content=await page.getTextContent();text+='\n'+content.items.map(i=>i.str).join(' ')}
    const parsed=parseChoiceText(text); lastParsed=parsed;
    previewPanel.hidden=false; validateImport.disabled=false;
    previewSummary.innerHTML=[
      ['Business Date',parsed.date||'Not found'],['Property',parsed.property||'Not found'],['Unique Rooms',parsed.rooms.length],['Housekeepers',parsed.assignments.length]
    ].map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join('');
    assignmentPreview.innerHTML=parsed.assignments.length?'<h3>Housekeeper Assignments</h3>'+parsed.assignments.map(a=>'<article><strong>'+a.name+'</strong><span>'+a.rooms.length+' room'+(a.rooms.length===1?'':'s')+': '+(a.rooms.join(', ')||'none detected')+'</span></article>').join(''):'';
    const pass=parsed.property==='CO534'&&parsed.date==='9/18/2026'&&parsed.rooms.length===114&&parsed.assignments.some(a=>a.name==='Detra Pleasant'&&a.rooms.includes('122'));
    previewMessage.textContent=pass?'✓ Acceptance test passed: CO534 • 9/18/2026 • 114 unique rooms • Detra Pleasant • Room 122. Nothing has been imported.':'Preview generated. Review the extracted values above; nothing has been imported.';
  }catch(err){previewPanel.hidden=false;previewMessage.className='preview-message error';previewMessage.textContent='Could not read this PDF: '+err.message}
  finally{previewPdf.disabled=false;previewPdf.textContent='Preview Report →'}
});

async function validateParsedImport(parsed){
  const [roomsRes,usersRes,propertiesRes]=await Promise.all([fetch('data/rooms.json',{cache:'no-store'}),fetch('data/users.json',{cache:'no-store'}),fetch('data/properties.json',{cache:'no-store'})]);
  const masterRooms=await roomsRes.json(),users=await usersRes.json(),properties=await propertiesRes.json();
  const roomSet=new Set(masterRooms.filter(r=>r.propertyId==='CO534'&&r.active).map(r=>r.roomNumber));
  const parsedNums=parsed.rooms.map(r=>r.room), unknownRooms=[...new Set(parsedNums.filter(r=>!roomSet.has(r)))];
  const duplicateRows=parsedNums.filter((r,i,a)=>a.indexOf(r)!==i);
  const assigned=parsed.assignments.flatMap(a=>a.rooms.map(room=>({room,name:a.name})));
  const duplicateAssignments=[...new Set(assigned.filter((x,i,a)=>a.findIndex(y=>y.room===x.room)!==i).map(x=>x.room))];
  // Choice-assigned names may precede user provisioning; validation flags them rather than silently matching.
  const activeNames=new Set(users.filter(u=>u.active).map(u=>u.name.toLowerCase()));
  const unknownEmployees=parsed.assignments.map(a=>a.name).filter(n=>!activeNames.has(n.toLowerCase()));
  const propertyExists=properties.some(p=>p.active&&p.propertyId===parsed.property);
  const dateValid=/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parsed.date);
  return [
    {label:'Property',ok:propertyExists,detail:propertyExists?parsed.property+' matched':'Unknown property: '+(parsed.property||'none')},
    {label:'Business Date',ok:dateValid,detail:dateValid?parsed.date:'Missing or invalid date'},
    {label:'Room Master',ok:unknownRooms.length===0,detail:unknownRooms.length?('Unknown rooms: '+unknownRooms.join(', ')):parsed.rooms.length+' extracted rooms matched'},
    {label:'Duplicate Room Rows',ok:duplicateRows.length===0,detail:duplicateRows.length?('Duplicates: '+[...new Set(duplicateRows)].join(', ')):'No duplicate extracted rooms'},
    {label:'Duplicate Assignments',ok:duplicateAssignments.length===0,detail:duplicateAssignments.length?('Assigned twice: '+duplicateAssignments.join(', ')):'No room assigned twice'},
    {label:'Housekeepers',ok:unknownEmployees.length===0,detail:unknownEmployees.length?('Not yet in active users: '+unknownEmployees.join(', ')):parsed.assignments.length+' housekeeper'+(parsed.assignments.length===1?'':'s')+' matched'}
  ];
}
validateImport.addEventListener('click',async()=>{
  if(!lastParsed)return;
  validateImport.disabled=true; validateImport.textContent='Validating…';
  try{
    const checks=await validateParsedImport(lastParsed),passed=checks.every(c=>c.ok);
    validationPanel.hidden=false;
    validationChecks.innerHTML=checks.map(c=>'<div class="validation-check '+(c.ok?'pass':'fail')+'"><strong>'+(c.ok?'✓ ':'⚠ ')+c.label+'</strong><small>'+c.detail+'</small></div>').join('');
    validationState.textContent=passed?'VALIDATION PASSED':'REVIEW REQUIRED'; validationState.className=passed?'pass':'review';
    validationSummary.className='validation-summary '+(passed?'pass':'fail');
    validationSummary.textContent=passed?'✓ All safety checks passed. Ready to compare with today’s Rimrock Rooms activity.':'Review required. Sync remains disabled until every validation issue is resolved.';
    if(passed){await compareWithToday(lastParsed)} else {comparePanel.hidden=true}
    importDaily.disabled=!passed;
  }catch(err){validationPanel.hidden=false;validationSummary.className='validation-summary fail';validationSummary.textContent='Validation could not run: '+err.message;importDaily.disabled=true}
  finally{validateImport.disabled=false;validateImport.textContent='Continue to Validate →'}
});
async function apiPost(payload){
  const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow'});
  if(!r.ok) throw new Error('API request failed ('+r.status+')');
  return await r.json();
}
async function loadTodayState(){
  if(!lastParsed?.date) return {assignments:[],rooms:{},cleaningSessions:[]};
  try{
    const data=await apiPost({action:'getToday',businessDate:lastParsed.date});
    return data.ok?data:{assignments:[],rooms:{},cleaningSessions:[]};
  }catch(e){throw new Error('Could not read today’s shared Rimrock Rooms state: '+e.message)}
}
async function compareWithToday(parsed){
  const state=await loadTodayState(),current=new Map((state.assignments||[]).map(a=>[a.room,a.housekeeper])),incoming=new Map();
  parsed.assignments.forEach(a=>a.rooms.forEach(room=>incoming.set(room,a.name)));
  const started=new Map((state.cleaningSessions||[]).filter(s=>s.status==='CLEANING'||s.status==='READY_FOR_INSPECTION'||s.status==='COMPLETE').map(s=>[s.room,s]));
  let unchanged=0,added=0,changed=0,conflicts=0; const details=[];
  incoming.forEach((name,room)=>{
    const old=current.get(room),session=started.get(room);
    if(!old){added++;details.push({kind:'new',text:'Room '+room+' → '+name+' (new Choice assignment)'})}
    else if(old===name){unchanged++}
    else if(session){conflicts++;details.push({kind:'conflict',text:'Room '+room+': Choice now '+name+'; Rimrock Rooms has '+session.housekeeper+' '+session.status.replaceAll('_',' ').toLowerCase()+'. Review required.'})}
    else{changed++;details.push({kind:'changed',text:'Room '+room+': '+old+' → '+name+' (safe reassignment; not started)'})}
  });
  current.forEach((name,room)=>{if(!incoming.has(room)){const session=started.get(room); if(session){conflicts++;details.push({kind:'conflict',text:'Room '+room+': no longer assigned in Choice, but '+session.housekeeper+' has operational activity. Review required.'})}else{changed++;details.push({kind:'changed',text:'Room '+room+': assignment removed by Choice (safe; not started)'})}}});
  comparePanel.hidden=false;
  compareSummary.innerHTML=[['Unchanged',unchanged],['New',added],['Changed',changed],['Conflicts',conflicts]].map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join('');
  compareDetails.innerHTML=details.length?details.map(d=>'<article class="'+d.kind+'">'+d.text+'</article>').join(''):'<p>No assignment differences from today’s Rimrock Rooms state.</p>';
  if(conflicts){validationState.textContent='REVIEW REQUIRED';validationState.className='review';validationSummary.className='validation-summary fail';validationSummary.textContent='Choice comparison found '+conflicts+' operational conflict'+(conflicts===1?'':'s')+'. Sync is blocked until reviewed.';importDaily.disabled=true}else{importDaily.disabled=false}
}
importDaily.addEventListener('click',async()=>{
  if(!lastParsed||importDaily.disabled)return;
  const original=importDaily.textContent; importDaily.disabled=true; importDaily.textContent='Syncing…';
  try{
    const state=await loadTodayState(),current=new Map((state.assignments||[]).map(a=>[String(a.room),a.housekeeper]));
    let unchanged=0,newCount=0,changed=0;
    const incoming=new Map(); lastParsed.assignments.forEach(a=>a.rooms.forEach(room=>incoming.set(String(room),a.name)));
    incoming.forEach((name,room)=>{if(!current.has(room))newCount++;else if(current.get(room)===name)unchanged++;else changed++});
    current.forEach((name,room)=>{if(!incoming.has(room))changed++});
    const result=await apiPost({
      action:'syncChoice',propertyId:lastParsed.property,businessDate:lastParsed.date,
      rooms:lastParsed.rooms,assignments:lastParsed.assignments,
      comparison:{unchanged,new:newCount,changed,conflicts:0},
      syncedBy:currentUser?.name||'Rimrock Rooms',sourceFilename:selectedPdf?.name||''
    });
    if(!result.ok){throw new Error(result.blocked?'Sync blocked by operational conflict.':(result.error||'Sync failed'))}
    validationSummary.className='validation-summary pass';
    validationSummary.textContent='✓ Choice Sync complete. '+result.rooms+' rooms and '+result.assignments+' active assignment'+(result.assignments===1?'':'s')+' recorded. Sync ID: '+result.syncId;
    await compareWithToday(lastParsed);
  }catch(err){
    validationSummary.className='validation-summary fail';validationSummary.textContent='Sync failed: '+err.message;
  }finally{importDaily.disabled=false;importDaily.textContent=original}
});
