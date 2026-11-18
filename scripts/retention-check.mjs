const token=process.env.SUPABASE_ACCESS_TOKEN;async function req(path,body){const r=await fetch('https://api.supabase.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Supabase QA HTTP '+r.status);return r.json();}const projects=await req('/projects'),matches=projects.filter(p=>/arka/i.test(p.name)),p=matches.length===1?matches[0]:projects.length===1?projects[0]:null;if(!p)throw Error('Proyecto ambiguo');await req('/projects/'+(p.id||p.ref)+'/database/query',{query:
`begin;do $$ declare buyer uuid:=gen_random_uuid();retired uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();prod uuid:=gen_random_uuid();domainprod uuid:=gen_random_uuid();orders uuid[]:='{}';accounts uuid[]:='{}';oid uuid;aid uuid;extra uuid;case_no int;begin
 insert into arka_users(id,email,name,password_hash,role) values(buyer,'qa_retention_'||buyer||'@example.invalid','QA rollback','no-login','wholesale');
 insert into arka_users(id,email,name,password_hash,role) values(retired,'qa_retired_'||retired||'@example.invalid','QA retirado','no-login','worker'),(admin_id,'qa_admin_'||admin_id||'@example.invalid','QA admin','no-login','admin');
 insert into arka_products(id,name,price_cents,mode,duration_months) values(prod,'QA retención '||prod,100,'duration',1),(domainprod,'QA dominio '||domainprod,100,'domain',0);
 for case_no in 1..7 loop oid:=gen_random_uuid();aid:=gen_random_uuid();orders:=array_append(orders,oid);accounts:=array_append(accounts,aid);
 insert into arka_orders(id,buyer_id,status,total_cents,delivered_at) values(oid,buyer,'delivered',100,now()-interval '10 days');
 insert into arka_items(order_id,product_id,quantity,unit_cents,product_name) values(oid,case when case_no in(3,4,7) then domainprod else prod end,1,100,'QA');
 insert into arka_accounts(id,product_id,cipher,email_fingerprint,status,order_id,buyer_id,delivered_at,expires_at) values(aid,case when case_no in(3,4,7) then domainprod else prod end,'QA-transaction-only',aid::text,'sold',oid,buyer,case when case_no=4 then now()-interval '4 days' else now()-interval '8 days' end,case when case_no=2 then now()+interval '1 month' else now()-interval '1 hour' end);
 if case_no in(5,7) then insert into arka_reports(account_id,buyer_id,problem,status) values(aid,buyer,'Reporte pendiente QA','escalated');end if;
 if case_no=6 then extra:=gen_random_uuid();insert into arka_accounts(id,product_id,cipher,email_fingerprint,status,order_id,buyer_id,delivered_at,expires_at) values(extra,prod,'QA-active',extra::text,'sold',oid,buyer,now(),now()+interval '1 month');end if;
 end loop;
 update arka_accounts set worker_id=retired where id=accounts[2];
 insert into arka_reports(account_id,buyer_id,worker_id,problem,status) values(accounts[2],buyer,retired,'Garantía de trabajador que se retira','open');
 perform arka_manage_user(admin_id,retired,'delete');
 if not exists(select 1 from arka_users where id=retired and deleted_at is not null and not active) or not exists(select 1 from arka_reports where worker_id=retired and status='escalated') then raise exception 'La retirada dejó una garantía sin responsable';end if;
 perform arka_maintenance();
 foreach case_no in array array[1,3] loop if exists(select 1 from arka_orders where id=orders[case_no]) or exists(select 1 from arka_accounts where id=accounts[case_no] and (cipher is not null or status<>'purged' or buyer_id is not null)) then raise exception 'No limpió pedido vencido %',case_no;end if;end loop;
 foreach case_no in array array[2,4,5,6,7] loop if not exists(select 1 from arka_orders where id=orders[case_no]) then raise exception 'Eliminó pedido protegido %',case_no;end if;end loop;
 foreach case_no in array array[2,4,5,7] loop if not exists(select 1 from arka_accounts where id=accounts[case_no] and cipher is not null and status='sold') then raise exception 'Alteró datos protegidos %',case_no;end if;end loop;
 if not exists(select 1 from arka_accounts where id=extra and cipher is not null and status='sold') then raise exception 'Perdió producto vigente de pedido mixto';end if;
 if (select count(*) from arka_reports where account_id in(accounts[5],accounts[7]) and status='escalated')<>2 then raise exception 'Perdió reportes pendientes';end if;
 end $$;rollback;`});console.log('RETENTION_OK: meses al vencer; dominio a los 7 días, no a los 3; compras vigentes, pedidos mixtos y reportes pendientes protegidos. Prueba revertida sin cambios en datos reales.');
