create or replace function public.arka_edit_assignment(actor uuid,kind text,target uuid,operation text,data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 s arka_assignments;o arka_change_orders;person arka_users;product arka_products;
 previous_worker uuid;worker uuid;product_id uuid;qty int;rate int;due timestamptz;
 existing_count int;available_count int;has_work boolean;changed_terms boolean;ids uuid[];
 key text:='assignment-edit:'||gen_random_uuid();n int;
begin
 if not exists(select 1 from arka_users where id=actor and role='admin' and active and deleted_at is null) then raise exception 'Solo el administrador puede editar o quitar asignaciones';end if;
 if operation is null or operation not in('edit','delete') then raise exception 'Acción no válida';end if;
 if operation='edit' then
  due:=(data->>'due_at')::timestamptz;qty:=(data->>'quantity')::int;
  if due is null or not isfinite(due) or due<=now() then raise exception 'Elige una fecha y hora máximas futuras';end if;
  if qty is null or qty not between 1 and 100000 then raise exception 'Cantidad no válida';end if;
 end if;
 if kind='production' then
  select * into s from arka_assignments where id=target for update;
  if not found then raise exception 'La asignación ya no existe';end if;
  select count(*) into existing_count from arka_accounts where assignment_id=target;
  has_work:=existing_count>0 or exists(select 1 from arka_costs where assignment_id=target);
  if operation='delete' and has_work then raise exception 'Esta asignación ya tiene cuentas o pagos asociados; no se elimina trabajo realizado';end if;
  insert into arka_cleanup_archive values(key,'assignment',target::text,to_jsonb(s),now());
  if operation='delete' then
   delete from arka_change_notifications where target_type in('assignment','production') and coalesce(target_id,order_id)=target;
   delete from arka_assignments where id=target;
   return jsonb_build_object('ok',true,'deleted',true);
  end if;
  worker:=coalesce((data->>'worker_id')::uuid,s.worker_id);product_id:=coalesce((data->>'product_id')::uuid,s.product_id);rate:=coalesce((data->>'rate_cents')::int,s.rate_cents);
  if rate<0 then raise exception 'Tarifa no válida';end if;
  if has_work and (worker<>s.worker_id or product_id<>s.product_id or rate<>s.rate_cents) then raise exception 'Ya hay trabajo registrado: conserva responsable, producto y tarifa; solo puedes corregir cantidad y fecha';end if;
  if qty<greatest(existing_count,(select count(*) from arka_costs where assignment_id=target)) then raise exception 'La cantidad no puede ser inferior al trabajo ya registrado';end if;
  select * into person from arka_users where id=worker and role in('worker','admin') and active and deleted_at is null;
  if not found then raise exception 'Elige un responsable activo';end if;
  select * into product from arka_products where id=product_id;
  if not found then raise exception 'Producto no disponible';end if;
  changed_terms:=worker<>s.worker_id or product_id<>s.product_id or rate<>s.rate_cents or qty<>s.quantity;
  update arka_assignments set worker_id=worker,product_id=product.id,quantity=qty,rate_cents=rate,due_at=due,active=true,terms_version=1,
   commission_bps=case when has_work then s.commission_bps when product.mode='duration' and product.duration_months>0 and person.role='worker' then 300 else 0 end,
   accepted_at=case when person.role='admin' then now() when changed_terms then null else s.accepted_at end
   where id=target;
  perform arka_notify(worker,'assignment',target,'Tu asignación fue corregida. Revisa cantidad, tarifa y fecha máxima antes de continuar.',key);
 elsif kind='service' then
  select * into o from arka_change_orders where id=target for update;
  if not found or o.status<>'processing' then raise exception 'Solo se corrigen asignaciones de pedidos confirmados en proceso';end if;
  previous_worker:=(data->>'current_worker')::uuid;
  perform 1 from arka_change_units where order_id=target order by position for update;
  select array_agg(id order by position) into ids from arka_change_units where order_id=target and worker_id=previous_worker and status in('assigned','rejected');
  if coalesce(array_length(ids,1),0)=0 then raise exception 'No hay unidades pendientes de envío para quitar o editar; se conservan los trabajos enviados, aprobados y con incidencias';end if;
  if operation='edit' then
   worker:=(data->>'worker_id')::uuid;
   if not exists(select 1 from arka_users where id=worker and role in('worker','admin') and active and deleted_at is null) then raise exception 'Elige un responsable activo';end if;
   select count(*) into available_count from arka_change_units where order_id=target and (status='pending' or id=any(ids));
   if qty>available_count then raise exception 'Solo hay % unidades disponibles para asignar',available_count;end if;
  end if;
  insert into arka_cleanup_archive select key,'unit',id::text,to_jsonb(u),now() from arka_change_units u where id=any(ids);
  insert into arka_cleanup_archive select key,'secret',unit_id::text,to_jsonb(c),now() from arka_change_secrets c where unit_id=any(ids);
  update arka_change_secrets set result_cipher=null,suggestion_cipher=null where unit_id=any(ids);
  update arka_change_units set worker_id=null,status='pending',accepted_at=null,due_at=null,submitted_at=null,approved_at=null,result_fingerprint=null,reason='' where id=any(ids);
  n:=array_length(ids,1);
  if operation='edit' then
   update arka_change_units set worker_id=worker,status='assigned',due_at=due where id in(
    select id from arka_change_units where order_id=target and status='pending' order by (id=any(ids)) desc,position limit qty);
   perform arka_notify(worker,'change_order',target,'Tienes una asignación de contraseñas corregida. Revisa las cuentas pendientes y su fecha máxima.',key);
  end if;
  insert into arka_change_history(order_id,actor_id,action,detail) values(target,actor,'assignment_'||operation,'Unidades pendientes liberadas: '||n||case when operation='edit' then '; asignadas: '||qty else '; la compra y sus importes se conservan' end);
 else raise exception 'Tipo de trabajo no válido';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function arka_edit_assignment(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function arka_edit_assignment(uuid,text,uuid,text,jsonb) to service_role;
-- Search all of one buyer's folders without fetching or decrypting credentials.
create index if not exists arka_account_buyer_email on arka_accounts(buyer_id,email_fingerprint);
notify pgrst,'reload schema';
