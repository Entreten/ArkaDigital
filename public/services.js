/* Additive panels: inventory, existing warranties, theme and audio remain in app.js. */
(()=>{
 const modes={email:'Servicio anterior',password:'Cambio de contraseña',both:'Servicio anterior'};
 const states={pending:'Pendiente de pago',payment_review:'Pago en revisión',processing:'En proceso',delivered:'Entregado',expired:'Vencido',cancelled:'Cancelado',assigned:'Asignada',submitted:'En revisión',approved:'Aprobada',rejected:'Corregir y reenviar',blocked:'Esperando al mayorista',refund_requested:'Devolución solicitada'};
 const kinds={margin:'Ganancia comercial',own:'Mi trabajo',commission:'Comisión 3%',reserve:'Reserva de garantía',reserve_use:'Uso de reserva',withdrawal:'Retiro registrado',adjustment:'Ajuste de reserva'};
 const X=()=>S?.services||{offers:[],orders:[],units:[],notifications:[],wallet:[],credit_cents:0};
 const status=s=>'<span class="badge '+esc(s)+'">'+esc(states[s]||s)+'</span>';
 const unitRows=o=>X().units.filter(u=>u.order_id===o.id);
 const orderBy=id=>X().orders.find(o=>o.id===id);
 const nameOf=id=>S.users.find(u=>u.id===id)?.name||(id===S.user.id?S.user.name:'Asignado');
 const active=o=>!['delivered','cancelled','expired'].includes(o.status);
 const click=(label,action,id='',cls='secondary small')=>btn(label,'changes-'+action,id,cls);
 const instructions=d=>{const requested=d.request.requested_password??d.request.fixed_password;return '<section class="change-instructions"><strong>Indicaciones obligatorias · Solo cambio de contraseña</strong>'+
  '<p><strong>Conserva el correo actual exactamente como está.</strong> Cambia únicamente la contraseña en la plataforma externa.</p>'+
  (requested?'<p><strong>Contraseña nueva solicitada para esta cuenta:</strong> <code class="sensitive">'+esc(requested)+'</code>. Aplícala exactamente; no inventes otra contraseña.</p>':'<p><strong>Falta la contraseña nueva. El mayorista debe indicarla antes de iniciar.</strong></p>')+
  (d.order.instructions?'<p>'+esc(d.order.instructions)+'</p>':'')+
  '<p><strong>El visto solo registra que ya realizaste el cambio manualmente y comprobaste el acceso.</strong> No modifica la cuenta por sí solo. Si no puedes completarlo, reporta el problema al mayorista.</p></section>';};
 const extraNav={
  wholesale:[['label','SERVICIOS Y SALDO'],['changes-shop','⇄','Cambiar contraseñas'],['changes-orders','▤','Mis cambios de contraseña'],['credit-wallet','＄','Mi saldo a favor']],
  worker:[['label','CAMBIOS DE CONTRASEÑA'],['changes-work','⇄','Mis cambios asignados']],
  admin:[['label','CAMBIOS DE CONTRASEÑA'],['changes-offers','▦','Ofertas de contraseñas'],['changes-review','✓','Pedidos y revisión de cambios'],['changes-work','⇄','Contraseñas que cambio yo'],['own-production','↑','Mi producción para stock'],['label','CONTROL FINANCIERO'],['finances','＄','Mis ganancias y fondos']]
 };
 Object.keys(extraNav).forEach(r=>navs[r].push(...extraNav[r]));
 navs.worker.find(n=>n[0]==='upload')[2]='Generar cuentas para stock';
 navs.admin.find(n=>n[0]==='reviews')[2]='Revisar producción de stock';
 navs.wholesale.find(n=>n[0]==='purchases')[2]='Mis cuentas compradas';
 const renderOriginal=render;
 render=function(){
  renderOriginal();
  const notifications=X().notifications.filter(n=>!n.read_at),top=$('.top-actions');
  if(top){const button=document.createElement('button');button.className='ghost small notifications-trigger';button.dataset.action='changes-notifications';button.textContent='Avisos · '+notifications.length;button.setAttribute('aria-label',notifications.length+' avisos pendientes');top.prepend(button);}
 };
 const renderContentOriginal=renderContent;
 renderContent=function(){
  if(!S)return;
  if(view==='changes-shop'){renderOffers(false);return;}
  if(view==='changes-offers'){renderOffers(true);return;}
  if(['changes-orders','changes-review','changes-work'].includes(view)){renderOrders();return;}
  if(view==='credit-wallet'){renderWallet();return;}
  if(view==='finances'){renderFinance();return;}
  if(view==='own-production'){renderOwnProduction();return;}
  renderContentOriginal();
  if(view==='wallet'&&role()==='worker'){
   const totals=document.createElement('section');totals.className='panel';
   totals.innerHTML='<h3>Mis ganancias acumuladas</h3><p>Neto registrado: <strong>'+money(S.ledger.filter(l=>l.kind!=='withdrawal').reduce((n,l)=>n+Number(l.amount_cents),0))+'</strong> · Retiros pagados: '+money(-S.ledger.filter(l=>l.kind==='withdrawal').reduce((n,l)=>n+Number(l.amount_cents),0))+'</p><p class="subtle">El historial muestra la producción, los cambios entregados y los ajustes de comisión por separado.</p>';$('#content').append(totals);
  }
 };
 function renderOffers(admin){
  const offers=X().offers;
   $('#content').innerHTML=head(admin?'Ofertas de cambios de contraseña':'Cambio de contraseñas',admin?'Tú defines el precio al mayorista, tu parte y quién puede realizar cada oferta.':'Envía correo, contraseña actual y contraseña nueva por cuenta. Nunca se cambia el correo.',admin?click('+ Crear oferta','offer-new','','primary'):'')+
   '<div class="notice">El cliente debe ser propietario o estar autorizado sobre las cuentas y proporcionar acceso válido y suscripción vigente cuando corresponda. El servicio no reactiva suscripciones ni crea buzones de correo.</div>'+
   '<div class="change-offers">'+offers.filter(o=>admin||o.active).map(o=>'<section class="panel"><span class="eyebrow">'+esc(modes[o.mode])+'</span><h3>'+esc(o.name)+'</h3><strong class="price">'+money(o.price_cents)+' / cuenta</strong>'+
   (admin?'<p>Tu parte: '+money(o.margin_cents)+' · Ejecución: '+money(o.price_cents-o.margin_cents)+' · Sin comisión del 3%.</p>':'')+
   '<p>'+esc(o.instructions||'Modificación manual con revisión antes de la entrega completa.')+'</p>'+click(admin?'Editar oferta':'Solicitar servicio',admin?'offer-edit':'buy',o.id,'primary')+(admin&&!o.active?'<span class="badge">Oculta</span>':'')+'</section>').join('')+'</div>'+(offers.length?'':empty('No hay ofertas publicadas'));
 }
 function progress(o,onlyMine=false){const rows=unitRows(o).filter(u=>!onlyMine||u.worker_id===S.user.id),assigned=rows.filter(u=>u.worker_id).length,sent=rows.filter(u=>['submitted','approved'].includes(u.status)).length,approved=rows.filter(u=>u.status==='approved').length,cancelled=rows.filter(u=>u.status==='cancelled').length;return assigned+' asignadas · '+sent+' enviadas · '+approved+' aprobadas · '+cancelled+' canceladas · '+rows.filter(u=>!['submitted','approved','cancelled'].includes(u.status)).length+' pendientes';}
  function nextDeadline(o,own){const pending=unitRows(o).filter(u=>u.worker_id&&(!own||u.worker_id===S.user.id)&&!['submitted','approved','cancelled'].includes(u.status));const next=pending.filter(u=>u.due_at).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at))[0];return next?window.workDeadlineHTML('change_unit',next):'<span class="muted">'+(pending.length?'Sin fecha máxima asignada':'Sin trabajo pendiente de envío')+'</span>';}
 function renderOrders(){
  const own=view==='changes-work',admin=role()==='admin',orders=X().orders.filter(o=>own?o.status==='processing'&&unitRows(o).some(u=>u.worker_id===S.user.id):admin?active(o):true).sort((a,b)=>b.created_at.localeCompare(a.created_at));
   $('#content').innerHTML=head(own?'Contraseñas que tengo asignadas':admin?'Pedidos y revisión de contraseñas':'Mis cambios de contraseña','Sin mezclar inventario ni garantías de productos. '+(admin?'Las asignaciones, fechas máximas y reasignaciones las decides tú.':''),click('Actualizar','refresh'))+
    panel('',table(['Pedido / servicio','Estado','Progreso',...(own?[]:['Total']),...(role()==='wholesale'?[]:['Próxima fecha máxima']),'Acción'],orders.map(o=>['<strong>CAM-'+o.number+'</strong><br>'+esc(o.offer_name)+'<br><small>'+date(o.created_at)+'</small>',status(o.status),progress(o,own),...(own?[]:[money(o.total_cents)]),...(role()==='wholesale'?[]:[nextDeadline(o,own)]),click('Abrir pedido','order',o.id)])))+
   (admin&&!own?panel('Entregados y archivados',table(['Pedido','Servicio','Entregado','Resumen'],X().orders.filter(o=>!active(o)).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(o=>['CAM-'+o.number,esc(o.offer_name),date(o.delivered_at),click('Ver resumen','order',o.id)]))):'');
 }
 function renderWallet(){
  $('#content').innerHTML=head('Mi saldo a favor','No es una devolución bancaria. Se aplica automáticamente a tu próxima compra o servicio.')+
  '<div class="balance-card"><small>SALDO A FAVOR</small><strong>'+money(X().credit_cents)+'</strong></div>'+
  panel('Historial',table(['Fecha','Movimiento','Importe','Pedido'],X().wallet.map(w=>[date(w.created_at),esc(w.note),money(w.amount_cents),esc(w.reference_id?.slice(0,8)||'—')])));
 }
 let financeFrom='',financeTo='';
 function renderFinance(){
  const f=X().finance;if(!f)return;
  const percent=Math.round(Number(f.storage.used_bytes)/Number(f.storage.limit_bytes)*1000)/10;
  const rows=f.entries.filter(e=>(!financeFrom||e.created_at.slice(0,10)>=financeFrom)&&(!financeTo||e.created_at.slice(0,10)<=financeTo)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const sum=kind=>rows.filter(e=>e.kind===kind).reduce((s,e)=>s+Number(e.amount_cents),0);
  $('#content').innerHTML=head('Mis ganancias y fondos','Registro contable interno; no consulta tu saldo bancario ni ejecuta transferencias.',click('Configurar reserva y conservación','finance-settings')+' '+click('Registrar retiro','finance-withdraw','','primary'))+
  (f.pending_historical?'<div class="error">Comisión histórica pendiente: '+money(f.pending_historical)+'. No se descontó porque un saldo disponible no era suficiente. No se crearon deudas.</div>':'')+
  (f.unknown_costs?'<div class="notice">'+f.unknown_costs+' cuentas vendidas no tienen coste verificable. Su ganancia no se inventa ni se incluye como disponible.</div>':'')+
  (f.pending_reserve?'<div class="notice">La reserva no tiene porcentaje configurado para '+f.pending_reserve+' ventas mensuales. Configúrala expresamente antes de registrar retiros.</div>':'')+
  '<div class="metrics">'+metric('Tu saldo contable disponible',money(f.available))+metric('Fondos en cambios en proceso',money(f.funds_processing))+metric('Deuda con trabajadores',money(f.workers_due))+metric('Saldo a favor de mayoristas',money(f.buyer_credits))+'</div>'+
  '<p class="notice">Cobros bancarios verificados registrados: '+money(f.verified_receipts)+'. No equivalen a tu ganancia ni al saldo bancario actual.</p>'+
  '<div class="metrics">'+metric('Ganancia comercial acumulada',money(f.commercial))+metric('Mi trabajo realizado',money(f.own))+metric('Comisiones cobradas',money(f.commissions))+metric('Mis retiros registrados',money(f.withdrawn))+'</div>'+
  panel('Reserva y almacenamiento','<div class="change-finance-line"><strong>Reserva disponible: '+money(f.reserve)+'</strong>'+click('Devolución desde reserva','reserve-refund')+'</div><p>Uso actual de base de datos: '+(Number(f.storage.used_bytes)/1048576).toFixed(2)+' MB / '+(Number(f.storage.limit_bytes)/1048576).toFixed(0)+' MB ('+percent+'%).</p><progress class="'+(percent>=80?'storage-warning':'')+'" max="100" value="'+Math.min(percent,100)+'"></progress>'+(percent>=80?'<div class="error">El almacenamiento está cerca del límite. Revisa la retención y el plan antes de cargar más datos.</div>':'')+'<p class="subtle">Medición: '+date(f.storage.measured_at)+'. Los 7 días son de acceso a datos, no una garantía adicional.</p>')+
  panel('Movimientos por fecha y pedido','<div class="form-row">'+field('finance_from','Desde',financeFrom,'date',null,false)+field('finance_to','Hasta',financeTo,'date',null,false)+'</div><div class="notice">Periodo seleccionado: margen '+money(sum('margin'))+' · mi trabajo '+money(sum('own'))+' · comisiones '+money(sum('commission'))+'.</div>'+table(['Fecha','Concepto','Detalle','Pedido / referencia','Importe'],rows.map(e=>[date(e.created_at),esc(kinds[e.kind]||e.kind),esc(e.description),esc(e.reference_id?.slice(0,8)||'—'),money(e.amount_cents)])))+
  panel('Ganancias y saldos del equipo',table(['Persona','Ganancia registrada','Saldo actual','En retiro','Comisión pendiente'],f.users.filter(u=>u.role==='worker').map(u=>[esc(u.name),money(S.ledger.filter(l=>l.worker_id===u.id&&l.kind!=='withdrawal').reduce((n,l)=>n+Number(l.amount_cents),0)),money(u.balance_cents),money(u.reserved_cents),money(f.costs.filter(c=>c.worker_id===u.id&&c.fee_state==='pending').reduce((n,c)=>n+Number(c.fee_cents),0))])));
  const from=$('[name=finance_from]'),to=$('[name=finance_to]');from.onchange=()=>{financeFrom=from.value;renderFinance();};to.onchange=()=>{financeTo=to.value;renderFinance();};
 }
 function renderOwnProduction(){
  const assignments=S.assignments.filter(a=>a.worker_id===S.user.id&&a.active);
  $('#content').innerHTML=head('Mi producción para stock','Tus cuentas conservan tu autoría y sus reportes de garantía te corresponden. No se te descuenta el 3%.')+
   panel('Tus asignaciones',table(['Producto','Cantidad','Tarifa propia','Acción'],assignments.map(a=>[esc(pname(a.product_id)),a.quantity,money(a.rate_cents),click('Cargar mi producción','own-upload',a.id)])))+
   panel('Tu producción',accountsTable(S.accounts.filter(a=>a.worker_id===S.user.id),true));
 }
 async function change(action,payload,reopen){
  await api('/api/services/command',{action,payload});await load();closeModal();toast('Operación guardada correctamente');if(reopen)setTimeout(()=>{if(S&&orderBy(reopen))void showOrderChanges(reopen);},0);
 }
 async function showDeliveredAccounts(o){
  const owner=S.user.id,started=performance.now();
  modal('CAM-'+o.number,'<div class="notice"><strong>'+esc(o.offer_name)+'</strong><br>Entregado: '+date(o.delivered_at)+'. Datos disponibles hasta '+date(o.access_until)+'.</div><section id="change-delivered-results" aria-label="Cuentas entregadas"><p role="status">Cargando cuentas entregadas…</p></section>',null,true);
  const box=$('#change-delivered-results');
  try{
   const result=await api('/api/services/orders/'+encodeURIComponent(o.id)+'/results');
   if(!box.isConnected||S?.user.id!==owner)return;
   const remaining=Date.parse(result.access_until)-Date.parse(result.server_now);
   const expired=()=>!Number.isFinite(remaining)||performance.now()-started>=remaining||S?.user.id!==owner||role()!=='wholesale';
   const expire=()=>{box.onclick=null;box.innerHTML='<p role="status">Ya terminó el plazo de siete días para ver y copiar estos datos.</p>';};
   if(expired()){expire();return;}
   const canCopy=a=>!!a.email&&a.password!==null;
   const available=result.accounts.filter(canCopy);
   const byPosition=new Map(available.map(a=>[String(a.position),a]));
   const cell=value=>'<code class="purchase-value">'+esc(value)+'</code>';
   const line=a=>[a.email,a.password].map(s=>String(s).replace(/[\r\n\t]+/g,' ')).join('\t');
   box.innerHTML='<div class="change-instructions"><strong>'+available.length+' cuentas con datos disponibles</strong><p>Las contraseñas nuevas son privadas. Guarda tus datos antes del '+date(result.access_until)+'.</p><div class="row-actions">'+
    (available.length?'<button type="button" class="primary" data-copy-result="all">Copiar todas las cuentas</button> <a class="button secondary" href="/api/services/orders/'+encodeURIComponent(o.id)+'/export">Exportar a Excel</a>':'')+'</div></div>'+
    table(['Cuenta','Correo','Contraseña nueva','Acción'],result.accounts.map(a=>['#'+a.position,canCopy(a)?cell(a.email):'—',canCopy(a)?cell(a.password):'—',canCopy(a)?'<button type="button" class="secondary small" data-copy-result="'+a.position+'">Copiar cuenta</button>':a.status==='cancelled'?'Cancelada con devolución':'Datos no disponibles']));
   box.onclick=async e=>{
    if(expired()){e.preventDefault();expire();return;}
    const key=e.target.closest('[data-copy-result]')?.dataset.copyResult;if(!key)return;
    const rows=key==='all'?available:[byPosition.get(key)].filter(Boolean);
    try{await navigator.clipboard.writeText(rows.map(line).join('\n'));toast(rows.length===1?'Cuenta copiada':rows.length+' cuentas copiadas');}
    catch{toast('El navegador no permitió copiar. Puedes seleccionar los datos o exportarlos a Excel.');}
   };
   const timer=setTimeout(()=>{if(box.isConnected)expire();},Math.max(0,remaining-(performance.now()-started)));
   // Cancel the timer and release credential data as soon as this detail closes.
   const observer=new MutationObserver(()=>{if(!box.isConnected){clearTimeout(timer);observer.disconnect();}});
   observer.observe($('#modal-root'),{childList:true});
  }catch(e){
   if(box.isConnected&&S?.user.id===owner){
    box.innerHTML='<p class="error">'+esc(e.message)+'</p>';
    if(Date.parse(o.access_until)>Date.now())box.insertAdjacentHTML('beforeend',click('Volver a intentar','order',o.id));
   }
  }
 }
 async function showOrderChanges(id){
  const o=orderBy(id);if(!o)return;const admin=role()==='admin',workerView=view==='changes-work'||role()==='worker',rows=unitRows(o).filter(u=>!workerView||u.worker_id===S.user.id),paid=o.total_cents-o.credit_cents;
  if(o.status==='delivered'&&role()==='wholesale'&&!o.purged_at)return showDeliveredAccounts(o);
  let h='<div class="notice"><strong>'+esc(o.offer_name)+' · '+esc(modes[o.mode])+'</strong><br>'+progress(o,workerView)+'</div>';
  if(workerView&&o.status==='processing')h+=instructions(await api('/api/services/orders/'+id+'/instructions'));
  if(!workerView)h+='<p>Total: <strong>'+money(o.total_cents)+'</strong> · Saldo aplicado: '+money(o.credit_cents)+' · Transferencia: '+money(paid)+'</p>';
  if(admin)h+='<p>Tu margen por cuenta: '+money(o.margin_cents)+' · Pago de ejecución: '+money(o.unit_cents-o.margin_cents)+' · Sin 3%.</p>';
  if(o.status==='pending'&&role()==='wholesale')h+='<div class="notice">Transfiere únicamente '+money(paid)+'. Las cuentas se asignan después de verificar el pago.</div>'+S.banks.map(b=>'<div class="account-data">'+esc(b.bank)+' · '+esc(b.holder)+'<br>'+esc(b.account_number)+'</div>').join('')+click('Declarar transferencia','payment',id,'primary')+' '+click('Cancelar pedido','cancel',id);
  if(admin&&o.status==='payment_review')h+='<div class="account-data"><strong>Verifica primero el ingreso real en tu banco.</strong><p>Remitente: '+esc(o.sender)+'<br>Código: '+esc(o.transaction_code)+'<br>Fecha: '+esc(o.payment_date)+'<br>Importe: '+money(o.paid_cents)+'</p></div>'+click('Pago recibido: habilitar trabajo','verify',id,'success')+' '+click('Rechazar pago y cancelar','cancel',id,'danger small');
  if(admin&&o.status==='processing'){
   h+='<div class="row-actions">'+click('Asignar pendientes','assign',id)+click('Repartir entre los que yo elija','split',id)+'</div>';
   const ready=unitRows(o).every(u=>u.status==='approved'||u.status==='cancelled'&&u.refunded_at);
   h+='<p class="notice">La entrega y el reparto de ganancias se realizan automáticamente al aprobar la última unidad, siempre que las canceladas ya tengan su devolución registrada.</p>'+(ready?click('Completar entrega pendiente','deliver',id,'primary'):'');
   h+=table(['Responsable','Asignadas','Aprobadas','Corregir asignación'],[...new Set(unitRows(o).map(u=>u.worker_id).filter(Boolean))].map(w=>[esc(nameOf(w)),unitRows(o).filter(u=>u.worker_id===w).length,unitRows(o).filter(u=>u.worker_id===w&&u.status==='approved').length,o.status==='processing'&&unitRows(o).some(u=>u.worker_id===w&&['assigned','rejected'].includes(u.status))?btn('Editar','work-assignment-edit','service:'+id+':'+w)+btn('Eliminar asignación','work-assignment-delete','service:'+id+':'+w):'<small>Sin unidades pendientes de envío</small>']));
  }
  if(o.status==='delivered'){
   h+='<div class="notice">Entregado: '+date(o.delivered_at)+'. Plazo de datos: '+date(o.access_until)+'.</div>';
   h+='<p class="subtle">Los datos de las cuentas ya no están disponibles para este perfil. Solo se conserva el resumen del pedido.</p>';
  }
   h+=table(['Cuenta','Estado',...(admin?['Responsable']:[]),'Fecha máxima y tiempo restante','Acción'],rows.map(u=>{
   let actions='';
   if(o.status==='processing'){
    if((admin||u.worker_id===S.user.id)&&role()!=='wholesale')actions+=click('Ver datos e indicaciones','unit',u.id);
    if(role()==='wholesale'&&['blocked','refund_requested'].includes(u.status))actions+=click('Responder incidencia','unit',u.id);
     if(role()==='wholesale'&&u.needs_password&&['pending','assigned','rejected'].includes(u.status))actions+=click('Indicar contraseña nueva','set-password',u.id);
    if(admin&&['assigned','rejected'].includes(u.status))actions+=click('Reasignar','reassign',u.id);
   }
    return ['#'+u.position+(u.email?'<br>'+esc(u.email):'')+(u.reason?'<br><span class="muted">'+esc(u.reason)+'</span>':''),u.status==='pending'?'<span class="badge">Sin asignar</span>':status(u.status),...(admin?[esc(u.worker_id?nameOf(u.worker_id):'Sin asignar')]:[]),window.workDeadlineHTML('change_unit',u),actions||'—'];
  }));
  if(admin){const history=(X().history||[]).filter(e=>e.order_id===id).sort((a,b)=>b.created_at.localeCompare(a.created_at));h+=panel('Historial administrativo',table(['Fecha','Acción','Responsable'],history.map(e=>[date(e.created_at),esc(e.action),esc(nameOf(e.actor_id))])));}
  h+='<div class="row-actions">'+click('Actualizar pedido','order',id)+'</div>';modal('CAM-'+o.number,h,null,true);
 }
 async function showUnit(id){
  const d=await api('/api/services/unit/'+encodeURIComponent(id)),u=d.unit;
  if(d.result&&!d.original){modal('Resultado · CAM-'+d.order.number+' · Cuenta '+u.position,credential(d.result));return;}
  let h=instructions(d)+'<h3>Cuenta '+u.position+'</h3>'+credential(d.original);
  if(u.reason)h+='<div class="notice">'+esc(u.reason)+'</div>';
  if(d.result)h+='<h3>Resultado enviado a revisión</h3>'+credential(d.result);
  if(role()==='wholesale')h+='<div class="row-actions">'+click('Reemplazar cuenta','replace',id)+(u.status==='blocked'?click('Devolver esta cuenta a mi saldo','refund-request',id,'danger small'):'')+'</div>';
  else{
   if(u.worker_id===S.user.id&&['assigned','rejected'].includes(u.status))h+='<div class="notice">Pago por esta cuenta aprobada y entregada: '+money(d.order.unit_cents-d.order.margin_cents)+'. Sin descuento del 3%. Tú realizas el cambio; el administrador lo revisa.</div>'+window.workDeadlineHTML('change_unit',u)+'<div class="row-actions">'+click('✓ Cambio realizado','submit',id,'primary')+click('Reportar problema','problem',id,'danger small')+'</div>';
   if(role()==='admin'&&u.status==='submitted')h+='<div class="row-actions">'+click('Aprobar cuenta','approve',id,'success')+click('Devolver con motivo','reject',id,'danger small')+'</div>';
   if(role()==='admin'&&['blocked','refund_requested'].includes(u.status))h+='<div class="row-actions">'+click('Cancelar unidad y devolver '+money(d.order.unit_cents),'refund-approve',id,'danger small')+(u.status==='refund_requested'?click('Rechazar solicitud con motivo','refund-reject',id):'')+'</div>';
  }
  modal('CAM-'+d.order.number+' · Cuenta '+u.position,h,null,true);
  if($('.modal'))$('.modal').dataset.changeUnit=u.id;
 }
 function eligible(o){return S.users.filter(u=>u.active&&!u.deleted_at&&['admin','worker'].includes(u.role));}
 function editOffer(o={}){
  modal(o.id?'Editar oferta':'Nueva oferta de cambios',
   field('name','Nombre',o.name)+'<p class="notice">Servicio: solo cambio de contraseña. El correo siempre se conserva.</p>'+field('price','Precio al mayorista por cuenta (USD)',Number(o.price_cents||0)/100,'number')+field('margin','Tu parte comercial por cuenta (USD)',Number(o.margin_cents||0)/100,'number')+
   '<p class="notice">Pago de ejecución = precio − tu parte. No se aplica el 3%. Los pedidos existentes conservan sus tarifas.</p>'+
   field('instructions','Indicaciones adicionales para el equipo',o.instructions||'','textarea',null,false)+
   field('active','Oferta visible',o.active!==false,'checkbox'),async d=>{
    await api('/api/services/offers',{id:o.id,name:d.name,mode:'password',price_cents:moneyInput(d.price),margin_cents:moneyInput(d.margin),instructions:d.instructions,active:d.active});await load();
   },true);
 }
 handlers['changes-offer-new']=()=>editOffer();
 handlers['changes-offer-edit']=id=>editOffer(X().offers.find(o=>o.id===id));
 handlers['changes-refresh']=()=>load();
 handlers['changes-order']=showOrderChanges;
 handlers['changes-unit']=showUnit;
 handlers['changes-buy']=id=>{
  const offer=X().offers.find(o=>o.id===id);
  modal('Solicitar '+esc(offer.name),'<div class="notice">'+money(offer.price_cents)+' por cuenta. El saldo a favor se aplicará automáticamente. No incluye reactivación de suscripciones ni creación de buzones.</div>'+
   '<div id="change-single">'+field('current_email','Correo de la cuenta','','email')+field('current_password','Contraseña actual','','password')+field('requested_password','Contraseña nueva que deseas','','password')+'</div>'+
   field('bulk_mode','Quiero enviar varias cuentas a la vez',false,'checkbox')+
   '<div id="change-bulk" hidden>'+field('text','Una cuenta por línea: correo|contraseña_actual|contraseña_nueva','','textarea',null,false)+'<p class="subtle">Cada cuenta puede tener una contraseña nueva diferente. También puedes pegar tres columnas separadas por tabulación.</p></div>'+
   field('acknowledged','Confirmo que son cuentas propias o autorizadas, accesibles y con suscripción vigente cuando sea necesaria',false,'checkbox'),async d=>{
    const accounts=d.bulk_mode?d.text.split(/\r?\n/).filter(l=>l.trim()).map((l,i)=>{const parts=l.split(l.includes('\t')?'\t':'|');if(parts.length!==3||parts.some(p=>!p))throw Error('Línea '+(i+1)+': usa correo|contraseña_actual|contraseña_nueva. Para contraseñas con |, usa tabulación o la carga individual.');return{email:parts[0].trim(),password:parts[1],new_password:parts[2]};}):[{email:d.current_email,password:d.current_password,new_password:d.requested_password}];
    if(!accounts.length)throw Error('Ingresa las cuentas que deseas modificar.');
    const total=accounts.length*offer.price_cents,credit=Math.min(total,Number(X().credit_cents));
    if(!confirm(accounts.length+' cuentas · Total '+money(total)+' · Saldo aplicado '+money(credit)+' · Diferencia a transferir '+money(total-credit)+'. ¿Confirmas el pedido?'))return;
    await api('/api/services/command',{action:'create',payload:{offer_id:id,accounts,acknowledged:d.acknowledged}});view='changes-orders';await load();
   },true);
  const form=$('#modal-form'),bulk=form.elements.bulk_mode,text=form.elements.text;text.disabled=true;
  bulk.addEventListener('change',()=>{const enabled=bulk.checked;$('#change-single').hidden=enabled;$('#change-bulk').hidden=!enabled;for(const name of ['current_email','current_password','requested_password'])form.elements[name].disabled=enabled;text.disabled=!enabled;text.required=enabled;});
  for(const name of ['current_email','current_password','email_base','email_domain','requested_password'])if(form.elements[name])form.elements[name].autocomplete=name==='requested_password'?'new-password':'off';
 };
 handlers['changes-payment']=id=>{const o=orderBy(id);modal('Declarar transferencia CAM-'+o.number,field('bank_id','Banco','','select',S.banks.map(b=>[b.id,b.bank+' · '+b.account_number]))+field('sender','Remitente')+field('transaction_code','Código de transacción')+field('payment_date','Fecha',new Date().toISOString().slice(0,10),'date')+field('amount','Importe exacto (USD)',(o.total_cents-o.credit_cents)/100,'number'),d=>change('payment',{...d,id,paid_cents:moneyInput(d.amount)}));};
 handlers['changes-verify']=async id=>{if(confirm('¿Verificaste el ingreso real y completo en tu banco?'))await change('verify_payment',{id},id);};
 handlers['changes-cancel']=async id=>{if(confirm('¿Cancelar este pedido sin pago verificado? Se libera el saldo interno aplicado.'))await change('cancel',{id});};
 handlers['changes-deliver']=async id=>{if(confirm('¿Confirmar la entrega completa y acreditar una sola vez las ganancias? El mayorista tendrá 7 días para descargar los resultados.'))await change('deliver',{id},id);};
 handlers['changes-assign']=id=>{
  const o=orderBy(id),people=eligible(o),pending=unitRows(o).filter(u=>u.status==='pending').length;
  modal('Asignar pendientes CAM-'+o.number,field('worker_id','Responsable (puedes elegirte)','','select',people.map(u=>[u.id,u.name+(u.role==='admin'?' · yo/admin':'')]))+field('quantity','Cantidad',pending,'number')+window.workDeadlineField()+'<p class="notice">Solo asigna unidades sin responsable. Tú decides cada reparto.</p>',d=>change('assign',{id,due_at:window.workDeadlineISO(d.due_at),allocations:[{worker_id:d.worker_id,quantity:Number(d.quantity)}]},id));
 };
 handlers['changes-split']=id=>{
  const o=orderBy(id),people=eligible(o),pending=unitRows(o).filter(u=>u.status==='pending').length;
  modal('Reparto elegido por ti','<p>Selecciona las personas; se distribuirán las '+pending+' unidades pendientes lo más equitativamente posible. No se reparte nada hasta que tú confirmes.</p><label class="field">Responsables<select name="people" multiple size="6">'+people.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join('')+'</select></label>'+window.workDeadlineField(),async d=>{
   const selected=[...$('#modal-form [name=people]').selectedOptions].map(o=>o.value);if(!selected.length||pending<selected.length)throw Error('Elige al menos una persona y no más que las unidades pendientes.');
   const allocations=selected.map((worker_id,i)=>({worker_id,quantity:Math.floor(pending/selected.length)+(i<pending%selected.length?1:0)}));await change('assign',{id,allocations,due_at:window.workDeadlineISO(d.due_at)},id);
  });
 };
 handlers['changes-reassign']=id=>{const unit=X().units.find(u=>u.id===id),o=orderBy(unit.order_id);modal('Reasignar solo esta cuenta','<div class="notice">El responsable anterior perderá el acceso. No se mueve una cuenta aprobada ni se paga otra vez.</div>'+field('worker_id','Nuevo responsable','','select',eligible(o).map(u=>[u.id,u.name]))+window.workDeadlineField(),d=>change('assign',{id:o.id,reassign:true,unit_ids:[id],due_at:window.workDeadlineISO(d.due_at),allocations:[{worker_id:d.worker_id,quantity:1}]},o.id));};
 handlers['changes-accept']=async id=>{await api('/api/services/command',{action:'accept',payload:{id}});await load();await showUnit(id);};
 handlers['changes-submit']=async id=>{
  const d=await api('/api/services/unit/'+id);
  modal('✓ Confirmar cambio realizado',instructions(d)+credential({email:d.original.email,password:d.request.requested_password})+field('confirmed','Ya cambié la contraseña, comprobé el acceso y acepto las indicaciones y la tarifa de '+money(d.order.unit_cents-d.order.margin_cents),false,'checkbox'),async form=>{
   if(!form.confirmed)throw Error('Confirma que realizaste el cambio antes de enviarlo.');
   if(!d.unit.accepted_at)await api('/api/services/command',{action:'accept',payload:{id}});
   await change('submit',{id,confirmed_work:true},d.order.id);
  },true);
 };
 handlers['changes-approve']=async id=>{const u=X().units.find(u=>u.id===id);await change('approve',{id},u.order_id);};
 for(const [name,action,title] of [['reject','reject','Motivo para corregir'],['problem','problem','Problema con la cuenta'],['refund-reject','refund_reject','Motivo para rechazar la devolución']])handlers['changes-'+name]=id=>{
  const u=X().units.find(u=>u.id===id);const reasons=name==='problem'?field('type','Motivo','','select',[['Contraseña incorrecta','Contraseña incorrecta'],['Sin suscripción','Sin suscripción'],['Cuenta bloqueada','Cuenta bloqueada'],['Código de verificación pendiente','Código de verificación pendiente'],['Otro','Otro']]):'';
  modal(title,reasons+field('reason','Detalle','','textarea'),d=>change(action,{id,reason:(d.type?d.type+': ':'')+d.reason},u.order_id));
 };
 for(const replace of [false,true])handlers['changes-'+(replace?'replace':'correct')]=async id=>{
  const d=await api('/api/services/unit/'+id);modal('Reemplazar cuenta con problema',field('email','Correo de la cuenta de reemplazo','','email')+field('password','Contraseña actual','','password')+field('new_password','Contraseña nueva que deseas','','password')+'<div class="notice">No hay un cobro adicional. Se conserva la fecha máxima del trabajo; el administrador puede modificarla.</div>',form=>change('correct',{id,...form},d.order.id));
 };
 handlers['changes-refund-request']=id=>{const u=X().units.find(u=>u.id===id),o=orderBy(u.order_id);if(confirm('¿Cancelar solo esta cuenta y devolver '+money(o.unit_cents)+' a tu saldo interno? No se devuelve dinero al banco.'))return change('refund_request',{id},u.order_id);};
 handlers['changes-set-password']=id=>modal('Indicar contraseña nueva',field('requested_password','Contraseña nueva solicitada','','password'),async d=>{await api('/api/services/units/'+id+'/requested-password',{requested_password:d.requested_password});await load();toast('Contraseña solicitada guardada.');});
 handlers['changes-refund-approve']=async id=>{const u=X().units.find(u=>u.id===id),o=orderBy(u.order_id);if(confirm('Se cancelará únicamente esta unidad y se devolverán '+money(o.unit_cents)+' al saldo del mayorista, sin pago al ejecutor. ¿Confirmas?'))await change('refund_approve',{id},o.id);};
 handlers['changes-notifications']=()=>modal('Avisos pendientes',X().notifications.length?X().notifications.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(n=>'<section class="panel"><p>'+esc(n.message)+'</p><small>'+date(n.created_at)+'</small> '+click('Abrir aviso','notification',n.id)+'</section>').join(''):empty('No tienes avisos'),null,true);
 handlers['changes-notification']=async id=>{const n=X().notifications.find(n=>n.id===id);await api('/api/services/command',{action:'notification_read',payload:{id}});await load();if(n.unit_id)await showUnit(n.unit_id);else await showOrderChanges(n.order_id);};
 handlers['changes-finance-settings']=()=>{
  const f=X().finance.settings;modal('Reserva y conservación',
   '<div class="notice">Elige expresamente el porcentaje. Se separará de las ganancias mensuales pendientes de configurar y de futuras ventas; nunca de pagos a trabajadores, productos a dominio o cambios.</div>'+
   field('reserve','Reserva sobre tu margen mensual (%)',f.reserve_bps===null?'':Number(f.reserve_bps)/100,'number')+
   field('pending_hours','Horas para pedidos sin pago',f.pending_hours,'number')+field('unpaid_retention_days','Días de conservación de pedidos sin pago vencidos',f.unpaid_retention_days,'number'),
   async d=>{await api('/api/services/finance',{action:'settings',payload:{reserve_bps:Math.round(Number(d.reserve)*100),pending_hours:Number(d.pending_hours),unpaid_retention_days:Number(d.unpaid_retention_days)}});await load();});
 };
 handlers['changes-finance-withdraw']=()=>{const request_id=crypto.randomUUID();modal('Registrar mi retiro','<p>Disponible contable: '+money(X().finance.available)+'. No mueve dinero del banco ni usa fondos de trabajadores o reserva.</p>'+field('amount','Importe (USD)','','number'),async d=>{await api('/api/services/finance',{action:'withdraw',payload:{request_id,amount_cents:moneyInput(d.amount)}});await load();});};
 handlers['changes-reserve-refund']=()=>{
  const request_id=crypto.randomUUID(),orders=S.orders.filter(o=>o.status==='delivered'&&X().finance.sales.some(s=>s.order_id===o.id&&s.monthly));
  modal('Devolver al saldo desde reserva',field('order_id','Venta mensual entregada','','select',orders.map(o=>[o.id,'#'+o.id.slice(0,8)+' · '+money(o.total_cents)]))+field('amount','Importe (USD)','','number')+'<p class="notice">Solo usa reserva disponible y acredita saldo interno al comprador. No realiza devolución bancaria.</p>',async d=>{await api('/api/services/finance',{action:'reserve_refund',payload:{request_id,order_id:d.order_id,amount_cents:moneyInput(d.amount)}});await load();});
 };
 handlers['changes-own-upload']=id=>{
  const a=S.assignments.find(a=>a.id===id);modal('Mi producción · '+esc(pname(a.product_id)),field('text','Una cuenta por línea: correo|contraseña','','textarea'),async d=>{
   const accounts=d.text.split(/\r?\n/).filter(l=>l.trim()).map((l,i)=>{const at=l.indexOf('|');if(at<0)throw Error('Línea '+(i+1)+': usa correo|contraseña.');return{email:l.slice(0,at).trim(),password:l.slice(at+1).trim()};});
   await command('submit_accounts',{assignment_id:id,accounts});
  },true);
 };
 // Preserve existing production screens while making acceptance and all-inclusive tariffs explicit.
 const assignmentsOriginal=assignmentsTable;
 assignmentsTable=function(){
  return assignmentsOriginal()+panel('Tarifas e instrucciones aceptadas',table(['Producto','Base total','Comisión','Neto total','Aceptación'],S.assignments.map(a=>{
   const base=Number(a.quantity)*Number(a.rate_cents),fee=Math.round(base*Number(a.commission_bps||0)/10000);
   return[esc(pname(a.product_id)),money(base),money(fee)+(a.commission_bps?' (3%)':''),money(base-fee),a.accepted_at||a.terms_version===0?'Aceptada / anterior':a.worker_id===S.user.id?click('Aceptar tarifa','accept-stock',a.id):'Pendiente de aceptación'];
  })));
 };
 handlers['changes-accept-stock']=id=>command('accept_assignment',{id});
 const assignmentHandler=handlers['assignment-new'];
 handlers['assignment-new']=()=>modal('Asignar producción para stock',
  field('worker_id','Responsable (puedes elegirte)','','select',S.users.filter(u=>u.active&&!u.deleted_at&&['worker','admin'].includes(u.role)).map(u=>[u.id,u.name+(u.role==='admin'?' · administrador':'')]))+
   field('product_id','Producto','','select',S.products.map(p=>[p.id,p.name]))+field('quantity','Cantidad',100,'number')+field('rate','Remuneración base por cuenta (USD)','0.20','number')+window.workDeadlineField()+
  '<div class="notice">Solo la producción con garantía por meses de trabajadores lleva 3%. Las asignaciones propias y a dominio no. La tarifa queda congelada y las garantías no generan un segundo pago.</div>',
   d=>saveAdmin('assignments',{...d,quantity:Number(d.quantity),rate_cents:moneyInput(d.rate),due_at:window.workDeadlineISO(d.due_at)}));
 // Existing stock payments now show the wallet discount and only request the bank difference.
 const showOrderOriginal=showOrder;
 showOrder=function(id){showOrderOriginal(id);const o=S.orders.find(o=>o.id===id);if(o?.credit_cents){const info=document.createElement('div');info.className='notice';info.textContent='Saldo a favor aplicado: '+money(o.credit_cents)+' · Diferencia bancaria: '+money(o.total_cents-o.credit_cents);$('.modal')?.append(info);}};
 const paymentOriginal=handlers.payment;
 handlers.payment=id=>{paymentOriginal(id);const o=S.orders.find(o=>o.id===id);if(o?.credit_cents){const input=$('#modal-form [name=paid]');if(input)input.value=((o.total_cents-o.credit_cents)/100).toFixed(2);}};
 const applyOriginal=applyLiveState;
 applyLiveState=function(next){applyOriginal(next);const shown=$('.modal')?.dataset.changeUnit;if(shown&&role()!=='wholesale'){const unit=X().units.find(u=>u.id===shown),order=unit?orderBy(unit.order_id):null;if(!unit||order?.status!=='processing')closeModal();}const notification=$('.notifications-trigger');if(notification){const count=X().notifications.filter(n=>!n.read_at).length;notification.textContent='Avisos · '+count;notification.setAttribute('aria-label',count+' avisos pendientes');}};
})();
