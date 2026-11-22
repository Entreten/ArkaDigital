\set ON_ERROR_STOP on
-- Run only in the isolated CI database. The authorized cleanup script contains its own transaction.
alter table arka_ledger disable trigger arka_production_fee_trigger;
do $$
declare worker uuid;juan uuid;jose uuid;p uuid;ass uuid;a uuid;withdrawal uuid;i int;oid uuid;price int;rate int;fee int;begin
 insert into arka_users(email,name,password_hash,role,balance_cents) values('cleanup-worker@example.invalid','Test worker','test','worker',308) returning id into worker;
 insert into arka_users(email,name,password_hash,role) values('cleanup-juan@example.invalid','Juan','test','wholesale') returning id into juan;
 insert into arka_users(email,name,password_hash,role) values('cleanup-jose@example.invalid','Jose Fernandez','test','wholesale') returning id into jose;
 insert into arka_products(name,price_cents,duration_months,mode) values('CLEANUP TEST PRODUCT',100,6,'duration') returning id into p;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents,terms_version,commission_bps) values(worker,p,10,50,0,300) returning id into ass;
 for i in 1..4 loop
  oid:=(array['53bc1699-8bc3-461c-ab37-18350c65f20a','0e8e9a1b-b68b-4c9a-8776-7c1347993d8c','bff72612-5ff8-47d2-9d64-b4d68d7ae8de','a06e0976-ff01-4edb-9b79-ede6f6915a69'])[i]::uuid;
  price:=(array[1000,200,100,600])[i];
  insert into arka_orders(id,buyer_id,total_cents,status,paid_cents,delivered_at) values(oid,case when i=4 then jose else juan end,price,'delivered',price,now());
  insert into arka_items(order_id,product_id,quantity,unit_cents,product_name) values(oid,p,(array[1,2,1,6])[i],case when i=1 then 1000 else 100 end,'CLEANUP TEST PRODUCT');
  insert into arka_receipts(reference_id,kind,cash_cents,credit_cents,verified_at) values(oid,'stock',price,0,now());
  for j in 1..(array[1,2,1,6])[i] loop
   rate:=(array[500,250,50,50])[i];
   fee:=case when i=1 then 15 when i=2 then case when j=1 then 8 else 7 end when i=3 then 2 else case when j<=4 then 2 else 1 end end;
   insert into arka_accounts(product_id,worker_id,assignment_id,cipher,email_fingerprint,status,paid,order_id,buyer_id,delivered_at,expires_at)
   values(p,worker,ass,'encrypted-test','cleanup-'||i||'-'||j,'sold',true,oid,case when i=4 then jose else juan end,now(),now()+interval '6 months') returning id into a;
   insert into arka_costs(account_id,assignment_id,worker_id,base_cents,fee_cents,fee_state) values(a,ass,worker,rate,fee,'applied');
   insert into arka_ledger(worker_id,amount_cents,kind,reference_id) values(worker,rate,'production',a),(worker,-fee,'historical_commission',a);
   insert into arka_finance(event_key,kind,amount_cents,reference_id,user_id,description) values('historical:'||a,'commission',fee,a,worker,'TEST');
   insert into arka_sales(account_id,order_id,unit_cents,cost_cents,monthly,reserve_bps,created_at) values(a,oid,case when i=1 then 1000 else 100 end,rate,true,null,now());
  end loop;
 end loop;
 insert into arka_withdrawals(worker_id,amount_cents,bank,account_number,holder,status) values(worker,1000,'TEST','TEST','TEST','paid') returning id into withdrawal;
 insert into arka_ledger(worker_id,amount_cents,kind,reference_id) values(worker,-1000,'withdrawal',withdrawal);
end $$;
alter table arka_ledger enable trigger arka_production_fee_trigger;
\ir ../database/cleanup-test-purchases.sql
\ir ../database/cleanup-test-purchases.sql
do $$begin
 if (select count(*) from arka_orders)<>1 then raise exception 'Did not preserve exactly the official order';end if;
 if (select count(*) from arka_accounts)<>6 then raise exception 'Did not preserve six official accounts';end if;
 if exists(select 1 from arka_withdrawals) then raise exception 'Test withdrawal still present';end if;
 if (select sum(cash_cents) from arka_receipts)<>600 then raise exception 'Test receipts still counted';end if;
 if (select sum(balance_cents) from arka_users where role='worker')<>291 then raise exception 'Worker balance did not reconcile to official net';end if;
 if (select sum(amount_cents) from arka_finance where kind='commission')<>9 then raise exception 'Official commission is wrong';end if;
end $$;
\echo HISTORICAL_TEST_CLEANUP_OK
