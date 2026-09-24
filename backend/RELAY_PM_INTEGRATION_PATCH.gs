/* RELAY — Ryan Kelly. Additive PM module; see deployment guide for routing. */
const PM_ROOMS=["101", "102", "103", "104", "105", "106", "108", "110", "112", "122", "123", "124", "125", "127", "128", "129", "130", "131", "132", "133", "135", "201", "202", "203", "204", "205", "206", "208", "209", "210", "211", "212", "213", "215", "216", "217", "218", "219", "220", "221", "222", "223", "224", "225", "227", "228", "229", "230", "231", "232", "233", "235", "301", "302", "303", "304", "305", "306", "308", "309", "310", "311", "312", "313", "315", "316", "317", "318", "319", "320", "321", "322", "323", "324", "325", "327", "328", "329", "330", "331", "332", "333", "335", "401", "402", "403", "404", "405", "406", "408", "409", "410", "411", "412", "413", "415", "416", "417", "418", "419", "420", "421", "422", "423", "424", "425", "427", "428", "429", "430", "431", "432", "433", "435"];
const PM_TASK_NAMES=["PTAC Filter", "PTAC Coils", "PTAC Operation", "Bathroom Exhaust Fan", "Bathroom Plumbing", "Caulk / Grout", "Paint / Patchwork", "Microwave Vent", "Cooktop / Kitchen", "Refrigerator", "Dishwasher", "Furniture / Hardware", "Electrical / Lighting", "Windows / Shades", "Entry Door / Security", "TV / Remote", "Flooring / Baseboards", "Moisture / Pest / Ceiling", "Final Room Condition"];
/* PM integration: server-owned 84-day room rotation, resumable work and linked repairs. */
const PM_SCHEDULE_TAB='PM_SCHEDULE', PM_SESSION_TAB='PM_SESSIONS';
const PM_SCHEDULE_HEADERS=['room','property_id','due_date','interval_days','last_pm_id','last_completed_at'];
const PM_SESSION_HEADERS=['pm_session_id','property_id','business_date','room','user_id','worker','started_at','status','pause_started_at','paused_ms','items_json','completed_at','active_minutes','due_date'];
function pmActor_(body,readOnly){
 const session=authValidateSession_(body.sessionId,false);
 if(!session||session.propertyId!==PROPERTY_ID)throw new Error('AUTH_REQUIRED');
 const roles=readOnly?['ADMIN','INSPECTOR','MAINTENANCE','FRONT DESK']:['ADMIN','INSPECTOR','MAINTENANCE'];
 if(!roles.includes(String(session.role).toUpperCase()))throw new Error('PM_PERMISSION_REQUIRED');
 const hit=authGetUserById_(session.userId);
 if(!hit||String(hit.row[7]).toUpperCase()!=='TRUE')throw new Error('AUTH_REQUIRED');
 return {id:session.userId,name:String(hit.row[2]||hit.row[1]),role:String(session.role).toUpperCase()};
}
function pmRows_(ss,name){const s=ss.getSheetByName(name);return s&&s.getLastRow()>1?s.getDataRange().getValues().slice(1):[];}
function pmDate_(value){
 if(value instanceof Date)return Utilities.formatDate(value,'America/Denver','yyyy-MM-dd');
 const s=String(value||''),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 return m?m[3]+'-'+('0'+m[1]).slice(-2)+'-'+('0'+m[2]).slice(-2):s.slice(0,10);
}
function pmAddDays_(value,n){const d=new Date(pmDate_(value)+'T12:00:00Z');if(isNaN(d))throw new Error('INVALID_PM_DATE');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function pmIso_(v){return v instanceof Date?v.toISOString():String(v||'');}
function pmSession_(r){return {pmSessionId:r[0],businessDate:r[2],room:String(r[3]),userId:r[4],worker:r[5],startedAt:pmIso_(r[6]),status:r[7],items:JSON.parse(r[10]||'[]'),completedAt:pmIso_(r[11]),activeMinutes:Number(r[12]||0),dueDate:pmDate_(r[13])};}
function pmBoardData_(ss,bd){
 const day=pmDate_(bd),sessions=pmRows_(ss,PM_SESSION_TAB).filter(r=>r[1]===PROPERTY_ID&&r[7]!=='COMPLETE').map(pmSession_);
 const schedule=pmRows_(ss,PM_SCHEDULE_TAB).filter(r=>r[1]===PROPERTY_ID).map(r=>({room:String(r[0]),dueDate:pmDate_(r[2]),intervalDays:Number(r[3]),lastPmId:r[4],lastCompletedAt:pmIso_(r[5]),session:sessions.find(s=>s.room===String(r[0]))||null}));
 const history=pmRows_(ss,TAB.PM_COMPLETIONS).filter(r=>r[1]===PROPERTY_ID&&r[11]==='COMPLETE').map(r=>({pmId:r[0],businessDate:pmDate_(r[2]),room:String(r[3]),completedBy:r[4],completedAt:pmIso_(r[5]),workOrders:Number(r[9]),activeMinutes:r[12]===''||r[12]===undefined?null:Number(r[12])}));
 return {ok:true,businessDate:bd,schedule,history,sessions,summary:{dueToday:schedule.filter(r=>r.dueDate===day).length,overdue:schedule.filter(r=>r.dueDate<day).length,next7:schedule.filter(r=>r.dueDate>=day&&r.dueDate<pmAddDays_(day,7)).length,completedToday:history.filter(r=>r.businessDate===day).length}};
}
function getPmBoard_(body){pmActor_(body,true);const ss=SpreadsheetApp.openById(DATABASE_ID);return jsonResponse_(pmBoardData_(ss,currentBusinessDayRecord_().businessDate));}
function initializePmSchedule_(body){
 const actor=pmActor_(body,false);if(actor.role!=='ADMIN')throw new Error('ADMIN_REQUIRED');
 const lock=LockService.getScriptLock();lock.waitLock(10000);try{
 const ss=SpreadsheetApp.openById(DATABASE_ID),bd=currentBusinessDayRecord_().businessDate;
 const sh=relayEnsureWorkSheet_(ss,PM_SCHEDULE_TAB,PM_SCHEDULE_HEADERS),existing=pmRows_(ss,PM_SCHEDULE_TAB).filter(r=>r[1]===PROPERTY_ID);
 if(existing.length)return jsonResponse_({ok:true,alreadyInitialized:true,count:existing.length});
 const history=pmRows_(ss,TAB.PM_COMPLETIONS).filter(r=>r[1]===PROPERTY_ID&&r[11]==='COMPLETE');
 const rows=PM_ROOMS.map((room,i)=>{const latest=history.filter(r=>String(r[3])===room).sort((a,b)=>new Date(b[5])-new Date(a[5]))[0];return [room,PROPERTY_ID,latest?pmAddDays_(latest[2],84):pmAddDays_(bd,Math.floor(i*84/PM_ROOMS.length)),84,latest?latest[0]:'',latest?latest[5]:''];});
 sh.getRange(sh.getLastRow()+1,1,rows.length,6).setValues(rows);
 return jsonResponse_({ok:true,count:rows.length,businessDate:bd});
 }finally{lock.releaseLock();}
}
function startPm_(body){
 const actor=pmActor_(body,false),room=String(body.room||'');
 const lock=LockService.getScriptLock();lock.waitLock(10000);try{
 const ss=SpreadsheetApp.openById(DATABASE_ID),schedule=pmRows_(ss,PM_SCHEDULE_TAB).find(r=>r[1]===PROPERTY_ID&&String(r[0])===room);
 if(!schedule)throw new Error('PM_SCHEDULE_REQUIRED');
 const sh=relayEnsureWorkSheet_(ss,PM_SESSION_TAB,PM_SESSION_HEADERS),active=pmRows_(ss,PM_SESSION_TAB).find(r=>r[1]===PROPERTY_ID&&String(r[3])===room&&r[7]!=='COMPLETE');
 if(active){if(active[4]!==actor.id)throw new Error('PM_IN_PROGRESS_BY_'+active[5]);return jsonResponse_({ok:true,session:pmSession_(active)});}
 if(!relayVerifyRoomQr_(ss,room,String(body.qrId||'')))throw new Error('INVALID_ROOM_QR');
 if(pmRows_(ss,PM_SESSION_TAB).some(r=>r[1]===PROPERTY_ID&&r[4]===actor.id&&['IN_PROGRESS','SAVING'].includes(r[7])))throw new Error('PAUSE_CURRENT_PM_FIRST');
 const bd=currentBusinessDayRecord_().businessDate;
 if(pmRows_(ss,TAB.PM_COMPLETIONS).some(r=>r[1]===PROPERTY_ID&&String(r[3])===room&&pmDate_(r[2])===pmDate_(bd)&&r[11]==='COMPLETE'))throw new Error('PM_ALREADY_COMPLETE_TODAY');
 const row=[Utilities.getUuid(),PROPERTY_ID,bd,room,actor.id,actor.name,new Date(),'IN_PROGRESS','',0,'[]','','',pmDate_(schedule[2])];sh.appendRow(row);
 return jsonResponse_({ok:true,session:pmSession_(row)});
 }finally{lock.releaseLock();}
}
function pmValidateItems_(items,complete){
 if(!Array.isArray(items)||items.length>PM_TASK_NAMES.length)throw new Error('INVALID_PM_ITEMS');
 const seen={};items.forEach(x=>{if(!Number.isInteger(x.index)||!PM_TASK_NAMES[x.index]||seen[x.index]||!['PASS','CORRECTED','WORK_ORDER','NA'].includes(x.status))throw new Error('INVALID_PM_ITEM');seen[x.index]=true;if(x.status==='WORK_ORDER'&&(!String(x.note||'').trim()||!['P1_GUEST_IMPACT','P2_ROOM_BLOCKING','P3_ROUTINE'].includes(x.priority)))throw new Error('PM_WORK_ORDER_DETAILS_REQUIRED');});
 if(complete&&items.length!==PM_TASK_NAMES.length)throw new Error('PM_CHECKLIST_INCOMPLETE');
 return items.map(x=>({index:x.index,name:PM_TASK_NAMES[x.index],status:x.status,note:String(x.note||'').slice(0,2000),priority:x.priority||'P3_ROUTINE'}));
}
function updatePmSession_(body){
 const actor=pmActor_(body,false),lock=LockService.getScriptLock();lock.waitLock(10000);try{
 const ss=SpreadsheetApp.openById(DATABASE_ID),sh=ss.getSheetByName(PM_SESSION_TAB),rows=pmRows_(ss,PM_SESSION_TAB),i=rows.findIndex(r=>r[0]===body.pmSessionId&&r[1]===PROPERTY_ID);
 if(i<0)throw new Error('PM_SESSION_NOT_FOUND');const r=rows[i];if(r[4]!==actor.id)throw new Error('PM_SESSION_OWNER_REQUIRED');if(r[7]==='COMPLETE')throw new Error('PM_ALREADY_COMPLETE');if(r[7]==='SAVING')throw new Error('PM_COMPLETION_PENDING_RETRY_COMPLETE');
 if(body.items)r[10]=JSON.stringify(pmValidateItems_(body.items,false));const now=new Date();
 if(body.command==='PAUSE'&&r[7]==='IN_PROGRESS'){r[7]='PAUSED';r[8]=now;}
 else if(body.command==='RESUME'&&r[7]==='PAUSED'){r[9]=Number(r[9]||0)+(now-new Date(r[8]));r[8]='';r[7]='IN_PROGRESS';}
 sh.getRange(i+2,1,1,14).setValues([r]);return jsonResponse_({ok:true,session:pmSession_(r)});
 }finally{lock.releaseLock();}
}
function savePmCompletion_(body){
 const actor=pmActor_(body,false),lock=LockService.getScriptLock();lock.waitLock(10000);try{
 const ss=SpreadsheetApp.openById(DATABASE_ID),sh=ss.getSheetByName(PM_SESSION_TAB),sessions=pmRows_(ss,PM_SESSION_TAB),i=sessions.findIndex(r=>r[0]===body.pmSessionId&&r[1]===PROPERTY_ID);
 if(i<0)throw new Error('PM_SESSION_REQUIRED');const s=sessions[i],id=s[0],room=String(s[3]);if(s[4]!==actor.id)throw new Error('PM_SESSION_OWNER_REQUIRED');
 if(s[7]==='COMPLETE')return jsonResponse_({ok:true,pmId:id,alreadyComplete:true});
 if(s[7]==='PAUSED')throw new Error('RESUME_PM_BEFORE_COMPLETING');
 const items=pmValidateItems_(s[7]==='SAVING'?JSON.parse(s[10]):body.items,true);
 s[7]='SAVING';s[10]=JSON.stringify(items);sh.getRange(i+2,1,1,14).setValues([s]);
 const head=relayEnsureWorkSheet_(ss,TAB.PM_COMPLETIONS,['pm_id','property_id','business_date','room','completed_by','completed_at','total_items','passed','corrected','work_orders','na','status','active_minutes']);
 if(head.getLastColumn()<13)head.getRange(1,13).setValue('active_minutes');
 const detail=relayEnsureWorkSheet_(ss,TAB.PM_ITEMS,['item_id','pm_id','property_id','business_date','room','item_index','item_name','status','completed_by','completed_at','maintenance_id','note']);
 if(detail.getLastColumn()<12)detail.getRange(1,11,1,2).setValues([['maintenance_id','note']]);
 const hs=pmRows_(ss,TAB.PM_COMPLETIONS),hi=hs.findIndex(r=>r[0]===id),prior=hi>=0?hs[hi]:null;
 // Persist finalization time once: retries cannot inflate labor or move the next due date.
 const now=prior?new Date(prior[5]):new Date(),bd=prior?prior[2]:currentBusinessDayRecord_().businessDate,minutes=prior?Number(prior[12]):Math.round(Math.max(0,now-new Date(s[6])-Number(s[9]||0))/600)/100;
 const counts={PASS:0,CORRECTED:0,WORK_ORDER:0,NA:0};items.forEach(x=>counts[x.status]++);
 const h=[id,PROPERTY_ID,bd,room,actor.name,now,items.length,counts.PASS,counts.CORRECTED,counts.WORK_ORDER,counts.NA,'SAVING',minutes];
 if(hi<0)head.appendRow(h);else if(prior[11]!=='COMPLETE')head.getRange(hi+2,1,1,13).setValues([h]);
 const maintenance=ss.getSheetByName(TAB.MAINTENANCE);if(!maintenance)throw new Error('MAINTENANCE_SHEET_MISSING');
 const inspections=pmRows_(ss,TAB.INSPECTIONS),inspectionIndex=inspections.map((r,index)=>({r,index})).filter(x=>x.r[1]===PROPERTY_ID&&String(x.r[3])===room&&pmDate_(x.r[2])===pmDate_(bd)).pop(),inspectionId=inspectionIndex?inspectionIndex.r[0]:'';
 const existingTickets=new Set(pmRows_(ss,TAB.MAINTENANCE).map(r=>r[0])),existingItems=new Set(pmRows_(ss,TAB.PM_ITEMS).map(r=>r[0]));
 items.forEach(x=>{const itemId=id+'-'+x.index,ticketId=x.status==='WORK_ORDER'?'PM-'+itemId:'';
 if(ticketId&&!existingTickets.has(ticketId))maintenance.appendRow([ticketId,PROPERTY_ID,bd,room,'PM',x.priority,x.priority==='P2_ROOM_BLOCKING','PM: '+x.name+' — '+x.note,'',actor.name,now,'OPEN','','',inspectionId]);
 if(ticketId&&x.priority==='P2_ROOM_BLOCKING'&&inspectionIndex)ss.getSheetByName(TAB.INSPECTIONS).getRange(inspectionIndex.index+2,12,1,2).setValues([['BLOCKING_MAINTENANCE','HOLD_MAINTENANCE']]);
 if(!existingItems.has(itemId))detail.appendRow([itemId,id,PROPERTY_ID,bd,room,x.index,x.name,x.status,actor.name,now,ticketId,x.note]);});
 const schedule=ss.getSheetByName(PM_SCHEDULE_TAB),sr=pmRows_(ss,PM_SCHEDULE_TAB),si=sr.findIndex(r=>r[1]===PROPERTY_ID&&String(r[0])===room);if(si<0)throw new Error('PM_SCHEDULE_REQUIRED');
 schedule.getRange(si+2,3,1,4).setValues([[pmAddDays_(bd,Number(sr[si][3])),sr[si][3],id,now]]);
 head.getRange(hi<0?head.getLastRow():hi+2,12).setValue('COMPLETE');
 s[7]='COMPLETE';s[10]=JSON.stringify(items);s[11]=now;s[12]=minutes;sh.getRange(i+2,1,1,14).setValues([s]);SpreadsheetApp.flush();
 return jsonResponse_({ok:true,pmId:id,room,activeMinutes:minutes,workOrders:counts.WORK_ORDER});
 }finally{lock.releaseLock();}
}
function getMaintenanceReport_(body){
 pmActor_(body,true);const ss=SpreadsheetApp.openById(DATABASE_ID),bd=body.businessDate||currentBusinessDayRecord_().businessDate,day=pmDate_(bd);
 const issues=pmRows_(ss,TAB.MAINTENANCE).filter(r=>r[1]===PROPERTY_ID&&pmDate_(r[2])<=day&&(r[11]==='OPEN'||pmDate_(r[2])===day||pmDate_(r[13])===day)).map(r=>{const match=String(r[7]).match(/COMPLETION_PHOTO: ([^\s|]+)/);return {maintenance_id:r[0],business_date:pmDate_(r[2]),room:r[3],priority:r[5],blocking:r[6],description:r[7],photoRef:match?match[1]:r[8],reported_by:r[9],reported_at:pmIso_(r[10]),status:r[11],resolvedBy:r[12],resolvedAt:pmIso_(r[13])};});
 const pm=pmBoardData_(ss,bd),work=pmRows_(ss,TAB.MAINTENANCE_WORK).filter(r=>r[1]===PROPERTY_ID&&r[8]==='COMPLETE'&&pmDate_(r[7])===day).map(r=>({worker:r[5],maintenanceId:r[3],activeMinutes:Math.round(Math.max(0,new Date(r[7])-new Date(r[6])-Number(r[10]||0)*60000)/600)/100}));
 return jsonResponse_({ok:true,businessDate:bd,maintenance:issues,work,pmCompletions:pm.history.filter(r=>r.businessDate===day),pmSummary:pm.summary});
}
