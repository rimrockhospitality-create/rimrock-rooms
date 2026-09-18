const navButtons=[...document.querySelectorAll('[data-view]')];
const home=document.getElementById('homeView');
const placeholder=document.getElementById('placeholder');
const title=document.getElementById('placeholderTitle');
const drawer=document.getElementById('drawer');
const drawerLinks=document.getElementById('drawerLinks');
document.getElementById('today').textContent=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date());
function show(view){
  if(view==='Home'){home.hidden=false;placeholder.hidden=true}else{home.hidden=true;placeholder.hidden=false;title.textContent=view}
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  drawer.hidden=true;
}
navButtons.forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
document.getElementById('backHome').addEventListener('click',()=>show('Home'));
document.getElementById('moreBtn').addEventListener('click',()=>drawer.hidden=false);
document.getElementById('closeDrawer').addEventListener('click',()=>drawer.hidden=true);
['Home','Housekeeping','Inspections','Maintenance','Preventive Maintenance','Reports','Property Settings','Users','Settings'].forEach(v=>{
 const b=document.createElement('button');b.className='nav';b.dataset.view=v;b.innerHTML='◆ <span>'+v+'</span>';b.addEventListener('click',()=>show(v));drawerLinks.appendChild(b);
});