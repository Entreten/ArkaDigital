\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'TEST: %',message;end if;end$$;
do $$
declare admin uuid;worker uuid;other_worker uuid;buyer uuid;product uuid;domain_product uuid;bank uuid;assignment uuid;offer uuid;oid uuid;uid uuid;uid2 uuid;
result jsonb;before_balance bigint;account_id uuid;stock_order uuid;fee bigint;
begin
 insert into arka_users(email,name,password_hash,role) values('test-admin@example.invalid','Admin','test','admin') returning id into admin;
 insert into arka_users(email,name,password_hash,role) values('test-worker@example.invalid','Worker','test','worker') returning id into worker;
 insert into arka_users(email,name,password_hash,role) values('test-other@example.invalid','Other','test','worker') returning id into other_worker;
 insert into arka_users(email,name,password_hash,role) values('test-buyer@example.invalid','Buyer','test','wholesale') returning id into buyer;
 insert into arka_products(name,price_cents,duration_months,mode) values('TEST MONTHLY',25,6,'duration') returning id into product;
 insert into arka_products(name,price_cents,duration_months,mode) values('TEST DOMAIN',25,0,'domain') returning id into domain_product;
 insert into arka_banks(bank,holder,account_number) values('TEST BANK','TEST','TEST') returning id into bank;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents,terms_version,commission_bps) values(worker,product,100,20,1,300) returning id into assignment;
 begin
  perform arka_command(worker,'submit_accounts',jsonb_build_object('assignment_id',assignment,'accounts',jsonb_build_array(jsonb_build_object('cipher','not-real','fingerprint','before-accept'))));
  raise exception 'TEST: allowed production without acceptance';
 exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform arka_command(worker,'accept_assignment',jsonb_build_object('id',assignment));
 for i in 1..100 loop
  perform arka_command(worker,'submit_accounts',jsonb_build_object('assignment_id',assignment,'accounts',jsonb_build_array(jsonb_build_object('cipher','not-real','fingerprint','production-'||i))));
  select id into account_id from arka_accounts where email_fingerprint='production-'||i;
  perform arka_command(admin,'review_account',jsonb_build_object('id',account_id,'decision','approve'));
 end loop;
 perform pg_temp.assert_ok((select balance_cents=1940 from arka_users where id=worker),'worker net must be 1940');
 perform pg_temp.assert_ok((select sum(amount_cents)=60 from arka_finance where kind='commission'),'commission must total 60');
 perform pg_temp.assert_ok((select sum(amount_cents)=1940 from arka_ledger where worker_id=worker),'worker ledger reconciles');
 result:=arka_command(buyer,'checkout',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',1))));
 stock_order:=(result->>'id')::uuid;
 perform arka_command(buyer,'payment',jsonb_build_object('id',stock_order,'bank_id',bank,'sender','TEST','transaction_code','test-code','payment_date',current_date,'paid_cents',25));
 perform arka_command(admin,'approve_order',jsonb_build_object('id',stock_order));
 perform pg_temp.assert_ok((select count(*)=1 from arka_sales where order_id=stock_order),'stock sale is snapshotted');
 -- Create a modification order without involving inventory.
 insert into arka_change_offers(name,mode,price_cents,margin_cents,workers) values('TEST CHANGE','password',25,5,array[worker,other_worker]) returning id into offer;
 result:=arka_changes(buyer,'create',jsonb_build_object('offer_id',offer,'acknowledged',true,'request_cipher','not-real',
  'accounts',jsonb_build_array(jsonb_build_object('cipher','original1','fingerprint','external1','suggestion_cipher','suggest1'),jsonb_build_object('cipher','original2','fingerprint','external2','suggestion_cipher','suggest2'))));
 oid:=(result->>'id')::uuid;
 select id into uid from arka_change_units where order_id=oid and position=1;
 select id into uid2 from arka_change_units where order_id=oid and position=2;
 perform arka_changes(buyer,'payment',jsonb_build_object('id',oid,'bank_id',bank,'sender','TEST','transaction_code','code','payment_date',current_date,'paid_cents',50));
 perform arka_changes(admin,'verify_payment',jsonb_build_object('id',oid));
 perform arka_changes(admin,'assign',jsonb_build_object('id',oid,'due_at',now()+interval '1 day','allocations',jsonb_build_array(jsonb_build_object('worker_id',worker,'quantity',1),jsonb_build_object('worker_id',admin,'quantity',1))));
 perform pg_temp.assert_ok((select worker_id=worker from arka_change_units where id=uid),'worker assignment');
 perform pg_temp.assert_ok((select worker_id=admin from arka_change_units where id=uid2),'admin assignment');
 perform arka_changes(worker,'accept',jsonb_build_object('id',uid));
 perform arka_changes(worker,'submit',jsonb_build_object('id',uid,'cipher','result1','fingerprint','resultfp1'));
 perform arka_changes(admin,'reject',jsonb_build_object('id',uid,'reason','Corregir dato'));
 perform arka_changes(worker,'submit',jsonb_build_object('id',uid,'cipher','result1','fingerprint','resultfp1'));
 perform arka_changes(admin,'approve',jsonb_build_object('id',uid));
 select balance_cents into before_balance from arka_users where id=worker;
 begin
  perform arka_changes(admin,'deliver',jsonb_build_object('id',oid));raise exception 'TEST: premature delivery';
 exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform arka_changes(admin,'accept',jsonb_build_object('id',uid2));
 perform arka_changes(admin,'submit',jsonb_build_object('id',uid2,'cipher','result2','fingerprint','resultfp2'));
 perform pg_temp.assert_ok((select balance_cents=before_balance from arka_users where id=worker),'no service credit before complete delivery');
 perform arka_changes(admin,'approve',jsonb_build_object('id',uid2));
 perform pg_temp.assert_ok((select status='delivered' from arka_change_orders where id=oid),'last approval auto-delivers the full order');
 perform pg_temp.assert_ok((select balance_cents=before_balance+20 from arka_users where id=worker),'service pays 20 without 3 percent');
 perform pg_temp.assert_ok((select sum(amount_cents)=20 from arka_finance where kind='own'),'admin own labor paid separately');
 perform pg_temp.assert_ok((select sum(amount_cents)=10 from arka_finance where event_key='change-margin:'||oid),'commercial part for both units');
 perform pg_temp.assert_ok((select count(*)=100 from arka_accounts),'external service did not enter stock');
 perform pg_temp.assert_ok(not exists(select 1 from arka_change_secrets where unit_id in(uid,uid2) and original_cipher is not null),'originals removed at delivery');
 perform pg_temp.assert_ok((select access_until-delivered_at=interval '7 days' from arka_change_orders where id=oid),'exact seven-day window');
 begin perform arka_changes(admin,'deliver',jsonb_build_object('id',oid));raise exception 'TEST: duplicate delivery';
 exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 -- One partial cancellation refunds exactly the snapshotted price, only once.
 result:=arka_changes(buyer,'create',jsonb_build_object('offer_id',offer,'acknowledged',true,'request_cipher','r',
 'accounts',jsonb_build_array(jsonb_build_object('cipher','c','fingerprint','refund1','suggestion_cipher','s'))));
 oid:=(result->>'id')::uuid;select id into uid from arka_change_units where order_id=oid;
 update arka_change_offers set price_cents=100,margin_cents=50,workers='{}' where id=offer;
 perform arka_changes(buyer,'payment',jsonb_build_object('id',oid,'bank_id',bank,'sender','TEST','transaction_code','code2','payment_date',current_date,'paid_cents',25));
 perform arka_changes(admin,'verify_payment',jsonb_build_object('id',oid));
 perform arka_changes(admin,'assign',jsonb_build_object('id',oid,'due_at',now()+interval '1 day','allocations',jsonb_build_array(jsonb_build_object('worker_id',worker,'quantity',1))));
 perform arka_changes(worker,'problem',jsonb_build_object('id',uid,'reason','Sin suscripción'));
 perform arka_changes(buyer,'correct',jsonb_build_object('id',uid,'cipher','corrected','fingerprint','refund1','suggestion_cipher','s'));
 perform arka_changes(worker,'problem',jsonb_build_object('id',uid,'reason','Sigue bloqueada'));
 perform arka_changes(buyer,'refund_request',jsonb_build_object('id',uid));
 perform pg_temp.assert_ok((select credit_cents=25 from arka_users where id=buyer),'exact refund to wallet');
 perform pg_temp.assert_ok((select status='delivered' from arka_change_orders where id=oid),'last cancellation auto-completes refunded order');
 perform pg_temp.assert_ok((select balance_cents=before_balance+20 from arka_users where id=worker),'cancelled work never paid');
 result:=arka_command(buyer,'checkout',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',1))));
 perform pg_temp.assert_ok((select status='delivered' and credit_cents=25 and paid_cents=0 from arka_orders where id=(result->>'id')::uuid),'wallet fully pays and delivers stock');
 perform pg_temp.assert_ok((select credit_cents=0 from arka_users where id=buyer),'wallet cannot be used twice');
 -- Unauthorized workers cannot review, refund, or assign.
 begin perform arka_changes(worker,'assign',jsonb_build_object('id',oid,'allocations','[]'::jsonb));raise exception 'TEST: worker assigned';
 exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 update arka_change_orders set access_until=now()-interval '1 second' where status='delivered';
 perform arka_services_maintenance();
 perform pg_temp.assert_ok(not exists(select 1 from arka_change_secrets s join arka_change_units cu on cu.id=s.unit_id join arka_change_orders co on co.id=cu.order_id where co.status='delivered'),'sensitive service data purged');
 perform pg_temp.assert_ok(exists(select 1 from arka_finance where event_key like 'change-margin:%' and amount_cents=10),'financial history survives purge');
 perform arka_finance_command(admin,'settings','{"reserve_bps":1000,"pending_hours":24,"unpaid_retention_days":30}');
 perform pg_temp.assert_ok((select reserve_bps=1000 from arka_finance_settings where id=1),'reserve explicitly configured');
end $$;
rollback;
\echo SERVICES_SQL_OK
