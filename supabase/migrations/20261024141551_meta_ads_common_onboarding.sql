-- Verified Meta enrollment and isolated collection queue. No legacy/Naver scheduler changes.
create table public.meta_ads_daily_enrollments (
  connection_id uuid primary key, tenant_id uuid not null, workspace_id uuid not null, advertiser_id uuid not null,
  generation uuid not null default gen_random_uuid(), enabled boolean not null default true,
  start_date date not null, policy jsonb not null, credential_fingerprint text not null,
  verified_at timestamptz not null, verified_by uuid, proof jsonb not null,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique(tenant_id,workspace_id,advertiser_id,connection_id),
  foreign key(tenant_id,workspace_id,advertiser_id,connection_id)
    references public.media_connections(tenant_id,workspace_id,advertiser_id,id) on delete restrict
);
create table public.meta_ads_collection_queue (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null, tenant_id uuid not null,
  workspace_id uuid not null, advertiser_id uuid not null, generation uuid not null, target_date date not null,
  reason text not null check(reason in ('initial','scheduled','catchup')),
  status text not null default 'pending' check(status in ('pending','processing','done','failed','cancelled')),
  attempts integer not null default 0, lease uuid, lease_until timestamptz, error_code text,
  next_attempt_at timestamptz not null default clock_timestamp(), created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
  unique(connection_id,target_date,generation),
  foreign key(tenant_id,workspace_id,advertiser_id,connection_id)
    references public.meta_ads_daily_enrollments(tenant_id,workspace_id,advertiser_id,connection_id) on delete restrict
);
create index meta_ads_collection_queue_due_idx on public.meta_ads_collection_queue(next_attempt_at,created_at,id)
  where status in ('pending','processing');
alter table public.meta_ads_daily_enrollments enable row level security;
alter table public.meta_ads_collection_queue enable row level security;
revoke all on public.meta_ads_daily_enrollments,public.meta_ads_collection_queue from public,anon,authenticated;
grant select,insert,update,delete on public.meta_ads_daily_enrollments,public.meta_ads_collection_queue to service_role;
alter table public.meta_ads_daily_runs add column enrollment_generation uuid;

-- Preserve already approved collection and its completed runs without changing connections or facts.
insert into public.meta_ads_daily_enrollments(connection_id,tenant_id,workspace_id,advertiser_id,start_date,policy,
  credential_fingerprint,verified_at,proof)
