const {JSDOM}=require('jsdom'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const {call,sheets,setActor}=require('./pm-integration.test.cjs');
setActor('u1','MAINTENANCE');sheets.ROOM_QR.appendRow(['CO534','102','CO534-RM-102','','TRUE']);
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,context=dom.getInternalVMContext(),alerts=[];
w.alert=s=>alerts.push(s);w.HTMLElement.prototype.scrollIntoView=function(){};w.fetch=async(url,opts)=>{
 if(String(url).startsWith('data/'))return {ok:true,json:async()=>JSON.parse(fs.readFileSync(url,'utf8'))};
 const b=JSON.parse(opts.body);let out;
 try{if(['getPmBoard','initializePmSchedule','startPm','updatePmSession','savePmCompletion','getMaintenanceReport'].includes(b.action))out=call(b.action+'_',b);
 else if(b.action==='getBusinessDay')out={ok:true,businessDate:'9/24/2026'};
 else out={ok:true,businessDate:'9/24/2026',maintenanceIssues:[],assignments:[],cleaningSessions:[],sideWork:[],notes:[],openNotes:[],checklistActivity:[],items:[]};}
 catch(e){out={ok:false,error:e.message};}
 return {ok:true,json:async()=>JSON.parse(JSON.stringify(out))};
};
const run=s=>vm.runInContext(s,context),settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));},get=s=>w.document.querySelector(s),click=s=>{assert.ok(get(s),s);get(s).click();},change=(s,v)=>{get(s).value=v;get(s).dispatchEvent(new w.Event('change',{bubbles:true}));};
(async()=>{
run(fs.readFileSync('app.js','utf8'));run(fs.readFileSync('pm.js','utf8'));await settle();
run("currentUser={name:'Brad',roles:['MAINTENANCE'],propertyId:'CO534'};localStorage.setItem('relaySessionId','test');relayScanQr_=async()=> 'CO534-RM-102';show('Preventive Maintenance');");await settle();
click('[data-pm-room="102"]');await settle();assert.equal(get('#pmRoomDetail').hidden,false);
change('[data-pm-status="0"]','PASS');await settle();assert.equal(get('[data-pm-status="0"]').value,'PASS');
change('[data-pm-status="1"]','WORK_ORDER');change('[data-pm-note="1"]','Coils need repair');await settle();
click('#pmPause');await settle();assert.equal(get('#pmPause').textContent,'RESUME PM');
click('#pmBack');await settle();click('[data-pm-room="102"]');await settle();assert.equal(get('[data-pm-note="1"]').value,'Coils need repair');assert.equal(get('[data-pm-status="1"]').value,'WORK_ORDER');
click('#pmPause');await settle();assert.equal(get('#pmPause').textContent,'PAUSE PM');
for(let i=2;i<19;i++)change(`[data-pm-status="${i}"]`,'PASS');await settle();click('#pmComplete');await settle();
assert.equal(sheets.PM_COMPLETIONS.rows.length,3);assert.equal(sheets.MAINTENANCE.rows.length,3);assert.equal(get('#pmCalendar').hidden,false);click('[data-pm-tab="history"]');assert.match(get('#pmCalendar').textContent,/ROOM 102/);
await run("currentUser.roles=['ADMIN'];loadDailyOperationsReport_()");assert.match(get('#dorMaintenance').textContent,/2PM Completed/);
assert.equal(alerts.length,1,alerts.join('\n'));assert.match(alerts[0],/PM saved/);
console.log('PASS: DOM integration with actual app.js + pm.js + mocked Sheets backend: selected values, saved notes, pause/restore/resume, completion, repair ticket, history, report totals.');w.close();
})().catch(e=>{console.error(e);w.close();process.exit(1);});
