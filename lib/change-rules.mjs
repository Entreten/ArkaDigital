export const emailValid=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''))&&String(value).length<=320;
export function validateChange(mode,original,result,request){
 if(mode!=='password')throw Error('Este servicio solo permite cambiar contraseñas.');
 if(!emailValid(result.email)||!result.password||String(result.password).length>500)throw Error('Completa el correo final y la contraseña final.');
 if(mode==='password'&&result.email.toLowerCase()!==original.email.toLowerCase())throw Error('Esta oferta solo cambia contraseña; conserva el correo original.');
 const requested=request.requested_password??request.fixed_password;
 if(!requested||result.password!==requested)throw Error('Usa exactamente la contraseña nueva solicitada por el cliente para esta cuenta.');
}
export function parsePasswordChanges(text){
 const rows=String(text||'').split(/\r?\n/).filter(line=>line.trim()),seen=new Set();
 if(!rows.length||rows.length>1000)throw Error('Carga entre 1 y 1000 cuentas.');
 return rows.map((row,i)=>{
  const fields=row.split(row.includes('\t')?'\t':'|');
  if(fields.length!==3)throw Error(`Línea ${i+1}: usa correo|contraseña_actual|contraseña_nueva.`);
  const [raw,password,new_password]=fields,email=raw.trim().toLowerCase();
  if(!emailValid(email)||!password||!new_password||password.length>500||new_password.length>500)throw Error(`Línea ${i+1}: completa el correo y ambas contraseñas.`);
  if(seen.has(email))throw Error(`Línea ${i+1}: cuenta duplicada.`);seen.add(email);
  return {email,password,new_password};
 });
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
