-- Review candidate: apply only after isolated verification and explicit approval.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '8s';
do $guard$
begin
  if not exists (select 1 from pg_proc where oid=to_regprocedure('public.handle_new_user_create_profile()')
    and md5(prosrc)='6a1282e030f4ca80893e0fc98bdc692f' and pg_get_userbyid(proowner)='postgres') then
    raise exception 'CUSTOMER_PROFILE_BASELINE_CHANGED';
  end if;
  if has_function_privilege('anon','public.prepare_daily_report_v2_combined_snapshot(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.prepare_daily_report_v2_combined_snapshot(jsonb)','EXECUTE') then
    raise exception 'CUSTOMER_SNAPSHOT_ACL_REQUIRED';
  end if;
end;
$guard$;

create schema etrylue_customer_private;
revoke all on schema etrylue_customer_private from public,anon,authenticated;
grant usage on schema etrylue_customer_private to authenticated;
create table etrylue_customer_private.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null unique default gen_random_uuid(),
  workspace_id uuid not null unique default gen_random_uuid(),
  company_name text not null check (length(btrim(company_name)) between 1 and 100),
  contact_name text not null check (length(btrim(contact_name)) between 1 and 80),
  tenant_type text not null check (tenant_type in ('agency','advertiser')),
  created_at timestamptz not null default now(),
  provisioned_at timestamptz
);
create table etrylue_customer_private.scopes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null
);
create table etrylue_customer_private.signup_limits (
  bucket text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
alter table etrylue_customer_private.accounts enable row level security;
alter table etrylue_customer_private.scopes enable row level security;
alter table etrylue_customer_private.signup_limits enable row level security;
revoke all on all tables in schema etrylue_customer_private from public,anon,authenticated;

-- Only the Auth admin API may set app_metadata. User metadata is never authority.
create or replace function public.handle_new_user_create_profile()
returns trigger language plpgsql security definer set search_path=public as $function$
declare default_company_id uuid; customer_company_id uuid;
begin
  if new.raw_app_meta_data->>'etrylue_customer_version' = '1' then
    insert into etrylue_customer_private.accounts(user_id,company_name,contact_name,tenant_type)
    values(new.id,new.raw_app_meta_data->>'company_name',new.raw_app_meta_data->>'contact_name',new.raw_app_meta_data->>'tenant_type') returning company_id into customer_company_id;
    insert into etrylue_customer_private.scopes values(new.id,customer_company_id);
    return new;
  end if;
  -- Deploy the server-side invite marker BEFORE installing this migration.
  if new.raw_app_meta_data->>'etrylue_invite_version' is distinct from '1' then
    raise exception 'CUSTOMER_REGISTRATION_ROUTE_REQUIRED';
  end if;
  select w.company_id into customer_company_id from public.workspaces w
    join etrylue_customer_private.accounts a on a.company_id=w.company_id
    where w.id::text=new.raw_app_meta_data->>'invited_workspace_id';
  if found then
    insert into etrylue_customer_private.scopes values(new.id,customer_company_id);
    insert into public.profiles(id,company_id,name,email)
      values(new.id,customer_company_id,coalesce(new.raw_user_meta_data->>'name','New User'),new.email);
    return new;
  end if;
  -- Existing legacy invitation profile behavior is preserved.
  select c.id into default_company_id from public.companies c where c.name='000' limit 1;
  if default_company_id is null then raise exception 'default company(000) not found'; end if;
  insert into public.profiles(id,company_id,name)
  values(new.id,default_company_id,coalesce(new.raw_user_meta_data->>'name','New User'))
  on conflict(id) do nothing;
  return new;
end;
$function$;

create function etrylue_customer_private.my_company() returns uuid
language sql stable security definer set search_path=pg_catalog as $function$
  select company_id from etrylue_customer_private.scopes where user_id=auth.uid();
$function$;
revoke all on function etrylue_customer_private.my_company() from public,anon,authenticated;
grant execute on function etrylue_customer_private.my_company() to authenticated;

create policy customer_company_boundary on public.companies as restrictive for all to authenticated
using ((select etrylue_customer_private.my_company()) is null or id=(select etrylue_customer_private.my_company()))
with check ((select etrylue_customer_private.my_company()) is null or id=(select etrylue_customer_private.my_company()));
create policy customer_department_boundary on public.departments as restrictive for all to authenticated
using ((select etrylue_customer_private.my_company()) is null or company_id=(select etrylue_customer_private.my_company()))
with check ((select etrylue_customer_private.my_company()) is null or company_id=(select etrylue_customer_private.my_company()));
create policy customer_team_boundary on public.teams as restrictive for all to authenticated
using ((select etrylue_customer_private.my_company()) is null or company_id=(select etrylue_customer_private.my_company()))
with check ((select etrylue_customer_private.my_company()) is null or company_id=(select etrylue_customer_private.my_company()));
create policy customer_role_boundary on public.roles as restrictive for all to authenticated
using ((select etrylue_customer_private.my_company()) is null or company_id=(select etrylue_customer_private.my_company()))
with check ((select etrylue_customer_private.my_company()) is null or company_id=(select etrylue_customer_private.my_company()));
-- Legacy org_units have no company foreign key; do not expose them to new customers.
create policy customer_org_boundary on public.org_units as restrictive for all to authenticated
using ((select etrylue_customer_private.my_company()) is null)
with check ((select etrylue_customer_private.my_company()) is null);

create function etrylue_customer_private.guard_profile() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
begin
  if exists(select 1 from etrylue_customer_private.scopes where user_id=old.id)
    and (new.id,new.company_id,new.role_id,new.platform_role,new.email,new.department_id,new.team_id)
      is distinct from (old.id,old.company_id,old.role_id,old.platform_role,old.email,old.department_id,old.team_id) then
    raise exception 'CUSTOMER_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$function$;
revoke all on function etrylue_customer_private.guard_profile() from public,anon,authenticated;
create trigger customer_profile_identity before update on public.profiles
for each row execute function etrylue_customer_private.guard_profile();

create function etrylue_customer_private.guard_membership() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
declare account etrylue_customer_private.accounts;
begin
  select * into account from etrylue_customer_private.accounts where user_id=new.user_id;
  if exists(select 1 from etrylue_customer_private.scopes where user_id=new.user_id) and new.role='master' then
    if tg_op='INSERT' and new.workspace_id=account.workspace_id and account.provisioned_at is null then
      new.role:='admin';
    else raise exception 'CUSTOMER_MASTER_FORBIDDEN'; end if;
  end if;
  return new;
end;
$function$;
revoke all on function etrylue_customer_private.guard_membership() from public,anon,authenticated;
create trigger customer_membership_role before insert or update on public.workspace_members
for each row execute function etrylue_customer_private.guard_membership();

-- Service-only entry point. The route obtains p_user_id from Auth.getUser(), never the request body.
create function public.provision_etrylue_customer(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $function$
declare account etrylue_customer_private.accounts; user_email text;
begin
  select * into account from etrylue_customer_private.accounts where user_id=p_user_id for update;
  if not found then raise exception 'CUSTOMER_ACCOUNT_REQUIRED'; end if;
  select email into user_email from auth.users where id=p_user_id and email_confirmed_at is not null;
  if not found then raise exception 'CUSTOMER_EMAIL_UNVERIFIED'; end if;
  if account.provisioned_at is null then
    if exists(select 1 from public.profiles where id=p_user_id)
      or exists(select 1 from public.workspace_members where user_id=p_user_id)
      or exists(select 1 from public.tenant_members where user_id=p_user_id) then
      raise exception 'CUSTOMER_EXISTING_IDENTITY';
    end if;
    insert into public.companies(id,name) values(account.company_id,account.company_name);
    insert into public.profiles(id,company_id,name,email)
    values(p_user_id,account.company_id,account.contact_name,user_email);
    insert into public.tenants(id,name,slug,tenant_type,created_by)
    values(account.tenant_id,account.company_name,'customer-'||account.tenant_id::text,account.tenant_type,p_user_id);
    insert into public.tenant_members(tenant_id,user_id,role) values(account.tenant_id,p_user_id,'owner');
    insert into public.workspaces(id,name,created_by,owner_user_id,company_id,tenant_id,workspace_type,workspace_kind)
    values(account.workspace_id,account.company_name,p_user_id,p_user_id,account.company_id,account.tenant_id,'company','project');
    if not exists(select 1 from public.workspace_members where workspace_id=account.workspace_id and user_id=p_user_id and role='admin') then
      raise exception 'CUSTOMER_MEMBERSHIP_INVARIANT';
    end if;
    update etrylue_customer_private.accounts set provisioned_at=clock_timestamp() where user_id=p_user_id;
  end if;
  return jsonb_build_object('company_id',account.company_id,'tenant_id',account.tenant_id,'workspace_id',account.workspace_id);
end;
$function$;
revoke all on function public.provision_etrylue_customer(uuid) from public,anon,authenticated;
grant execute on function public.provision_etrylue_customer(uuid) to service_role;

create function public.reserve_etrylue_customer_signup(p_email text,p_client_hash text) returns text
language plpgsql security definer set search_path=pg_catalog as $function$
declare k text; n integer; existing_id uuid;
begin
  if p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email))
    or p_email not like '%@%' or p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'CUSTOMER_INPUT_INVALID';
  end if;
  delete from etrylue_customer_private.signup_limits where expires_at < now()-interval '1 day';
  foreach k in array array['email:'||md5(p_email),'client:'||p_client_hash] loop
    insert into etrylue_customer_private.signup_limits(bucket,attempts,expires_at)
      values(k,1,now()+interval '1 hour')
    on conflict(bucket) do update set
      attempts=case when signup_limits.expires_at<=now() then 1 else signup_limits.attempts+1 end,
      expires_at=case when signup_limits.expires_at<=now() then now()+interval '1 hour' else signup_limits.expires_at end
    returning attempts into n;
    if n > (case when k like 'email:%' then 5 else 20 end) then return 'limited'; end if;
  end loop;
  select id into existing_id from auth.users where lower(email)=p_email limit 1;
  if existing_id is null then return 'new'; end if;
  if exists(select 1 from etrylue_customer_private.accounts where user_id=existing_id and provisioned_at is null)
    and exists(select 1 from auth.users where id=existing_id and email_confirmed_at is null) then return 'pending'; end if;
  return 'existing';
end;
$function$;
revoke all on function public.reserve_etrylue_customer_signup(text,text) from public,anon,authenticated;
grant execute on function public.reserve_etrylue_customer_signup(text,text) to service_role;
commit;
