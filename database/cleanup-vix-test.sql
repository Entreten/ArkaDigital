begin;
do $$
declare
 target constant uuid:='30f669e6-f3be-4550-9bf2-8191abab4e37';
 run constant text:='remove-jose-vix-test-20261122';
 o arka_change_orders;units uuid[];before_stock text;after_stock text;before_money text;after_money text;
begin
 perform pg_advisory_xact_lock(782742121);
 if exists(select 1 from arka_cleanup_archive where run_key=run and kind='completed') then return;end if;
 select * into o from arka_change_orders where id=target for update;
 if not found or o.quantity<>3 or o.total_cents<>45 or o.status<>'processing' or lower(o.offer_name) not like '%vix%'
 or not exists(select 1 from arka_users where id=o.buyer_id and translate(lower(name),'áéíóúüñ','aeiouun') like '%jose%fernandez%')
 then raise exception 'El pedido no coincide con la prueba VIX confirmada; no se modifica nada';end if;
 perform 1 from arka_change_units where order_id=target for update;
 select array_agg(cu.id) into units from arka_change_units cu join arka_users u on u.id=cu.worker_id where cu.order_id=target and lower(u.name) like '%viviana%';
 if coalesce(array_length(units,1),0)<>3 then raise exception 'No coincide la asignación de tres cuentas a Viviana';end if;
 if exists(select 1 from arka_ledger where reference_id=any(units))
 or exists(select 1 from arka_finance where reference_id=target)
 or exists(select 1 from arka_wallet where reference_id=target and amount_cents<>0)
 or o.credit_cents<>0 then raise exception 'Aparecieron pagos o saldos que requieren conciliación; limpieza cancelada';end if;
 select md5(coalesce((select jsonb_agg(to_jsonb(a) order by id)::text from arka_accounts a),'[]')||
 coalesce((select jsonb_agg(to_jsonb(s) order by id)::text from arka_orders s),'[]')||
 coalesce((select jsonb_agg(to_jsonb(i) order by id)::text from arka_items i),'[]')) into before_stock;
 select md5(coalesce(jsonb_agg(jsonb_build_array(id,balance_cents,reserved_cents,credit_cents) order by id)::text,'[]')) into before_money from arka_users;
 insert into arka_cleanup_archive values(run,'order',target::text,to_jsonb(o),now());
 insert into arka_cleanup_archive select run,'units',id::text,to_jsonb(u),now() from arka_change_units u where order_id=target;
 insert into arka_cleanup_archive select run,'secrets',unit_id::text,to_jsonb(s),now() from arka_change_secrets s where unit_id=any(units);
 insert into arka_cleanup_archive select run,'history',id::text,to_jsonb(h),now() from arka_change_history h where order_id=target;
 insert into arka_cleanup_archive select run,'receipts',reference_id::text,to_jsonb(r),now() from arka_receipts r where reference_id=target;
 insert into arka_cleanup_archive select run,'wallet',id::text,to_jsonb(w),now() from arka_wallet w where reference_id=target;
 delete from arka_change_notifications where order_id=target or target_id=target or unit_id=any(units);
 delete from arka_receipts where reference_id=target;
 delete from arka_wallet where reference_id=target;
 delete from arka_change_history where order_id=target;
 delete from arka_change_secrets where unit_id=any(units);
 delete from arka_change_units where order_id=target;
 delete from arka_change_orders where id=target;
 select md5(coalesce((select jsonb_agg(to_jsonb(a) order by id)::text from arka_accounts a),'[]')||
 coalesce((select jsonb_agg(to_jsonb(s) order by id)::text from arka_orders s),'[]')||
 coalesce((select jsonb_agg(to_jsonb(i) order by id)::text from arka_items i),'[]')) into after_stock;
 select md5(coalesce(jsonb_agg(jsonb_build_array(id,balance_cents,reserved_cents,credit_cents) order by id)::text,'[]')) into after_money from arka_users;
 if before_stock is distinct from after_stock or before_money is distinct from after_money then raise exception 'Cambió información ajena a la prueba; se revierte toda la limpieza';end if;
 insert into arka_cleanup_archive(run_key,kind,record_key,data) values(run,'completed','summary','{"removed_vix_orders":1,"removed_vix_assignments":3,"removed_test_receipt_cents":45,"stock_unchanged":true,"balances_unchanged":true}');
end $$;
commit;
