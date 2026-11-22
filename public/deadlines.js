/* Deadlines only warn; they never delete work, revoke wages, or block late submissions. */
(()=>{
 let clockOffset=0,lastServerTime='';
 const localInput=value=>{if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
 window.workDeadlineISO=value=>{const time=new Date(value).getTime();if(!Number.isFinite(time)||time<=Date.now()+clockOffset)throw Error('Elige una fecha y hora posteriores al momento actual.');return new Date(time).toISOString();};
 window.workDeadlineField=value=>field('due_at','Completar este trabajo máximo el',localInput(value),'datetime-local')+'<p class="subtle">Hora de tu dispositivo: '+esc(Intl.DateTimeFormat().resolvedOptions().timeZone)+'. El plazo se guarda con su zona horaria. El vencimiento no borra el trabajo ni cancela pagos.</p>';
 window.workDeadlineHTML=(kind,row)=>{
  let finished=null,label='Enviado',editable=true;
  if(kind==='production'){finished=row.work_submitted_at;editable=row.active&&!finished;}
  if(kind==='change_unit'){finished=['submitted','approved'].includes(row.status)?row.submitted_at:row.status==='cancelled'?row.refunded_at:null;label=row.status==='cancelled'?'Cancelado':'Enviado';editable=!!row.worker_id&&['assigned','rejected','blocked','refund_requested'].includes(row.status);}
  if(kind==='report'){if(row.status==='escalated'&&role()==='worker')return '<span class="muted">Derivado al administrador</span>';finished=row.resolved_at;label='Resuelto';editable=['open','escalated'].includes(row.status);}
  const due=row.due_at,stamp=due?new Date(due).getTime():0;
  return '<div class="work-deadline">'+(due?'<span>Máximo: '+esc(new Date(due).toLocaleString('es'))+'</span><strong role="timer" data-work-due="'+stamp+'" '+(finished?'data-work-finished="'+new Date(finished).getTime()+'"':'')+' data-work-label="'+esc(label)+'">Calculando…</strong>':'<span class="muted">Sin fecha máxima asignada</span>')+
   (role()==='admin'&&editable?btn(due?'Cambiar fecha máxima':'Fijar fecha máxima','work-deadline-edit',kind+':'+row.id,'secondary small'):'')+'</div>';
 };
 function tick(){
  if(S?.server_now&&S.server_now!==lastServerTime){lastServerTime=S.server_now;clockOffset=Date.parse(lastServerTime)-Date.now();}
  const now=Date.now()+clockOffset;
  for(const el of document.querySelectorAll('[data-work-due]')){
   const due=Number(el.dataset.workDue),finished=Number(el.dataset.workFinished||0);
   if(finished){el.textContent=el.dataset.workLabel+(finished<=due?' a tiempo':' fuera de plazo');el.classList.toggle('overdue',finished>due);continue;}
   const delta=due-now,seconds=Math.floor(Math.abs(delta)/1000),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),secs=seconds%60;
   el.textContent=(delta<0?'Vencido hace ':'Restan ')+(days?days+' d ':'')+[hours,minutes,secs].map(n=>String(n).padStart(2,'0')).join(':');el.classList.toggle('overdue',delta<0);
  }
 }
 handlers['work-deadline-edit']=key=>{
  const[kind,id]=key.split(':'),rows=kind==='production'?S.assignments:kind==='report'?S.reports:S.services.units,row=rows.find(r=>r.id===id);if(!row)return;
  modal('Fecha máxima del trabajo',window.workDeadlineField(row.due_at),async d=>{await api('/api/work/deadline',{kind,id,due_at:window.workDeadlineISO(d.due_at)});await load();toast('Fecha máxima actualizada y aviso enviado.');});
 };
 handlers['assignment-new']=()=>modal('Asignar producción',field('worker_id','Responsable','','select',S.users.filter(u=>['worker','admin'].includes(u.role)&&u.active&&!u.deleted_at).map(u=>[u.id,u.name]))+field('product_id','Producto','','select',S.products.map(p=>[p.id,p.name]))+field('quantity','Cantidad necesaria',100,'number')+field('rate','Pago por cuenta aprobada (USD)','0.50','number')+window.workDeadlineField()+'<p class="notice">Se conservan la tarifa y las reglas de comisión existentes.</p>',d=>saveAdmin('assignments',{...d,quantity:Number(d.quantity),rate_cents:moneyInput(d.rate),due_at:window.workDeadlineISO(d.due_at)}));
 function extend(html,rows,kind){
  const template=document.createElement('template');template.innerHTML=html;
  const header=template.content.querySelector('thead tr');if(header){const th=document.createElement('th');th.textContent='Fecha máxima / tiempo restante';header.append(th);}
  [...template.content.querySelectorAll('tbody tr')].forEach((tr,i)=>{if(!rows[i])return;const td=document.createElement('td');td.innerHTML=window.workDeadlineHTML(kind,rows[i]);tr.append(td);});return template.innerHTML;
 }
 const oldAssignments=assignmentsTable;assignmentsTable=()=>extend(oldAssignments(),S.assignments,'production');
 const oldReports=reportsTable;reportsTable=rows=>role()==='wholesale'?oldReports(rows):extend(oldReports(rows),rows.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)),'report');
 setInterval(()=>{if(!document.hidden)tick();},1000);
 document.addEventListener('visibilitychange',tick);
 const oldRender=renderContent;renderContent=function(){oldRender();tick();};
 const observer=new MutationObserver(()=>{queueMicrotask(tick);});
 // Only added/removed nodes matter. Text changes made by tick must not trigger an endless loop.
 observer.observe(document.getElementById('modal-root'),{childList:true});
})();
