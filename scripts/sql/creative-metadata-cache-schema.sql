-- ISOLATED TEST SCHEMA CANDIDATE. NOT AN APPROVED PRODUCTION MIGRATION.
-- Requires existing anon/authenticated/service_role roles; tests create synthetic roles locally.
-- Changes ONLY the new cache namespace and its two service-only RPCs.
begin;
do $$ begin
 if current_setting('etrylue.creative_cache_sandbox',true) is distinct from '1' then
  raise exception 'SANDBOX_ONLY_NOT_A_PRODUCTION_MIGRATION';
 end if;
end $$;
create schema etrylue_creative_cache_v1;
revoke all on schema etrylue_creative_cache_v1 from public, anon, authenticated;
grant usage on schema etrylue_creative_cache_v1 to service_role;

create table etrylue_creative_cache_v1.accounts (
 account_key text primary key check(account_key ~ '^[0-9a-f]{64}$'),
 lease_token uuid, lease_until timestamptz not null default '-infinity',
 lease_keys text[] not null default '{}', next_allowed_at timestamptz not null default '-infinity',
 window_start timestamptz not null default clock_timestamp(), reserved_requests integer not null default 0 check(reserved_requests between 0 and 120)
);
create table etrylue_creative_cache_v1.entries (
 account_key text not null references etrylue_creative_cache_v1.accounts(account_key),
 cache_key text not null check(cache_key ~ '^[0-9a-f]{64}$'),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=16384),
 expires_at timestamptz not null, primary key(account_key,cache_key)
);
create index creative_cache_expiry_v1 on etrylue_creative_cache_v1.entries(account_key,expires_at);
alter table etrylue_creative_cache_v1.accounts enable row level security;
alter table etrylue_creative_cache_v1.entries enable row level security;
revoke all on all tables in schema etrylue_creative_cache_v1 from public,anon,authenticated;
grant select,insert,update on etrylue_creative_cache_v1.accounts to service_role;
grant select,insert,update,delete on etrylue_creative_cache_v1.entries to service_role;
-- service_role is the existing trusted backend BYPASSRLS role; no browser grants/policies.

create function public.claim_creative_metadata_cache_v1(p_account_key text,p_keys text[],p_max_requests integer)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='2000ms' set lock_timeout='500ms' as $$
declare a etrylue_creative_cache_v1.accounts%rowtype; n timestamptz; cached jsonb; found_count integer;
 state text; token uuid; retry timestamptz; deadline timestamptz;
begin
 if p_account_key is null or p_account_key !~ '^[0-9a-f]{64}$' or p_keys is null or cardinality(p_keys) not between 1 and 20
  or p_max_requests is null or p_max_requests not between 1 and 40
  or exists(select 1 from unnest(p_keys) k where k is null or k !~ '^[0-9a-f]{64}$')
  or (select count(distinct k) from unnest(p_keys) k)<>cardinality(p_keys) then raise exception 'INVALID_CACHE_INPUT'; end if;
 insert into etrylue_creative_cache_v1.accounts(account_key) values(p_account_key) on conflict do nothing;
 select * into strict a from etrylue_creative_cache_v1.accounts where account_key=p_account_key for update;
 n:=clock_timestamp();
 -- Bounded old-generation cleanup; never removes fresh values on a failed refresh.
 delete from etrylue_creative_cache_v1.entries where (account_key,cache_key) in
  (select account_key,cache_key from etrylue_creative_cache_v1.entries where account_key=p_account_key and expires_at<n-interval '1 day' order by expires_at limit 100);
 select coalesce(jsonb_agg(jsonb_build_object('key',cache_key,'metadata',payload,'expiresAt',floor(extract(epoch from expires_at)*1000)) order by cache_key),'[]'::jsonb),count(*)
 into cached,found_count from etrylue_creative_cache_v1.entries where account_key=p_account_key and cache_key=any(p_keys) and expires_at>n;
 if found_count=cardinality(p_keys) then state:='hit';
 elsif a.lease_until>n then state:='busy';retry:=a.lease_until;
 elsif a.next_allowed_at>n then state:='cooldown';retry:=a.next_allowed_at;
 else
  if a.window_start+interval '1 hour'<=n then a.window_start:=n;a.reserved_requests:=0;end if;
  if a.reserved_requests+p_max_requests>120 then state:='budget';retry:=a.window_start+interval '1 hour';
  else
   state:='leader';token:=gen_random_uuid();deadline:=n+interval '60 seconds';
   update etrylue_creative_cache_v1.accounts set lease_token=token,lease_until=deadline,lease_keys=p_keys,
    window_start=a.window_start,reserved_requests=a.reserved_requests+p_max_requests where account_key=p_account_key;
  end if;
 end if;
 return jsonb_build_object('status',state,'token',token,'leaseUntil',case when deadline is null then 0 else floor(extract(epoch from deadline)*1000) end,
  'now',floor(extract(epoch from n)*1000),'retryAt',case when retry is null then 0 else floor(extract(epoch from retry)*1000) end,'entries',cached);
