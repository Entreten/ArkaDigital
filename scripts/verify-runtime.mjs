import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
const url='https://arka-digital.onrender.com',wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ready=false;
for(let i=0;i<60;i++){
 try{const r=await fetch(url+'/healthz',{signal:AbortSignal.timeout(15000)}),h=await r.json();if(r.ok&&h.release==='services-20261122'&&(!process.env.GITHUB_SHA||h.commit===process.env.GITHUB_SHA)){ready=true;break;}}catch{}
 await wait(10000);
}
if(!ready)throw Error('Render aún no sirve la revisión esperada. No se afirma que esté publicada.');
async function mg(path,body){const r=await fetch('https://api.supabase.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Verificación Supabase HTTP '+r.status);return r.json();}
const projects=await mg('/projects'),matches=projects.filter(p=>/arka/i.test(p.name)),p=matches.length===1?matches[0]:projects.length===1?projects[0]:null;
if(!p)throw Error('Proyecto ambiguo');
const sql=query=>mg('/projects/'+(p.id||p.ref)+'/database/query',{query}),quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const tag=randomBytes(10).toString('hex'),password=randomBytes(25).toString('hex'),salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync(password,salt,64).toString('hex');
const users=['admin','worker','wholesale'].map(role=>({id:randomUUID(),role,email:'qa_release_'+role+'_'+tag+'@example.invalid'}));
try{
 await sql('insert into arka_users(id,email,name,password_hash,role) values '+users.map(u=>'('+[u.id,u.email,'Verificación temporal',hash,u.role].map(quote).join(',')+')').join(','));
 for(const user of users){
  const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({email:user.email,password})});
  if(!login.ok)throw Error('No se pudo validar el inicio de sesión del perfil '+user.role);
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  if(!cookie)throw Error('No se recibió sesión de verificación');
  const r=await fetch(url+'/api/state',{headers:{Cookie:cookie}}),state=await r.json();
  if(!r.ok||state.user?.role!==user.role||!state.services||!Array.isArray(state.services.orders))throw Error('Estado inválido para '+user.role);
  if(user.role==='admin'&&!state.services.finance?.storage)throw Error('El panel financiero no pudo consultar la base real');
  if(user.role!=='admin'&&state.services.finance)throw Error('Se expuso información financiera de administrador');
  if(user.role!=='admin'&&state.services.orders.length)throw Error('Una cuenta nueva recibió pedidos ajenos');
 }
 const guest=await fetch(url+'/api/services/state');if(guest.status!==401)throw Error('La API de servicios no está protegida');
 for(const file of ['/services.js?v=20261122-1','/services.css?v=20261122-1'])if(!(await fetch(url+file)).ok)throw Error('No se publicó un recurso necesario');
 console.log('RENDER_RUNTIME_OK: revisión publicada; salud de base de datos, sesiones de tres roles, finanzas y recursos nuevos verificados.');
}finally{
 await sql('delete from arka_users where id in('+users.map(u=>quote(u.id)).join(',')+') and email like '+quote('qa_release_%_'+tag+'@example.invalid'));
 console.log('Las cuentas temporales de verificación fueron retiradas. No se crearon ventas, saldos ni movimientos de prueba.');
}
