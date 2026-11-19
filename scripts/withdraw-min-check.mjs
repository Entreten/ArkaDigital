const token=process.env.SUPABASE_ACCESS_TOKEN;async function req(path,body){const r=await fetch('https://api.supabase.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Supabase QA HTTP '+r.status);return r.json();}const projects=await req('/projects'),matches=projects.filter(p=>/arka/i.test(p.name)),p=matches.length===1?matches[0]:projects.length===1?projects[0]:null;if(!p)throw Error('Proyecto ambiguo');await req('/projects/'+(p.id||p.ref)+'/database/query',{query:
`begin; do $$ declare worker uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); wid uuid; blocked boolean; begin
 insert into arka_users(id,email,name,password_hash,role,balance_cents) values(worker,'qa_withdraw_'||worker||'@example.invalid','QA rollback','no-login','worker',1200),(admin_id,'qa_withdraw_'||admin_id||'@example.invalid','QA admin','no-login','admin',0);
 foreach wid in array array[worker] loop
 blocked:=false;begin perform arka_command(worker,'withdraw',jsonb_build_object('amount_cents',499,'bank','QA','holder','QA','account_number','NO-REAL'));exception when others then if position('Retiro mínimo $5' in sqlerrm)=0 then raise;end if;blocked:=true;end;if not blocked then raise exception 'Aceptó menos de 5';end if;
 end loop;
 perform arka_command(worker,'withdraw',jsonb_build_object('amount_cents',500,'bank','QA','holder','QA','account_number','NO-REAL'));
 if (select reserved_cents from arka_users where id=worker)<>500 then raise exception 'Reserva incorrecta';end if;
 select id into wid from arka_withdrawals where worker_id=worker and status='pending';
 perform arka_command(admin_id,'process_withdrawal',jsonb_build_object('id',wid,'decision','rejected','reason','QA liberación'));
 if (select reserved_cents from arka_users where id=worker)<>0 then raise exception 'No liberó reserva';end if;
 perform arka_command(worker,'withdraw',jsonb_build_object('amount_cents',500,'bank','QA','holder','QA','account_number','NO-REAL'));
 select id into wid from arka_withdrawals where worker_id=worker and status='pending';
 perform arka_command(admin_id,'process_withdrawal',jsonb_build_object('id',wid,'decision','paid'));
 if (select balance_cents from arka_users where id=worker)<>700 or (select reserved_cents from arka_users where id=worker)<>0 then raise exception 'Descuento incorrecto';end if;
 blocked:=false;begin perform arka_command(worker,'withdraw',jsonb_build_object('amount_cents',701,'bank','QA','holder','QA','account_number','NO-REAL'));exception when others then if position('saldo disponible' in sqlerrm)=0 then raise;end if;blocked:=true;end;if not blocked then raise exception 'Aceptó más del saldo';end if;
 blocked:=false;begin insert into arka_withdrawals(worker_id,amount_cents,bank,holder,account_number) values(worker,499,'QA','QA','NO-REAL');exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Constraint incorrecto';end if;
 end $$; rollback;`});console.log('WITHDRAW_MIN_OK: acepta $5, rechaza $4.99 y exceso de saldo; reserva, rechazo y pago correctos. Prueba revertida sin modificar datos reales.');
