const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
class Sheet{
 constructor(rows=[]){this.rows=rows;}getLastRow(){return this.rows.length;}getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
 appendRow(r){if(this.failAppend){this.failAppend=false;throw Error('simulated write interruption');}this.rows.push([...r]);return this;}
 getDataRange(){return this.getRange(1,1,this.rows.length,this.getLastColumn());}
 getRange(row,col,n=1,m=1){const self=this;return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[row+i-1]?.[col+j-1]??''));},getDisplayValues(){return this.getValues().map(r=>r.map(String));},setValue(v){return this.setValues([[v]]);},setValues(v){v.forEach((r,i)=>r.forEach((x,j)=>{self.rows[row+i-1]??=[];self.rows[row+i-1][col+j-1]=x;}));}};}
}
const sheets={MAINTENANCE:new Sheet([Array(15).fill('header')]),ROOM_QR:new Sheet([['property','room','qr','x','active'],['CO534','101','CO534-RM-101','','TRUE']])};
const ss={getSpreadsheetTimeZone:()=> 'Etc/GMT',getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=new Sheet()};let uid=0,role='ADMIN',actor='u1';
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-09-24T15:00:00Z']));}static now(){return new Date('2026-09-24T15:00:00Z').getTime();}}
const ctx={console,Date:FixedDate,JSON,Math,Number,String,Array,Set,Error,Object,Utilities:{getUuid:()=>`id${++uid}`,formatDate:(d,tz,fmt)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d))},SpreadsheetApp:{openById:()=>ss,flush(){}},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
vm.createContext(ctx);
vm.runInContext("const PROPERTY_ID='CO534',DATABASE_ID='mock';const TAB={MAINTENANCE:'MAINTENANCE',MAINTENANCE_WORK:'MAINTENANCE_WORK_SESSIONS',PM_COMPLETIONS:'PM_COMPLETIONS',PM_ITEMS:'PM_ITEMS',QR:'ROOM_QR',INSPECTIONS:'INSPECTIONS'};",ctx);
ctx.relayEnsureWorkSheet_=(ss,name,headers)=>{let sh=ss.getSheetByName(name);if(!sh){sh=ss.insertSheet(name);if(headers.length)sh.appendRow(headers);}return sh;};
ctx.relayVerifyRoomQr_=(ss,room,qr)=>ss.getSheetByName('ROOM_QR').rows.some(r=>r[0]==='CO534'&&r[1]===room&&r[2]===qr&&r[4]==='TRUE');
vm.runInContext(fs.readFileSync('backend/RELAY_PM_INTEGRATION_PATCH.gs','utf8'),ctx);
ctx.authValidateSession_=()=>({propertyId:'CO534',role,userId:actor});ctx.authGetUserById_=()=>({row:['u1','brad','Brad','','','','','TRUE']});ctx.currentBusinessDayRecord_=()=>({businessDate:'9/24/2026'});ctx.jsonResponse_=x=>x;
const items=()=>vm.runInContext('PM_TASK_NAMES.map((name,index)=>({name,index,status:"PASS"}))',ctx);
function call(name,body={}){return ctx[name]({sessionId:'auth',...body});}
assert.equal(call('initializePmSchedule_').count,114);assert.equal(call('initializePmSchedule_').alreadyInitialized,true);
assert.equal(sheets.PM_SCHEDULE.rows.length,115);assert.equal(call('getPmBoard_').summary.dueToday,2);
assert.throws(()=>call('startPm_',{room:'101',qrId:'wrong'}),/INVALID_ROOM_QR/);
const session=call('startPm_',{room:'101',qrId:'CO534-RM-101'}).session;
assert.equal(call('startPm_',{room:'101'}).session.pmSessionId,session.pmSessionId);
assert.equal(sheets.PM_SESSIONS.rows.length,2);
actor='other';assert.throws(()=>call('startPm_',{room:'101'}),/IN_PROGRESS/);actor='u1';
let data=items();data[2].status='WORK_ORDER';data[2].note='Cooling is not working';data[2].priority='P2_ROOM_BLOCKING';
call('updatePmSession_',{pmSessionId:session.pmSessionId,items:data,command:'PAUSE'});
assert.equal(call('getPmBoard_').sessions[0].items[2].note,'Cooling is not working');
assert.throws(()=>call('savePmCompletion_',{pmSessionId:session.pmSessionId,items:data}),/RESUME/);
call('updatePmSession_',{pmSessionId:session.pmSessionId,command:'RESUME'});
assert.throws(()=>call('savePmCompletion_',{pmSessionId:session.pmSessionId,items:data.slice(1)}),/INCOMPLETE/);
const row=sheets.PM_SESSIONS.rows[1];row[6]=new FixedDate(FixedDate.now()-180000);row[9]=60000;
// Simulate a mid-save failure. Retrying must reuse the same completion and repair identifiers.
sheets.MAINTENANCE.failAppend=true;assert.throws(()=>call('savePmCompletion_',{pmSessionId:session.pmSessionId,items:data}),/interruption/);
const result=call('savePmCompletion_',{pmSessionId:session.pmSessionId,items:data});
assert.equal(result.workOrders,1);assert.equal(result.activeMinutes,2);assert.equal(sheets.MAINTENANCE.rows.length,2);assert.equal(sheets.MAINTENANCE.rows[1][6],true);
assert.equal(sheets.PM_ITEMS.rows.length,20);assert.equal(sheets.PM_COMPLETIONS.rows.length,2);
assert.equal(call('savePmCompletion_',{pmSessionId:session.pmSessionId,items:data}).alreadyComplete,true);
assert.equal(sheets.MAINTENANCE.rows.length,2);
const report=call('getMaintenanceReport_',{businessDate:'9/24/2026'});assert.equal(report.pmCompletions.length,1);assert.equal(report.maintenance.length,1);assert.equal(report.pmCompletions[0].activeMinutes,2);
assert.equal(call('getPmBoard_').sessions.length,0);assert.equal(call('getPmBoard_').schedule[0].dueDate,'2026-12-17');
role='FRONT DESK';assert.equal(call('getMaintenanceReport_').ok,true);assert.throws(()=>call('initializePmSchedule_'),/PERMISSION/);
assert.equal(ctx.pmAddDays_('12/31/2026',1),'2027-01-01');assert.equal(ctx.pmAddDays_('2/28/2028',1),'2028-02-29');
// Date-only GMT cells must keep their calendar day; event timestamps use hotel time.
assert.equal(ctx.pmDate_(new FixedDate('2026-09-23T00:00:00Z')),'2026-09-23');
assert.equal(ctx.pmEventDay_(new FixedDate('2026-09-23T00:00:00Z')),'2026-09-22');
const originalDue=sheets.PM_SCHEDULE.rows[2][2];sheets.PM_SCHEDULE.rows[2][2]=new FixedDate('2026-09-24T00:00:00Z');
assert.equal(call('getPmBoard_').schedule[1].dueDate,'2026-09-24');sheets.PM_SCHEDULE.rows[2][2]=originalDue;
sheets.ROOM_STATE=new Sheet([['property','day','room','type','status','condition'],['CO534','9/24/2026','102','NK','VAC','Ready'],['CO534','9/24/2026','103','NK','OCC','Dirty'],['CO534','9/23/2026','104','NK','VAC','Ready'],['OTHER','9/24/2026','105','NK','VAC','Ready']]);
let board=call('getPmBoard_');assert.equal(board.schedule.find(r=>r.room==='102').choice.status,'VACANT');assert.equal(board.schedule.find(r=>r.room==='103').choice.status,'OCCUPIED');assert.equal(board.schedule.find(r=>r.room==='104').choice,null);assert.equal(board.schedule.find(r=>r.room==='105').choice,null);
sheets.ROOM_STATE.rows[1][1]='9/23/2026';sheets.ROOM_STATE.rows[2][1]='9/23/2026';board=call('getPmBoard_');assert.equal(board.schedule.find(r=>r.room==='102').choice.current,false);
sheets.ROOM_STATE.rows[1][1]='9/24/2026';sheets.ROOM_STATE.rows[2][1]='9/24/2026';
console.log('PASS: 114-room rotation, QR validation, session recovery/ownership, pause/resume, complete checklist, interrupted-save retry, deduplication, linked blocking repair, next due date and report totals.');
module.exports={ctx,sheets,call,setActor:(id,newRole)=>{actor=id;role=newRole;}};
