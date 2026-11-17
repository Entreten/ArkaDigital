
create extension if not exists pgcrypto;
create table if not exists public.arka_users(id uuid primary key default gen_random_uuid(),email text unique not null,name text not null,phone text not null default '',password_hash text not null,role text not null check(role in ('admin','worker','wholesale')),active boolean not null default true,auth_version int not null default 1,balance_cents bigint not null default 0 check(balance_cents>=0),reserved_cents bigint not null default 0 check(reserved_cents>=0 and reserved_cents<=balance_cents),created_at timestamptz not null default now());
create table if not exists public.arka_products(id uuid primary key default gen_random_uuid(),name text not null unique,category text not null default 'Streaming',brand text not null default 'ARKA',description text not null default '',conditions text not null default '',price_cents int not null check(price_cents>=0),duration_months int not null default 1 check(duration_months between 0 and 120),duration_days int not null default 0 check(duration_days between 0 and 3660),mode text not null default 'duration' check(mode in ('duration','domain')),color text not null default '#7756ff',image_url text not null default '',active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.arka_assignments(id uuid primary key default gen_random_uuid(),worker_id uuid not null references arka_users(id),product_id uuid not null references arka_products(id),quantity int not null check(quantity between 1 and 100000),rate_cents int not null check(rate_cents>=0),active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.arka_banks(id uuid primary key default gen_random_uuid(),bank text not null,holder text not null,account_number text not null,kind text not null default 'Ahorros',instructions text not null default '',active boolean not null default true);
create table if not exists public.arka_orders(id uuid primary key default gen_random_uuid(),buyer_id uuid not null references arka_users(id),status text not null default 'pending' check(status in ('pending','review','delivered','rejected','expired','cancelled')),total_cents bigint not null check(total_cents>=0),bank_id uuid references arka_banks(id),sender text,payment_date date,paid_cents bigint,note text,created_at timestamptz not null default now(),submitted_at timestamptz,delivered_at timestamptz);
create table if not exists public.arka_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references arka_orders(id),product_id uuid not null references arka_products(id),quantity int not null check(quantity>0),unit_cents int not null,product_name text not null,unique(order_id,product_id));
create table if not exists public.arka_accounts(id uuid primary key default gen_random_uuid(),product_id uuid not null references arka_products(id),worker_id uuid references arka_users(id),assignment_id uuid references arka_assignments(id),cipher text,email_fingerprint text not null,status text not null check(status in ('review','rejected','available','reserved','sold','purged')),reason text not null default '',paid boolean not null default false,order_id uuid references arka_orders(id),buyer_id uuid references arka_users(id),created_at timestamptz not null default now(),approved_at timestamptz,delivered_at timestamptz,expires_at timestamptz,confirmed_at timestamptz,purged_at timestamptz);
create unique index if not exists arka_accounts_no_duplicate on arka_accounts(product_id,email_fingerprint) where status not in ('rejected','purged');
create index if not exists arka_accounts_inventory on arka_accounts(product_id,status);
create index if not exists arka_accounts_buyer on arka_accounts(buyer_id,order_id);
create table if not exists public.arka_reports(id uuid primary key default gen_random_uuid(),account_id uuid not null references arka_accounts(id),buyer_id uuid not null references arka_users(id),worker_id uuid references arka_users(id),status text not null default 'open' check(status in ('open','escalated','resolved','rejected')),problem text not null,resolution text,resolution_type text,created_at timestamptz not null default now(),resolved_at timestamptz);
create unique index if not exists arka_reports_one_open on arka_reports(account_id) where status in ('open','escalated');
create table if not exists public.arka_withdrawals(id uuid primary key default gen_random_uuid(),worker_id uuid not null references arka_users(id),amount_cents bigint not null check(amount_cents>=1000),bank text not null,account_number text not null,holder text not null,status text not null default 'pending' check(status in ('pending','paid','rejected')),reason text not null default '',created_at timestamptz not null default now(),processed_at timestamptz);
create table if not exists public.arka_ledger(id uuid primary key default gen_random_uuid(),worker_id uuid not null references arka_users(id),amount_cents bigint not null,kind text not null,reference_id uuid,note text not null default '',created_at timestamptz not null default now());
create table if not exists public.arka_events(id uuid primary key default gen_random_uuid(),actor_id uuid references arka_users(id),account_id uuid references arka_accounts(id),event text not null,previous_cipher text,detail text not null default '',created_at timestamptz not null default now());
create table if not exists public.arka_settings(id int primary key default 1 check(id=1),theme text not null default 'original' check(theme in ('original','christmas','love')),announcement text not null default 'Tu próximo gran negocio comienza aquí',announcement_enabled boolean not null default true,announcement_interval int not null default 75 check(announcement_interval between 20 and 3600),support text not null default '',updated_at timestamptz not null default now());
insert into arka_settings(id) values(1) on conflict do nothing;
-- No unauthenticated or browser direct database access. All operations go through the role-checked server.
do $$ declare t text; begin foreach t in array array['arka_users','arka_products','arka_assignments','arka_banks','arka_orders','arka_items','arka_accounts','arka_reports','arka_withdrawals','arka_ledger','arka_events','arka_settings'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant all on public.%I to service_role',t); end loop; end $$;
create or replace function public.arka_maintenance() returns jsonb language plpgsql security definer set search_path=public as $$
declare v int; begin
 update arka_accounts set status='available',order_id=null where status='reserved' and order_id in(select id from arka_orders where status='pending' and created_at<now()-interval '24 hours');
 update arka_orders set status='expired' where status='pending' and created_at<now()-interval '24 hours';
 update arka_accounts a set cipher=null,status='purged',purged_at=now() from arka_products p where p.id=a.product_id and a.status='sold' and ((p.mode='domain' and a.delivered_at<now()-interval '7 days') or (p.mode='duration' and a.expires_at<now()-interval '7 days')) and not exists(select 1 from arka_reports r where r.account_id=a.id and r.status in('open','escalated'));
 get diagnostics v=row_count;
 update arka_events set previous_cipher=null where account_id in(select id from arka_accounts where purged_at is not null) and previous_cipher is not null;
 return jsonb_build_object('purged',v);
end $$;
revoke all on function public.arka_maintenance() from public,anon,authenticated;
grant execute on function public.arka_maintenance() to service_role;
create or replace function public.arka_command(actor uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u arka_users; a arka_accounts; p arka_products; ass arka_assignments; o arka_orders; r arka_reports; w arka_withdrawals; x jsonb; oid uuid; ids uuid[]; n int; total bigint:=0; cents bigint; nid uuid; begin
 select * into u from arka_users where id=actor and active=true; if not found then raise exception 'Acceso no autorizado'; end if;
 if action='submit_accounts' then
  if u.role not in ('worker','admin') then raise exception 'Acceso denegado'; end if;
  if u.role='worker' then
   select * into ass from arka_assignments where id=(payload->>'assignment_id')::uuid and worker_id=actor and active for update;
   if not found then raise exception 'Asignación no disponible'; end if;
   select count(*) into n from arka_accounts where assignment_id=ass.id;
   if n+jsonb_array_length(payload->'accounts')>ass.quantity then raise exception 'La carga supera la cantidad asignada; corrige las rechazadas por separado'; end if;
  else ass.product_id:=(payload->>'product_id')::uuid; end if;
  for x in select * from jsonb_array_elements(payload->'accounts') loop
   insert into arka_accounts(product_id,worker_id,assignment_id,cipher,email_fingerprint,status) values(ass.product_id,case when u.role='worker' then actor else null end,ass.id,x->>'cipher',x->>'fingerprint',case when u.role='admin' then 'available' else 'review' end);
  end loop;
  return jsonb_build_object('ok',true);
 elsif action='resubmit' then
  select * into a from arka_accounts where id=(payload->>'id')::uuid for update;
  if a.worker_id<>actor or u.role<>'worker' or a.status<>'rejected' then raise exception 'Solo puedes corregir tus cuentas rechazadas'; end if;
  insert into arka_events(actor_id,account_id,event,previous_cipher,detail) values(actor,a.id,'correction',a.cipher,a.reason);
  update arka_accounts set cipher=payload->>'cipher',email_fingerprint=payload->>'fingerprint',status='review',reason='' where id=a.id;
 elsif action='review_account' then
  if u.role<>'admin' then raise exception 'Acceso denegado'; end if;
  select * into a from arka_accounts where id=(payload->>'id')::uuid for update;
  if not found or a.status<>'review' then raise exception 'La cuenta ya fue revisada'; end if;
  if payload->>'decision'='approve' then
   update arka_accounts set status='available',approved_at=now(),paid=true,reason='' where id=a.id;
   if a.worker_id is not null and not a.paid then
    select * into ass from arka_assignments where id=a.assignment_id;
    update arka_users set balance_cents=balance_cents+ass.rate_cents where id=a.worker_id;
    insert into arka_ledger(worker_id,amount_cents,kind,reference_id,note) values(a.worker_id,ass.rate_cents,'production',a.id,'Cuenta aprobada');
   end if;
  else
   if length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Indica el motivo del rechazo'; end if;
   update arka_accounts set status='rejected',reason=payload->>'reason' where id=a.id;
  end if;
 elsif action='checkout' then
  if u.role<>'wholesale' then raise exception 'Solo mayoristas'; end if;
  if jsonb_array_length(payload->'items') not between 1 and 100 then raise exception 'Carrito no válido'; end if;
  perform 1 from arka_users where id=actor for update;
  if (select count(*) from arka_orders where buyer_id=actor and status in('pending','review'))>=5 then raise exception 'Tienes cinco pedidos pendientes; completa o cancela alguno'; end if;
  insert into arka_orders(buyer_id,total_cents) values(actor,0) returning id into oid;
  for x in select value from jsonb_array_elements(payload->'items') order by value->>'product_id' loop
   n:=(x->>'quantity')::int; if n not between 1 and 10000 then raise exception 'Cantidad no válida'; end if;
   select * into p from arka_products where id=(x->>'product_id')::uuid and active for update;
   if not found then raise exception 'Producto no disponible'; end if;
   select array_agg(id) into ids from(select id from arka_accounts where product_id=p.id and status='available' order by created_at for update skip locked limit n) s;
   if coalesce(array_length(ids,1),0)<>n then raise exception 'Stock insuficiente para %',p.name; end if;
   insert into arka_items(order_id,product_id,quantity,unit_cents,product_name) values(oid,p.id,n,p.price_cents,p.name);
   update arka_accounts set status='reserved',order_id=oid where id=any(ids);
   total:=total+p.price_cents::bigint*n;
  end loop;
  update arka_orders set total_cents=total where id=oid;
  return jsonb_build_object('id',oid,'total_cents',total);
 elsif action='payment' then
  select * into o from arka_orders where id=(payload->>'id')::uuid for update;
  if not found or o.buyer_id<>actor or o.status<>'pending' then raise exception 'Pedido no disponible'; end if;
  if (payload->>'paid_cents')::bigint<>o.total_cents then raise exception 'El importe debe coincidir exactamente con el total'; end if;
  if length(trim(payload->>'sender'))<2 or not exists(select 1 from arka_banks where id=(payload->>'bank_id')::uuid and active) then raise exception 'Completa los datos del pago'; end if;
  update arka_orders set status='review',sender=payload->>'sender',payment_date=(payload->>'payment_date')::date,paid_cents=(payload->>'paid_cents')::bigint,bank_id=(payload->>'bank_id')::uuid,submitted_at=now() where id=o.id;
 elsif action in('approve_order','reject_order','cancel_order') then
  select * into o from arka_orders where id=(payload->>'id')::uuid for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if action='cancel_order' then
   if o.buyer_id<>actor or o.status<>'pending' then raise exception 'No puedes cancelar este pedido'; end if;
  elsif u.role<>'admin' or o.status not in('pending','review') then raise exception 'Pedido ya procesado o acceso denegado'; end if;
  if action='approve_order' then
   if o.status<>'review' then raise exception 'Primero el cliente debe declarar el pago'; end if;
   update arka_accounts a set status='sold',buyer_id=o.buyer_id,delivered_at=now(),expires_at=case when p.mode='domain' then now()+interval '72 hours' else now()+make_interval(months=>p.duration_months,days=>p.duration_days) end from arka_products p where a.product_id=p.id and a.order_id=o.id and a.status='reserved';
   update arka_orders set status='delivered',delivered_at=now() where id=o.id;
  else
   update arka_accounts set status='available',order_id=null where order_id=o.id and status='reserved';
   update arka_orders set status=case when action='cancel_order' then 'cancelled' else 'rejected' end,note=payload->>'reason' where id=o.id;
  end if;
 elsif action='confirm_account' then
  select * into a from arka_accounts where id=(payload->>'id')::uuid for update;
  select * into p from arka_products where id=a.product_id;
  if a.buyer_id<>actor or p.mode<>'domain' or a.status<>'sold' then raise exception 'Cuenta no disponible'; end if;
  if exists(select 1 from arka_reports where account_id=a.id and status in('open','escalated')) then raise exception 'Primero resuelve el reporte pendiente'; end if;
  update arka_accounts set confirmed_at=coalesce(confirmed_at,now()) where id=a.id;
 elsif action='report' then
  select * into a from arka_accounts where id=(payload->>'account_id')::uuid for update;
  if not found or a.buyer_id<>actor or a.status<>'sold' then raise exception 'Cuenta no disponible'; end if;
  select * into p from arka_products where id=a.product_id;
  if a.expires_at<=now() or (p.mode='domain' and a.confirmed_at is not null) then raise exception 'Garantía fuera de plazo o ya confirmada'; end if;
  if length(trim(payload->>'problem'))<5 then raise exception 'Describe el problema'; end if;
  insert into arka_reports(account_id,buyer_id,worker_id,problem,status) values(a.id,actor,a.worker_id,payload->>'problem',case when a.worker_id is null then 'escalated' else 'open' end);
 elsif action='resolve_report' then
  select * into r from arka_reports where id=(payload->>'id')::uuid for update;
  if not found or r.status not in('open','escalated') or (u.role<>'admin' and not(u.role='worker' and r.worker_id=actor and r.status='open')) then raise exception 'Reporte no disponible'; end if;
  select * into a from arka_accounts where id=r.account_id for update;
  if payload->>'type'='escalate' then update arka_reports set status='escalated',resolution=payload->>'resolution' where id=r.id;
  elsif payload->>'type'='reject' then
   if length(trim(payload->>'resolution'))<5 then raise exception 'Explica el motivo'; end if;
   update arka_reports set status='rejected',resolution=payload->>'resolution',resolved_at=now() where id=r.id;
  else
   if payload->>'type' not in('replacement','email','password','other') then raise exception 'Solución no válida'; end if;
   if u.role<>'admin' and payload->>'type'='other' then raise exception 'Deriva este problema al administrador'; end if;
   insert into arka_events(actor_id,account_id,event,previous_cipher,detail) values(actor,a.id,payload->>'type',a.cipher,coalesce(payload->>'resolution','Garantía resuelta'));
   update arka_accounts set cipher=payload->>'cipher',email_fingerprint=payload->>'fingerprint' where id=a.id;
   update arka_reports set status='resolved',resolution_type=payload->>'type',resolution=coalesce(payload->>'resolution','Garantía resuelta'),resolved_at=now() where id=r.id;
  end if;
 elsif action='withdraw' then
  if u.role<>'worker' then raise exception 'Solo trabajadores'; end if;
  select * into u from arka_users where id=actor for update;
  cents:=(payload->>'amount_cents')::bigint;
  if cents<1000 or cents>u.balance_cents-u.reserved_cents then raise exception 'Retiro mínimo $10 y no mayor a tu saldo disponible'; end if;
  if length(trim(payload->>'bank'))<2 or length(trim(payload->>'holder'))<2 or length(trim(payload->>'account_number'))<3 then raise exception 'Completa tus datos bancarios'; end if;
  insert into arka_withdrawals(worker_id,amount_cents,bank,holder,account_number) values(actor,cents,payload->>'bank',payload->>'holder',payload->>'account_number');
  update arka_users set reserved_cents=reserved_cents+cents where id=actor;
 elsif action='process_withdrawal' then
  if u.role<>'admin' then raise exception 'Solo administrador'; end if;
  select * into w from arka_withdrawals where id=(payload->>'id')::uuid for update;
  if not found or w.status<>'pending' then raise exception 'Solicitud ya procesada'; end if;
  perform 1 from arka_users where id=w.worker_id for update;
  if payload->>'decision'='paid' then
   update arka_users set balance_cents=balance_cents-w.amount_cents,reserved_cents=reserved_cents-w.amount_cents where id=w.worker_id;
   insert into arka_ledger(worker_id,amount_cents,kind,reference_id,note) values(w.worker_id,-w.amount_cents,'withdrawal',w.id,'Retiro pagado');
   update arka_withdrawals set status='paid',processed_at=now() where id=w.id;
  else
   if length(trim(payload->>'reason'))<3 then raise exception 'Indica el motivo o el importe disponible'; end if;
   update arka_users set reserved_cents=reserved_cents-w.amount_cents where id=w.worker_id;
   update arka_withdrawals set status='rejected',reason=payload->>'reason',processed_at=now() where id=w.id;
  end if;
 elsif action='credit' then
  if u.role<>'admin' then raise exception 'Solo administrador'; end if;
  cents:=(payload->>'amount_cents')::bigint; if cents<=0 then raise exception 'Importe no válido'; end if;
  if not exists(select 1 from arka_users where id=(payload->>'worker_id')::uuid and role='worker') then raise exception 'Trabajador no encontrado'; end if;
  update arka_users set balance_cents=balance_cents+cents where id=(payload->>'worker_id')::uuid;
  insert into arka_ledger(worker_id,amount_cents,kind,note) values((payload->>'worker_id')::uuid,cents,'manual',coalesce(payload->>'note','Abono manual'));
 else raise exception 'Operación no válida'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.arka_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.arka_command(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';

create or replace function public.arka_stock() returns table(product_id uuid,quantity bigint) language sql security definer set search_path=public as $$ select product_id,count(*) from arka_accounts where status='available' group by product_id $$;
revoke all on function public.arka_stock() from public,anon,authenticated;
grant execute on function public.arka_stock() to service_role;
notify pgrst,'reload schema';
