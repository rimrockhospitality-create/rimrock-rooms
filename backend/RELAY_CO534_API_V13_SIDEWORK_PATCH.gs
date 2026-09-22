function relaySideWorkQrId_(location) {
  return 'CO534-LOC-' + String(location || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function startSideWork_(body) {
  const taskId = String(body.taskId || '').trim(), worker = String(body.worker || '').trim(), qrId = String(body.qrId || '').trim();
  if (!taskId || !worker) return jsonResponse_({ok:false,reason:'MISSING_SIDE_WORK_START'});
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const ss=SpreadsheetApp.openById(DATABASE_ID),tasks=relayEnsureWorkSheet_(ss,TAB.SIDE_WORK,[]),tv=tasks.getDataRange().getDisplayValues();
    let tr=0,t=null; for(let i=1;i<tv.length;i++) if(tv[i][0]===taskId){tr=i+1;t=tv[i];break}
    if(!tr)return jsonResponse_({ok:false,reason:'SIDE_WORK_NOT_FOUND'});
    if(t[3]!==worker)return jsonResponse_({ok:false,reason:'WORKER_MISMATCH'});
    if(String(t[9]||'').toUpperCase()==='COMPLETE')return jsonResponse_({ok:false,reason:'SIDE_WORK_ALREADY_COMPLETE'});
    const expectedQr=relaySideWorkQrId_(t[5]); if(qrId&&qrId!==expectedQr)return jsonResponse_({ok:false,reason:'WRONG_LOCATION_QR'});
    const sh=relayEnsureWorkSheet_(ss,TAB.SIDE_WORK_SESSIONS,['session_id','property_id','business_date','task_id','worker','location','started_at','ended_at','status','active_minutes']),sv=sh.getDataRange().getDisplayValues();
    for(let i=1;i<sv.length;i++){const r=sv[i];if(r[1]===PROPERTY_ID&&r[3]===taskId&&r[4]===worker&&String(r[8]).toUpperCase()==='IN_PROGRESS'){if(String(t[9]||'').toUpperCase()!=='IN_PROGRESS')tasks.getRange(tr,10).setValue('IN_PROGRESS');return jsonResponse_({ok:true,sessionId:r[0],taskId:taskId,status:'IN_PROGRESS',startedAt:r[6],reused:true});}}
    const id=Utilities.getUuid(),now=new Date(),next=sh.getLastRow()+1;sh.getRange(next,1,1,10).setValues([[id,PROPERTY_ID,t[2],taskId,worker,t[5],now,'','IN_PROGRESS','']]);sh.getRange(next,7,1,2).setNumberFormats([['m/d/yyyy h:mm:ss','m/d/yyyy h:mm:ss']]);tasks.getRange(tr,10).setValue('IN_PROGRESS');
    return jsonResponse_({ok:true,sessionId:id,taskId:taskId,status:'IN_PROGRESS',startedAt:now.toISOString(),reused:false});
  } finally { lock.releaseLock(); }
}

function completeSideWork_(body) {
  const sessionId=String(body.sessionId||'').trim(); if(!sessionId)return jsonResponse_({ok:false,reason:'SIDE_WORK_SESSION_REQUIRED'});
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const ss=SpreadsheetApp.openById(DATABASE_ID),sh=relayEnsureWorkSheet_(ss,TAB.SIDE_WORK_SESSIONS,[]),hit=relayFindWorkSession_(sh,sessionId);
    if(!hit)return jsonResponse_({ok:false,reason:'SIDE_WORK_SESSION_NOT_FOUND'});
    if(String(hit.data[8]||'').toUpperCase()==='COMPLETE')return jsonResponse_({ok:true,sessionId:sessionId,status:'COMPLETE',activeMinutes:Number(hit.data[9]||0),alreadyComplete:true});
    const now=new Date(),started=new Date(hit.data[6]);if(isNaN(started.getTime()))return jsonResponse_({ok:false,reason:'INVALID_SIDE_WORK_START_TIME'});
    const mins=Math.max(0,Math.round(((now-started)/60000)*100)/100);sh.getRange(hit.row,8,1,3).setValues([[now,'COMPLETE',mins]]);sh.getRange(hit.row,8).setNumberFormat('m/d/yyyy h:mm:ss');
    const sv=sh.getDataRange().getDisplayValues();for(let i=1;i<sv.length;i++){if(i+1!==hit.row&&sv[i][1]===PROPERTY_ID&&sv[i][3]===hit.data[3]&&String(sv[i][8]).toUpperCase()==='IN_PROGRESS'){sh.getRange(i+1,8,1,3).setValues([[now,'DUPLICATE',0]]);sh.getRange(i+1,8).setNumberFormat('m/d/yyyy h:mm:ss');}}
    const tasks=relayEnsureWorkSheet_(ss,TAB.SIDE_WORK,[]),tv=tasks.getDataRange().getDisplayValues();for(let i=1;i<tv.length;i++)if(tv[i][0]===hit.data[3]){tasks.getRange(i+1,10,1,2).setValues([['COMPLETE',now]]);tasks.getRange(i+1,11).setNumberFormat('m/d/yyyy h:mm:ss');break}
    return jsonResponse_({ok:true,sessionId:sessionId,status:'COMPLETE',activeMinutes:mins});
  } finally {lock.releaseLock();}
}

