/*
 * RELAY
 * Product concept and operating design: Ryan Kelly
 * Original project owner: Ryan Kelly
 * Everhome Suites Denver Airport (CO534)
 * September 2026
 */
const API_URL='https://script.google.com/macros/s/AKfycby4lxHCqEsiURHZzUv93rDs5rv1Vkdv_yuyanbLVg3aU6PrBf4yhlpZogiGct0zSRmB7w/exec';
const QR_TEST_ROOM='122';
const QR_TEST_ID='CO534-RM-122';
const ROLE_VIEWS={
  ADMIN:['Home','Checklists','Housekeeping','Inspections','Maintenance','Preventive Maintenance','Reports','Property Settings','Users','Settings'],
  INSPECTOR:['Home','Checklists','Housekeeping','Inspections','Maintenance','Preventive Maintenance','Reports'],
  'FRONT DESK':['Home','Checklists','Housekeeping','Maintenance'],
  HOUSEKEEPER:['Housekeeping'],
  MAINTENANCE:['Maintenance','Preventive Maintenance','Checklists']
};
const ROLE_LABELS={ADMIN:'Admin',INSPECTOR:'Inspector',MAINTENANCE:'Maintenance','FRONT DESK':'Front Desk',HOUSEKEEPER:'Housekeeper'};
let currentUser=null;
const home=document.getElementById('homeView'),reportsView=document.getElementById('reportsView'),housekeepingView=document.getElementById('housekeepingView'),inspectionView=document.getElementById('inspectionView'),maintenanceView=document.getElementById('maintenanceView'),checklistsView=document.getElementById('checklistsView'),importView=document.getElementById('importView'),placeholder=document.getElementById('placeholder'),title=document.getElementById('placeholderTitle'),drawer=document.getElementById('drawer'),drawerLinks=document.getElementById('drawerLinks');
const todayEl=document.getElementById('today');if(todayEl)todayEl.textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date());

let loginProperties=[],relayBusinessDate='',relayBusinessDayLoadedAt=0;
let relayViewCache=new Map();
const RELAY_VIEW_CACHE_MS=15000;
function relayCached_(key){const x=relayViewCache.get(key);return x&&Date.now()-x.at<RELAY_VIEW_CACHE_MS?x.value:null}
function relayCacheSet_(key,value){relayViewCache.set(key,{at:Date.now(),value});return value}
function relayCacheClear_(prefix=''){for(const k of [...relayViewCache.keys()])if(!prefix||k.startsWith(prefix))relayViewCache.delete(k)}
const RELAY_READ_ACTIONS=new Set(['authLogin','authLogout','authSession','getAssignableHousekeepers','getBusinessDay','getInspectionPhoto','getMaintenanceBoard','getShiftNoteDetail','getShiftOperations','getToday','getWorkBoard','adminListUsers']);
const RELAY_WRITE_AFFECTS={
 syncChoice:['hk:','inspection:','dashboard:'],startRoom:['hk:','dashboard:'],readyRoom:['hk:','inspection:','dashboard:'],
 startInspection:['inspection:'],saveInspectionIssue:['inspection:','hk:','maintenance:','dashboard:'],resolveInspectionIssue:['inspection:','hk:','dashboard:'],resolveReinspection:['inspection:','hk:','dashboard:'],passInspection:['inspection:','hk:','dashboard:'],
 logMaintenance:['maintenance:','inspection:','hk:','dashboard:'],saveMaintenanceIssue:['maintenance:','inspection:','hk:','dashboard:'],startMaintenanceWork:['maintenance:'],completeMaintenanceWork:['maintenance:','inspection:','hk:','dashboard:'],resolveMaintenanceIssue:['maintenance:','inspection:','hk:','dashboard:'],
 createSideWork:['side:','hk:','dashboard:'],startSideWork:['side:','hk:'],completeSideWork:['side:','hk:','dashboard:'],
 saveShiftNote:['shift:','dashboard:'],addShiftNoteUpdate:['shift:','dashboard:'],resolveShiftNote:['shift:','dashboard:'],completeChecklistShift:['shift:','dashboard:'],
 dailyAudit:['business:','hk:','inspection:','maintenance:','side:','shift:','dashboard:'],
 adminCreateUser:['users:'],adminUpdateUser:['users:'],adminDeactivateUser:['users:'],adminResetPassword:['users:']
};
function relayInvalidateForAction_(action){(RELAY_WRITE_AFFECTS[action]||[]).forEach(p=>relayCacheClear_(p));}

function normalizeAuthUser_(user){return {...user,roles:[String(user.role||'').toUpperCase()]};}
async function loadSession(){
  const propertiesRes=await fetch('data/properties.json',{cache:'no-store'});
  loginProperties=await propertiesRes.json();
  const sessionId=localStorage.getItem('relaySessionId');
  if(!sessionId)return;
  try{
    const r=await apiPost({action:'authSession',sessionId});
    if(r.ok&&r.user){activateUser(normalizeAuthUser_(r.user));return}
  }catch(err){console.error('Session restore failed',err)}
  localStorage.removeItem('relaySessionId');
}
function activateUser(user){
 currentUser=user;const property=loginProperties.find(p=>p.propertyId===currentUser.propertyId);
 const login=document.getElementById('loginView'),app=document.getElementById('operationsApp');
 login.hidden=true;login.style.setProperty('display','none','important');
 app.hidden=false;app.style.display='';
 applyIdentity(currentUser,property);applyPermissions(currentUser.roles);buildDrawer(currentUser.roles);updateChoiceSyncAccess_();updateDailyAuditAccess_();
 // Authentication owns the critical path. Operational Sheets reads happen only after the app is visible.
 if(currentUser.roles.includes('HOUSEKEEPER'))show('Housekeeping');else if(currentUser.roles.includes('MAINTENANCE'))show('Maintenance');else show('Home');
}
function allowedViews(roles){return [...new Set(roles.flatMap(r=>ROLE_VIEWS[r]||[]))]}
function applyIdentity(user,property){
  const roleText=user.roles.map(r=>ROLE_LABELS[r]||r).join(' / ');
  document.querySelectorAll('.profile span,.drawer-user span').forEach(el=>el.innerHTML=user.name+'<small>'+roleText+'</small>');
  const pmn=document.getElementById('profileMenuName'),pmr=document.getElementById('profileMenuRole');if(pmn)pmn.textContent=user.name;if(pmr)pmr.textContent=roleText;
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
  if(reportsView) reportsView.hidden=view!=='Reports';
  inspectionView.hidden=view!=='Inspections';
  maintenanceView.hidden=view!=='Maintenance';
  checklistsView.hidden=view!=='Checklists';
  document.getElementById('pmView').hidden=!(view==='PM'||view==='Preventive Maintenance');
  document.getElementById('usersView').hidden=view!=='Users';
  importView.hidden=true;
  placeholder.hidden=(view==='Home'||view==='Housekeeping'||view==='Inspections'||view==='Maintenance'||view==='Checklists'||view==='PM'||view==='Preventive Maintenance'||view==='Users'||view==='Reports');
  if(!placeholder.hidden) title.textContent=view;
  if(view==='Housekeeping') loadHousekeepingBoard()
  if(view==='Inspections') loadInspectionQueue();
  if(view==='Maintenance'){loadMaintenanceBoard();loadSideWorkBoard_();}
  if(view==='Reports') loadWeeklyOpsReport_();
  if(view==='Users') loadUsersAdmin();
  if(view==='Checklists'){openChecklistHub();loadOpenShiftNotes_();}
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
loadSession().catch(err=>{home.innerHTML='<div class="placeholder"><div><h2>Unable to start RELAY</h2><p>'+err.message+'</p></div></div>'});
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
  const [roomsRes,propertiesRes,usersApi]=await Promise.all([
    fetch('data/rooms.json',{cache:'no-store'}),
    fetch('data/properties.json',{cache:'no-store'}),
    apiPost({action:'getAssignableHousekeepers',sessionId:localStorage.getItem('relaySessionId')})
  ]);
  const masterRooms=await roomsRes.json(),properties=await propertiesRes.json();
  if(!usersApi.ok)throw new Error(usersApi.error||usersApi.reason||'Could not read active RELAY users');
  const users=(usersApi.housekeepers||[]).map(u=>({...u,active:true,role:'HOUSEKEEPER'}));
  const roomSet=new Set(masterRooms.filter(r=>r.propertyId==='CO534'&&r.active).map(r=>String(r.roomNumber)));
  const parsedNums=parsed.rooms.map(r=>String(r.room)),unknownRooms=[...new Set(parsedNums.filter(r=>!roomSet.has(r)))];
  const duplicateRows=parsedNums.filter((r,i,a)=>a.indexOf(r)!==i);
  const assigned=parsed.assignments.flatMap(a=>a.rooms.map(room=>({room:String(room),name:a.name})));
  const duplicateAssignments=[...new Set(assigned.filter((x,i,a)=>a.findIndex(y=>y.room===x.room)!==i).map(x=>x.room))];
  const activeNames=new Set(users.filter(u=>u.active&&u.role==='HOUSEKEEPER').map(u=>String(u.name).toLowerCase()));
  const unknownEmployees=parsed.assignments.map(a=>a.name).filter(n=>!activeNames.has(String(n).toLowerCase()));
  const propertyExists=properties.some(p=>p.active&&p.propertyId===parsed.property);
  const dateValid=/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parsed.date);
  await loadRelayBusinessDay_();
  const parsedDate=dateValid?new Date(parsed.date+' 12:00:00'):null,businessDate=relayBusinessDate?new Date(relayBusinessDate+' 12:00:00'):null;
  const businessDateMatch=!!(parsedDate&&businessDate&&parsedDate.toDateString()===businessDate.toDateString());
  return [
    {label:'Property',ok:propertyExists,detail:propertyExists?parsed.property+' matched':'Unknown property: '+(parsed.property||'none')},
    {label:'Business Date',ok:dateValid&&businessDateMatch,detail:!dateValid?'Missing or invalid report date':businessDateMatch?(parsed.date+' matches current RELAY business day'):'Choice report '+parsed.date+' does not match RELAY business day '+relayBusinessDate},
    {label:'Room Master',ok:unknownRooms.length===0,detail:unknownRooms.length?('Unknown rooms: '+unknownRooms.join(', ')):parsed.rooms.length+' extracted rooms matched'},
    {label:'Duplicate Room Rows',ok:duplicateRows.length===0,detail:duplicateRows.length?('Duplicates: '+[...new Set(duplicateRows)].join(', ')):'No duplicate extracted rooms'},
    {label:'Duplicate Assignments',ok:duplicateAssignments.length===0,detail:duplicateAssignments.length?('Assigned twice: '+duplicateAssignments.join(', ')):'No room assigned twice'},
    {label:'Housekeepers',ok:unknownEmployees.length===0,detail:unknownEmployees.length?('No active HOUSEKEEPER account matches Choice: '+unknownEmployees.join(', ')):parsed.assignments.length+' housekeeper'+(parsed.assignments.length===1?'':'s')+' matched'}
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
    validationSummary.textContent=passed?'✓ All safety checks passed. Ready to compare with today’s RELAY activity.':'Review required. Sync remains disabled until every validation issue is resolved.';
    if(passed){await compareWithToday(lastParsed)} else {comparePanel.hidden=true; importDaily.disabled=true}
  }catch(err){validationPanel.hidden=false;validationSummary.className='validation-summary fail';validationSummary.textContent='Validation could not run: '+err.message;importDaily.disabled=true}
  finally{validateImport.disabled=false;validateImport.textContent='Continue to Validate →'}
});
async function apiPost(payload,timeoutMs=20000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow',signal:controller.signal});
    if(!r.ok) throw new Error('API request failed ('+r.status+')');
    const data=await r.json();
    if(data?.ok&&payload?.action&&!RELAY_READ_ACTIONS.has(payload.action))relayInvalidateForAction_(payload.action);
    return data;
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
  }catch(e){throw new Error('Could not read today’s shared RELAY state: '+e.message)}
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
    else if(session){conflicts++;details.push({kind:'conflict',text:'Room '+room+': Choice now '+name+'; RELAY has '+session.housekeeper+' '+session.status.replaceAll('_',' ').toLowerCase()+'. Review required.'})}
    else{changed++;details.push({kind:'changed',text:'Room '+room+': '+old+' → '+name+' (safe reassignment; not started)'})}
  });
  current.forEach((name,room)=>{if(!incoming.has(room)){const session=started.get(room); if(session){conflicts++;details.push({kind:'conflict',text:'Room '+room+': no longer assigned in Choice, but '+session.housekeeper+' has operational activity. Review required.'})}else{changed++;details.push({kind:'changed',text:'Room '+room+': assignment removed by Choice (safe; not started)'})}}});
  comparePanel.hidden=false;
  compareSummary.innerHTML=[['Unchanged',unchanged],['New',added],['Changed',changed],['Conflicts',conflicts]].map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join('');
  compareDetails.innerHTML=details.length?details.map(d=>'<article class="'+d.kind+'">'+d.text+'</article>').join(''):'<p>No assignment differences from today’s RELAY state.</p>';
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
      syncedBy:currentUser?.name||'RELAY',sourceFilename:selectedPdf?.name||''
    },180000);
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
function canSyncChoice_(){return !!currentUser&&currentUser.roles.some(r=>['ADMIN','INSPECTOR','FRONT DESK'].includes(r))}
function updateChoiceSyncAccess_(){const allowed=canSyncChoice_();managerImportBtn.hidden=!allowed;if(!allowed)emptyChoiceSyncBtn.hidden=true}
function openChoiceSync(){if(!canSyncChoice_())return;housekeepingView.hidden=true;importView.hidden=false}
managerImportBtn.addEventListener('click',openChoiceSync);emptyChoiceSyncBtn.addEventListener('click',openChoiceSync);
function housekeepingBusinessDate(){return relayBusinessDate||new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver'}).format(new Date())}
async function loadRelayBusinessDay_(force=false){if(!force&&relayBusinessDate&&Date.now()-relayBusinessDayLoadedAt<60000)return relayBusinessDate;try{const r=await apiPost({action:'getBusinessDay',sessionId:localStorage.getItem('relaySessionId')});if(r.ok&&r.businessDate){relayBusinessDate=r.businessDate;relayBusinessDayLoadedAt=Date.now();document.querySelectorAll('[data-business-date]').forEach(x=>x.textContent=r.businessDate);return r.businessDate}}catch(e){console.warn('Business day load failed',e)}return housekeepingBusinessDate()}
async function loadHousekeepingBoard(){
  if(!currentUser)return;
  hkGreeting.textContent='Good morning, '+currentUser.name.split(' ')[0];
  hkBoardStatus.className='hk-board-status';hkBoardStatus.textContent='Loading today’s assignments…';hkMyRooms.innerHTML='';
  const canManageBoard=currentUser.roles.some(r=>['ADMIN','INSPECTOR','FRONT DESK'].includes(r));
  const isHkOnly=currentUser.roles.includes('HOUSEKEEPER')&&!canManageBoard;
  managerImportBtn.hidden=!canManageBoard;emptyChoiceSyncBtn.hidden=true;hkManagerGroups.hidden=!canManageBoard;
  try{
    // Housekeepers use one lightweight round-trip for only their rooms, cleaning sessions, and active rework.
    // Managers still confirm the authoritative business day before loading the property-wide snapshot.
    let state,date;
    if(isHkOnly){
      const provisional=relayBusinessDate||'CURRENT',cacheKey='hk:'+provisional+':'+currentUser.name;
      state=relayCached_(cacheKey)||await apiPost({action:'getHousekeeperBoard',worker:currentUser.name},30000);
      if(state.ok&&state.businessDate){relayBusinessDate=state.businessDate;relayBusinessDayLoadedAt=Date.now();relayCacheSet_('hk:'+relayBusinessDate+':'+currentUser.name,state)}
      date=state.businessDate||housekeepingBusinessDate();
    }else{
      // Do not make managers wait on a separate business-day request before the board.
      // Use the known/open Denver day immediately; getToday is the authoritative board read.
      date=housekeepingBusinessDate();
      const cacheKey='hk:'+date+':'+currentUser.name;
      state=relayCached_(cacheKey);
      if(!state){
        try{state=await apiPost({action:'getToday',businessDate:date},45000)}
        catch(err){
          // Apps Script can occasionally return a transient 404 immediately after a deployment.
          // One automatic retry is safer than making the manager click Housekeeping again.
          if(String(err?.message||'').includes('(404)'))state=await apiPost({action:'getToday',businessDate:date},45000);
          else throw err;
        }
        relayCacheSet_(cacheKey,state);
      }
      relayBusinessDate=date;relayBusinessDayLoadedAt=Date.now();
    }
    const businessDateObj=new Date(date+' 12:00:00');
    hkBoardDate.textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'America/Denver'}).format(businessDateObj);
    if(!state.ok)throw new Error(state.error||'Could not load board');
    if(!isHkOnly){relayCacheSet_('inspection:'+date,state);relayCacheSet_('maintenance:'+date,state);relayCacheSet_('dashboard:today:'+date,state)}
    const assignments=state.assignments||[],sessions=state.cleaningSessions||[],inspectionIssues=state.inspectionIssues||[];
    if(!('inspectionIssues' in state))console.warn('RELAY getToday snapshot does not include inspectionIssues; rendering board without rework overlay.');
    console.log('Rimrock rework payload',inspectionIssues);
    const sessionByRoom=new Map(sessions.map(s=>[String(s.room),s]));
    const reworkByRoom=new Map();
    inspectionIssues.filter(i=>['REWORK_REQUIRED','REWORK_IN_PROGRESS'].includes(i.status)&&(canManageBoard||i.housekeeper===currentUser.name)).forEach(i=>{const k=String(i.room);if(!reworkByRoom.has(k))reworkByRoom.set(k,[]);reworkByRoom.get(k).push(i)});
    const visible=canManageBoard?assignments:assignments.filter(a=>a.housekeeper===currentUser.name);
    const cleaning=visible.filter(a=>sessionByRoom.get(String(a.room))?.status==='CLEANING').length;
    const ready=visible.filter(a=>sessionByRoom.get(String(a.room))?.status==='READY_FOR_INSPECTION').length;
    document.getElementById('hkAssignedCount').textContent=visible.length;
    document.getElementById('hkCleaningCount').textContent=cleaning;
    document.getElementById('hkReadyCount').textContent=ready;
    document.getElementById('hkNotStartedCount').textContent=visible.length-cleaning-ready;
    if(visible.length){hkBoardStatus.textContent=canManageBoard?'Live property housekeeping board':'Your Choice assignments are current.'}else if(canManageBoard){hkBoardStatus.innerHTML='<strong>Today’s housekeeping board has not been loaded.</strong><br>No active Choice assignments found for '+date+'.';emptyChoiceSyncBtn.hidden=false}else{hkBoardStatus.textContent='No rooms are assigned for '+date+'.'}
    if(canManageBoard){
      const groups={};assignments.forEach(a=>(groups[a.housekeeper]??=[]).push(a.room));
      hkManagerGroups.innerHTML=Object.keys(groups).length?Object.entries(groups).map(([name,rooms])=>'<article><strong>'+name+'</strong><span>'+rooms.length+' room'+(rooms.length===1?'':'s')+': '+rooms.join(', ')+'</span></article>').join(''):'';
    }
    // Render immediately from cached/snapshot state, then fetch side work only when it is not already present.
    renderSideWorkBoardFromState_(state);
    if(!('sideWork' in state)&&!currentUser.roles.includes('INSPECTOR')&&!isHkOnly) setTimeout(()=>loadSideWorkBoard_(),0);
    hkMyRooms.innerHTML=visible.map(a=>{
      const room=String(a.room),s=sessionByRoom.get(room),rework=reworkByRoom.get(room)||[],activeRework=rework.find(i=>i.status==='REWORK_IN_PROGRESS'),status=activeRework?'REWORK_IN_PROGRESS':rework.length?'REWORK_REQUIRED':(s?.status||'NOT_STARTED');
      const label=status==='REWORK_IN_PROGRESS'?'REWORK IN PROGRESS':status==='REWORK_REQUIRED'?'REWORK REQUIRED':status==='READY_FOR_INSPECTION'?'READY FOR INSPECTION':status==='CLEANING'?'CLEANING':'NOT STARTED';
      const action=status==='REWORK_IN_PROGRESS'?'REWORK COMPLETE':status==='REWORK_REQUIRED'?'START REWORK':status==='CLEANING'?'Room in progress':status==='READY_FOR_INSPECTION'?'Awaiting inspection':'START ROOM';
      const started=s?.started_at||'';const reworkHtml=rework.length?'<div class="hk-rework-list">'+rework.map(i=>'<div class="hk-rework-item"><strong>'+i.deficiency_label+'</strong>'+(i.note?'<span>'+i.note+'</span>':'')+'<button type="button" class="view-rework-photo" data-photo="'+i.photo_ref+'">View inspector photo</button></div>').join('')+'</div>':'';const issueId=(activeRework||rework[0])?.issue_id||'';
      const canInspect=currentUser.roles.some(r=>['ADMIN','INSPECTOR'].includes(r));
      const button=status==='READY_FOR_INSPECTION'&&canInspect
        ?'<button type="button" class="hk-start-inspection-btn" data-room="'+room+'" data-housekeeper="'+a.housekeeper+'">START INSPECTION</button>'
        :status==='REWORK_IN_PROGRESS'&&!canManageBoard?'<button type="button" class="complete-rework-btn" data-room="'+room+'" data-issue="'+issueId+'">REWORK COMPLETE</button>'
        :status==='REWORK_REQUIRED'&&!canManageBoard?'<button type="button" class="rework-room-btn" data-room="'+room+'" data-issue="'+issueId+'">START REWORK</button>'
        :status==='CLEANING'&&!canManageBoard?'<div class="hk-room-actions"><button type="button" class="hk-context-maint" data-room="'+room+'" onclick="openHkMaintenanceForRoom(this.dataset.room);return false;">🔧 REPORT MAINTENANCE</button><button type="button" class="ready-room-btn" data-room="'+room+'">READY FOR INSPECTION</button></div>'
        :'<button type="button" class="start-room-btn" data-room="'+room+'" '+(status==='NOT_STARTED'&&!canManageBoard?'':'disabled')+'>'+(status==='NOT_STARTED'?'SCAN QR TO START':action)+'</button>';return '<article class="hk-room-card"><div class="hk-room-top"><span class="hk-room-number">ROOM '+room+'</span><span class="hk-room-pill">'+label+'</span></div><div class="hk-room-meta">Choice assignment • '+a.housekeeper+(status==='CLEANING'?'<br>Started '+started+'<br><strong class="elapsed-timer" data-start="'+started+'">Elapsed --:--</strong>':'')+'</div>'+reworkHtml+button+'</article>'
    }).join('');
  }catch(err){hkBoardStatus.className='hk-board-status error';hkBoardStatus.textContent='Could not load housekeeping board: '+err.message}
}

