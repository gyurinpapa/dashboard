-- ISOLATED TEST ONLY. Synthetic Auth rows; rolls back all fixture writes.
begin;
set local statement_timeout='8s';
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ga jsonb; gb jsonb;
begin
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 values(a,'a-'||a::text||'@example.test','{"etrylue_customer_version":"1","company_name":"Synthetic A","contact_name":"A","tenant_type":"agency"}','{}'),
 (b,'b-'||b::text||'@example.test','{"etrylue_customer_version":"1","company_name":"Synthetic B","contact_name":"B","tenant_type":"advertiser"}','{}');
 if exists(select 1 from public.profiles where id in(a,b)) then raise exception 'pending profile created';end if;
 begin perform public.provision_etrylue_customer(a);raise exception 'unverified accepted';exception when others then if sqlerrm not like '%CUSTOMER_EMAIL_UNVERIFIED%' then raise;end if;end;
 update auth.users set email_confirmed_at=now() where id in(a,b);
 ga:=public.provision_etrylue_customer(a);gb:=public.provision_etrylue_customer(b);
 if ga=gb or ga<>public.provision_etrylue_customer(a) then raise exception 'identity/idempotency failed';end if;
 if (select count(*) from public.workspace_members where user_id in(a,b) and role='admin')<>2 then raise exception 'admin membership failed';end if;
 if (select count(*) from public.tenant_members where user_id in(a,b) and role='owner')<>2 then raise exception 'tenant ownership failed';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('test.own_company',ga->>'company_id',true);
 perform set_config('test.own_user',a::text,true);
end $test$;
set local role authenticated;
do $test$
begin
 if (select count(*) from public.companies)<>1 or not exists(select 1 from public.companies where id=current_setting('test.own_company')::uuid) then raise exception 'company isolation failed';end if;
 begin perform 1 from public.workspace_members; raise exception 'direct membership read unexpectedly allowed'; exception when insufficient_privilege then null;end;
 if exists(select 1 from public.org_units) then raise exception 'legacy org exposure';end if;
end $test$;
reset role;
select 'PASS: pending denial, confirmed provisioning, idempotency, company SQL isolation and direct membership denial; transaction rolled back' result;
rollback;
