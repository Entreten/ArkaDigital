// One-time, explicitly authorized cleanup. Exact IDs; no broad name-based deletions.
import {readFileSync} from 'node:fs';
const token=process.env.SUPABASE_ACCESS_TOKEN;
async function api(path,body){
 const r=await fetch('https://api.supabase.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
 if(!r.ok)throw Error('Limpieza detenida: Supabase HTTP '+r.status);
 return r.json();
}
const projects=await api('/projects'),matches=projects.filter(p=>/arka/i.test(p.name)),project=matches.length===1?matches[0]:projects.length===1?projects[0]:null;
if(!project)throw Error('Proyecto ambiguo; no se modificó nada');
const route='/projects/'+(project.id||project.ref)+'/database/query';
await api(route,{query:readFileSync('database/cleanup-test-purchases.sql','utf8')});
const result=await api(route,{query:`select
 (select data from arka_cleanup_archive where run_key='remove-confirmed-juan-tests-20261122' and kind='completed') summary,
 (select count(*) from arka_accounts where order_id='a06e0976-ff01-4edb-9b79-ede6f6915a69') official_accounts,
 (select count(*) from arka_orders where id in('53bc1699-8bc3-461c-ab37-18350c65f20a','0e8e9a1b-b68b-4c9a-8776-7c1347993d8c','bff72612-5ff8-47d2-9d64-b4d68d7ae8de')) remaining_target_tests,
 (select coalesce(sum(amount_cents),0) from arka_finance where kind='margin') commercial_cents,
 (select coalesce(sum(amount_cents),0) from arka_finance where kind='commission') commission_cents`});
if(Number(result[0]?.official_accounts)!==6||Number(result[0]?.remaining_target_tests)!==0)throw Error('No se pudo confirmar el resultado de la limpieza');
console.log('TEST_PURCHASE_CLEANUP_OK',JSON.stringify(result));
