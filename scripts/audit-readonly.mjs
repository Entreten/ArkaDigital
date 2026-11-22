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
console.log('AUDIT_VIX_SERVICES',JSON.stringify(await query(`
select o.id,o.number,o.offer_name,o.status,o.quantity,o.total_cents,o.credit_cents,
 translate(lower(u.name),'áéíóúüñ','aeiouun') like '%jose%fernandez%' jose_match,
 (select json_agg(t) from(select cu.status,count(*) quantity,count(*) filter(where lower(w.name) like '%viviana%') viviana_units from arka_change_units cu left join arka_users w on w.id=cu.worker_id where cu.order_id=o.id group by cu.status)t) units,
 (select coalesce(sum(l.amount_cents),0) from arka_ledger l join arka_change_units cu on cu.id=l.reference_id where cu.order_id=o.id) worker_pay_cents,
 (select coalesce(sum(f.amount_cents),0) from arka_finance f where f.reference_id=o.id) finance_cents,
 (select coalesce(sum(amount_cents),0) from arka_wallet where reference_id=o.id) wallet_cents
from arka_change_orders o join arka_users u on u.id=o.buyer_id where lower(o.offer_name) like '%vix%' order by o.created_at
`)));
console.log('AUDIT_PURCHASES',JSON.stringify(await query(`
 select o.id,
 case when translate(lower(u.name),'áéíóúüñ','aeiouun') like '%jose%fernandez%' then 'official_jose_fernandez'
 when lower(u.name) like '%juan%' then 'test_juan' else 'other_buyer' end buyer_class,
 o.status,o.total_cents,o.credit_cents,o.delivered_at,
 (select coalesce(sum(i.quantity),0) from arka_items i where i.order_id=o.id) quantity,
 (select count(*) from arka_reports r join arka_accounts a on a.id=r.account_id where a.order_id=o.id and r.status in('open','escalated')) open_reports,
 (select coalesce(sum(c.base_cents),0) from arka_costs c join arka_accounts a on a.id=c.account_id where a.order_id=o.id) production_base,
 (select coalesce(sum(c.fee_cents),0) from arka_costs c join arka_accounts a on a.id=c.account_id where a.order_id=o.id) production_fee
 from arka_orders o join arka_users u on u.id=o.buyer_id order by o.created_at
`)));