select id,tenant_id,workspace_id,advertiser_id,(meta#>>'{meta_ads_daily,start_date}')::date,meta->'meta_ads_reporting',
  md5(credential_ciphertext),last_verified_at,jsonb_build_object('source','existing_approved_daily_connection')
from public.media_connections where provider='meta_ads' and status='active' and credential_version=1 and last_verified_at is not null
  and nullif(credential_ciphertext,'') is not null and tenant_id is not null
  and meta#>>'{meta_ads_daily,contract}'='meta_daily_v1' and meta#>'{meta_ads_daily,enabled}'='true'::jsonb
  and meta#>>'{meta_ads_daily,start_date}'~'^\d{4}-\d{2}-\d{2}$'
  and meta->'meta_ads_reporting'=jsonb_build_object('contract','meta_contact_snapshot_v1','enabled',true,
    'external_account_id',external_account_id,'currency','KRW','time_zone','Asia/Seoul','conversion_field','conversions',
    'conversion_action_type','contact_website','missing_conversion','zero_after_complete_reconciliation',
    'revenue','not_provided','attribution','platform_default','report_type','db');
update public.meta_ads_daily_runs r set enrollment_generation=e.generation from public.meta_ads_daily_enrollments e where e.connection_id=r.connection_id;

create or replace function public.meta_ads_daily_eligible_v1()
returns table(connection_id uuid,tenant_id uuid,workspace_id uuid,advertiser_id uuid,generation uuid,start_date date)
language sql stable security invoker set search_path=pg_catalog,public as $$
  select e.connection_id,e.tenant_id,e.workspace_id,e.advertiser_id,e.generation,e.start_date
  from public.meta_ads_daily_enrollments e join public.media_connections c on c.id=e.connection_id
    and c.tenant_id=e.tenant_id and c.workspace_id=e.workspace_id and c.advertiser_id=e.advertiser_id
  where current_user='service_role' and e.enabled and c.provider='meta_ads' and c.status='active' and c.credential_version=1
    and c.last_verified_at>=e.verified_at and e.credential_fingerprint=md5(c.credential_ciphertext)
    and e.policy=c.meta->'meta_ads_reporting'
    and e.policy=jsonb_build_object('contract','meta_contact_snapshot_v1','enabled',true,'external_account_id',c.external_account_id,
      'currency','KRW','time_zone','Asia/Seoul','conversion_field','conversions','conversion_action_type','contact_website',
      'missing_conversion','zero_after_complete_reconciliation','revenue','not_provided','attribution','platform_default','report_type','db')
    and c.meta#>>'{meta_ads_daily,contract}'='meta_daily_v1' and c.meta#>'{meta_ads_daily,enabled}'='true'::jsonb
    and c.meta#>>'{meta_ads_daily,start_date}'=e.start_date::text and c.meta#>>'{meta_ads_daily,time_zone}'='Asia/Seoul'
    and c.meta#>>'{meta_ads_daily,schedule}'='0 20 * * *' and c.meta#>'{meta_ads_daily,lookback_days}'='7'::jsonb;
$$;
revoke all on function public.meta_ads_daily_eligible_v1() from public,anon,authenticated;
grant execute on function public.meta_ads_daily_eligible_v1() to service_role;

create or replace function public.activate_meta_ads_daily_connection_v1(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare c public.media_connections%rowtype; e public.meta_ads_daily_enrollments%rowtype;
  v_start date; v_target date:=(clock_timestamp() at time zone 'Asia/Seoul')::date-1;
  v_policy jsonb; v_proof jsonb; v_key text; v_cipher text; v_generation uuid:=gen_random_uuid();
  v_now timestamptz:=clock_timestamp(); v_status text; v_unchanged boolean:=false;
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>131072 or
    (select count(*) from jsonb_object_keys(p_payload))<>10 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
      ('connection_id','workspace_id','advertiser_id','user_id','external_account_id','expected_updated_at','replacement_ciphertext','start_date','policy','proof')) then
    raise exception 'META_SETUP_INVALID_INPUT'; end if;
  foreach v_key in array array['connection_id','workspace_id','advertiser_id','user_id'] loop
    if coalesce(p_payload->>v_key,'')!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'META_SETUP_INVALID_INPUT'; end if;
  end loop;
  select * into c from public.media_connections where id=(p_payload->>'connection_id')::uuid
    and workspace_id=(p_payload->>'workspace_id')::uuid and advertiser_id=(p_payload->>'advertiser_id')::uuid and provider='meta_ads' for update;
  if not found or c.tenant_id is null or c.status not in ('active','error') or c.credential_version<>1 or
    c.external_account_id is distinct from p_payload->>'external_account_id' or
    c.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then raise exception 'META_CONTACT_CHANGED'; end if;
  v_start:=(p_payload->>'start_date')::date;
  if v_start is null or v_start>v_target or v_start<v_target-365 then raise exception 'META_SETUP_INVALID_RANGE'; end if;
  v_policy:=jsonb_build_object('contract','meta_contact_snapshot_v1','enabled',true,'external_account_id',c.external_account_id,
    'currency','KRW','time_zone','Asia/Seoul','conversion_field','conversions','conversion_action_type','contact_website',
    'missing_conversion','zero_after_complete_reconciliation','revenue','not_provided','attribution','platform_default','report_type','db');
  if v_policy is distinct from p_payload->'policy' then raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  v_proof:=p_payload->'proof';
  if jsonb_typeof(v_proof) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_proof))<>7 or
    v_proof->'complete' is distinct from 'true'::jsonb or (v_proof->>'date_to')::date is distinct from v_target or
    (v_proof->>'date_from')::date is distinct from greatest(v_start,v_target-6) or
    coalesce(v_proof->>'page_count','')!~'^[1-5]$' or coalesce(v_proof->>'row_count','')!~'^(0|[1-9][0-9]*)$' or
    (v_proof->>'row_count')::integer>2500 or coalesce(v_proof->>'evidence','') not in ('reported','omitted_on_complete_insights','no_data') or
    jsonb_typeof(v_proof->'totals') is distinct from 'object' or (select count(*) from jsonb_object_keys(v_proof->'totals'))<>4 then
    raise exception 'META_SETUP_INVALID_INPUT'; end if;
  foreach v_key in array array['impressions','clicks','spend','website_contacts'] loop
    if coalesce(v_proof#>>array['totals',v_key],'')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
      (v_proof#>>array['totals',v_key])::numeric>9007199254740991 then raise exception 'META_SETUP_INVALID_INPUT'; end if;
  end loop;
  if (v_proof->>'evidence'<>'reported' and (v_proof#>>'{totals,website_contacts}')::numeric<>0) or
    (v_proof->>'evidence'='no_data' and ((v_proof->>'row_count')::integer<>0 or
      (v_proof#>>'{totals,impressions}')::numeric<>0 or (v_proof#>>'{totals,clicks}')::numeric<>0 or (v_proof#>>'{totals,spend}')::numeric<>0)) then
    raise exception 'META_SETUP_INVALID_INPUT'; end if;
  if p_payload->'replacement_ciphertext' is distinct from 'null'::jsonb and
    (jsonb_typeof(p_payload->'replacement_ciphertext') is distinct from 'string' or
      length(p_payload->>'replacement_ciphertext') not between 32 and 65536 or (p_payload->>'replacement_ciphertext')~'[[:cntrl:]]') then
    raise exception 'META_SETUP_INVALID_INPUT'; end if;
  v_cipher:=coalesce(p_payload->>'replacement_ciphertext',c.credential_ciphertext);
  if nullif(v_cipher,'') is null then raise exception 'META_SETUP_INVALID_INPUT'; end if;
  select * into e from public.meta_ads_daily_enrollments where connection_id=c.id for update;
  if found and e.enabled and e.start_date=v_start and e.policy=v_policy and e.credential_fingerprint=md5(v_cipher)
    and exists(select 1 from public.meta_ads_daily_eligible_v1() where connection_id=c.id)
    and coalesce(c.meta#>>'{meta_ads_daily_status,status}','') not in ('failed','partial') then
    v_generation:=e.generation; v_unchanged:=true;
  else
    update public.media_connections set credential_ciphertext=v_cipher,status='active',last_verified_at=v_now,
      connected_at=coalesce(connected_at,v_now),last_error=null,updated_at=v_now,
      meta=meta||jsonb_build_object('currency','KRW','timezone','Asia/Seoul','meta_ads_reporting',v_policy,
        'meta_ads_daily',jsonb_build_object('contract','meta_daily_v1','enabled',true,'start_date',v_start,
          'time_zone','Asia/Seoul','schedule','0 20 * * *','lookback_days',7),
        'meta_ads_daily_status',coalesce(meta->'meta_ads_daily_status','{}'::jsonb)||jsonb_build_object(
          'status','pending','target_date',v_target,'start_date',v_start,'queued_at',v_now,'error_code',null)) where id=c.id;
    insert into public.meta_ads_daily_enrollments(connection_id,tenant_id,workspace_id,advertiser_id,generation,start_date,policy,
      credential_fingerprint,verified_at,verified_by,proof)
      values(c.id,c.tenant_id,c.workspace_id,c.advertiser_id,v_generation,v_start,v_policy,md5(v_cipher),v_now,(p_payload->>'user_id')::uuid,v_proof)
      on conflict(connection_id) do update set generation=excluded.generation,enabled=true,start_date=excluded.start_date,
        policy=excluded.policy,credential_fingerprint=excluded.credential_fingerprint,verified_at=excluded.verified_at,
        verified_by=excluded.verified_by,proof=excluded.proof,updated_at=v_now;
    update public.meta_ads_collection_queue set status='cancelled',error_code='META_SETUP_CHANGED',updated_at=v_now,finished_at=v_now
      where connection_id=c.id and generation<>v_generation and status in ('pending','processing');
  end if;
  insert into public.meta_ads_collection_queue(connection_id,tenant_id,workspace_id,advertiser_id,generation,target_date,reason)
    values(c.id,c.tenant_id,c.workspace_id,c.advertiser_id,v_generation,v_target,'initial') on conflict(connection_id,target_date,generation) do nothing;
  select status into v_status from public.meta_ads_collection_queue where connection_id=c.id and target_date=v_target and generation=v_generation;
  return jsonb_build_object('connection_id',c.id,'enabled',true,'initial_status',v_status,'already_enabled',v_unchanged);
end; $$;
revoke all on function public.activate_meta_ads_daily_connection_v1(jsonb) from public,anon,authenticated;
grant execute on function public.activate_meta_ads_daily_connection_v1(jsonb) to service_role;

create or replace function public.enqueue_meta_ads_daily_batch_v1(p_target_date date)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare v_count integer;
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if p_target_date is distinct from (clock_timestamp() at time zone 'Asia/Seoul')::date-1 then raise exception 'META_DAILY_INVALID_RANGE'; end if;
  insert into public.meta_ads_collection_queue(connection_id,tenant_id,workspace_id,advertiser_id,generation,target_date,reason)
    select connection_id,tenant_id,workspace_id,advertiser_id,generation,p_target_date,'scheduled'
    from public.meta_ads_daily_eligible_v1() where start_date<=p_target_date
    on conflict(connection_id,target_date,generation) do nothing;
  get diagnostics v_count=row_count;
  return jsonb_build_object('target_date',p_target_date,'enqueued',v_count);
end; $$;
revoke all on function public.enqueue_meta_ads_daily_batch_v1(date) from public,anon,authenticated;
grant execute on function public.enqueue_meta_ads_daily_batch_v1(date) to service_role;

create or replace function public.claim_meta_ads_collection_task_v1(p_lease uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare q public.meta_ads_collection_queue%rowtype; v_now timestamptz:=clock_timestamp(); v_target date:=(clock_timestamp() at time zone 'Asia/Seoul')::date-1;
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if p_lease is null then raise exception 'META_DAILY_INVALID_INPUT'; end if;
  -- Work missed across midnight is covered by the next complete-date target, never silently lost.
  insert into public.meta_ads_collection_queue(connection_id,tenant_id,workspace_id,advertiser_id,generation,target_date,reason)
    select distinct e.connection_id,e.tenant_id,e.workspace_id,e.advertiser_id,e.generation,v_target,'catchup'
    from public.meta_ads_collection_queue old join public.meta_ads_daily_eligible_v1() e
      on e.connection_id=old.connection_id and e.generation=old.generation
    where old.target_date<v_target and old.status in ('pending','processing') and coalesce(old.lease_until,v_now)<=v_now
    on conflict(connection_id,target_date,generation) do nothing;
  update public.meta_ads_collection_queue old set status='cancelled',error_code='META_TASK_SUPERSEDED',updated_at=v_now,finished_at=v_now
    where old.status in ('pending','processing') and coalesce(old.lease_until,v_now)<=v_now and
      (old.target_date<v_target or not exists(select 1 from public.meta_ads_daily_eligible_v1() e where e.connection_id=old.connection_id and e.generation=old.generation));
  update public.meta_ads_collection_queue set status='failed',error_code='META_TASK_ATTEMPTS_EXHAUSTED',updated_at=v_now,finished_at=v_now
    where status='processing' and lease_until<=v_now and attempts>=3;
  select t.* into q from public.meta_ads_collection_queue t join public.meta_ads_daily_eligible_v1() e
    on e.connection_id=t.connection_id and e.generation=t.generation
    where t.target_date=v_target and t.attempts<3 and t.next_attempt_at<=v_now and
      (t.status='pending' or (t.status='processing' and t.lease_until<=v_now))
    order by t.next_attempt_at,t.created_at,t.id limit 1 for update of t skip locked;
  if not found then return null; end if;
  update public.meta_ads_collection_queue set status='processing',lease=p_lease,lease_until=v_now+interval '20 minutes',
    attempts=attempts+1,updated_at=v_now,error_code=null where id=q.id returning * into q;
  return jsonb_build_object('id',q.id,'connection_id',q.connection_id,'target_date',q.target_date,'attempt',q.attempts);
end; $$;
revoke all on function public.claim_meta_ads_collection_task_v1(uuid) from public,anon,authenticated;
grant execute on function public.claim_meta_ads_collection_task_v1(uuid) to service_role;

create or replace function public.finish_meta_ads_collection_task_v1(p_task_id uuid,p_lease uuid,p_error text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare q public.meta_ads_collection_queue%rowtype; r public.meta_ads_daily_runs%rowtype; v_status text; v_now timestamptz:=clock_timestamp();
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if p_error is not null and (length(p_error)>100 or p_error!~'^[A-Z_]+$') then raise exception 'META_DAILY_INVALID_INPUT'; end if;
  select * into q from public.meta_ads_collection_queue where id=p_task_id for update;
  if not found or q.status<>'processing' or q.lease is distinct from p_lease or q.lease_until<=v_now then raise exception 'META_DAILY_LEASE_LOST'; end if;
  if not exists(select 1 from public.meta_ads_daily_eligible_v1() e where e.connection_id=q.connection_id and e.generation=q.generation) then
    update public.meta_ads_collection_queue set status='cancelled',error_code='META_SETUP_CHANGED',updated_at=v_now,finished_at=v_now where id=q.id;
    return jsonb_build_object('status','cancelled'); end if;
  select * into r from public.meta_ads_daily_runs where connection_id=q.connection_id and target_date=q.target_date and enrollment_generation=q.generation;
  if found and r.status='processing' and r.lease_until>v_now then
    update public.meta_ads_collection_queue set status='pending',attempts=greatest(0,attempts-1),next_attempt_at=r.lease_until+interval '1 second',
      lease=null,lease_until=null,updated_at=v_now where id=q.id;
    return jsonb_build_object('status','pending'); end if;
  v_status:=case when r.status='done' and p_error is null then 'done' when q.attempts<3 then 'pending' else 'failed' end;
  update public.meta_ads_collection_queue set status=v_status,error_code=case when v_status='done' then null else coalesce(p_error,r.error_code,'META_DAILY_INCOMPLETE') end,
    lease=null,lease_until=null,next_attempt_at=v_now+case when q.attempts=1 then interval '1 minute' else interval '5 minutes' end,
    updated_at=v_now,finished_at=case when v_status in ('done','failed') then v_now else null end where id=q.id;
  return jsonb_build_object('status',v_status);
end; $$;
revoke all on function public.finish_meta_ads_collection_task_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_meta_ads_collection_task_v1(uuid,uuid,text) to service_role;

-- Enrollment generation fences credential changes and in-flight runs.
create or replace function public.claim_meta_ads_daily_run_v1(p_connection_id uuid,p_target_date date,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public set lock_timeout='3s' as $$
declare c public.media_connections%rowtype; r public.meta_ads_daily_runs%rowtype; v_start date; v_collect date; v_generation uuid; v_now timestamptz:=clock_timestamp();
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if p_lease is null or p_target_date is distinct from (v_now at time zone 'Asia/Seoul')::date-1 then
    raise exception 'META_DAILY_INVALID_RANGE'; end if;
  select * into c from public.media_connections where id=p_connection_id and provider='meta_ads' for update;
  if not found or c.status<>'active' or c.credential_version<>1 or nullif(c.credential_ciphertext,'') is null or
    c.last_verified_at is null or c.meta#>>'{meta_ads_daily,contract}' is distinct from 'meta_daily_v1' or
    c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb or
    c.meta#>>'{meta_ads_daily,time_zone}' is distinct from 'Asia/Seoul' or
    c.meta#>>'{meta_ads_daily,schedule}' is distinct from '0 20 * * *' or
    c.meta#>'{meta_ads_daily,lookback_days}' is distinct from '7'::jsonb or
    c.meta#>>'{meta_ads_reporting,contract}' is distinct from 'meta_contact_snapshot_v1' or
    c.meta#>'{meta_ads_reporting,enabled}' is distinct from 'true'::jsonb or
    c.meta#>>'{meta_ads_reporting,currency}' is distinct from 'KRW' or
    c.meta#>>'{meta_ads_reporting,time_zone}' is distinct from 'Asia/Seoul' then
    raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  select generation into v_generation from public.meta_ads_daily_eligible_v1() where connection_id=c.id;
  if not found then raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  v_start:=(c.meta#>>'{meta_ads_daily,start_date}')::date;
  if v_start is null or v_start>p_target_date or p_target_date-v_start>3660 then raise exception 'META_DAILY_INVALID_RANGE'; end if;
  if exists(select 1 from public.meta_ads_daily_runs where connection_id=c.id and enrollment_generation=v_generation and status='processing' and lease_until>v_now) then
    return jsonb_build_object('claimed',false,'reason','leased'); end if;
  select * into r from public.meta_ads_daily_runs where connection_id=c.id and target_date=p_target_date for update;
  if found and r.status='done' and r.start_date=v_start and r.enrollment_generation=v_generation then return jsonb_build_object('claimed',false,'reason','already_done'); end if;
  update public.media_connections set meta=jsonb_set(meta,'{meta_ads_daily_status}',
    coalesce(meta->'meta_ads_daily_status','{}'::jsonb)||jsonb_build_object('status','processing','target_date',p_target_date,
      'start_date',v_start,'last_attempt_at',v_now,'error_code',null),true),updated_at=v_now where id=c.id returning * into c;
  insert into public.meta_ads_daily_runs(connection_id,target_date,start_date,connection_updated_at,lease,lease_until,status,enrollment_generation)
    values(c.id,p_target_date,v_start,c.updated_at,p_lease,v_now+interval '20 minutes','processing',v_generation)
    on conflict(connection_id,target_date) do update set lease=excluded.lease,lease_until=excluded.lease_until,
      start_date=excluded.start_date,connection_updated_at=excluded.connection_updated_at,status='processing',
      enrollment_generation=excluded.enrollment_generation,
      attempts=meta_ads_daily_runs.attempts+1,error_code=null,started_at=v_now,finished_at=null returning * into r;
  select min(d::date) into v_collect from generate_series(v_start::timestamp,p_target_date::timestamp,interval '1 day') d
    where not exists(select 1 from public.meta_ads_daily_partitions p where p.connection_id=c.id and p.date=d::date and p.policy=c.meta->'meta_ads_reporting');
  return jsonb_build_object('claimed',true,'run_id',r.id,'connection_updated_at',c.updated_at,
    'collection_start',greatest(v_start,least(coalesce(v_collect,p_target_date-6),p_target_date-6)));
end; $$;
revoke all on function public.claim_meta_ads_daily_run_v1(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.claim_meta_ads_daily_run_v1(uuid,date,uuid) to service_role;

