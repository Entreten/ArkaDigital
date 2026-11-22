create table if not exists public.arka_cleanup_archive(
 run_key text not null,kind text not null,record_key text not null,data jsonb not null,
 created_at timestamptz not null default now(),primary key(run_key,kind,record_key));
alter table arka_cleanup_archive enable row level security;
revoke all on arka_cleanup_archive from public,anon,authenticated;
grant all on arka_cleanup_archive to service_role;
create or replace function public.arka_delete_test_sale(actor uuid,target uuid,confirmation text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o arka_orders;accounts uuid[];key text;begin
 if not exists(select 1 from arka_users where id=actor and role='admin' and active and deleted_at is null) then raise exception 'Solo administrador';end if;
 if confirmation is distinct from 'ELIMINAR' then raise exception 'Escribe ELIMINAR para confirmar que la venta fue una prueba';end if;
 perform pg_advisory_xact_lock(782742119);key:='test-sale:'||target;
 select * into o from arka_orders where id=target for update;
 if not found then
  if exists(select 1 from arka_cleanup_archive where run_key=key and kind='completed') then return '{"ok":true,"already_deleted":true}';end if;
  raise exception 'Venta no encontrada';
 end if;
 if o.status<>'delivered' then raise exception 'Este botón solo elimina ventas de prueba entregadas; cancela los pedidos pendientes desde su flujo normal';end if;
 select array_agg(id) into accounts from arka_accounts where order_id=target;
 if exists(select 1 from arka_reports where account_id=any(accounts) and status in('open','escalated')) then raise exception 'Primero resuelve las garantías abiertas de esta venta';end if;
 if exists(select 1 from arka_change_units cu join arka_change_orders co on co.id=cu.order_id where cu.linked_account_id=any(accounts) and co.status not in('delivered','cancelled','expired')) then raise exception 'Hay modificaciones pendientes relacionadas';end if;
 if exists(select 1 from arka_finance where reference_id=target and kind='reserve_use') then raise exception 'Esta venta tiene devoluciones de garantía; requiere conciliación, no borrado de prueba';end if;
 insert into arka_cleanup_archive values(key,'order',o.id::text,to_jsonb(o),now());
 insert into arka_cleanup_archive select key,'items',i.id::text,to_jsonb(i),now() from arka_items i where i.order_id=target;
 insert into arka_cleanup_archive select key,'accounts',a.id::text,to_jsonb(a),now() from arka_accounts a where a.id=any(accounts);
 insert into arka_cleanup_archive select key,'finance',f.id::text,to_jsonb(f),now() from arka_finance f where f.reference_id=target;
 insert into arka_cleanup_archive select key,'sales',s.account_id::text,to_jsonb(s),now() from arka_sales s where s.order_id=target;
 insert into arka_cleanup_archive select key,'receipts',r.reference_id::text,to_jsonb(r),now() from arka_receipts r where r.reference_id=target;
 insert into arka_cleanup_archive select key,'reports',r.id::text,to_jsonb(r),now() from arka_reports r where r.account_id=any(accounts);
 insert into arka_cleanup_archive select key,'events',e.id::text,to_jsonb(e),now() from arka_events e where e.account_id=any(accounts);
 -- Production pay and worker withdrawals are independent of a sale and are never silently clawed back.
 perform arka_wallet_move(o.buyer_id,'test-sale-credit-release:'||target,o.credit_cents,target,'Saldo restituido al retirar una venta confirmada como prueba');
 delete from arka_finance where reference_id=target;
 delete from arka_sales where order_id=target;
 delete from arka_receipts where reference_id=target;
 delete from arka_events where account_id=any(accounts);
 delete from arka_reports where account_id=any(accounts);
 update arka_accounts set cipher=null,status='purged',purged_at=now(),order_id=null,buyer_id=null where id=any(accounts);
 delete from arka_items where order_id=target;
 delete from arka_change_notifications where order_id=target or target_id=target;
 delete from arka_orders where id=target;
 insert into arka_events(actor_id,event,detail) values(actor,'test_sale_deleted','Venta de prueba retirada: '||target);
 insert into arka_cleanup_archive(run_key,kind,record_key,data) values(key,'completed','summary',jsonb_build_object('removed_sale_cents',o.total_cents,'production_pay_preserved',true));
 return jsonb_build_object('ok',true,'removed_sale_cents',o.total_cents);
end $$;
revoke all on function arka_delete_test_sale(uuid,uuid,text) from public,anon,authenticated;
grant execute on function arka_delete_test_sale(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
