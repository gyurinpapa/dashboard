-- TEST DATABASE ONLY. Not a production migration; never included in existing migrations.
-- Explicitly SET etrylue.billing_test_install = 'isolated-tests-only' before running.
begin;
do $$ begin
  if current_setting('etrylue.billing_test_install', true) is distinct from 'isolated-tests-only' then
    raise exception 'Explicit isolated test installation required';
  end if;
  if to_regclass('public.reports') is not null then
    if exists (select 1 from public.reports limit 1) then
      raise exception 'Refusing installation in a database containing reports';
    end if;
  end if;
end $$;

create table public.billing_test_orders (
  id uuid primary key,
  user_id uuid not null,
  scope text not null check (scope in ('advertiser','workspace','company')),
  target_id uuid not null,
  workspace_id uuid,
  tenant_id uuid,
  mode text not null check (mode in ('once','monthly')),
  catalog_version text not null,
  amount integer not null check (amount > 0),
  name text not null,
  customer_key text not null unique,
  nonce_hash text not null,
  status text not null default 'pending' check (status in ('pending','active','cancelled','review','refunded')),
  billing_key_cipher text,
  anchor_at timestamptz,
  paid_until timestamptz,
  last_cycle integer not null default 0,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now()
);
create index billing_test_orders_user on public.billing_test_orders(user_id, created_at desc);
create index billing_test_orders_target on public.billing_test_orders(scope,target_id);
create index billing_test_orders_tenant on public.billing_test_orders(tenant_id);

create table public.billing_test_charges (
  id uuid primary key,
  order_id uuid not null references public.billing_test_orders(id),
  cycle integer not null check (cycle > 0),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','done','refunded','review')),
  payment_key text unique,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id,cycle)
);

alter table public.billing_test_orders enable row level security;
alter table public.billing_test_charges enable row level security;
-- No client policies. Server authorization precedes every service-role operation.
revoke all on public.billing_test_orders, public.billing_test_charges from public, anon, authenticated;
grant select, insert, update on public.billing_test_orders, public.billing_test_charges to service_role;

create function public.billing_test_create(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare existing public.billing_test_orders; oid uuid := (p->>'id')::uuid;
begin
  -- Serialize overlapping company/workspace/advertiser purchases; no network call inside lock.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p->>'tenant_id',p->>'workspace_id',p->>'target_id'),761));
  select * into existing from public.billing_test_orders where id=oid;
  if found then
    if existing.user_id <> (p->>'user_id')::uuid or existing.target_id <> (p->>'target_id')::uuid
      or existing.scope <> p->>'scope' or existing.mode <> p->>'mode' or existing.nonce_hash <> p->>'nonce_hash'
      then raise exception 'ORDER_CONFLICT'; end if;
    return oid;
  end if;
  if exists (select 1 from public.billing_test_orders o
    where (o.status in ('pending','review') or o.paid_until > now()) and (
      (o.scope = p->>'scope' and o.target_id = (p->>'target_id')::uuid) or
      (o.tenant_id = (p->>'tenant_id')::uuid and (o.scope='company' or p->>'scope'='company')) or
      (o.workspace_id = (p->>'workspace_id')::uuid and (o.scope='workspace' or p->>'scope'='workspace'))))
    then raise exception 'OVERLAPPING_ORDER_REQUIRES_REVIEW'; end if;
  insert into public.billing_test_orders(id,user_id,scope,target_id,workspace_id,tenant_id,mode,
    catalog_version,amount,name,customer_key,nonce_hash)
    values(oid,(p->>'user_id')::uuid,p->>'scope',(p->>'target_id')::uuid,(p->>'workspace_id')::uuid,
    (p->>'tenant_id')::uuid,p->>'mode',p->>'catalog_version',(p->>'amount')::integer,
    p->>'name',p->>'customer_key',p->>'nonce_hash');
  insert into public.billing_test_charges(id,order_id,cycle,amount)
    values (oid,oid,1,(p->>'amount')::integer);
  return oid;
