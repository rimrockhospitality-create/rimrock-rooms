/*
 * Rimrock Rooms
 * Product concept and operating design: Ryan Kelly
 * Original project owner: Ryan Kelly
 * Everhome Suites Denver Airport (CO534)
 * September 2026
 */
const API_URL='https://script.google.com/macros/s/AKfycby4lxHCqEsiURHZzUv93rDs5rv1Vkdv_yuyanbLVg3aU6PrBf4yhlpZogiGct0zSRmB7w/exec';
const QR_TEST_ROOM='122';
const QR_TEST_ID='CO534-RM-122';
const ROLE_VIEWS={
  HOUSEKEEPER:['Home','Housekeeping'],
  INSPECTOR:['Home','Inspections'],
  MAINTENANCE:['Home','Maintenance','Preventive Maintenance'],
  'FRONT DESK':['Home','Housekeeping','Maintenance'],
  MANAGER:['Home','Housekeeping','Inspections','Maintenance','Preventive Maintenance','Reports','Property Settings','Users','Settings']
};
const ROLE_LABELS={HOUSEKEEPER:'Housekeeper',INSPECTOR:'Inspector',MAINTENANCE:'Maintenance','FRONT DESK':'Front Desk',MANAGER:'Manager'};
let currentUser=null;
const home=document.getElementById('homeView'),housekeepingView=document.getElementById('housekeepingView'),inspectionView=document.getElementById('inspectionView'),maintenanceView=document.getElementById('maintenanceView'),importView=document.getElementById('importView'),placeholder=document.getElementById('placeholder'),title=document.getElementById('placeholderTitle'),drawer=document.getElementById('drawer'),drawerLinks=document.getElementById('drawerLinks');
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
  home.hidden=view!=='Home';
  housekeepingView.hidden=view!=='Housekeeping';
  inspectionView.hidden=view!=='Inspections';
  maintenanceView.hidden=view!=='Maintenance';
  importView.hidden=true;
  placeholder.hidden=(view==='Home'||view==='Housekeeping'||view==='Inspections'||view==='Maintenance');
  if(!placeholder.hidden) title.textContent=view;
  if(view==='Housekeeping') loadHousekeepingBoard();
  if(view==='Inspections') loadInspectionQueue();
  if(view==='Maintenance') loadMaintenanceBoard();
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
    if(passed){await compareWithToday(lastParsed)} else {comparePanel.hidden=true; importDaily.disabled=true}
  }catch(err){validationPanel.hidden=false;validationSummary.className='validation-summary fail';validationSummary.textContent='Validation could not run: '+err.message;importDaily.disabled=true}
  finally{validateImport.disabled=false;validateImport.textContent='Continue to Validate →'}
});
async function apiPost(payload,timeoutMs=20000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow',signal:controller.signal});
    if(!r.ok) throw new Error('API request failed ('+r.status+')');
    return await r.json();
  }catch(err){
    if(err.name==='AbortError') throw new Error('The shared database request timed out. The write may still have completed; refresh and Validate before retrying.');
    throw err;
  }finally{clearTimeout(timer)}
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

