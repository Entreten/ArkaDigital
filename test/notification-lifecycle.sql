\set ON_ERROR_STOP on
begin;
do $$
declare admin uuid;worker uuid;buyer uuid;p uuid;ass uuid;a uuid;o uuid;r uuid;offer uuid;co uuid;cu uuid;j jsonb;begin
 insert into arka_users(email,name,password_hash,role) values('active-admin@example.invalid','Admin','test','admin') returning id into admin;
 insert into arka_users(email,name,password_hash,role) values('active-worker@example.invalid','Worker','test','worker') returning id into worker;
 insert into arka_users(email,name,password_hash,role) values('active-buyer@example.invalid','Buyer','test','wholesale') returning id into buyer;
 insert into arka_products(name,price_cents,duration_months,mode) values('ACTIVE TEST',25,6,'duration') returning id into p;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents) values(worker,p,1,20) returning id into ass;
 if not exists(select 1 from arka_active_notifications(worker) where target_id=ass) then raise exception 'Missing pending assignment notice';end if;
 insert into arka_accounts(product_id,worker_id,assignment_id,cipher,email_fingerprint,status) values(p,worker,ass,'sealed','active-fp','review') returning id into a;
 if exists(select 1 from arka_active_notifications(worker) where target_id=ass) then raise exception 'Submitted assignment notice did not disappear';end if;
 if not exists(select 1 from arka_active_notifications(admin) where target_type='production' and target_id=ass) then raise exception 'Review notice disappeared too soon';end if;
 update arka_accounts set status='available' where id=a;
 if exists(select 1 from arka_active_notifications(admin) where target_type='production' and target_id=ass) then raise exception 'Reviewed production notice did not disappear';end if;
 insert into arka_orders(buyer_id,total_cents) values(buyer,25) returning id into o;
 if not exists(select 1 from arka_active_notifications(admin) where target_id=o) then raise exception 'New order missing';end if;
 update arka_orders set status='delivered',delivered_at=now() where id=o;
 if exists(select 1 from arka_active_notifications(admin) where target_id=o) then raise exception 'Delivered order still pending for admin';end if;
 if not exists(select 1 from arka_active_notifications(buyer) where target_id=o) then raise exception 'Buyer delivery confirmation missing';end if;
 update arka_change_notifications set read_at=now() where user_id=buyer;
 if exists(select 1 from arka_active_notifications(buyer)) then raise exception 'Read completion still shown';end if;
 insert into arka_reports(account_id,buyer_id,worker_id,problem) values(a,buyer,worker,'Prueba') returning id into r;
 if not exists(select 1 from arka_active_notifications(worker) where target_id=r) then raise exception 'Open report missing';end if;
 update arka_reports set status='escalated' where id=r;
 if exists(select 1 from arka_active_notifications(worker) where target_id=r) then raise exception 'Escalated report still pending for worker';end if;
 if not exists(select 1 from arka_active_notifications(admin) where target_id=r) then raise exception 'Escalation missing for admin';end if;
 update arka_reports set status='resolved',resolved_at=now() where id=r;
 if exists(select 1 from arka_active_notifications(admin) where target_id=r) then raise exception 'Resolved report still pending';end if;
 insert into arka_change_offers(name,mode,price_cents,margin_cents,workers) values('ACTIVE PASSWORD','password',25,5,array[admin]) returning id into offer;
 j:=arka_changes(buyer,'create',jsonb_build_object('offer_id',offer,'request_cipher','sealed','acknowledged',true,'accounts',jsonb_build_array(jsonb_build_object('cipher','sealed','fingerprint','active-change'))));co:=(j->>'id')::uuid;
 update arka_change_orders set status='processing' where id=co;
 -- Offer preselection must never restrict the administrator's paid-order allocation.
 perform arka_changes(admin,'assign',jsonb_build_object('id',co,'due_at',now()+interval '1 day','allocations',jsonb_build_array(jsonb_build_object('worker_id',worker,'quantity',1))));
 select id into cu from arka_change_units where order_id=co;
 if not exists(select 1 from arka_active_notifications(worker) where order_id=co) then raise exception 'Assigned service missing';end if;
 perform arka_changes(worker,'accept',jsonb_build_object('id',cu));
 perform arka_changes(worker,'problem',jsonb_build_object('id',cu,'reason','No inicia sesión'));
 if exists(select 1 from arka_active_notifications(worker) where order_id=co) then raise exception 'Reported problem still pending for worker';end if;
 if not exists(select 1 from arka_active_notifications(buyer) where unit_id=cu) then raise exception 'Buyer problem missing';end if;
 perform arka_changes(buyer,'correct',jsonb_build_object('id',cu,'cipher','sealed-replacement','fingerprint','active-replacement'));
 if exists(select 1 from arka_active_notifications(buyer) where unit_id=cu) then raise exception 'Responded problem still pending for buyer';end if;
 perform arka_changes(worker,'accept',jsonb_build_object('id',cu));
 perform arka_changes(worker,'submit',jsonb_build_object('id',cu,'cipher','sealed-result','fingerprint','active-final'));
 if exists(select 1 from arka_active_notifications(worker) where order_id=co) then raise exception 'Submitted service still pending for worker';end if;
 if not exists(select 1 from arka_active_notifications(admin) where order_id=co and event_key like 'change-review:%') then raise exception 'Service review missing';end if;
 perform arka_changes(admin,'approve',jsonb_build_object('id',cu));
 if exists(select 1 from arka_active_notifications(admin) where order_id=co) then raise exception 'Completed service still pending for admin';end if;
 if exists(select 1 from arka_active_notifications(worker) where user_id<>worker) then raise exception 'Another user inbox leaked';end if;
end $$;
rollback;
\echo NOTIFICATION_LIFECYCLE_OK
