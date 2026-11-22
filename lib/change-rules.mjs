import {randomInt} from 'node:crypto';
export const emailValid=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''))&&String(value).length<=320;
export function suggestEmail(pattern){
 if(!emailValid(pattern))throw Error('Indica un correo de ejemplo válido de un dominio que puedas utilizar.');
 const [local,domain]=pattern.toLowerCase().split('@');
 if(local.length>45)throw Error('La base del correo debe tener como máximo 45 caracteres.');
 let suffix;do{suffix=String(randomInt(0,1000000000000)).padStart(12,'0');}while(predictableSuffix(suffix));
 return local+suffix+'@'+domain;
}
const predictableSuffix=suffix=>/^(.)\1+$/.test(suffix)||'0123456789'.repeat(4).includes(suffix)||'9876543210'.repeat(4).includes(suffix)||[2,3,4].some(size=>suffix.length%size===0&&suffix===suffix.slice(0,size).repeat(suffix.length/size));
export function validateChange(mode,original,result,request){
 if(!emailValid(result.email)||!result.password||String(result.password).length>500)throw Error('Completa el correo final y la contraseña final.');
 if(mode==='password'&&result.email.toLowerCase()!==original.email.toLowerCase())throw Error('Esta oferta solo cambia contraseña; conserva el correo original.');
 if(mode==='email'&&result.password!==original.password)throw Error('Esta oferta solo cambia correo; conserva la contraseña original.');
 if(mode!=='password'){
  const [base,domain]=request.pattern.toLowerCase().split('@'),[local,targetDomain]=result.email.toLowerCase().split('@');
  const suffix=local.slice(base.length);
   if(targetDomain!==domain||!local.startsWith(base)||!/^\d{6,24}$/.test(suffix)||local.length>64)throw Error('Respeta la base y el dominio; añade únicamente números aleatorios, de 6 a 24 dígitos.');
   if(predictableSuffix(suffix))throw Error('No uses secuencias ni sufijos repetitivos. Utiliza la sugerencia aleatoria.');
 }
 const requested=request.requested_password??request.fixed_password;
 if(mode!=='email'&&requested&&result.password!==requested)throw Error('Usa exactamente la contraseña nueva solicitada por el cliente para este pedido.');
}
export function commission(baseCents,bps=300){
 if(!Number.isSafeInteger(baseCents)||baseCents<0)throw Error('Importe no válido');
 return Number((BigInt(baseCents)*BigInt(bps)+5000n)/10000n);
}
export function parseAccounts(text){
 const rows=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(!rows.length||rows.length>1000)throw Error('Carga entre 1 y 1000 cuentas, una por línea.');
 const seen=new Set();
 return rows.map((row,i)=>{
  const separator=row.includes('|')?'|':'\t',at=row.indexOf(separator);
  if(at<0)throw Error(`Línea ${i+1}: usa correo|contraseña, o dos columnas separadas por tabulación.`);
  const email=row.slice(0,at).trim().toLowerCase(),password=row.slice(at+1).trim();
  if(!emailValid(email)||!password||password.length>500)throw Error(`Línea ${i+1}: correo o contraseña no válido.`);
  if(seen.has(email))throw Error(`Línea ${i+1}: cuenta de origen duplicada.`);
  seen.add(email);return {email,password};
 });
}