end $$;

create function public.billing_test_settle(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.billing_test_charges; o public.billing_test_orders;
begin
  select * into c from public.billing_test_charges where id=(p->>'charge_id')::uuid;
  if not found then raise exception 'UNKNOWN_CHARGE'; end if;
  select * into o from public.billing_test_orders where id=c.order_id for update;
  select * into c from public.billing_test_charges where id=c.id for update;
  if c.amount <> (p->>'amount')::integer or
    (c.payment_key is not null and c.payment_key <> p->>'payment_key')
    then raise exception 'PAYMENT_MISMATCH'; end if;
  if p->>'status' in ('CANCELED','PARTIAL_CANCELED') then
    update public.billing_test_charges set status=case when p->>'status'='CANCELED' then 'refunded' else 'review' end,
      payment_key=p->>'payment_key' where id=c.id;
    update public.billing_test_orders set status=case when p->>'status'='CANCELED' then 'refunded' else 'review' end,
      cancel_at_period_end=true,paid_until=case when paid_until is null then null else least(paid_until,now()) end where id=o.id;
    return;
  end if;
  -- Monotonic state: duplicate/stale DONE never resurrects cancelled/refunded/review payments.
  if c.status <> 'pending' or o.status in ('refunded','review') then return; end if;
  if p->>'status' <> 'DONE' or c.cycle <> o.last_cycle+1 then raise exception 'INVALID_TRANSITION'; end if;
  if (p->>'paid_until')::timestamptz <= (p->>'approved_at')::timestamptz then raise exception 'INVALID_PERIOD'; end if;
  update public.billing_test_charges set status='done',payment_key=p->>'payment_key',
    approved_at=(p->>'approved_at')::timestamptz where id=c.id;
  update public.billing_test_orders set status='active',anchor_at=coalesce(anchor_at,(p->>'approved_at')::timestamptz),
    paid_until=(p->>'paid_until')::timestamptz,last_cycle=c.cycle where id=o.id;
end $$;

create function public.billing_test_next_charge(p_order uuid, p_charge uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.billing_test_orders; cid uuid;
begin
  select * into o from public.billing_test_orders where id=p_order for update;
  if not found or o.mode<>'monthly' or o.status<>'active' or o.cancel_at_period_end
    or o.billing_key_cipher is null or o.paid_until>now() or o.last_cycle<1 then
    raise exception 'RENEWAL_NOT_DUE'; end if;
  -- Test runner never catches up multiple missed months by charging them in a loop.
  if o.paid_until < now()-interval '1 day' then raise exception 'RENEWAL_REQUIRES_REVIEW'; end if;
  insert into public.billing_test_charges(id,order_id,cycle,amount)
    values(p_charge,o.id,o.last_cycle+1,o.amount) on conflict(order_id,cycle) do nothing;
  select id into cid from public.billing_test_charges where order_id=o.id and cycle=o.last_cycle+1;
  return cid;
end $$;

create function public.billing_test_cancel(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.billing_test_orders;
begin
  select * into o from public.billing_test_orders where id=p_order for update;
  if not found then raise exception 'UNKNOWN_ORDER'; end if;
  -- An already reserved charge must be reconciled before cancellation is acknowledged.
  if exists(select 1 from public.billing_test_charges where order_id=p_order and status='pending') then
    raise exception 'PAYMENT_RECONCILIATION_REQUIRED'; end if;
  update public.billing_test_orders set cancel_at_period_end=true where id=p_order;
end $$;

revoke all on function public.billing_test_create(jsonb), public.billing_test_settle(jsonb),
 public.billing_test_next_charge(uuid,uuid), public.billing_test_cancel(uuid) from public,anon,authenticated;
grant execute on function public.billing_test_create(jsonb), public.billing_test_settle(jsonb),
 public.billing_test_next_charge(uuid,uuid), public.billing_test_cancel(uuid) to service_role;
commit;
