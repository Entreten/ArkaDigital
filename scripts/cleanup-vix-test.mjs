import {readFileSync} from 'node:fs';
const token=process.env.SUPABASE_ACCESS_TOKEN;
async function api(path,body){
 const r=await fetch('https://api.supabase.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
 if(!r.ok)throw Error('Limpieza VIX: Supabase HTTP '+r.status);return r.json();
}
const projects=await api('/projects'),matches=projects.filter(p=>/arka/i.test(p.name)),p=matches.length===1?matches[0]:projects.length===1?projects[0]:null;
if(!p)throw Error('Proyecto ambiguo; no se modifica nada');
const route='/projects/'+(p.id||p.ref)+'/database/query';
await api(route,{query:readFileSync('database/cleanup-vix-test.sql','utf8')});
const summary=await api(route,{query:"select data from arka_cleanup_archive where run_key='remove-jose-vix-test-20261122' and kind='completed'",read_only:true});
if(!summary[0]?.data?.stock_unchanged)throw Error('No se pudo verificar la limpieza');
console.log('VIX_TEST_REMOVED',JSON.stringify(summary));