hkMyRooms.addEventListener('click',e=>{
  const b=e.target.closest('.hk-start-inspection-btn');if(!b)return;
  e.preventDefault();e.stopPropagation();
  // Use the same QR-verified inspection flow as the Inspections queue.
  show('Inspections');
  pendingInspectionRoom=b.dataset.room||'';
  pendingInspectionHousekeeper=b.dataset.housekeeper||'';
  document.getElementById('inspectionQrTitle').textContent='Room '+pendingInspectionRoom;
  document.getElementById('inspectionQrMessage').textContent='Scan the Room '+pendingInspectionRoom+' QR code to begin the inspection.';
  document.getElementById('inspectionQrCamera').innerHTML='▦';
  document.getElementById('inspectionQrPanel').hidden=false;
  startInspectionQrCamera_();
});

let pendingStartRoom=null;
hkMyRooms.addEventListener('click',e=>{const b=e.target.closest('.start-room-btn');if(!b||b.disabled)return;pendingStartRoom=b.dataset.room;qrStartRoom.textContent='Room '+pendingStartRoom;qrStartMessage.textContent='Opening camera… scanning the correct room QR starts cleaning automatically.';qrStartPanel.hidden=false;startQrCamera()});
document.getElementById('closeQrStart').addEventListener('click',()=>{qrStartPanel.hidden=true;pendingStartRoom=null});
async function startQrCamera(){
  if(!pendingStartRoom)return;
  qrStartMessage.textContent='Opening camera for Room '+pendingStartRoom+'…';
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const box=document.querySelector('.qr-code-placeholder'),video=document.createElement('video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    video.setAttribute('playsinline','');video.muted=true;video.autoplay=true;video.srcObject=stream;box.innerHTML='';box.style.width='min(82vw,360px)';box.style.height='min(82vw,360px)';box.appendChild(video);video.style.width='100%';video.style.height='100%';video.style.objectFit='cover';video.style.borderRadius='12px';
    await video.play();document.getElementById('confirmQrStart').hidden=true;qrStartMessage.textContent='Point the camera at the Room '+pendingStartRoom+' QR code. Scanning starts cleaning automatically.';
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
          const startResult=await apiPost({action:'startRoom',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:pendingStartRoom,housekeeper:currentUser.name,qrId:raw},90000);
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
  }catch(err){if(stream)stream.getTracks().forEach(t=>t.stop());qrStartMessage.textContent='Camera error: '+(err?.name||'UnknownError')+' — '+(err?.message||String(err));const retry=document.getElementById('confirmQrStart');retry.hidden=false;retry.textContent='TRY CAMERA AGAIN'}
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
    const key='inspection:'+housekeepingBusinessDate(),state=relayCached_(key)||relayCacheSet_(key,await apiPost({action:'getToday',businessDate:housekeepingBusinessDate()}));
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
let pendingInspectionRoom='',pendingInspectionHousekeeper='',inspectionQrStream=null;
function closeInspectionQr_(){if(inspectionQrStream){inspectionQrStream.getTracks().forEach(t=>t.stop());inspectionQrStream=null}document.getElementById('inspectionQrPanel').hidden=true;pendingInspectionRoom='';pendingInspectionHousekeeper=''}
document.getElementById('closeInspectionQr').addEventListener('click',closeInspectionQr_);
async function startInspectionQrCamera_(){
  if(!pendingInspectionRoom)return;
  const panel=document.getElementById('inspectionQrPanel'),msg=document.getElementById('inspectionQrMessage'),box=document.getElementById('inspectionQrCamera');
  msg.textContent='Opening camera for Room '+pendingInspectionRoom+'…';
  try{
    inspectionQrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const video=document.createElement('video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    video.setAttribute('playsinline','');video.muted=true;video.autoplay=true;video.srcObject=inspectionQrStream;box.innerHTML='';box.appendChild(video);video.style.width='100%';video.style.height='100%';video.style.objectFit='cover';video.style.borderRadius='12px';await video.play();
    msg.textContent='Point the camera at the Room '+pendingInspectionRoom+' QR code.';
    const detector=('BarcodeDetector' in window)?new BarcodeDetector({formats:['qr_code']}):null;
    const scan=async()=>{
      if(panel.hidden){if(inspectionQrStream)inspectionQrStream.getTracks().forEach(t=>t.stop());return}
      let raw='';
      try{if(detector){const codes=await detector.detect(video);raw=codes[0]?.rawValue||''}else if(window.jsQR&&video.readyState>=2){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);const img=ctx.getImageData(0,0,canvas.width,canvas.height);raw=jsQR(img.data,img.width,img.height)?.data||''}}catch(e){}
      if(!raw){requestAnimationFrame(scan);return}
      if(inspectionQrStream){inspectionQrStream.getTracks().forEach(t=>t.stop());inspectionQrStream=null}
      const expected='CO534-RM-'+pendingInspectionRoom;
      if(raw!==expected){msg.textContent='Wrong room QR. Expected Room '+pendingInspectionRoom+'.';box.innerHTML='▦';setTimeout(startInspectionQrCamera_,900);return}
      msg.textContent='✓ Room '+pendingInspectionRoom+' verified. Starting inspection timer…';box.innerHTML='✓';
      try{
        const opened=await apiPost({action:'startInspection',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:pendingInspectionRoom,housekeeper:pendingInspectionHousekeeper,inspector:currentUser.name,qrId:raw});
        if(!opened.ok)throw new Error(opened.reason||opened.error||'Could not open inspection');
        activeInspectionRoom=pendingInspectionRoom;activeInspectionHousekeeper=pendingInspectionHousekeeper;
        document.getElementById('inspectionRoomTitle').textContent='Room '+activeInspectionRoom;document.getElementById('inspectionHousekeeper').textContent='Housekeeper: '+activeInspectionHousekeeper;
        panel.hidden=true;pendingInspectionRoom='';pendingInspectionHousekeeper='';inspectionQueueEl.hidden=true;document.getElementById('inspectionStatus').hidden=true;inspectionDetail.hidden=false;inspectionDetail.querySelectorAll('input[type=checkbox]').forEach(x=>x.checked=false);
        const ms=document.getElementById('inspectionMaintenanceSummary'),mi=(window._inspectionMaintenance||[]).filter(m=>String(m.room)===String(activeInspectionRoom)&&m.status==='OPEN');ms.hidden=!mi.length;ms.innerHTML=mi.length?'<strong>Maintenance Issues</strong>'+mi.map(m=>'<div class="maint-summary-item '+(String(m.blocking).toUpperCase()==='TRUE'?'blocking':'routine')+'"><div>'+(String(m.blocking).toUpperCase()==='TRUE'?'🔴 BLOCKING — ':'⚪ NON-BLOCKING — ')+(m.description||'Maintenance issue')+'</div><button type="button" class="inspection-maint-resolve" data-id="'+m.maintenance_id+'">🔧 FIX / RESOLVE</button></div>').join(''):'';
      }catch(err){msg.textContent='Could not start inspection: '+err.message;box.innerHTML='▦'}
    };requestAnimationFrame(scan);
  }catch(err){if(inspectionQrStream){inspectionQrStream.getTracks().forEach(t=>t.stop());inspectionQrStream=null}msg.textContent='Camera error: '+(err?.message||String(err));box.innerHTML='▦'}
}
inspectionQueueEl.addEventListener('click',e=>{const b=e.target.closest('.start-inspection-btn');if(!b)return;pendingInspectionRoom=b.dataset.room||'';pendingInspectionHousekeeper=b.dataset.housekeeper||'';document.getElementById('inspectionQrTitle').textContent='Room '+pendingInspectionRoom;document.getElementById('inspectionQrMessage').textContent='Scan the Room '+pendingInspectionRoom+' QR code to begin the inspection.';document.getElementById('inspectionQrCamera').innerHTML='▦';document.getElementById('inspectionQrPanel').hidden=false;startInspectionQrCamera_()});
document.getElementById('inspectionBack').addEventListener('click',()=>{inspectionDetail.hidden=true;inspectionQueueEl.hidden=false;document.getElementById('inspectionStatus').hidden=false});

let inspectionCaptureType=null,inspectionBlocking=null;
let inspectionCounts={hk:0,maint:0,blocking:0,highlight:0};
function renderInspectionCounts(){const el=document.getElementById('inspectionIssueSummary');if(!el)return;const total=inspectionCounts.hk+inspectionCounts.maint;el.innerHTML='<strong>Issues captured: '+total+'</strong><span>📸 HK: '+inspectionCounts.hk+' &nbsp; • &nbsp; 🔧 Maintenance: '+inspectionCounts.maint+' &nbsp; • &nbsp; ⛔ Blocking: '+inspectionCounts.blocking+' &nbsp; • &nbsp; ✨ Highlights: '+inspectionCounts.highlight+'</span>'}
function resetInspectionCapture(){inspectionCaptureType=null;inspectionBlocking=null;document.getElementById('inspectionPhoto').value='';document.getElementById('inspectionNote').value='';document.getElementById('inspectionCapture').hidden=true;const b=document.getElementById('saveInspectionCapture');b.disabled=true;b.textContent='SAVE'};
function openInspectionCapture(type){
  inspectionCaptureType=type;inspectionBlocking=null;
  const panel=document.getElementById('inspectionCapture'),title=document.getElementById('captureTitle'),label=document.getElementById('captureTypeLabel'),maint=document.getElementById('maintenanceBlocking'),note=document.getElementById('captureNoteWrap'),route=document.getElementById('captureRoutingNote');
  document.getElementById('inspectionPhoto').value='';document.getElementById('inspectionNote').value='';document.getElementById('saveInspectionCapture').disabled=true;maint.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
  if(type==='HK_ISSUE'){label.textContent='HOUSEKEEPING ISSUE';title.textContent='Housekeeping Issue';maint.hidden=true;note.hidden=false;route.textContent='Report the housekeeping miss first. Then choose I FIXED IT or SEND TO HOUSEKEEPER.'}
  if(type==='MAINT_ISSUE'){label.textContent='MAINTENANCE ISSUE';title.textContent='Maintenance Issue';maint.hidden=false;note.hidden=false;route.textContent='Routes to Maintenance. Blocking choice determines whether the room can become Ready.'}
  if(type==='ROOM_HIGHLIGHT'){label.textContent='ROOM_HIGHLIGHT';title.textContent='Room Photo';maint.hidden=true;note.hidden=true;route.textContent='Positive finished-room photo. Routes to Inspection Report highlights only.'}
  panel.hidden=false;
}
document.querySelector('.housekeeping-inspection-btn')?.addEventListener('click',()=>openInspectionCapture('HK_ISSUE'));
document.querySelector('.maintenance-inspection-btn').addEventListener('click',()=>openInspectionCapture('MAINT_ISSUE'));
document.querySelector('.photo-room-btn').addEventListener('click',()=>openInspectionCapture('ROOM_HIGHLIGHT'));
document.getElementById('closeInspectionCapture').addEventListener('click',resetInspectionCapture);
function refreshInspectionSaveButton(){const hasPhoto=!!document.getElementById('inspectionPhoto').files.length,note=document.getElementById('inspectionNote').value.trim();let ok=false;if(inspectionCaptureType==='ROOM_HIGHLIGHT')ok=hasPhoto;else if(inspectionCaptureType==='MAINT_ISSUE')ok=!!note&&inspectionBlocking!==null;else if(inspectionCaptureType==='HK_ISSUE')ok=!!note;document.getElementById('saveInspectionCapture').disabled=!ok}
document.getElementById('inspectionPhoto').addEventListener('change',refreshInspectionSaveButton);
document.getElementById('inspectionNote').addEventListener('input',refreshInspectionSaveButton);
document.getElementById('maintenanceBlocking').addEventListener('click',e=>{const b=e.target.closest('[data-blocking]');if(!b)return;inspectionBlocking=b.dataset.blocking==='true';e.currentTarget.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));refreshInspectionSaveButton()});

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
    // A photo save creates the OPEN issue. If the inspector already selected a
    // resolution before/while the photo finished uploading, apply it to this
    // exact issue row immediately so PASS never sees a stale OPEN deficiency.
    if(q.dataset.resolution){
      const resolved=await apiPost({action:'resolveInspectionIssue',issueId:result.issueId,inspector:currentUser.name,resolution:q.dataset.resolution},30000);
      if(!resolved.ok)throw new Error(resolved.reason||resolved.error||'Issue resolution save failed');
      q.dataset.resolution=resolved.resolution;
    }
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
  if(inspectionCaptureType==='ROOM_HIGHLIGHT'&&!file){document.getElementById('captureRoutingNote').textContent='Take or choose a photo first.';return}
  btn.disabled=true;btn.textContent='SAVING…';
  try{
    const dataUrl=file?await fileToDataUrl(file):'';
    let result;
    if(inspectionCaptureType==='HK_ISSUE'){
      const note=document.getElementById('inspectionNote').value.trim();
      if(!note)throw new Error('Describe what needs to be corrected. Photo is optional.');
      result=await apiPost({action:'saveInspectionIssue',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:activeInspectionRoom,housekeeper:activeInspectionHousekeeper,inspector:currentUser.name,deficiencyKey:'GENERAL_HK_ISSUE',deficiencyLabel:'Housekeeping Issue',note:note,photoBase64:dataUrl,photoMimeType:file?.type||'image/jpeg'},30000);
      if(!result.ok)throw new Error(result.reason||result.error||'Housekeeping issue save failed');
      inspectionCounts.hk++;renderInspectionCounts();
      const panel=document.getElementById('inspectionCapture');
      const route=document.getElementById('captureRoutingNote');
      route.innerHTML='✓ Housekeeping issue reported'+(result.photoRef?' • photo saved':' • no photo')+
        '<div class="deficiency-resolution capture-resolution" style="margin-top:14px">'+
        '<button type="button" data-capture-resolution="FIXED_BY_INSPECTOR">✓ I FIXED IT</button>'+
        '<button type="button" data-capture-resolution="REWORK_REQUIRED">↩ SEND TO HOUSEKEEPER</button></div>';
      panel.dataset.issueId=result.issueId;
      btn.textContent='REPORTED';
      btn.disabled=true;
      return;
    }else if(inspectionCaptureType==='MAINT_ISSUE'){
      const note=document.getElementById('inspectionNote').value.trim();
      if(!note||inspectionBlocking===null)throw new Error('Note and blocking choice are required. Photo is optional.');
      result=await apiPost({action:'saveMaintenanceIssue',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:activeInspectionRoom,housekeeper:activeInspectionHousekeeper,inspector:currentUser.name,description:note,blocking:inspectionBlocking,photoBase64:dataUrl,photoMimeType:file?.type||'image/jpeg'},30000);
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



document.getElementById('inspectionCapture').addEventListener('click',async e=>{
  const choice=e.target.closest('[data-capture-resolution]');if(!choice)return;
  const panel=document.getElementById('inspectionCapture'),issueId=panel.dataset.issueId;
  if(!issueId){alert('Report the housekeeping issue first.');return}
  const resolution=choice.dataset.captureResolution,buttons=panel.querySelectorAll('[data-capture-resolution]');
  buttons.forEach(x=>x.disabled=true);const old=choice.textContent;choice.textContent='SAVING…';
  try{
    const result=await apiPost({action:'resolveInspectionIssue',issueId:issueId,inspector:currentUser.name,resolution:resolution},30000);
    if(!result.ok)throw new Error(result.reason||result.error||'Resolution save failed');
    if(result.resolution==='FIXED_BY_INSPECTOR'){
      if(!window._relayInspectorFixedIssueIds)window._relayInspectorFixedIssueIds=new Set();
      window._relayInspectorFixedIssueIds.add(issueId);
      document.getElementById('captureRoutingNote').textContent='✓ Issue recorded against '+activeInspectionHousekeeper+' • fixed by '+currentUser.name+' • room may pass if everything else passes.';
    }else{
      document.getElementById('captureRoutingNote').textContent='↩ Issue sent back to '+activeInspectionHousekeeper+' for rework • room cannot pass until corrected and verified.';
    }
    delete panel.dataset.issueId;
    setTimeout(()=>resetInspectionCapture(),1400);
  }catch(err){buttons.forEach(x=>x.disabled=false);choice.textContent=old;alert('Could not save resolution: '+err.message)}
});

document.querySelector('.inspection-question-list').addEventListener('click',async e=>{
  const b=e.target.closest('[data-resolution]');if(!b)return;
  const q=b.closest('.inspect-q');let issueId=q.dataset.issueId;
  if(!issueId){
    const note=q.querySelector('.deficiency-evidence textarea')?.value?.trim()||'';
    if(!note){alert('Describe what is wrong first. A photo is optional.');return}
    try{const saved=await apiPost({action:'saveInspectionIssue',propertyId:'CO534',businessDate:housekeepingBusinessDate(),room:activeInspectionRoom,housekeeper:activeInspectionHousekeeper,inspector:currentUser.name,deficiencyKey:q.dataset.key,deficiencyLabel:q.querySelector('strong').textContent.replace(/\?$/,''),note:note,photoBase64:'',photoMimeType:'image/jpeg'},30000);if(!saved.ok)throw new Error(saved.reason||saved.error||'Issue save failed');issueId=saved.issueId;q.dataset.issueId=issueId;inspectionCounts.hk++;renderInspectionCounts()}catch(err){alert('Could not save issue: '+err.message);return}
  }
  const resolution=b.dataset.resolution,old=b.textContent;
  // Store the inspector's choice before the network write. This also lets an
  // in-flight photo upload apply the same choice to the exact issue it creates.
  q.dataset.resolution=resolution;
  q.querySelectorAll('[data-resolution]').forEach(x=>x.disabled=true);b.textContent='SAVING…';
  try{
    const result=await apiPost({action:'resolveInspectionIssue',issueId:issueId,inspector:currentUser.name,resolution:resolution},30000);
    if(!result.ok)throw new Error(result.reason||result.error||'Resolution save failed');
    q.dataset.resolution=result.resolution;
    q.querySelectorAll('[data-resolution]').forEach(x=>{x.classList.toggle('selected',x===b);x.disabled=false});
    b.textContent=result.resolution==='FIXED_BY_INSPECTOR'?'✓ FIXED BY ME':'↩ REWORK REQUIRED';
  }catch(err){delete q.dataset.resolution;q.querySelectorAll('[data-resolution]').forEach(x=>x.disabled=false);b.textContent=old;alert('Could not save resolution: '+err.message)}
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
  // RELAY rule: the inspector owns the final room decision. Housekeeping
  // deficiencies remain recorded for HK analytics, but they never block PASS.
  // "I FIXED IT" and "HK NEEDS TO FIX" remain useful reporting/routing choices.
  b.disabled=true;b.textContent='PASSING…';
  try{
    const result=await apiPost({
      action:'passInspection',propertyId:'CO534',businessDate:housekeepingBusinessDate(),
      room:activeInspectionRoom,inspector:currentUser.name,inspectorOverrideHousekeeping:true
    },90000);
    if(!result.ok)throw new Error(result.reason||result.error||'Pass failed');
    if(result.roomStatus==='HOLD_MAINTENANCE'){
      alert('✓ HOUSEKEEPING PASSED\n\n⛔ ROOM '+activeInspectionRoom+' — HOLD FOR MAINTENANCE\n\nThe inspector passed housekeeping. A blocking maintenance issue still holds the room.');
    }else{
      alert('✓ INSPECTION PASSED\n\nROOM '+activeInspectionRoom+' — READY');
    }
    window._relayInspectorFixedIssueIds=new Set();inspectionDetail.hidden=true;inspectionQueueEl.hidden=false;document.getElementById('inspectionStatus').hidden=false;await loadInspectionQueue();
  }catch(err){alert(err.message);b.disabled=false;b.textContent=old}
});

async function loadMaintenanceBoard(){
  const status=document.getElementById('maintenanceStatus'),queue=document.getElementById('maintenanceQueue');
  status.textContent='Loading maintenance…';queue.innerHTML='';
  try{
    const key='maintenance:'+housekeepingBusinessDate();let state=relayCached_(key);
    if(!state){const isMaintOnly=(currentUser?.roles||[]).includes('MAINTENANCE')&&!(currentUser?.roles||[]).some(r=>['ADMIN','INSPECTOR','FRONT DESK'].includes(r));if(isMaintOnly){const targeted=await apiPost({action:'getMaintenanceBoard',sessionId:localStorage.getItem('relaySessionId'),businessDate:housekeepingBusinessDate(),worker:currentUser.name},20000).catch(()=>null);state=targeted?.ok?targeted:await apiPost({action:'getToday',businessDate:housekeepingBusinessDate()},45000)}else state=await apiPost({action:'getToday',businessDate:housekeepingBusinessDate()},45000);relayCacheSet_(key,state)}
    const items=state.maintenanceIssues||[];
    const p1=items.filter(x=>x.status==='OPEN'&&x.priority==='P1_GUEST_IMPACT'),p2=items.filter(x=>x.status==='OPEN'&&x.priority==='P2_ROOM_BLOCKING'),p3=items.filter(x=>x.status==='OPEN'&&x.priority==='P3_ROUTINE');
    document.getElementById('maintP1').textContent=p1.length;document.getElementById('maintP2').textContent=p2.length;document.getElementById('maintP3').textContent=p3.length;
    const ordered=[...p1,...p2,...p3];status.textContent=ordered.length?ordered.length+' open maintenance item'+(ordered.length===1?'':'s')+'.':'No open maintenance items.';
    queue.innerHTML=ordered.map(x=>{const isP1=x.priority==='P1_GUEST_IMPACT',isP2=x.priority==='P2_ROOM_BLOCKING',urgent=(x.description||'').includes('⚠ IMMEDIATE ATTENTION');return '<article class="maint-card '+(isP1?'p1':isP2?'p2':'p3')+(urgent?' urgent':'')+'"><div class="maint-top"><div class="maint-room">'+(String(x.room).match(/^\d+$/)?'ROOM ':'')+x.room+'</div><div class="maint-priority">'+(isP1?'🔴 P1 — GUEST IMPACT':isP2?'⛔ P2 — ROOM BLOCKING':'🔧 P3 — ROUTINE')+(urgent?'<br>⚠ IMMEDIATE ATTENTION':'')+'</div></div><p>'+x.description.replace('⚠ IMMEDIATE ATTENTION — ','')+'</p><div class="maint-meta">Reported by '+x.reported_by+' • '+x.reported_at+'</div><div class="maint-actions">'+(x.photo_ref?'<button class="maint-photo" data-photo="'+x.photo_ref+'">VIEW PHOTO</button>':'')+((currentUser?.roles||[]).includes('MAINTENANCE')?'<button class="maint-start-work" data-id="'+x.maintenance_id+'" data-room="'+x.room+'" data-session="'+(x.workSessionId||'')+'">'+(x.workSessionId?'WORK IN PROGRESS':'SCAN QR TO START')+'</button>':'')+'<button class="maint-resolve" data-id="'+x.maintenance_id+'">✓ MARK RESOLVED</button></div></article>'}).join('');
  }catch(err){status.className='hk-board-status error';status.textContent='Could not load maintenance: '+err.message}
}

let maintenanceQrStream=null;
async function relayScanQr_(panel,box,msg,instruction){
 let stream;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera scanning is not available in this browser.');
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const video=document.createElement('video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  video.setAttribute('playsinline','');video.muted=true;video.autoplay=true;video.srcObject=stream;
  box.innerHTML='';box.appendChild(video);video.style.width='100%';video.style.height='100%';video.style.objectFit='cover';video.style.borderRadius='12px';
  await video.play();msg.textContent=instruction;
  const detector=('BarcodeDetector' in window)?new BarcodeDetector({formats:['qr_code']}):null;
  return await new Promise((resolve,reject)=>{
   const stop=()=>{if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}};
   const scan=async()=>{
    if(panel.hidden){stop();return reject(new Error('Scanner closed'))}
    let raw='';
    try{
     if(detector){const codes=await detector.detect(video);raw=codes[0]?.rawValue||''}
     else if(window.jsQR&&video.readyState>=2){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);const img=ctx.getImageData(0,0,canvas.width,canvas.height);raw=jsQR(img.data,img.width,img.height)?.data||''}
    }catch(_){}
    if(raw){stop();return resolve(raw)}
    requestAnimationFrame(scan);
   };
   requestAnimationFrame(scan);
  });
 }catch(err){if(stream)stream.getTracks().forEach(t=>t.stop());throw err}
}
async function scanMaintenanceQr_(maintenanceId,room,button){
 const panel=document.getElementById('maintenanceQrPanel'),msg=document.getElementById('maintenanceQrMessage'),title=document.getElementById('maintenanceQrTitle'),box=document.getElementById('maintenanceQrCamera'),isRoom=/^\d{3}$/.test(String(room)),label=isRoom?'Room '+room:String(room);
 document.body.appendChild(panel);panel.hidden=false;panel.style.setProperty('display','grid','important');panel.style.zIndex='99999';title.textContent=label;msg.textContent='Opening camera…';box.innerHTML='▦';
 const expected=isRoom?'CO534-RM-'+room:'CO534-LOC-'+String(room).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');
 try{
  // Maintenance now uses the same simple scanner pattern proven in Housekeeping.
  const raw=await relayScanQr_(panel,box,msg,'Scan the '+label+' QR. Scanning starts the maintenance work session automatically.');
  if(raw!==expected){box.innerHTML='▦';msg.textContent='Wrong location QR. Expected '+label+'.';return}
  box.innerHTML='✓';msg.textContent='✓ Location verified. Starting work…';button.disabled=true;
  const r=await apiPost({action:'startMaintenanceWork',maintenanceId,worker:currentUser.name,qrId:raw},30000);
  if(!r.ok)throw new Error(r.reason||r.error||'Could not start work');
  button.textContent='✓ WORK IN PROGRESS';button.dataset.session=r.workSessionId;msg.textContent='✓ IN PROGRESS';setTimeout(()=>{panel.hidden=true},450);
 }catch(err){if(String(err?.message)!=='Scanner closed'){button.disabled=false;const reason=err?.message||String(err);msg.textContent=reason==='INVALID_ROOM_QR'?'This QR was read correctly, but the database did not recognize it for '+label+'.':('Could not start maintenance work: '+reason)}}
}
function closeMaintenanceQr_(){if(maintenanceQrStream){maintenanceQrStream.getTracks().forEach(t=>t.stop());maintenanceQrStream=null}const p=document.getElementById('maintenanceQrPanel');if(p){p.hidden=true;p.style.removeProperty('display')}}
document.getElementById('closeMaintenanceQr')?.addEventListener('click',closeMaintenanceQr_);

