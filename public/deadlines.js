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
 const people=()=>S.users.filter(u=>u.active&&!u.deleted_at&&['admin','worker'].includes(u.role)).map(u=>[u.id,u.name]);
 async function saveAssignment(kind,id,operation,data){
  await api('/api/work/assignment',{kind,id,operation,data});await load();toast(operation==='delete'?'Asignación quitada; no se borraron ventas ni cuentas.':'Asignación corregida y responsable notificado.');
  if(kind==='service')await handlers['changes-order'](id);
 }
 handlers['work-assignment-edit']=key=>{
  const[kind,id,current_worker]=key.split(':');
  if(kind==='production'){
   const a=S.assignments.find(x=>x.id===id);if(!a)return;
   const hasWork=S.accounts.some(c=>c.assignment_id===id);
   modal('Editar trabajo asignado',(hasWork?'<p class="notice">Ya hay cuentas registradas: se conservan responsable, producto y tarifa. La cantidad no puede ser menor al trabajo existente.</p><p>'+esc(uname(a.worker_id))+' · '+esc(pname(a.product_id))+' · '+money(a.rate_cents)+' por cuenta.</p>':field('worker_id','Responsable',a.worker_id,'select',people())+field('product_id','Producto',a.product_id,'select',S.products.map(p=>[p.id,p.name]))+field('rate','Pago por cuenta (USD)',(a.rate_cents/100).toFixed(2),'number'))+
    field('quantity','Cantidad total del trabajo',a.quantity,'number')+window.workDeadlineField(a.due_at)+'<p class="subtle">Si cambias las condiciones, el trabajador deberá aceptarlas nuevamente. No se modifican pagos ya ganados.</p>',d=>saveAssignment(kind,id,'edit',{worker_id:hasWork?a.worker_id:d.worker_id,product_id:hasWork?a.product_id:d.product_id,rate_cents:hasWork?a.rate_cents:moneyInput(d.rate),quantity:Number(d.quantity),due_at:window.workDeadlineISO(d.due_at)}));
  }else{
   const rows=S.services.units.filter(u=>u.order_id===id&&u.worker_id===current_worker&&['assigned','rejected'].includes(u.status));if(!rows.length)throw Error('Ya no hay unidades pendientes para editar.');
   modal('Editar asignación de contraseñas','<p class="notice">Solo se cambian las unidades pendientes de envío de este responsable. Las enviadas, aprobadas o con incidencias se conservan. Si reduces la cantidad, las sobrantes quedan sin asignar; la compra no cambia.</p>'+
    field('worker_id','Responsable',current_worker,'select',people())+field('quantity','Cantidad pendiente para asignar',rows.length,'number')+window.workDeadlineField(rows[0].due_at),d=>saveAssignment(kind,id,'edit',{current_worker,worker_id:d.worker_id,quantity:Number(d.quantity),due_at:window.workDeadlineISO(d.due_at)}));
  }
 };
 handlers['work-assignment-delete']=key=>{
  const[kind,id,current_worker]=key.split(':');
  modal('Eliminar asignación',kind==='production'?'<p>Se quitará este trabajo únicamente si todavía no tiene cuentas ni pagos asociados. No se elimina el producto ni ninguna venta.</p><label class="check"><input type="checkbox" name="confirm" required> Confirmo que quiero quitar esta asignación.</label>':
   '<p>Las unidades pendientes de este responsable quedarán sin asignar para que puedas repartirlas nuevamente. No se borra la compra ni se devuelve dinero. Los envíos, las aprobaciones y las incidencias se conservan.</p><label class="check"><input type="checkbox" name="confirm" required> Confirmo que quiero quitar esta asignación.</label>',d=>{if(!d.confirm)throw Error('Confirma que quieres quitar la asignación.');return saveAssignment(kind,id,'delete',{current_worker});});
 };
 function extend(html,rows,kind){
  const template=document.createElement('template');template.innerHTML=html;
  const actions=kind==='production'&&role()==='admin';
  const header=template.content.querySelector('thead tr');if(header){const th=document.createElement('th');th.textContent='Fecha máxima / tiempo restante';header.append(th);if(actions){const th=document.createElement('th');th.textContent='Corregir asignación';header.append(th);}}
  [...template.content.querySelectorAll('tbody tr')].forEach((tr,i)=>{if(!rows[i])return;const td=document.createElement('td');td.innerHTML=window.workDeadlineHTML(kind,rows[i]);tr.append(td);if(actions){const cell=document.createElement('td'),key='production:'+rows[i].id,hasWork=S.accounts.some(c=>c.assignment_id===rows[i].id);cell.innerHTML=btn('Editar','work-assignment-edit',key)+(hasWork?'<button disabled title="Ya tiene cuentas registradas: no se elimina trabajo realizado">Eliminar asignación</button>':btn('Eliminar asignación','work-assignment-delete',key));tr.append(cell);}});return template.innerHTML;
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
