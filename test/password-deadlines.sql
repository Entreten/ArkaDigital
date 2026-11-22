\set ON_ERROR_STOP on
begin;
do $$
declare admin uuid;worker uuid;buyer uuid;p uuid;ass uuid;a uuid;offer uuid;o uuid;u1 uuid;u2 uuid;r uuid;j jsonb;begin
 insert into arka_users(email,name,password_hash,role) values('deadline-admin@example.invalid','Admin','test','admin') returning id into admin;
 insert into arka_users(email,name,password_hash,role) values('deadline-worker@example.invalid','Worker','test','worker') returning id into worker;
 insert into arka_users(email,name,password_hash,role) values('deadline-buyer@example.invalid','Buyer','test','wholesale') returning id into buyer;
 insert into arka_products(name,price_cents,duration_months,mode) values('DEADLINE TEST',25,6,'duration') returning id into p;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents,due_at) values(worker,p,1,20,now()+interval '1 day') returning id into ass;
 begin perform arka_set_work_deadline(worker,'production',ass,now()+interval '2 days');raise exception 'TEST: worker changed deadline';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 begin perform arka_set_work_deadline(admin,'production',ass,now()-interval '1 day');raise exception 'TEST: accepted past deadline';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform arka_set_work_deadline(admin,'production',ass,now()+interval '2 days');
 if not exists(select 1 from arka_change_notifications where user_id=worker and target_id=ass) then raise exception 'TEST: no deadline notification';end if;
 insert into arka_accounts(product_id,worker_id,assignment_id,cipher,email_fingerprint,status) values(p,worker,ass,'sealed-original','deadline-fp','review') returning id into a;
 if not exists(select 1 from arka_assignments where id=ass and work_submitted_at is not null) then raise exception 'TEST: countdown did not freeze at submission';end if;
 update arka_accounts set status='rejected' where id=a;
 if not exists(select 1 from arka_assignments where id=ass and work_submitted_at is null) then raise exception 'TEST: rejected work still considered finished';end if;
 update arka_assignments set due_at=now()-interval '1 minute' where id=ass;
 update arka_accounts set status='review' where id=a;
 if not exists(select 1 from arka_assignments where id=ass and work_submitted_at>due_at) then raise exception 'TEST: late submission was blocked or misreported';end if;
 insert into arka_reports(account_id,buyer_id,worker_id,problem) values(a,buyer,worker,'Prueba de garantía') returning id into r;
 perform arka_set_work_deadline(admin,'report',r,now()+interval '3 hours');
 if not exists(select 1 from arka_reports where id=r and due_at is not null) then raise exception 'TEST: report deadline missing';end if;
 insert into arka_change_offers(name,mode,price_cents,margin_cents) values('PASSWORD TEST','password',25,5) returning id into offer;
 j:=arka_changes(buyer,'create',jsonb_build_object('offer_id',offer,'request_cipher','sealed-order','acknowledged',true,'accounts',jsonb_build_array(
 jsonb_build_object('cipher','sealed-original-a','fingerprint','password-a','requested_cipher','sealed-different-request-a'),
 jsonb_build_object('cipher','sealed-original-b','fingerprint','password-b','requested_cipher','sealed-different-request-b'))));o:=(j->>'id')::uuid;
 update arka_change_orders set status='processing',verified_at=now() where id=o;
 begin perform arka_changes(admin,'assign',jsonb_build_object('id',o,'allocations',jsonb_build_array(jsonb_build_object('worker_id',worker,'quantity',2))));raise exception 'TEST: assignment without deadline';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform arka_changes(admin,'assign',jsonb_build_object('id',o,'due_at',now()+interval '4 hours','allocations',jsonb_build_array(jsonb_build_object('worker_id',worker,'quantity',2))));
 select id into u1 from arka_change_units where order_id=o and position=1;
 select id into u2 from arka_change_units where order_id=o and position=2;
 if (select count(distinct requested_cipher) from arka_change_secrets where unit_id in(u1,u2))<>2 then raise exception 'TEST: per-account passwords not preserved';end if;
 perform arka_set_unit_requested_password(buyer,u1,'sealed-updated-request-a');
 perform arka_set_work_deadline(admin,'change_unit',u1,now()+interval '5 hours');
 perform arka_changes(worker,'accept',jsonb_build_object('id',u1));
 begin perform arka_set_unit_requested_password(buyer,u1,'sealed-race-request');raise exception 'TEST: changed request during accepted work';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform arka_changes(worker,'submit',jsonb_build_object('id',u1,'cipher','sealed-result-a','fingerprint','result-password-a'));
 perform arka_changes(admin,'approve',jsonb_build_object('id',u1));
 perform arka_changes(worker,'problem',jsonb_build_object('id',u2,'reason','No permite iniciar sesión'));
 if not exists(select 1 from arka_change_notifications where user_id=buyer and unit_id=u2) then raise exception 'TEST: problem did not reach buyer';end if;
 perform arka_changes(buyer,'refund_request',jsonb_build_object('id',u2));
 if (select credit_cents from arka_users where id=buyer)<>25 then raise exception 'TEST: refund was not automatic';end if;
 if not exists(select 1 from arka_change_orders where id=o and status='delivered') then raise exception 'TEST: last refund did not finish the order';end if;
 if (select balance_cents from arka_users where id=worker)<>20 then raise exception 'TEST: wrong service payment or unwanted commission';end if;
 begin perform arka_changes(buyer,'refund_request',jsonb_build_object('id',u2));raise exception 'TEST: duplicate refund';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 if (select credit_cents from arka_users where id=buyer)<>25 then raise exception 'TEST: duplicated credit';end if;
 if exists(select 1 from arka_change_secrets where unit_id=u1 and requested_cipher is not null) then raise exception 'TEST: requested password not cleared at delivery';end if;
