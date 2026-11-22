-- Unified, private, durable notifications. No credentials in titles or messages.
alter table arka_change_notifications add column if not exists target_type text not null default 'change_order';
alter table arka_change_notifications add column if not exists target_id uuid;
alter table arka_change_notifications add column if not exists event_key text;
create unique index if not exists arka_notifications_event on arka_change_notifications(user_id,event_key) where event_key is not null;
create or replace function public.arka_notify(recipient uuid,kind text,target uuid,message text,event text) returns void
language plpgsql security definer set search_path=public as $$
begin
 insert into arka_change_notifications(user_id,order_id,target_type,target_id,message,event_key)
 select recipient,target,kind,target,left(message,500),event where exists(select 1 from arka_users where id=recipient and active and deleted_at is null)
 on conflict(user_id,event_key) where event_key is not null do nothing;
end $$;
create or replace function public.arka_notify_admins(kind text,target uuid,message text,event text) returns void
language plpgsql security definer set search_path=public as $$
declare person record;begin
 for person in select id from arka_users where role='admin' and active and deleted_at is null loop
  perform arka_notify(person.id,kind,target,message,event);
 end loop;
end $$;
create or replace function public.arka_business_notification() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='arka_orders' then
  if tg_op='INSERT' then
   perform arka_notify_admins('stock_order',new.id,'Nuevo pedido de stock. Revisa el pedido y su estado de pago.','stock-created:'||new.id);
  elsif new.status='review' and old.status<>'review' then
   perform arka_notify_admins('stock_order',new.id,'Un mayorista declaró una transferencia. Tienes un pago por verificar.','stock-payment:'||new.id);
  elsif new.status='delivered' and old.status<>'delivered' then
   perform arka_notify(new.buyer_id,'stock_order',new.id,'Tu compra fue entregada. Ya puedes consultar y copiar todas tus cuentas.','stock-delivered:'||new.id);
  end if;
 elsif tg_table_name='arka_assignments' then
  perform arka_notify(new.worker_id,'assignment',new.id,'Tienes una nueva asignación de producción. Revisa la cantidad y acepta la tarifa.','assignment:'||new.id);
 elsif tg_table_name='arka_reports' then
  if tg_op='INSERT' then
   if new.worker_id is not null and new.status='open' then
    perform arka_notify(new.worker_id,'report',new.id,'Recibiste un reporte de garantía sobre una cuenta de tu producción.','report-new:'||new.id);
   else
    perform arka_notify_admins('report',new.id,'Hay un reporte de garantía que necesita atención del administrador.','report-new:'||new.id);
   end if;
  elsif new.status='escalated' and old.status<>'escalated' then
   perform arka_notify_admins('report',new.id,'Un reporte de garantía fue derivado al administrador.','report-escalated:'||new.id);
  elsif new.status in('resolved','rejected') and old.status not in('resolved','rejected') then
   perform arka_notify(new.buyer_id,'report',new.id,'Tu reporte de garantía recibió una respuesta.','report-response:'||new.id);
  end if;
 elsif tg_table_name='arka_accounts' then
  if new.status='review' and new.worker_id is not null then
   perform arka_notify_admins('production',coalesce(new.assignment_id,new.id),'Hay cuentas de producción enviadas a revisión.','production-review:'||coalesce(new.assignment_id,new.id)||':'||txid_current());
  end if;
 elsif tg_table_name='arka_change_orders' then
  if tg_op='INSERT' then
   perform arka_notify_admins('change_order',new.id,'Nuevo pedido de cambios de contraseña.','change-created:'||new.id);
  elsif new.status='payment_review' and old.status<>'payment_review' then
   perform arka_notify_admins('change_order',new.id,'Un mayorista declaró el pago de un servicio de cambios.','change-payment:'||new.id);
  end if;
 elsif tg_table_name='arka_change_units' then
  if new.status='submitted' and old.status<>'submitted' then
   perform arka_notify_admins('change_order',new.order_id,'Hay cambios de contraseña enviados a revisión.','change-review:'||new.order_id||':'||txid_current());
  elsif new.status='refund_requested' and old.status<>'refund_requested' then
   perform arka_notify_admins('change_order',new.order_id,'Un mayorista solicita devolución al saldo por una unidad con incidencia.','change-refund:'||new.id||':'||txid_current());
  end if;
 end if;
 return new;
end $$;
drop trigger if exists arka_notify_orders on arka_orders;
create trigger arka_notify_orders after insert or update of status on arka_orders for each row execute function arka_business_notification();
drop trigger if exists arka_notify_assignments on arka_assignments;
create trigger arka_notify_assignments after insert on arka_assignments for each row execute function arka_business_notification();
drop trigger if exists arka_notify_reports on arka_reports;
create trigger arka_notify_reports after insert or update of status on arka_reports for each row execute function arka_business_notification();
drop trigger if exists arka_notify_production on arka_accounts;
create trigger arka_notify_production after insert or update of status on arka_accounts for each row
 when(new.status='review') execute function arka_business_notification();
drop trigger if exists arka_notify_change_orders on arka_change_orders;
create trigger arka_notify_change_orders after insert or update of status on arka_change_orders for each row execute function arka_business_notification();
drop trigger if exists arka_notify_change_units on arka_change_units;
create trigger arka_notify_change_units after update of status on arka_change_units for each row execute function arka_business_notification();
revoke all on function arka_notify(uuid,text,uuid,text,text),arka_notify_admins(text,uuid,text,text),arka_business_notification() from public,anon,authenticated;
grant execute on function arka_notify(uuid,text,uuid,text,text),arka_notify_admins(text,uuid,text,text),arka_business_notification() to service_role;
notify pgrst,'reload schema';
