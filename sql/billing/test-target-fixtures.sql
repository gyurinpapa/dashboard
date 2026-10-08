-- Isolated billing DB ONLY: synthetic target hierarchy, no real customer data.
-- Requires SET LOCAL etrylue.billing_test_project = 'kbqyszbuxojofugqfjbh'.
-- Execute within one transaction. Never install in the production migrations path.
do $$ begin
  if current_setting('etrylue.billing_test_project', true) is distinct from 'kbqyszbuxojofugqfjbh'
     or to_regclass('public.reports') is not null
     or to_regclass('public.billing_test_orders') is null then
    raise exception 'Isolated billing fixture database required';
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public'
             and tablename not in ('billing_test_orders', 'billing_test_charges')) then
    raise exception 'Expected billing-only empty fixture database';
  end if;
end $$;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null check (status in ('active', 'inactive'))
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tenant_id uuid not null references public.tenants(id)
);
create index billing_fixture_workspace_tenant on public.workspaces(tenant_id);
create table public.advertisers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  workspace_id uuid not null references public.workspaces(id)
);
create index billing_fixture_advertiser_workspace on public.advertisers(workspace_id);
create table public.workspace_members (
  user_id uuid not null references auth.users(id),
  workspace_id uuid not null references public.workspaces(id),
  role text not null check (role in ('admin', 'director', 'staff', 'client')),
  primary key (user_id, workspace_id)
);
create table public.tenant_members (
  user_id uuid not null references auth.users(id),
  tenant_id uuid not null references public.tenants(id),
  role text not null check (role in ('owner', 'member')),
  primary key (user_id, tenant_id)
);

alter table public.tenants enable row level security;
alter table public.workspaces enable row level security;
alter table public.advertisers enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tenant_members enable row level security;
revoke all on public.tenants, public.workspaces, public.advertisers,
  public.workspace_members, public.tenant_members from public, anon, authenticated, service_role;
grant select on public.tenants, public.workspaces, public.advertisers,
  public.workspace_members, public.tenant_members to service_role;
-- Memberships stay empty until a user-created test Auth account is verified.
-- No automatic signup trigger or permission assignment.
insert into public.tenants(name, status) values
  ('결제 테스트 회사 A', 'active'), ('격리 검증 회사 B', 'active');
insert into public.workspaces(name, tenant_id)
select case name when '결제 테스트 회사 A' then '결제 테스트 워크스페이스 A'
  else '격리 검증 워크스페이스 B' end, id from public.tenants;
insert into public.advertisers(name, workspace_id)
select case name when '결제 테스트 워크스페이스 A' then '결제 테스트 광고주 A'
  else '격리 검증 광고주 B' end, id from public.workspaces;
