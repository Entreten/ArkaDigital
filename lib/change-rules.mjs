import {randomBytes} from 'node:crypto';
export const emailValid=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''))&&String(value).length<=320;
export function suggestEmail(pattern){
 if(!emailValid(pattern))throw Error('Indica un correo de ejemplo válido de un dominio que puedas utilizar.');
 const [local,domain]=pattern.toLowerCase().split('@');
 if(local.length>45)throw Error('La base del correo debe tener como máximo 45 caracteres.');
 return local+randomBytes(7).toString('hex')+'@'+domain;
}
export function validateChange(mode,original,result,request){
 if(!emailValid(result.email)||!result.password||String(result.password).length>500)throw Error('Completa el correo final y la contraseña final.');
 if(mode==='password'&&result.email.toLowerCase()!==original.email.toLowerCase())throw Error('Esta oferta solo cambia contraseña; conserva el correo original.');
 if(mode==='email'&&result.password!==original.password)throw Error('Esta oferta solo cambia correo; conserva la contraseña original.');
 if(mode!=='password'){
  const [base,domain]=request.pattern.toLowerCase().split('@'),[local,targetDomain]=result.email.toLowerCase().split('@');
  const suffix=local.slice(base.length);
  if(targetDomain!==domain||!local.startsWith(base)||!/^[a-z0-9]{6,24}$/i.test(suffix))throw Error('Respeta la base y el dominio con un sufijo aleatorio de 6 a 24 caracteres.');
  if(/^(.)\1+$/.test(suffix)||/^(?:0123456789|1234567890|9876543210|0987654321)$/.test(suffix)||'01234567890123456789'.includes(suffix)||'98765432109876543210'.includes(suffix))throw Error('No uses secuencias ni sufijos repetitivos. Utiliza la sugerencia aleatoria.');
 }
 if(mode!=='email'&&request.fixed_password&&result.password!==request.fixed_password)throw Error('Usa exactamente la contraseña indicada para este pedido.');
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
