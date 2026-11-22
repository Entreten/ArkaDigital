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
const result=await api('/projects/'+(project.id||project.ref)+'/database/query',{query:readFileSync('database/cleanup-test-purchases.sql','utf8')});
console.log('TEST_PURCHASE_CLEANUP_OK',JSON.stringify(result));
