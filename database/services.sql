-- Additive service/finance migration. Existing inventory and warranty tables remain.
create table if not exists public.arka_finance_settings(
 id int primary key default 1 check(id=1),reserve_bps int check(reserve_bps between 0 and 10000),
 pending_hours int not null default 24 check(pending_hours between 1 and 720),
 unpaid_retention_days int not null default 30 check(unpaid_retention_days between 1 and 3650),
 storage_bytes bigint not null default 524288000 check(storage_bytes>0));
insert into arka_finance_settings(id) values(1) on conflict do nothing;
create table if not exists public.arka_wallet(
 id uuid primary key default gen_random_uuid(),buyer_id uuid not null references arka_users(id),
 event_key text not null unique,amount_cents bigint not null check(amount_cents<>0),
 reference_id uuid,note text not null,created_at timestamptz not null default now());
alter table arka_users add column if not exists credit_cents bigint not null default 0 check(credit_cents>=0);
alter table arka_orders add column if not exists credit_cents bigint not null default 0 check(credit_cents>=0);
alter table arka_assignments add column if not exists terms_version int not null default 0;
alter table arka_assignments alter column terms_version set default 1;
alter table arka_assignments add column if not exists accepted_at timestamptz;
alter table arka_assignments add column if not exists commission_bps int not null default 0;
create table if not exists public.arka_costs(
 account_id uuid primary key,assignment_id uuid,worker_id uuid,base_cents bigint not null check(base_cents>=0),
 fee_cents bigint not null default 0 check(fee_cents>=0),own boolean not null default false,
 fee_state text not null default 'none' check(fee_state in('none','applied','pending')),
 created_at timestamptz not null default now());
create table if not exists public.arka_finance(
 id uuid primary key default gen_random_uuid(),event_key text not null unique,
 kind text not null check(kind in('margin','own','commission','reserve','reserve_use','withdrawal','adjustment')),
 amount_cents bigint not null,reference_id uuid,user_id uuid,description text not null,
 created_at timestamptz not null default now());
create table if not exists public.arka_sales(
 account_id uuid primary key,order_id uuid not null,unit_cents bigint not null,
 cost_cents bigint,monthly boolean not null,reserve_bps int,created_at timestamptz not null);
create table if not exists public.arka_receipts(
 reference_id uuid primary key,kind text not null,cash_cents bigint not null check(cash_cents>=0),
 credit_cents bigint not null check(credit_cents>=0),verified_at timestamptz not null);
create table if not exists public.arka_change_offers(
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 150),
 mode text not null check(mode in('email','password','both')),price_cents int not null check(price_cents>0),
 margin_cents int not null check(margin_cents>=0 and margin_cents<=price_cents),
 instructions text not null default '',active boolean not null default true,
 workers uuid[] not null default '{}',created_at timestamptz not null default now());
create sequence if not exists public.arka_change_number;
create table if not exists public.arka_change_orders(
 id uuid primary key default gen_random_uuid(),number bigint not null unique default nextval('arka_change_number'),
 buyer_id uuid not null references arka_users(id),offer_id uuid not null references arka_change_offers(id),
 offer_name text not null,instructions text not null default '',mode text not null check(mode in('email','password','both')),
 unit_cents int not null check(unit_cents>0),margin_cents int not null check(margin_cents>=0 and margin_cents<=unit_cents),
 quantity int not null check(quantity between 1 and 1000),total_cents bigint not null check(total_cents>=0),
 credit_cents bigint not null default 0,paid_cents bigint not null default 0,
 status text not null default 'pending' check(status in('pending','payment_review','processing','delivered','cancelled','expired')),
 request_cipher text,bank_id uuid references arka_banks(id),sender text,transaction_code text,payment_date date,
 created_at timestamptz not null default now(),verified_at timestamptz,delivered_at timestamptz,access_until timestamptz,purged_at timestamptz,
 check(total_cents=unit_cents::bigint*quantity),check(credit_cents between 0 and total_cents));
create table if not exists public.arka_change_units(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references arka_change_orders(id),
 position int not null,worker_id uuid references arka_users(id),linked_account_id uuid references arka_accounts(id),
 source_fingerprint text not null,result_fingerprint text,
 status text not null default 'pending' check(status in('pending','assigned','submitted','approved','rejected','blocked','refund_requested','cancelled')),
 due_at timestamptz,
 reason text not null default '',accepted_at timestamptz,submitted_at timestamptz,approved_at timestamptz,
 refunded_at timestamptz,created_at timestamptz not null default now(),
 unique(order_id,position),unique(order_id,source_fingerprint));
alter table arka_change_orders add column if not exists instructions text not null default '';
create unique index if not exists arka_change_result_unique on arka_change_units(order_id,result_fingerprint) where result_fingerprint is not null and status<>'cancelled';
create unique index if not exists arka_change_link_active on arka_change_units(linked_account_id) where linked_account_id is not null and status not in('approved','cancelled');
create index if not exists arka_change_units_worker on arka_change_units(worker_id,order_id);
create index if not exists arka_change_orders_buyer on arka_change_orders(buyer_id,created_at desc);
create table if not exists public.arka_change_secrets(
 unit_id uuid primary key references arka_change_units(id) on delete cascade,
 original_cipher text,result_cipher text,suggestion_cipher text,requested_cipher text);
alter table arka_change_units add column if not exists due_at timestamptz;
alter table arka_change_secrets add column if not exists requested_cipher text;
create table if not exists public.arka_change_history(
 id uuid primary key default gen_random_uuid(),order_id uuid not null,unit_id uuid,actor_id uuid,
 action text not null,detail text not null default '',created_at timestamptz not null default now());