document.getElementById('maintenanceQueue').addEventListener('click',async e=>{
 const p=e.target.closest('.maint-photo');if(p){window.open('https://drive.google.com/open?id='+p.dataset.photo,'_blank');return}
 const start=e.target.closest('.maint-start-work');if(start){if(String(start.dataset.session||'').trim())return;const location=String(start.dataset.room||'').trim();const panel=document.getElementById('maintenanceQrPanel');if(panel){panel.hidden=false;panel.style.setProperty('display','grid','important');document.body.appendChild(panel)}requestAnimationFrame(()=>scanMaintenanceQr_(start.dataset.id,location,start));return}
 const b=e.target.closest('.maint-resolve');if(!b)return;
 pendingMaintenanceResolve=b.dataset.id;
 document.getElementById('maintenanceResolveTitle').textContent='Resolve '+(b.closest('.maint-card')?.querySelector('.maint-room')?.textContent||'Maintenance');
 document.getElementById('maintenanceResolvePhoto').value='';document.getElementById('maintenanceResolveNote').value='';document.getElementById('maintenanceResolveMessage').textContent='';
 document.getElementById('maintenanceResolvePanel').hidden=false;
});
let pendingMaintenanceResolve='';
document.getElementById('closeMaintenanceResolve').addEventListener('click',()=>{pendingMaintenanceResolve='';document.getElementById('maintenanceResolvePanel').hidden=true});
document.getElementById('confirmMaintenanceResolve').addEventListener('click',async()=>{
 const b=document.getElementById('confirmMaintenanceResolve'),file=document.getElementById('maintenanceResolvePhoto').files[0],note=document.getElementById('maintenanceResolveNote').value.trim(),msg=document.getElementById('maintenanceResolveMessage');
 if(!pendingMaintenanceResolve)return;
 b.disabled=true;b.textContent='RESOLVING…';
 try{
   let photoBase64='',photoMimeType='';if(file){photoBase64=await fileToDataUrl(file);photoMimeType=file.type||'image/jpeg'}
   const card=document.querySelector('.maint-resolve[data-id="'+pendingMaintenanceResolve+'"]')?.closest('.maint-card');
   const startBtn=card?.querySelector('.maint-start-work'),workSessionId=String(startBtn?.dataset.session||'').trim();
   // A maintenance tech who started work must complete the same timed work session.
   // Inspectors/managers resolving without a maintenance session continue to use the direct resolve path.
   const payload=workSessionId
    ?{action:'completeMaintenanceWork',workSessionId:workSessionId,worker:currentUser.name,resolutionNote:note,photoBase64:photoBase64,photoMimeType:photoMimeType}
    :{action:'resolveMaintenanceIssue',maintenanceId:pendingMaintenanceResolve,resolvedBy:currentUser.name,resolutionNote:note,photoBase64:photoBase64,photoMimeType:photoMimeType};
   const r=await apiPost(payload,45000);
   if(!r.ok)throw new Error(r.reason||r.error||'Resolve failed');
   const savedPhoto=r.completionPhotoRef||r.resolution?.completionPhotoRef||'';msg.textContent='✓ Maintenance resolved'+(savedPhoto?' • photo saved':'');
   // Successful resolve is already authoritative. Update the visible board immediately instead of
   // blocking the technician on another full Sheets read.
   relayCacheClear_('maintenance:');
   if(card){
     const wasP1=card.classList.contains('p1'),wasP2=card.classList.contains('p2');
     card.remove();
     const counter=document.getElementById(wasP1?'maintP1':wasP2?'maintP2':'maintP3');
     if(counter)counter.textContent=Math.max(0,Number(counter.textContent||0)-1);
     const remaining=document.querySelectorAll('#maintenanceQueue .maint-card').length;
     const status=document.getElementById('maintenanceStatus');
     if(status)status.textContent=remaining?remaining+' open maintenance item'+(remaining===1?'':'s')+'.':'No open maintenance items.';
   }
   setTimeout(()=>{pendingMaintenanceResolve='';document.getElementById('maintenanceResolvePanel').hidden=true;b.disabled=false;b.textContent='✓ MARK RESOLVED'},800);
 }catch(err){
   // A transport error can arrive after Apps Script has already committed the completion.
   // Do not invite a duplicate write/photo upload. Verify the board before allowing another click.
   msg.textContent='Checking saved status…';
   try{
     relayCacheClear_('maintenance:');
     const check=await apiPost({action:'getMaintenanceBoard',sessionId:localStorage.getItem('relaySessionId'),businessDate:housekeepingBusinessDate(),worker:currentUser.name},20000);
     const stillOpen=(check.maintenanceIssues||[]).some(x=>x.maintenance_id===pendingMaintenanceResolve);
     if(check.ok&&!stillOpen){
       msg.textContent='✓ Maintenance resolved • saved';
       if(card){
         const wasP1=card.classList.contains('p1'),wasP2=card.classList.contains('p2');card.remove();
         const counter=document.getElementById(wasP1?'maintP1':wasP2?'maintP2':'maintP3');
         if(counter)counter.textContent=Math.max(0,Number(counter.textContent||0)-1);
         const remaining=document.querySelectorAll('#maintenanceQueue .maint-card').length,status=document.getElementById('maintenanceStatus');
         if(status)status.textContent=remaining?remaining+' open maintenance item'+(remaining===1?'':'s')+'.':'No open maintenance items.';
       }
       setTimeout(()=>{pendingMaintenanceResolve='';document.getElementById('maintenanceResolvePanel').hidden=true;b.disabled=false;b.textContent='✓ MARK RESOLVED'},800);
       return;
     }
   }catch(_){}
   b.disabled=false;b.textContent='✓ MARK RESOLVED';msg.textContent='Could not confirm completion: '+err.message+'. The item is still open; retry is safe.';
 }
});