end;
$$;

create function public.finish_creative_metadata_cache_v1(p_account_key text,p_token uuid,p_entries jsonb,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' set statement_timeout='2000ms' set lock_timeout='500ms' as $$
declare a etrylue_creative_cache_v1.accounts%rowtype; n timestamptz; e jsonb; payload jsonb; expiry timestamptz; asset jsonb;
 used_keys text[]:='{}';fetched timestamptz;cooldown interval;
begin
 if p_account_key is null or p_account_key !~ '^[0-9a-f]{64}$' or p_token is null or p_entries is null or jsonb_typeof(p_entries)<>'array'
  or jsonb_array_length(p_entries)>20 or octet_length(p_entries::text)>400000 or p_outcome is null or p_outcome not in ('success','failure','rate_limited') then raise exception 'INVALID_CACHE_INPUT';end if;
 select * into a from etrylue_creative_cache_v1.accounts where account_key=p_account_key for update;
 n:=clock_timestamp();
 if not found or a.lease_token is distinct from p_token or a.lease_until<=n then return false;end if;
 for e in select value from jsonb_array_elements(p_entries) loop
  payload:=e->'metadata';
  if jsonb_typeof(e)<>'object' or e->>'key' is null or not(e->>'key'=any(a.lease_keys)) or e->>'key'=any(used_keys)
   or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>16384
   or payload->>'status' is distinct from 'ready' or payload->>'temporalBasis' is distinct from 'observed_at_fetch'
   or payload->'issues' is distinct from '[]'::jsonb or jsonb_typeof(payload->'assets') is distinct from 'array'
   or exists(select 1 from jsonb_object_keys(payload) k where k not in ('identity','revision','fetchedAt','sourceUpdatedAt','temporalBasis','status','displayName','headlines','descriptions','assets','issues'))
   then raise exception 'INVALID_CACHE_ENTRY';end if;
  used_keys:=array_append(used_keys,e->>'key');
  fetched:=(payload->>'fetchedAt')::timestamptz;
  if fetched is null or fetched>n+interval '60 seconds' then raise exception 'INVALID_CACHE_TIME';end if;
  expiry:=least(n+interval '6 hours',fetched+interval '6 hours');
  for asset in select value from jsonb_array_elements(payload->'assets') loop
   if asset->>'expiresAt' is not null then expiry:=least(expiry,(asset->>'expiresAt')::timestamptz);end if;
  end loop;
  if expiry<=n then raise exception 'EXPIRED_CACHE_ENTRY';end if;
  insert into etrylue_creative_cache_v1.entries(account_key,cache_key,payload,expires_at) values(p_account_key,e->>'key',payload,expiry)
   on conflict(account_key,cache_key) do update set payload=excluded.payload,expires_at=excluded.expires_at;
 end loop;
 if (select count(*) from etrylue_creative_cache_v1.entries where account_key=p_account_key)>5000 then raise exception 'CACHE_CAPACITY';end if;
 cooldown:=case p_outcome when 'success' then interval '60 seconds' when 'rate_limited' then interval '15 minutes' else interval '5 minutes' end;
 update etrylue_creative_cache_v1.accounts set lease_token=null,lease_until='-infinity',lease_keys='{}',next_allowed_at=n+cooldown where account_key=p_account_key;
 return true;
end;
$$;
revoke all on function public.claim_creative_metadata_cache_v1(text,text[],integer) from public,anon,authenticated;
revoke all on function public.finish_creative_metadata_cache_v1(text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_creative_metadata_cache_v1(text,text[],integer) to service_role;
grant execute on function public.finish_creative_metadata_cache_v1(text,uuid,jsonb,text) to service_role;
commit;
