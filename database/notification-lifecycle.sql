-- Offers never preselect or restrict workers. Allocation belongs to the paid order.
update arka_change_offers set workers='{}' where cardinality(workers)>0;
create or replace function public.arka_active_notifications(actor uuid)
returns setof arka_change_notifications language sql stable security definer set search_path=public as $$
 select n.*
 from arka_change_notifications n
 join arka_users recipient on recipient.id=n.user_id and recipient.id=actor and recipient.active and recipient.deleted_at is null
 left join arka_orders stock on n.target_type='stock_order' and stock.id=coalesce(n.target_id,n.order_id)
 left join arka_assignments assignment on n.target_type='assignment' and assignment.id=coalesce(n.target_id,n.order_id)
 left join arka_reports report on n.target_type='report' and report.id=coalesce(n.target_id,n.order_id)
 left join arka_change_orders service on n.target_type='change_order' and service.id=coalesce(n.target_id,n.order_id)
 left join arka_change_units unit on unit.id=n.unit_id and unit.order_id=service.id
 where n.user_id=actor and
 case n.target_type
 when 'stock_order' then
  case when recipient.role='admin' then
   case when n.event_key like 'stock-created:%' then stock.status='pending' else stock.status='review' end
  else stock.status='delivered' and stock.buyer_id=actor and n.read_at is null end
 when 'assignment' then assignment.worker_id=actor and assignment.active and assignment.work_submitted_at is null
 when 'production' then recipient.role='admin' and exists(
  select 1 from arka_accounts a where a.status='review' and (a.assignment_id=coalesce(n.target_id,n.order_id) or a.id=coalesce(n.target_id,n.order_id)))
 when 'report' then
  case when report.buyer_id=actor then report.status in('resolved','rejected') and n.read_at is null
  when recipient.role='admin' then report.status='escalated' or report.status='open' and (report.worker_id is null or report.worker_id=actor)
  else report.worker_id=actor and report.status='open' end
 when 'change_order' then
  service.id is not null and case
   when recipient.role='wholesale' and service.buyer_id=actor then
    case when n.unit_id is not null then service.status='processing' and unit.status in('blocked','refund_requested')
     else n.read_at is null end
   when n.unit_id is not null then service.status='processing' and unit.worker_id=actor and unit.status in('assigned','rejected')
   when recipient.role='admin' and n.event_key like 'change-created:%' then
    service.status='pending' or service.status='processing' and exists(select 1 from arka_change_units u where u.order_id=service.id and u.status='pending')
   when recipient.role='admin' and n.event_key like 'change-payment:%' then service.status='payment_review'
   when recipient.role='admin' and n.event_key like 'change-review:%' then service.status='processing' and exists(select 1 from arka_change_units u where u.order_id=service.id and u.status='submitted')
   when recipient.role='admin' and n.event_key like 'change-refund:%' then service.status='processing' and exists(select 1 from arka_change_units u where u.order_id=service.id and u.status='refund_requested')
   else service.status='processing' and exists(select 1 from arka_change_units u where u.order_id=service.id and u.worker_id=actor and u.status in('assigned','rejected'))
  end
 else false end
 order by n.created_at desc,n.id desc limit 200
$$;
revoke all on function arka_active_notifications(uuid) from public,anon,authenticated;
grant execute on function arka_active_notifications(uuid) to service_role;
notify pgrst,'reload schema';