/* Section 3 — live My Board — Ryan Kelly */
const hkGreeting=document.getElementById('hkGreeting'),hkBoardDate=document.getElementById('hkBoardDate'),hkBoardStatus=document.getElementById('hkBoardStatus'),hkMyRooms=document.getElementById('hkMyRooms'),hkManagerGroups=document.getElementById('hkManagerGroups'),managerImportBtn=document.getElementById('managerImportBtn'),emptyChoiceSyncBtn=document.getElementById('emptyChoiceSyncBtn'),qrStartPanel=document.getElementById('qrStartPanel'),qrStartRoom=document.getElementById('qrStartRoom'),qrStartMessage=document.getElementById('qrStartMessage');
function openChoiceSync(){housekeepingView.hidden=true;importView.hidden=false} managerImportBtn.addEventListener('click',openChoiceSync);emptyChoiceSyncBtn.addEventListener('click',openChoiceSync);
function housekeepingBusinessDate(){return new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver'}).format(new Date())}
async function loadHousekeepingBoard(){
  if(!currentUser)return;
  hkGreeting.textContent='Good morning, '+currentUser.name.split(' ')[0];
  hkBoardDate.textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'America/Denver'}).format(new Date());
  hkBoardStatus.className='hk-board-status';hkBoardStatus.textContent='Loading today’s assignments…';hkMyRooms.innerHTML='';
  const isManager=currentUser.roles.includes('MANAGER');
  managerImportBtn.hidden=!isManager;emptyChoiceSyncBtn.hidden=true;hkManagerGroups.hidden=!isManager;
  try{
    const date=housekeepingBusinessDate(),state=await apiPost({action:'getToday',businessDate:date});
    if(!state.ok)throw new Error(state.error||'Could not load board');
    const assignments=state.assignments||[],sessions=state.cleaningSessions||[],inspectionIssues=state.inspectionIssues||[];
    if(!('inspectionIssues' in state)){throw new Error('Rework data is not being returned by the live API. Confirm the newest Apps Script deployment is active.')}
    console.log('Rimrock rework payload',inspectionIssues);
    const sessionByRoom=new Map(sessions.map(s=>[String(s.room),s]));
    const reworkByRoom=new Map();
    inspectionIssues.filter(i=>['REWORK_REQUIRED','REWORK_IN_PROGRESS'].includes(i.status)&&(isManager||i.housekeeper===currentUser.name)).forEach(i=>{const k=String(i.room);if(!reworkByRoom.has(k))reworkByRoom.set(k,[]);reworkByRoom.get(k).push(i)});
    const visible=isManager?assignments:assignments.filter(a=>a.housekeeper===currentUser.name);
    const cleaning=visible.filter(a=>sessionByRoom.get(String(a.room))?.status==='CLEANING').length;
    const ready=visible.filter(a=>sessionByRoom.get(String(a.room))?.status==='READY_FOR_INSPECTION').length;
    document.getElementById('hkAssignedCount').textContent=visible.length;
    document.getElementById('hkCleaningCount').textContent=cleaning;
    document.getElementById('hkReadyCount').textContent=ready;
    document.getElementById('hkNotStartedCount').textContent=visible.length-cleaning-ready;
    if(visible.length){hkBoardStatus.textContent=isManager?'Live property housekeeping board':'Your Choice assignments are current.'}else if(isManager){hkBoardStatus.innerHTML='<strong>Today’s housekeeping board has not been loaded.</strong><br>No active Choice assignments found for '+date+'.';emptyChoiceSyncBtn.hidden=false}else{hkBoardStatus.textContent='No rooms are assigned for '+date+'.'}
    if(isManager){
      const groups={};assignments.forEach(a=>(groups[a.housekeeper]??=[]).push(a.room));
      hkManagerGroups.innerHTML=Object.keys(groups).length?Object.entries(groups).map(([name,rooms])=>'<article><strong>'+name+'</strong><span>'+rooms.length+' room'+(rooms.length===1?'':'s')+': '+rooms.join(', ')+'</span></article>').join(''):'';
    }
    hkMyRooms.innerHTML=visible.map(a=>{
      const room=String(a.room),s=sessionByRoom.get(room),rework=reworkByRoom.get(room)||[],activeRework=rework.find(i=>i.status==='REWORK_IN_PROGRESS'),status=activeRework?'REWORK_IN_PROGRESS':rework.length?'REWORK_REQUIRED':(s?.status||'NOT_STARTED');
      const label=status==='REWORK_IN_PROGRESS'?'REWORK IN PROGRESS':status==='REWORK_REQUIRED'?'REWORK REQUIRED':status==='READY_FOR_INSPECTION'?'READY FOR INSPECTION':status==='CLEANING'?'CLEANING':'NOT STARTED';
      const action=status==='REWORK_IN_PROGRESS'?'REWORK COMPLETE':status==='REWORK_REQUIRED'?'START REWORK':status==='CLEANING'?'Room in progress':status==='READY_FOR_INSPECTION'?'Awaiting inspection':'START ROOM';
      const started=s?.started_at||'';const reworkHtml=rework.length?'<div class="hk-rework-list">'+rework.map(i=>'<div class="hk-rework-item"><strong>'+i.deficiency_label+'</strong>'+(i.note?'<span>'+i.note+'</span>':'')+'<button type="button" class="view-rework-photo" data-photo="'+i.photo_ref+'">View inspector photo</button></div>').join('')+'</div>':'';const issueId=(activeRework||rework[0])?.issue_id||'';const button=status==='REWORK_IN_PROGRESS'&&!isManager?'<button type="button" class="complete-rework-btn" data-room="'+room+'" data-issue="'+issueId+'">REWORK COMPLETE</button>':status==='REWORK_REQUIRED'&&!isManager?'<button type="button" class="rework-room-btn" data-room="'+room+'" data-issue="'+issueId+'">START REWORK</button>':status==='CLEANING'&&!isManager?'<button type="button" class="ready-room-btn" data-room="'+room+'">READY FOR INSPECTION</button>':'<button type="button" class="start-room-btn" data-room="'+room+'" '+(status==='NOT_STARTED'&&!isManager?'':'disabled')+'>'+action+'</button>';return '<article class="hk-room-card"><div class="hk-room-top"><span class="hk-room-number">ROOM '+room+'</span><span class="hk-room-pill">'+label+'</span></div><div class="hk-room-meta">Choice assignment • '+a.housekeeper+(status==='CLEANING'?'<br>Started '+started+'<br><strong class="elapsed-timer" data-start="'+started+'">Elapsed --:--</strong>':'')+'</div>'+reworkHtml+button+'</article>'
    }).join('');
  }catch(err){hkBoardStatus.className='hk-board-status error';hkBoardStatus.textContent='Could not load housekeeping board: '+err.message}
}