const maintenanceLogPanel=document.getElementById('maintenanceLogPanel');
const logMaintenanceQuick=document.getElementById('logMaintenanceQuick');if(logMaintenanceQuick)logMaintenanceQuick.addEventListener('click',()=>{home.hidden=true;maintenanceLogPanel.hidden=false});
document.getElementById('closeMaintenanceLog').addEventListener('click',()=>{maintenanceLogPanel.hidden=true;home.hidden=false});
document.getElementById('maintLocationType').addEventListener('change',e=>{const room=e.target.value==='GUEST_ROOM',area=e.target.value==='PUBLIC_AREA';document.getElementById('maintRoomWrap').hidden=!room;document.getElementById('maintAreaWrap').hidden=!area;document.getElementById('maintSpecificWrap').hidden=!area});

document.getElementById('submitMaintenanceLog').addEventListener('click',async()=>{
 const btn=document.getElementById('submitMaintenanceLog'),type=document.getElementById('maintLocationType').value,
 room=document.getElementById('maintRoomNumber').value.trim(),area=document.getElementById('maintArea').value,
 specific=document.getElementById('maintSpecificLocation').value.trim(),description=document.getElementById('maintDescription').value.trim(),
 guest=document.querySelector('input[name="guestReported"]:checked')?.value||'',urgent=document.getElementById('maintUrgent').checked,
 file=document.getElementById('maintGeneralPhoto').files[0],msg=document.getElementById('maintenanceLogMessage');
 if(!type||!description||!guest||(type==='GUEST_ROOM'&&!room)||(type==='PUBLIC_AREA'&&!area)){msg.textContent='Complete the required fields first.';return}
 btn.disabled=true;btn.textContent='SUBMITTING…';msg.textContent='';
 try{
   let photoBase64='',photoMimeType='';
   if(file){photoBase64=await fileToDataUrl(file);photoMimeType=file.type||'image/jpeg'}
   const r=await apiPost({action:'logMaintenance',propertyId:'CO534',businessDate:housekeepingBusinessDate(),reportedBy:currentUser.name,locationType:type,room:room,area:area,specificLocation:specific,description:description,guestReported:guest,urgent:urgent,photoBase64:photoBase64,photoMimeType:photoMimeType},30000);
   if(!r.ok)throw new Error(r.reason||r.error||'Submit failed');
   msg.textContent='✓ Maintenance submitted • '+(r.priority==='P1_GUEST_IMPACT'?'P1 GUEST IMPACT':'P3 ROUTINE')+(r.urgent?' • IMMEDIATE ATTENTION':'');
   btn.textContent='SUBMITTED';
   setTimeout(()=>{maintenanceLogPanel.querySelectorAll('input[type=text],input[inputmode],textarea').forEach(x=>x.value='');maintenanceLogPanel.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(x=>x.checked=false);document.getElementById('maintLocationType').value='';document.getElementById('maintArea').value='';document.getElementById('maintGeneralPhoto').value='';document.getElementById('maintRoomWrap').hidden=true;document.getElementById('maintAreaWrap').hidden=true;document.getElementById('maintSpecificWrap').hidden=true;btn.disabled=false;btn.textContent='SUBMIT MAINTENANCE'},1000);
 }catch(err){btn.disabled=false;btn.textContent='SUBMIT MAINTENANCE';msg.textContent='Could not submit: '+err.message}
});

function notificationAllowed(n){
 const roles=currentUser?.roles||[];
 if(n.audience==='MANAGER_INSPECTOR')return roles.includes('MANAGER')||roles.includes('INSPECTOR');
 if(n.audience==='MANAGER_MAINTENANCE')return roles.includes('MANAGER')||roles.includes('MAINTENANCE');
 return false;
}
async function loadNotifications(){
 try{
  const state=await apiPost({action:'getToday',businessDate:housekeepingBusinessDate()});
  const items=(state.notifications||[]).filter(notificationAllowed);
  const count=document.getElementById('notificationCount');count.textContent=items.length;count.hidden=!items.length;
  document.getElementById('notificationList').innerHTML=items.length?items.slice().reverse().map(n=>'<button type="button" class="notification-item notification-link" data-event="'+n.event_type+'"><strong>'+n.message+'</strong><small>'+n.created_at+'</small></button>').join(''):'<p>No new notifications.</p>';
 }catch(e){console.error('Notification load failed',e)}
}
document.getElementById('notificationBell').addEventListener('click',async()=>{await loadNotifications();home.hidden=true;housekeepingView.hidden=true;inspectionView.hidden=true;maintenanceView.hidden=true;placeholder.hidden=true;document.getElementById('notificationPanel').hidden=false});
document.getElementById('closeNotifications').addEventListener('click',()=>{document.getElementById('notificationPanel').hidden=true;home.hidden=false});
// Notifications load on demand when the bell is opened; do not compete with role startup reads.

document.getElementById('notificationList').addEventListener('click',e=>{
 const b=e.target.closest('.notification-link');if(!b)return;
 document.getElementById('notificationPanel').hidden=true;
 if(b.dataset.event==='ROOM_READY_FOR_INSPECTION'){show('Inspections');return}
 if(b.dataset.event==='PRIORITY_MAINTENANCE'){show('Maintenance');return}
 home.hidden=false;
});

