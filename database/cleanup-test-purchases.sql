begin;
create table if not exists public.arka_cleanup_archive(
 run_key text not null,kind text not null,record_key text not null,data jsonb not null,
 created_at timestamptz not null default now(),primary key(run_key,kind,record_key));
alter table arka_cleanup_archive enable row level security;
revoke all on arka_cleanup_archive from public,anon,authenticated;
grant all on arka_cleanup_archive to service_role;
do $$
declare
 run constant text:='remove-confirmed-juan-tests-20261122';
 targets constant uuid[]:=array['53bc1699-8bc3-461c-ab37-18350c65f20a','0e8e9a1b-b68b-4c9a-8776-7c1347993d8c','bff72612-5ff8-47d2-9d64-b4d68d7ae8de']::uuid[];
 official constant uuid:='a06e0976-ff01-4edb-9b79-ede6f6915a69';
 accounts uuid[];assignments uuid[];withdrawal uuid;withdrawal_worker uuid;worker record;cost record;
 initial_official text;final_official text;delta bigint;old_fee bigint;new_fee bigint;base_so_far bigint;fee_so_far bigint;
begin
 perform pg_advisory_xact_lock(782742120);
 if exists(select 1 from arka_cleanup_archive where run_key=run and kind='completed') then return;end if;
 perform 1 from arka_orders where id=any(targets) or id=official for update;
 if (select count(*) from arka_orders o join arka_users u on u.id=o.buyer_id where o.id=any(targets) and lower(u.name) like '%juan%' and o.status='delivered')<>3
 or (select sum(total_cents) from arka_orders where id=any(targets))<>1300
 or (select sum(quantity) from arka_items where order_id=any(targets))<>4 then
  raise exception 'Los registros de prueba cambiaron. No se borra nada.';
 end if;
 if not exists(select 1 from arka_orders o join arka_users u on u.id=o.buyer_id where o.id=official and o.status='delivered' and o.total_cents=600 and translate(lower(u.name),'áéíóúüñ','aeiouun') like '%jose%fernandez%')
 or (select sum(quantity) from arka_items where order_id=official)<>6 then raise exception 'No coincide la compra oficial; limpieza cancelada';end if;
 select md5(string_agg(row_to_json(a)::text,'' order by a.id)) into initial_official from arka_accounts a where order_id=official;
 select array_agg(id),array_agg(distinct assignment_id) into accounts,assignments from arka_accounts where order_id=any(targets);
 if coalesce(array_length(accounts,1),0)<>4 then raise exception 'No coinciden las cuatro cuentas de prueba';end if;
 if exists(select 1 from arka_reports where account_id=any(accounts) and status in('open','escalated'))
 or exists(select 1 from arka_change_units where linked_account_id=any(accounts)) then raise exception 'Hay dependencias activas; no se borra nada';end if;
 if (select count(*) from arka_withdrawals where status='paid')<>1
 or (select sum(amount_cents) from arka_withdrawals where status='paid')<>1000 then raise exception 'El retiro confirmado no coincide; no se ajustan saldos';end if;
 select id,worker_id into withdrawal,withdrawal_worker from arka_withdrawals where status='paid' and amount_cents=1000 for update;
 if not exists(select 1 from arka_costs where account_id=any(accounts) and worker_id=withdrawal_worker) then raise exception 'El retiro no corresponde a la producción de prueba';end if;
 -- Private archive contains encrypted account payloads, not plaintext passwords.
 insert into arka_cleanup_archive select run,'orders',o.id::text,to_jsonb(o),now() from arka_orders o where o.id=any(targets);
 insert into arka_cleanup_archive select run,'items',i.id::text,to_jsonb(i),now() from arka_items i where i.order_id=any(targets);
 insert into arka_cleanup_archive select run,'accounts',a.id::text,to_jsonb(a),now() from arka_accounts a where a.id=any(accounts);
 insert into arka_cleanup_archive select run,'assignments',s.id::text,to_jsonb(s),now() from arka_assignments s where s.id=any(assignments);
 insert into arka_cleanup_archive select run,'costs',c.account_id::text,to_jsonb(c),now() from arka_costs c where c.account_id=any(accounts);
 insert into arka_cleanup_archive select run,'ledger',l.id::text,to_jsonb(l),now() from arka_ledger l where l.reference_id=any(accounts) or l.reference_id=withdrawal;
 insert into arka_cleanup_archive select run,'withdrawal',w.id::text,to_jsonb(w),now() from arka_withdrawals w where w.id=withdrawal;
 insert into arka_cleanup_archive select run,'finance',f.id::text,to_jsonb(f),now() from arka_finance f where f.reference_id=any(targets) or f.reference_id=any(accounts)
 or exists(select 1 from unnest(accounts) as target_id where f.event_key in('stock-reserve:'||target_id,'stock-reserve-adjust:'||target_id));
 insert into arka_cleanup_archive select run,'sales',s.account_id::text,to_jsonb(s),now() from arka_sales s where s.order_id=any(targets);
 insert into arka_cleanup_archive select run,'receipts',r.reference_id::text,to_jsonb(r),now() from arka_receipts r where r.reference_id=any(targets);
 for worker in select distinct worker_id id from arka_costs where account_id=any(accounts) and worker_id is not null loop
  perform 1 from arka_users where id=worker.id for update;
  insert into arka_cleanup_archive(run_key,kind,record_key,data)
   select run,'worker_balance',id::text,jsonb_build_object('balance_cents',balance_cents,'reserved_cents',reserved_cents) from arka_users where id=worker.id;
  select coalesce(sum(amount_cents),0) into delta from arka_ledger where worker_id=worker.id and (reference_id=any(accounts) or reference_id=withdrawal);
  if exists(select 1 from arka_users where id=worker.id and balance_cents-delta<reserved_cents) then raise exception 'El ajuste dejaría saldo negativo o afectaría retiros reales; no se modifica nada';end if;
  update arka_users set balance_cents=balance_cents-delta where id=worker.id;
 end loop;
 delete from arka_finance f where f.reference_id=any(targets) or f.reference_id=any(accounts)
 or exists(select 1 from unnest(accounts) as target_id where f.event_key in('stock-reserve:'||target_id,'stock-reserve-adjust:'||target_id));
 delete from arka_receipts where reference_id=any(targets);
 delete from arka_sales where order_id=any(targets);
 delete from arka_ledger where reference_id=any(accounts) or reference_id=withdrawal;
 delete from arka_withdrawals where id=withdrawal;
 delete from arka_costs where account_id=any(accounts);
 delete from arka_events where account_id=any(accounts);
 delete from arka_reports where account_id=any(accounts);
 delete from arka_accounts where id=any(accounts);
 delete from arka_items where order_id=any(targets);
 delete from arka_change_notifications where order_id=any(targets) or target_id=any(targets);
 delete from arka_orders where id=any(targets);
 for worker in select s.id,count(a.id)::int remaining from arka_assignments s left join arka_accounts a on a.assignment_id=s.id where s.id=any(assignments) group by s.id loop
  if worker.remaining=0 then delete from arka_assignments where id=worker.id;
  else
   select count(*) into delta from arka_cleanup_archive where run_key=run and kind='accounts' and data->>'assignment_id'=worker.id::text;
   update arka_assignments set quantity=greatest(worker.remaining,quantity-delta::int,1) where id=worker.id;
  end if;
 end loop;
 -- If removal changes cumulative cent rounding within a shared assignment, reconcile it once.
 for worker in select distinct assignment_id id from arka_costs where assignment_id=any(assignments) loop
  base_so_far:=0;fee_so_far:=0;
  for cost in select c.* from arka_costs c join arka_assignments s on s.id=c.assignment_id where c.assignment_id=worker.id and not c.own and s.commission_bps=300 order by c.created_at,c.account_id loop
   base_so_far:=base_so_far+cost.base_cents;new_fee:=(base_so_far*3+50)/100-fee_so_far;fee_so_far:=fee_so_far+new_fee;old_fee:=cost.fee_cents;
   if cost.fee_state='applied' and old_fee<>new_fee then
    delta:=old_fee-new_fee;
    if exists(select 1 from arka_users where id=cost.worker_id and balance_cents+delta<reserved_cents) then raise exception 'La conciliación afectaría un saldo reservado';end if;
    update arka_users set balance_cents=balance_cents+delta where id=cost.worker_id;
    insert into arka_ledger(worker_id,amount_cents,kind,reference_id,note) values(cost.worker_id,delta,'test_cleanup_rounding',cost.account_id,'Conciliación de centavos tras retirar pruebas');
    insert into arka_finance(event_key,kind,amount_cents,reference_id,user_id,description) values(run||':'||cost.account_id,'commission',-delta,cost.account_id,cost.worker_id,'Conciliación tras retirar ventas de prueba');
   end if;
   update arka_costs set fee_cents=new_fee where account_id=cost.account_id;
  end loop;
 end loop;
 select md5(string_agg(row_to_json(a)::text,'' order by a.id)) into final_official from arka_accounts a where order_id=official;
 if initial_official is distinct from final_official then raise exception 'La compra oficial sufrió una modificación; se revierte toda la limpieza';end if;
 if exists(select 1 from arka_users where balance_cents<reserved_cents or balance_cents<0) then raise exception 'Saldo inválido; todo revertido';end if;
 insert into arka_cleanup_archive(run_key,kind,record_key,data) values(run,'completed','summary','{"removed_test_orders":3,"removed_test_accounts":4,"removed_test_sales_cents":1300,"removed_test_withdrawal_cents":1000,"official_orders_preserved":1,"official_accounts_preserved":6}');
end $$;
select data as cleanup_summary from arka_cleanup_archive where run_key='remove-confirmed-juan-tests-20261122' and kind='completed';
commit;