let pendingStartRoom=null;
hkMyRooms.addEventListener('click',e=>{const b=e.target.closest('.start-room-btn');if(!b||b.disabled)return;pendingStartRoom=b.dataset.room;qrStartRoom.textContent='Room '+pendingStartRoom;qrStartMessage.textContent='Scan the hidden QR code inside Room '+pendingStartRoom+' to begin cleaning.';qrStartPanel.hidden=false});
document.getElementById('closeQrStart').addEventListener('click',()=>{qrStartPanel.hidden=true;pendingStartRoom=null});
async function startQrCamera(){
  if(!pendingStartRoom)return;
  qrStartMessage.textContent='Opening camera for Room '+pendingStartRoom+'…';
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const box=document.querySelector('.qr-code-placeholder'),video=document.createElement('video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    video.setAttribute('playsinline','');video.muted=true;video.autoplay=true;video.srcObject=stream;box.innerHTML='';box.appendChild(video);video.style.width='100%';video.style.height='100%';video.style.objectFit='cover';video.style.borderRadius='12px';
    await video.play();qrStartMessage.textContent='Point the camera at the Room '+pendingStartRoom+' QR code.';
    const detector=('BarcodeDetector' in window)?new BarcodeDetector({formats:['qr_code']}):null;
    const stop=()=>stream&&stream.getTracks().forEach(t=>t.stop());
    const scan=async()=>{
      if(qrStartPanel.hidden){stop();return}
      let raw='';
      try{
        if(detector){const codes=await detector.detect(video);raw=codes[0]?.rawValue||''}
        else if(window.jsQR&&video.readyState>=2){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);const img=ctx.getImageData(0,0,canvas.width,canvas.height);raw=jsQR(img.data,img.width,img.height)?.data||''}
      }catch(e){}
      if(raw){
        stop();
        const expected='CO534-RM-'+pendingStartRoom;
        if(raw!==expected){qrStartMessage.textContent='Wrong room QR. Expected Room '+pendingStartRoom+'.';box.innerHTML='▦';return}
        qrStartMessage.textContent='✓ Room '+pendingStartRoom+' verified. Starting cleaning session…';box.innerHTML='✓';document.getElementById('confirmQrStart').textContent='STARTING…';document.getElementById('confirmQrStart').disabled=true;
        try{
          const startResult=await apiPost({action:'startRoom',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:pendingStartRoom,housekeeper:currentUser.name,qrId:raw});
          if(!startResult.ok)throw new Error(startResult.reason||startResult.error||'Start Room blocked');
          qrStartMessage.textContent='✓ Room '+pendingStartRoom+' started. Status: CLEANING';
          document.getElementById('confirmQrStart').textContent='ROOM STARTED';
          setTimeout(async()=>{qrStartPanel.hidden=true;pendingStartRoom=null;document.getElementById('confirmQrStart').disabled=false;document.getElementById('confirmQrStart').textContent='OPEN CAMERA & SCAN QR';box.innerHTML='▦';await loadHousekeepingBoard()},900);
        }catch(err){qrStartMessage.textContent='Could not start room: '+err.message;document.getElementById('confirmQrStart').textContent='TRY AGAIN';document.getElementById('confirmQrStart').disabled=false}
        return
      }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  }catch(err){if(stream)stream.getTracks().forEach(t=>t.stop());qrStartMessage.textContent='Camera error: '+(err?.name||'UnknownError')+' — '+(err?.message||String(err))}
}
document.getElementById('confirmQrStart').addEventListener('click',startQrCamera);


