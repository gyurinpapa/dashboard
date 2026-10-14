-- ISOLATED CANDIDATE ONLY. Not a production migration or an installation command.
-- No existing tables, functions, policies, rows, jobs or timers are replaced.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $$ begin
  if current_setting('etrylue.registration_candidate',true) is distinct from 'isolated-candidate-only'
    or to_regprocedure('public.activate_daily_report_v2_combined_snapshot(jsonb)') is not null
    or to_regclass('public.report_rows') is not null then
    raise exception 'ISOLATED_REGISTRATION_CANDIDATE_REQUIRED';
  end if;
end $$;

create schema etrylue_registration_private;
revoke all on schema etrylue_registration_private from public,anon,authenticated;
grant usage on schema etrylue_registration_private to service_role;

create table etrylue_registration_private.advertisers (
  order_id uuid primary key,
  advertiser_id uuid not null unique,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check(length(btrim(name)) between 1 and 100 and name=btrim(name) and name !~ '[[:cntrl:]]'),
  amount integer not null check(amount>0),
  approved_at timestamptz not null,
  payment_status text not null default 'verified' check(payment_status in ('verified','refund_pending','refunded','review')),
  workspace_id uuid references public.workspaces(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete restrict,
  started_at timestamptz,
  paid_until timestamptz,
  refund_requested_at timestamptz,
  refund_amount integer check(refund_amount>0 and refund_amount<=amount),
  refunded_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((workspace_id is null and assigned_by is null and started_at is null and paid_until is null)
    or (workspace_id is not null and assigned_by is not null and started_at is not null and paid_until>started_at)),
  check ((refund_requested_at is null and refund_amount is null) or (refund_requested_at is not null and refund_amount is not null)),
  check (started_at is null or started_at>=approved_at)
);
create index on etrylue_registration_private.advertisers(buyer_id,created_at desc,order_id);
create index on etrylue_registration_private.advertisers(company_id,tenant_id,created_at desc,order_id) where workspace_id is null;
alter table etrylue_registration_private.advertisers enable row level security;
revoke all on etrylue_registration_private.advertisers from public,anon,authenticated;
grant select,insert,update on etrylue_registration_private.advertisers to service_role;

-- Service-only SECURITY INVOKER RPCs. The HTTP layer must obtain actor IDs from getUser().
-- Provider evidence is supplied ONLY after server merchant/order/currency/amount verification.
-- No payment key, provider secret, card details, or buyer email is stored here.
create function public.etrylue_registration_record(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r etrylue_registration_private.advertisers; buyer public.profiles;
  oid uuid := (p->>'order_id')::uuid; tid uuid := (p->>'tenant_id')::uuid;
  aid uuid := (p->>'advertiser_id')::uuid; uid uuid := (p->>'buyer_id')::uuid;
  cid uuid := (p->>'company_id')::uuid; approved timestamptz := (p->>'approved_at')::timestamptz;
  price integer := (p->>'amount')::integer; title text := btrim(p->>'name');
begin
  if oid is null or tid is null or aid is null or uid is null or cid is null or
    approved is null or not isfinite(approved) or approved>clock_timestamp() or price is null or price<=0 or
    title is null or length(title) not between 1 and 100 or title ~ '[[:cntrl:]]' then
    raise exception 'INVALID_REGISTRATION';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(oid::text,20261014));
  select * into r from etrylue_registration_private.advertisers where order_id=oid for update;
  if found then
    if (r.advertiser_id,r.buyer_id,r.company_id,r.tenant_id,r.name,r.amount,r.approved_at)
      is distinct from (aid,uid,cid,tid,title,price,approved) then raise exception 'REGISTRATION_CONFLICT'; end if;
    return to_jsonb(r); -- Duplicate DONE never resets a refund or assignment.
  end if;
  select * into buyer from public.profiles where id=uid for share;
  if not found or buyer.company_id is distinct from cid then raise exception 'REGISTRATION_COMPANY_DENIED'; end if;
  perform 1 from public.tenant_members where user_id=uid and tenant_id=tid for share;
  if not found then raise exception 'REGISTRATION_TENANT_DENIED'; end if;
  perform 1 from public.tenants where id=tid and status='active' for share;
  if not found then raise exception 'REGISTRATION_TENANT_DENIED'; end if;
  -- The current hierarchy has no tenants.company_id; validate the existing company/tenant bridge.
  perform 1 from public.workspaces where company_id=cid and tenant_id=tid limit 1 for share;
  if not found then raise exception 'REGISTRATION_COMPANY_DENIED'; end if;
  if exists(select 1 from public.advertisers where id=aid) then raise exception 'ADVERTISER_ID_CONFLICT'; end if;
  insert into etrylue_registration_private.advertisers(order_id,advertiser_id,buyer_id,company_id,tenant_id,name,amount,approved_at)
    values(oid,aid,uid,cid,tid,title,price,approved) returning * into r;
  return to_jsonb(r);
end $$;

create function public.etrylue_registration_assign(p_order uuid,p_actor uuid,p_workspace uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r etrylue_registration_private.advertisers; w public.workspaces;
  a public.profiles; buyer public.profiles; actor_role text; buyer_role text; tenant_role text;
  t timestamptz; owner boolean:=false; true_master boolean:=false;
begin
  select * into r from etrylue_registration_private.advertisers where order_id=p_order for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  select * into w from public.workspaces where id=p_workspace for share;
  if not found or w.company_id is distinct from r.company_id or w.tenant_id is distinct from r.tenant_id then
    raise exception 'ASSIGNMENT_SCOPE_DENIED'; end if;
  select * into a from public.profiles where id=p_actor for share;
  if not found then raise exception 'ASSIGNMENT_SCOPE_DENIED'; end if;
  if lower(btrim(a.email))='gyurinpapakimdh@gmail.com' then
    perform 1 from public.workspace_members where user_id=p_actor and role='master' limit 1 for share;
    true_master:=found;
  end if;
  if not true_master and a.company_id is distinct from r.company_id then raise exception 'ASSIGNMENT_SCOPE_DENIED'; end if;
  select role into actor_role from public.workspace_members where workspace_id=p_workspace and user_id=p_actor for share;
  select role into tenant_role from public.tenant_members where tenant_id=r.tenant_id and user_id=p_actor for share;
  owner:=coalesce(tenant_role='owner',false);
  if not true_master and not owner and coalesce(actor_role,'') not in ('admin','director') then raise exception 'ASSIGNMENT_ROLE_DENIED'; end if;
  -- Assignment itself never grants membership. Preserve all existing report access rules.
  select * into buyer from public.profiles where id=r.buyer_id for share;
  select role into buyer_role from public.workspace_members where workspace_id=p_workspace and user_id=r.buyer_id for share;
  if buyer.company_id is distinct from r.company_id or coalesce(buyer_role,'') not in ('admin','director','staff') then
    raise exception 'BUYER_DESTINATION_ACCESS_REQUIRED'; end if;
  perform 1 from public.tenants where id=r.tenant_id and status='active' for share;
  if not found then raise exception 'ASSIGNMENT_SCOPE_DENIED'; end if;
  if r.payment_status<>'verified' then raise exception 'VERIFIED_PAYMENT_REQUIRED'; end if;
  if r.workspace_id is not null then
    if r.workspace_id<>p_workspace then raise exception 'ALREADY_ASSIGNED'; end if;
    if not exists(select 1 from public.advertisers where id=r.advertiser_id and workspace_id=r.workspace_id
      and tenant_id=r.tenant_id and created_by=r.buyer_id and billing_review_managed) then
      raise exception 'ASSIGNED_ADVERTISER_MISMATCH'; end if;
    return to_jsonb(r);
  end if;
  -- Check after authorization/row locks. The browser cannot supply an effective service date.
  t:=clock_timestamp();
  insert into public.advertisers(id,workspace_id,tenant_id,created_by,name,billing_review_managed)
    values(r.advertiser_id,w.id,r.tenant_id,r.buyer_id,r.name,true);
  update etrylue_registration_private.advertisers set workspace_id=w.id,assigned_by=p_actor,
    started_at=t,paid_until=((t at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul'
    where order_id=r.order_id returning * into r;
  return to_jsonb(r);
end $$;

-- Freeze the amount and request timestamp BEFORE any provider cancellation request.
create function public.etrylue_registration_reserve_refund(p_order uuid,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r etrylue_registration_private.advertisers; t timestamptz; price integer;
begin
  select * into r from etrylue_registration_private.advertisers where order_id=p_order for update;
  if not found or r.buyer_id is distinct from p_actor then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if r.refund_requested_at is not null then return to_jsonb(r); end if;
  if r.payment_status<>'verified' then raise exception 'REFUND_REQUIRES_REVIEW'; end if;
  t:=clock_timestamp();
  if r.workspace_id is null or t<=r.approved_at+interval '168 hours' then price:=r.amount;
  elsif r.paid_until>t then
    price:=least(r.amount,ceil(r.amount::numeric*extract(epoch from (r.paid_until-t))/extract(epoch from (r.paid_until-r.started_at)))::integer);
  else raise exception 'REFUND_REQUIRES_REVIEW'; end if;
  update etrylue_registration_private.advertisers set payment_status='refund_pending',
    refund_requested_at=t,refund_amount=price where order_id=r.order_id returning * into r;
  return to_jsonb(r);
end $$;

-- Only a matched provider-confirmed cancellation may complete a reserved refund.
create function public.etrylue_registration_confirm_refund(p_order uuid,p_confirmed_amount integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r etrylue_registration_private.advertisers;
begin
  select * into r from etrylue_registration_private.advertisers where order_id=p_order for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if r.refund_requested_at is null or p_confirmed_amount is distinct from r.refund_amount then
    raise exception 'REFUND_AMOUNT_MISMATCH'; end if;
  if r.payment_status='refunded' then return to_jsonb(r); end if;
  if r.payment_status<>'refund_pending' then raise exception 'REFUND_REQUIRES_REVIEW'; end if;
  update etrylue_registration_private.advertisers set payment_status='refunded',refunded_at=clock_timestamp()
    where order_id=r.order_id returning * into r;
  return to_jsonb(r);
end $$;

-- Verified unsolicited cancellations also block access without deleting existing data.
create function public.etrylue_registration_provider_state(p_order uuid,p_status text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r etrylue_registration_private.advertisers;
begin
  if p_status is null or p_status not in ('DONE','CANCELED','PARTIAL_CANCELED') then raise exception 'INVALID_PROVIDER_STATUS'; end if;
  select * into r from etrylue_registration_private.advertisers where order_id=p_order for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if p_status='DONE' or r.payment_status='refunded' then return to_jsonb(r); end if;
  -- A cancellation webhook may arrive before the initiating HTTP response.
  -- Keep the reservation blocked until its matched amount is verified; do not
  -- strand an otherwise valid refund in review merely because delivery won the race.
  if p_status='PARTIAL_CANCELED' and r.payment_status='refund_pending' then return to_jsonb(r); end if;
  update etrylue_registration_private.advertisers set payment_status=case when p_status='CANCELED' then 'refunded' else 'review' end,
    refunded_at=case when p_status='CANCELED' then coalesce(refunded_at,clock_timestamp()) else refunded_at end
    where order_id=r.order_id returning * into r;
  return to_jsonb(r);
end $$;

create function public.etrylue_registration_get(p_order uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare r etrylue_registration_private.advertisers;
begin
  select * into r from etrylue_registration_private.advertisers where order_id=p_order;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if r.buyer_id is distinct from p_actor and not exists(select 1 from public.profiles p
    where p.id=p_actor and lower(btrim(p.email))='gyurinpapakimdh@gmail.com' and
      exists(select 1 from public.workspace_members wm where wm.user_id=p_actor and wm.role='master'))
    and not exists(select 1 from public.profiles p
    where p.id=p_actor and p.company_id=r.company_id and (
      exists(select 1 from public.tenant_members tm where tm.user_id=p_actor and tm.tenant_id=r.tenant_id and tm.role='owner') or
      exists(select 1 from public.workspace_members wm join public.workspaces w on w.id=wm.workspace_id
        where wm.user_id=p_actor and wm.role in ('admin','director') and w.company_id=r.company_id and w.tenant_id=r.tenant_id)))
    then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  return to_jsonb(r);
end $$;

-- Keyset pagination: managers can discover pending registrations without knowing order IDs.
create function public.etrylue_registration_list(p_actor uuid,p_before timestamptz default null,p_cursor uuid default null,p_limit integer default 30)
returns setof jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if p_actor is null or p_limit is null or p_limit<1 or p_limit>100 or
    ((p_before is null) is distinct from (p_cursor is null)) then raise exception 'INVALID_REGISTRATION_PAGE'; end if;
  return query select to_jsonb(r)||jsonb_build_object('destinations',coalesce((
    select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name) order by w.name,w.id)
    from public.workspaces w where w.company_id=r.company_id and w.tenant_id=r.tenant_id
      and exists(select 1 from public.workspace_members buyer where buyer.workspace_id=w.id and buyer.user_id=r.buyer_id and buyer.role in ('admin','director','staff'))
      and exists(select 1 from public.profiles ap where ap.id=p_actor and (
        (lower(btrim(ap.email))='gyurinpapakimdh@gmail.com' and exists(select 1 from public.workspace_members am where am.user_id=p_actor and am.role='master')) or
        (ap.company_id=r.company_id and (
          exists(select 1 from public.tenant_members tm where tm.user_id=p_actor and tm.tenant_id=r.tenant_id and tm.role='owner') or
          exists(select 1 from public.workspace_members am where am.user_id=p_actor and am.workspace_id=w.id and am.role in ('admin','director'))))))
  ),'[]'::jsonb)) from etrylue_registration_private.advertisers r
  where r.workspace_id is null and (p_before is null or (r.created_at,r.order_id)<(p_before,p_cursor)) and (
    r.buyer_id=p_actor or
    exists(select 1 from public.profiles p where p.id=p_actor and lower(btrim(p.email))='gyurinpapakimdh@gmail.com' and
      exists(select 1 from public.workspace_members wm where wm.user_id=p_actor and wm.role='master')) or
    exists(select 1 from public.profiles p where p.id=p_actor and p.company_id=r.company_id and (
      exists(select 1 from public.tenant_members tm where tm.user_id=p_actor and tm.tenant_id=r.tenant_id and tm.role='owner') or
      exists(select 1 from public.workspace_members wm join public.workspaces w on w.id=wm.workspace_id
        where wm.user_id=p_actor and wm.role in ('admin','director') and w.company_id=r.company_id and w.tenant_id=r.tenant_id))))
  order by r.created_at desc,r.order_id desc limit p_limit;
end $$;

-- Server-only batch lookup, called after existing advertiser/workspace authorization.
create function public.etrylue_registration_access_many(p_advertisers uuid[]) returns setof jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_advertisers is null or cardinality(p_advertisers)>1000 then raise exception 'INVALID_REGISTRATION_IDS'; end if;
  return query select to_jsonb(r) from etrylue_registration_private.advertisers r where r.advertiser_id=any(p_advertisers);
end $$;

revoke all on function public.etrylue_registration_record(jsonb),public.etrylue_registration_assign(uuid,uuid,uuid),
  public.etrylue_registration_reserve_refund(uuid,uuid),public.etrylue_registration_confirm_refund(uuid,integer),
  public.etrylue_registration_provider_state(uuid,text),public.etrylue_registration_get(uuid,uuid),
  public.etrylue_registration_list(uuid,timestamptz,uuid,integer),public.etrylue_registration_access_many(uuid[])
  from public,anon,authenticated;
grant execute on function public.etrylue_registration_record(jsonb),public.etrylue_registration_assign(uuid,uuid,uuid),
  public.etrylue_registration_reserve_refund(uuid,uuid),public.etrylue_registration_confirm_refund(uuid,integer),
  public.etrylue_registration_provider_state(uuid,text),public.etrylue_registration_get(uuid,uuid),
  public.etrylue_registration_list(uuid,timestamptz,uuid,integer),public.etrylue_registration_access_many(uuid[]) to service_role;
commit;
