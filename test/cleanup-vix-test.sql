\set ON_ERROR_STOP on
do $$declare b uuid;w uuid;f uuid;i int;begin
 insert into arka_users(email,name,password_hash,role) values('vix-cleanup-buyer@example.invalid','Jose Fernandez','test','wholesale') returning id into b;
 insert into arka_users(email,name,password_hash,role) values('vix-cleanup-worker@example.invalid','Viviana Test','test','worker') returning id into w;
 insert into arka_change_offers(name,mode,price_cents,margin_cents) values('VIX contraseña','password',15,5) returning id into f;
 insert into arka_change_orders(id,buyer_id,offer_id,offer_name,mode,unit_cents,margin_cents,quantity,total_cents,request_cipher,status)
 values('30f669e6-f3be-4550-9bf2-8191abab4e37',b,f,'VIX contraseña','password',15,5,3,45,'sealed-request','processing');
 for i in 1..3 loop
 insert into arka_change_units(order_id,position,status,worker_id,source_fingerprint) values('30f669e6-f3be-4550-9bf2-8191abab4e37',i,'assigned',w,'vix-source-'||i);
 end loop;
 insert into arka_receipts(reference_id,kind,cash_cents,credit_cents,verified_at) values('30f669e6-f3be-4550-9bf2-8191abab4e37','change',45,0,now());
 insert into arka_change_notifications(user_id,order_id,message) values(w,'30f669e6-f3be-4550-9bf2-8191abab4e37','Asignación de prueba');
end $$;
\ir ../database/cleanup-vix-test.sql
\ir ../database/cleanup-vix-test.sql
do $$begin
 if exists(select 1 from arka_change_orders where id='30f669e6-f3be-4550-9bf2-8191abab4e37')
 or exists(select 1 from arka_change_units where order_id='30f669e6-f3be-4550-9bf2-8191abab4e37')
 or exists(select 1 from arka_receipts where reference_id='30f669e6-f3be-4550-9bf2-8191abab4e37')
 or exists(select 1 from arka_change_notifications where order_id='30f669e6-f3be-4550-9bf2-8191abab4e37') then raise exception 'VIX test still present';end if;
 if not exists(select 1 from arka_cleanup_archive where run_key='remove-jose-vix-test-20261122' and kind='completed' and data->>'stock_unchanged'='true' and data->>'balances_unchanged'='true') then raise exception 'VIX cleanup not verified';end if;
end $$;
\echo VIX_TEST_CLEANUP_OK
