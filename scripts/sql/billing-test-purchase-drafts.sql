-- Apply ONLY to isolated payment project kbqyszbuxojofugqfjbh.
create table public.billing_test_purchase_drafts (
 order_id uuid primary key,
 user_id uuid not null,
 target_id uuid not null unique,
 workspace_id uuid not null,
 tenant_id uuid,
 name text not null check(length(trim(name)) between 1 and 100),
 created_at timestamptz not null default now()
);
alter table public.billing_test_purchase_drafts enable row level security;
revoke all on public.billing_test_purchase_drafts from public,anon,authenticated,service_role;
grant select,insert on public.billing_test_purchase_drafts to service_role;