const CHECKLISTS={
 AM:[
 ['Start AM Shift','Review overnight handoff, open follow-ups, priority maintenance and current room status.'],
 ['Log into Choice','Personal login; confirm previous associate is logged out.'],
 ['Review Hotel Quick Stats','Arrivals, departures, occupancy and rooms available to sell.'],
 ['Review In-House Guests','Review In-House List and complete bucket verification.'],
 ['Review Credit Warning Checklist','Address declined or failed cards and unresolved payment issues.'],
 ['Review No-Shows & Fees','Verify prior-night no-shows and proper no-show fee posting.'],
 ['Review Departures & Billing','Verify proper billing, routing and applicable fees before checkout.'],
 ['Recognize Choice Rewards','Identify arriving Choice Rewards / VIP guests and special attention needs.'],
 ['Prepare VIP / Recognition Bags','Prepare applicable bags for placement after successful room inspection.'],
 ['Housekeeping Setup','Build/verify assignments, sync to RELAY and confirm My Board.'],
 ['Review OOO/OOS & Maintenance','Verify Choice room status against P1/P2 maintenance and room holds.'],
 ['Check Due-Outs After Checkout Time','Verify actual departures; extend or check out as needed.'],
 ['Review CRS Notifications','Correct failed sync items and document unresolved exceptions.'],
 ['Prepare Today’s Arrivals','Assign rooms, review requests and prepare for early arrivals.'],
 ['Hotel Laundry','Keep loads moving, fold/process linen, separate dirty rags and document handoff status.'],
 ['Public Restrooms','Maintain two-hour checks, cleaning log, supplies, trash and maintenance reporting.'],
 ['Guest Laundry & Public Areas','Walk public areas, address cleanliness and log maintenance issues.'],
 ['Log Maintenance as Needed','Guest Reported YES/NO, immediate attention when warranted, photo optional.'],
 ['AM → PM Handoff','Review unfinished items, unresolved P1/P2, rooms and follow-ups.'],
 ['Review Open Follow-Ups','Resolve what can be resolved; unresolved notes carry into PM.'],
 ['Complete AM Shift','Submit checklist, exceptions and notes; log out of Choice.']
 ],
 PM:[
 ['Start PM Shift','Review AM completion, carryovers, priority maintenance and room status.'],
 ['Log into Choice','Personal login; confirm previous associate is logged out.'],
 ['Review Hotel Quick Stats','Occupancy, remaining arrivals/departures and rooms to sell.'],
 ['Review Credit Warning Checklist','Address declined/failed cards; unresolved items become follow-ups.'],
 ['Review CRS Notifications','Correct sync issues and document unresolved exceptions.'],
 ['Review Remaining Arrivals','Finish assignments, special requests, Choice Rewards and VIP bags.'],
 ['90%+ Occupancy — Compset Outreach','At 90%+ call official CO534 compset; below 90% mark N/A.'],
 ['Housekeeping Closeout','Before HK leaves, account for cleaning, inspection, rework, holds and incomplete rooms.'],
 ['Review Inspection Queue','Get remaining inspections completed when possible; carry unresolved rooms forward.'],
 ['Review Maintenance','Review P1, P2 and Immediate Attention items and room holds.'],
 ['Hotel Laundry','Keep washers/dryers moving, fold/process linen and record handoff status.'],
 ['Public Restrooms','Continue two-hour checks, cleaning log, restocking and maintenance reporting.'],
 ['Guest Laundry & Public Areas','Walk lobby/public areas, address cleanliness and log issues.'],
 ['Log Maintenance as Needed','Guest Reported YES/NO, immediate attention when warranted, photo optional.'],
 ['8:00 PM — Call All Remaining Arrivals','Confirm arrival, approximate time and document Audit follow-up.'],
 ['In-House / Bucket Verification','Verify guest, room, rate and applicable billing information.'],
 ['Prepare for Night Audit','Review arrivals, billing, guest concerns, maintenance and room discrepancies.'],
 ['Add / Review Shift Notes','Informational, Issue or Follow-Up Needed.'],
 ['Review PM Checklist','Completion percentage; incomplete tasks require exception note.'],
 ['Review Open Follow-Ups','Resolve or explicitly carry remaining items into Audit.'],
 ['Complete PM Shift','Submit checklist, notes and carryovers; log out of Choice.']
 ],
 AUDIT:[
 ['Start Audit Shift','Review PM completion, carryovers, maintenance, room status and laundry handoff.'],
 ['Log into Choice','Personal login; confirm previous associate is logged out.'],
 ['Review Hotel Quick Stats','Occupancy, remaining arrivals, due-outs and rooms to sell.'],
 ['Review Remaining Unarrived Guests','Use PM 8 PM call notes and attempt additional contact as appropriate.'],
 ['Review Credit Warning Checklist','Address unsecured payment issues; carry unresolved items to AM.'],
 ['Review CRS Notifications','Correct sync issues and document unresolved items.'],
 ['In-House / Bucket Verification','Verify guest name, room, rate and billing/routing as appropriate.'],
 ['Review Hotel Journal Summary','Review Hotel Journal Summary/Detail and investigate exceptions.'],
 ['Verify Credit Card Batch','Reconcile appropriate card totals and close/settle per current procedure.'],
 ['Final Room Status Review','Review inspection, rework, maintenance holds and dirty/incomplete rooms.'],
 ['Review Maintenance','Review P1, P2, Immediate Attention and relevant open P3 work.'],
 ['Hotel Laundry','Keep loads moving, fold/process linen and prepare clean linen for morning HK.'],
 ['Public Restrooms','Continue checks, cleaning log, restocking and maintenance reporting.'],
 ['Guest Laundry & Public Areas','Walk public areas and address cleanliness / maintenance.'],
 ['Log Maintenance as Needed','Guest Reported YES/NO, immediate attention when warranted, photo optional.'],
 ['PRINT In-House List','Physical print required — sorted by room number.'],
 ['PRINT Arrivals List','Physical print required by Choice.'],
 ['PRINT Vacant Room List','Physical print required by Choice.'],
 ['Run Night Audit / End of Day','Complete Choice Night Audit and verify successful completion.'],
 ['Close RELAY Business Day','Compile operational day and carry unresolved follow-ups into AM.'],
 ['Complete Audit Shift','Submit checklist, exceptions, notes and laundry status; log out of Choice.']
 ],
 MAINTENANCE:[
 ['Start Maintenance Shift','Review carryover notes, P1/P2/P3 queue and room holds.'],
 ['Complete Assigned PM Rooms','Complete scheduled preventive-maintenance rooms and log deficiencies.'],
 ['Help Housekeeping Strip Rooms','Support priority room turns with linen/trash removal as needed.'],
 ['Full Exterior Property Walk','Parking, entrances, sidewalks, dumpster, pet area, EV, landscaping, lighting and exterior.'],
 ['Full Interior Property Walk','Lobby, halls, stairs, elevators, restrooms, laundry, fitness, HK and mechanical areas.'],
 ['Life-Safety / Building Awareness','Visual check of fire panel, exits, elevators, mechanical areas, leaks/noises/hazards.'],
 ['Work Maintenance Queue','P1 first, P2 second, P3 as workload permits; document completion.'],
 ['Housekeeping / Laundry Support','Respond to HK needs and support laundry operations when necessary.'],
 ['Maintenance Shop / Equipment','Organize tools, charge batteries, check supplies and store chemicals correctly.'],
 ['End-of-Shift Property Check','Light second walk; verify unresolved P1/P2 and room holds.'],
 ['Maintenance Shift Notes','Document informational items, issues and follow-ups.'],
 ['Complete Maintenance Shift','Account for PM rooms, walks, queue, exceptions and follow-ups.']
 ]
};
let activeChecklist='',taskState={},activeNoteType='';
function openChecklistHub(){
 document.getElementById('checklistDetail').hidden=true;document.querySelector('.checklist-layout').hidden=false;document.querySelector('.checklist-kpis').hidden=false;document.querySelector('.checklist-hero').hidden=false;syncChecklistProgress();loadOpenShiftNotes_();
}
function openChecklist(name){
 activeChecklist=name;const list=CHECKLISTS[name]||[];document.querySelector('.checklist-layout').hidden=true;document.querySelector('.checklist-kpis').hidden=true;document.querySelector('.checklist-hero').hidden=true;document.getElementById('checklistDetail').hidden=false;
 const titles={AM:['FRONT DESK • AM','AM / 1st Shift','7 AM — 3 PM'],PM:['FRONT DESK • PM','PM / 2nd Shift','3 PM — 11 PM'],AUDIT:['FRONT DESK • NIGHT AUDIT','Night Audit','11 PM — 7 AM'],MAINTENANCE:['ENGINEERING • DAILY','Maintenance Daily','Property operations']};
 const t=titles[name];document.getElementById('detailEyebrow').textContent=t[0];document.getElementById('detailTitle').textContent=t[1];document.getElementById('detailSubtitle').textContent=t[2]+' • '+list.length+' tasks';
 renderChecklist();
}
function renderChecklist(){
 const list=CHECKLISTS[activeChecklist]||[],state=taskState[activeChecklist]||(taskState[activeChecklist]={});
 document.getElementById('checklistTasks').innerHTML=list.map((x,i)=>'<article class="check-task '+(state[i]?'done':'')+'"><button type="button" class="task-check" data-i="'+i+'">'+(state[i]?'✓':'')+'</button><div><h4>'+(i+1)+'. '+x[0]+'</h4><p>'+x[1]+'</p></div><button type="button" class="task-exception" data-i="'+i+'">EXCEPTION</button></article>').join('');
 const done=Object.values(state).filter(Boolean).length,pct=list.length?Math.round(done/list.length*100):0;document.getElementById('detailPercent').textContent=pct+'%';syncChecklistProgress();
}
function syncChecklistProgress(){
 const order=['AM','PM','AUDIT','MAINTENANCE'];
 const kpis=[...document.querySelectorAll('.checklist-kpis article')];
 order.forEach((name,i)=>{
  const list=CHECKLISTS[name]||[],state=taskState[name]||{},done=Object.values(state).filter(Boolean).length,pct=list.length?Math.round(done/list.length*100):0;
  const k=kpis[i];if(k){k.querySelector('strong').textContent=pct+'%';k.querySelector('em').textContent=done?(done+' of '+list.length+' complete'):'Not started'}
  document.querySelectorAll('.rr-shift-card[data-shift-open="'+name+'"]').forEach(card=>{card.querySelector('.rr-dial strong').textContent=pct+'%';card.querySelector('.rr-dial em').textContent=done?(done+' / '+list.length+' COMPLETE'):'NOT STARTED'});
 });
}
document.querySelectorAll('.shift-card,.maintenance-check-card').forEach(b=>b.addEventListener('click',()=>openChecklist(b.dataset.shift)));
document.getElementById('backToChecklists').addEventListener('click',openChecklistHub);
document.getElementById('checklistTasks').addEventListener('click',e=>{const b=e.target.closest('.task-check');if(!b)return;const s=taskState[activeChecklist]||(taskState[activeChecklist]={});s[b.dataset.i]=!s[b.dataset.i];renderChecklist()});
function openShiftNote(){document.getElementById('shiftNotePanel').hidden=false;activeNoteType='';document.querySelectorAll('.note-types button').forEach(x=>x.classList.remove('selected'));document.getElementById('shiftNoteMessage').textContent=''}
document.getElementById('addShiftNote').addEventListener('click',openShiftNote);document.getElementById('addChecklistNote').addEventListener('click',openShiftNote);document.getElementById('closeShiftNote').addEventListener('click',()=>document.getElementById('shiftNotePanel').hidden=true);
document.querySelectorAll('.note-types button').forEach(b=>b.addEventListener('click',()=>{activeNoteType=b.dataset.noteType;document.querySelectorAll('.note-types button').forEach(x=>x.classList.toggle('selected',x===b))}));
document.getElementById('saveShiftNote').addEventListener('click',async()=>{
 const issue=document.getElementById('shiftNoteIssue').value.trim(),solution=document.getElementById('shiftNoteSolution').value.trim(),followUp=document.getElementById('shiftNoteFollowup').value.trim(),msg=document.getElementById('shiftNoteMessage');
 if(!activeNoteType||!issue){msg.textContent='Choose a note type and enter the issue/information.';return}
 msg.textContent='Saving…';
 try{const r=await apiPost({action:'saveShiftNote',sessionId:localStorage.getItem('relaySessionId'),businessDate:housekeepingBusinessDate(),shift:activeChecklist||'GENERAL',noteType:activeNoteType,issueInformation:issue,solutionAction:solution,followUp});
 if(!r.ok)throw new Error(r.reason||r.error||'Save failed');msg.textContent='✓ Shift note saved.';setTimeout(async()=>{document.getElementById('shiftNotePanel').hidden=true;document.getElementById('shiftNoteIssue').value='';document.getElementById('shiftNoteSolution').value='';document.getElementById('shiftNoteFollowup').value='';activeNoteType='';document.querySelectorAll('.note-types button').forEach(x=>x.classList.remove('selected'));await loadOpenShiftNotes_();refreshDashboardOps()},450)}catch(err){msg.textContent='Save failed: '+err.message}
});
document.getElementById('completeShift').addEventListener('click',async()=>{
 const list=CHECKLISTS[activeChecklist]||[],state=taskState[activeChecklist]||{},done=Object.values(state).filter(Boolean).length;
 if(done<list.length&&!confirm('This checklist is '+done+' of '+list.length+' complete. Complete the shift anyway?'))return;
 const r=await apiPost({action:'completeChecklistShift',sessionId:localStorage.getItem('relaySessionId'),businessDate:housekeepingBusinessDate(),shift:activeChecklist,tasks:list.map((x,i)=>({taskIndex:i,taskName:x[0],status:state[i]?'COMPLETE':'INCOMPLETE'}))});
 if(!r.ok){alert('Shift could not be saved: '+(r.reason||r.error||'Unknown error'));return}alert('✓ '+activeChecklist+' shift saved to RELAY.');openChecklistHub();
});
document.getElementById('checklistDate').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

document.querySelectorAll('.rr-command-strip [data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));

document.querySelectorAll('[data-shift-open]').forEach(b=>b.addEventListener('click',()=>{show('Checklists');setTimeout(()=>openChecklist(b.dataset.shiftOpen),0)}));
['dashLogMaintenance','rrFloatMaintenance'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{home.hidden=true;maintenanceLogPanel.hidden=false}));
document.getElementById('dashAddShiftNote')?.addEventListener('click',()=>{show('Checklists');setTimeout(openShiftNote,0)});
document.querySelectorAll('.rr-dashboard [data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
async function refreshDashboardOps(){
 try{
  const day=housekeepingBusinessDate(),stateKey='dashboard:today:'+day,shiftKey='dashboard:shift:'+day;
  let state=relayCached_(stateKey),handoff=relayCached_(shiftKey);
  if(!state||!handoff){
   const results=await Promise.all([
    state?Promise.resolve(state):apiPost({action:'getToday',businessDate:day}),
    handoff?Promise.resolve(handoff):(currentUser?apiPost({action:'getShiftOperations',sessionId:localStorage.getItem('relaySessionId'),businessDate:day,shift:''}):Promise.resolve({ok:false}))
   ]);
   state=state||relayCacheSet_(stateKey,results[0]);handoff=handoff||relayCacheSet_(shiftKey,results[1]);
  }
  const ready=(state.cleaningSessions||[]).filter(x=>x.status==='READY_FOR_INSPECTION').length;
  const open=(state.maintenanceIssues||[]).filter(x=>x.status==='OPEN').length;
  const openNotes=handoff.ok?(handoff.openNotes||handoff.shiftNotes||[]).filter(n=>['ISSUE','FOLLOWUP','FOLLOW_UP'].includes(String(n.noteType||n.note_type||'').toUpperCase())&&String(n.status||'OPEN').toUpperCase()==='OPEN'):[];
  const followups=openNotes.filter(n=>String(n.noteType||n.note_type||'').toUpperCase().includes('FOLLOW')).length;
  const issues=openNotes.filter(n=>String(n.noteType||n.note_type||'').toUpperCase()==='ISSUE').length;
  const a=document.getElementById('dashInspectionCount'),m=document.getElementById('dashMaintenanceCount'),n=document.getElementById('dashNotificationCount');
  if(a)a.textContent=ready;if(m)m.textContent=open;if(n)n.textContent=followups+issues;
  document.querySelectorAll('.rr-handoff-row').forEach(row=>{const label=(row.textContent||'').toLowerCase(),bubble=row.querySelector('b,span');if(!bubble)return;if(label.includes('open follow'))bubble.textContent=followups;if(label.includes('awaiting resolution'))bubble.textContent=issues});
 }catch(e){console.warn('Dashboard KPI refresh failed',e)}
}
setTimeout(()=>{if(currentUser)refreshDashboardOps()},1500);

/* RELAY navigation — single delegated router */
document.addEventListener('click',function(e){
 const b=e.target.closest('[data-view]');
 if(!b||!b.dataset.view)return;
 e.preventDefault();show(b.dataset.view);
});

let hkMaintenanceRoom='';
document.addEventListener('click',e=>{
 const b=e.target.closest('.hk-context-maint');if(!b)return;
 e.preventDefault();e.stopPropagation();
 hkMaintenanceRoom=b.dataset.room;
 const panel=document.getElementById('hkRoomMaintenancePanel');
 document.getElementById('hkMaintRoom').textContent=hkMaintenanceRoom;document.getElementById('hkRoomMaintenanceTitle').textContent='Report Maintenance • Room '+hkMaintenanceRoom;
 document.getElementById('hkMaintDescription').value='';document.getElementById('hkMaintUrgent').checked=false;document.getElementById('hkMaintPhoto').value='';document.querySelectorAll('input[name="hkGuestReported"]').forEach(x=>x.checked=false);document.getElementById('hkRoomMaintenanceMessage').textContent='';
 panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});
},true);
document.getElementById('closeHkRoomMaintenance').addEventListener('click',()=>{document.getElementById('hkRoomMaintenancePanel').hidden=true;hkMaintenanceRoom=''});
document.getElementById('submitHkRoomMaintenance').addEventListener('click',async()=>{
 const btn=document.getElementById('submitHkRoomMaintenance'),msg=document.getElementById('hkRoomMaintenanceMessage'),guest=document.querySelector('input[name="hkGuestReported"]:checked')?.value||'',desc=document.getElementById('hkMaintDescription').value.trim(),urgent=document.getElementById('hkMaintUrgent').checked,file=document.getElementById('hkMaintPhoto').files[0];
 if(!hkMaintenanceRoom||!guest||!desc){msg.textContent='Choose Guest Reported Yes/No and describe the issue.';return}
 btn.disabled=true;btn.textContent='SUBMITTING…';
 try{
  let photoBase64='',photoMimeType='';if(file){photoBase64=await fileToDataUrl(file);photoMimeType=file.type||'image/jpeg'}
  const r=await apiPost({action:'logMaintenance',propertyId:'CO534',businessDate:housekeepingBusinessDate(),locationType:'GUEST_ROOM',room:hkMaintenanceRoom,guestReported:guest,description:desc,urgent:urgent,reportedBy:currentUser.name,photoBase64,photoMimeType},30000);
  if(!r.ok)throw new Error(r.reason||r.error||'Submission failed');
  msg.textContent='✓ Maintenance submitted • '+String(r.priority||'').replaceAll('_',' ');
  setTimeout(()=>{document.getElementById('hkRoomMaintenancePanel').hidden=true;hkMaintenanceRoom='';btn.disabled=false;btn.textContent='SUBMIT MAINTENANCE'},900);
 }catch(err){btn.disabled=false;btn.textContent='SUBMIT MAINTENANCE';msg.textContent='Could not submit: '+err.message}
});

window.openHkMaintenanceForRoom=function(room){
 hkMaintenanceRoom=String(room||'');
 const panel=document.getElementById('hkRoomMaintenancePanel');
 if(!panel)return alert('Maintenance form unavailable. Refresh and try again.');
 document.getElementById('hkMaintRoom').textContent=hkMaintenanceRoom;
 document.getElementById('hkRoomMaintenanceTitle').textContent='Report Maintenance • Room '+hkMaintenanceRoom;
 document.getElementById('hkMaintDescription').value='';document.getElementById('hkMaintUrgent').checked=false;document.getElementById('hkMaintPhoto').value='';
 document.querySelectorAll('input[name="hkGuestReported"]').forEach(x=>x.checked=false);
 document.getElementById('hkRoomMaintenanceMessage').textContent='';
 housekeepingView.hidden=true;panel.hidden=false;panel.scrollIntoView({block:'start'});
};


document.getElementById('togglePassword').addEventListener('click',()=>{const p=document.getElementById('loginPassword');p.type=p.type==='password'?'text':'password'});
document.getElementById('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const username=document.getElementById('loginUsername').value.trim().toLowerCase();
 const password=document.getElementById('loginPassword').value;
 const msg=document.getElementById('loginMessage'),btn=document.getElementById('loginSubmit');
 if(!username||!password){msg.textContent='Enter your username and password.';return}
 btn.disabled=true;btn.textContent='SIGNING IN…';msg.textContent='';
 try{
  const r=await apiPost({action:'authLogin',username,password},20000)
  if(!r.ok||!r.user){msg.textContent=r.reason==='ACCOUNT_INACTIVE'?'This RELAY account is inactive.':'Username or password is incorrect.';return}
  localStorage.setItem('relaySessionId',r.sessionId);
  activateUser(normalizeAuthUser_(r.user));
  document.getElementById('loginPassword').value='';
 }catch(err){msg.textContent='RELAY authentication is temporarily unavailable. Tap SIGN IN once more.';console.error(err)}
 finally{btn.disabled=false;btn.textContent='SIGN IN TO RELAY OPERATIONS'}
});

document.getElementById('appRefresh')?.addEventListener('click',async()=>{
 const b=document.getElementById('appRefresh');if(!currentUser)return;
 b.disabled=true;b.firstChild.textContent='⟳ ';
 try{
  if(!housekeepingView.hidden)await loadHousekeepingBoard();
  else if(!inspectionView.hidden)await loadInspectionQueue();
  else if(!maintenanceView.hidden)await loadMaintenanceBoard();
  else await refreshDashboardOps();
 }finally{b.disabled=false;b.firstChild.textContent='↻ '}
});