function getWorkBoard_(body) {
  const ss=SpreadsheetApp.openById(DATABASE_ID),bd=String(body.businessDate||currentBusinessDayRecord_().businessDate),worker=String(body.worker||'').trim();
  const out={ok:true,businessDate:bd,assignments:[],cleaningSessions:[],inspectionIssues:[],sideWork:[],sideWorkSessions:[],maintenanceWork:[]};
  const sw=ss.getSheetByName(TAB.SIDE_WORK);if(sw){const v=sw.getDataRange().getDisplayValues();for(let i=1;i<v.length;i++)if(v[i][1]===PROPERTY_ID&&v[i][2]===bd&&(!worker||v[i][3]===worker))out.sideWork.push({taskId:v[i][0],assignedTo:v[i][3],task:v[i][4],location:v[i][5],dueAt:v[i][6],assignedBy:v[i][7],assignedAt:v[i][8],status:v[i][9],completedAt:v[i][10]});}
  const ssws=ss.getSheetByName(TAB.SIDE_WORK_SESSIONS);if(ssws){const v=ssws.getDataRange().getDisplayValues(),activeByTask={};for(let i=1;i<v.length;i++){const r=v[i];if(r[1]===PROPERTY_ID&&r[2]===bd&&(!worker||r[4]===worker)&&String(r[8]).toUpperCase()==='IN_PROGRESS'&&!activeByTask[r[3]]){const session={sessionId:r[0],taskId:r[3],worker:r[4],location:r[5],startedAt:r[6],status:r[8]};activeByTask[r[3]]=session;out.sideWorkSessions.push(session);}}out.sideWork.forEach(function(t){if(activeByTask[t.taskId]){t.sessionId=activeByTask[t.taskId].sessionId;t.startedAt=activeByTask[t.taskId].startedAt;t.status='IN_PROGRESS';}});}
  const as=ss.getSheetByName(TAB.ASSIGNMENTS);if(as){const v=as.getDataRange().getDisplayValues();for(let i=1;i<v.length;i++){const r=v[i];if(r[1]===PROPERTY_ID&&r[2]===bd&&r[8]==='ACTIVE'&&(!worker||r[4]===worker))out.assignments.push({assignment_id:r[0],property_id:r[1],business_date:r[2],room:r[3],housekeeper:r[4],source:r[5],effective_at:r[6],ended_at:r[7],status:r[8],sync_id:r[9]});}}
  const cs=ss.getSheetByName(TAB.CLEANING);if(cs){const v=cs.getDataRange().getDisplayValues();for(let i=1;i<v.length;i++){const r=v[i];if(r[1]===PROPERTY_ID&&r[2]===bd&&(!worker||r[4]===worker))out.cleaningSessions.push({session_id:r[0],property_id:r[1],business_date:r[2],room:r[3],housekeeper:r[4],started_at:r[5],ready_at:r[6],status:r[7],source_assignment_id:r[8]});}}
  const ii=ss.getSheetByName(TAB.INSPECTION_ISSUES);if(ii){const v=ii.getDataRange().getDisplayValues();for(let i=1;i<v.length;i++){const r=v[i],st=String(r[13]).toUpperCase();if(r[2]===PROPERTY_ID&&r[3]===bd&&(!worker||r[5]===worker)&&(st==='REWORK_REQUIRED'||st==='REWORK_IN_PROGRESS'))out.inspectionIssues.push({issue_id:r[0],inspection_id:r[1],property_id:r[2],business_date:r[3],room:r[4],housekeeper:r[5],cleaning_session_id:r[6],inspector:r[7],deficiency_key:r[8],deficiency_label:r[9],note:r[10],photo_ref:r[11],created_at:r[12],status:r[13]});}}
  const mw=ss.getSheetByName(TAB.MAINTENANCE_WORK);if(mw){const v=mw.getDataRange().getDisplayValues();for(let i=1;i<v.length;i++)if(v[i][1]===PROPERTY_ID&&(!worker||v[i][5]===worker))out.maintenanceWork.push({workSessionId:v[i][0],businessDate:v[i][2],maintenanceId:v[i][3],location:v[i][4],worker:v[i][5],startedAt:v[i][6],endedAt:v[i][7],status:v[i][8],pausedMinutes:v[i][10]});}
  return jsonResponse_(out);
}