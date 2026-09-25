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
  'FRONT DESK':['Home','Checklists','Housekeeping','Maintenance','Lost & Found','Reports'],
  HOUSEKEEPER:['Housekeeping'],
  MAINTENANCE:['Maintenance','Preventive Maintenance','Checklists']
};
const ROLE_LABELS={ADMIN:'Admin',INSPECTOR:'Inspector',MAINTENANCE:'Maintenance','FRONT DESK':'Front Desk',HOUSEKEEPER:'Housekeeper'};
let currentUser=null;
const home=document.getElementById('homeView'),lostFoundView=document.getElementById('lostFoundView'),reportsView=document.getElementById('reportsView'),housekeepingView=document.getElementById('housekeepingView'),inspectionView=document.getElementById('inspectionView'),maintenanceView=document.getElementById('maintenanceView'),checklistsView=document.getElementById('checklistsView'),importView=document.getElementById('importView'),placeholder=document.getElementById('placeholder'),title=document.getElementById('placeholderTitle'),drawer=document.getElementById('drawer'),drawerLinks=document.getElementById('drawerLinks');
const todayEl=document.getElementById('today');if(todayEl)todayEl.textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date());

let loginProperties=[],relayBusinessDate='',relayBusinessDayLoadedAt=0;
let relayViewCache=new Map();
const RELAY_VIEW_CACHE_MS=15000;
function relayCached_(key){const x=relayViewCache.get(key);return x&&Date.now()-x.at<RELAY_VIEW_CACHE_MS?x.value:null}
function relayCacheSet_(key,value){relayViewCache.set(key,{at:Date.now(),value});return value}
function relayCacheClear_(prefix=''){for(const k of [...relayViewCache.keys()])if(!prefix||k.startsWith(prefix))relayViewCache.delete(k)}
const RELAY_READ_ACTIONS=new Set(['authLogin','authLogout','authSession','getAssignableHousekeepers','getBusinessDay','getInspectionPhoto','getMaintenanceBoard','getPmBoard','getMaintenanceReport','getLostFound','getShiftNoteDetail','getShiftOperations','getToday','getWorkBoard','adminListUsers']);
const RELAY_WRITE_AFFECTS={
 syncChoice:['hk:','inspection:','dashboard:'],startRoom:['hk:','dashboard:'],readyRoom:['hk:','inspection:','dashboard:'],
 startInspection:['inspection:'],saveInspectionIssue:['inspection:','hk:','maintenance:','dashboard:'],resolveInspectionIssue:['inspection:','hk:','dashboard:'],resolveReinspection:['inspection:','hk:','dashboard:'],passInspection:['inspection:','hk:','dashboard:'],
 logMaintenance:['maintenance:','inspection:','hk:','dashboard:'],saveMaintenanceIssue:['maintenance:','inspection:','hk:','dashboard:'],startMaintenanceWork:['maintenance:'],completeMaintenanceWork:['maintenance:','inspection:','hk:','dashboard:'],resolveMaintenanceIssue:['maintenance:','inspection:','hk:','dashboard:'],
 createSideWork:['side:','hk:','dashboard:'],startSideWork:['side:','hk:'],completeSideWork:['side:','hk:','dashboard:'],
 saveShiftNote:['shift:','dashboard:'],addShiftNoteUpdate:['shift:','dashboard:'],resolveShiftNote:['shift:','dashboard:'],completeChecklistShift:['shift:','dashboard:'],
 dailyAudit:['business:','hk:','inspection:','maintenance:','side:','shift:','dashboard:'],saveHotelPerformance:['dashboard:'],
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
  if(lostFoundView)lostFoundView.hidden=view!=='Lost & Found';
  if(reportsView) reportsView.hidden=view!=='Reports';
  inspectionView.hidden=view!=='Inspections';
  maintenanceView.hidden=view!=='Maintenance';
  checklistsView.hidden=view!=='Checklists';
  document.getElementById('pmView').hidden=!(view==='PM'||view==='Preventive Maintenance');
  document.getElementById('usersView').hidden=view!=='Users';
  importView.hidden=true;
  placeholder.hidden=(view==='Home'||view==='Housekeeping'||view==='Lost & Found'||view==='Inspections'||view==='Maintenance'||view==='Checklists'||view==='PM'||view==='Preventive Maintenance'||view==='Users'||view==='Reports');
  if(!placeholder.hidden) title.textContent=view;
  if(view==='Home') refreshDashboardOps();
  if(view==='Housekeeping') loadHousekeepingBoard()
  if(view==='Lost & Found') loadLostFound_();
  if(view==='Inspections') loadInspectionQueue();
  if(view==='Maintenance'){loadMaintenanceBoard();loadSideWorkBoard_();}
  if(view==='Reports'){document.getElementById('dailyOperationsReport').hidden=true;document.getElementById('housekeeperPerformanceReport').hidden=true;document.getElementById('inspectorPerformanceReport').hidden=true;document.getElementById('weeklyOpsReport').hidden=true;document.getElementById('reportLibrary').hidden=false;document.getElementById('backToReports').hidden=false;}
  if(view==='Preventive Maintenance'||view==='PM')loadPmBoard_();
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
  const w=window.open('','_blank');if(w)w.document.write('<meta name="viewport" content="width=device-width"><body style="margin:0;background:#111;color:#fff;display:grid;place-items:center;min-height:100vh;font-family:Arial"><p>Loading picture…</p></body>');
  try{
    const result=await apiPost({action:'getInspectionPhoto',photoRef:b.dataset.photo});
    if(!result.ok)throw new Error(result.reason||result.error||'Photo unavailable');
    if(!w)throw new Error('Pop-up blocked. Allow pop-ups for RELAY and try again.');
    w.document.open();w.document.write('<meta name="viewport" content="width=device-width"><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh"><img src="'+result.dataUrl+'" style="max-width:100%;max-height:100vh"></body>');w.document.close();
  }catch(err){if(w)w.close();alert('Could not open inspector photo: '+err.message)}
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
    if(!state){state=await apiPost({action:'getMaintenanceBoard',sessionId:localStorage.getItem('relaySessionId'),businessDate:housekeepingBusinessDate(),worker:currentUser.name},45000);if(!state.ok)throw new Error(state.reason||state.error||'Maintenance unavailable');relayCacheSet_(key,state)}
    document.getElementById('maintenancePmShortcut').hidden=!(currentUser.roles||[]).some(r=>['ADMIN','INSPECTOR','MAINTENANCE'].includes(r));
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

async function relayViewPhoto_(photoRef){
  const ref=String(photoRef||'').trim();
  if(!ref)return;
  let overlay=document.getElementById('relayPhotoViewer');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='relayPhotoViewer';
    overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,18,30,.96);display:none;align-items:center;justify-content:center;padding:18px';
    overlay.innerHTML='<button type="button" aria-label="Close photo" style="position:absolute;top:18px;right:18px;z-index:2;border:0;border-radius:999px;width:48px;height:48px;font-size:28px;background:#fff;color:#062235">×</button><div style="width:100%;height:100%;display:grid;place-items:center"><p style="color:#fff;font:700 18px Arial">Loading photo…</p></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('button')){overlay.style.display='none';overlay.querySelector('div').innerHTML='<p style="color:#fff;font:700 18px Arial">Loading photo…</p>'}});
  }
  overlay.style.display='flex';
  const box=overlay.querySelector('div');
  box.innerHTML='<p style="color:#fff;font:700 18px Arial">Loading photo…</p>';
  try{
    const result=await apiPost({action:'getInspectionPhoto',photoRef:ref});
    if(!result.ok||!result.dataUrl)throw new Error(result.reason||result.error||'Photo unavailable');
    box.innerHTML='<img alt="Maintenance photo" src="'+result.dataUrl+'" style="max-width:100%;max-height:calc(100vh - 36px);object-fit:contain;border-radius:12px">';
  }catch(err){
    box.innerHTML='<p style="color:#fff;font:700 18px Arial;text-align:center">Could not load photo.<br><span style="font-weight:400">'+String(err.message||err)+'</span></p>';
  }
}