/* RELAY interaction router: one capture-level path for dynamic operational controls */
document.addEventListener('click',function(e){
 const shift=e.target.closest('.shift-card,.maintenance-check-card,[data-shift-open]');
 if(shift){
  e.preventDefault();e.stopImmediatePropagation();
  const name=shift.dataset.shift||shift.dataset.shiftOpen;
  if(name){show('Checklists');openChecklist(name)}
  return;
 }
 const task=e.target.closest('.task-check');
 if(task){
  e.preventDefault();e.stopImmediatePropagation();
  const state=taskState[activeChecklist]||(taskState[activeChecklist]={});
  state[task.dataset.i]=!state[task.dataset.i];renderChecklist();return;
 }
 const resolve=e.target.closest('.maint-resolve');
 if(resolve){
  e.preventDefault();e.stopImmediatePropagation();
  pendingMaintenanceResolve=resolve.dataset.id;
  const card=resolve.closest('.maint-card');
  document.getElementById('maintenanceResolveTitle').textContent='Resolve '+(card?.querySelector('.maint-room')?.textContent||'Maintenance');
  document.getElementById('maintenanceResolvePhoto').value='';document.getElementById('maintenanceResolveNote').value='';document.getElementById('maintenanceResolveMessage').textContent='';
  document.getElementById('maintenanceResolvePanel').hidden=false;
  document.getElementById('maintenanceResolvePanel').scrollIntoView({block:'start'});return;
 }
 const photo=e.target.closest('.maint-photo');
 if(photo){e.preventDefault();e.stopImmediatePropagation();window.open('https://drive.google.com/open?id='+photo.dataset.photo,'_blank');return}
},true);

/* RELAY critical controls v2 */
document.addEventListener('click',async function(e){
 const refresh=e.target.closest('#appRefresh');
 if(refresh){
  e.preventDefault();e.stopImmediatePropagation();
  if(window.rrRefreshCurrent)await window.rrRefreshCurrent();
  return;
 }
 const note=e.target.closest('#dashAddShiftNote,#addShiftNote,#addChecklistNote');
 if(note){
  e.preventDefault();e.stopImmediatePropagation();
  show('Checklists');
  openShiftNote();
  const panel=document.getElementById('shiftNotePanel');
  panel.hidden=false;panel.scrollIntoView({block:'start'});
  return;
 }
},true);

/* RELAY refresh v3 — refresh current workspace without re-authentication */
window.rrRefreshCurrent=async function(){
 const b=document.getElementById('appRefresh');if(!currentUser)return;
 if(b){b.disabled=true;b.innerHTML='⟳ <span>REFRESHING</span>'}
 try{
  // Manual REFRESH remains authoritative, but only reloads the workspace the user is actually viewing.
  // This avoids simultaneous Sheets requests competing with each other and timing out.
  relayCacheClear_();relayBusinessDate='';relayBusinessDayLoadedAt=0;
  await loadRelayBusinessDay_(true);
  if(!housekeepingView.hidden)await loadHousekeepingBoard();
  else if(!inspectionView.hidden)await loadInspectionQueue();
  else if(!maintenanceView.hidden)await loadMaintenanceBoard();
  else if(!checklistsView.hidden){renderChecklist();await loadOpenShiftNotes_()}
  else await refreshDashboardOps();
 }catch(err){console.error('RELAY refresh failed',err);alert('Refresh failed: '+err.message)}
 finally{if(b){b.disabled=false;b.innerHTML='↻ <span>REFRESH</span>'}}
}

let activeExceptionIndex=null,activeExceptionType='',exceptionState={};
document.addEventListener('click',e=>{
 const b=e.target.closest('.task-exception');if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 activeExceptionIndex=Number(b.dataset.i);activeExceptionType='';
 const task=(CHECKLISTS[activeChecklist]||[])[activeExceptionIndex];
 document.getElementById('exceptionTitle').textContent=(task?task[0]:'Task')+' • Exception';
 document.getElementById('exceptionNote').value='';document.getElementById('exceptionMessage').textContent='';
 document.querySelectorAll('[data-exception-type]').forEach(x=>x.classList.remove('selected'));
 document.getElementById('exceptionPanel').hidden=false;document.getElementById('exceptionPanel').scrollIntoView({block:'start'});
},true);
document.querySelectorAll('[data-exception-type]').forEach(b=>b.addEventListener('click',()=>{activeExceptionType=b.dataset.exceptionType;document.querySelectorAll('[data-exception-type]').forEach(x=>x.classList.toggle('selected',x===b))}));
function closeException_(){activeExceptionIndex=null;activeExceptionType='';document.getElementById('exceptionNote').value='';document.getElementById('exceptionMessage').textContent='';document.querySelectorAll('[data-exception-type]').forEach(x=>x.classList.remove('selected'));document.getElementById('exceptionPanel').hidden=true}
document.getElementById('closeException').addEventListener('click',closeException_);
document.getElementById('saveException').addEventListener('click',()=>{
 const note=document.getElementById('exceptionNote').value.trim(),msg=document.getElementById('exceptionMessage');
 if(activeExceptionIndex===null||!activeExceptionType||!note){msg.textContent='Choose N/A, Issue, or Follow-Up and enter a note.';return}
 const key=activeChecklist+':'+activeExceptionIndex;exceptionState[key]={type:activeExceptionType,note};
 if(activeExceptionType==='NA'){const state=taskState[activeChecklist]||(taskState[activeChecklist]={});state[activeExceptionIndex]=true}
 msg.textContent='✓ Exception recorded.';renderChecklist();syncChecklistProgress();
 setTimeout(closeException_,650);
});

const ROOM_PM_TASKS=[
 ['PTAC Filter','Clean/inspect filter and grille.'],
 ['PTAC Coils','Brush/vacuum evaporator and condenser coils; inspect condensate/drain.'],
 ['PTAC Operation','Verify heat, cool, fan and thermostat operation.'],
 ['Bathroom Exhaust Fan','Clean grille and fan buildup; verify airflow/noise.'],
 ['Bathroom Plumbing','Inspect toilet, supply lines, shutoffs, faucet, shower head and drains for leaks.'],
 ['Caulk / Grout','Inspect tub/shower, vanity and backsplash; repair failed caulk/grout.'],
 ['Paint / Patchwork','Touch up walls, corners, doors/frames and patch dings/holes.'],
 ['Microwave Vent','Clean vent/filter and verify microwave operation.'],
 ['Cooktop / Kitchen','Verify cooktop controls, sink, faucet, drains and cabinetry.'],
 ['Refrigerator','Pull out; inspect behind/under unit, water connection/supply line and visible damage/leaks.'],
 ['Dishwasher','Run/inspect operation, door seal, drain and visible connections for leaks.'],
 ['Furniture / Hardware','Tighten furniture, cabinet hardware, headboard, closet and room fixtures.'],
 ['Electrical / Lighting','Test lights, switches, outlets/USB and GFCI where applicable.'],
 ['Windows / Shades','Operate shade, inspect track/hardware, window lock and condition.'],
 ['Entry Door / Security','Check closer, latch, deadbolt, security latch, peephole, seals and room signage.'],
 ['TV / Remote','Verify TV, remote, input and visible cabling.'],
 ['Flooring / Baseboards','Inspect flooring, baseboards, transitions and damage.'],
 ['Moisture / Pest / Ceiling','Check water staining, moisture, odors and pest evidence.'],
 ['Final Room Condition','Confirm room is safe, functional and ready; create work orders for unresolved items.']
];
let pmRoom='',pmState={};
function renderPmTasks(){
 const box=document.getElementById('pmTasks'),state=pmState[pmRoom]||(pmState[pmRoom]={});
 box.innerHTML=ROOM_PM_TASKS.map((t,i)=>'<article class="pm-task '+(state[i]?.status==='PASS'||state[i]?.status==='CORRECTED'?'done':'')+'"><button type="button" class="pm-task-check" data-pm-i="'+i+'">'+(state[i]?'✓':'')+'</button><div><h4>'+(i+1)+'. '+t[0]+'</h4><p>'+t[1]+'</p></div><select data-pm-status="'+i+'"><option value="">STATUS…</option><option value="PASS">✓ PASS</option><option value="CORRECTED">🔧 CORRECTED DURING PM</option><option value="WORK_ORDER">⚠ WORK ORDER NEEDED</option><option value="NA">N/A</option></select></article>').join('');
 const done=Object.keys(state).length,pct=Math.round(done/ROOM_PM_TASKS.length*100);document.getElementById('pmPercent').textContent=pct+'%';
}
document.addEventListener('click',e=>{
 const row=e.target.closest('.pm-room-row');if(row){pmRoom=row.dataset.pmRoom;document.getElementById('pmCalendar').hidden=true;document.getElementById('pmRoomDetail').hidden=false;document.getElementById('pmRoomTitle').textContent='Room '+pmRoom;renderPmTasks();return}
 const back=e.target.closest('#pmBack');if(back){document.getElementById('pmRoomDetail').hidden=true;document.getElementById('pmCalendar').hidden=false;return}
},true);
document.getElementById('pmTasks').addEventListener('change',e=>{if(!e.target.matches('[data-pm-status]'))return;const i=e.target.dataset.pmStatus,s=pmState[pmRoom]||(pmState[pmRoom]={});if(e.target.value)s[i]={status:e.target.value};else delete s[i];renderPmTasks()});
document.getElementById('pmAddIssue').addEventListener('click',()=>{document.getElementById('maintLocationType').value='GUEST_ROOM';document.getElementById('maintRoomNumber').value=pmRoom;document.getElementById('maintRoomWrap').hidden=false;document.getElementById('maintenanceLogPanel').hidden=false;document.getElementById('pmView').hidden=true});
document.getElementById('pmComplete').addEventListener('click',()=>{const done=Object.keys(pmState[pmRoom]||{}).length;if(done<ROOM_PM_TASKS.length){alert('Complete or mark N/A on all '+ROOM_PM_TASKS.length+' PM items first.');return}alert('Room '+pmRoom+' PM complete for this test session. Database history wiring is next.')});

let relayAdminUsers=[];
async function loadUsersAdmin(){
 const box=document.getElementById('usersList');box.innerHTML='<div class="users-loading">Loading users…</div>';
 try{
  const sessionId=localStorage.getItem('relaySessionId'),r=relayCached_('users:list')||relayCacheSet_('users:list',await apiPost({action:'adminListUsers',sessionId}));
  if(!r.ok)throw new Error(r.reason||'Unable to load users');
  relayAdminUsers=r.users||[];renderUsersAdmin();
 }catch(err){box.innerHTML='<div class="users-loading">Unable to load users: '+err.message+'</div>'}
}
function renderUsersAdmin(){
 const q=(document.getElementById('userSearch').value||'').toLowerCase(),role=document.getElementById('userRoleFilter').value;
 const rows=relayAdminUsers.filter(u=>(!q||(u.name+' '+u.username).toLowerCase().includes(q))&&(!role||u.role===role));
 const active=relayAdminUsers.filter(u=>u.active);
 document.getElementById('activeUserCount').textContent=active.length;
 document.getElementById('inspectorUserCount').textContent=active.filter(u=>u.role==='INSPECTOR').length;
 document.getElementById('housekeeperUserCount').textContent=active.filter(u=>u.role==='HOUSEKEEPER').length;
 document.getElementById('maintenanceUserCount').textContent=active.filter(u=>u.role==='MAINTENANCE').length;
 document.getElementById('usersList').innerHTML=rows.length?rows.map(u=>'<article class="user-card"><div class="user-avatar">'+u.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('')+'</div><div><strong>'+u.name+'</strong><small>@'+u.username+'</small></div><div class="user-role">'+u.role+'</div><div class="user-property">'+u.propertyId+'</div><div><span class="user-status '+(u.active?'active':'')+'">'+(u.active?'● ACTIVE':'○ INACTIVE')+'</span> <button type="button" data-edit-user="'+u.userId+'">EDIT</button></div></article>').join(''):'<div class="users-loading">No users match this view.</div>';
}
function openUserPanel_(user){
 document.getElementById('userPanel').hidden=false;document.getElementById('editingUserId').value=user?.userId||'';
 document.getElementById('userPanelTitle').textContent=user?'Edit User':'Add User';document.getElementById('userName').value=user?.name||'';document.getElementById('userUsername').value=user?.username||'';document.getElementById('userUsername').disabled=!!user;document.getElementById('userRole').value=user?.role||'INSPECTOR';document.getElementById('userPassword').value='';
 document.getElementById('userPasswordWrap').hidden=!!user;document.getElementById('resetPasswordBtn').hidden=!user;document.getElementById('deactivateUserBtn').hidden=!user||!user.active;document.getElementById('userPanelMessage').textContent='';
}
document.getElementById('addUserBtn').addEventListener('click',()=>openUserPanel_(null));
document.getElementById('closeUserPanel').addEventListener('click',()=>document.getElementById('userPanel').hidden=true);
document.getElementById('userSearch').addEventListener('input',renderUsersAdmin);document.getElementById('userRoleFilter').addEventListener('change',renderUsersAdmin);
document.getElementById('usersList').addEventListener('click',e=>{const b=e.target.closest('[data-edit-user]');if(b)openUserPanel_(relayAdminUsers.find(u=>u.userId===b.dataset.editUser))});
document.getElementById('saveUserBtn').addEventListener('click',async()=>{
 const id=document.getElementById('editingUserId').value,msg=document.getElementById('userPanelMessage'),sessionId=localStorage.getItem('relaySessionId');
 const payload=id?{action:'adminUpdateUser',sessionId,userId:id,name:document.getElementById('userName').value,role:document.getElementById('userRole').value}:{action:'adminCreateUser',sessionId,name:document.getElementById('userName').value,username:document.getElementById('userUsername').value,role:document.getElementById('userRole').value,password:document.getElementById('userPassword').value,propertyId:'CO534'};
 msg.textContent='Saving…';try{const r=await apiPost(payload);if(!r.ok)throw new Error(r.reason||'Save failed');msg.textContent='✓ User saved';await loadUsersAdmin();setTimeout(()=>document.getElementById('userPanel').hidden=true,500)}catch(err){msg.textContent='Save failed: '+err.message}
});
document.getElementById('resetPasswordBtn').addEventListener('click',async()=>{
 const password=prompt('Enter a new temporary password for this user:');if(!password)return;
 const r=await apiPost({action:'adminResetPassword',sessionId:localStorage.getItem('relaySessionId'),userId:document.getElementById('editingUserId').value,password});
 document.getElementById('userPanelMessage').textContent=r.ok?'✓ Password reset':'Reset failed: '+(r.reason||'Unknown error');
});
document.getElementById('deactivateUserBtn').addEventListener('click',async()=>{
 if(!confirm('Deactivate this RELAY user? Their historical records will remain.'))return;
 const r=await apiPost({action:'adminDeactivateUser',sessionId:localStorage.getItem('relaySessionId'),userId:document.getElementById('editingUserId').value});
 document.getElementById('userPanelMessage').textContent=r.ok?'✓ User deactivated':'Deactivate failed: '+(r.reason||'Unknown error');
 if(r.ok){await loadUsersAdmin();setTimeout(()=>{document.getElementById('userPanel').hidden=true},450)}
});

const profileBtn=document.getElementById('profileBtn'),profileMenu=document.getElementById('profileMenu');
profileBtn?.addEventListener('click',e=>{e.stopPropagation();profileMenu.hidden=!profileMenu.hidden});
document.addEventListener('click',e=>{if(profileMenu&&!profileMenu.hidden&&!profileMenu.contains(e.target)&&e.target!==profileBtn)profileMenu.hidden=true});
document.getElementById('logoutBtn')?.addEventListener('click',async()=>{
 const btn=document.getElementById('logoutBtn'),sessionId=localStorage.getItem('relaySessionId');
 btn.disabled=true;btn.textContent='LOGGING OUT…';
 try{if(sessionId)await apiPost({action:'authLogout',sessionId},10000)}catch(err){console.warn('Backend logout failed; clearing local session.',err)}
 localStorage.removeItem('relaySessionId');currentUser=null;
 document.getElementById('operationsApp').hidden=true;document.getElementById('operationsApp').style.display='none';
 const login=document.getElementById('loginView');login.hidden=false;login.style.removeProperty('display');
 document.getElementById('loginUsername').value='';document.getElementById('loginPassword').value='';document.getElementById('loginMessage').textContent='';
 profileMenu.hidden=true;btn.disabled=false;btn.textContent='↪ LOG OUT';
});