function parseCleaningStart(v){if(!v)return null;const p=String(v).split(/[/ :]/).map(Number);if(p.length<5)return null;return new Date(p[2],p[0]-1,p[1],p[3],p[4],p[5]||0)}
function refreshCleaningTimers(){document.querySelectorAll('.elapsed-timer').forEach(el=>{const d=parseCleaningStart(el.dataset.start);if(!d)return;const n=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;el.textContent='Elapsed '+(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')})}
setInterval(refreshCleaningTimers,1000);

hkMyRooms.addEventListener('click',async function(e){
  const b=e.target.closest('.ready-room-btn'); if(!b)return;
  const room=b.dataset.room,old=b.textContent; b.disabled=true;b.textContent='UPDATING…';
  try{
    const r=await apiPost({action:'readyRoom',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:room,housekeeper:currentUser.name});
    if(!r.ok)throw new Error(r.reason||r.error||'Update blocked');
    await loadHousekeepingBoard();
  }catch(err){b.disabled=false;b.textContent=old;console.error(err)}
});

async function loadInspectionQueue(){
  const status=document.getElementById('inspectionStatus'),queue=document.getElementById('inspectionQueue'),count=document.getElementById('inspectionWaiting');
  status.textContent='Loading inspection queue…';queue.innerHTML='';
  try{
    const state=await apiPost({action:'getToday',businessDate:housekeepingBusinessDate()});
    if(!state.ok)throw new Error(state.error||'Could not load inspections');
    const rechecks=(state.inspectionIssues||[]).filter(i=>i.status==='REWORK_COMPLETE'),rq=document.getElementById('reinspectionQueue');
    rq.innerHTML=rechecks.map(i=>'<article class="reinspection-card"><div class="recheck-title">ROOM '+i.room+' — REINSPECTION REQUIRED</div><div>Returned by <strong>'+i.housekeeper+'</strong></div><div class="recheck-item"><strong>'+i.deficiency_label+'</strong>'+(i.note?'<br>'+i.note:'')+'<br><button type="button" class="view-rework-photo" data-photo="'+i.photo_ref+'">View original inspector photo</button></div><div class="recheck-actions"><button type="button" class="recheck-pass" data-issue="'+i.issue_id+'">✓ REWORK PASSED</button><button type="button" class="recheck-fail" data-issue="'+i.issue_id+'">↩ STILL NEEDS WORK</button></div></article>').join('');
    window._inspectionMaintenance=state.maintenance||[];
    const ready=(state.cleaningSessions||[]).filter(s=>s.status==='READY_FOR_INSPECTION'&&!rechecks.some(i=>String(i.room)===String(s.room)));
    count.textContent=ready.length+rechecks.length;
    status.textContent=(ready.length+rechecks.length)?(ready.length+rechecks.length)+' room'+((ready.length+rechecks.length)===1?' is':'s are')+' waiting for inspection.':'No rooms are waiting for inspection.';
    queue.innerHTML=ready.map(s=>'<article class="inspection-card"><div class="room">ROOM '+s.room+'</div><div class="who">Housekeeper: '+s.housekeeper+'<br>Cleaning complete • Ready '+(s.ready_at||'')+'</div><button type="button" class="start-inspection-btn" data-room="'+s.room+'" data-housekeeper="'+s.housekeeper+'">START INSPECTION</button></article>').join('');
  }catch(err){status.className='hk-board-status error';status.textContent='Could not load inspection queue: '+err.message}
}

const inspectionQueueEl=document.getElementById('inspectionQueue'),inspectionDetail=document.getElementById('inspectionDetail');
let activeInspectionRoom='',activeInspectionHousekeeper='';
inspectionQueueEl.addEventListener('click',e=>{const b=e.target.closest('.start-inspection-btn');if(!b)return;const card=b.closest('.inspection-card');activeInspectionRoom=b.dataset.room||'';activeInspectionHousekeeper=b.dataset.housekeeper||'';document.getElementById('inspectionRoomTitle').textContent='Room '+activeInspectionRoom;document.getElementById('inspectionHousekeeper').textContent='Housekeeper: '+activeInspectionHousekeeper;inspectionQueueEl.hidden=true;document.getElementById('inspectionStatus').hidden=true;inspectionDetail.hidden=false;inspectionDetail.querySelectorAll('input[type=checkbox]').forEach(x=>x.checked=false);const ms=document.getElementById('inspectionMaintenanceSummary'),mi=(window._inspectionMaintenance||[]).filter(m=>String(m.room)===String(activeInspectionRoom)&&m.status==='OPEN');ms.hidden=!mi.length;ms.innerHTML=mi.length?'<strong>Maintenance Issues</strong>'+mi.map(m=>'<div class="maint-summary-item '+(String(m.blocking).toUpperCase()==='TRUE'?'blocking':'routine')+'">'+(String(m.blocking).toUpperCase()==='TRUE'?'🔴 BLOCKING — ':'⚪ NON-BLOCKING — ')+(m.description||'Maintenance issue')+'</div>').join(''):''});
document.getElementById('inspectionBack').addEventListener('click',()=>{inspectionDetail.hidden=true;inspectionQueueEl.hidden=false;document.getElementById('inspectionStatus').hidden=false});

let inspectionCaptureType=null,inspectionBlocking=null;
let inspectionCounts={hk:0,maint:0,blocking:0,highlight:0};
function renderInspectionCounts(){const el=document.getElementById('inspectionIssueSummary');if(!el)return;const total=inspectionCounts.hk+inspectionCounts.maint;el.innerHTML='<strong>Issues captured: '+total+'</strong><span>📸 HK: '+inspectionCounts.hk+' &nbsp; • &nbsp; 🔧 Maintenance: '+inspectionCounts.maint+' &nbsp; • &nbsp; ⛔ Blocking: '+inspectionCounts.blocking+' &nbsp; • &nbsp; ✨ Highlights: '+inspectionCounts.highlight+'</span>'}
function resetInspectionCapture(){inspectionCaptureType=null;inspectionBlocking=null;document.getElementById('inspectionPhoto').value='';document.getElementById('inspectionNote').value='';document.getElementById('inspectionCapture').hidden=true;const b=document.getElementById('saveInspectionCapture');b.disabled=true;b.textContent='SAVE'};
function openInspectionCapture(type){
  inspectionCaptureType=type;inspectionBlocking=null;
  const panel=document.getElementById('inspectionCapture'),title=document.getElementById('captureTitle'),label=document.getElementById('captureTypeLabel'),maint=document.getElementById('maintenanceBlocking'),note=document.getElementById('captureNoteWrap'),route=document.getElementById('captureRoutingNote');
  document.getElementById('inspectionPhoto').value='';document.getElementById('inspectionNote').value='';document.getElementById('saveInspectionCapture').disabled=true;maint.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
  if(type==='HK_ISSUE'){label.textContent='HK_ISSUE';title.textContent='Housekeeping Issue';maint.hidden=true;note.hidden=false;route.textContent='Routes to housekeeper rework + weekly housekeeping reporting.'}
  if(type==='MAINT_ISSUE'){label.textContent='MAINT_ISSUE';title.textContent='Maintenance Issue';maint.hidden=false;note.hidden=false;route.textContent='Routes to Maintenance. Blocking choice determines whether the room can become Ready.'}
  if(type==='ROOM_HIGHLIGHT'){label.textContent='ROOM_HIGHLIGHT';title.textContent='Room Photo';maint.hidden=true;note.hidden=true;route.textContent='Positive finished-room photo. Routes to Inspection Report highlights only.'}
  panel.hidden=false;
}
document.querySelector('.maintenance-inspection-btn').addEventListener('click',()=>openInspectionCapture('MAINT_ISSUE'));
document.querySelector('.photo-room-btn').addEventListener('click',()=>openInspectionCapture('ROOM_HIGHLIGHT'));
document.getElementById('closeInspectionCapture').addEventListener('click',resetInspectionCapture);
document.getElementById('inspectionPhoto').addEventListener('change',()=>{document.getElementById('saveInspectionCapture').disabled=!(document.getElementById('inspectionPhoto').files.length&&(inspectionCaptureType!=='MAINT_ISSUE'||inspectionBlocking!==null))});
document.getElementById('maintenanceBlocking').addEventListener('click',e=>{const b=e.target.closest('[data-blocking]');if(!b)return;inspectionBlocking=b.dataset.blocking==='true';e.currentTarget.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));document.getElementById('saveInspectionCapture').disabled=!document.getElementById('inspectionPhoto').files.length});

function deficiencyEvidence(q){
  let d=q.querySelector('.deficiency-evidence');if(d)return d;
  d=document.createElement('div');d.className='deficiency-evidence';
  d.innerHTML='<label>📸 Housekeeping issue photo<input type="file" accept="image/*" capture="environment"></label><label>Optional note<textarea rows="2" placeholder="Add detail if helpful"></textarea></label><div class="deficiency-resolution"><button type="button" data-resolution="FIXED_BY_INSPECTOR">✓ I FIXED IT</button><button type="button" data-resolution="REWORK_REQUIRED">↩ HK NEEDS TO FIX</button></div>';
  q.appendChild(d);return d;
}
document.querySelector('.inspection-question-list').addEventListener('click',e=>{
  const b=e.target.closest('[data-answer]');if(!b)return;
  const q=b.closest('.inspect-q'),answer=b.dataset.answer;
  q.dataset.answer=answer;q.querySelectorAll('.yn button').forEach(x=>x.classList.remove('yes','no'));b.classList.add(answer.toLowerCase());
  if(answer==='NO'){
    if(q.classList.contains('no-photo')){const d=q.querySelector('.fail-detail');if(d)d.hidden=false}
    else deficiencyEvidence(q);
  }else{
    const d=q.querySelector('.fail-detail');if(d)d.hidden=true;const ev=q.querySelector('.deficiency-evidence');if(ev)ev.remove();
  }
});
document.getElementById('allInspectionPass').addEventListener('click',()=>{
  document.querySelectorAll('.inspect-q').forEach(q=>{q.dataset.answer='YES';q.querySelectorAll('.yn button').forEach(x=>x.classList.toggle('yes',x.dataset.answer==='YES'));const d=q.querySelector('.fail-detail');if(d)d.hidden=true;const ev=q.querySelector('.deficiency-evidence');if(ev)ev.remove()});
});

function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
document.querySelector('.inspection-question-list').addEventListener('change',async e=>{
  const input=e.target.closest('.deficiency-evidence input[type=file]');if(!input||!input.files?.length)return;
  const q=input.closest('.inspect-q');if(q.dataset.answer!=='NO')return;
  if(q.dataset.issueId){alert('A deficiency photo is already saved for this item. Use the existing issue or change the answer back to YES before creating a new one.');input.value='';return;}
  const note=q.querySelector('.deficiency-evidence textarea')?.value||'';
  const file=input.files[0],dataUrl=await fileToDataUrl(file);
  input.disabled=true;
  try{
    const result=await apiPost({
      action:'saveInspectionIssue',propertyId:'CO534',businessDate:housekeepingBusinessDate(),
      room:activeInspectionRoom,housekeeper:activeInspectionHousekeeper,inspector:currentUser.name,
      deficiencyKey:q.dataset.key,deficiencyLabel:q.querySelector('strong').textContent.replace(/\?$/,''),
      note:note,photoBase64:dataUrl,photoMimeType:file.type||'image/jpeg'
    },30000);
    if(!result.ok)throw new Error(result.reason||result.error||'Issue save failed');
    q.dataset.issueId=result.issueId;inspectionCounts.hk++;renderInspectionCounts();
    const label=input.closest('label');label.firstChild.textContent='✓ Photo saved to Rimrock Drive ';
  }catch(err){input.disabled=false;alert('Could not save deficiency photo: '+err.message)}
});
document.querySelector('.inspection-question-list').addEventListener('click',e=>{
  const cam=e.target.closest('.question-camera');if(!cam)return;
  const q=cam.closest('.inspect-q'),no=q.querySelector('[data-answer="NO"]');if(no&&!no.classList.contains('no'))no.click();
  setTimeout(()=>q.querySelector('.deficiency-evidence input[type=file]')?.click(),0);
});

document.getElementById('saveInspectionCapture').addEventListener('click',async()=>{
  const btn=document.getElementById('saveInspectionCapture'),file=document.getElementById('inspectionPhoto').files[0];
  if(!file){document.getElementById('captureRoutingNote').textContent='Take or choose a photo first.';return}
  btn.disabled=true;btn.textContent='SAVING…';
  try{
    const dataUrl=await fileToDataUrl(file);
    let result;
    if(inspectionCaptureType==='MAINT_ISSUE'){
      const note=document.getElementById('inspectionNote').value.trim();
      if(!note||inspectionBlocking===null)throw new Error('Photo, note, and blocking choice are required.');
      result=await apiPost({action:'saveMaintenanceIssue',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:activeInspectionRoom,housekeeper:activeInspectionHousekeeper,inspector:currentUser.name,description:note,blocking:inspectionBlocking,photoBase64:dataUrl,photoMimeType:file.type||'image/jpeg'},30000);
      if(!result.ok)throw new Error(result.reason||result.error||'Maintenance save failed');
      inspectionCounts.maint++;if(result.blocking)inspectionCounts.blocking++;renderInspectionCounts();document.getElementById('captureRoutingNote').textContent='✓ Maintenance issue saved • '+(result.blocking?'ROOM HOLD • P2':'NON-BLOCKING • P3');
    }else if(inspectionCaptureType==='ROOM_HIGHLIGHT'){
      result=await apiPost({action:'saveRoomPhoto',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:activeInspectionRoom,housekeeper:activeInspectionHousekeeper,capturedBy:currentUser.name,photoBase64:dataUrl,photoMimeType:file.type||'image/jpeg'},30000);
      if(!result.ok)throw new Error(result.reason||result.error||'Room photo save failed');
      inspectionCounts.highlight++;renderInspectionCounts();document.getElementById('captureRoutingNote').textContent='✓ Room highlight saved to Inspection Reports.';
    }else{throw new Error('Unknown photo type.')}
    btn.textContent='SAVED';
    setTimeout(()=>{resetInspectionCapture()},900);
  }catch(err){btn.disabled=false;btn.textContent='SAVE';document.getElementById('captureRoutingNote').textContent='Could not save: '+err.message}
});



document.querySelector('.inspection-question-list').addEventListener('click',async e=>{
  const b=e.target.closest('[data-resolution]');if(!b)return;
  const q=b.closest('.inspect-q'),issueId=q.dataset.issueId;
  if(!issueId){alert('Save the deficiency photo first.');return}
  const resolution=b.dataset.resolution,old=b.textContent;
  q.querySelectorAll('[data-resolution]').forEach(x=>x.disabled=true);b.textContent='SAVING…';
  try{
    const result=await apiPost({action:'resolveInspectionIssue',issueId:issueId,inspector:currentUser.name,resolution:resolution});
    if(!result.ok)throw new Error(result.reason||result.error||'Resolution save failed');
    q.dataset.resolution=result.resolution;
    q.querySelectorAll('[data-resolution]').forEach(x=>{x.classList.toggle('selected',x===b);x.disabled=false});
    b.textContent=result.resolution==='FIXED_BY_INSPECTOR'?'✓ FIXED BY ME':'↩ REWORK REQUIRED';
  }catch(err){q.querySelectorAll('[data-resolution]').forEach(x=>x.disabled=false);b.textContent=old;alert('Could not save resolution: '+err.message)}
});

document.addEventListener('click',async e=>{
  const start=e.target.closest('.rework-room-btn'),complete=e.target.closest('.complete-rework-btn');
  const b=start||complete;if(!b)return;
  e.preventDefault();e.stopPropagation();
  b.disabled=true;const old=b.textContent;b.textContent=start?'STARTING…':'SENDING…';
  try{
    const result=await apiPost({action:start?'startRework':'completeRework',issueId:b.dataset.issue,housekeeper:currentUser.name});
    if(!result.ok)throw new Error(result.reason||result.error||'Rework update failed');
    await loadHousekeepingBoard();
  }catch(err){b.disabled=false;b.textContent=old;alert('Could not update rework: '+err.message)}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('.view-rework-photo');if(!b)return;
  e.preventDefault();
  try{
    const result=await apiPost({action:'getInspectionPhoto',photoRef:b.dataset.photo});
    if(!result.ok)throw new Error(result.reason||result.error||'Photo unavailable');
    const w=window.open();w.document.write('<meta name="viewport" content="width=device-width"><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh"><img src="'+result.dataUrl+'" style="max-width:100%;max-height:100vh"></body>');
  }catch(err){alert('Could not open inspector photo: '+err.message)}
});

document.addEventListener('click',async e=>{
  const pass=e.target.closest('.recheck-pass'),fail=e.target.closest('.recheck-fail'),b=pass||fail;if(!b)return;
  b.disabled=true;const old=b.textContent;b.textContent='SAVING…';
  try{
    const result=await apiPost({action:'resolveReinspection',issueId:b.dataset.issue,inspector:currentUser.name,passed:!!pass});
    if(!result.ok)throw new Error(result.reason||result.error||'Reinspection update failed');
    await loadInspectionQueue();
  }catch(err){b.disabled=false;b.textContent=old;alert('Could not update reinspection: '+err.message)}
});

document.querySelector('.pass-room-btn').addEventListener('click',async function(){
  const b=this,old=b.textContent;
  b.disabled=true;b.textContent='PASSING…';
  try{
    const result=await apiPost({action:'passInspection',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:activeInspectionRoom,inspector:currentUser.name});
    if(!result.ok){
      if(result.reason==='UNRESOLVED_HK_ISSUES'){
        const names=(result.issues||[]).map(i=>i.deficiencyLabel+' ('+i.status+')').join('\n');
        throw new Error('Housekeeping still has unresolved inspection items:\n'+names);
      }
      throw new Error(result.reason||result.error||'Pass blocked');
    }
    if(result.roomStatus==='HOLD_MAINTENANCE'){
      alert('✓ HOUSEKEEPING PASSED\n\n⛔ ROOM  '+activeInspectionRoom+' — HOLD FOR MAINTENANCE\n\nA blocking maintenance issue must be resolved before the room becomes Ready.');
    }else{
      alert('✓ HOUSEKEEPING PASSED\n\nROOM '+activeInspectionRoom+' — READY');
    }
    inspectionDetail.hidden=true;inspectionQueueEl.hidden=false;document.getElementById('inspectionStatus').hidden=false;await loadInspectionQueue();
  }catch(err){alert(err.message);b.disabled=false;b.textContent=old}
});

async function loadMaintenanceBoard(){
  const status=document.getElementById('maintenanceStatus'),queue=document.getElementById('maintenanceQueue');
  status.textContent='Loading maintenance…';queue.innerHTML='';
  try{
    const state=await apiPost({action:'getToday',businessDate:housekeepingBusinessDate()});
    const items=state.maintenanceIssues||[];
    const p2=items.filter(x=>x.status==='OPEN'&&x.priority==='P2_ROOM_BLOCKING'),p3=items.filter(x=>x.status==='OPEN'&&x.priority==='P3_ROUTINE');
    document.getElementById('maintP2').textContent=p2.length;document.getElementById('maintP3').textContent=p3.length;
    const ordered=[...p2,...p3];status.textContent=ordered.length?ordered.length+' open maintenance item'+(ordered.length===1?'':'s')+'.':'No open maintenance items.';
    queue.innerHTML=ordered.map(x=>'<article class="maint-card '+(x.priority==='P2_ROOM_BLOCKING'?'p2':'p3')+'"><div class="maint-top"><div class="maint-room">ROOM '+x.room+'</div><div class="maint-priority">'+(x.priority==='P2_ROOM_BLOCKING'?'⛔ P2 — ROOM BLOCKING':'🔧 P3 — ROUTINE')+'</div></div><p>'+x.description+'</p><div class="maint-meta">Reported by '+x.reported_by+' • '+x.reported_at+'</div><div class="maint-actions"><button class="maint-photo" data-photo="'+x.photo_ref+'">VIEW PHOTO</button><button class="maint-resolve" data-id="'+x.maintenance_id+'">✓ MARK RESOLVED</button></div></article>').join('');
  }catch(err){status.className='hk-board-status error';status.textContent='Could not load maintenance: '+err.message}
}
document.getElementById('maintenanceQueue').addEventListener('click',async e=>{
 const p=e.target.closest('.maint-photo');if(p){window.open('https://drive.google.com/open?id='+p.dataset.photo,'_blank');return}
 const b=e.target.closest('.maint-resolve');if(!b)return;
 const old=b.textContent;b.disabled=true;b.textContent='RESOLVING…';
 try{const r=await apiPost({action:'resolveMaintenanceIssue',maintenanceId:b.dataset.id,resolvedBy:currentUser.name});if(!r.ok)throw new Error(r.reason||r.error||'Resolve failed');await loadMaintenanceBoard()}catch(err){b.disabled=false;b.textContent=old;alert('Could not resolve maintenance: '+err.message)}
});
