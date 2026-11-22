
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {randomBytes,scryptSync,timingSafeEqual,createHmac,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installServices} from './services.mjs';
const app=express(), root=path.dirname(fileURLToPath(import.meta.url));
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET','ENCRYPTION_KEY'];
if(required.some(k=>!process.env[k]))throw Error('Falta configuración privada del servidor');
const base=process.env.SUPABASE_URL.replace(/\/$/,''), key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const encKey=Buffer.from(process.env.ENCRYPTION_KEY,'hex');if(encKey.length!==32)throw Error('Configuración de cifrado no válida');
app.set('trust proxy',1);app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'https:','data:'],fontSrc:["'self'"],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"]}},referrerPolicy:{policy:'no-referrer'}}));
app.use(express.json({limit:'3mb'}));app.use('/api',rateLimit({windowMs:60000,limit:240,standardHeaders:'draft-8',legacyHeaders:false}));
const loginLimiter=rateLimit({windowMs:15*60000,limit:15,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Demasiados intentos. Espera 15 minutos.'}});
const safeUser=u=>({id:u.id,email:u.email,name:u.name,phone:u.phone,role:u.role,active:u.active,deleted_at:u.deleted_at||null,balance_cents:Number(u.balance_cents),reserved_cents:Number(u.reserved_cents),created_at:u.created_at});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(v,max=5000)=>String(v??'').trim().slice(0,max);
const number=(v,min=0,max=100000000)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw fail('Importe o cantidad no válidos');return n;};
async function db(route,{method='GET',body,headers={}}={}){const response=await fetch(base+'/rest/v1/'+route,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const data=await response.json().catch(()=>null);if(!response.ok){if(data?.code==='23505')throw fail('Ya existe una cuenta, correo o registro igual. No se guardó la operación duplicada.');if(data?.code==='23514')throw fail('Los datos no cumplen las condiciones del producto o saldo.');if(data?.code==='P0001')throw fail(data.message);throw fail('No se pudo guardar o consultar. Revisa los datos e inténtalo nuevamente.',response.status>=500?503:400);}return data;}
async function all(table,filter='',select='*'){let rows=[];for(let offset=0;offset<20000;offset+=1000){const chunk=await db(table+'?select='+encodeURIComponent(select)+(filter?'&'+filter:'')+'&limit=1000&offset='+offset);rows.push(...chunk);if(chunk.length<1000)break;}return rows;}
function seal(obj){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encKey,iv),data=Buffer.concat([cipher.update(JSON.stringify(obj),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
function unseal(text){if(!text)return null;try{const data=Buffer.from(text,'base64'),dec=createDecipheriv('aes-256-gcm',encKey,data.subarray(0,12));dec.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([dec.update(data.subarray(28)),dec.final()]).toString());}catch{throw fail('No se pudieron descifrar los datos. Contacta al administrador.',500);}}
async function visibleAccountData(account){
 if(!account.cipher)return null;
 if(account.status==='sold'){
  const[p]=await db('arka_products?id=eq.'+account.product_id+'&select=mode&limit=1');
  const deadline=p?.mode==='domain'?new Date(account.delivered_at).getTime()+7*86400000:new Date(account.expires_at).getTime();
  if(deadline<=Date.now()&&!(await db('arka_reports?account_id=eq.'+account.id+'&status=in.(open,escalated)&select=id&limit=1')).length)return null;
 }
 return unseal(account.cipher);
}
function accountInput(data){const email=clean(data.email,320).toLowerCase(),password=clean(data.password,500),observation=clean(data.observation,3000);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password)throw fail('Cada cuenta necesita un correo válido y una contraseña');return {cipher:seal({email,password,observation}),fingerprint:createHmac('sha256',encKey).update(email).digest('hex')};}
function hashPassword(password){if(typeof password!=='string'||password.length<8||password.length>200)throw fail('La contraseña debe tener entre 8 y 200 caracteres');const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
function verifyPassword(password,hash){try{const[s,h]=hash.split(':'),actual=scryptSync(password,s,64),expected=Buffer.from(h,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}}
const sign=body=>createHmac('sha256',process.env.SESSION_SECRET).update(body).digest('base64url');
function session(u){const body=Buffer.from(JSON.stringify({id:u.id,v:u.auth_version,exp:Date.now()+12*3600000})).toString('base64url');return body+'.'+sign(body);}
app.use('/api',async(req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(req.method)){const origin=req.get('origin');if(origin&&origin!==req.protocol+'://'+req.get('host'))return res.status(403).json({error:'Origen no permitido'});}const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('arka_session='))?.slice(13);if(raw){try{const[body,sig]=raw.split('.');if(sig&&sig.length===sign(body).length&&timingSafeEqual(Buffer.from(sig),Buffer.from(sign(body)))){const token=JSON.parse(Buffer.from(body,'base64url'));if(token.exp>Date.now()){const rows=await db('arka_users?id=eq.'+encodeURIComponent(token.id)+'&limit=1');const u=rows[0];if(u?.active&&!u.deleted_at&&u.auth_version===token.v)req.user=u;}}}catch{}}next();});
app.get('/healthz',async(req,res)=>{try{await db('arka_settings?select=id&limit=1');res.json({status:'ok',service:'ARKA DIGITAL',release:'purchases-notifications-20261122',commit:process.env.RENDER_GIT_COMMIT||null});}catch{res.status(503).json({status:'unavailable'});}});
app.get('/api/public',async(req,res)=>{const [s]=await db('arka_settings?id=eq.1');res.json({theme:s.theme,support:s.support});});
app.post('/api/login',loginLimiter,async(req,res)=>{const email=clean(req.body.email,320).toLowerCase(),password=String(req.body.password||'').slice(0,200);const[u]=await db('arka_users?email=eq.'+encodeURIComponent(email)+'&limit=1');if(!u?.active||u.deleted_at||!verifyPassword(password,u.password_hash))throw fail('Correo o contraseña incorrectos',401);res.cookie('arka_session',session(u),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:12*3600000,path:'/'});res.json({user:safeUser(u)});});
app.post('/api/logout',(req,res)=>{res.clearCookie('arka_session',{path:'/'});res.json({ok:true});});
app.use('/api',(req,res,next)=>req.user?next():res.status(401).json({error:'Inicia sesión para continuar'}));

// Authenticated invalidation stream. No orders, credentials or user data are broadcast.
const liveClients=new Set();let liveRevision=0;
function notifyLiveClients(){liveRevision++;const message='event: state-change\ndata: '+JSON.stringify({revision:liveRevision})+'\n\n';for(const response of liveClients){if(response.destroyed||response.writableEnded){liveClients.delete(response);continue;}try{response.write(message);}catch{liveClients.delete(response);response.end();}}}
app.get('/api/events',(req,res)=>{res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('retry: 3000\nevent: ready\ndata: '+JSON.stringify({revision:liveRevision})+'\n\n');liveClients.add(res);const heartbeat=setInterval(()=>{if(!res.destroyed&&!res.writableEnded)res.write(': heartbeat\n\n');},25000);const cleanup=()=>{clearInterval(heartbeat);liveClients.delete(res);};res.once('close',cleanup);res.once('error',cleanup);});
app.use('/api',(req,res,next)=>{if(req.method==='POST'&&(req.path==='/command'||req.path.startsWith('/admin/')))res.once('finish',()=>{if(res.statusCode>=200&&res.statusCode<300)notifyLiveClients();});next();});
app.get('/api/me',(req,res)=>res.json({user:safeUser(req.user)}));
app.get('/api/state',async(req,res)=>{const u=req.user,admin=u.role==='admin',worker=u.role==='worker',own='eq.'+u.id;
 const [settings,products,banks,users,assignments,accounts,orders,reports,withdrawals,ledger]=await Promise.all([
 db('arka_settings?id=eq.1'),all('arka_products',admin?'':'active=eq.true'),all('arka_banks',admin?'':'active=eq.true'),admin?all('arka_users','','id,email,name,phone,role,active,deleted_at,balance_cents,reserved_cents,created_at'):Promise.resolve([]),u.role==='wholesale'?Promise.resolve([]):all('arka_assignments',admin?'':'worker_id='+own),all('arka_accounts',admin?'':worker?'worker_id='+own:'buyer_id='+own,'id,product_id,worker_id,assignment_id,status,reason,paid,order_id,buyer_id,created_at,approved_at,delivered_at,expires_at,confirmed_at,purged_at'+(admin||worker?',cipher':'')),worker?Promise.resolve([]):all('arka_orders',admin?'':'buyer_id='+own),all('arka_reports',admin?'':worker?'worker_id='+own:'buyer_id='+own),u.role==='wholesale'?Promise.resolve([]):all('arka_withdrawals',admin?'':'worker_id='+own),u.role==='wholesale'?Promise.resolve([]):all('arka_ledger',admin?'':'worker_id='+own)]);
 const stocks=await db('rpc/arka_stock',{method:'POST',body:{}});const orderIds=orders.map(o=>o.id);const items=orderIds.length?await all('arka_items','order_id=in.('+orderIds.join(',')+')'):[];
 res.json({user:safeUser(u),settings:settings[0],products,banks:worker?[]:banks,users,assignments,accounts:accounts.map(({cipher,...account})=>({...account,...(admin||worker?{email:cipher?unseal(cipher)?.email||'':''}:{})})),orders,items,reports,withdrawals,ledger,stocks,services:await services.state(u)});});

app.get('/api/orders/:id/accounts',async(req,res)=>{
 if(!['admin','wholesale'].includes(req.user.role))throw fail('Acceso denegado',403);
 const[order]=await db('arka_orders?id=eq.'+encodeURIComponent(req.params.id)+'&select=id,buyer_id,status&limit=1');
 if(!order)throw fail('Pedido no encontrado',404);
 if(req.user.role!=='admin'&&order.buyer_id!==req.user.id)throw fail('Acceso denegado',403);
 if(order.status!=='delivered')throw fail('Las cuentas estarán disponibles cuando se apruebe y entregue el pedido');
 const productId=clean(req.query.product_id,100);if(!productId)throw fail('Selecciona el producto de esta compra');
 const [rows,products,reports]=await Promise.all([
  all('arka_accounts','order_id=eq.'+encodeURIComponent(order.id)+'&product_id=eq.'+encodeURIComponent(productId)+'&status=in.(sold,purged)','id,product_id,worker_id,assignment_id,status,reason,paid,order_id,buyer_id,created_at,approved_at,delivered_at,expires_at,confirmed_at,purged_at,cipher'),
  db('arka_products?id=eq.'+encodeURIComponent(productId)+'&select=mode&limit=1'),
  all('arka_reports','buyer_id=eq.'+order.buyer_id+'&status=in.(open,escalated)','account_id')
 ]);
 const protectedIds=new Set(reports.map(r=>r.account_id)),now=Date.now();
 res.json({accounts:rows.map(({cipher,...account})=>{
  const deadline=products[0]?.mode==='domain'?new Date(account.delivered_at).getTime()+7*86400000:new Date(account.expires_at).getTime();
  const data=cipher&&(deadline>now||protectedIds.has(account.id))?unseal(cipher):null;
  return {...account,email:data?.email||'',data};
 })});
});
app.get('/api/accounts/:id',async(req,res)=>{const[a]=await db('arka_accounts?id=eq.'+encodeURIComponent(req.params.id)+'&limit=1');if(!a)throw fail('Cuenta no encontrada',404);const u=req.user;if(u.role!=='admin'&&a.worker_id!==u.id&&a.buyer_id!==u.id)throw fail('Acceso denegado',403);res.json({id:a.id,data:await visibleAccountData(a),status:a.status});});
app.get('/api/accounts/:id/history',async(req,res)=>{if(req.user.role!=='admin')throw fail('Acceso denegado',403);const rows=await all('arka_events','account_id=eq.'+encodeURIComponent(req.params.id)+'&order=created_at.desc');res.json(rows.map(e=>({...e,previous_cipher:undefined,previous:unseal(e.previous_cipher)})));});
app.post('/api/command',async(req,res)=>{const action=clean(req.body.action,50),payload={...req.body.payload};const allowed=['accept_assignment','submit_accounts','resubmit','review_account','checkout','payment','approve_order','reject_order','cancel_order','confirm_account','report','resolve_report','withdraw','process_withdrawal','credit'];if(!allowed.includes(action))throw fail('Operación desconocida');
 if(action==='submit_accounts'){if(!Array.isArray(payload.accounts)||payload.accounts.length<1||payload.accounts.length>1000)throw fail('Carga entre 1 y 1000 cuentas por envío');payload.accounts=payload.accounts.map(accountInput);}
 if(action==='payment'){if(typeof payload.transaction_code!=='string'||!payload.transaction_code.trim()||payload.transaction_code.trim().length>150)throw fail('Indica el ID o código de transacción del comprobante (máximo 150 caracteres).');payload.transaction_code=payload.transaction_code.trim();}
 if(action==='resubmit')Object.assign(payload,accountInput(payload));
 if(action==='resolve_report'&&!['escalate','reject'].includes(payload.type)){const[r]=await db('arka_reports?id=eq.'+encodeURIComponent(payload.id)+'&limit=1');if(!r)throw fail('Reporte no encontrado');const[a]=await db('arka_accounts?id=eq.'+r.account_id+'&limit=1');if(req.user.role!=='admin'&&!(req.user.role==='worker'&&r.worker_id===req.user.id&&r.status==='open'))throw fail('Acceso denegado',403);const prev=unseal(a.cipher)||{};let data={...prev};if(payload.type==='replacement')data={email:payload.email,password:payload.password,observation:payload.observation};else if(payload.type==='email')data.email=payload.email;else if(payload.type==='password')data.password=payload.password;else data={...prev,...Object.fromEntries(['email','password','observation'].filter(k=>payload[k]!==undefined).map(k=>[k,payload[k]]))};Object.assign(payload,accountInput(data));}
 res.json(await db('rpc/arka_command',{method:'POST',body:{actor:req.user.id,action,payload}}));});
app.post('/api/admin/:kind',async(req,res)=>{if(req.user.role!=='admin')throw fail('Acceso denegado',403);const b=req.body,id=b.id;let table,data;
 if(req.params.kind==='cleanup'){if(!['order','report'].includes(b.kind))throw fail('Sección no válida');if(b.confirmation!=='ELIMINAR')throw fail('Escribe ELIMINAR para confirmar');return res.json(await db('rpc/arka_delete_closed',{method:'POST',body:{actor:req.user.id,target:b.id,kind:b.kind}}));}
 else if(req.params.kind==='user-access'){if(!['suspend','activate','delete'].includes(b.decision))throw fail('Operación no válida');if(b.decision==='delete'&&b.confirmation!=='ELIMINAR')throw fail('Escribe ELIMINAR para confirmar');return res.json(await db('rpc/arka_manage_user',{method:'POST',body:{actor:req.user.id,target:b.id,decision:b.decision}}));}
 else if(req.params.kind==='users'){table='arka_users';const email=clean(b.email,320).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||clean(b.name).length<2)throw fail('Nombre y correo válidos obligatorios');if(!['worker','wholesale','admin'].includes(b.role))throw fail('Rol no válido');if(b.role!=='admin'&&!/^\+[1-9][0-9 ()-]{5,24}$/.test(clean(b.phone)))throw fail('El teléfono debe incluir + y el código de país');if(id===req.user.id&&(b.active===false||b.role!=='admin'))throw fail('No puedes desactivar ni quitar el rol de tu propia cuenta');data={email,name:clean(b.name,150),phone:clean(b.phone,35),role:b.role,active:b.active!==false};if(b.password)data.password_hash=hashPassword(b.password);if(!id&&!b.password)throw fail('Define una contraseña');if(id){const[old]=await db('arka_users?id=eq.'+encodeURIComponent(id)+'&select=auth_version,active,deleted_at');if(!old||old.deleted_at)throw fail('Este usuario fue eliminado o no existe');if(b.password||old.active!==data.active)data.auth_version=old.auth_version+1;}}
 else if(req.params.kind==='products'){table='arka_products';const mode=b.mode==='domain'?'domain':'duration';data={name:clean(b.name,150),category:clean(b.category,80)||'Streaming',brand:clean(b.brand,40)||'ARKA',description:clean(b.description),conditions:clean(b.conditions),price_cents:number(b.price_cents),duration_months:number(b.duration_months||0,0,120),duration_days:number(b.duration_days||0,0,3660),mode,color:/^#[0-9a-f]{6}$/i.test(b.color)?b.color:'#7756ff',image_url:clean(b.image_url,1000),active:b.active!==false};if(data.name.length<2)throw fail('Indica el nombre del producto');if(mode==='duration'&&data.duration_months+data.duration_days===0)throw fail('Indica la duración');if(data.image_url&&!/^https:\/\//.test(data.image_url))throw fail('La imagen debe usar HTTPS');}
 else if(req.params.kind==='banks'){table='arka_banks';data={bank:clean(b.bank,100),holder:clean(b.holder,150),account_number:clean(b.account_number,100),kind:clean(b.kind,50)||'Ahorros',instructions:clean(b.instructions,2000),active:b.active!==false};if(!data.bank||!data.holder||!data.account_number)throw fail('Completa los datos bancarios');}
 else if(req.params.kind==='assignments'){table='arka_assignments';if(id)throw fail('La tarifa acordada no se modifica: crea una nueva asignación');const[worker]=await db('arka_users?id=eq.'+encodeURIComponent(b.worker_id)+'&role=in.(worker,admin)&active=eq.true&deleted_at=is.null');if(!worker)throw fail('Selecciona un trabajador activo o tu cuenta de administrador');const[product]=await db('arka_products?id=eq.'+encodeURIComponent(b.product_id)+'&limit=1');if(!product)throw fail('Producto no encontrado');data={worker_id:b.worker_id,product_id:b.product_id,quantity:number(b.quantity,1,100000),rate_cents:number(b.rate_cents),terms_version:1,commission_bps:product.mode==='duration'&&product.duration_months>0&&worker.role!=='admin'?300:0,accepted_at:worker.role==='admin'?new Date().toISOString():null,active:true};}
 else if(req.params.kind==='settings'){table='arka_settings';if(!['original','christmas','love','newyear','easter','halloween','epiphany'].includes(b.theme))throw fail('Tema no válido');data={theme:b.theme,announcement:clean(b.announcement,180),announcement_enabled:b.announcement_enabled!==false,announcement_interval:number(b.announcement_interval,20,3600),support:clean(b.support,300),updated_at:new Date().toISOString()};const rows=await db(table+'?id=eq.1',{method:'PATCH',body:data});return res.json(rows);}
 else throw fail('Sección no encontrada',404);
 const rows=await db(table+(id?'?id=eq.'+encodeURIComponent(id):''),{method:id?'PATCH':'POST',body:data});res.json(table==='arka_users'?rows.map(safeUser):rows);});
app.post('/api/password',async(req,res)=>{if(!verifyPassword(String(req.body.current||''),req.user.password_hash))throw fail('La contraseña actual no coincide');await db('arka_users?id=eq.'+req.user.id,{method:'PATCH',body:{password_hash:hashPassword(req.body.password),auth_version:req.user.auth_version+1}});res.clearCookie('arka_session',{path:'/'});res.json({ok:true});});
app.use('/api/services',(req,res,next)=>{if(req.method==='POST')res.once('finish',()=>{if(res.statusCode>=200&&res.statusCode<300)notifyLiveClients();});next();});
const services=installServices(app,{db,all,seal,unseal,accountInput,fail,clean,number});
app.get('/api/notifications',async(req,res)=>res.json({notifications:await db('arka_change_notifications?user_id=eq.'+req.user.id+'&order=created_at.desc&limit=100')}));
app.post('/api/notifications/read',async(req,res)=>{
 const filter=req.body.all===true?'':'&id=eq.'+encodeURIComponent(clean(req.body.id,80));
 await db('arka_change_notifications?user_id=eq.'+req.user.id+'&read_at=is.null'+filter,{method:'PATCH',body:{read_at:new Date().toISOString()}});
 res.json({ok:true});
});
app.post('/api/sales/delete-test',async(req,res)=>{
 if(req.user.role!=='admin')throw fail('Solo administrador',403);
 const result=await db('rpc/arka_delete_test_sale',{method:'POST',body:{actor:req.user.id,target:req.body.id,confirmation:req.body.confirmation}});
 res.json(result);notifyLiveClients();
});
app.use(express.static(path.join(root,'public'),{maxAge:process.env.NODE_ENV==='production'?'1h':0,etag:true,setHeaders:(res,file)=>{if(file.endsWith('index.html'))res.setHeader('Cache-Control','no-store');}}));app.get('/',(req,res)=>res.sendFile(path.join(root,'public/index.html')));
app.use((error,req,res,next)=>{if(error.type==='entity.parse.failed')return res.status(400).json({error:'Formato no válido'});res.status(error.status||500).json({error:error.status?error.message:'Ocurrió un error. Inténtalo nuevamente.'});});
const maintenance=()=>Promise.all([db('rpc/arka_maintenance',{method:'POST',body:{}}),services.maintenance()]).catch(()=>console.error('Mantenimiento pendiente; se reintentará.'));
if(process.env.NODE_ENV!=='test'){maintenance();setInterval(maintenance,3600000).unref();app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('ARKA DIGITAL iniciada'));}
export {app,accountInput,hashPassword,verifyPassword};
