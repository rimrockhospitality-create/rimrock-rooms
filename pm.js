/* RELAY preventive maintenance — Ryan Kelly, CO534. */
let pmRoom='',pmState={},pmBoard=null,pmActive=null,pmMonth='',pmTab='calendar',pmSaving=Promise.resolve(),pmSaveTimer=null,pmPendingDraft=null,pmDraftRunning=false;
const pmEsc=v=>dorEsc_(v);
async function pmApi(action,data={}){const r=await apiPost({action,sessionId:localStorage.getItem('relaySessionId'),...data},45000);if(!r.ok)throw new Error(r.reason||r.error||'PM request failed');return r;}
function pmItems(){return ROOM_PM_TASKS.flatMap((t,i)=>pmState[i]?.status?[{index:i,name:t[0],...pmState[i]}]:[]);}
async function loadPmBoard_(){
 const host=document.getElementById('pmCalendar');
 try{if(pmActive&&pmActive.status!=='SAVING'&&!document.getElementById('pmRoomDetail').hidden)await pmSaveDraft();pmBoard=await pmApi('getPmBoard');document.querySelector('#pmView .pm-tabs').hidden=false;document.getElementById('pmRoomDetail').hidden=true;host.hidden=false;if(!pmMonth)pmMonth=dorDateKey_(pmBoard.businessDate).slice(0,7);renderPmBoard_();}
 catch(e){host.innerHTML='<p role="alert">Could not load PM: '+pmEsc(e.message)+'</p><button id="pmReload">TRY AGAIN</button>';}
}
function renderPmBoard_(){
 const b=pmBoard,day=dorDateKey_(b.businessDate),summary=b.summary;
 document.getElementById('pmKpis').innerHTML=[['DUE TODAY',summary.dueToday],['NEXT 7 DAYS',summary.next7],['OVERDUE',summary.overdue],['COMPLETED TODAY',summary.completedToday]].map(([l,v])=>'<article><small>'+l+'</small><strong>'+v+'</strong></article>').join('');
 let html='';
 if(!b.schedule.length){html='<p>No saved PM rotation yet.</p>'+((currentUser.roles||[]).includes('ADMIN')?'<p>Start the 114-room, 12-week rotation on the current RELAY business day. Existing completion history will be preserved.</p><button id="pmInitialize">START ROOM ROTATION</button>':'<p>Your manager needs to start the room rotation.</p>');}
 else if(pmTab==='history')html='<h2>PM Completion History</h2>'+ (b.history.length?b.history.slice().reverse().map(h=>'<article class="pm-room-row"><span><strong>ROOM '+pmEsc(h.room)+'</strong><small>'+pmEsc(h.businessDate)+' • '+pmEsc(h.completedBy)+' • '+(h.activeMinutes===null?'Time not recorded':h.activeMinutes+' active min')+' • '+h.workOrders+' repair tickets</small></span></article>').join(''):'<p>No completed PMs recorded.</p>');
 else{
 const row=r=>'<button class="pm-room-row '+(r.dueDate<day?'overdue':'')+'" data-pm-room="'+pmEsc(r.room)+'"><span><strong>ROOM '+pmEsc(r.room)+'</strong><small>Due '+pmEsc(r.dueDate)+(r.dueDate<day?' • OVERDUE':'')+(r.session?' • '+pmEsc(r.session.worker)+' • '+r.session.status.replaceAll('_',' '):'')+'</small></span><b>'+(r.session?'OPEN PM':'SCAN TO START')+' →</b></button>';
 if(pmTab==='calendar'){
 const [y,m]=pmMonth.split('-').map(Number),days=new Date(y,m,0).getDate(),first=new Date(y,m-1,1).getDay();
 html='<div class="pm-month-head"><button data-pm-month="-1">‹</button><h2>'+pmEsc(new Date(y,m-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'}))+'</h2><button data-pm-month="1">›</button></div><div class="pm-weekdays">'+['SUN','MON','TUE','WED','THU','FRI','SAT'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="pm-calendar-grid">'+'<div></div>'.repeat(first);
 for(let n=1;n<=days;n++){const key=pmMonth+'-'+String(n).padStart(2,'0'),due=b.schedule.filter(r=>r.dueDate===key);html+='<div class="pm-day '+(key===day?'today':'')+'"><b>'+n+'</b>'+due.map(r=>'<button data-pm-room="'+pmEsc(r.room)+'">Room '+pmEsc(r.room)+'</button>').join('')+b.history.filter(h=>h.businessDate===key).map(h=>'<small>✓ '+pmEsc(h.room)+'</small>').join('')+'</div>';}
 html+='</div>';
 }
 const due=b.schedule.filter(r=>r.dueDate<=day||r.session).sort((a,c)=>a.dueDate.localeCompare(c.dueDate));
 html+='<div class="pm-due-list"><h2>Due and In Progress</h2>'+(due.length?due.map(row).join(''):'<p>No rooms due or in progress.</p>')+'</div>';
 }
 document.getElementById('pmCalendar').innerHTML=html;
 document.querySelectorAll('[data-pm-tab]').forEach(x=>x.classList.toggle('active',x.dataset.pmTab===pmTab));
}
function renderPmTasks(){
 const paused=pmActive?.status==='PAUSED',locked=pmActive?.status==='SAVING';
 document.getElementById('pmTasks').innerHTML=ROOM_PM_TASKS.map((t,i)=>{const v=pmState[i]||{};return '<article class="pm-task '+(v.status?'done':'')+'"><span>'+(v.status?'✓':'○')+'</span><div><h4>'+(i+1)+'. '+pmEsc(t[0])+'</h4><p>'+pmEsc(t[1])+'</p>'+(v.status==='WORK_ORDER'?'<label>Repair details<textarea data-pm-note="'+i+'" '+(paused||locked?'disabled':'')+'>'+pmEsc(v.note||'')+'</textarea></label><label>Priority<select data-pm-priority="'+i+'" '+(paused||locked?'disabled':'')+'>'+[['P3_ROUTINE','Routine'],['P1_GUEST_IMPACT','Guest impact'],['P2_ROOM_BLOCKING','Room blocking']].map(([val,label])=>'<option value="'+val+'" '+(v.priority===val?'selected':'')+'>'+label+'</option>').join('')+'</select></label>':'')+'</div><select data-pm-status="'+i+'" '+(paused||locked?'disabled':'')+'>'+[['','STATUS…'],['PASS','PASS'],['CORRECTED','CORRECTED DURING PM'],['WORK_ORDER','WORK ORDER NEEDED'],['NA','N/A']].map(([val,label])=>'<option value="'+val+'" '+(v.status===val?'selected':'')+'>'+label+'</option>').join('')+'</select></article>';}).join('');
 document.getElementById('pmPercent').textContent=Math.round(pmItems().length/ROOM_PM_TASKS.length*100)+'%';
 document.getElementById('pmPause').disabled=locked;document.getElementById('pmSaveDraft').disabled=locked;document.getElementById('pmPause').textContent=paused?'RESUME PM':'PAUSE PM';document.getElementById('pmComplete').disabled=paused;
}
function pmOpenSession(s){document.querySelector('#pmView .pm-tabs').hidden=true;pmActive=s;pmRoom=s.room;pmState=Object.fromEntries((s.items||[]).map(x=>[x.index,x]));document.getElementById('pmCalendar').hidden=true;document.getElementById('pmRoomDetail').hidden=false;document.getElementById('pmRoomTitle').textContent='Room '+pmRoom;document.getElementById('pmSaveStatus').textContent=s.status==='PAUSED'?'PM paused.':'Saved PM session restored.';renderPmTasks();}
function pmSaveDraft(){
 clearTimeout(pmSaveTimer);
 const id=pmActive.pmSessionId,items=pmItems(),msg=document.getElementById('pmSaveStatus');
 if(items.some(x=>x.status==='WORK_ORDER'&&!String(x.note||'').trim())){msg.textContent='Enter repair details to save this work-order item.';return Promise.reject(new Error('Enter repair details for every work-order item.'));}
 // Keep only the latest pending snapshot while a Sheets write is running.
 pmPendingDraft={pmSessionId:id,items};msg.textContent='Saving checklist…';
 if(!pmDraftRunning){pmDraftRunning=true;pmSaving=(async()=>{
  try{while(pmPendingDraft){const draft=pmPendingDraft;pmPendingDraft=null;await pmApi('updatePmSession',draft);}msg.textContent='Checklist saved.';}
  catch(e){pmPendingDraft=null;msg.textContent='Not saved: '+e.message+'. Your entries remain here; use SAVE CHECKLIST to retry.';throw e;}
  finally{pmDraftRunning=false;}
 })();}
 return pmSaving;
}
async function pmStartRoom(room,button){
 button.disabled=true;
 try{
 const known=pmBoard?.sessions.find(s=>s.room===room);let qrId='';
 if(!known){const panel=document.getElementById('maintenanceQrPanel'),box=document.getElementById('maintenanceQrCamera'),msg=document.getElementById('maintenanceQrMessage');document.getElementById('maintenanceQrTitle').textContent='Room '+room+' PM';document.body.appendChild(panel);panel.hidden=false;panel.style.setProperty('display','grid','important');qrId=await relayScanQr_(panel,box,msg,'Scan Room '+room+' to start PM.');closeMaintenanceQr_();}
 const r=await pmApi('startPm',{room,qrId});pmOpenSession(r.session);
 }catch(e){if(e.message!=='Scanner closed')alert('Could not open PM: '+e.message);}finally{button.disabled=false;}
}
document.getElementById('pmView').addEventListener('click',async e=>{
 const room=e.target.closest('[data-pm-room]');if(room){await pmStartRoom(room.dataset.pmRoom,room);return;}
 const tab=e.target.closest('[data-pm-tab]');if(tab){pmTab=tab.dataset.pmTab;renderPmBoard_();return;}
 const month=e.target.closest('[data-pm-month]');if(month){const [y,m]=pmMonth.split('-').map(Number),d=new Date(y,m-1+Number(month.dataset.pmMonth),1);pmMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');renderPmBoard_();return;}
 const button=e.target.closest('button');if(!button)return;
 try{
 if(button.id==='pmReload')await loadPmBoard_();
 if(button.id==='pmInitialize'){button.disabled=true;button.textContent='CREATING ROOM ROTATION…';document.getElementById('pmInitializeStatus')?.remove();button.insertAdjacentHTML('afterend','<p id="pmInitializeStatus" role="status">Saving the room schedule. This may take a moment…</p>');const result=await pmApi('initializePmSchedule');const notice=document.getElementById('pmInitializeStatus');if(notice)notice.textContent=(result.count||114)+' rooms saved. Loading the calendar…';await loadPmBoard_();document.getElementById('pmCalendar').insertAdjacentHTML('afterbegin','<p role="status">✓ Room rotation saved: '+Number(result.count||114)+' rooms.</p>');}
 if(button.id==='pmSaveDraft')await pmSaveDraft();
 if(button.id==='pmBack'){if(pmActive?.status!=='SAVING')await pmSaveDraft();document.getElementById('pmRoomDetail').hidden=true;document.getElementById('pmCalendar').hidden=false;await loadPmBoard_();}
 if(button.id==='pmPause'){button.disabled=true;await pmSaveDraft();const r=await pmApi('updatePmSession',{pmSessionId:pmActive.pmSessionId,items:pmItems(),command:pmActive.status==='PAUSED'?'RESUME':'PAUSE'});pmOpenSession(r.session);}
 if(button.id==='pmComplete'){
 if(pmItems().length!==ROOM_PM_TASKS.length)throw new Error('Complete all 19 checklist items first.');button.disabled=true;button.textContent='SAVING PM…';clearTimeout(pmSaveTimer);if(pmActive.status!=='SAVING')await pmSaveDraft();else await pmSaving.catch(()=>{});
 const r=await pmApi('savePmCompletion',{pmSessionId:pmActive.pmSessionId,items:pmItems()});pmActive=null;pmState={};relayCacheClear_();document.getElementById('pmRoomDetail').hidden=true;document.getElementById('pmCalendar').hidden=false;await loadPmBoard_();alert('PM saved. '+(r.workOrders||0)+' linked repair tickets.');
 }
 }catch(err){if(button.id==='pmInitialize'){const notice=document.getElementById('pmInitializeStatus');if(notice)notice.textContent='Could not confirm setup: '+err.message;}alert('PM could not be saved: '+err.message);}finally{button.disabled=false;if(button.id==='pmInitialize')button.textContent='START ROOM ROTATION';if(button.id==='pmComplete')button.textContent='COMPLETE ROOM PM';}
});
document.getElementById('pmTasks').addEventListener('change',e=>{
 const i=e.target.dataset.pmStatus??e.target.dataset.pmNote??e.target.dataset.pmPriority;if(i===undefined)return;
 const v=pmState[i]||(pmState[i]={});if(e.target.matches('[data-pm-status]')){if(e.target.value){v.status=e.target.value;v.priority=v.priority||'P3_ROUTINE';}else delete pmState[i];renderPmTasks();}
 if(e.target.matches('[data-pm-note]'))v.note=e.target.value;
 if(e.target.matches('[data-pm-priority]'))v.priority=e.target.value;
 clearTimeout(pmSaveTimer);document.getElementById('pmSaveStatus').textContent='Checklist changes pending…';pmSaveTimer=setTimeout(()=>pmSaveDraft().catch(()=>{}),700);
});
