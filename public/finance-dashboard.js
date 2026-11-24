/* Read-only presentation. Amounts remain integer cents; no balances are written here. */
((root)=>{
 const cents=value=>Number(value||0);
 const sum=(rows,key='amount_cents')=>rows.reduce((n,row)=>n+cents(row[key]),0);
 function summarize(f,ledger=[]){
  const entries=f.entries||[],byKind=kind=>sum(entries.filter(e=>e.kind===kind));
  const reserveCorrections=sum(entries.filter(e=>e.kind==='adjustment'&&String(e.event_key||'').startsWith('stock-reserve-adjust:')));
  const commercial=byKind('margin')+reserveCorrections,own=byKind('own'),commissions=byKind('commission');
  const adjustments=byKind('adjustment')-reserveCorrections,withdrawn=-byKind('withdrawal');
  const known=new Set(['margin','own','commission','adjustment','withdrawal','reserve','reserve_use']);
  const unclassified=sum(entries.filter(e=>!known.has(e.kind)));
  const earned=commercial+own+commissions,available=earned+adjustments-withdrawn+unclassified;
  const workers=(f.users||[]).filter(u=>u.role==='worker').map(u=>{
   const movements=ledger.filter(l=>l.worker_id===u.id),kind=k=>sum(movements.filter(l=>l.kind===k));
   // Current production entries are already net of the 3%; only historical fees
   // have a separate negative ledger entry. Never subtract collected fees twice.
   const production=kind('production')+kind('historical_commission'),services=kind('change_service');
   const paid=-kind('withdrawal'),other=sum(movements.filter(l=>!['production','historical_commission','change_service','withdrawal'].includes(l.kind)));
   const fees=sum(entries.filter(e=>e.kind==='commission'&&e.user_id===u.id));
   const balance=cents(u.balance_cents),reserved=cents(u.reserved_cents);
   return {id:u.id,name:u.name,balance,reserved,free:balance-reserved,production,services,fees,paid,adjustments:other,
    expected:production+services+other-paid,difference:balance-(production+services+other-paid),movements};
  });
  return {commercial,own,commissions,earned,adjustments,withdrawn,unclassified,available,
   reportedDifference:cents(f.available)-available,reserve:byKind('reserve')+byKind('reserve_use'),reserveCorrections,
   workers,workersDue:sum(workers,'balance'),requested:sum(workers,'reserved'),workersPaid:sum(workers,'paid'),
   buyerCredit:sum(f.users||[],'credit_cents')};
 }
 root.arkaFinancialSummary=summarize;
 if(typeof document==='undefined')return;
 let from='',to='';
 const types={margin:'Tu parte de una venta',own:'Trabajo realizado por ti',commission:'Comisión del 3%',withdrawal:'Tu retiro personal',adjustment:'Ajuste del saldo',reserve:'Entrada a reserva',reserve_use:'Devolución desde reserva'};
 const signed=value=>(value>0?'+ ':'')+money(value);
 const localDay=value=>{const d=new Date(value);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 const kindLabel=e=>e.kind==='adjustment'?(String(e.event_key||'').startsWith('worker-balance:')?'Corrección de saldo de trabajador':String(e.event_key||'').startsWith('stock-reserve-adjust:')?'Separación de dinero a reserva':'Otro ajuste registrado'):types[e.kind]||'Movimiento sin clasificar';
 const card=(label,value,explanation,extra='')=>'<article class="finance-card '+extra+'"><h3>'+label+'</h3><strong>'+money(value)+'</strong><p>'+explanation+'</p></article>';
 const formulaRow=(label,value,explanation,cls='')=>'<div class="finance-formula-row '+cls+'"><div><span>'+label+'</span>'+(explanation?'<small>'+explanation+'</small>':'')+'</div><strong>'+signed(value)+'</strong></div>';
 function reference(e,f){
  const service=(S.services.orders||[]).find(o=>o.id===e.reference_id);
  if(service)return 'Servicio CAM-'+service.number;
  const sale=(f.sales||[]).find(s=>s.account_id===e.reference_id);
  const id=sale?.order_id||e.reference_id;
  if((S.orders||[]).some(o=>o.id===id))return 'Venta '+id.slice(0,8);
  const person=(f.users||[]).find(u=>u.id===e.user_id);
  return person?person.name:'Registro administrativo';
 }
 function render(){
  const f=S?.services?.finance;if(!f||role()!=='admin')return;
  const s=summarize(f,S.ledger||[]),pending=cents(f.pending_reserve)>0,entries=f.entries||[];
  const rows=entries.filter(e=>!['reserve','reserve_use'].includes(e.kind)&&(!from||localDay(e.created_at)>=from)&&(!to||localDay(e.created_at)<=to)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  let html=head('Tu ganancia y pagos del equipo','Todo separado: lo que ganas tú, lo que debes pagar y lo que solo estás administrando. No consulta tu banco.',
   btn('Registrar retiro personal','changes-finance-withdraw','','primary'));
  html+='<div class="finance-dashboard">';
  if(s.reportedDifference||s.unclassified)html+='<div class="error">Hay movimientos que requieren revisión contable. No se ha cambiado ningún saldo automáticamente.</div>';
  if(f.unknown_costs)html+='<div class="notice">Hay '+f.unknown_costs+' cuentas vendidas sin coste de trabajo verificable. Su ganancia no se inventa ni se incluye como disponible.</div>';
  html+='<section class="finance-section"><div class="finance-section-heading"><span>1</span><div><h2>Esto es lo que ganas tú</h2><p>El dinero de los trabajadores y de los mayoristas se muestra por separado más abajo.</p></div></div>'+
   '<div class="finance-cards">'+card('Tu parte de las ventas',s.commercial,'Lo vendido menos el pago asignado a quien hizo el trabajo. '+(pending?'Falta definir la reserva de algunas ventas.':'Las reservas configuradas ya están separadas.'))+
   card('Tu trabajo propio',s.own,'Lo que te corresponde por las cuentas que tú mismo produjiste o los servicios que tú completaste y entregaste.')+
   card('Tus comisiones del 3%',s.commissions,'Ya registradas sobre producción de trabajadores con garantía por meses. No se aplican a dominios ni a cambios de contraseña.')+'</div>'+
   '<div class="finance-cards finance-highlights">'+card('Tu ganancia acumulada',s.earned,'Tu parte de las ventas + tu trabajo propio + tus comisiones. No incluye correcciones manuales ni resta tus retiros.')+
   card('Tu saldo después de ajustes y retiros',s.available,'Es el saldo interno registrado a tu favor. Puede ser distinto de la ganancia si corregiste saldos o registraste retiros. No es el saldo del banco.','finance-owner-balance')+'</div>'+
   '<details class="finance-explanation" open><summary>Así se obtiene tu saldo</summary>'+
   formulaRow('Tu parte de las ventas',s.commercial)+formulaRow('Tu trabajo propio',s.own)+formulaRow('Tus comisiones',s.commissions)+
   formulaRow('Tu ganancia acumulada',s.earned,'La suma de los tres conceptos anteriores.','finance-subtotal')+
   formulaRow('Ajustes y correcciones',s.adjustments,'Por ejemplo: reducir un saldo incorrecto de un trabajador devuelve esa diferencia a tu saldo. Aumentarlo la descuenta. No es una nueva venta.')+
   formulaRow('Retiros personales registrados',-s.withdrawn,'Dinero que ya anotaste como retirado para ti.')+
   (s.unclassified?formulaRow('Movimientos sin clasificar',s.unclassified,'Revisa su origen en el historial.'):'')+
   formulaRow('Tu saldo registrado',s.available,'Ganancia + ajustes − retiros.','finance-total')+'</details>'+
   '<p class="finance-help">Las comisiones se registran al aprobar producción; por eso pueden incluir cuentas aún no vendidas. No se vuelven a descontar al pagar al trabajador.</p>';
  if(pending)html+='<div class="notice">Antes de registrar un retiro falta definir la reserva para '+f.pending_reserve+' cuentas vendidas. Puedes elegir <strong>0%</strong> si no quieres apartar dinero. No se ha elegido un porcentaje por ti. '+btn('Definir reserva','changes-finance-settings','','secondary small')+'</div>';
  if(f.pending_historical)html+='<div class="notice">Comisiones antiguas todavía pendientes de descontar: '+money(f.pending_historical)+'. No forman parte de tus comisiones registradas; no se ha dejado a nadie con saldo negativo.</div>';
  html+='</section><section class="finance-section"><div class="finance-section-heading"><span>2</span><div><h2>Lo que debes pagar a tus trabajadores</h2><p>Estos importes son del equipo, no tu ganancia.</p></div></div>'+
   '<div class="finance-cards">'+card('Pendiente total de pagar al equipo',s.workersDue,'Suma de los saldos actuales de los trabajadores. Incluye lo solicitado para retiro.')+
   card('De ese total, ya solicitaron retiro',s.requested,'Dinero reservado para retiros pendientes. Está incluido en el total de la izquierda; no se suma otra vez.')+
   card('Pagos al equipo ya realizados',s.workersPaid,'Retiros de trabajadores registrados como pagados. Ya se descontaron de sus saldos actuales.')+'</div>'+
   table(['Trabajador','Total por pagar','Retiro solicitado','Aún sin solicitar','Detalle'],s.workers.map(w=>[esc(w.name),money(w.balance),money(w.reserved),money(w.free),btn('Ver desglose','finance-worker-detail',w.id,'secondary small')]))+
   '<p class="finance-help">El coste de las cuentas vendidas ya se descontó al calcular tu parte de las ventas. No vuelvas a restar todo este saldo de tu ganancia. Los trabajadores también pueden tener producción aprobada todavía sin vender.</p>'+
   (s.workers.some(w=>w.difference||w.free<0)?'<div class="notice">Hay saldos del equipo que no coinciden con su historial o sus reservas. Abre «Ver desglose» para revisar la diferencia; no se ha corregido dinero automáticamente.</div>':'')+'</section>'+
   '<section class="finance-section"><div class="finance-section-heading"><span>3</span><div><h2>Dinero que no debes confundir con ganancia</h2></div></div><div class="finance-cards">'+
   card('Transferencias que confirmaste',cents(f.verified_receipts),'Total de cobros confirmados en la web. Incluye importes para trabajo, servicios y ventas; no significa ganancia ni verifica tu banco.')+
   card('Valor de servicios en proceso',cents(f.funds_processing),'Pedidos de contraseñas confirmados, pero todavía sin completar. Sus ganancias se reparten al entregar; no se suman como trabajo terminado.')+
   card('Saldo a favor de mayoristas',s.buyerCredit,'Dinero que los clientes pueden usar en compras o servicios. No es ganancia tuya.')+
   card('Dinero apartado para garantías',s.reserve,'Reserva separada para devoluciones de productos por meses. No está sumada en tu saldo personal disponible.')+'</div></section>'+
   '<section class="finance-section"><h2>Historial de tu saldo</h2><p>Cada entrada explica por qué subió o bajó. La reserva tiene su propio historial en el apartado inferior.</p><div class="form-row">'+
   field('finance_clear_from','Desde',from,'date',null,false)+field('finance_clear_to','Hasta',to,'date',null,false)+'</div>'+
   '<p class="finance-help">Las fechas solo filtran esta tabla. Los saldos y totales de arriba siguen siendo acumulados. Movimientos mostrados: '+rows.length+'.</p>'+
   table(['Fecha','Qué ocurrió','Origen / explicación','Cambio en tu saldo'],rows.map(e=>[date(e.created_at),esc(kindLabel(e)),esc(reference(e,f))+'<br><small>'+esc(e.description||'')+'</small>',signed(cents(e.amount_cents))]))+'</section>';
  html+='<details class="finance-section finance-advanced"><summary>Reserva y opciones avanzadas</summary><p>Reserva actual: <strong>'+money(s.reserve)+'</strong>. Una devolución desde aquí se acredita al saldo del mayorista; no hace una transferencia bancaria.</p>'+
   '<div class="row-actions">'+btn('Configurar reserva y conservación','changes-finance-settings','','secondary')+btn('Registrar devolución desde reserva','changes-reserve-refund','','secondary')+'</div>'+
   table(['Fecha','Movimiento de reserva','Importe'],entries.filter(e=>['reserve','reserve_use'].includes(e.kind)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(e=>[date(e.created_at),esc(e.description||types[e.kind]),signed(cents(e.amount_cents))]))+
   '<p class="finance-help">Separar reserva no es un gasto nuevo: solo mueve una parte de tu dinero a otro apartado. Las devoluciones no se descuentan dos veces del saldo personal.</p></details>';
  const storage=f.storage;
  if(storage)html+='<details class="finance-section finance-advanced"><summary>Almacenamiento y conservación de datos</summary><p>Base de datos: '+(cents(storage.used_bytes)/1048576).toFixed(2)+' MB de '+(cents(storage.limit_bytes)/1048576).toFixed(0)+' MB.</p><p>Los siete días de acceso a las contraseñas no son una garantía adicional. Este bloque no cambia tus ganancias.</p></details>';
  html+='</div>';$('#content').innerHTML=html;
  $('[name=finance_clear_from]').onchange=e=>{from=e.target.value;render();};
  $('[name=finance_clear_to]').onchange=e=>{to=e.target.value;render();};
 }
 handlers['finance-worker-detail']=id=>{
  if(role()!=='admin'||!S?.services?.finance)return;
  const f=S.services.finance,s=summarize(f,S.ledger||[]),w=s.workers.find(w=>w.id===id);if(!w)return;
  modal('Cuenta de '+esc(w.name),'<div class="finance-dashboard">'+
   formulaRow('Producción aprobada, neta',w.production,'La comisión ya está descontada aquí.')+
   formulaRow('Servicios de contraseñas completados',w.services,'No tienen comisión del 3%.')+
   formulaRow('Ajustes manuales',w.adjustments)+formulaRow('Retiros ya pagados',-w.paid)+
   formulaRow('Saldo según movimientos',w.expected,'Suma del historial anterior.','finance-subtotal')+
   formulaRow('Saldo actual registrado',w.balance,'Lo que todavía corresponde al trabajador.','finance-total')+
   '<p class="finance-help">Comisión del 3% registrada para ti por este trabajador: <strong>'+money(w.fees)+'</strong>. Es informativa: no se resta otra vez del neto.</p>'+
   (w.difference?'<div class="error">Diferencia entre saldo e historial: '+signed(w.difference)+'. Puede faltar un movimiento antiguo; revisa antes de corregir. No se modificó ningún saldo.</div>':'<p>El saldo coincide con el historial.</p>')+
   '<p>De su saldo, '+money(w.reserved)+' ya está solicitado para retiro y '+money(w.free)+' sigue sin solicitar.</p></div>'+
   table(['Fecha','Motivo registrado','Importe'],w.movements.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(l=>[date(l.created_at),esc(l.note||l.kind),signed(cents(l.amount_cents))])),null,true);
 };
 const original=renderContent;
 renderContent=function(){if(S&&view==='finances'&&role()==='admin')render();else original();};
 const originalWithdraw=handlers['changes-finance-withdraw'];
 handlers['changes-finance-withdraw']=()=>{
  const f=S?.services?.finance;if(!f||role()!=='admin')return;
  if(f.pending_reserve){toast('Primero define la reserva pendiente; puede ser 0% si no quieres apartar dinero.');return;}
  originalWithdraw();
  $('#modal-form')?.insertAdjacentHTML('afterbegin','<p class="notice">Esto solo registra un retiro personal en tu contabilidad. No envía dinero ni consulta tu banco. No es un pago a trabajadores.</p>');
 };
 if(typeof S!=='undefined'&&S&&view==='finances')render();
})(globalThis);
