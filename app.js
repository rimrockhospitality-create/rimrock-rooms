/*
 * Rimrock Rooms
 * Product concept and operating design: Ryan Kelly
 * Original project owner: Ryan Kelly
 * Everhome Suites Denver Airport (CO534)
 * September 2026
 */
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
const hkPdf=document.getElementById('hkPdf'),dropzone=document.getElementById('dropzone'),fileStatus=document.getElementById('fileStatus');
function acceptHousekeepingPdf(file){
  fileStatus.className='file-status';
  if(!file){fileStatus.textContent='';return}
  if(!(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))){fileStatus.textContent='Please choose a PDF file.';fileStatus.classList.add('error');return}
  if(file.size>10*1024*1024){fileStatus.textContent='That PDF is larger than the 10 MB Section 2 limit.';fileStatus.classList.add('error');return}
  fileStatus.textContent='✓ '+file.name+' selected — ready for Preview (Step 2).';
  fileStatus.classList.add('ok');
}
hkPdf.addEventListener('change',()=>acceptHousekeepingPdf(hkPdf.files[0]));
['dragenter','dragover'].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop',e=>acceptHousekeepingPdf(e.dataTransfer.files[0]));
