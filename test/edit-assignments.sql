\set ON_ERROR_STOP on
begin;
do $$declare ad uuid;w uuid;w2 uuid;b uuid;p uuid;s uuid;f uuid;o uuid;cu uuid;j jsonb;begin
 insert into arka_users(email,name,password_hash,role) values('edit-admin@example.invalid','Admin','test','admin') returning id into ad;
 insert into arka_users(email,name,password_hash,role) values('edit-worker@example.invalid','Worker','test','worker') returning id into w;
 insert into arka_users(email,name,password_hash,role) values('edit-worker2@example.invalid','Worker2','test','worker') returning id into w2;
 insert into arka_users(email,name,password_hash,role) values('edit-buyer@example.invalid','Buyer','test','wholesale') returning id into b;
 insert into arka_products(name,mode,duration_months,price_cents) values('EDIT TEST','duration',6,25) returning id into p;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents) values(w,p,3,20) returning id into s;
 begin perform arka_edit_assignment(w,'production',s,'delete','{}');raise exception 'TEST: worker can delete assignment';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform arka_edit_assignment(ad,'production',s,'edit',jsonb_build_object('worker_id',w2,'quantity',2,'rate_cents',30,'due_at',now()+interval '1 day'));
 if not exists(select 1 from arka_assignments where id=s and worker_id=w2 and quantity=2 and rate_cents=30 and commission_bps=300 and accepted_at is null) then raise exception 'TEST: assignment edit failed';end if;
 perform arka_edit_assignment(ad,'production',s,'delete','{}');
 if exists(select 1 from arka_assignments where id=s) then raise exception 'TEST: unused assignment not deleted';end if;
 insert into arka_assignments(worker_id,product_id,quantity,rate_cents) values(w,p,2,20) returning id into s;
 insert into arka_accounts(product_id,worker_id,assignment_id,cipher,email_fingerprint,status) values(p,w,s,'sealed','edit-account','review');
 begin perform arka_edit_assignment(ad,'production',s,'delete','{}');raise exception 'TEST: deleted work already submitted';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 begin perform arka_edit_assignment(ad,'production',s,'edit',jsonb_build_object('rate_cents',99,'quantity',2,'due_at',now()+interval '1 day'));raise exception 'TEST: modified earned contract';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 perform arka_edit_assignment(ad,'production',s,'edit',jsonb_build_object('quantity',3,'due_at',now()+interval '1 day'));
 if not exists(select 1 from arka_assignments where id=s and quantity=3 and worker_id=w and rate_cents=20) then raise exception 'TEST: allowed quantity correction failed';end if;
 insert into arka_change_offers(name,mode,price_cents,margin_cents) values('EDIT PASSWORD','password',25,5) returning id into f;
 j:=arka_changes(b,'create',jsonb_build_object('offer_id',f,'request_cipher','sealed','acknowledged',true,'accounts',jsonb_build_array(jsonb_build_object('cipher','sealed','fingerprint','edit1'),jsonb_build_object('cipher','sealed','fingerprint','edit2'),jsonb_build_object('cipher','sealed','fingerprint','edit3'))));o:=(j->>'id')::uuid;
 update arka_change_orders set status='processing' where id=o;
 perform arka_changes(ad,'assign',jsonb_build_object('id',o,'due_at',now()+interval '1 day','allocations',jsonb_build_array(jsonb_build_object('worker_id',w,'quantity',3))));
 update arka_change_units set worker_id=null,status='pending' where order_id=o and position=1;
 perform arka_edit_assignment(ad,'service',o,'edit',jsonb_build_object('current_worker',w,'worker_id',w2,'quantity',2,'due_at',now()+interval '2 days'));
 if (select count(*) from arka_change_units where order_id=o and worker_id=w2 and status='assigned')<>2
 or (select count(*) from arka_change_units where order_id=o and worker_id is null and status='pending')<>1
 or exists(select 1 from arka_change_units where order_id=o and position=1 and worker_id is not null) then raise exception 'TEST: service allocation correction failed';end if;
 select id into cu from arka_change_units where order_id=o and worker_id=w2 order by position limit 1;
 begin perform arka_changes(w,'accept',jsonb_build_object('id',cu));raise exception 'TEST: old worker retained access';exception when raise_exception then if sqlerrm like 'TEST:%' then raise;end if;end;
 update arka_change_units set status='submitted' where id=cu;
 perform arka_edit_assignment(ad,'service',o,'delete',jsonb_build_object('current_worker',w2));
 if not exists(select 1 from arka_change_units where id=cu and status='submitted' and worker_id=w2)
 or (select count(*) from arka_change_units where order_id=o and status='pending' and worker_id is null)<>2 then raise exception 'TEST: removing assignment discarded submitted work';end if;
 if not exists(select 1 from arka_change_orders where id=o and quantity=3 and total_cents=75 and status='processing')
 or exists(select 1 from arka_users where id in(w,w2,b) and (balance_cents<>0 or credit_cents<>0))
 or exists(select 1 from arka_finance where reference_id=o) then raise exception 'TEST: assignment correction changed sales or money';end if;
end $$;
rollback;
\echo EDIT_AND_REMOVE_ASSIGNMENTS_OK
