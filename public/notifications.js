/* The existing private event stream remains connected in another tab.
   Audio is opt-in per device, as required by browser autoplay policies. */
(()=>{
 let audio=null,owner=null,seen=new Set(),initialized=false,fetching=false,stream=null,refreshTimer=null;
 const preference=()=>localStorage.getItem('arka-notification-sound')==='1';
 const tone=()=>{
  if(!preference()||audio?.state!=='running')return false;
  const start=audio.currentTime;
  for(const [offset,frequency]of [[0,740],[0.18,988],[0.38,1175]]){
   const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;
   gain.gain.setValueAtTime(0,start+offset);gain.gain.linearRampToValueAtTime(0.18,start+offset+0.015);gain.gain.exponentialRampToValueAtTime(0.001,start+offset+0.3);
   oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(start+offset);oscillator.stop(start+offset+0.32);
  }
  return true;
 };
 async function activate(){
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error('Este navegador no permite activar el sonido de avisos.');
  audio=audio||new Context();await audio.resume();
  if(audio.state!=='running')throw Error('El navegador bloqueó el sonido. Actívalo con un clic directo y revisa que la pestaña no esté silenciada.');
  localStorage.setItem('arka-notification-sound','1');tone();updateButtons();toast('Sonido activado para esta sesión. Funcionará en otra pestaña mientras el navegador lo permita.');
 }
 function updateButtons(){
  const button=document.querySelector('.notification-sound-toggle');if(button){const active=preference()&&audio?.state==='running';button.textContent=active?'Sonido: activado':'Activar sonido';button.setAttribute('aria-pressed',String(active));}
  const bell=document.querySelector('.notifications-trigger');if(bell&&S?.services){const count=S.services.notifications.filter(n=>!n.read_at).length;bell.textContent='Avisos · '+count;bell.setAttribute('aria-label',count+' avisos pendientes');}
 }
 function sharedClaim(id){
  const key='arka-last-sounded:'+owner;let ids=[];try{ids=JSON.parse(localStorage.getItem(key)||'[]');}catch{}
  if(ids.includes(id))return false;ids.unshift(id);localStorage.setItem(key,JSON.stringify(ids.slice(0,100)));return true;
 }
 function announce(notification){
  if(!sharedClaim(notification.id))return;
  tone();
  if(!document.hidden)toast(notification.message);
  if(document.hidden&&'Notification'in window&&Notification.permission==='granted'){
   try{const notice=new Notification('ARKA DIGITAL · Nuevo aviso',{body:notification.message,tag:'arka-'+notification.id,silent:preference()});
    notice.onclick=()=>{window.focus();notice.close();void handlers['changes-notification'](notification.id).catch(e=>toast(e.message));};
   }catch{}
  }
 }
 function consume(rows){
  if(!S)return;
  if(owner!==S.user.id){owner=S.user.id;seen=new Set();initialized=false;}
  const fresh=initialized?rows.filter(n=>!seen.has(n.id)&&!n.read_at):[];
  rows.forEach(n=>seen.add(n.id));initialized=true;
  S.services.notifications=rows;updateButtons();
  // One chime for a burst, while every event remains in the durable inbox.
  if(fresh.length)announce(fresh[0]);
 }
 async function poll(){
  if(!S||fetching)return;fetching=true;const userId=S.user.id;
  try{const response=await fetch('/api/notifications',{cache:'no-store'});if(response.ok){const body=await response.json();if(S?.user.id===userId)consume(body.notifications||[]);}}
  catch{}finally{fetching=false;}
 }
 function bind(){
  if(liveEvents&&liveEvents!==stream){stream=liveEvents;stream.addEventListener('state-change',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(poll,180);});stream.addEventListener('open',poll);}
 }
 const renderOriginal=render;
 render=function(){
  renderOriginal();if(!S)return;consume(S.services.notifications||[]);
  const top=document.querySelector('.top-actions');if(top&&!top.querySelector('.notification-sound-toggle')){
   const button=document.createElement('button');button.className='ghost small notification-sound-toggle';button.dataset.action='notification-sound';top.prepend(button);updateButtons();
  }
  setTimeout(bind,0);void poll();
 };
 const applyOriginal=applyLiveState;
 applyLiveState=function(next){const rows=next.services?.notifications||[];applyOriginal(next);consume(rows);bind();};
 handlers['notification-sound']=async()=>{
  if(preference()&&audio?.state==='running'){localStorage.setItem('arka-notification-sound','0');updateButtons();toast('Sonido desactivado');}
  else await activate();
 };
 handlers['notification-desktop']=async()=>{
  if(!('Notification'in window))throw Error('Este navegador no admite avisos de escritorio.');
  const permission=await Notification.requestPermission();toast(permission==='granted'?'Avisos de escritorio permitidos.':'El navegador no autorizó los avisos de escritorio. El sonido activado puede seguir funcionando.');
 };
 handlers['changes-notifications']=()=>modal('Avisos',
  '<div class="row-actions">'+btn('Activar o desactivar sonido','notification-sound')+btn('Permitir avisos de escritorio','notification-desktop')+btn('Marcar todos como leídos','notification-read-all')+'</div><p class="subtle">El sonido requiere un clic de activación y que el navegador no esté silenciado. No se garantiza con el navegador cerrado o suspendido.</p>'+
  (S.services.notifications.length?S.services.notifications.map(n=>'<section class="panel"><p>'+(n.read_at?'':'<strong>Nuevo · </strong>')+esc(n.message)+'</p><small>'+date(n.created_at)+'</small> '+btn('Abrir aviso','changes-notification',n.id)+'</section>').join(''):empty('No tienes avisos')),null,true);
 handlers['notification-read-all']=async()=>{await api('/api/notifications/read',{all:true});await poll();handlers['changes-notifications']();};
 handlers['changes-notification']=async id=>{
  const n=S.services.notifications.find(n=>n.id===id);if(!n)return;
  await api('/api/notifications/read',{id});await load();const target=n.target_id||n.order_id,type=n.target_type||'change_order';
  if(type==='stock_order'){view='orders';render();if(S.orders.some(o=>o.id===target))showOrder(target);else toast('Este pedido ya no está disponible.');}
  else if(type==='assignment'){
   view='assignments';render();const a=S.assignments.find(a=>a.id===target);
   if(a)modal('Asignación · '+esc(pname(a.product_id)),'<p>Cantidad: '+a.quantity+' · Base por cuenta: '+money(a.rate_cents)+' · Comisión: '+(a.commission_bps/100)+'%.</p>'+(a.accepted_at?'Tarifa aceptada.':btn('Revisar y aceptar tarifa','changes-accept-stock',a.id)));
  }else if(type==='report'){view='reports';render();if(S.reports.some(r=>r.id===target))await handlers.report(target);else toast('El reporte ya fue cerrado o retirado.');}
  else if(type==='production'){view='reviews';render();}
  else{view=role()==='admin'?'changes-review':role()==='worker'?'changes-work':'changes-orders';render();if(n.unit_id)await handlers['changes-unit'](n.unit_id);else await handlers['changes-order'](target);}
 };
 // After a reload browsers may require a new gesture even when the preference is saved.
 document.addEventListener('pointerdown',()=>{if(preference()&&audio?.state!=='running'){const Context=window.AudioContext||window.webkitAudioContext;if(Context){audio=audio||new Context();void audio.resume().then(updateButtons).catch(()=>{});}}},{passive:true});
 setInterval(()=>{if(!S){owner=null;initialized=false;seen.clear();stream=null;return;}bind();void poll();},30000);
 document.addEventListener('visibilitychange',()=>{if(S){bind();void poll();}});
 window.addEventListener('focus',()=>{if(S){bind();void poll();}});
})();