end $$;
do $$declare b uuid;w uuid;f uuid;o uuid;delivered uuid;begin
 select id into b from arka_users where email='deadline-buyer@example.invalid';
 select id into w from arka_users where email='deadline-worker@example.invalid';
 insert into arka_change_offers(name,mode,price_cents,margin_cents,instructions) values('Cambio de correo','both',77,12,'Legacy instructions') returning id into f;
 insert into arka_change_orders(buyer_id,offer_id,offer_name,mode,unit_cents,margin_cents,quantity,total_cents,request_cipher,status) values(b,f,'Legacy pending','both',77,12,1,77,'sealed-request','processing') returning id into o;
 insert into arka_change_units(order_id,position,status,worker_id,accepted_at,source_fingerprint) values(o,1,'submitted',w,now(),'legacy-source-fingerprint');
 insert into arka_change_orders(buyer_id,offer_id,offer_name,mode,unit_cents,margin_cents,quantity,total_cents,request_cipher,status,delivered_at,access_until) values(b,f,'Legacy delivered','both',77,12,1,77,'sealed-request','delivered',now(),now()+interval '7 days') returning id into delivered;
end $$;
\ir ../database/password-deadlines.sql
do $$begin
 if not exists(select 1 from arka_change_orders where offer_name='Legacy pending' and mode='password' and unit_cents=77 and margin_cents=12 and total_cents=77) then raise exception 'TEST: pending order not corrected or prices changed';end if;
 if not exists(select 1 from arka_change_units cu join arka_change_orders co on co.id=cu.order_id where co.offer_name='Legacy pending' and cu.status='rejected' and cu.accepted_at is null and cu.due_at is null) then raise exception 'TEST: old submission not flagged for recheck or invented a deadline';end if;
 if not exists(select 1 from arka_change_orders where offer_name='Legacy delivered' and mode='both' and total_cents=77) then raise exception 'TEST: completed history rewritten';end if;
end $$;
rollback;
\echo PASSWORD_ONLY_DEADLINES_AND_BUYER_REFUNDS_OK