function canDailyAudit_(){return !!currentUser&&currentUser.roles.some(r=>['ADMIN','FRONT DESK'].includes(r))}
function updateDailyAuditAccess_(){const b=document.getElementById('dailyAuditBtn');if(b)b.hidden=!canDailyAudit_()}
async function openDailyAudit_(){
 if(!canDailyAudit_())return;await loadRelayBusinessDay_();
 document.getElementById('dailyAuditCurrentDate').textContent=housekeepingBusinessDate();
 document.getElementById('dailyAuditConfirm').checked=false;document.getElementById('executeDailyAudit').disabled=true;document.getElementById('dailyAuditMessage').textContent='';
 document.getElementById('dailyAuditPanel').hidden=false;
}
document.getElementById('dailyAuditBtn')?.addEventListener('click',openDailyAudit_);
function exitDailyAudit_(){
 const confirmed=document.getElementById('dailyAuditConfirm')?.checked;
 if(confirmed&&!confirm('Exit Daily Audit? The business day has NOT been changed.'))return;
 document.getElementById('dailyAuditPanel').hidden=true;
 document.getElementById('dailyAuditConfirm').checked=false;
 document.getElementById('executeDailyAudit').disabled=true;
 document.getElementById('dailyAuditMessage').textContent='';
}
document.getElementById('closeDailyAudit')?.addEventListener('click',exitDailyAudit_);
document.getElementById('dailyAuditConfirm')?.addEventListener('change',e=>document.getElementById('executeDailyAudit').disabled=!e.target.checked);
document.getElementById('executeDailyAudit')?.addEventListener('click',async()=>{
 const b=document.getElementById('executeDailyAudit'),msg=document.getElementById('dailyAuditMessage');b.disabled=true;b.textContent='OPENING NEW BUSINESS DAY…';msg.textContent='';
 try{
  const r=await apiPost({action:'dailyAudit',sessionId:localStorage.getItem('relaySessionId'),expectedBusinessDate:housekeepingBusinessDate()});
  if(!r.ok)throw new Error(r.reason==='BUSINESS_DAY_CHANGED'?'Another user already changed the business day. Current day: '+r.businessDate:(r.reason||'Daily Audit failed'));
  relayBusinessDate=r.businessDate;taskState={};msg.textContent='✓ '+r.message;
  setTimeout(async()=>{document.getElementById('dailyAuditPanel').hidden=true;await refreshDashboardOps();if(!housekeepingView.hidden)await loadHousekeepingBoard()},1200);
 }catch(err){msg.textContent='Daily Audit failed: '+err.message;b.disabled=false}
 finally{b.textContent='START NEW BUSINESS DAY →'}
});

document.getElementById('exitChoiceSync')?.addEventListener('click',()=>{
 const hasWork=!!selectedPdf||!!lastParsed;
 if(hasWork&&!confirm('Exit Choice Sync? This will discard the current upload/preview. Nothing will be imported.'))return;
 selectedPdf=null;lastParsed=null;if(hkPdf)hkPdf.value='';
 previewPanel.hidden=true;validationPanel.hidden=true;comparePanel.hidden=true;importDaily.disabled=true;validateImport.disabled=true;
 if(fileStatus){fileStatus.textContent='';fileStatus.className='file-status'}
 importView.hidden=true;housekeepingView.hidden=false;loadHousekeepingBoard();
});

async function relayLogout_(){
 const sessionId=localStorage.getItem('relaySessionId');
 try{if(sessionId)await apiPost({action:'authLogout',sessionId},10000)}catch(err){console.warn('Backend logout failed; clearing local session.',err)}
 localStorage.removeItem('relaySessionId');currentUser=null;
 const app=document.getElementById('operationsApp'),login=document.getElementById('loginView');
 app.hidden=true;app.style.display='none';login.hidden=false;login.style.removeProperty('display');
 document.getElementById('loginUsername').value='';document.getElementById('loginPassword').value='';document.getElementById('loginMessage').textContent='';
}


async function loadOpenShiftNotes_(){
 const box=document.getElementById('openShiftNotes');if(!box||!currentUser)return;
 try{
  const key='shift:'+housekeepingBusinessDate()+':'+(activeChecklist||''),r=relayCached_(key)||relayCacheSet_(key,await apiPost({action:'getShiftOperations',sessionId:localStorage.getItem('relaySessionId'),businessDate:housekeepingBusinessDate(),shift:activeChecklist||''}));
  if(!r.ok)throw new Error(r.reason||r.error||'Unable to load handoff');
  const notes=(r.openNotes||r.shiftNotes||r.notes||[]).filter(n=>['ISSUE','FOLLOWUP','FOLLOW_UP'].includes(String(n.noteType||n.note_type||'').toUpperCase())&&String(n.status||'OPEN').toUpperCase()==='OPEN');
  window.relayOpenNotes_=notes;
  if(!notes.length){box.innerHTML='<div class="empty-followup"><span>↻</span><strong>No open issues or follow-ups</strong><p>Open items will remain here across shifts and business days until resolved.</p></div>';return}
  box.innerHTML=notes.map(n=>{const type=String(n.noteType||n.note_type||'').toUpperCase(),follow=type.includes('FOLLOW'),label=follow?'FOLLOW-UP NEEDED':'ISSUE',id=n.noteId||n.note_id,issue=n.issueInformation||n.issue_information||'',who=n.enteredBy||n.entered_by||'',date=n.businessDate||n.business_date||'';return '<button type="button" class="handoff-note handoff-note-button '+(follow?'followup':'issue')+'" onclick="openShiftNoteDetail_(\''+id+'\');return false;"><small>'+label+' • '+date+'</small><strong>'+issue+'</strong><span>Entered by '+who+'</span><b>VIEW ACTIVITY →</b></button>'}).join('');
 }catch(err){box.innerHTML='<div class="empty-followup"><strong>Handoff unavailable</strong><p>'+err.message+'</p></div>'}
}
async function openShiftNoteDetail_(id){
 const n=(window.relayOpenNotes_||[]).find(x=>(x.noteId||x.note_id)===id);if(!n)return;
 document.getElementById('resolveShiftNoteId').value=id;document.getElementById('resolveShiftNoteTitle').textContent=(String(n.noteType||n.note_type||'').toUpperCase().includes('FOLLOW')?'Follow-Up':'Issue')+' Detail';
 document.getElementById('resolveShiftNoteIssue').textContent=n.issueInformation||n.issue_information||'';
 document.getElementById('resolveShiftNoteUpdate').value='';document.getElementById('resolveShiftNoteText').value='';document.getElementById('resolveShiftNoteMessage').textContent='';
 document.getElementById('shiftNoteTimeline').innerHTML='<div class="timeline-loading">Loading activity…</div>';document.getElementById('resolveShiftNotePanel').hidden=false;
 try{const r=await apiPost({action:'getShiftNoteDetail',sessionId:localStorage.getItem('relaySessionId'),noteId:id});if(!r.ok)throw new Error(r.reason||r.error||'Unable to load activity');const updates=r.updates||[];document.getElementById('shiftNoteTimeline').innerHTML=updates.length?updates.map(u=>'<article><small>'+String(u.enteredAt||u.entered_at||'')+' • '+String(u.enteredBy||u.entered_by||'')+'</small><p>'+String(u.updateText||u.update_text||'')+'</p></article>').join(''):'<div class="timeline-empty">No updates yet.</div>'}catch(err){document.getElementById('shiftNoteTimeline').innerHTML='<div class="timeline-empty">'+err.message+'</div>'}
}
document.addEventListener('click',e=>{const card=e.target.closest('[data-open-note]');if(!card)return;e.preventDefault();e.stopPropagation();openShiftNoteDetail_(card.dataset.openNote)});
document.getElementById('closeResolveShiftNote')?.addEventListener('click',()=>document.getElementById('resolveShiftNotePanel').hidden=true);
document.getElementById('addShiftNoteUpdate')?.addEventListener('click',async()=>{
 const b=document.getElementById('addShiftNoteUpdate'),id=document.getElementById('resolveShiftNoteId').value,text=document.getElementById('resolveShiftNoteUpdate').value.trim(),msg=document.getElementById('resolveShiftNoteMessage');if(!text){msg.textContent='Enter an update first.';return}
 if(b.disabled)return;b.disabled=true;b.textContent='SAVING UPDATE…';msg.textContent='';
 try{const r=await apiPost({action:'addShiftNoteUpdate',sessionId:localStorage.getItem('relaySessionId'),noteId:id,businessDate:housekeepingBusinessDate(),shift:activeChecklist||'GENERAL',updateText:text});if(!r.ok)throw new Error(r.reason||r.error||'Update failed');msg.textContent='✓ Update added — item remains open.';document.getElementById('resolveShiftNoteUpdate').value='';await loadOpenShiftNotes_();setTimeout(()=>{document.getElementById('resolveShiftNotePanel').hidden=true},450)}
 catch(err){msg.textContent='Update failed: '+err.message;b.disabled=false;b.textContent='＋ ADD UPDATE • KEEP OPEN';return}
 finally{setTimeout(()=>{b.disabled=false;b.textContent='＋ ADD UPDATE • KEEP OPEN'},700)}
});
document.getElementById('confirmResolveShiftNote')?.addEventListener('click',async()=>{
 const id=document.getElementById('resolveShiftNoteId').value,note=document.getElementById('resolveShiftNoteText').value.trim(),msg=document.getElementById('resolveShiftNoteMessage');if(!note){msg.textContent='Enter the final resolution before closing this item.';return}msg.textContent='Resolving…';
 try{const r=await apiPost({action:'resolveShiftNote',sessionId:localStorage.getItem('relaySessionId'),noteId:id,resolutionNote:note});if(!r.ok)throw new Error(r.reason||r.error||'Resolve failed');msg.textContent='✓ Resolved';setTimeout(async()=>{document.getElementById('resolveShiftNotePanel').hidden=true;await loadOpenShiftNotes_();refreshDashboardOps()},500)}catch(err){msg.textContent='Resolve failed: '+err.message}
});

document.getElementById('inspectionMaintenanceSummary')?.addEventListener('click',e=>{
 const b=e.target.closest('.inspection-maint-resolve');if(!b)return;
 pendingMaintenanceResolve=b.dataset.id;
 document.getElementById('maintenanceResolveTitle').textContent='Resolve Maintenance • Room '+activeInspectionRoom;
 document.getElementById('maintenanceResolvePhoto').value='';document.getElementById('maintenanceResolveNote').value='';document.getElementById('maintenanceResolveMessage').textContent='';
 document.getElementById('maintenanceResolvePanel').hidden=false;
});

