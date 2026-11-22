\set ON_ERROR_STOP on
begin;
do $$
declare admin uuid;worker uuid;buyer uuid;p uuid;a uuid;ass uuid;o uuid;r uuid;before_balance bigint;begin
 insert into arka_users(email,name,password_hash,role) values('notice-admin@example.invalid','Admin','test','admin') returning id into admin;
 insert into arka_users(email,name,password_hash,role) values('notice-worker@example.invalid','Worker','test','worker') returning id into worker;
 insert into arka_users(email,name,password_hash,role) values('notice-buyer@example.invalid','Buyer','test','wholesale') returning id into buyer;
 insert into arka_products(name,price_cents,duration_months,mode) values('NOTICE TEST',25,6,'duration') returning id into p;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents) values(worker,p,1,20) returning id into ass;
 if not exists(select 1 from arka_change_notifications where user_id=worker and target_type='assignment' and target_id=ass) then raise exception 'Missing assignment notification';end if;
 insert into arka_orders(buyer_id,total_cents) values(buyer,25) returning id into o;
 if not exists(select 1 from arka_change_notifications where user_id=admin and target_type='stock_order' and target_id=o) then raise exception 'Missing new order notification';end if;
 insert into arka_items(order_id,product_id,quantity,unit_cents,product_name) values(o,p,1,25,'NOTICE TEST');
 insert into arka_accounts(product_id,worker_id,assignment_id,cipher,email_fingerprint,status,paid,order_id,buyer_id,delivered_at,expires_at) values(p,worker,ass,'encrypted-test-payload','notice-test','sold',true,o,buyer,now(),now()+interval '6 months') returning id into a;
 insert into arka_reports(account_id,buyer_id,worker_id,problem) values(a,buyer,worker,'Prueba de aviso') returning id into r;
 if not exists(select 1 from arka_change_notifications where user_id=worker and target_type='report' and target_id=r) then raise exception 'Missing worker report notification';end if;
 update arka_reports set status='escalated' where id=r;
 if not exists(select 1 from arka_change_notifications where user_id=admin and target_type='report' and target_id=r) then raise exception 'Missing escalated report notification';end if;
 update arka_reports set status='resolved' where id=r;
 update arka_orders set status='review' where id=o;
 update arka_orders set status='delivered',paid_cents=25,delivered_at=now() where id=o;
 if not exists(select 1 from arka_receipts where reference_id=o) then raise exception 'Receipt missing before cleanup';end if;
 select balance_cents into before_balance from arka_users where id=worker;
 begin perform arka_delete_test_sale(worker,o,'ELIMINAR');raise exception 'TEST: Worker deleted a sale';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 begin perform arka_delete_test_sale(admin,o,'');raise exception 'TEST: Sale deleted without confirmation';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform arka_delete_test_sale(admin,o,'ELIMINAR');
 if exists(select 1 from arka_orders where id=o) or exists(select 1 from arka_receipts where reference_id=o) or exists(select 1 from arka_sales where order_id=o) or exists(select 1 from arka_finance where reference_id=o) then raise exception 'Test sale still contributes to earnings';end if;
 if (select balance_cents from arka_users where id=worker)<>before_balance then raise exception 'Sale cleanup changed worker balance';end if;
 if not exists(select 1 from arka_cleanup_archive where run_key='test-sale:'||o and kind='completed') then raise exception 'Private recovery copy missing';end if;
 perform arka_delete_test_sale(admin,o,'ELIMINAR');
end $$;
rollback;
\echo NOTIFICATIONS_AND_SALE_CLEANUP_OK
