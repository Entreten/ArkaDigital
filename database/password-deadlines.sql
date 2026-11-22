-- Additive upgrade: passwords only; real prices, wages, completed deliveries and stock stay intact.
alter table arka_assignments add column if not exists due_at timestamptz;
alter table arka_assignments add column if not exists work_submitted_at timestamptz;
alter table arka_reports add column if not exists due_at timestamptz;
create index if not exists arka_accounts_assignment_progress on arka_accounts(assignment_id,status);

insert into arka_cleanup_archive(run_key,kind,record_key,data)
 select 'password-only-20261122','offer',id::text,jsonb_build_object('mode',mode,'name',name,'instructions',instructions)
 from arka_change_offers where mode<>'password' on conflict do nothing;
insert into arka_cleanup_archive(run_key,kind,record_key,data)
 select 'password-only-20261122','service_order',id::text,jsonb_build_object('mode',mode,'offer_name',offer_name,'instructions',instructions)
 from arka_change_orders where mode<>'password' and status in('pending','payment_review','processing') on conflict do nothing;
update arka_change_offers set mode='password',
 name=regexp_replace(regexp_replace(name,'correos?\s+y\s+(contraseñas?|claves?)','contraseña','gi'),'correos?','contraseña','gi'),
 instructions='Conserva el correo actual. Cambia únicamente la contraseña por la que solicita el cliente para cada cuenta. Comprueba el acceso antes de marcar el visto.'
 where mode<>'password';
with corrected as(
 update arka_change_orders set mode='password',
 offer_name=regexp_replace(regexp_replace(offer_name,'correos?\s+y\s+(contraseñas?|claves?)','contraseña','gi'),'correos?','contraseña','gi'),
 instructions='Conserva el correo actual y cambia solo la contraseña solicitada para cada cuenta.'
 where mode<>'password' and status in('pending','payment_review','processing') returning id
)
update arka_change_units set
 status=case when status in('submitted','approved') then 'rejected' else status end,
 approved_at=null,accepted_at=null,
 reason='Servicio corregido a solo contraseña. Conserva el correo actual y verifica la contraseña solicitada.'
 where order_id in(select id from corrected) and status<>'cancelled';

create or replace function arka_refresh_work_submission(target uuid) returns void
language plpgsql security definer set search_path=public as $$
declare needed int;finished int;begin
 if target is null then return;end if;
 select quantity into needed from arka_assignments where id=target for update;
 if not found then return;end if;
 select count(*) into finished from arka_accounts where assignment_id=target and status in('review','available','reserved','sold','purged');
 update arka_assignments set work_submitted_at=case when finished>=needed then coalesce(work_submitted_at,now()) else null end where id=target;
end $$;
create or replace function arka_work_progress_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='arka_assignments' then perform arka_refresh_work_submission(new.id);return new;end if;
 if tg_op='DELETE' then perform arka_refresh_work_submission(old.assignment_id);return old;end if;
 perform arka_refresh_work_submission(new.assignment_id);return new;
end $$;
drop trigger if exists arka_work_accounts_progress on arka_accounts;
create trigger arka_work_accounts_progress after insert or update of status or delete on arka_accounts for each row execute function arka_work_progress_changed();
drop trigger if exists arka_work_quantity_progress on arka_assignments;
create trigger arka_work_quantity_progress after insert or update of quantity on arka_assignments for each row execute function arka_work_progress_changed();
do $$declare a record;begin
 for a in select id from arka_assignments where work_submitted_at is null and due_at is null loop perform arka_refresh_work_submission(a.id);end loop;
end $$;

create or replace function arka_set_work_deadline(actor uuid,kind text,target uuid,new_due timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare recipient uuid;parent uuid;previous timestamptz;event_type text;begin
 if not exists(select 1 from arka_users where id=actor and role='admin' and active and deleted_at is null) then raise exception 'Solo administrador';end if;
 if new_due is null or not isfinite(new_due) or new_due<=now() then raise exception 'Indica una fecha y hora máximas futuras';end if;
 if kind='production' then
  select worker_id,due_at into recipient,previous from arka_assignments where id=target and active and work_submitted_at is null for update;
  if not found then raise exception 'Asignación no disponible o ya enviada a revisión';end if;
  update arka_assignments set due_at=new_due where id=target;parent:=target;event_type:='assignment';
 elsif kind='change_unit' then
  select cu.worker_id,cu.order_id,cu.due_at into recipient,parent,previous from arka_change_units cu join arka_change_orders co on co.id=cu.order_id where cu.id=target and cu.worker_id is not null and co.status='processing' and cu.status in('assigned','rejected','blocked','refund_requested') for update of cu;
  if not found then raise exception 'Cuenta no disponible o ya enviada a revisión';end if;
  update arka_change_units set due_at=new_due where id=target;event_type:='change_order';
 elsif kind='report' then
  select case when status='escalated' then actor else coalesce(worker_id,actor) end,due_at into recipient,previous from arka_reports where id=target and status in('open','escalated') for update;
  if not found then raise exception 'Reporte cerrado o no encontrado';end if;
  update arka_reports set due_at=new_due where id=target;parent:=target;event_type:='report';
 else raise exception 'Tipo de trabajo no válido';end if;
 if previous is distinct from new_due then
  perform arka_notify(recipient,event_type,parent,'El administrador fijó una fecha máxima. Abre el trabajo para ver la fecha y la cuenta regresiva.','work-deadline:'||gen_random_uuid());
  insert into arka_events(actor_id,event,detail) values(actor,'work_deadline_changed',jsonb_build_object('kind',kind,'id',target,'previous',previous,'due_at',new_due)::text);
 end if;
 return '{"ok":true}';
end $$;
create or replace function arka_set_unit_requested_password(actor uuid,target uuid,desired_cipher text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare unit arka_change_units;o arka_change_orders;begin
 select co.* into o from arka_change_orders co join arka_change_units cu on cu.order_id=co.id where cu.id=target for update of co;
 if not found or o.status not in('pending','payment_review','processing') then raise exception 'Pedido no disponible';end if;
 if not exists(select 1 from arka_users where id=actor and active and deleted_at is null and (role='admin' or (role='wholesale' and id=o.buyer_id))) then raise exception 'Acceso denegado';end if;
 select * into unit from arka_change_units where id=target for update;
 if unit.accepted_at is not null or unit.status not in('pending','assigned','rejected') then raise exception 'El trabajo ya comenzó; usa el flujo de incidencias';end if;
 if desired_cipher is null or length(desired_cipher)<10 then raise exception 'Falta la contraseña solicitada';end if;
 update arka_change_secrets set requested_cipher=desired_cipher where unit_id=unit.id;
 if not found then raise exception 'Datos no disponibles';end if;
 if unit.worker_id is not null then perform arka_notify(unit.worker_id,'change_order',unit.order_id,'El cliente indicó la contraseña nueva. Revisa las indicaciones de la cuenta.','unit-password:'||gen_random_uuid());end if;
 insert into arka_change_history(order_id,unit_id,actor_id,action) values(unit.order_id,unit.id,actor,'requested_password_updated');
 return '{"ok":true}';
end $$;
revoke all on function arka_refresh_work_submission(uuid),arka_work_progress_changed(),arka_set_work_deadline(uuid,text,uuid,timestamptz),arka_set_unit_requested_password(uuid,uuid,text) from public,anon,authenticated;
grant execute on function arka_set_work_deadline(uuid,text,uuid,timestamptz),arka_set_unit_requested_password(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