create table if not exists public.arka_change_notifications(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references arka_users(id),
 order_id uuid not null,unit_id uuid,message text not null,read_at timestamptz,created_at timestamptz not null default now());
create index if not exists arka_change_notifications_user on arka_change_notifications(user_id,created_at desc);
-- The owner removed automatic linkage to previous purchases. Preserve service input/results,
-- then detach legacy requests so their completion cannot modify an original stock purchase.
update arka_change_secrets secrets set original_cipher=coalesce(secrets.original_cipher,a.cipher)
 from arka_change_units unit join arka_change_orders orders on orders.id=unit.order_id
 join arka_accounts a on a.id=unit.linked_account_id
 where secrets.unit_id=unit.id and unit.linked_account_id is not null and orders.status in('pending','payment_review','processing');
update arka_change_secrets secrets set result_cipher=coalesce(secrets.result_cipher,a.cipher)
 from arka_change_units unit join arka_change_orders orders on orders.id=unit.order_id
 join arka_accounts a on a.id=unit.linked_account_id
 where secrets.unit_id=unit.id and unit.linked_account_id is not null and orders.status='delivered' and orders.access_until>now();
update arka_change_units set linked_account_id=null where linked_account_id is not null;
do $$ declare t text; begin foreach t in array array['arka_finance_settings','arka_wallet','arka_costs','arka_finance','arka_sales','arka_receipts','arka_change_offers','arka_change_orders','arka_change_units','arka_change_secrets','arka_change_history','arka_change_notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
grant usage,select on sequence arka_change_number to service_role;

create or replace function public.arka_wallet_move(buyer uuid,event text,cents bigint,ref uuid,message text) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from arka_users where id=buyer for update;
 if exists(select 1 from arka_wallet where event_key=event) then return; end if;
 if cents=0 then return; end if;
 update arka_users set credit_cents=credit_cents+cents where id=buyer;
 insert into arka_wallet(buyer_id,event_key,amount_cents,reference_id,note) values(buyer,event,cents,ref,message);
end $$;

-- Snapshot the original tariff from actual production payments; never from today's selling price.
insert into arka_costs(account_id,assignment_id,worker_id,base_cents,created_at)
 select l.reference_id,a.assignment_id,l.worker_id,l.amount_cents,l.created_at
 from arka_ledger l join arka_accounts a on a.id=l.reference_id
 where l.kind='production' and l.amount_cents>=0 on conflict do nothing;
update arka_assignments s set commission_bps=300 where terms_version=0
 and exists(select 1 from arka_products p where p.id=s.product_id and p.mode='duration' and p.duration_months>0);

create or replace function public.arka_production_fee() returns trigger language plpgsql security definer set search_path=public as $$
declare a arka_accounts;s arka_assignments;previous_base bigint;previous_fee bigint;fee bigint:=0;is_own boolean;
begin
 if new.kind<>'production' then return new; end if;
 select * into a from arka_accounts where id=new.reference_id;
 if not found then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(a.assignment_id,a.id)::text,0));
 if exists(select 1 from arka_costs where account_id=a.id) then raise exception 'La producción ya fue acreditada'; end if;
 select role='admin' into is_own from arka_users where id=new.worker_id;
 select * into s from arka_assignments where id=a.assignment_id;
 if not coalesce(is_own,false) and s.commission_bps=300 then
  select coalesce(sum(base_cents),0),coalesce(sum(fee_cents),0) into previous_base,previous_fee from arka_costs where assignment_id=s.id;
  fee:=greatest(0,((previous_base+new.amount_cents)*3+50)/100-previous_fee);
 end if;
 insert into arka_costs(account_id,assignment_id,worker_id,base_cents,fee_cents,fee_state,own)
 values(a.id,a.assignment_id,new.worker_id,new.amount_cents,fee,case when fee>0 then 'applied' else 'none' end,coalesce(is_own,false));
 if fee>0 then
  update arka_users set balance_cents=balance_cents-fee where id=new.worker_id;
  insert into arka_finance(event_key,kind,amount_cents,reference_id,user_id,description)
   values('commission:'||a.id,'commission',fee,a.id,new.worker_id,'3% producción mensual');
  new.amount_cents:=new.amount_cents-fee;
  new.note:='Producción: base '||(new.amount_cents+fee)||' ctvs; comisión '||fee||' ctvs; neto '||new.amount_cents||' ctvs';
 end if;
 return new;
end $$;
drop trigger if exists arka_production_fee_trigger on arka_ledger;
create trigger arka_production_fee_trigger before insert on arka_ledger for each row execute function arka_production_fee();