// RELAY SIDE DUTY V1 — assigned housekeeping work with silent timing.
function sideWorkHost_(){
 const roles=currentUser?.roles||[];
 return roles.includes('MAINTENANCE')?document.getElementById('maintenanceView'):document.getElementById('housekeepingView');
}
function renderSideWorkBoardFromState_(r){
 const host=sideWorkHost_();if(!host||!currentUser)return;
 let box=document.getElementById('sideWorkBoard');if(box&&box.parentElement!==host)host.appendChild(box);
 if(!box){box=document.createElement('section');box.id='sideWorkBoard';box.className='side-work-board';host.appendChild(box)}
 const roles=currentUser.roles||[],isWorker=roles.some(x=>['HOUSEKEEPER','MAINTENANCE'].includes(x)),isMonitor=roles.some(x=>['ADMIN','FRONT DESK'].includes(x)),isInspector=roles.includes('INSPECTOR'),canAssign=isMonitor||isInspector;
 const worker=isWorker?currentUser.name:'';
 const tasks=(r.sideWork||[]).filter(x=>x.status!=='COMPLETE'&&(isMonitor||isWorker&&x.assignedTo===worker));
 if(isWorker){tasks.forEach(t=>{if(t.sessionId)activeSideWorkSessions[t.taskId]=t.sessionId});(r.sideWorkSessions||[]).forEach(x=>{if(x.status==='IN_PROGRESS'&&x.taskId)activeSideWorkSessions[x.taskId]=x.sessionId})}
 const title=isMonitor?'Active Side Duties':'My Work Beyond '+(roles.includes('MAINTENANCE')?'Maintenance':'Rooms');
 box.innerHTML='<div class="side-work-head"><div><small>OPERATIONAL SIDE DUTIES</small><h2>'+title+'</h2></div>'+(canAssign?'<button id="assignSideWorkBtn">+ ASSIGN SIDE DUTY</button>':'')+'</div><div class="side-work-list">'+(isInspector&&!isMonitor?'<p class="side-work-empty">Assign side duties here. Front Desk and Admin monitor completion.</p>':tasks.length?tasks.map(t=>'<article class="side-work-card"><div><strong>'+t.task+'</strong><span>'+t.location+(t.dueAt?' • Due '+t.dueAt:'')+'</span><small>Assigned to '+t.assignedTo+' by '+t.assignedBy+'</small></div>'+(isWorker?(t.status==='IN_PROGRESS'?'<button class="side-work-complete" data-task="'+t.taskId+'">COMPLETE</button>':'<button class="side-work-start" data-task="'+t.taskId+'" data-location="'+String(t.location||'').replace(/"/g,'&quot;')+'">SCAN QR TO START</button>'):'<b>'+t.status.replaceAll('_',' ')+'</b>')+'</article>').join(''):'<p class="side-work-empty">No active side duties.</p>')+'</div>';
 document.getElementById('assignSideWorkBtn')?.addEventListener('click',assignSideWork_);
}
async function loadSideWorkBoard_(){
 const host=sideWorkHost_();if(!host||!currentUser)return;
 let box=document.getElementById('sideWorkBoard');if(!box){box=document.createElement('section');box.id='sideWorkBoard';box.className='side-work-board';host.appendChild(box)}
 const roles=currentUser.roles||[],isInspector=roles.includes('INSPECTOR')&&!roles.some(x=>['ADMIN','FRONT DESK'].includes(x)),worker=roles.some(x=>['HOUSEKEEPER','MAINTENANCE'].includes(x))?currentUser.name:'';
 // Inspector has no monitoring read: render the dispatch control only.
 if(isInspector){renderSideWorkBoardFromState_({sideWork:[]});return}
 try{
   // Let getWorkBoard resolve the authoritative RELAY business day. This avoids a stale
   // browser date/cache key hiding a newly assigned Side Duty for Maintenance/HK users.
   const key='side:CURRENT:'+worker;
   let r=relayCached_(key);
   if(!r){r=await apiPost({action:'getWorkBoard',worker:worker},45000);relayCacheSet_(key,r)}
   if(!r.ok)throw new Error(r.reason||'Could not load side duties');
   if(r.businessDate){relayBusinessDate=r.businessDate;relayBusinessDayLoadedAt=Date.now()}
   renderSideWorkBoardFromState_(r);
 }catch(err){let box=document.getElementById('sideWorkBoard');if(box)box.innerHTML='<div class="side-work-head"><h2>Side Duties</h2></div><p>'+err.message+'</p>'}
}
async function assignSideWork_(){
 try{
   const day=await apiPost({action:'getBusinessDay',sessionId:localStorage.getItem('relaySessionId')});
   if(!day.ok||!day.businessDate)throw new Error(day.reason||'Could not confirm the current RELAY business day.');
   relayBusinessDate=day.businessDate;

   // Side duties are role-neutral operational work. The backend returns active operational associates.
   const users=await apiPost({action:'getAssignableSideDutyUsers',sessionId:localStorage.getItem('relaySessionId')});
   if(!users.ok)throw new Error(users.reason||'Could not load active associates.');
   const associates=users.users||[];
   if(!associates.length)throw new Error('No active operational associates are available.');

   const menu=associates.map((u,i)=>(i+1)+'. '+u.name+' — '+String(u.role||'').replaceAll('_',' ')).join('\n');
   const choice=(prompt('Assign side duty to:\n\n'+menu+'\n\nEnter the number:')||'').trim();
   if(!choice)return;
   const idx=Number(choice)-1;
   if(!Number.isInteger(idx)||idx<0||idx>=associates.length)throw new Error('Choose a valid associate number.');
   const assignedTo=associates[idx].name;

   const taskMenu=['STRIP ROOM','Public Restrooms','Laundry','Fitness Center','Rec / Grill Area','OTHER'];
   const taskChoice=(prompt('Choose side duty:\n\n'+taskMenu.map((t,i)=>(i+1)+'. '+t).join('\n')+'\n\nEnter the number:')||'').trim();
   if(!taskChoice)return;
   const ti=Number(taskChoice)-1;
   if(!Number.isInteger(ti)||ti<0||ti>=taskMenu.length)throw new Error('Choose a valid side duty number.');
   let task=taskMenu[ti],location='';
   if(task==='STRIP ROOM'){
     const room=(prompt('Room number to strip:')||'').trim();
     if(!/^\d{3}$/.test(room))throw new Error('Enter a valid 3-digit room number.');
     location=room;
   }else{
     if(task==='OTHER'){task=(prompt('Side duty:')||'').trim();if(!task)return}
     location=(prompt('Location / work area:',task)||'').trim();if(!location)return;
   }
   const dueAt=(prompt('Due time (optional, example 1:00 PM):')||'').trim();
   let r;
   try{r=await apiPost({action:'createSideWork',businessDate:day.businessDate,assignedTo,task,location,dueAt,assignedBy:currentUser.name},45000)}
   catch(err){throw new Error(err.message+' Do not submit it again yet — use REFRESH to confirm whether the assignment was saved.')}
   if(!r.ok)throw new Error(r.reason||'Assignment failed');
   relayCacheClear_('side:');relayCacheClear_('hk:');
   const roles=currentUser.roles||[],isInspector=roles.includes('INSPECTOR')&&!roles.some(x=>['ADMIN','FRONT DESK'].includes(x));
   if(isInspector){alert('✓ Task assigned');renderSideWorkBoardFromState_({sideWork:[]})}
   else{const board=document.getElementById('sideWorkBoard');if(board)board.insertAdjacentHTML('afterbegin','<article class="side-work-card"><div><strong>'+task+'</strong><span>'+location+(dueAt?' • Due '+dueAt:'')+'</span><small>Assigned to '+assignedTo+' • just now</small></div><span class="side-work-status">ASSIGNED</span></article>')}
 }catch(err){alert(err.message)}
}
let activeSideWorkSessions={},pendingSideWorkScan=null,sideWorkQrStream=null;
function sideWorkQrId_(location){const v=String(location||'').trim();return /^\d{3}$/.test(v)?'CO534-RM-'+v:'CO534-LOC-'+v.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'')}
function closeSideWorkQr_(){if(sideWorkQrStream){sideWorkQrStream.getTracks().forEach(t=>t.stop());sideWorkQrStream=null}pendingSideWorkScan=null;const p=document.getElementById('sideWorkQrPanel');if(p)p.hidden=true}
async function scanSideWorkQr_(taskId,location){
 pendingSideWorkScan={taskId,location};const panel=document.getElementById('sideWorkQrPanel'),msg=document.getElementById('sideWorkQrMessage'),title=document.getElementById('sideWorkQrTitle'),box=document.getElementById('sideWorkQrCamera');
 title.textContent=location||'Side Duty';msg.textContent='Opening camera…';box.innerHTML='▦';panel.hidden=false;
 try{
  sideWorkQrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const video=document.createElement('video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});video.setAttribute('playsinline','');video.muted=true;video.autoplay=true;video.srcObject=sideWorkQrStream;box.innerHTML='';box.appendChild(video);video.style.width='100%';video.style.height='100%';video.style.objectFit='cover';video.style.borderRadius='12px';await video.play();
  msg.textContent='Scan the '+location+' location QR. Scanning starts the task automatically.';
  const detector=('BarcodeDetector' in window)?new BarcodeDetector({formats:['qr_code']}):null,expected=sideWorkQrId_(location);
  const scan=async()=>{if(!pendingSideWorkScan||panel.hidden)return;let raw='';try{if(detector){const codes=await detector.detect(video);raw=codes[0]?.rawValue||''}else if(window.jsQR&&video.readyState>=2){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);const img=ctx.getImageData(0,0,canvas.width,canvas.height);raw=jsQR(img.data,img.width,img.height)?.data||''}}catch(_){}
   if(raw){if(raw!==expected){msg.textContent='Wrong location QR. Scan the '+location+' QR.';requestAnimationFrame(scan);return}sideWorkQrStream.getTracks().forEach(t=>t.stop());sideWorkQrStream=null;box.innerHTML='✓';msg.textContent='✓ Location verified. Starting task…';
    try{const r=await apiPost({action:'startSideWork',taskId,worker:currentUser.name,qrId:raw});if(!r.ok)throw new Error(r.reason||'Could not start');activeSideWorkSessions[taskId]=r.sessionId;msg.textContent='✓ IN PROGRESS';relayCacheClear_('side:');relayCacheClear_('hk:');
     // The start write is authoritative. Do not wait on another Sheets read just to show COMPLETE.
     const startBtn=document.querySelector('.side-work-start[data-task="'+taskId+'"]');
     if(startBtn){const complete=document.createElement('button');complete.className='side-work-complete';complete.dataset.task=taskId;complete.textContent='COMPLETE';startBtn.replaceWith(complete)}
     setTimeout(()=>closeSideWorkQr_(),450)}catch(err){msg.textContent='Could not start: '+err.message}return}
   requestAnimationFrame(scan)};
  requestAnimationFrame(scan);
 }catch(err){msg.textContent='Camera error: '+(err?.message||String(err))}
}
document.getElementById('closeSideWorkQr')?.addEventListener('click',closeSideWorkQr_);
document.addEventListener('click',async e=>{
 const start=e.target.closest('.side-work-start');if(start){scanSideWorkQr_(start.dataset.task,start.dataset.location);return}
 const done=e.target.closest('.side-work-complete');if(done){let sid=activeSideWorkSessions[done.dataset.task];
  if(!sid){
   done.disabled=true;done.textContent='CHECKING…';
   try{relayCacheClear_('side:');const r=await apiPost({action:'getWorkBoard',businessDate:housekeepingBusinessDate(),worker:currentUser.name},45000);if(r.ok){const task=(r.sideWork||[]).find(x=>x.taskId===done.dataset.task&&x.status==='IN_PROGRESS'&&x.sessionId);if(task){sid=task.sessionId;activeSideWorkSessions[done.dataset.task]=sid}}}catch(_){}
   if(!sid){done.disabled=false;done.textContent='COMPLETE';alert('RELAY could not recover the active work session yet. Refresh once and try COMPLETE again — do not rescan the QR.');return}
  }
  const card=done.closest('.side-work-card'),parent=card?.parentNode,next=card?.nextSibling;done.disabled=true;done.textContent='COMPLETE';
  // Optimistic completion: the worker gets an instant response while the write finishes.
  card?.remove();relayCacheClear_('side:');relayCacheClear_('hk:');
  try{const r=await apiPost({action:'completeSideWork',sessionId:sid},45000);if(!r.ok)throw new Error(r.reason||'Could not complete');delete activeSideWorkSessions[done.dataset.task]}
  catch(err){if(parent&&card){next?parent.insertBefore(card,next):parent.appendChild(card);done.disabled=false}alert('Could not save completion. The task has been restored: '+err.message)}
 }
});


async function loadWeeklyOpsReport_(){
  const host=document.getElementById('weeklyOpsReport'); if(!host||!currentUser)return;
  host.hidden=false;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  const metric=(label,value)=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>';
  try{
    const date=await loadRelayBusinessDay_();
    set('weeklyOpsPeriod',date?'RELAY business day '+date:'Current RELAY business day');
    const [today,work]=await Promise.all([
      apiPost({action:'getToday',businessDate:date},45000),
      apiPost({action:'getWorkBoard'},45000)
    ]);
    if(!today.ok)throw new Error(today.error||today.reason||'Could not load RELAY operations');
    const assignments=today.assignments||[],clean=today.cleaningSessions||[],ins=today.inspections||[],
          issues=today.inspectionIssues||[],maint=today.maintenance||today.maintenanceIssues||[],
          side=work.ok?(work.sideWork||[]):[];
    const completedClean=clean.filter(x=>['COMPLETE','READY_FOR_INSPECTION'].includes(String(x.status||'').toUpperCase())).length;
    const passed=ins.filter(x=>String(x.status||'').toUpperCase().includes('PASS')).length;
    const failed=ins.filter(x=>String(x.status||'').toUpperCase().includes('FAIL')).length;
    const rework=issues.filter(x=>['REWORK_REQUIRED','REWORK_IN_PROGRESS'].includes(String(x.status||'').toUpperCase())).length;
    const maintOpen=maint.filter(x=>!['RESOLVED','COMPLETE','CLOSED'].includes(String(x.status||'').toUpperCase())).length;
    const sideDone=side.filter(x=>String(x.status||'').toUpperCase()==='COMPLETE').length;
    set('wrRooms',assignments.length);set('wrCleaning',clean.length);set('wrInspections',ins.length);set('wrMaintOpen',maintOpen);set('wrSide',side.length);
    document.getElementById('wrHousekeeping').innerHTML=[
      metric('Rooms assigned',assignments.length),metric('Rooms worked / ready',completedClean),
      metric('Inspection passes',passed),metric('Inspection failures',failed),metric('Open rework',rework)
    ].join('');
    document.getElementById('wrOperations').innerHTML=[
      metric('Maintenance logged',maint.length),metric('Maintenance open',maintOpen),
      metric('Side duties assigned',side.length),metric('Side duties complete',sideDone),
      metric('Side duties outstanding',Math.max(0,side.length-sideDone))
    ].join('');
    set('weeklyOpsState','LIVE RELAY DATA');
    set('wrInsight',assignments.length||clean.length||ins.length||maint.length||side.length?'Operational activity is loaded. ADP labor above can now be read alongside RELAY output and quality.':'Production database is clean; operational metrics will populate automatically as tomorrow’s RELAY activity is recorded.');
  }catch(err){set('weeklyOpsState','RELAY DATA UNAVAILABLE');set('wrInsight','Could not load operational data: '+err.message)}
}

async function exportWeeklyManagerPdf_(){
  const btn=document.getElementById('exportWeeklyPdf'),original=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent='Building PDF…'}
  try{
    if(!window.jspdf?.jsPDF)throw new Error('PDF library did not load. Reload RELAY and try again.');
    const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'pt',format:'letter'});
    const txt=id=>document.getElementById(id)?.textContent?.trim()||'—';
    const navy=[5,31,48],blue=[28,119,183],muted=[76,99,116],line=[220,229,235];
    doc.setFillColor(...navy);doc.rect(0,0,612,76,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('RELAY',36,32);
    doc.setFontSize(8);doc.text('ROOM OPERATIONS',36,45);
    doc.setFontSize(15);doc.text('Weekly Manager Report',576,30,{align:'right'});
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text('Everhome Suites Denver Airport  |  CO534',576,46,{align:'right'});
    doc.setTextColor(...muted);doc.setFontSize(9);doc.text('Generated '+new Date().toLocaleString(),36,98);
    doc.setTextColor(...navy);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('Payroll Labor',36,124);
    const adpVisible=!document.getElementById('adpReportResults')?.hidden;
    let y=138;
    if(adpVisible){
      const cards=[['Employees',txt('adpEmployeeCount')],['Actual Hours',txt('adpActualTotal')],['Scheduled Hours',txt('adpScheduledTotal')],['Variance',txt('adpVarianceTotal')]];
      cards.forEach((x,i)=>{const x0=36+i*135;doc.setDrawColor(...line);doc.roundedRect(x0,y,125,42,4,4);doc.setTextColor(...muted);doc.setFontSize(7);doc.text(x[0].toUpperCase(),x0+9,y+13);doc.setTextColor(...navy);doc.setFontSize(15);doc.text(x[1],x0+9,y+32)});
      y+=56;
      const rows=[...document.querySelectorAll('#adpReportBody tr')].map(tr=>[...tr.children].map(td=>td.textContent.trim()));
      if(rows.length&&doc.autoTable){doc.autoTable({startY:y,head:[['Employee','Position ID','Actual','Scheduled','Variance','Dates']],body:rows,theme:'grid',styles:{fontSize:7,cellPadding:4,textColor:navy},headStyles:{fillColor:navy,textColor:255},margin:{left:36,right:36}});y=doc.lastAutoTable.finalY+18}
    }else{doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...muted);doc.text('ADP workbook not loaded for this export.',36,y+12);y+=30}
    if(y>620){doc.addPage();y=42}
    doc.setTextColor(...navy);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('RELAY Operational Activity',36,y);y+=8;
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...muted);doc.text(txt('weeklyOpsPeriod'),36,y+12);y+=26;
    const ops=[['Room Assignments',txt('wrRooms')],['Cleaning Sessions',txt('wrCleaning')],['Inspections',txt('wrInspections')],['Maintenance Open',txt('wrMaintOpen')],['Side Duties',txt('wrSide')]];
    ops.forEach((x,i)=>{const x0=36+i*108;doc.setDrawColor(...line);doc.roundedRect(x0,y,99,39,4,4);doc.setTextColor(...muted);doc.setFontSize(6.5);doc.text(x[0].toUpperCase(),x0+7,y+12);doc.setTextColor(...navy);doc.setFontSize(14);doc.text(x[1],x0+7,y+30)});y+=55;
    const sectionRows=id=>[...document.querySelectorAll('#'+id+' > div')].map(d=>[d.querySelector('span')?.textContent||'',d.querySelector('strong')?.textContent||'']);
    const hk=sectionRows('wrHousekeeping'),op=sectionRows('wrOperations');
    if(doc.autoTable){doc.autoTable({startY:y,head:[['Housekeeping & Quality','Result']],body:hk,theme:'grid',styles:{fontSize:8,textColor:navy},headStyles:{fillColor:blue,textColor:255},margin:{left:36,right:306},tableWidth:270});const y1=doc.lastAutoTable.finalY;doc.autoTable({startY:y,head:[['Maintenance & Side Duties','Result']],body:op,theme:'grid',styles:{fontSize:8,textColor:navy},headStyles:{fillColor:blue,textColor:255},margin:{left:306,right:36},tableWidth:270});y=Math.max(y1,doc.lastAutoTable.finalY)+18}
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...navy);doc.text('Management read:',36,y);
    doc.setFont('helvetica','normal');doc.setTextColor(...muted);const insight=doc.splitTextToSize(txt('wrInsight'),450);doc.text(insight,120,y);
    const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(...muted);doc.text('RELAY Room Operations • CO534',36,760);doc.text('Page '+p+' of '+pages,576,760,{align:'right'})}
    const safe=(txt('weeklyOpsPeriod').match(/\d{1,2}\/\d{1,2}\/\d{4}/)||[''])[0].replaceAll('/','-');
    doc.save('RELAY_CO534_Weekly_Manager_Report'+(safe?'_'+safe:'')+'.pdf');
  }catch(err){alert('Could not export PDF: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.textContent=original}}
}
document.getElementById('exportWeeklyPdf')?.addEventListener('click',exportWeeklyManagerPdf_);

/* Weekly Manager Report V1 — ADP Actual vs Scheduled importer */
(function(){
  const input=document.getElementById('adpXlsx'),status=document.getElementById('adpStatus'),results=document.getElementById('adpReportResults'),body=document.getElementById('adpReportBody');
  if(!input)return;
  const n=v=>{const x=parseFloat(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:0};
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  input.addEventListener('change',async()=>{
    const file=input.files&&input.files[0]; if(!file)return;
    status.className='hk-board-status'; status.textContent='Reading ADP workbook…'; results.hidden=true;
    try{
      if(typeof XLSX==='undefined')throw new Error('Spreadsheet reader did not load. Refresh RELAY and try again.');
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
      const ws=wb.Sheets['My Team Actual vs Scheduled']||wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
      const employees=[]; let days=[];
      for(const row of rows){
        const dateText=String(row[2]||'').trim(), empText=String(row[1]||'').trim();
        const dm=dateText.match(/Totals \(Schedule Date\):\s*(?:\u00a0)?(.+)$/i);
        if(dm){days.push(dm[1].trim());continue}
        const em=empText.match(/Totals \(Name - Position ID\):\s*(?:\u00a0)?(.+?)\s*-\s*(\d+)\s*$/i);
        if(em){
          const raw=em[1].trim(), comma=raw.indexOf(',');
          const name=comma>=0?(raw.slice(comma+1).trim()+' '+raw.slice(0,comma).trim()):raw;
          employees.push({name,positionId:em[2],actual:n(row[4]),scheduled:n(row[5]),variance:n(row[6]),days:[...days]});
          days=[];
        }
      }
      if(!employees.length)throw new Error('No employee totals were found. Please use the ADP “My Team Actual vs Scheduled” XLSX report.');
      const total=k=>employees.reduce((s,e)=>s+e[k],0);
      document.getElementById('adpEmployeeCount').textContent=employees.length;
      document.getElementById('adpActualTotal').textContent=total('actual').toFixed(2);
      document.getElementById('adpScheduledTotal').textContent=total('scheduled').toFixed(2);
      const variance=total('variance'); document.getElementById('adpVarianceTotal').textContent=(variance>0?'+':'')+variance.toFixed(2);
      body.innerHTML=employees.map(e=>'<tr><td><strong>'+esc(e.name)+'</strong></td><td>'+esc(e.positionId)+'</td><td>'+e.actual.toFixed(2)+'</td><td>'+e.scheduled.toFixed(2)+'</td><td class="'+(e.variance>0?'over':e.variance<0?'under':'')+'">'+(e.variance>0?'+':'')+e.variance.toFixed(2)+'</td><td>'+e.days.length+'</td></tr>').join('');
      status.className='hk-board-status'; status.textContent='✓ ADP workbook read successfully — '+employees.length+' employees loaded.';
      results.hidden=false;
    }catch(err){status.className='hk-board-status error';status.textContent=err.message||'Could not read ADP workbook.'}
  });
})();
