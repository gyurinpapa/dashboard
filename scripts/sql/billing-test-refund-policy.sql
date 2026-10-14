-- Isolated payment database kbqyszbuxojofugqfjbh ONLY; never the application database.
-- Approved refund policy, test keys only. No backfill or existing order mutation.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
set local etrylue.billing_test_project='kbqyszbuxojofugqfjbh';
do $$ begin
  if current_setting('etrylue.billing_test_project',true) is distinct from 'kbqyszbuxojofugqfjbh' or
    to_regclass('public.billing_test_orders') is null or to_regclass('public.report_rows') is not null or
    to_regprocedure('public.activate_daily_report_v2_combined_snapshot(jsonb)') is not null or
    to_regnamespace('etrylue_customer_private') is not null or
    (to_regclass('public.reports') is not null and obj_description(to_regclass('public.reports'),'pg_class')
      is distinct from 'Billing sandbox synthetic CSV fixture. Not a production report schema.') then
    raise exception 'ISOLATED_PAYMENT_DATABASE_REQUIRED'; end if;
  if (select md5(prosrc) from pg_proc where oid='public.billing_test_settle(jsonb)'::regprocedure)
    is distinct from 'e2d89b61b03b3b11d95976399ba86a24' then raise exception 'SETTLE_BASELINE_CHANGED'; end if;
  if to_regclass('public.billing_test_refund_requests') is not null then raise exception 'REFUND_POLICY_ALREADY_INSTALLED'; end if;
