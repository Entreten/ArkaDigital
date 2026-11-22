/* Full credentials are fetched only for an authorized, delivered purchase. */
(()=>{
 let visible=new Map(),searchOwner=null,searchTerm='',searchRows=null,searching=false,searchSequence=0,searchTimer;
 const emailValid=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
 function drawSearch(){
  const box=$('#purchases-global-results');if(!box)return;
  box.innerHTML=searching?'<p role="status">Buscando en todos tus pedidos…</p>':searchRows===null?'<p class="subtle">Escribe el correo completo. La búsqueda es automática y solo consulta tus propias compras, sin abrir carpeta por carpeta.</p>':searchRows.length?
   '<p role="status">'+searchRows.length+' coincidencia(s) en tu historial.</p>'+table(['Producto / paquete','Pedido','Fecha de compra','Acción'],searchRows.map(r=>[esc(r.product_name),'<code>'+esc(r.order_id.slice(0,8))+'</code>',date(r.purchased_at)+(r.delivered_at?'<br><small>Entrega: '+date(r.delivered_at)+'</small>':''),btn(r.item_id?'Abrir compra':'Ver pedido','purchase-global-open',r.account_id,'primary small')])):
   '<p role="status">No aparece ese correo entre tus compras conservadas. Comprueba el correo actual completo de la cuenta.</p>';
 }
 async function searchAll(){
  if(!emailValid(searchTerm))throw Error('Escribe el correo completo de la cuenta.');
  const seq=++searchSequence,owner=S.user.id,term=searchTerm;searching=true;drawSearch();
  try{const result=await api('/api/purchases/search',{email:term});if(!S||S.user.id!==owner||seq!==searchSequence)return;searchRows=result.matches;searching=false;drawSearch();}
  catch(e){if(!S||S.user.id!==owner||seq!==searchSequence)return;searching=false;drawSearch();toast(e.message);}
 }
 function attachSearch(focus,selection){
  if(searchOwner!==S.user.id){searchOwner=S.user.id;searchTerm='';searchRows=null;searching=false;searchSequence++;clearTimeout(searchTimer);}
  const box=document.createElement('section');box.className='panel purchase-global-search';
  box.innerHTML='<h3>Encuentra una cuenta en todas tus compras</h3><form id="purchases-global-form" class="toolbar"><label class="field">Correo de la cuenta<input id="purchases-global-email" class="search" type="search" inputmode="email" maxlength="320" autocomplete="off" spellcheck="false" placeholder="Escribe el correo completo…" value="'+esc(searchTerm)+'"></label><button type="submit" class="primary"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7"></circle><path d="m15 15 6 6"></path></svg> Buscar</button></form><div id="purchases-global-results"></div>';
  const head=$('#content .page-head');if(head)head.insertAdjacentElement('afterend',box);else $('#content').prepend(box);
  const input=$('#purchases-global-email');input.oninput=()=>{searchTerm=input.value;searchRows=null;searching=false;searchSequence++;clearTimeout(searchTimer);drawSearch();if(emailValid(searchTerm))searchTimer=setTimeout(()=>void searchAll().catch(e=>toast(e.message)),350);};
  $('#purchases-global-form').onsubmit=e=>{e.preventDefault();clearTimeout(searchTimer);void searchAll().catch(e=>toast(e.message));};drawSearch();
  if(focus){input.focus({preventScroll:true});if(selection)input.setSelectionRange(...selection);}
 }
 handlers['purchase-global-open']=async id=>{
  const row=searchRows?.find(r=>r.account_id===id);if(!row)return;const term=searchTerm;
  if(!row.item_id){showOrder(row.order_id);return;}
  await showPurchase(row.item_id);
  if(row.status==='purged'){toast('Pedido localizado. Los datos de esa cuenta ya se eliminaron según su plazo de conservación.');return;}
  const input=$('#purchase-search');if(input&&modalDetail?.type==='purchase'&&modalDetail.id===row.item_id){input.value=term;input.dispatchEvent(new Event('input',{bubbles:true}));}
 };
 const plain=a=>[a.email,a.password,a.observation||''].map(value=>String(value||'').replace(/[\r\n\t]+/g,' ')).join('\t');
 async function copy(value){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}}catch{}
  const input=document.createElement('textarea');input.value=value;input.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(input);input.select();
  const ok=document.execCommand('copy');input.remove();if(!ok)throw Error('El navegador no permitió copiar. Puedes seleccionar los datos manualmente.');
 }
 const closeOriginal=closeModal;
 closeModal=function(){visible.clear();closeOriginal();};
 const loginOriginal=login;
 login=function(){visible.clear();loginOriginal();};
 showPurchase=async function(id,refresh=false){
  const expectedVersion=modalVersion,expectedView=view,item=S.items.find(row=>row.id===id);if(!item)return;
  const result=await api('/api/orders/'+encodeURIComponent(item.order_id)+'/accounts?product_id='+encodeURIComponent(item.product_id));
  if(!S||modalVersion!==expectedVersion||view!==expectedView||(refresh&&(modalDetail?.type!=='purchase'||modalDetail.id!==id)))return;
  const previous=refresh?$('#purchase-search'):null,term=previous?.value||(refresh?modalDetail?.query:'')||'',focused=!!previous&&document.activeElement===previous,selection=focused?[previous.selectionStart,previous.selectionEnd]:null;
  const accounts=result.accounts;
  modal(esc(item.product_name)+' · '+accounts.length+' cuentas',
   '<div class="notice">Datos privados de esta compra. Puedes copiar una cuenta completa, un campo o todas las cuentas filtradas. No compartas esta pantalla.</div>'+
   '<div class="toolbar"><label class="field" style="flex:1 1 220px"><span>Buscar por correo electrónico</span><input id="purchase-search" class="search" type="search" aria-label="Buscar cuenta por correo" placeholder="Correo completo o una parte…" value="'+esc(term)+'"></label><span id="purchase-count" role="status"></span>'+btn('Copiar todas las cuentas','purchase-copy-all','','primary small')+'</div><div id="purchase-accounts"></div>',
   null,true,{type:'purchase',id,query:term});
  const input=$('#purchase-search');
  const draw=()=>{
   const query=input.value.trim().toLowerCase(),matches=accounts.filter(a=>!query||(a.email||'').toLowerCase().includes(query));
   visible=new Map(matches.filter(a=>a.data).map(a=>[a.id,a.data]));
   $('#purchase-count').textContent=matches.length+' de '+accounts.length+' cuentas';
   $('#purchase-accounts').innerHTML=matches.length?table(['Correo electrónico','Contraseña','Observación','Copiar / acciones'],matches.map(a=>a.data?[
    '<code class="purchase-value">'+esc(a.data.email)+'</code>'+btn('Copiar correo','purchase-copy-email',a.id,'ghost small'),
    '<code class="purchase-value">'+esc(a.data.password)+'</code>'+btn('Copiar contraseña','purchase-copy-password',a.id,'ghost small'),
    '<span class="purchase-value">'+esc(a.data.observation||'Sin observaciones')+'</span>'+btn('Copiar observación','purchase-copy-observation',a.id,'ghost small'),
    btn('Copiar cuenta completa','purchase-copy-account',a.id,'primary small')+btn('Garantía y detalles','account',a.id)
   ]:[esc(a.email||'Datos eliminados'),'—','Los datos ya no están disponibles según la conservación o garantía del producto.',btn('Ver estado','account',a.id)])):empty('No se encontraron cuentas con ese correo');
   if(modalDetail?.type==='purchase'&&modalDetail.id===id)modalDetail.query=input.value;
  };
  input.oninput=draw;draw();if(focused){input.focus({preventScroll:true});input.setSelectionRange(...selection);}
 };
 for(const [action,field] of [['email','email'],['password','password'],['observation','observation'],['account',null]])handlers['purchase-copy-'+action]=async id=>{
  const account=visible.get(id);if(!account)throw Error('Abre nuevamente esta compra para copiar los datos vigentes.');
  await copy(field?String(account[field]||''):plain(account));toast('Copiado al portapapeles');
 };
 handlers['purchase-copy-all']=async()=>{
  if(!visible.size)throw Error('No hay cuentas disponibles para copiar con este filtro.');
  await copy([...visible.values()].map(plain).join('\n'));toast(visible.size+' cuentas copiadas');
 };
 const orderOriginal=showOrder;
 showOrder=function(id){orderOriginal(id);const order=S.orders.find(o=>o.id===id);if(role()==='admin'&&order?.status==='delivered'){
  const actions=document.createElement('div');actions.className='row-actions';actions.innerHTML=btn('Eliminar venta de prueba','sale-delete-test',id,'danger small');$('.modal')?.append(actions);
 }};
 const renderOriginal=renderContent;
 renderContent=function(){const old=$('#purchases-global-email'),focus=!!old&&document.activeElement===old,selection=focus?[old.selectionStart,old.selectionEnd]:null;renderOriginal();if(role()==='wholesale'&&view==='purchases')attachSearch(focus,selection);if(role()==='admin'&&view==='orders')document.querySelectorAll('#content [data-action="order"]').forEach(button=>{
  if(S.orders.find(o=>o.id===button.dataset.id)?.status==='delivered')button.insertAdjacentHTML('afterend',btn('Eliminar prueba','sale-delete-test',button.dataset.id,'danger small'));
 });};
 handlers['sale-delete-test']=id=>{
  const order=S.orders.find(o=>o.id===id);if(!order)return;
  modal('Eliminar venta de prueba','<div class="error">Se retirará esta venta de '+money(order.total_cents)+' del historial, cantidades vendidas y ganancias. Sus credenciales dejarán de estar disponibles y las cuentas no regresan automáticamente al stock.</div><p>No ejecuta devoluciones bancarias ni revierte sueldos o retiros de trabajadores. El saldo interno utilizado se restituye. Se conserva una copia privada de recuperación.</p>'+field('confirmation','Escribe ELIMINAR para confirmar que fue una prueba'),async d=>{
   await api('/api/sales/delete-test',{id,confirmation:d.confirmation});await load();toast('Venta de prueba retirada de las ventas y ganancias.');
  },true);
 };
})();
