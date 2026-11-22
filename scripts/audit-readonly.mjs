const api=async(provider,path,body)=>{
  const token=process.env[provider==='render'?'RENDER_API_KEY':'SUPABASE_ACCESS_TOKEN'];
  const r=await fetch(`https://api.${provider==='render'?'render.com':'supabase.com'}/v1${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
  if(!r.ok)throw Error(`${provider}: HTTP ${r.status}`);
  return r.json();
};
const ps=await api('supabase','/projects'),matches=ps.filter(p=>/arka/i.test(p.name)),p=matches.length===1?matches[0]:ps.length===1?ps[0]:null;
if(!p)throw Error('Proyecto ambiguo; no se consulta ninguna base.');
const query=async sql=>api('supabase',`/projects/${p.id||p.ref}/database/query`,{query:sql,read_only:true});
console.log('AUDIT_SCHEMA',JSON.stringify(await query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name like 'arka_%' order by table_name,ordinal_position")));
console.log('AUDIT_FUNCTIONS',JSON.stringify(await query("select proname,md5(pg_get_functiondef(oid)) definition_hash from pg_proc where pronamespace='public'::regnamespace and proname like 'arka_%' order by proname")));
console.log('AUDIT_FINANCE',JSON.stringify(await query(`select json_build_object(
 'orders',(select json_agg(x) from(select status,count(*) n,sum(total_cents) cents from arka_orders group by status)x),
 'ledger',(select json_agg(x) from(select kind,count(*) n,sum(amount_cents) cents from arka_ledger group by kind)x),
 'production',(select json_agg(x) from(select p.mode,p.duration_months,count(*) n,sum(s.rate_cents) base_cents from arka_accounts a join arka_products p on p.id=a.product_id left join arka_assignments s on s.id=a.assignment_id where a.paid group by p.mode,p.duration_months)x),
 'balances',(select json_build_object('balance',coalesce(sum(balance_cents),0),'reserved',coalesce(sum(reserved_cents),0)) from arka_users where role='worker'),
 'database_bytes',pg_database_size(current_database())
 ) audit`)));
const services=await api('render','/services?limit=100');
for(const entry of services){const s=entry.service||entry;if(s.repo?.toLowerCase().includes('entreten/arkadigital'))console.log('AUDIT_RENDER',JSON.stringify({name:s.name,type:s.type,branch:s.branch,autoDeploy:s.autoDeploy,url:s.serviceDetails?.url,plan:s.serviceDetails?.plan,suspended:s.suspended}));}
console.log('READ_ONLY_AUDIT_OK: no se modificaron datos ni servicios.');
