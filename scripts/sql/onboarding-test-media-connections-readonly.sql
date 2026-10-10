-- Isolated onboarding test project lpwmxtnzpgyrhphwufsd only.
-- Production-compatible columns; intentionally SELECT-only service access.
set local lock_timeout='2s';
set local statement_timeout='8s';
create table public.media_connections (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 advertiser_id uuid not null,
 provider text not null check(provider in ('naver_searchad','google_ads','meta_ads')),
 external_account_id text not null check(length(trim(external_account_id))>0),
 external_account_name text,
 credential_ciphertext text,
 credential_version integer not null default 1 check(credential_version>=1),
 status text not null default 'active' check(status in ('active','disconnected','error')),
 connected_at timestamptz,
 last_verified_at timestamptz,
 last_sync_at timestamptz,
 last_error text,
 meta jsonb not null default '{}'::jsonb check(jsonb_typeof(meta)='object'),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 tenant_id uuid references public.tenants(id) on delete restrict,
 unique(tenant_id,workspace_id,advertiser_id,id),
 check(status<>'active' or credential_ciphertext is not null)
);
alter table public.media_connections enable row level security;
revoke all on public.media_connections from public,anon,authenticated,service_role;
grant select on public.media_connections to service_role;
notify pgrst,'reload schema';