end $$;
create table public.billing_test_refund_requests (
  order_id uuid primary key references public.billing_test_orders(id),
  charge_id uuid not null unique references public.billing_test_charges(id),
  user_id uuid not null,
  requested_at timestamptz not null,
  period_start timestamptz not null,
  period_end timestamptz not null check(period_end>period_start),
  amount integer not null check(amount>0),
  original_amount integer not null check(original_amount>=amount),
  policy_version text not null check(policy_version='2026-10-11'),
  status text not null default 'pending' check(status in ('pending','completed')),
  completed_at timestamptz
);
alter table public.billing_test_refund_requests enable row level security;
revoke all on public.billing_test_refund_requests from public,anon,authenticated;
-- Mutations are exclusively through serialized service-only RPCs.
grant select on public.billing_test_refund_requests to service_role;
create function public.billing_test_request_refund(p_order uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.billing_test_orders; c public.billing_test_charges;
  r public.billing_test_refund_requests; t timestamptz; a integer;
begin
  select * into o from public.billing_test_orders where id=p_order for update;
  if not found or o.user_id is distinct from p_user then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.mode<>'once' then raise exception 'MONTHLY_NOT_AVAILABLE'; end if;
  select * into r from public.billing_test_refund_requests where order_id=o.id;
  if found then return to_jsonb(r); end if;
  -- Time is captured AFTER the order lock; the caller cannot supply time/amount.
  t:=clock_timestamp();
  select * into c from public.billing_test_charges where order_id=o.id and cycle=1 for update;
  if not found or c.status<>'done' or c.payment_key is null or o.status<>'active' or
    o.last_cycle<>1 or c.amount<>o.amount or c.approved_at is null or o.anchor_at is distinct from c.approved_at or
    o.paid_until is null or o.paid_until<=t or c.approved_at>t then raise exception 'REFUND_REQUIRES_REVIEW'; end if;
  a:=case when t<=c.approved_at+interval '168 hours' then c.amount else
    least(c.amount,ceil(c.amount::numeric*extract(epoch from (o.paid_until-t))/extract(epoch from (o.paid_until-c.approved_at)))::integer) end;
  if a<=0 then raise exception 'REFUND_REQUIRES_REVIEW'; end if;
  insert into public.billing_test_refund_requests(order_id,charge_id,user_id,requested_at,period_start,period_end,amount,original_amount,policy_version)
    values(o.id,c.id,p_user,t,c.approved_at,o.paid_until,a,c.amount,'2026-10-11') returning * into r;
  return to_jsonb(r);
end $$;

-- Preserve the original settlement checks; completed policy refunds remain monotonic
-- even when the existing webhook submits a duplicate PARTIAL_CANCELED without balance.
create or replace function public.billing_test_settle(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.billing_test_charges; o public.billing_test_orders; refunded boolean;
begin
  select * into c from public.billing_test_charges where id=(p->>'charge_id')::uuid;
  if not found then raise exception 'UNKNOWN_CHARGE'; end if;
  select * into o from public.billing_test_orders where id=c.order_id for update;
  select * into c from public.billing_test_charges where id=c.id for update;
  if c.amount <> (p->>'amount')::integer or
    (c.payment_key is not null and c.payment_key <> p->>'payment_key')
    then raise exception 'PAYMENT_MISMATCH'; end if;
  if p->>'status' in ('CANCELED','PARTIAL_CANCELED') then
    refunded := p->>'status'='CANCELED' or exists(select 1 from public.billing_test_refund_requests r where r.charge_id=c.id and r.status='completed');
    update public.billing_test_charges set status=case when refunded then 'refunded' else 'review' end,
      payment_key=p->>'payment_key' where id=c.id;
    update public.billing_test_orders set status=case when refunded then 'refunded' else 'review' end,
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
create function public.billing_test_settle_refund(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.billing_test_charges; o public.billing_test_orders; r public.billing_test_refund_requests;
begin
  select * into c from public.billing_test_charges where id=(p->>'charge_id')::uuid;
  if not found then raise exception 'UNKNOWN_CHARGE'; end if;
  select * into o from public.billing_test_orders where id=c.order_id for update;
  select * into c from public.billing_test_charges where id=c.id for update;
  if p->>'status' not in ('DONE','CANCELED','PARTIAL_CANCELED') or p->>'status' is null or
    (p->>'balance_amount')::integer is null or (p->>'balance_amount')::integer<0 or (p->>'balance_amount')::integer>c.amount or
    (p->>'amount')::integer is distinct from c.amount or p->>'payment_key' is null or
    (c.payment_key is not null and c.payment_key<>p->>'payment_key') or
    (p->>'status'='DONE' and (p->>'balance_amount')::integer<>c.amount) or
    (p->>'status'='CANCELED' and (p->>'balance_amount')::integer<>0) or
    (p->>'status'='PARTIAL_CANCELED' and ((p->>'balance_amount')::integer<=0 or (p->>'balance_amount')::integer>=c.amount))
    then raise exception 'PAYMENT_MISMATCH'; end if;
  perform public.billing_test_settle(p);
  select * into r from public.billing_test_refund_requests where charge_id=c.id for update;
  if found and p->>'status' in ('CANCELED','PARTIAL_CANCELED') and
    c.amount-(p->>'balance_amount')::integer=r.amount then
    update public.billing_test_refund_requests set status='completed',completed_at=coalesce(completed_at,clock_timestamp()) where order_id=r.order_id;
    update public.billing_test_charges set status='refunded' where id=c.id;
    update public.billing_test_orders set status='refunded',cancel_at_period_end=true,
      paid_until=least(paid_until,r.requested_at) where id=o.id;
  elsif found and p->>'status'='PARTIAL_CANCELED' then
    -- A changed provider balance requires review, even after an earlier confirmed refund.
    update public.billing_test_charges set status='review' where id=c.id;
    update public.billing_test_orders set status='review' where id=o.id;
  end if;
end $$;
revoke all on function public.billing_test_request_refund(uuid,uuid),public.billing_test_settle_refund(jsonb),public.billing_test_settle(jsonb) from public,anon,authenticated;
grant execute on function public.billing_test_request_refund(uuid,uuid),public.billing_test_settle_refund(jsonb),public.billing_test_settle(jsonb) to service_role;
commit;