-- One historical adjustment per account. Insufficient available balances are held for administrator review.
do $$ declare w record;c record;fee bigint;previous_base bigint;previous_fee bigint;needed bigint;begin
 for w in select distinct u.id from arka_users u join arka_costs pc on pc.worker_id=u.id
  join arka_accounts a on a.id=pc.account_id join arka_products p on p.id=a.product_id
  where u.role='worker' and p.mode='duration' and p.duration_months>0 order by u.id loop
  perform 1 from arka_users where id=w.id for update;
  for c in select pc.* from arka_costs pc join arka_accounts a on a.id=pc.account_id join arka_products p on p.id=a.product_id
   where pc.worker_id=w.id and pc.fee_state='none' and p.mode='duration' and p.duration_months>0
    and not exists(select 1 from arka_finance f where f.event_key='historical:'||pc.account_id)
   order by pc.created_at,pc.account_id loop
   select coalesce(sum(base_cents),0),coalesce(sum(fee_cents),0) into previous_base,previous_fee
    from arka_costs where assignment_id=c.assignment_id and (created_at,account_id)<(c.created_at,c.account_id);
   fee:=greatest(0,((previous_base+c.base_cents)*3+50)/100-previous_fee);
   update arka_costs set fee_cents=fee,fee_state=case when fee>0 then 'pending' else 'applied' end where account_id=c.account_id;
  end loop;
  select coalesce(sum(fee_cents),0) into needed from arka_costs where worker_id=w.id and fee_state='pending';
  if needed>0 and needed<=(select balance_cents-reserved_cents from arka_users where id=w.id) then
   for c in select * from arka_costs where worker_id=w.id and fee_state='pending' order by created_at,account_id loop
    insert into arka_finance(event_key,kind,amount_cents,reference_id,user_id,description,created_at)
     values('historical:'||c.account_id,'commission',c.fee_cents,c.account_id,w.id,'Ajuste histórico 3% producción mensual',now()) on conflict do nothing;
    if found then
     update arka_users set balance_cents=balance_cents-c.fee_cents where id=w.id;
     insert into arka_ledger(worker_id,amount_cents,kind,reference_id,note) values(w.id,-c.fee_cents,'historical_commission',c.account_id,'Ajuste histórico del 3%; sin modificar movimientos originales');
    end if;
    update arka_costs set fee_state='applied' where account_id=c.account_id;
   end loop;
  end if;
 end loop;
end $$;

create or replace function public.arka_book_stock(target uuid) returns void language plpgsql security definer set search_path=public as $$
declare o arka_orders;r record;reserve_rate int; profit bigint;reserved bigint;
begin
 select * into o from arka_orders where id=target and status='delivered';if not found then return;end if;
 insert into arka_receipts(reference_id,kind,cash_cents,credit_cents,verified_at)
 values(o.id,'stock',coalesce(o.paid_cents,o.total_cents-o.credit_cents),o.credit_cents,o.delivered_at) on conflict do nothing;
 select reserve_bps into reserve_rate from arka_finance_settings where id=1;
 for r in select a.id,a.product_id,i.unit_cents,c.base_cents,c.own,c.worker_id,
 (p.mode='duration' and p.duration_months>0) monthly
 from arka_accounts a join arka_items i on i.order_id=a.order_id and i.product_id=a.product_id
 join arka_products p on p.id=a.product_id left join arka_costs c on c.account_id=a.id
 where a.order_id=o.id and a.status in('sold','purged') loop
  insert into arka_sales(account_id,order_id,unit_cents,cost_cents,monthly,reserve_bps,created_at)
   values(r.id,o.id,r.unit_cents,r.base_cents,r.monthly,case when r.monthly then reserve_rate else 0 end,o.delivered_at) on conflict do nothing;
  if not found or r.base_cents is null then continue;end if;
  profit:=r.unit_cents-r.base_cents;
  reserved:=case when r.monthly and reserve_rate is not null then (greatest(profit,0)*reserve_rate+5000)/10000 else 0 end;
  insert into arka_finance(event_key,kind,amount_cents,reference_id,description,created_at)
   values('stock-margin:'||r.id,'margin',profit-reserved,o.id,'Margen comercial venta de stock',o.delivered_at) on conflict do nothing;
  if r.own then
   insert into arka_finance(event_key,kind,amount_cents,reference_id,user_id,description,created_at)
    values('own-stock:'||r.id,'own',r.base_cents,o.id,r.worker_id,'Producción propia vendida',o.delivered_at) on conflict do nothing;
  end if;
  if reserved>0 then insert into arka_finance(event_key,kind,amount_cents,reference_id,description,created_at)
   values('stock-reserve:'||r.id,'reserve',reserved,o.id,'Reserva de garantía mensual',o.delivered_at) on conflict do nothing;end if;
 end loop;
end $$;
select arka_book_stock(id) from arka_orders where status='delivered';

create or replace function public.arka_order_finance_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='delivered' and old.status<>'delivered' then perform arka_book_stock(new.id);end if;
 if new.status in('cancelled','rejected','expired') and old.status not in('cancelled','rejected','expired') then
  perform arka_wallet_move(new.buyer_id,'stock-release:'||new.id,new.credit_cents,new.id,'Saldo liberado de pedido sin entrega');
 end if;return new;
end $$;
drop trigger if exists arka_order_finance on arka_orders;
create trigger arka_order_finance after update on arka_orders for each row execute function arka_order_finance_trigger();

-- Preserve the current command implementation as the underlying inventory/warranty engine.
do $$ declare definition text;begin
 select pg_get_functiondef('public.arka_command(uuid,text,jsonb)'::regprocedure) into definition;
 if position('arka_command_original' in definition)=0 then
  execute replace(definition,'public.arka_command(','public.arka_command_original(');
 end if;
