\set ON_ERROR_STOP on
begin;
-- Simulate payments made by the previous release, without today's commission trigger.
alter table arka_ledger disable trigger arka_production_fee_trigger;
do $$declare w uuid;empty_worker uuid;p uuid;s uuid;empty_s uuid;a uuid;begin
 insert into arka_users(email,name,password_hash,role,balance_cents) values('history-worker@example.invalid','Historical','test','worker',2000) returning id into w;
 insert into arka_users(email,name,password_hash,role,balance_cents) values('history-empty@example.invalid','Historical withdrawn','test','worker',0) returning id into empty_worker;
 insert into arka_products(name,price_cents,duration_months,mode) values('HISTORY PRODUCT',25,6,'duration') returning id into p;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents,terms_version) values(w,p,100,20,0) returning id into s;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents,terms_version) values(empty_worker,p,1,20,0) returning id into empty_s;
 for i in 1..100 loop
  insert into arka_accounts(product_id,worker_id,assignment_id,cipher,email_fingerprint,status,paid) values(p,w,s,'not-real','history-'||i,'available',true) returning id into a;
  insert into arka_ledger(worker_id,amount_cents,kind,reference_id) values(w,20,'production',a);
 end loop;
 insert into arka_accounts(product_id,worker_id,assignment_id,cipher,email_fingerprint,status,paid) values(p,empty_worker,empty_s,'not-real','history-empty','available',true) returning id into a;
 insert into arka_ledger(worker_id,amount_cents,kind,reference_id) values(empty_worker,20,'production',a);
 insert into arka_ledger(worker_id,amount_cents,kind) values(empty_worker,-20,'withdrawal');
end $$;
alter table arka_ledger enable trigger arka_production_fee_trigger;
\ir ../database/services.sql
do $$begin
 if (select balance_cents from arka_users where email='history-worker@example.invalid')<>1940 then raise exception 'Historical fee did not reconcile';end if;
 if (select balance_cents from arka_users where email='history-empty@example.invalid')<>0 then raise exception 'Historical adjustment created debt';end if;
 if (select sum(fee_cents) from arka_costs where fee_state='pending')<>1 then raise exception 'Insufficient balance was not held for review';end if;
end $$;
\ir ../database/services.sql
do $$begin
 if (select balance_cents from arka_users where email='history-worker@example.invalid')<>1940 then raise exception 'Historical fee applied twice';end if;
end $$;
rollback;
\echo HISTORICAL_SQL_OK