document.getElementById('maintenanceQueue').addEventListener('click',async e=>{
 const p=e.target.closest('.maint-photo');if(p){e.preventDefault();e.stopPropagation();relayViewPhoto_(p.dataset.photo);return}
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
 renderChecklist();const pw=document.getElementById('addPropertyWalkPhoto');if(pw)pw.hidden=name!=='MAINTENANCE';
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

let activeLfId='',relayLostFoundItems=[];
function lfAge_(x){return Math.max(0,Math.floor((Date.now()-new Date(x.foundAt).getTime())/86400000))}
function lfStatus_(x){if(['RETURNED','SHIPPED','DISPOSED'].includes(x.status))return x.status;if(lfAge_(x)>=30)return 'DUE';return x.status||'IN_STORAGE'}
async function loadLostFound_(){
 const host=document.getElementById('lfList');if(host)host.innerHTML='<div class="lf-empty">Loading Lost & Found…</div>';
 try{const r=await apiPost({action:'getLostFound',sessionId:localStorage.getItem('relaySessionId')});if(!r.ok)throw new Error(r.reason||r.error||'Unable to load Lost & Found');relayLostFoundItems=r.items||[]}catch(e){if(host)host.innerHTML='<div class="lf-empty">'+e.message+'</div>';return}
 const items=relayLostFoundItems,q=(document.getElementById('lfSearch')?.value||'').toLowerCase(),filter=document.getElementById('lfFilter')?.value||'OPEN',status=x=>lfStatus_(x),closed=x=>['RETURNED','SHIPPED','DISPOSED'].includes(status(x));
 const visible=items.filter(x=>{const s=status(x),matches=!q||[x.id,x.location,x.description,x.guestName,x.foundBy].join(' ').toLowerCase().includes(q);if(!matches)return false;if(filter==='ALL')return true;if(filter==='OPEN')return !closed(x)&&s!=='DUE';if(filter==='CLOSED')return closed(x);return s===filter});
 const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};set('lfStoredCount',items.filter(x=>!closed(x)&&status(x)!=='DUE'&&status(x)!=='PENDING_PICKUP').length);set('lfPickupCount',items.filter(x=>status(x)==='PENDING_PICKUP').length);set('lfDueCount',items.filter(x=>status(x)==='DUE').length);set('lfClosedCount',items.filter(closed).length);
 if(!host)return;host.innerHTML=visible.length?visible.sort((a,b)=>new Date(b.foundAt)-new Date(a.foundAt)).map(x=>'<button class="lf-card" data-lf-id="'+x.id+'"><div><small>'+x.id+' • '+new Date(x.foundAt).toLocaleDateString()+'</small><strong>'+x.description+'</strong><span>'+x.location+' • '+x.storage+'</span></div><div><b>'+status(x).replaceAll('_',' ')+'</b><em>DAY '+Math.min(30,lfAge_(x))+' OF 30</em></div></button>').join(''):'<div class="lf-empty">No Lost & Found items match this view.</div>';host.querySelectorAll('[data-lf-id]').forEach(b=>b.onclick=()=>openLfAction_(b.dataset.lfId));
}
function openLfAction_(id){const x=relayLostFoundItems.find(v=>v.id===id);if(!x)return;activeLfId=id;document.getElementById('lfActionTitle').textContent=x.id+' • '+x.description;document.getElementById('lfActionDetail').innerHTML='<div class="lf-storage"><span>FOUND</span><strong>'+new Date(x.foundAt).toLocaleString()+' • '+x.location+'</strong></div><div class="lf-storage"><span>CURRENT STORAGE</span><strong>'+x.storage+'</strong></div><div class="lf-storage"><span>DISPOSITION DATE</span><strong>'+new Date(x.dispositionDate).toLocaleDateString()+'</strong></div><p>Found by '+x.foundBy+' • Entered by '+(x.enteredBy||'—')+(x.guestName?' • Guest: '+x.guestName:'')+'</p>'+(x.photoRef?'<button type="button" class="lf-view-photo" data-photo="'+x.photoRef+'">📷 VIEW PICTURE</button>':'<p>No picture attached.</p>');document.getElementById('lfActionPanel').hidden=false}
document.getElementById('lfNewItem')?.addEventListener('click',()=>{document.getElementById('lfItemPanel').hidden=false});
document.getElementById('lfClosePanel')?.addEventListener('click',()=>document.getElementById('lfItemPanel').hidden=true);document.getElementById('lfCloseAction')?.addEventListener('click',()=>document.getElementById('lfActionPanel').hidden=true);
document.getElementById('lfHighValue')?.addEventListener('change',e=>document.getElementById('lfStorageLocation').textContent=e.target.checked?'Safe':'1st Floor L&F Closet — end of hallway');
document.getElementById('lfSearch')?.addEventListener('input',()=>renderLostFoundLocal_());document.getElementById('lfFilter')?.addEventListener('change',()=>renderLostFoundLocal_());
function renderLostFoundLocal_(){const keep=relayLostFoundItems;loadLostFound_()}
document.getElementById('lfSaveItem')?.addEventListener('click',async()=>{
 const description=document.getElementById('lfDescription').value.trim(),location=document.getElementById('lfLocation').value.trim(),foundBy=document.getElementById('lfFoundBy').value.trim(),enteredBy=document.getElementById('lfEnteredBy').value.trim(),msg=document.getElementById('lfMessage');if(!description||!location||!foundBy||!enteredBy){msg.textContent='Room/location, item description, found by and entered by are required.';return}
 const f=document.getElementById('lfPhoto').files?.[0],photoDataUrl=f?await fileToDataUrl(f):'';msg.textContent='Saving…';
 try{const r=await apiPost({action:'createLostFound',sessionId:localStorage.getItem('relaySessionId'),location,description,foundBy,enteredBy,guestName:document.getElementById('lfGuestName').value.trim(),highValue:document.getElementById('lfHighValue').checked,notes:document.getElementById('lfNotes').value.trim(),photoDataUrl},90000);if(!r.ok)throw new Error(r.reason||r.error||'Save failed');document.getElementById('lfItemPanel').hidden=true;['lfLocation','lfDescription','lfFoundBy','lfEnteredBy','lfGuestName','lfNotes'].forEach(id=>document.getElementById(id).value='');document.getElementById('lfPhoto').value='';document.getElementById('lfHighValue').checked=false;document.getElementById('lfStorageLocation').textContent='1st Floor L&F Closet — end of hallway';msg.textContent='';relayCacheClear_();await loadLostFound_()}catch(e){msg.textContent=e.message}
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('.lf-view-photo');if(!b)return;e.preventDefault();
 const w=window.open('','_blank');if(w)w.document.write('<meta name="viewport" content="width=device-width"><body style="margin:0;background:#111;color:#fff;display:grid;place-items:center;min-height:100vh;font-family:Arial"><p>Loading picture…</p></body>');
 try{const result=await apiPost({action:'getInspectionPhoto',photoRef:b.dataset.photo});if(!result.ok)throw new Error(result.reason||result.error||'Photo unavailable');if(!w)throw new Error('Pop-up blocked. Allow pop-ups for RELAY and try again.');w.document.open();w.document.write('<meta name="viewport" content="width=device-width"><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh"><img src="'+result.dataUrl+'" style="max-width:100%;max-height:100vh"></body>');w.document.close()}catch(err){if(w)w.close();alert('Could not open picture: '+err.message)}
});
document.getElementById('lfSaveAction')?.addEventListener('click',async()=>{const msg=document.getElementById('lfActionMessage');msg.textContent='Saving…';try{const r=await apiPost({action:'updateLostFound',sessionId:localStorage.getItem('relaySessionId'),id:activeLfId,actionStatus:document.getElementById('lfAction').value,notes:document.getElementById('lfActionNotes').value.trim()});if(!r.ok)throw new Error(r.reason||r.error||'Update failed');document.getElementById('lfActionPanel').hidden=true;document.getElementById('lfActionNotes').value='';msg.textContent='';relayCacheClear_();await loadLostFound_()}catch(e){msg.textContent=e.message}});
document.getElementById('dashAddShiftNote')?.addEventListener('click',()=>{show('Checklists');setTimeout(openShiftNote,0)});
document.querySelectorAll('.rr-dashboard [data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
async function refreshDashboardOps(){
 try{
  if(!currentUser)return;
  const day=housekeepingBusinessDate(),sid=localStorage.getItem('relaySessionId');
  const [state,handoff]=await Promise.all([
   apiPost({action:'getToday',businessDate:day},45000),
   apiPost({action:'getShiftOperations',sessionId:sid,businessDate:day,shift:''},45000)
  ]);
  if(!state?.ok)throw new Error(state?.reason||state?.error||'Today data unavailable');
  const assignments=state.assignments||[],sessions=state.cleaningSessions||[],maint=state.maintenanceIssues||state.maintenance||[];
  const readyRooms=new Set(sessions.filter(x=>String(x.status||'').toUpperCase()==='READY_FOR_INSPECTION').map(x=>String(x.room||'')).filter(Boolean));
  const openMaint=maint.filter(x=>!['RESOLVED','COMPLETE','COMPLETED','CLOSED'].includes(String(x.status||'').toUpperCase())).length;
  const allNotes=handoff?.ok?(handoff.shiftNotes||handoff.notes||handoff.openNotes||[]):[],openNotes=(handoff?.openNotes||[]).length?handoff.openNotes:allNotes.filter(n=>!['RESOLVED','CLOSED','COMPLETE'].includes(String(n.status||'OPEN').toUpperCase()));
  const followups=openNotes.filter(n=>String(n.noteType||n.note_type||'').toUpperCase().includes('FOLLOW')).length;
  const issues=openNotes.filter(n=>String(n.noteType||n.note_type||'').toUpperCase()==='ISSUE').length;
  const info=allNotes.filter(n=>['INFO','INFORMATION','INFORMATIONAL'].includes(String(n.noteType||n.note_type||'').toUpperCase())).length;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  set('dashHousekeepingCount',assignments.length);set('dashInspectionCount',readyRooms.size);set('dashMaintenanceCount',openMaint);set('dashFollowupCount',followups);set('dashIssueCount',issues);set('dashNotificationCount',info);
  relayCacheSet_('dashboard:today:'+day,state);relayCacheSet_('dashboard:shift:'+day,handoff);
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
 if(photo){e.preventDefault();e.stopImmediatePropagation();relayViewPhoto_(photo.dataset.photo);return}
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
  else if(!document.getElementById('pmView').hidden)await loadPmBoard_();
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
 const bd=housekeepingBusinessDate(),sid=localStorage.getItem('relaySessionId');
 document.getElementById('dailyAuditCurrentDate').textContent=bd;
 document.getElementById('dailyAuditConfirm').checked=false;document.getElementById('executeDailyAudit').disabled=true;document.getElementById('dailyAuditMessage').textContent='';
 const warn=document.getElementById('dailyAuditCarryWarning');warn.hidden=true;warn.innerHTML='';
 document.getElementById('dailyAuditPanel').hidden=false;
 try{
  const [today,...shifts]=await Promise.all([apiPost({action:'getToday',businessDate:bd},45000),...['AM','PM','AUDIT'].map(shift=>apiPost({action:'getShiftOperations',sessionId:sid,businessDate:bd,shift},45000))]);
  const maint=(today.maintenanceIssues||today.maintenance||[]).filter(x=>!['RESOLVED','COMPLETE','COMPLETED','CLOSED'].includes(String(x.status||'').toUpperCase()));
  const open=[...new Map(shifts.flatMap(r=>r&&r.ok?(r.openNotes||[]):[]).map(x=>[String(x.noteId||x.note_id||x.id||JSON.stringify(x)),x])).values()];
  if(maint.length||open.length){warn.hidden=false;warn.innerHTML='<strong>OPEN ITEMS WILL CARRY FORWARD</strong><p>'+open.length+' open follow-up'+(open.length===1?'':'s')+' • '+maint.length+' open maintenance item'+(maint.length===1?'':'s')+'. These items will not block Daily Audit.</p>'}
 }catch(e){console.warn('Daily Audit carry-forward preview unavailable',e)}
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



function dorEsc_(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function dorMetric_(label,value){return '<div><strong>'+value+'</strong><small>'+label+'</small></div>'}
function dorTime_(v){if(!v)return '—';const d=new Date(v);return isNaN(d)?'—':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
function dorDateKey_(v){if(!v)return '';const s=String(v).trim(),mdy=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(mdy)return mdy[3]+'-'+mdy[1].padStart(2,'0')+'-'+mdy[2].padStart(2,'0');const ymd=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(ymd)return ymd[1]+'-'+ymd[2].padStart(2,'0')+'-'+ymd[3].padStart(2,'0');const d=new Date(v);if(isNaN(d))return s.slice(0,10);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
async function loadDailyOperationsReport_(){
 const date=await loadRelayBusinessDay_(),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
 set('dorDate',date||'—');set('dorGenerated','Report Generated: '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
 const sid=localStorage.getItem('relaySessionId');
 const [today,work,lostFoundReport,maintenanceReport,maintenanceBoard,pmBoard,hotelPerformanceResult,...shiftResults]=await Promise.all([apiPost({action:'getToday',businessDate:date},45000),apiPost({action:'getWorkBoard'},45000),apiPost({action:'getLostFoundReport',sessionId:sid,businessDate:date},45000).catch(err=>({ok:false,error:String(err?.message||err)})),apiPost({action:'getMaintenanceReport',sessionId:sid,businessDate:date},45000).catch(()=>({ok:false})),apiPost({action:'getMaintenanceBoard',sessionId:sid,businessDate:date,worker:currentUser.name},45000).catch(()=>({ok:false})),apiPost({action:'getPmBoard',sessionId:sid},45000).catch(()=>({ok:false})),apiPost({action:'getHotelPerformance',businessDate:date},45000).catch(()=>({ok:false})),apiPost({action:'getShiftOperations',sessionId:sid,businessDate:date},45000)]);
 const dorDedupeNotes_=rows=>[...new Map(rows.map(x=>[String(x.noteId||x.note_id||x.id||[x.businessDate||x.business_date||'',x.shift||'',x.noteType||x.note_type||'',x.issueInformation||x.issue_information||x.note||'',x.enteredAt||x.entered_at||x.createdAt||x.created_at||''].join('|')),x])).values()];
 const shift={ok:shiftResults.some(r=>r&&r.ok),shiftNotes:dorDedupeNotes_(shiftResults.flatMap(r=>r&&r.ok?[...(r.shiftNotes||[]),...(r.notes||[])]:[])),openNotes:dorDedupeNotes_(shiftResults.flatMap(r=>r&&r.ok?(r.openNotes||[]):[]))};
 if(!today.ok){document.getElementById('dorSummary').innerHTML='<p>Could not load daily operations.</p>';return}
 const reportDay=dorDateKey_(date),assignments=today.assignments||[],clean=today.cleaningSessions||[],ins=today.inspections||[],issues=today.inspectionIssues||[],maintToday=today.maintenance||today.maintenanceIssues||[],maintReportRows=maintenanceReport.maintenance||maintenanceReport.issues||maintenanceReport.maintenanceIssues||maintenanceReport.tickets||[],maintBoardRows=(maintenanceBoard&&maintenanceBoard.ok)?(maintenanceBoard.maintenanceIssues||maintenanceBoard.maintenance||maintenanceBoard.issues||maintenanceBoard.tickets||[]):[],maintSource=(Array.isArray(maintReportRows)&&maintReportRows.length)?maintReportRows:((Array.isArray(maintToday)&&maintToday.length)?maintToday:maintBoardRows),maintRaw=maintSource.filter(x=>{const raw=dorDateKey_(x.businessDate||x.business_date||'');if(raw===reportDay)return true;if(maintSource===maintBoardRows&&raw){const d=new Date(raw+'T12:00:00');d.setDate(d.getDate()+1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')===reportDay}return false}),maint=maintRaw,pmReportRows=maintenanceReport.pmCompletions||maintenanceReport.pm||maintenanceReport.completedPm||[],pmSource=(Array.isArray(pmReportRows)&&pmReportRows.length)?pmReportRows:((pmBoard&&pmBoard.ok&&Array.isArray(pmBoard.history))?pmBoard.history:[]),pmRows=pmSource.filter(x=>{const raw=dorDateKey_(x.businessDate||x.business_date||'');if(raw===reportDay)return true;const completed=dorDateKey_(x.completedAt||x.completed_at||'');if(completed===reportDay)return true;if(pmSource===pmBoard?.history&&raw){const d=new Date(raw+'T12:00:00');d.setDate(d.getDate()+1);const shifted=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');return shifted===reportDay}return false}),syncs=today.choiceSyncs||today.syncs||[],roomPhotos=today.roomPhotos||today.photos||[],propertyWalkPhotos=today.propertyWalkPhotos||[];
 const perf=(hotelPerformanceResult&&hotelPerformanceResult.ok&&hotelPerformanceResult.hotelPerformance)||today.hotelPerformance||today.hotel_performance||today.performance||today.choicePerformance||today.choice_performance||{};
 const dorPick_=(...vals)=>vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
 const dorNum_=v=>{if(v===undefined||v===null||String(v).trim()==='')return '—';const n=Number(String(v).replace(/[$,% ,]/g,''));return Number.isFinite(n)?n:'—'};
 const dorCount_=v=>{const n=dorNum_(v);return n==='—'?'—':Math.round(n).toLocaleString()};
 const dorMoney_=v=>{const n=dorNum_(v);return n==='—'?'—':n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2})};
 const dorPct_=v=>{const n=dorNum_(v);if(n==='—')return '—';const pct=n<=1?n*100:n;return pct.toLocaleString('en-US',{maximumFractionDigits:1})+'%'};
 const occupancy=dorPick_(perf.occupancy,perf.occupancyPct,perf.occupancy_pct,today.occupancy,today.occupancyPct,today.occupancy_pct),adr=dorPick_(perf.adr,perf.ADR,today.adr,today.ADR),revpar=dorPick_(perf.revpar,perf.revPAR,perf.RevPAR,today.revpar,today.revPAR,today.RevPAR),roomsSold=dorPick_(perf.roomsSold,perf.rooms_sold,today.roomsSold,today.rooms_sold),roomRevenue=dorPick_(perf.roomRevenue,perf.room_revenue,today.roomRevenue,today.room_revenue),checkIns=dorPick_(perf.checkIns,perf.check_ins,perf.checkins,today.checkIns,today.check_ins,today.checkins),checkOuts=dorPick_(perf.checkOuts,perf.check_outs,perf.checkouts,today.checkOuts,today.check_outs,today.checkouts),stayovers=dorPick_(perf.stayovers,perf.stayOvers,perf.stay_overs,today.stayovers,today.stayOvers,today.stay_overs),noShows=dorPick_(perf.noShows,perf.no_shows,perf.noshows,today.noShows,today.no_shows,today.noshows);
 set('dorOccupancy',dorPct_(occupancy));set('dorAdr',dorMoney_(adr));set('dorRevpar',dorMoney_(revpar));set('dorRoomsSold',dorCount_(roomsSold));set('dorRoomRevenue',dorMoney_(roomRevenue));set('dorCheckIns',dorCount_(checkIns));set('dorCheckOuts',dorCount_(checkOuts));set('dorStayovers',dorCount_(stayovers));set('dorNoShows',dorCount_(noShows));
 const completedSessions=clean.filter(x=>['COMPLETE','READY_FOR_INSPECTION'].includes(String(x.status||'').toUpperCase())),completeRooms=new Set(completedSessions.map(x=>String(x.room||'').trim()).filter(Boolean)),passedIns=ins.filter(x=>String(x.status||'').toUpperCase().includes('PASS')),passedRooms=new Set(passedIns.map(x=>String(x.room||'').trim()).filter(Boolean)),complete=completeRooms.size,passed=passedRooms.size;
 const maintStatus=x=>String(x.status||'').toUpperCase(),maintOpen=maint.filter(x=>!['RESOLVED','COMPLETE','COMPLETED','CLOSED'].includes(maintStatus(x))),maintResolved=maint.filter(x=>['RESOLVED','COMPLETE','COMPLETED','CLOSED'].includes(maintStatus(x))),holds=maintOpen.filter(x=>x.blocking===true||String(x.blocking).toUpperCase()==='TRUE'||String(x.priority||'').toUpperCase()==='P2_ROOM_BLOCKING');
 const readiness=assignments.length?Math.round(passed/assignments.length*100):0;document.getElementById('dorSummary').innerHTML=[dorMetric_('ASSIGNED',assignments.length),dorMetric_('CLEANED',complete),dorMetric_('PASSED',passed),dorMetric_('OUTSTANDING',Math.max(0,assignments.length-passed)),dorMetric_('MAINT. HOLDS',holds.length),dorMetric_('ROOM READY',assignments.length?readiness+'%':'—')].join('');set('dorStatus',assignments.length&&passed>=assignments.length?'DAY CLOSED • 100% ROOM READY':readiness+'% ROOM READY');
 const syncSorted=syncs.slice().sort((a,b)=>new Date(a.syncedAt||a.createdAt||a.timestamp)-new Date(b.syncedAt||b.createdAt||b.timestamp));
 const firstSync=syncSorted.length?dorTime_(syncSorted[0].syncedAt||syncSorted[0].createdAt||syncSorted[0].timestamp):'—',lastSync=syncSorted.length?dorTime_(syncSorted.at(-1).syncedAt||syncSorted.at(-1).createdAt||syncSorted.at(-1).timestamp):'—',lastBy=syncSorted.length?(syncSorted.at(-1).syncedBy||syncSorted.at(-1).user||'—'):'—';set('dorSyncLine',syncSorted.length?syncSorted.length+'  |  Last Sync: '+lastSync+'  |  Synced By: '+lastBy:'No Choice sync recorded');set('dorFooterFresh',syncSorted.length?'Choice current through '+lastSync:'Choice sync not recorded');
 const hk={};completedSessions.forEach(x=>{const n=x.housekeeper||x.housekeeper_name||x.assignedTo||x.assigned_to||'Unassigned';hk[n]??={rooms:new Set(),min:0,timed:false};if(x.room)hk[n].rooms.add(String(x.room));const av=x.startedAt||x.startTime||x.started_at||x.start_time||x.started||x.start,bv=x.completedAt||x.endTime||x.completed_at||x.end_time||x.readyAt||x.ready_at||x.completed||x.endedAt||x.ended_at||x.end,a=new Date(av),b=new Date(bv);if(av&&bv&&!isNaN(a)&&!isNaN(b)&&b>=a){hk[n].min+=(b-a)/60000;hk[n].timed=true}});
 document.getElementById('dorHousekeeping').innerHTML=Object.keys(hk).length?'<table><thead><tr><th>ASSOCIATE</th><th>ROOMS</th><th>ACTIVE CLEANING</th><th>AVG / ROOM</th><th>DEFICIENCIES</th></tr></thead><tbody>'+Object.entries(hk).map(([n,x])=>'<tr><td>'+dorEsc_(n)+'</td><td>'+x.rooms.size+'</td><td>'+(x.timed?Math.round(x.min)+' min':'—')+'</td><td>'+(x.timed&&x.rooms.size?Math.round(x.min/x.rooms.size)+' min':'—')+'</td><td>'+issues.filter(i=>String(i.housekeeper||i.housekeeper_name||'')===n).length+'</td></tr>').join('')+'</tbody></table>':'<p>No housekeeping production recorded.</p>';
 const issueState=x=>String(x.resolution||x.status||'').toUpperCase(),fixed=issues.filter(x=>issueState(x).includes('FIXED_BY_INSPECTOR')||issueState(x)==='FIXED').length,rework=issues.filter(x=>issueState(x).includes('REWORK')||issueState(x).includes('HOUSEKEEPER')).length;
 document.getElementById('dorInspection').innerHTML=[dorMetric_('Rooms Inspected',ins.length),dorMetric_('Rooms Passed',passed),dorMetric_('Deficiencies Found',issues.length),dorMetric_('Inspector Fixed',fixed),dorMetric_('Sent Back to HK',rework),dorMetric_('Photos Taken',issues.filter(x=>x.photoRef).length)].join('');
 document.getElementById('dorMaintenance').innerHTML=[dorMetric_('Issues Logged',maint.length),dorMetric_('Resolved',maintResolved.length),dorMetric_('Still Open',maintOpen.length),dorMetric_('PM Completed',pmRows.length),dorMetric_('PM Active Min',pmRows.reduce((n,x)=>n+Number(x.activeMinutes||x.active_minutes||0),0).toFixed(2)),dorMetric_('Repair Active Min',(maintenanceReport.work||maintenanceReport.workSessions||maintenanceReport.sessions||[]).reduce((n,x)=>n+Number(x.activeMinutes||x.active_minutes||0),0).toFixed(2))].join('');
 if(!maintenanceReport.ok&&maintToday.length===0)document.getElementById('dorMaintenance').insertAdjacentHTML('beforeend','<span class="dor-pm-checklist">PM detail unavailable; maintenance fallback loaded from daily state.</span>');
 const checklistRows=shiftResults.flatMap(r=>r.ok?r.checklistActivity||[]:[]),latestChecklist=new Map();checklistRows.forEach(x=>latestChecklist.set(x.shift+':'+x.taskIndex,x));const maintenanceChecklist=[...latestChecklist.values()].filter(x=>x.shift==='MAINTENANCE');if(maintenanceChecklist.length)document.getElementById('dorMaintenance').insertAdjacentHTML('beforeend','<span class="dor-pm-checklist">Maintenance checklist: '+maintenanceChecklist.filter(x=>x.status==='COMPLETE').length+'/'+maintenanceChecklist.length+'</span>');
 const sideAll=work.ok?(work.sideWork||[]):[],side=sideAll.filter(x=>!x.businessDate||dorDateKey_(x.businessDate)===date),shiftAll=shift.ok?[...(shift.shiftNotes||[]),...(shift.notes||[]),...(shift.openNotes||[])]:[],shiftNotes=[...new Map(shiftAll.map(x=>[String(x.noteId||x.note_id||x.id||JSON.stringify(x)),x])).values()],openNotes=(shift.ok?(shift.openNotes||[]):[]).length?(shift.openNotes||[]):shiftNotes.filter(x=>!['RESOLVED','CLOSED','COMPLETE'].includes(String(x.status||'OPEN').toUpperCase())&&['ISSUE','FOLLOWUP','FOLLOW_UP'].includes(String(x.noteType||x.note_type||'').toUpperCase()));
 const noteTime=x=>x.createdAt||x.created_at||x.noteAt||x.note_at||x.enteredAt||x.entered_at||x.timestamp||x.updatedAt||x.updated_at||'',noteText=x=>x.issueInformation||x.issue_information||x.note||x.text||x.message||x.description||x.issue||'',noteShift=x=>String(x.shift||x.shiftName||x.shift_name||x.noteType||x.note_type||x.type||'PASS-ON').replace(/_/g,' '),noteBy=x=>x.enteredBy||x.entered_by||x.createdBy||x.created_by||x.author||x.user||x.actor||'';const reportDateKey=dorDateKey_(date),dailyNotes=shiftNotes.filter(x=>{const bd=x.businessDate||x.business_date||'';return !bd||dorDateKey_(bd)===reportDateKey}).sort((a,b)=>new Date(noteTime(a))-new Date(noteTime(b)));document.getElementById('dorFrontDesk').innerHTML=(dailyNotes.length?dailyNotes.slice(-5).map(x=>'<div class="dor3-passon-note"><b>'+dorEsc_(noteShift(x))+'</b><span>'+dorEsc_(noteText(x)||'Shift note recorded')+'</span><small>'+dorEsc_(noteBy(x))+(noteTime(x)?' • '+dorTime_(noteTime(x)):'')+'</small></div>').join(''):'<div class="dor3-passon-empty">No Front Desk pass-on notes recorded today.</div>')+'<div class="dor3-fd-foot">'+side.filter(x=>String(x.status).toUpperCase()==='COMPLETE').length+' side work complete • '+side.filter(x=>String(x.status).toUpperCase()!=='COMPLETE').length+' outstanding • '+openNotes.length+' open follow-up'+(openNotes.length===1?'':'s')+'</div>';
 const logged=(lostFoundReport&&lostFoundReport.ok)?(lostFoundReport.logged||[]):[],due=(lostFoundReport&&lostFoundReport.ok)?(lostFoundReport.due||[]):[],lfDiag=lostFoundReport?.diagnostic||{};
 document.getElementById('dorLostFound').innerHTML=(!logged.length&&!due.length)?'<b>0</b> logged today <span>•</span> <b>0</b> due':logged.slice(0,2).map(x=>'<div><b>'+dorEsc_(x.id)+'</b> '+dorEsc_(x.description)+'</div>').concat(due.slice(0,2).map(x=>'<div class="dor-alert"><b>ACTION REQUIRED</b> '+dorEsc_(x.id)+' '+dorEsc_(x.description)+'</div>')).join('');
 const ex=[];if(Math.max(0,assignments.length-passed))ex.push(Math.max(0,assignments.length-passed)+' assigned room(s) not passed');if(holds.length)ex.push(holds.length+' room-blocking maintenance hold(s)');const nonBlockingOpen=Math.max(0,maintOpen.length-holds.length);if(nonBlockingOpen)ex.push(nonBlockingOpen+' non-blocking maintenance issue(s) still open');if(side.filter(x=>String(x.status).toUpperCase()!=='COMPLETE').length)ex.push(side.filter(x=>String(x.status).toUpperCase()!=='COMPLETE').length+' side-work item(s) outstanding');if(openNotes.length)ex.push(openNotes.length+' open shift follow-up(s)');if(due.length)ex.push(due.length+' Lost & Found item(s) due for disposition');
 document.getElementById('dorExceptions').innerHTML=ex.length?ex.slice(0,5).map(x=>'<div class="dor-exception"><b>!</b><span>'+dorEsc_(x)+'</span></div>').join(''):'<div class="dor-all-clear"><b>✓</b><span>NO OPEN<br>OPERATIONAL ISSUES</span></div>';
 const events=[];if(syncSorted.length){const x=syncSorted[0];events.push([x.syncedAt||x.createdAt||x.timestamp,'First Choice sync']);if(syncSorted.length>1){const y=syncSorted.at(-1);events.push([y.syncedAt||y.createdAt||y.timestamp,'Final Choice sync'])}}const cleanEnd=x=>x.completedAt||x.endTime||x.completed_at||x.end_time||x.readyAt||x.ready_at||x.completed||x.endedAt||x.ended_at||x.end||'',firstClean=clean.filter(x=>cleanEnd(x)).sort((a,b)=>new Date(cleanEnd(a))-new Date(cleanEnd(b)))[0];if(firstClean)events.push([cleanEnd(firstClean),'First room ready • '+(firstClean.room||'')]);const firstIns=ins.filter(x=>x.completedAt||x.inspectedAt||x.updatedAt).sort((a,b)=>new Date(a.completedAt||a.inspectedAt||a.updatedAt)-new Date(b.completedAt||b.inspectedAt||b.updatedAt))[0];if(firstIns)events.push([firstIns.completedAt||firstIns.inspectedAt||firstIns.updatedAt,'First inspection • Room '+(firstIns.room||'')]);maint.filter(x=>x.resolvedAt||x.completedAt).slice(0,2).forEach(x=>events.push([x.resolvedAt||x.completedAt,'Maintenance resolved • Room '+(x.room||'')]));pmRows.slice(0,2).forEach(x=>events.push([x.completedAt||x.completed_at,'PM completed • Room '+(x.room||'')+' • '+(x.completedBy||x.completed_by||'')]));logged.slice(0,1).forEach(x=>events.push([x.foundAt,'Lost & Found logged • '+x.id]));
 events.sort((a,b)=>new Date(a[0])-new Date(b[0]));document.getElementById('dorTimeline').innerHTML=events.length?events.slice(-7).map(e=>'<div><b>'+dorTime_(e[0])+'</b><span>'+dorEsc_(e[1])+'</span></div>').join(''):'<div><span>No significant activity recorded.</span></div>';const photoRefs=[],seenPhotos=new Set(),addPhoto=(x,priority,label,time)=>{const ref=x.photoRef||x.photoId||x.fileId;if(!ref||seenPhotos.has(ref))return;seenPhotos.add(ref);photoRefs.push({ref,label,time:time||x.createdAt||x.capturedAt||x.updatedAt||'',priority})};roomPhotos.forEach(x=>addPhoto(x,1,'Room '+(x.room||'')+' • Passed room highlight',x.capturedAt));propertyWalkPhotos.forEach(x=>addPhoto(x,2,(x.area||'Property Walk')+' • '+(x.caption||'Property walk'),x.capturedAt));maint.filter(x=>x.photoRef&&['RESOLVED','COMPLETE','CLOSED'].includes(String(x.status||'').toUpperCase())).forEach(x=>addPhoto(x,3,'Room '+(x.room||'')+' • Maintenance resolved',x.resolvedAt));issues.filter(x=>x.photoRef&&issueState(x).includes('FIXED')).forEach(x=>addPhoto(x,4,'Room '+(x.room||'')+' • Corrected inspection item',x.updatedAt));maint.filter(x=>x.photoRef).forEach(x=>addPhoto(x,5,'Room '+(x.room||'')+' • Maintenance',x.createdAt));issues.filter(x=>x.photoRef).forEach(x=>addPhoto(x,6,'Room '+(x.room||'')+' • '+(x.description||x.note||'Inspection photo'),x.createdAt));photoRefs.sort((a,b)=>a.priority-b.priority||new Date(b.time)-new Date(a.time));const photoHost=document.getElementById('dorPhotos'),shownPhotos=photoRefs.slice(0,4);photoHost.dataset.count=String(shownPhotos.length);photoHost.innerHTML=shownPhotos.length?shownPhotos.map((x,i)=>'<div class="dor-photo" data-photo="'+dorEsc_(x.ref)+'"><div class="dor-photo-loading">PHOTO '+(i+1)+'</div><small>'+dorEsc_(x.label)+'</small></div>').join(''):'<div class="dor-photo-empty">Photos captured during inspections, maintenance and property walks will tell the story of the day here.</div>';for(const el of photoHost.querySelectorAll('.dor-photo')){try{const r=await apiPost({action:'getInspectionPhoto',photoRef:el.dataset.photo},45000);if(r.ok&&r.dataUrl)el.insertAdjacentHTML('afterbegin','<img src="'+r.dataUrl+'" alt="">')}catch(_){}}
}
document.getElementById('openDailyOperationsReport')?.addEventListener('click',()=>{document.getElementById('reportLibrary').hidden=true;document.getElementById('dailyOperationsReport').hidden=false;loadDailyOperationsReport_()});
document.getElementById('backToReports')?.addEventListener('click',()=>{document.getElementById('dailyOperationsReport').hidden=true;document.getElementById('reportLibrary').hidden=false});
document.getElementById('printDailyReport')?.addEventListener('click',()=>window.print());
async function relayFileDataUrl_(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read photo'));r.readAsDataURL(file)})}
document.getElementById('addPropertyWalkPhoto')?.addEventListener('click',()=>{document.getElementById('propertyWalkPhotoPanel').hidden=false;document.getElementById('propertyWalkPhotoMessage').textContent=''});
document.getElementById('closePropertyWalkPhoto')?.addEventListener('click',()=>document.getElementById('propertyWalkPhotoPanel').hidden=true);
document.getElementById('savePropertyWalkPhoto')?.addEventListener('click',async()=>{
 const area=document.getElementById('propertyWalkArea').value.trim(),caption=document.getElementById('propertyWalkCaption').value.trim(),file=document.getElementById('propertyWalkPhoto').files[0],msg=document.getElementById('propertyWalkPhotoMessage'),btn=document.getElementById('savePropertyWalkPhoto');
 if(!area||!file){msg.textContent='Area and photo are required.';return}
 btn.disabled=true;btn.textContent='SAVING…';
 try{const photoBase64=await relayFileDataUrl_(file);const sessionId=localStorage.getItem('relaySessionId')||'';const r=await apiPost({action:'savePropertyWalkPhoto',sessionId,propertyId:'CO534',businessDate:housekeepingBusinessDate(),area,caption,category:'PROPERTY_WALK',photoBase64,photoMimeType:file.type||'image/jpeg'},45000);if(!r.ok)throw new Error(r.reason||r.error||'Save failed');msg.textContent='✓ Property walk photo saved. It is now available to the Daily Operations Report.';document.getElementById('propertyWalkArea').value='';document.getElementById('propertyWalkCaption').value='';document.getElementById('propertyWalkPhoto').value='';setTimeout(()=>document.getElementById('propertyWalkPhotoPanel').hidden=true,1200)}catch(e){msg.textContent='Could not save: '+e.message}finally{btn.disabled=false;btn.textContent='SAVE PROPERTY WALK PHOTO'}
});





/* RELAY Inspector Performance Report — locked design */
function iprRange_(){const v=document.getElementById('iprRange')?.value||'30',end=new Date();let days=v==='TODAY'?1:Number(v||30);const start=new Date(end);start.setDate(end.getDate()-days+1);return {start:hkprDate_(start),end:hkprDate_(end),days}}
function iprInspectorName_(x){return String(x.inspector||x.inspectorName||x.inspector_name||x.completedBy||x.completed_by||x.createdBy||x.created_by||'').trim()}
function iprInspectionMinutes_(x){for(const k of ['activeMinutes','active_minutes','inspectionMinutes','inspection_minutes','durationMinutes','duration_minutes','minutes']){const n=Number(x?.[k]);if(Number.isFinite(n)&&n>0)return n}const s=x?.startedAt||x?.started_at||x?.startAt||x?.start_at,e=x?.completedAt||x?.completed_at||x?.endedAt||x?.ended_at||x?.submittedAt||x?.submitted_at;if(s&&e){const n=(new Date(e)-new Date(s))/60000;if(Number.isFinite(n)&&n>0)return n}return 0}
function iprFmt_(n){n=Math.round(Number(n)||0);return n>=60?Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m':n+'m'}
function iprSpark_(host,values,pass){if(!host)return;const vals=values.map(x=>Number(x)||0),max=Math.max(...vals,1),min=0;host.innerHTML='<div class="ipr-spark '+(pass?'pass':'')+'>'+vals.map((v,i)=>'<i style="height:'+Math.max(8,Math.round(((v-min)/(max-min||1))*65))+'px"><span>W'+(i+1)+'</span></i>').join('')+'</div>'}
async function loadInspectorPerformanceReport_(){
 const status=document.getElementById('iprStatus'),select=document.getElementById('iprInspector');if(!status||!select)return;status.textContent='LOADING';const r=iprRange_();
 try{
  const {states}=await hkprLoadDays_(r),ins=[],issues=[];
  states.filter(x=>x.ok).forEach(x=>{(x.inspections||[]).forEach(y=>ins.push({...y,_date:x._date}));(x.inspectionIssues||[]).forEach(y=>issues.push({...y,_date:x._date}))});
  const names=[...new Set(ins.map(iprInspectorName_).filter(Boolean))].sort(),old=select.value;select.innerHTML=names.length?names.map(n=>'<option value="'+dorEsc_(n)+'">'+dorEsc_(n)+'</option>').join(''):'<option value="">No inspector activity</option>';if(names.includes(old))select.value=old;const name=select.value;if(!name){status.textContent='NO DATA';return}
  status.textContent='ACTIVE';document.getElementById('iprGenerated').textContent='Generated '+new Date().toLocaleString();
  const mineIns=ins.filter(x=>hkprName_(iprInspectorName_(x))===hkprName_(name)),rooms=new Set(mineIns.map(x=>String(x.room||'')).filter(Boolean)),mineIssues=issues.filter(x=>{const explicit=iprInspectorName_(x);if(explicit)return hkprName_(explicit)===hkprName_(name);return rooms.has(String(x.room||''))});
  const times=mineIns.map(iprInspectionMinutes_).filter(x=>x>0),avg=times.length?times.reduce((a,b)=>a+b,0)/times.length:0,fast=times.length?Math.min(...times):0,slow=times.length?Math.max(...times):0,sorted=[...times].sort((a,b)=>a-b),median=sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):0,total=times.reduce((a,b)=>a+b,0);
  const issueRooms=new Set(mineIssues.map(x=>String(x.room||'')).filter(Boolean)),firstPass=Math.max(0,rooms.size-issueRooms.size),firstRate=rooms.size?Math.round(firstPass/rooms.size*100):0;
  const fixed=mineIssues.filter(x=>hkprIssueState_(x).includes('INSPECTOR')||hkprIssueState_(x)==='FIXED'),sent=mineIssues.filter(x=>!fixed.includes(x)),accepted=new Set(mineIns.filter(x=>String(x.status||'').toUpperCase().includes('PASS')||String(x.status||'').toUpperCase().includes('COMPLETE')).map(x=>String(x.room||'')).filter(Boolean)),acceptRate=rooms.size?Math.round((accepted.size||rooms.size)/rooms.size*100):0;
  document.getElementById('iprRooms').textContent=rooms.size;document.getElementById('iprAvg').textContent=avg?iprFmt_(avg):'—';document.getElementById('iprAvgDetail').textContent='Fastest '+(fast?iprFmt_(fast):'—')+' • Slowest '+(slow?iprFmt_(slow):'—');document.getElementById('iprFirstPass').textContent=rooms.size?firstRate+'%':'—';document.getElementById('iprPassDetail').textContent=rooms.size?firstPass+' / '+rooms.size+' rooms':'—';document.getElementById('iprIssueRooms').textContent=issueRooms.size;document.getElementById('iprIssueRoomDetail').textContent=rooms.size?Math.round(issueRooms.size/rooms.size*100)+'% • '+issueRooms.size+' / '+rooms.size+' rooms':'—';document.getElementById('iprAcceptance').textContent=rooms.size?acceptRate+'%':'—';document.getElementById('iprAcceptanceDetail').textContent=rooms.size?(accepted.size||rooms.size)+' / '+rooms.size+' rooms':'—';
  document.getElementById('iprIssues').textContent=mineIssues.length;document.getElementById('iprSentBack').textContent=sent.length;document.getElementById('iprSentBackPct').textContent=mineIssues.length?Math.round(sent.length/mineIssues.length*100)+'% • I Fixed It':'—';document.getElementById('iprFixed').textContent=fixed.length;document.getElementById('iprFixedPct').textContent=mineIssues.length?Math.round(fixed.length/mineIssues.length*100)+'%':'—';
  const types=new Map();mineIssues.forEach(x=>{const k=hkprIssueLabel_(x);types.set(k,(types.get(k)||0)+1)});document.getElementById('iprTypes').innerHTML=hkprTable_(['Issue Type','Occurrences'],[...types.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([k,v])=>[dorEsc_(k),v]));document.getElementById('iprTimeAnalysis').innerHTML=hkprTable_(['Measure','Time'],[['Average Inspection Time',avg?iprFmt_(avg):'—'],['Fastest Inspection',fast?iprFmt_(fast):'—'],['Slowest Inspection',slow?iprFmt_(slow):'—'],['Median Inspection Time',median?iprFmt_(median):'—'],['Total Inspection Time',total?iprFmt_(total):'—']]);
  const recent=[...mineIssues].sort((a,b)=>new Date(b.createdAt||b.created_at||b._date)-new Date(a.createdAt||a.created_at||a._date)).slice(0,4),ph=document.getElementById('iprPhotos');ph.innerHTML=recent.length?recent.map(x=>'<article class="ipr-photo"><div class="ipr-photo-img" data-ref="'+dorEsc_(hkprPhotoRef_(x))+'">PHOTO</div><div><strong>Room '+dorEsc_(x.room||'—')+' • '+dorEsc_(hkprIssueLabel_(x))+'</strong><span>'+dorEsc_(x.note||x.description||'Inspection issue recorded')+'</span><small>'+dorEsc_(x._date||hkprBusinessDate_(x))+' • '+(fixed.includes(x)?'Fixed by Inspector':'Sent to HK')+'</small></div></article>').join(''):'<p>No inspection issues recorded for this period.</p>';
  for(const el of ph.querySelectorAll('[data-ref]')){if(!el.dataset.ref)continue;try{const p=await apiPost({action:'getInspectionPhoto',photoRef:el.dataset.ref},45000);if(p.ok&&p.dataUrl)el.innerHTML='<img src="'+p.dataUrl+'" alt="Inspection issue">'}catch(_){}}
  const weekly=[0,1,2,3].map(()=>({rooms:new Set(),issueRooms:new Set(),times:[]}));mineIns.forEach(x=>{const d=x._date||hkprBusinessDate_(x),idx=Math.min(3,Math.max(0,Math.floor((new Date(d+'T12:00:00')-new Date(r.start+'T12:00:00'))/(7*86400000))));weekly[idx].rooms.add(String(x.room||''));const m=iprInspectionMinutes_(x);if(m)weekly[idx].times.push(m)});mineIssues.forEach(x=>{const d=x._date||hkprBusinessDate_(x),idx=Math.min(3,Math.max(0,Math.floor((new Date(d+'T12:00:00')-new Date(r.start+'T12:00:00'))/(7*86400000))));weekly[idx].issueRooms.add(String(x.room||''))});iprSpark_(document.getElementById('iprPassTrend'),weekly.map(w=>w.rooms.size?Math.round((w.rooms.size-w.issueRooms.size)/w.rooms.size*100):0),true);iprSpark_(document.getElementById('iprTimeTrend'),weekly.map(w=>w.times.length?w.times.reduce((a,b)=>a+b,0)/w.times.length:0),false);
 }catch(err){status.textContent='DATA UNAVAILABLE';document.getElementById('iprPhotos').innerHTML='<p>Could not load report: '+dorEsc_(err.message)+'</p>'}
}
document.getElementById('openInspectorPerformanceReport')?.addEventListener('click',()=>{document.getElementById('reportLibrary').hidden=true;document.getElementById('dailyOperationsReport').hidden=true;document.getElementById('housekeeperPerformanceReport').hidden=true;document.getElementById('weeklyOpsReport').hidden=true;document.getElementById('inspectorPerformanceReport').hidden=false;loadInspectorPerformanceReport_()});
document.getElementById('backFromInspectorReport')?.addEventListener('click',()=>{document.getElementById('inspectorPerformanceReport').hidden=true;document.getElementById('reportLibrary').hidden=false});
document.getElementById('printInspectorReport')?.addEventListener('click',()=>window.print());
document.getElementById('iprInspector')?.addEventListener('change',loadInspectorPerformanceReport_);
document.getElementById('iprRange')?.addEventListener('change',loadInspectorPerformanceReport_);

/* RELAY individual Housekeeper Performance Report */
const HKPR_HOURS_KEY='relay.hkpr.actualHours.v1';
function hkprDate_(d){const x=new Date(d);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-')}
function hkprRange_(){const v=document.getElementById('hkprRange')?.value||'30',end=new Date();let days=v==='TODAY'?1:Number(v||30);const start=new Date(end);start.setDate(end.getDate()-days+1);return {start:hkprDate_(start),end:hkprDate_(end),days}}
function hkprName_(v){return String(v||'').trim().toLowerCase()}
function hkprMinutes_(x){for(const k of ['activeMinutes','active_minutes','minutes','durationMinutes','cleaningMinutes','duration_minutes']){const n=Number(x?.[k]);if(Number.isFinite(n)&&n>0)return n}const s=x?.startedAt||x?.started_at||x?.startAt||x?.start_at,e=x?.completedAt||x?.completed_at||x?.endedAt||x?.ended_at||x?.readyAt||x?.ready_at;if(s&&e){const n=(new Date(e)-new Date(s))/60000;if(Number.isFinite(n)&&n>0)return n}return 0}
function hkprIssueState_(x){return String(x?.resolution||x?.status||'').toUpperCase()}
function hkprIssueLabel_(x){return x?.deficiency_label||x?.deficiencyLabel||x?.description||x?.note||'Inspection issue'}
function hkprIssueId_(x){return String(x?.issue_id||x?.issueId||x?.id||'')}
function hkprPhotoRef_(x){return x?.photoRef||x?.photo_ref||''}
function hkprBusinessDate_(x){return dorDateKey_(x?.businessDate||x?.business_date||x?.date||x?.createdAt||x?.created_at||'')}
function hkprInRange_(x,r){const d=hkprBusinessDate_(x);return !d||(d>=r.start&&d<=r.end)}
function hkprFmtMin_(n){n=Math.round(Number(n)||0);if(n<60)return n+'m';return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m'}
function hkprTable_(heads,rows){return '<table><thead><tr>'+heads.map(x=>'<th>'+dorEsc_(x)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+heads.length+'">No activity recorded.</td></tr>')+'</tbody></table>'}
function hkprHoursKey_(name,r){return name+'|'+r.start+'|'+r.end}
function hkprHoursLoad_(name,r){try{return Number(JSON.parse(localStorage.getItem(HKPR_HOURS_KEY)||'{}')[hkprHoursKey_(name,r)]||0)}catch(_){return 0}}
function hkprHoursSave_(name,r,hours){let x={};try{x=JSON.parse(localStorage.getItem(HKPR_HOURS_KEY)||'{}')}catch(_){}x[hkprHoursKey_(name,r)]=Number(hours)||0;localStorage.setItem(HKPR_HOURS_KEY,JSON.stringify(x))}
function hkprSpark_(host,values,pass){if(!host)return;const vals=values.map(x=>Number(x)||0),max=Math.max(...vals,1),min=pass?0:Math.min(...vals,0);host.innerHTML='<div class="hkpr-spark '+(pass?'pass':'')+'>'+vals.map((v,i)=>'<i style="height:'+Math.max(8,Math.round(((v-min)/(max-min||1))*52))+'px"><span>W'+(i+1)+'</span></i>').join('')+'</div>'}
async function hkprLoadDays_(r){
 const dates=[];for(let d=new Date(r.start+'T12:00:00');d<=new Date(r.end+'T12:00:00');d.setDate(d.getDate()+1))dates.push(hkprDate_(d));
 const chunks=[];for(let i=0;i<dates.length;i+=5)chunks.push(dates.slice(i,i+5));
 const states=[],works=[];
 for(const chunk of chunks){const pair=await Promise.all(chunk.flatMap(date=>[
   apiPost({action:'getToday',businessDate:date},45000).catch(()=>({ok:false,businessDate:date})),
   apiPost({action:'getWorkBoard',businessDate:date},45000).catch(()=>({ok:false,businessDate:date}))
 ]));for(let i=0;i<chunk.length;i++){states.push({...pair[i*2],_date:chunk[i]});works.push({...pair[i*2+1],_date:chunk[i]})}}
 return {states,works}
}
async function loadHousekeeperPerformanceReport_(){
 const status=document.getElementById('hkprStatus'),select=document.getElementById('hkprHousekeeper');if(!status||!select)return;
 status.textContent='LOADING';
 const r=hkprRange_(),sid=localStorage.getItem('relaySessionId')||'';
 try{
  const users=await apiPost({action:'getAssignableHousekeepers',sessionId:sid},45000);
  const active=(users.housekeepers||[]).filter(x=>x.active!==false),old=select.value;
  select.innerHTML=active.length?active.map(x=>'<option value="'+dorEsc_(x.name)+'">'+dorEsc_(x.name)+'</option>').join(''):'<option value="">No active housekeepers</option>';
  if(active.some(x=>x.name===old))select.value=old;
  const name=select.value;if(!name){status.textContent='NO ACTIVE STAFF';return}
  status.textContent='ACTIVE';document.getElementById('hkprGenerated').textContent='Generated '+new Date().toLocaleString();
  const {states,works}=await hkprLoadDays_(r),allClean=[],allIns=[],allIssues=[],allSide=[],allSideSessions=[];
  states.filter(x=>x.ok).forEach(x=>{(x.cleaningSessions||[]).forEach(y=>allClean.push({...y,_date:x._date}));(x.inspections||[]).forEach(y=>allIns.push({...y,_date:x._date}));(x.inspectionIssues||[]).forEach(y=>allIssues.push({...y,_date:x._date}))});
  works.filter(x=>x.ok).forEach(x=>{(x.sideWork||[]).forEach(y=>allSide.push({...y,_date:x._date}));(x.sideWorkSessions||[]).forEach(y=>allSideSessions.push({...y,_date:x._date}))});
  const mine=x=>hkprName_(x.housekeeper||x.housekeeper_name||x.assignedTo||x.assigned_to||x.worker)===hkprName_(name);
  const clean=allClean.filter(mine),ins=allIns.filter(mine),issues=allIssues.filter(mine),side=allSide.filter(mine),sideSessions=allSideSessions.filter(mine);
  const finished=clean.filter(x=>['COMPLETE','READY_FOR_INSPECTION'].includes(String(x.status||'').toUpperCase())),rooms=new Set(finished.map(x=>String(x.room||'')).filter(Boolean)),cleanMinutes=finished.reduce((n,x)=>n+hkprMinutes_(x),0),avg=rooms.size&&cleanMinutes?cleanMinutes/rooms.size:0;
  const issueRooms=new Set(issues.map(x=>String(x.room||'')).filter(Boolean)),inspectedRooms=new Set(ins.map(x=>String(x.room||'')).filter(Boolean)),firstPassRooms=new Set([...inspectedRooms].filter(room=>!issues.some(i=>String(i.room||'')===room))),firstRate=inspectedRooms.size?Math.round(firstPassRooms.size/inspectedRooms.size*100):0;
  const hkCorrections=issues.filter(x=>{const st=hkprIssueState_(x);return st.includes('REWORK')||st.includes('HOUSEKEEPER')||st==='FIXED_BY_INSPECTOR'}),rwRooms=new Set(hkCorrections.map(x=>String(x.room||'')).filter(Boolean));
  const reworkMinutes=hkCorrections.reduce((n,x)=>n+Number(x.reworkMinutes||x.rework_minutes||x.correctionMinutes||x.correction_minutes||0),0);
  document.getElementById('hkprRooms').textContent=rooms.size;document.getElementById('hkprAvg').textContent=avg?Math.round(avg)+'m':'—';document.getElementById('hkprFirstPass').textContent=inspectedRooms.size?firstRate+'%':'—';document.getElementById('hkprPassDetail').textContent=inspectedRooms.size?firstPassRooms.size+' of '+inspectedRooms.size+' rooms':'No inspections';
  document.getElementById('hkprReworkRooms').textContent=rwRooms.size;document.getElementById('hkprReworkDetail').textContent=hkCorrections.length+' corrections • '+hkprFmtMin_(reworkMinutes);
  document.getElementById('hkprQuality').innerHTML=hkprTable_(['Measure','Result'],[['Rooms inspected',inspectedRooms.size],['Passed first inspection',firstPassRooms.size+' ('+firstRate+'%)'],['Required correction',issueRooms.size]]);
  const groups=new Map();issues.forEach(x=>{const k=hkprIssueLabel_(x);groups.set(k,(groups.get(k)||0)+1)});document.getElementById('hkprFailures').innerHTML=hkprTable_(['Issue','Occurrences'],[...groups.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>[dorEsc_(k),v]));
  const recent=[...issues].sort((a,b)=>new Date(b.createdAt||b.created_at||b._date)-new Date(a.createdAt||a.created_at||a._date)).slice(0,4),photoHost=document.getElementById('hkprPhotos');
  photoHost.innerHTML=recent.length?recent.map((x,i)=>'<article class="hkpr-photo"><div class="hkpr-photo-img" data-ref="'+dorEsc_(hkprPhotoRef_(x))+'">PHOTO</div><div><strong>Room '+dorEsc_(x.room||'—')+' • '+dorEsc_(hkprIssueLabel_(x))+'</strong><span>'+dorEsc_(x.note||x.description||'Inspection correction')+'</span><small>'+dorEsc_(x._date||hkprBusinessDate_(x))+' • '+dorEsc_(hkprIssueState_(x).replaceAll('_',' ')||'RECORDED')+'</small></div></article>').join(''):'<p>No inspection issues recorded for this period.</p>';
  for(const el of photoHost.querySelectorAll('[data-ref]')){if(!el.dataset.ref)continue;try{const p=await apiPost({action:'getInspectionPhoto',photoRef:el.dataset.ref},45000);if(p.ok&&p.dataUrl)el.innerHTML='<img src="'+p.dataUrl+'" alt="Inspection issue">'}catch(_){}}
  document.getElementById('hkprRwRooms').textContent=rwRooms.size;document.getElementById('hkprCorrections').textContent=hkCorrections.length;document.getElementById('hkprRwAvg').textContent=hkCorrections.length&&reworkMinutes?hkprFmtMin_(reworkMinutes/hkCorrections.length):'—';document.getElementById('hkprRwTime').textContent=hkprFmtMin_(reworkMinutes);
  document.getElementById('hkprReworkList').innerHTML=hkprTable_(['Issue','Corrections'],[...new Map(hkCorrections.map(x=>[hkprIssueLabel_(x),0])).keys()].map(k=>[dorEsc_(k),hkCorrections.filter(x=>hkprIssueLabel_(x)===k).length]));
  const sideByTask=new Map(),sessionByTask=new Map();sideSessions.forEach(x=>{const id=String(x.taskId||x.task_id||'');if(!id)return;sessionByTask.set(id,(sessionByTask.get(id)||0)+hkprMinutes_(x))});
  side.forEach(x=>{const task=String(x.task||x.title||'Side Work').trim(),key=task.toLowerCase().replace(/\s+/g,' '),z=sideByTask.get(key)||{task,assigned:0,done:0,minutes:0};z.assigned++;if(String(x.status||'').toUpperCase()==='COMPLETE')z.done++;z.minutes+=sessionByTask.get(String(x.taskId||x.task_id||''))||hkprMinutes_(x);sideByTask.set(key,z)});
  const sideRows=[...sideByTask.values()],sideAssigned=sideRows.reduce((n,x)=>n+x.assigned,0),sideDone=sideRows.reduce((n,x)=>n+x.done,0),sideMinutes=sideRows.reduce((n,x)=>n+x.minutes,0);
  document.getElementById('hkprSideSummary').innerHTML=[['Assigned',sideAssigned],['Completed',sideDone],['Completion',sideAssigned?Math.round(sideDone/sideAssigned*100)+'%':'—'],['Total Time',hkprFmtMin_(sideMinutes)]].map(x=>'<div><strong>'+x[1]+'</strong><small>'+x[0]+'</small></div>').join('');
  document.getElementById('hkprSideWork').innerHTML=hkprTable_(['Side Work','Assigned','Completed','Time'],sideRows.map(x=>[dorEsc_(x.task),x.assigned,x.done,hkprFmtMin_(x.minutes)]));
  const tracked=cleanMinutes+sideMinutes+reworkMinutes,hours=hkprHoursLoad_(name,r);document.getElementById('hkprActualHours').value=hours||'';
  document.getElementById('hkprEfficiency').innerHTML=[['Actual Hours Worked',hours?hours.toFixed(2)+' hrs':'Not entered'],['Room Cleaning Time',hkprFmtMin_(cleanMinutes)],['Side Work Time',hkprFmtMin_(sideMinutes)],['Rework Time',hkprFmtMin_(reworkMinutes)],['Total RELAY Tracked Time',hkprFmtMin_(tracked)]].map(x=>'<div><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
  const coverage=hours?Math.min(100,Math.round((tracked/60)/hours*100)):0;document.getElementById('hkprCoverage').textContent=hours?coverage+'%':'Enter actual hours';document.getElementById('hkprCoverageBar').style.width=coverage+'%';
  const weekBuckets=[0,0,0,0],weekClean=[[],[],[],[]];issues.forEach(x=>{const d=x._date||hkprBusinessDate_(x),idx=Math.min(3,Math.max(0,Math.floor((new Date(d+'T12:00:00')-new Date(r.start+'T12:00:00'))/(7*86400000))));weekBuckets[idx]++});finished.forEach(x=>{const d=x._date||hkprBusinessDate_(x),idx=Math.min(3,Math.max(0,Math.floor((new Date(d+'T12:00:00')-new Date(r.start+'T12:00:00'))/(7*86400000))));const m=hkprMinutes_(x);if(m)weekClean[idx].push(m)});const weeklyIns=[0,0,0,0];ins.forEach(x=>{const d=x._date||hkprBusinessDate_(x),idx=Math.min(3,Math.max(0,Math.floor((new Date(d+'T12:00:00')-new Date(r.start+'T12:00:00'))/(7*86400000))));weeklyIns[idx]++});hkprSpark_(document.getElementById('hkprPassTrend'),weeklyIns.map((n,i)=>n?Math.max(0,Math.round((n-weekBuckets[i])/n*100)):0),true);hkprSpark_(document.getElementById('hkprCleanTrend'),weekClean.map(x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0),false);
 }catch(err){status.textContent='DATA UNAVAILABLE';document.getElementById('hkprPhotos').innerHTML='<p>Could not load report: '+dorEsc_(err.message)+'</p>'}
}
document.getElementById('openHousekeeperPerformanceReport')?.addEventListener('click',()=>{document.getElementById('reportLibrary').hidden=true;document.getElementById('dailyOperationsReport').hidden=true;document.getElementById('weeklyOpsReport').hidden=true;document.getElementById('housekeeperPerformanceReport').hidden=false;loadHousekeeperPerformanceReport_()});
document.getElementById('backFromHousekeeperReport')?.addEventListener('click',()=>{document.getElementById('housekeeperPerformanceReport').hidden=true;document.getElementById('reportLibrary').hidden=false});
document.getElementById('printHousekeeperReport')?.addEventListener('click',()=>window.print());
document.getElementById('hkprHousekeeper')?.addEventListener('change',loadHousekeeperPerformanceReport_);
document.getElementById('hkprRange')?.addEventListener('change',loadHousekeeperPerformanceReport_);
document.getElementById('hkprSaveHours')?.addEventListener('click',()=>{const name=document.getElementById('hkprHousekeeper').value,r=hkprRange_(),h=Number(document.getElementById('hkprActualHours').value);if(!name||!Number.isFinite(h)||h<0){alert('Enter the actual ADP hours for this housekeeper and period.');return}hkprHoursSave_(name,r,h);loadHousekeeperPerformanceReport_()});

async function loadWeeklyOpsReport_(){
  const host=document.getElementById('weeklyOpsReport'); if(!host||!currentUser)return;
  host.hidden=false;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  const metric=(label,value)=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>';
  try{
    const date=await loadRelayBusinessDay_();
    set('weeklyOpsPeriod',date?'RELAY business day '+date:'Current RELAY business day');
    const [today,work,maintenanceReport]=await Promise.all([
      apiPost({action:'getToday',businessDate:date},45000),
      apiPost({action:'getWorkBoard'},45000),
      apiPost({action:'getMaintenanceReport',sessionId:localStorage.getItem('relaySessionId'),businessDate:date},45000)
    ]);
    if(!today.ok)throw new Error(today.error||today.reason||'Could not load RELAY operations');
    const assignments=today.assignments||[],clean=today.cleaningSessions||[],ins=today.inspections||[],
          issues=today.inspectionIssues||[],maint=maintenanceReport.ok?maintenanceReport.maintenance:[],
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
      metric('PM completed',(maintenanceReport.pmCompletions||[]).length),metric('PM active minutes',(maintenanceReport.pmCompletions||[]).reduce((n,x)=>n+(x.activeMinutes||0),0).toFixed(2)),
      metric('Maintenance logged',maint.filter(x=>dorDateKey_(x.business_date)===dorDateKey_(date)).length),metric('Maintenance open',maintOpen),
      metric('Side duties assigned',side.length),metric('Side duties complete',sideDone),
      metric('Side duties outstanding',Math.max(0,side.length-sideDone))
    ].join('');
    // Performance layer: keep Housekeeper output/quality and Inspector acceptance separate.
    const cleanByHk=new Map();
    clean.forEach(s=>{const name=String(s.housekeeper||'').trim();if(!name)return;const x=cleanByHk.get(name)||{rooms:new Set(),minutes:0,sessions:0};x.rooms.add(String(s.room||''));x.sessions++;const mins=Number(s.minutes||s.durationMinutes||s.cleaningMinutes||0);if(Number.isFinite(mins))x.minutes+=mins;cleanByHk.set(name,x)});
    const issuesByHk=new Map();
    issues.forEach(i=>{const name=String(i.housekeeper||'').trim();if(!name)return;const x=issuesByHk.get(name)||{misses:0,fixed:0,rework:0};x.misses++;const st=String(i.status||'').toUpperCase();if(st==='FIXED_BY_INSPECTOR')x.fixed++;if(['REWORK_REQUIRED','REWORK_IN_PROGRESS','REWORK_COMPLETE'].includes(st))x.rework++;issuesByHk.set(name,x)});
    const hkNames=[...new Set([...assignments.map(a=>a.housekeeper),...cleanByHk.keys(),...issuesByHk.keys()].filter(Boolean))].sort();
    const hkBody=document.getElementById('wrHousekeeperPerformance');
    if(hkBody)hkBody.innerHTML=hkNames.length?hkNames.map(name=>{const a=assignments.filter(x=>x.housekeeper===name).length,c=cleanByHk.get(name)||{rooms:new Set(),minutes:0},q=issuesByHk.get(name)||{misses:0,fixed:0,rework:0},rooms=c.rooms.size,avg=rooms&&c.minutes?Math.round(c.minutes/rooms):'—';return '<tr><td><strong>'+name+'</strong></td><td>'+a+'</td><td>'+rooms+'</td><td>'+avg+'</td><td>'+q.misses+'</td><td>'+q.fixed+'</td><td>'+q.rework+'</td></tr>'}).join(''):'<tr><td colspan="7">No housekeeping performance activity recorded for this business day.</td></tr>';

    const inspectorMap=new Map();
    ins.forEach(x=>{const name=String(x.inspector||x.capturedBy||'').trim();if(!name)return;const z=inspectorMap.get(name)||{rooms:0,passed:0,minutes:0,issues:0,fixed:0,rework:0};z.rooms++;if(String(x.status||'').toUpperCase().includes('PASS'))z.passed++;const mins=Number(x.minutes||x.durationMinutes||x.inspectionMinutes||0);if(Number.isFinite(mins))z.minutes+=mins;inspectorMap.set(name,z)});
    issues.forEach(i=>{const name=String(i.inspector||i.capturedBy||i.resolvedBy||'').trim();if(!name||!inspectorMap.has(name))return;const z=inspectorMap.get(name);z.issues++;const st=String(i.status||'').toUpperCase();if(st==='FIXED_BY_INSPECTOR')z.fixed++;if(['REWORK_REQUIRED','REWORK_IN_PROGRESS','REWORK_COMPLETE'].includes(st))z.rework++});
    const inspectorBody=document.getElementById('wrInspectorPerformance');
    if(inspectorBody)inspectorBody.innerHTML=inspectorMap.size?[...inspectorMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,z])=>'<tr><td><strong>'+name+'</strong></td><td>'+z.rooms+'</td><td>'+z.passed+'</td><td>'+(z.rooms&&z.minutes?Math.round(z.minutes/z.rooms):'—')+'</td><td>'+z.issues+'</td><td>'+z.fixed+'</td><td>'+z.rework+'</td></tr>').join(''):'<tr><td colspan="7">No inspector performance activity recorded for this business day.</td></tr>';
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


/* RELAY NIGHT AUDIT HOTEL PERFORMANCE IMPORT */
let relayNightAuditParsed_=null;
function relayAuditNumber_(v){return Number(String(v||'').replace(/[$,%\s,]/g,''))}
function relayAuditDateIso_(mdy){
 const m=String(mdy||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 return m?m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'):'';
}
function parseRelayNightAudit_(text){
 const raw=String(text||'').replace(/\u00a0/g,' ');
 const start=raw.indexOf('Hotel Statistics');
 if(start<0)throw new Error('Hotel Statistics was not found in this PDF.');
 const section=raw.slice(start);
 const property=(section.match(/Property\s*Code:\s*([A-Z0-9]+)/i)||[])[1]||'';
 if(property!=='CO534')throw new Error('This audit is for '+(property||'an unknown property')+', not CO534.');
 const activity=section.indexOf('Checked Out Today');
 if(activity<0)throw new Error("Today's Activity was not found in Hotel Statistics.");
 const tail=section.slice(activity+'Checked Out Today'.length,activity+5000);
 const stop=tail.search(/\bPTD\b/);
 const valueText=stop>=0?tail.slice(0,stop):tail;
 const tokens=valueText.match(/\d{1,2}\/\d{1,2}\/\d{4}|\(?-?\$?[\d,]+(?:\.\d+)?%?\)?/g)||[];
 const groups=[];let g=null;
 tokens.forEach(t=>{
   if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)){g={date:t,values:[]};groups.push(g)}
   else if(g)g.values.push(t);
 });
 if(groups.length<5)throw new Error('Hotel Statistics values could not be read reliably.');
 const room=groups[0].values,perf=groups[1].values,rev=groups[2].values,guest=groups[3].values,act=groups[4].values;
 if(room.length<9||perf.length<9||rev.length<5||guest.length<6||act.length<5)throw new Error('Hotel Statistics is incomplete in this PDF.');
 const result={
   propertyId:property,businessDate:relayAuditDateIso_(groups[0].date),displayDate:groups[0].date,
   performance:{
     occupancy:relayAuditNumber_(perf[0]),adr:relayAuditNumber_(perf[4]),revpar:relayAuditNumber_(perf[7]),
     roomsSold:relayAuditNumber_(room[5]),roomRevenue:relayAuditNumber_(rev[2]),
     checkIns:relayAuditNumber_(act[0])+relayAuditNumber_(act[1]),checkOuts:relayAuditNumber_(act[4]),
     stayovers:relayAuditNumber_(room[4]),noShows:relayAuditNumber_(act[2])
   }
 };
 const p=result.performance;
 if(!result.businessDate||Object.values(p).some(v=>!Number.isFinite(v)))throw new Error('One or more required Hotel Statistics values could not be read.');
 return result;
}
function relayNightAuditPreviewHtml_(x){
 const p=x.performance,m=n=>n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}),pct=n=>n.toLocaleString('en-US',{maximumFractionDigits:2})+'%';
 return '<div class="night-audit-recognized"><b>✓ Night Audit recognized</b><span>Business Date: '+x.displayDate+' &nbsp; • &nbsp; Property: '+x.propertyId+' &nbsp; • &nbsp; Hotel Statistics found ✓</span></div>'+
 '<div class="night-audit-grid">'+[
 ['Occupancy',pct(p.occupancy)],['ADR',m(p.adr)],['RevPAR',m(p.revpar)],['Rooms Sold',p.roomsSold],['Room Revenue',m(p.roomRevenue)],
 ['Check-Ins',p.checkIns],['Check-Outs',p.checkOuts],['Stayovers',p.stayovers],['No-Shows',p.noShows]
 ].map(v=>'<div><small>'+v[0]+'</small><strong>'+v[1]+'</strong></div>').join('')+'</div>';
}
(function initRelayNightAudit_(){
 const open=document.getElementById('openNightAuditImport'),panel=document.getElementById('nightAuditImportPanel'),close=document.getElementById('closeNightAuditImport'),input=document.getElementById('nightAuditPdf'),status=document.getElementById('nightAuditStatus'),preview=document.getElementById('nightAuditPreview'),save=document.getElementById('importNightAudit');
 if(!open||!panel||!input)return;
 open.addEventListener('click',()=>{panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'})});
 close?.addEventListener('click',()=>panel.hidden=true);
 input.addEventListener('change',async()=>{
   const file=input.files?.[0];relayNightAuditParsed_=null;save.disabled=true;preview.hidden=true;
   if(!file)return;
   if(!(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))){status.textContent='Choose a PDF file.';return}
   status.textContent='Reading Hotel Statistics…';
   try{
     const pdfjs=await loadPdfJs(),bytes=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data:bytes}).promise;
     let text='';
     for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),content=await page.getTextContent();text+='\n'+content.items.map(i=>i.str).join(' ')}
     relayNightAuditParsed_=parseRelayNightAudit_(text);
     relayNightAuditParsed_.sourceFilename=file.name;
     preview.innerHTML=relayNightAuditPreviewHtml_(relayNightAuditParsed_);preview.hidden=false;save.disabled=false;
     status.textContent='Review the nine values below, then import.';
   }catch(err){status.textContent='Could not read audit: '+err.message}
 });
 save.addEventListener('click',async()=>{
   if(!relayNightAuditParsed_)return;
   save.disabled=true;save.textContent='IMPORTING…';status.textContent='Saving Hotel Performance…';
   try{
     const x=relayNightAuditParsed_,r=await apiPost({action:'saveHotelPerformance',propertyId:x.propertyId,businessDate:x.businessDate,performance:x.performance,sourceFilename:x.sourceFilename,importedBy:currentUser?.name||''},45000);
     if(!r.ok)throw new Error(r.error||'Import failed');
     relayViewCache.clear();status.textContent='✓ '+x.displayDate+' Night Audit imported. Hotel Performance is filed with that business day. Close this panel to view it in the report.';
     save.textContent='IMPORTED ✓';
   }catch(err){status.textContent='Import failed: '+err.message;save.disabled=false;save.textContent='IMPORT AUDIT'}
 });
})();