end $$;
create or replace function public.arka_command(actor uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u arka_users;s arka_assignments;p arka_products;a arka_accounts;result jsonb;oid uuid;credit bigint;cash bigint;account jsonb;
begin
 select * into u from arka_users where id=actor and active and deleted_at is null;
 if not found then raise exception 'Acceso denegado';end if;
 if action='accept_assignment' then
  update arka_assignments set accepted_at=coalesce(accepted_at,now()) where id=(payload->>'id')::uuid and worker_id=actor and active;
  if not found then raise exception 'Asignación no disponible';end if;return '{"ok":true}';
 end if;
 if action='submit_accounts' and payload->>'assignment_id' is not null then
  select * into s from arka_assignments where id=(payload->>'assignment_id')::uuid and worker_id=actor and active for update;
  if not found then raise exception 'La asignación no te corresponde';end if;
  if s.terms_version>0 and s.accepted_at is null and u.role<>'admin' then raise exception 'Acepta primero la tarifa y las indicaciones de la asignación';end if;
  if u.role='admin' then
   if (select count(*) from arka_accounts where assignment_id=s.id)+jsonb_array_length(payload->'accounts')>s.quantity then raise exception 'La carga supera la cantidad asignada';end if;
   payload:=payload||jsonb_build_object('product_id',s.product_id);
  end if;
 end if;
 if action='checkout' then
  perform 1 from arka_users where id=actor for update;
  result:=arka_command_original(actor,action,payload);oid:=(result->>'id')::uuid;
  select least(credit_cents,(select total_cents from arka_orders where id=oid)) into credit from arka_users where id=actor;
  update arka_orders set credit_cents=credit where id=oid;
  perform arka_wallet_move(actor,'stock-credit:'||oid,-credit,oid,'Saldo aplicado a compra de stock');
  if (select total_cents=credit_cents from arka_orders where id=oid) then
   update arka_orders set status='review',paid_cents=0,transaction_code='SALDO INTERNO' where id=oid;
   -- No administrator impersonation: delivery uses the same transactional stock operation.
   update arka_accounts inv set status='sold',buyer_id=actor,delivered_at=now(),expires_at=case when prod.mode='domain' then now()+interval '72 hours' else now()+make_interval(months=>prod.duration_months,days=>prod.duration_days) end from arka_products prod where inv.product_id=prod.id and inv.order_id=oid and inv.status='reserved';
   update arka_orders set status='delivered',delivered_at=now() where id=oid;
  end if;return result;
 end if;
 if action='payment' then
  select total_cents-credit_cents into cash from arka_orders where id=(payload->>'id')::uuid and buyer_id=actor;
  if cash is null or (payload->>'paid_cents')::bigint<>cash then raise exception 'Declara exactamente la diferencia pendiente';end if;
  select payload||jsonb_build_object('paid_cents',total_cents) into payload from arka_orders where id=(payload->>'id')::uuid;
 end if;
 result:=arka_command_original(actor,action,payload);
 if action='payment' then update arka_orders set paid_cents=cash where id=(payload->>'id')::uuid;end if;
 if action='submit_accounts' and u.role='admin' then
  for account in select * from jsonb_array_elements(payload->'accounts') loop
   update arka_accounts set worker_id=actor,assignment_id=s.id,paid=true,approved_at=now()
    where product_id=(payload->>'product_id')::uuid and email_fingerprint=account->>'fingerprint' and worker_id is null returning * into a;
   if found and s.id is not null then
    insert into arka_costs(account_id,assignment_id,worker_id,base_cents,own) values(a.id,s.id,actor,s.rate_cents,true);
   end if;
  end loop;
 end if;return result;
end $$;

create or replace function public.arka_changes(actor uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u arka_users;o arka_change_orders;offer arka_change_offers;unit arka_change_units;
 x jsonb;oid uuid;n int:=0;credit bigint;recipient uuid;completed int;amount bigint;workers uuid[];v_bank uuid;
begin
 select * into u from arka_users where id=actor and active and deleted_at is null;
 if not found then raise exception 'Acceso denegado';end if;
 if action='create' then
  if u.role<>'wholesale' then raise exception 'Solo mayoristas';end if;
  perform 1 from arka_users where id=actor for update;
  select * into offer from arka_change_offers where id=(payload->>'offer_id')::uuid and active;
  if not found then raise exception 'Oferta no disponible';end if;
  if offer.mode<>'password' then raise exception 'Solo se permiten cambios de contraseña';end if;
  if coalesce((payload->>'acknowledged')::boolean,false)=false then raise exception 'Confirma que las cuentas son tuyas y tienen acceso y suscripción cuando corresponde';end if;
  if jsonb_array_length(payload->'accounts') not between 1 and 1000 then raise exception 'Carga entre 1 y 1000 cuentas';end if;
  if (select count(*) from arka_change_orders where buyer_id=actor and status in('pending','payment_review'))>=5 then raise exception 'Completa tus pedidos de pago pendientes';end if;
  insert into arka_change_orders(buyer_id,offer_id,offer_name,mode,unit_cents,margin_cents,quantity,total_cents,request_cipher)
   values(actor,offer.id,offer.name,offer.mode,offer.price_cents,offer.margin_cents,jsonb_array_length(payload->'accounts'),offer.price_cents::bigint*jsonb_array_length(payload->'accounts'),payload->>'request_cipher') returning id into oid;
  update arka_change_orders set instructions=offer.instructions where id=oid;
  for x in select * from jsonb_array_elements(payload->'accounts') loop
   n:=n+1;
   if x->>'linked_account_id' is not null then raise exception 'Los servicios de cambios no se vinculan a compras anteriores; ingresa las cuentas manualmente';end if;
   if x->>'linked_account_id' is not null then
    perform 1 from arka_accounts where id=(x->>'linked_account_id')::uuid for update;
    if not exists(select 1 from arka_accounts a join arka_products p on p.id=a.product_id where a.id=(x->>'linked_account_id')::uuid and a.buyer_id=actor and a.status='sold' and p.mode='duration' and a.expires_at>now()) then raise exception 'La cuenta vinculada no es tuya o ya venció';end if;
    if exists(select 1 from arka_reports where account_id=(x->>'linked_account_id')::uuid and status in('open','escalated')) then raise exception 'Resuelve la garantía abierta antes de solicitar cambios';end if;
    if exists(select 1 from arka_change_units cu join arka_change_orders co on co.id=cu.order_id where cu.linked_account_id=(x->>'linked_account_id')::uuid and co.status not in('delivered','cancelled','expired') and cu.status<>'cancelled') then raise exception 'Esta cuenta ya tiene un cambio pendiente';end if;
   end if;
   insert into arka_change_units(order_id,position,source_fingerprint,linked_account_id)
    values(oid,n,x->>'fingerprint',(x->>'linked_account_id')::uuid) returning id into unit.id;
   insert into arka_change_secrets(unit_id,original_cipher,suggestion_cipher,requested_cipher) values(unit.id,x->>'cipher',x->>'suggestion_cipher',x->>'requested_cipher');
  end loop;
  select least(credit_cents,(select total_cents from arka_change_orders where id=oid)) into credit from arka_users where id=actor;
  perform arka_wallet_move(actor,'change-credit:'||oid,-credit,oid,'Saldo aplicado al pedido de cambios');
  update arka_change_orders set credit_cents=credit,status=case when total_cents=credit then 'processing' else 'pending' end,
   verified_at=case when total_cents=credit then now() else null end where id=oid;
  if (select total_cents=credit from arka_change_orders where id=oid) then
   insert into arka_receipts(reference_id,kind,cash_cents,credit_cents,verified_at) values(oid,'change',0,credit,now());
  end if;
  insert into arka_change_history(order_id,actor_id,action) values(oid,actor,'create');
  return jsonb_build_object('id',oid);
 end if;
 if action='notification_read' then
  update arka_change_notifications set read_at=coalesce(read_at,now()) where id=(payload->>'id')::uuid and user_id=actor;return '{"ok":true}';
 end if;
 if action in('submit','approve','reject','problem','correct','refund_request','refund_approve','refund_reject','accept') then
  select order_id into oid from arka_change_units where id=(payload->>'id')::uuid;
 else oid:=(payload->>'id')::uuid;end if;
 select * into o from arka_change_orders where id=oid for update;
 if not found then raise exception 'Pedido no encontrado';end if;
 if u.role='wholesale' and o.buyer_id<>actor then raise exception 'Acceso denegado';end if;
 if u.role='worker' and not exists(select 1 from arka_change_units where order_id=oid and worker_id=actor) then raise exception 'Acceso denegado';end if;
 if action='payment' then
  if u.role<>'wholesale' or o.status<>'pending' then raise exception 'Pedido no disponible para pago';end if;
  if (payload->>'paid_cents')::bigint<>o.total_cents-o.credit_cents then raise exception 'El importe debe coincidir con la diferencia pendiente';end if;
  v_bank:=(payload->>'bank_id')::uuid;
  if not exists(select 1 from arka_banks where id=v_bank and active) or length(btrim(coalesce(payload->>'transaction_code',''))) not between 1 and 150 or length(btrim(coalesce(payload->>'sender','')))<2 then raise exception 'Completa banco, remitente y código de transacción';end if;
  update arka_change_orders set status='payment_review',bank_id=v_bank,sender=payload->>'sender',transaction_code=payload->>'transaction_code',payment_date=(payload->>'payment_date')::date,paid_cents=(payload->>'paid_cents')::bigint where id=oid;
 elsif action='verify_payment' then
  if u.role<>'admin' or o.status<>'payment_review' then raise exception 'Pago no disponible';end if;
  update arka_change_orders set status='processing',verified_at=now() where id=oid;
  insert into arka_receipts(reference_id,kind,cash_cents,credit_cents,verified_at) values(oid,'change',o.paid_cents,o.credit_cents,now());
 elsif action='cancel' then
  if not ((u.role='wholesale' and o.status='pending') or (u.role='admin' and o.status in('pending','payment_review'))) then raise exception 'Solo puede cancelarse un pedido sin pago verificado';end if;
  perform arka_wallet_move(o.buyer_id,'change-cancel:'||oid,o.credit_cents,oid,'Saldo liberado por cancelación');
  update arka_change_orders set status='cancelled',request_cipher=null where id=oid;
  delete from arka_change_secrets where unit_id in(select id from arka_change_units where order_id=oid);
  update arka_change_units set status='cancelled' where order_id=oid;
 elsif action='assign' then
  if u.role<>'admin' or o.status<>'processing' then raise exception 'Solo el administrador asigna pedidos pagados';end if;
  select * into offer from arka_change_offers where id=o.offer_id;
  for x in select * from jsonb_array_elements(payload->'allocations') loop
   recipient:=(x->>'worker_id')::uuid;n:=(x->>'quantity')::int;
    if coalesce(x->>'due_at',payload->>'due_at','')='' or coalesce(x->>'due_at',payload->>'due_at')::timestamptz<=now() then raise exception 'Indica fecha y hora máximas futuras para cada asignación';end if;
   if n<1 or not exists(select 1 from arka_users where id=recipient and active and deleted_at is null and (role='admin' or (role='worker' and (coalesce(cardinality(offer.workers),0)=0 or id=any(offer.workers))))) then raise exception 'Elige un trabajador activo habilitado para esta oferta o a ti mismo';end if;
   if exists(select 1 from arka_change_units where order_id=oid and worker_id=recipient and status in('assigned','rejected') and accepted_at is not null) and coalesce((payload->>'reassign')::boolean,false) then null;end if;
   with chosen as(select id from arka_change_units where order_id=oid and
    ((not coalesce((payload->>'reassign')::boolean,false) and status='pending') or
     (coalesce((payload->>'reassign')::boolean,false) and status in('assigned','rejected') and id in(select value::uuid from jsonb_array_elements_text(payload->'unit_ids'))))
    order by position for update limit n)
     update arka_change_units set worker_id=recipient,status='assigned',accepted_at=null,due_at=coalesce(x->>'due_at',payload->>'due_at')::timestamptz where id in(select id from chosen);
   get diagnostics completed=row_count;if completed<>n then raise exception 'No hay suficientes unidades pendientes para ese reparto';end if;
    insert into arka_change_notifications(user_id,order_id,message) values(recipient,oid,'Tienes cambios de contraseña asignados. Revisa las indicaciones, la fecha máxima y acepta la tarifa.');
  end loop;
 elsif action='deliver' then
   if not (u.role='admin' or (u.role='wholesale' and o.buyer_id=actor)) or o.status<>'processing' then raise exception 'Pedido no disponible para entrega';end if;
  if exists(select 1 from arka_change_units where order_id=oid and (status not in('approved','cancelled') or (status='cancelled' and refunded_at is null))) then raise exception 'Todas las unidades deben estar aprobadas o canceladas con devolución registrada';end if;
  for unit in select * from arka_change_units where order_id=oid and status='approved' order by position loop
   if unit.linked_account_id is not null then
    perform 1 from arka_accounts where id=unit.linked_account_id and buyer_id=o.buyer_id and status='sold' and expires_at>now() for update;
    if not found then raise exception 'Una cuenta vinculada venció durante el trabajo; revísala antes de entregar';end if;
    if exists(select 1 from arka_reports where account_id=unit.linked_account_id and status in('open','escalated')) then raise exception 'Resuelve la garantía abierta de la cuenta vinculada antes de entregar';end if;
    update arka_accounts set cipher=(select result_cipher from arka_change_secrets where unit_id=unit.id),email_fingerprint=unit.result_fingerprint where id=unit.linked_account_id;
    update arka_change_secrets set result_cipher=null where unit_id=unit.id;
   end if;
   if exists(select 1 from arka_users where id=unit.worker_id and role='admin') then
    insert into arka_finance(event_key,kind,amount_cents,reference_id,user_id,description) values('change-own:'||unit.id,'own',o.unit_cents-o.margin_cents,oid,unit.worker_id,'Trabajo propio en CAM-'||o.number);
   else
    update arka_users set balance_cents=balance_cents+o.unit_cents-o.margin_cents where id=unit.worker_id;
    insert into arka_ledger(worker_id,amount_cents,kind,reference_id,note) values(unit.worker_id,o.unit_cents-o.margin_cents,'change_service',unit.id,'Cambio entregado CAM-'||o.number);
   end if;
  end loop;
  select count(*) into completed from arka_change_units where order_id=oid and status='approved';
  insert into arka_finance(event_key,kind,amount_cents,reference_id,description) values('change-margin:'||oid,'margin',completed::bigint*o.margin_cents,oid,'Margen comercial CAM-'||o.number);
  update arka_change_orders set status='delivered',delivered_at=now(),access_until=now()+interval '7 days',request_cipher=null where id=oid;
  update arka_change_secrets set original_cipher=null,suggestion_cipher=null,requested_cipher=null where unit_id in(select id from arka_change_units where order_id=oid);
  insert into arka_change_notifications(user_id,order_id,message) values(o.buyer_id,oid,'Pedido entregado. Copia o exporta tus datos antes de siete días.');
 else
  select * into unit from arka_change_units where id=(payload->>'id')::uuid and order_id=oid for update;
  if not found or o.status<>'processing' then raise exception 'Unidad no disponible';end if;
  if action in('accept','submit','problem') then
   if unit.worker_id is distinct from actor or u.role not in('worker','admin') then raise exception 'Esta unidad no te está asignada';end if;
  end if;
  if action='accept' then
   if unit.status not in('assigned','rejected') then raise exception 'Unidad no disponible';end if;
   update arka_change_units set accepted_at=coalesce(accepted_at,now()) where id=unit.id;
  elsif action='submit' then
   if unit.status not in('assigned','rejected') or unit.accepted_at is null then raise exception 'Acepta primero las instrucciones y la tarifa';end if;
   update arka_change_secrets set result_cipher=payload->>'cipher' where unit_id=unit.id;
   update arka_change_units set status='submitted',result_fingerprint=payload->>'fingerprint',reason='',submitted_at=now() where id=unit.id;
  elsif action in('approve','reject') then
   if u.role<>'admin' or unit.status<>'submitted' then raise exception 'Unidad no disponible para revisión';end if;
   if action='reject' and length(btrim(coalesce(payload->>'reason','')))<3 then raise exception 'Escribe el motivo';end if;
   update arka_change_units set status=case when action='approve' then 'approved' else 'rejected' end,
    approved_at=case when action='approve' then now() else null end,reason=coalesce(payload->>'reason','') where id=unit.id;
  elsif action='problem' then
   if unit.status not in('assigned','rejected') or length(btrim(coalesce(payload->>'reason','')))<3 then raise exception 'Indica el problema de esta cuenta';end if;
   update arka_change_units set status='blocked',reason=payload->>'reason' where id=unit.id;
   insert into arka_change_notifications(user_id,order_id,unit_id,message) values(o.buyer_id,oid,unit.id,'CAM-'||o.number||' · Cuenta '||unit.position||' de '||o.quantity||': necesita tu respuesta · '||(payload->>'reason'));
  elsif action='correct' then
   if u.role<>'wholesale' or unit.status not in('blocked','refund_requested') then raise exception 'Solo el comprador puede corregir esta incidencia';end if;
   if payload->>'cipher' is null then raise exception 'Faltan los datos corregidos';end if;
   if payload->>'linked_account_id' is not null then
    perform 1 from arka_accounts where id=(payload->>'linked_account_id')::uuid and buyer_id=actor and status='sold' and expires_at>now() for update;
    if not found then raise exception 'Cuenta vinculada no disponible';end if;
    if exists(select 1 from arka_change_units cu join arka_change_orders co on co.id=cu.order_id where cu.id<>unit.id and cu.linked_account_id=(payload->>'linked_account_id')::uuid and co.status not in('delivered','cancelled','expired') and cu.status<>'cancelled') then raise exception 'Esta cuenta ya tiene otro cambio pendiente';end if;
   end if;
    update arka_change_secrets set original_cipher=payload->>'cipher',result_cipher=null,suggestion_cipher=payload->>'suggestion_cipher',requested_cipher=payload->>'requested_cipher' where unit_id=unit.id;
    update arka_change_units set status='assigned',accepted_at=null,source_fingerprint=payload->>'fingerprint',linked_account_id=null,result_fingerprint=null,reason='' where id=unit.id;
   insert into arka_change_notifications(user_id,order_id,unit_id,message) values(unit.worker_id,oid,unit.id,'El mayorista corrigió o sustituyó la cuenta. Puedes reintentar.');
  elsif action='refund_request' then
   if u.role<>'wholesale' or unit.status<>'blocked' then raise exception 'Primero debe existir una incidencia';end if;
    perform arka_wallet_move(o.buyer_id,'unit-refund:'||unit.id,o.unit_cents,oid,'Devolución elegida de unidad '||unit.position||' de CAM-'||o.number);
    update arka_change_units set status='cancelled',refunded_at=now() where id=unit.id;
    delete from arka_change_secrets where unit_id=unit.id;
    insert into arka_change_notifications(user_id,order_id,message) values(o.buyer_id,oid,'La unidad fue cancelada y su importe fue devuelto a tu saldo interno.');
  elsif action='refund_reject' then
   if u.role<>'admin' or unit.status<>'refund_requested' or length(btrim(coalesce(payload->>'reason','')))<3 then raise exception 'Solicitud o motivo no válido';end if;
   update arka_change_units set status='blocked',reason=payload->>'reason' where id=unit.id;
   insert into arka_change_notifications(user_id,order_id,unit_id,message) values(o.buyer_id,oid,unit.id,'Solicitud de devolución rechazada: '||(payload->>'reason'));
  elsif action='refund_approve' then
   if u.role<>'admin' or unit.status not in('blocked','refund_requested') then raise exception 'Solo se cancelan unidades con incidencia no completadas';end if;
   perform arka_wallet_move(o.buyer_id,'unit-refund:'||unit.id,o.unit_cents,oid,'Devolución de unidad '||unit.position||' de CAM-'||o.number);
   update arka_change_units set status='cancelled',refunded_at=now(),reason=coalesce(payload->>'reason',reason) where id=unit.id;
   delete from arka_change_secrets where unit_id=unit.id;
  else raise exception 'Operación no válida';end if;
 end if;
 insert into arka_change_history(order_id,unit_id,actor_id,action) values(oid,unit.id,actor,action);
  if (action in('approve','refund_approve') and u.role='admin' or action='refund_request' and u.role='wholesale')
  and exists(select 1 from arka_change_orders where id=oid and status='processing')
  and not exists(select 1 from arka_change_units where order_id=oid and (status not in('approved','cancelled') or (status='cancelled' and refunded_at is null))) then
  return arka_changes(actor,'deliver',jsonb_build_object('id',oid));
 end if;
 return jsonb_build_object('ok',true,'id',oid);
end $$;

create or replace function public.arka_finance_command(actor uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare available bigint;amount bigint;r record;rate int;reserve_amount bigint;begin
 if not exists(select 1 from arka_users where id=actor and role='admin' and active and deleted_at is null) then raise exception 'Solo administrador';end if;
 perform pg_advisory_xact_lock(782742119);
 if action='settings' then
  rate:=(payload->>'reserve_bps')::int;
  if rate is null or rate not between 0 and 10000 then raise exception 'Elige expresamente un porcentaje de reserva entre 0 y 100';end if;
  update arka_finance_settings set reserve_bps=rate,pending_hours=(payload->>'pending_hours')::int,unpaid_retention_days=(payload->>'unpaid_retention_days')::int where id=1;
  for r in select * from arka_sales where monthly and reserve_bps is null and cost_cents is not null for update loop
   reserve_amount:=(greatest(r.unit_cents-r.cost_cents,0)*rate+5000)/10000;
   if reserve_amount>0 then
    insert into arka_finance(event_key,kind,amount_cents,reference_id,description) values('stock-reserve:'||r.account_id,'reserve',reserve_amount,r.order_id,'Reserva configurada para ganancia mensual pendiente') on conflict do nothing;
    insert into arka_finance(event_key,kind,amount_cents,reference_id,description) values('stock-reserve-adjust:'||r.account_id,'adjustment',-reserve_amount,r.order_id,'Separación de reserva; no es un gasto adicional') on conflict do nothing;
   end if;
   update arka_sales set reserve_bps=rate where account_id=r.account_id;
  end loop;
 elsif action='withdraw' then
  if exists(select 1 from arka_sales where monthly and reserve_bps is null and cost_cents is not null) then raise exception 'Configura primero la reserva de garantía; no se aplicó un porcentaje silenciosamente';end if;
  select coalesce(sum(amount_cents),0) into available from arka_finance where kind not in('reserve','reserve_use');
  amount:=(payload->>'amount_cents')::bigint;
  if amount<=0 or amount>available then raise exception 'El importe supera tu saldo disponible';end if;
  insert into arka_finance(event_key,kind,amount_cents,user_id,description)
   values('owner-withdraw:'||(payload->>'request_id'),'withdrawal',-amount,actor,'Retiro registrado; sin transferencia automática') on conflict do nothing;
 elsif action='reserve_refund' then
  select coalesce(sum(amount_cents),0) into available from arka_finance where kind in('reserve','reserve_use');
  select * into r from arka_orders where id=(payload->>'order_id')::uuid and status='delivered';
  if not found or not exists(select 1 from arka_sales where order_id=r.id and monthly) then raise exception 'Selecciona una venta mensual entregada';end if;
  amount:=(payload->>'amount_cents')::bigint;
  if amount<=0 or amount>available or amount>r.total_cents then raise exception 'Importe o reserva insuficiente';end if;
  if exists(select 1 from arka_wallet where event_key='guarantee-refund:'||(payload->>'request_id')) then return '{"ok":true}';end if;
  if amount+coalesce((select sum(amount_cents) from arka_wallet where reference_id=r.id and event_key like 'guarantee-refund:%'),0)>r.total_cents then raise exception 'Las devoluciones superan lo pagado';end if;
  perform arka_wallet_move(r.buyer_id,'guarantee-refund:'||(payload->>'request_id'),amount,r.id,'Devolución de garantía aprobada por administrador');
  insert into arka_finance(event_key,kind,amount_cents,reference_id,description) values('reserve-use:'||(payload->>'request_id'),'reserve_use',-amount,r.id,'Reserva utilizada para devolución al saldo');
 else raise exception 'Operación no válida';end if;return '{"ok":true}';
end $$;

create or replace function public.arka_services_maintenance() returns jsonb language plpgsql security definer set search_path=public as $$
declare o arka_change_orders;settings arka_finance_settings;n int:=0;begin
 select * into settings from arka_finance_settings where id=1;
 for o in select * from arka_change_orders where status='pending' and created_at<now()-make_interval(hours=>settings.pending_hours) for update skip locked loop
  perform arka_wallet_move(o.buyer_id,'change-cancel:'||o.id,o.credit_cents,o.id,'Saldo liberado por vencimiento');
  update arka_change_orders set status='expired',request_cipher=null where id=o.id;
  delete from arka_change_secrets where unit_id in(select id from arka_change_units where order_id=o.id);
  update arka_change_units set status='cancelled' where order_id=o.id;
 end loop;
 for o in select * from arka_change_orders where status='delivered' and access_until<=now() and purged_at is null for update skip locked loop
  delete from arka_change_secrets where unit_id in(select id from arka_change_units where order_id=o.id);
  update arka_change_units set source_fingerprint=id::text,result_fingerprint=null,reason='',linked_account_id=null where order_id=o.id;
  update arka_change_orders set purged_at=now(),request_cipher=null,sender=null,transaction_code=null where id=o.id;
  delete from arka_change_history where order_id=o.id;
  delete from arka_change_notifications where order_id=o.id;n:=n+1;
 end loop;
 -- Old events are not another permanent copy of credentials.
 update arka_events set previous_cipher=null where previous_cipher is not null and created_at<now()-interval '7 days'
  and not exists(select 1 from arka_reports where account_id=arka_events.account_id and status in('open','escalated'));
 delete from arka_change_notifications where read_at<now()-interval '30 days';
 -- Keep monetary summaries; remove personal input and abandoned unit details after the visible retention period.
 for o in select * from arka_change_orders where status in('expired','cancelled') and created_at<now()-make_interval(days=>settings.unpaid_retention_days) and purged_at is null for update skip locked loop
  delete from arka_change_secrets where unit_id in(select id from arka_change_units where order_id=o.id);
  update arka_change_units set source_fingerprint=id::text,result_fingerprint=null,linked_account_id=null,reason='' where order_id=o.id;
  update arka_change_orders set request_cipher=null,sender=null,transaction_code=null,purged_at=now() where id=o.id;
 end loop;
 return jsonb_build_object('purged_change_orders',n);
end $$;
create or replace function public.arka_storage_stats() returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('used_bytes',pg_database_size(current_database()),'limit_bytes',storage_bytes,'measured_at',now()) from arka_finance_settings where id=1
$$;
do $$ declare r record;begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and
 proname in('arka_wallet_move','arka_production_fee','arka_book_stock','arka_order_finance_trigger','arka_command_original','arka_command','arka_changes','arka_finance_command','arka_services_maintenance','arka_storage_stats') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 execute format('grant execute on function %s to service_role',r.signature);
end loop;end $$;
notify pgrst,'reload schema';
