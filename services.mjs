import {randomBytes} from 'node:crypto';
import {emailValid,suggestEmail,validateChange,parseAccounts} from './lib/change-rules.mjs';
import {workbook} from './lib/xlsx.mjs';
export function installServices(app,{db,all,seal,unseal,accountInput,fail,clean,number}){
 const one=async(table,id)=>{const[r]=await db(table+'?id=eq.'+encodeURIComponent(id)+'&limit=1');if(!r)throw fail('Registro no encontrado',404);return r;};
 const allowed=(u,roles)=>{if(!roles.includes(u.role))throw fail('Acceso denegado',403);};
 async function orderAccess(user,id){const o=await one('arka_change_orders',id);if(user.role==='wholesale'&&o.buyer_id!==user.id)throw fail('Acceso denegado',403);if(user.role==='worker'&&!(await db('arka_change_units?order_id=eq.'+o.id+'&worker_id=eq.'+user.id+'&select=id&limit=1')).length)throw fail('Acceso denegado',403);return o;}
 async function details(user,id){
  const unit=await one('arka_change_units',id),o=await orderAccess(user,unit.order_id);
  if(user.role==='worker'&&unit.worker_id!==user.id)throw fail('Acceso denegado',403);
  const [secret]=await db('arka_change_secrets?unit_id=eq.'+unit.id+'&limit=1');
  const delivered=o.status==='delivered',current=delivered&&new Date(o.access_until)>new Date()&&!o.purged_at;
  if(delivered){
   if(user.role!=='wholesale'||o.buyer_id!==user.id||!current)throw fail('Los datos ya no están disponibles para este perfil o venció el plazo.',403);
   if(unit.status==='cancelled')return {unit,order:o,result:null};
   let result=unseal(secret?.result_cipher);
   if(unit.linked_account_id){const a=await one('arka_accounts',unit.linked_account_id);if(a.buyer_id===user.id)result=unseal(a.cipher);}
   return {unit,order:{id:o.id,number:o.number,mode:o.mode,access_until:o.access_until},result};
  }
  if(o.status!=='processing')throw fail('Los datos se habilitan tras verificar el pago.',403);
  if(user.role==='wholesale'&&!['blocked','refund_requested'].includes(unit.status))throw fail('Los resultados se entregan juntos al finalizar el pedido.',403);
  const request=unseal(o.request_cipher)||{};let original=unseal(secret?.original_cipher);
  if(!original&&unit.linked_account_id){const a=await one('arka_accounts',unit.linked_account_id);if(a.buyer_id!==o.buyer_id)throw fail('Cuenta vinculada no disponible.',403);original=unseal(a.cipher);}
  original=original||{};
  const response={unit,order:{id:o.id,number:o.number,mode:o.mode,offer_name:o.offer_name,unit_cents:o.unit_cents,margin_cents:o.margin_cents,instructions:o.instructions},request,original,suggestion:unseal(secret?.suggestion_cipher)};
  if(user.role!=='wholesale')response.result=unseal(secret?.result_cipher);
  return response;
 }
 async function linked(user,id){
  const a=await one('arka_accounts',id),p=await one('arka_products',a.product_id);
  if(a.buyer_id!==user.id||a.status!=='sold'||p.mode!=='duration'||new Date(a.expires_at)<=new Date())throw fail('Selecciona una cuenta tuya con garantía por duración vigente.');
  return {data:unseal(a.cipher),id:a.id};
 }
 async function prepareAccount(user,input,request,mode,useLinkedData=true){
  let original=input,link=null;
  if(input.linked_account_id){const a=await linked(user,input.linked_account_id);if(useLinkedData)original=a.data;link=a.id;}
  const normalized={email:String(original.email||'').trim().toLowerCase(),password:String(original.password||'')};
  const encrypted=accountInput(normalized);
  const suggestion={email:mode==='password'?normalized.email:suggestEmail(request.pattern),password:mode==='email'?normalized.password:request.fixed_password||randomBytes(18).toString('base64url')};
  return {...encrypted,cipher:link&&useLinkedData?null:encrypted.cipher,linked_account_id:link,suggestion_cipher:seal(suggestion)};
 }
 app.get('/api/services/state',async(req,res)=>res.json(await state(req.user)));
 app.get('/api/services/orders/:id/instructions',async(req,res)=>{
  allowed(req.user,['admin','worker']);const o=await orderAccess(req.user,req.params.id);
  if(o.status!=='processing')throw fail('Las indicaciones solo están disponibles durante el trabajo.',403);
  res.json({order:{id:o.id,number:o.number,mode:o.mode,instructions:o.instructions},request:unseal(o.request_cipher)||{}});
 });
 app.get('/api/services/unit/:id',async(req,res)=>res.json(await details(req.user,req.params.id)));
 app.get('/api/services/orders/:id/export',async(req,res)=>{
  allowed(req.user,['wholesale']);const o=await orderAccess(req.user,req.params.id);
  if(o.status!=='delivered'||!o.access_until||new Date(o.access_until)<=new Date()||o.purged_at)throw fail('El plazo para exportar terminó.',410);
  const units=await all('arka_change_units','order_id=eq.'+o.id+'&order=position.asc');
  const rows=[['Pedido','Cuenta','Correo final','Contraseña final','Estado']];
  for(const unit of units){const d=await details(req.user,unit.id);rows.push(['CAM-'+o.number,unit.position,d.result?.email||'',d.result?.password||'',unit.status==='cancelled'?'Cancelada con devolución':'Entregada']);}
  // Recheck at response time: a long export must not bypass the exact access deadline.
  if(new Date(o.access_until)<=new Date())throw fail('El plazo para exportar terminó.',410);
  res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="ARKA-CAM-${o.number}.xlsx"`,'Cache-Control':'no-store'}).send(workbook(rows));
 });
 app.post('/api/services/offers',async(req,res)=>{
  allowed(req.user,['admin']);const b=req.body,price=number(b.price_cents,1),margin=number(b.margin_cents);
  if(margin>price)throw fail('Tu parte no puede superar el precio al mayorista.');
  if(!['email','password','both'].includes(b.mode)||clean(b.name,150).length<2)throw fail('Completa nombre y modalidad.');
  const workers=Array.isArray(b.workers)?[...new Set(b.workers)]:[];
  for(const id of workers){const u=await one('arka_users',id);if(!['worker','admin'].includes(u.role)||!u.active||u.deleted_at)throw fail('Selecciona trabajadores activos.');}
  const body={name:clean(b.name,150),mode:b.mode,price_cents:price,margin_cents:margin,instructions:clean(b.instructions,3000),active:b.active!==false,workers};
  res.json(await db('arka_change_offers'+(b.id?'?id=eq.'+encodeURIComponent(b.id):''),{method:b.id?'PATCH':'POST',body}));
 });
 app.post('/api/services/command',async(req,res)=>{
  const action=clean(req.body.action,40);let payload={...req.body.payload};
  if(!['create','notification_read','payment','verify_payment','cancel','assign','deliver','accept','submit','approve','reject','problem','correct','refund_request','refund_approve','refund_reject'].includes(action))throw fail('Operación desconocida');
  if(action==='create'){
   allowed(req.user,['wholesale']);const offer=await one('arka_change_offers',payload.offer_id);
   const request={pattern:clean(payload.pattern,320).toLowerCase(),fixed_password:String(payload.fixed_password||'').slice(0,500)};
   if(offer.mode!=='password'&&!emailValid(request.pattern))throw fail('Indica el ejemplo de correo de un dominio que puedas utilizar.');
   const inputs=Array.isArray(payload.accounts)?payload.accounts:parseAccounts(payload.text);
   if(!inputs.length||inputs.length>1000)throw fail('Carga entre 1 y 1000 cuentas.');
   const accounts=[],seen=new Set();for(const input of inputs){const a=await prepareAccount(req.user,input,request,offer.mode);if(seen.has(a.fingerprint))throw fail('Hay cuentas de origen duplicadas.');seen.add(a.fingerprint);accounts.push(a);}
   payload={offer_id:offer.id,accounts,request_cipher:seal(request),acknowledged:payload.acknowledged===true};
  }else if(action==='submit'){
   allowed(req.user,['admin','worker']);const d=await details(req.user,payload.id);
   if(d.unit.worker_id!==req.user.id)throw fail('Esta unidad no te está asignada.',403);
   const result={email:String(payload.email||'').trim().toLowerCase(),password:String(payload.password||'')};
   try{validateChange(d.order.mode,d.original,result,d.request);}catch(e){throw fail(e.message);}
   payload={id:d.unit.id,...accountInput(result)};
  }else if(action==='correct'){
   allowed(req.user,['wholesale']);const d=await details(req.user,payload.id),a=await prepareAccount(req.user,payload,d.request,d.order.mode,false);
   payload={id:d.unit.id,...a};
  }else if(action==='assign'){
   allowed(req.user,['admin']);if(!Array.isArray(payload.allocations)||payload.allocations.length>100)throw fail('Reparto no válido');
   payload.allocations=payload.allocations.map(a=>({worker_id:a.worker_id,quantity:number(a.quantity,1,1000)}));
  }else if(action==='payment'){payload.paid_cents=number(payload.paid_cents);payload.transaction_code=clean(payload.transaction_code,150);payload.sender=clean(payload.sender,150);}
  else if(['problem','reject','refund_approve','refund_reject'].includes(action))payload.reason=clean(payload.reason,2000);
  res.json(await db('rpc/arka_changes',{method:'POST',body:{actor:req.user.id,action,payload}}));
 });
 app.post('/api/services/finance',async(req,res)=>{
  allowed(req.user,['admin']);const action=clean(req.body.action,40),payload={...req.body.payload};
  if(!['settings','withdraw','reserve_refund'].includes(action))throw fail('Operación no válida.');
  if(action!=='settings'){payload.amount_cents=number(payload.amount_cents,1);if(!/^[a-zA-Z0-9-]{10,80}$/.test(String(payload.request_id||'')))throw fail('Identificador de operación no válido.');}
  res.json(await db('rpc/arka_finance_command',{method:'POST',body:{actor:req.user.id,action,payload}}));
 });
 let storageCache=null,storageAt=0;
 async function state(user){
  const admin=user.role==='admin',buyer=user.role==='wholesale';
  let orders,units;
  if(admin){orders=await all('arka_change_orders');units=await all('arka_change_units');}
  else if(buyer){orders=await all('arka_change_orders','buyer_id=eq.'+user.id);const ids=orders.map(o=>o.id);units=ids.length?await all('arka_change_units','order_id=in.('+ids.join(',')+')'):[];}
  else{units=await all('arka_change_units','worker_id=eq.'+user.id);const ids=[...new Set(units.map(u=>u.order_id))];orders=ids.length?await all('arka_change_orders','id=in.('+ids.join(',')+')&status=eq.processing'):[];const active=new Set(orders.map(o=>o.id));units=units.filter(u=>active.has(u.order_id));}
  const permittedOrders=new Set(orders.map(o=>o.id));
  const activeIds=orders.filter(o=>o.status==='processing').map(o=>o.id);
  const activeUnitIds=units.filter(u=>activeIds.includes(u.order_id)).map(u=>u.id);
  const secrets=[];for(let start=0;start<activeUnitIds.length;start+=100)secrets.push(...await all('arka_change_secrets','unit_id=in.('+activeUnitIds.slice(start,start+100).join(',')+')'));
  const emailMap=new Map(secrets.map(s=>[s.unit_id,unseal(s.original_cipher)?.email||'']));
  const notifications=await all('arka_change_notifications','user_id=eq.'+user.id+'&order=created_at.desc&limit=200');
  const result={
   offers:await all('arka_change_offers',admin?'':'active=eq.true','id,name,mode,price_cents,margin_cents,instructions,active,workers'),
   orders:orders.map(({request_cipher,...o})=>o),
   units:units.map(({source_fingerprint,result_fingerprint,...unit})=>({...unit,email:emailMap.get(unit.id)||''})),
   notifications:notifications.filter(n=>permittedOrders.has(n.order_id)),
   wallet:buyer?await all('arka_wallet','buyer_id=eq.'+user.id+'&order=created_at.desc'):[],
   credit_cents:buyer?(await one('arka_users',user.id)).credit_cents:0
  };
  if(!admin){result.offers=result.offers.map(({margin_cents,workers,...offer})=>offer);return result;}
  if(Date.now()-storageAt>60000){storageCache=await db('rpc/arka_storage_stats',{method:'POST',body:{}});storageAt=Date.now();}
  const [settings,finance,costs,sales,users,wallet,receipts]=await Promise.all([
   db('arka_finance_settings?id=eq.1'),all('arka_finance','','id,event_key,kind,amount_cents,reference_id,user_id,description,created_at'),
   all('arka_costs'),all('arka_sales'),all('arka_users','','id,name,role,balance_cents,reserved_cents,credit_cents'),all('arka_wallet'),all('arka_receipts')
  ]);
  const sum=(rows,key='amount_cents')=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
  result.finance={settings:settings[0],entries:finance,costs,sales,storage:storageCache,
   available:sum(finance.filter(f=>!['reserve','reserve_use'].includes(f.kind))),
   reserve:sum(finance.filter(f=>['reserve','reserve_use'].includes(f.kind))),
   commercial:sum(finance.filter(f=>f.kind==='margin')),
   own:sum(finance.filter(f=>f.kind==='own')),commissions:sum(finance.filter(f=>f.kind==='commission')),
   withdrawn:-sum(finance.filter(f=>f.kind==='withdrawal')),
   workers_due:sum(users.filter(u=>u.role==='worker'),'balance_cents'),
   buyer_credits:sum(users,'credit_cents'),
   verified_receipts:sum(receipts,'cash_cents'),
   pending_historical:sum(costs.filter(c=>c.fee_state==='pending'),'fee_cents'),
   unknown_costs:sales.filter(s=>s.cost_cents===null).length,
   pending_reserve:sales.filter(s=>s.monthly&&s.reserve_bps===null&&s.cost_cents!==null).length,
   funds_processing:sum(orders.filter(o=>o.status==='processing').map(o=>({amount_cents:Number(o.total_cents)-units.filter(u=>u.order_id===o.id&&u.refunded_at).length*Number(o.unit_cents)}))),
   users,wallet
  };
  result.history=await all('arka_change_history','','id,order_id,unit_id,actor_id,action,detail,created_at');
  return result;
 }
 return {state,maintenance:()=>db('rpc/arka_services_maintenance',{method:'POST',body:{}})};
}
