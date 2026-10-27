-- Explicit opt-in: website Contact + Instant Form submissions. Aggregate lead aliases are excluded.
-- Existing 11-key website-only policies and all Naver contracts remain valid and unchanged.
create or replace function public.meta_ads_contact_policy_valid_v1(p jsonb, account_id text, krw_only boolean default false)
returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
  select coalesce(jsonb_typeof(p)='object' and
    (not (p ? 'instant_form') or p->'instant_form'='{"field":"actions","action_type":"onsite_conversion.lead_grouped"}'::jsonb) and
    (p-'instant_form')=jsonb_build_object('contract','meta_contact_snapshot_v1','enabled',true,'external_account_id',account_id,
      'currency',p->>'currency','time_zone',p->>'time_zone','conversion_field','conversions','conversion_action_type','contact_website',
      'missing_conversion','zero_after_complete_reconciliation','revenue','not_provided','attribution','platform_default','report_type','db') and
    account_id~'^[1-9][0-9]{0,29}$' and p->>'currency'~'^[A-Z]{3}$' and
    exists(select 1 from pg_timezone_names where name=p->>'time_zone') and
    (not krw_only or (p->>'currency'='KRW' and p->>'time_zone'='Asia/Seoul')),false);
$$;
create or replace function public.meta_ads_contact_metric_keys_v1(p jsonb)
returns text[] language sql immutable security invoker set search_path=pg_catalog,public as $$
  select array['impressions','clicks','spend','website_contacts']::text[] ||
    case when p ? 'instant_form' then array['instant_form_submissions','total_conversions']::text[] else '{}'::text[] end;
$$;
create or replace function public.meta_ads_contact_totals_valid_v1(t jsonb,p jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare k text;
begin
  if jsonb_typeof(t) is distinct from 'object' or
    (select count(*) from jsonb_object_keys(t))<>cardinality(public.meta_ads_contact_metric_keys_v1(p)) then return false; end if;
  foreach k in array public.meta_ads_contact_metric_keys_v1(p) loop
    if coalesce(t->>k,'')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or (t->>k)::numeric>9007199254740991 then return false; end if;
  end loop;
  return not (p ? 'instant_form') or (t->>'total_conversions')::numeric=
    (t->>'website_contacts')::numeric+(t->>'instant_form_submissions')::numeric;
end; $$;
create or replace function public.meta_ads_contact_row_meta_valid_v1(r jsonb,p jsonb)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare m jsonb:=r->'provider_meta'; expected jsonb; k text;
begin
  expected:=jsonb_build_object('contract','meta_contact_snapshot_v1','api_version','v26.0','level','ad','time_increment',1,
    'currency',p->>'currency','time_zone',p->>'time_zone','conversion_field','conversions','conversion_action_type','contact_website',
    'conversion_value_source',m->>'conversion_value_source','revenue_status','not_provided','attribution','platform_default');
  if p ? 'instant_form' then
    foreach k in array array['website_contacts','instant_form_submissions'] loop
      if jsonb_typeof(m->k) is distinct from 'number' or coalesce(m->>k,'')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
        (m->>k)::numeric>9007199254740991 then return false; end if;
    end loop;
    if (r->>'conversions')::numeric is distinct from (m->>'website_contacts')::numeric+(m->>'instant_form_submissions')::numeric then return false; end if;
    expected:=expected||jsonb_build_object('instant_form',p->'instant_form','website_contacts',m->'website_contacts',
      'instant_form_submissions',m->'instant_form_submissions');
  end if;
  return m is not distinct from expected;
end; $$;
create or replace function public.meta_ads_contact_totals_v1(rows jsonb,p jsonb)
returns jsonb language sql immutable security invoker set search_path=pg_catalog,public as $$
  select jsonb_build_object('impressions',coalesce(sum((x->>'impressions')::numeric),0),
    'clicks',coalesce(sum((x->>'clicks')::numeric),0),'spend',coalesce(sum((x->>'cost')::numeric),0),
    'website_contacts',coalesce(sum(case when p ? 'instant_form' then (x#>>'{provider_meta,website_contacts}')::numeric
      else (x->>'conversions')::numeric end),0)) ||
    case when p ? 'instant_form' then jsonb_build_object(
      'instant_form_submissions',coalesce(sum((x#>>'{provider_meta,instant_form_submissions}')::numeric),0),
      'total_conversions',coalesce(sum((x->>'conversions')::numeric),0)) else '{}'::jsonb end
    from jsonb_array_elements(rows) x;
$$;
revoke all on function public.meta_ads_contact_policy_valid_v1(jsonb,text,boolean),public.meta_ads_contact_metric_keys_v1(jsonb),
  public.meta_ads_contact_totals_valid_v1(jsonb,jsonb),public.meta_ads_contact_row_meta_valid_v1(jsonb,jsonb),
  public.meta_ads_contact_totals_v1(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.meta_ads_contact_policy_valid_v1(jsonb,text,boolean),public.meta_ads_contact_metric_keys_v1(jsonb),
  public.meta_ads_contact_totals_valid_v1(jsonb,jsonb),public.meta_ads_contact_row_meta_valid_v1(jsonb,jsonb),
  public.meta_ads_contact_totals_v1(jsonb,jsonb) to service_role;


CREATE OR REPLACE FUNCTION public.activate_meta_ads_daily_connection_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
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
  v_policy:=p_payload->'policy';
  if not public.meta_ads_contact_policy_valid_v1(v_policy,c.external_account_id,true) then raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  v_proof:=p_payload->'proof';
  if jsonb_typeof(v_proof) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_proof))<>7 or
    v_proof->'complete' is distinct from 'true'::jsonb or (v_proof->>'date_to')::date is distinct from v_target or
    (v_proof->>'date_from')::date is distinct from greatest(v_start,v_target-6) or
    coalesce(v_proof->>'page_count','')!~'^[1-5]$' or coalesce(v_proof->>'row_count','')!~'^(0|[1-9][0-9]*)$' or
    (v_proof->>'row_count')::integer>2500 or coalesce(v_proof->>'evidence','') not in ('reported','omitted_on_complete_insights','no_data') or
    not public.meta_ads_contact_totals_valid_v1(v_proof->'totals',v_policy) then
    raise exception 'META_SETUP_INVALID_INPUT'; end if;
  foreach v_key in array public.meta_ads_contact_metric_keys_v1(v_policy) loop
    if coalesce(v_proof#>>array['totals',v_key],'')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
      (v_proof#>>array['totals',v_key])::numeric>9007199254740991 then raise exception 'META_SETUP_INVALID_INPUT'; end if;
  end loop;
  if (v_proof->>'evidence'<>'reported' and coalesce(v_proof#>>'{totals,total_conversions}',v_proof#>>'{totals,website_contacts}')::numeric<>0) or
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
end; $function$
;


CREATE OR REPLACE FUNCTION public.attach_daily_report_meta_v1(p_report_id uuid, p_connection_ids uuid[], p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
declare r public.reports%rowtype; c public.media_connections%rowtype; v_existing uuid[]; v_new uuid[]; v_attached uuid;
begin
  if current_user<>'service_role' then raise exception 'DAILY_META_FORBIDDEN'; end if;
  if p_user_id is null or cardinality(p_connection_ids) not between 1 and 16 or p_connection_ids is null or
    array_position(p_connection_ids,null) is not null or
    cardinality(p_connection_ids)<>(select count(distinct id) from unnest(p_connection_ids) id) then
    raise exception 'DAILY_META_INVALID_SELECTION'; end if;
  -- Add-only. Existing source mappings and the automation contract never change.
  select * into r from public.reports where id=p_report_id for update;
  if not found or r.status not in ('draft','ready') then raise exception 'DAILY_META_REPORT_REQUIRED'; end if;
  if (select count(*) from public.media_connections where id=any(p_connection_ids) and tenant_id=r.tenant_id
    and workspace_id=r.workspace_id and advertiser_id=r.advertiser_id and status='active'
    and nullif(credential_ciphertext,'') is not null)<>cardinality(p_connection_ids) then
    raise exception 'DAILY_META_SCOPE_MISMATCH'; end if;
  select coalesce(array_agg(connection_id),'{}'::uuid[]) into v_existing from (
    select connection_id from public.report_media_connections where report_id=r.id
    union select connection_id from public.manual_report_media_connections where report_id=r.id
    union select connection_id from public.daily_report_meta_connections where report_id=r.id
  ) m;
  select coalesce(array_agg(id),'{}'::uuid[]) into v_new from unnest(p_connection_ids) id where not(id=any(v_existing));
  if cardinality(v_new)=0 then return jsonb_build_object('status','unchanged'); end if;
  if cardinality(v_new)<>1 or r.meta#>>'{data_source,kind}' is distinct from 'api' or
    r.meta#>>'{data_source,provider}' is distinct from 'naver_searchad' or
    r.meta#>>'{public_identity,period_type}' is distinct from 'daily_sync' or
    r.meta#>>'{media_sync,auto_sync,contract}' is distinct from 'daily_report_v2' or
    r.meta#>>'{media_sync,auto_sync,start_date}' is distinct from r.meta#>>'{public_identity,period_key}' or
    not exists(select 1 from public.report_types where id=r.report_type_id and key='db') or
    (select count(*) from public.report_media_connections where report_id=r.id)<>1 or
    not exists(select 1 from public.report_media_connections m join public.media_connections n on n.id=m.connection_id
      where m.report_id=r.id and n.provider='naver_searchad' and n.tenant_id=r.tenant_id
      and n.workspace_id=r.workspace_id and n.advertiser_id=r.advertiser_id) then
    raise exception 'DAILY_META_UNSUPPORTED_REPORT'; end if;
  select * into c from public.media_connections where id=v_new[1] and provider='meta_ads';
  if not found or c.credential_version<>1 or c.last_verified_at is null or
    not public.meta_ads_contact_policy_valid_v1(c.meta->'meta_ads_reporting',c.external_account_id,true) or
    c.meta#>>'{meta_ads_daily,contract}' is distinct from 'meta_daily_v1' or
    c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb or
    (c.meta#>>'{meta_ads_daily,start_date}')::date>(r.meta#>>'{public_identity,period_key}')::date then
    raise exception 'DAILY_META_POLICY_REQUIRED'; end if;
  select connection_id into v_attached from public.daily_report_meta_connections where report_id=r.id;
  if found and v_attached<>c.id then raise exception 'DAILY_META_ALREADY_ATTACHED'; end if;
  insert into public.daily_report_meta_connections(report_id,connection_id,tenant_id,workspace_id,advertiser_id,created_by)
    values(r.id,c.id,r.tenant_id,r.workspace_id,r.advertiser_id,p_user_id);
  update public.reports set meta=jsonb_set(coalesce(meta,'{}'::jsonb),'{daily_meta_attachment}',
    jsonb_build_object('contract','daily_meta_attachment_v1','connection_id',c.id),true) where id=r.id;
  return jsonb_build_object('status','attached','connection_id',c.id);
end; $function$
;


CREATE OR REPLACE FUNCTION public.create_naver_meta_report_v1(p_workspace_id uuid, p_advertiser_id uuid, p_connection_ids uuid[], p_report_type_id uuid, p_title text, p_period_start date, p_period_end date, p_created_by uuid, p_meta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
declare
  v_meta_id uuid;
  v_count integer;
  v_result jsonb;
  v_meta jsonb;
  v_report public.reports%rowtype;
begin
  if current_user <> 'service_role' then raise exception 'API_REPORT_SCOPE_INVALID: service only'; end if;
  if p_connection_ids is null or cardinality(p_connection_ids) not between 2 and 16 or
     array_position(p_connection_ids,null) is not null or
     cardinality(p_connection_ids) <> (select count(distinct id) from unnest(p_connection_ids) id) or
     jsonb_typeof(p_meta) is distinct from 'object' or p_meta#>'{media_sync,auto_sync}' is not null or
     p_meta#>>'{public_identity,period_type}'='daily_sync' or
     not exists(select 1 from public.report_types where id=p_report_type_id and key='db') then
    raise exception 'API_REPORT_INVALID_INPUT: manual DB report requires one Meta and Naver';
  end if;
  perform 1 from public.media_connections where id=any(p_connection_ids) order by id for share;
  select count(*),min(id::text) filter(where provider='meta_ads')::uuid into v_count,v_meta_id
    from public.media_connections where id=any(p_connection_ids) and workspace_id=p_workspace_id and advertiser_id=p_advertiser_id
      and status='active' and nullif(credential_ciphertext,'') is not null and provider in ('naver_searchad','meta_ads');
  if v_count <> cardinality(p_connection_ids) or v_meta_id is null or
     (select count(*) from public.media_connections where id=any(p_connection_ids) and provider='meta_ads')<>1 or
     (select count(distinct (provider,external_account_id)) from public.media_connections where id=any(p_connection_ids))<>v_count then
    raise exception 'API_REPORT_INVALID_INPUT: invalid connection selection';
  end if;
  if not exists(select 1 from public.media_connections where id=v_meta_id and credential_version=1 and last_verified_at is not null
    and public.meta_ads_contact_policy_valid_v1(meta->'meta_ads_reporting',external_account_id,true)) then
    raise exception 'API_REPORT_INVALID_INPUT: Meta contact policy not approved';
  end if;
  v_meta := p_meta || jsonb_build_object('url_contract_version',2,'data_source',jsonb_build_object(
    'kind','api','mode','snapshot_replace','data_level','mixed','aggregation_contract','naver_meta_contact_v1'));
  -- Reuse the existing scoped creation authority, inside this same transaction.
  v_result := public.create_api_report_with_media_connections_v2(p_workspace_id,p_advertiser_id,array[v_meta_id],
    p_report_type_id,p_title,p_period_start,p_period_end,p_created_by,v_meta);
  select * into strict v_report from public.reports where id=(v_result->>'id')::uuid for update;
  v_meta := jsonb_set(v_report.meta,'{data_source}',((v_report.meta->'data_source')-'provider') ||
    jsonb_build_object('providers',jsonb_build_array('meta_ads','naver_searchad')),true);
  insert into public.manual_report_media_connections(tenant_id,workspace_id,advertiser_id,report_id,connection_id)
    select v_report.tenant_id,p_workspace_id,p_advertiser_id,v_report.id,id from unnest(p_connection_ids) id;
  delete from public.report_media_connections where report_id=v_report.id and connection_id=v_meta_id;
  update public.reports set meta=v_meta where id=v_report.id;
  return v_result || jsonb_build_object('meta',v_meta,'connection_ids',to_jsonb(p_connection_ids),
    'providers',jsonb_build_array('meta_ads','naver_searchad'),'connection_id',null,'provider',null);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.materialize_meta_ads_daily_report_v1(p_report_id uuid, p_connection_id uuid, p_target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
declare
  p_payload jsonb; v_meta_audit jsonb; v_fingerprint text; v_pre_count integer;
  c public.media_connections%rowtype;
  r public.reports%rowtype;
  j public.media_sync_jobs%rowtype;
  v_row jsonb;
  v_policy jsonb;
  v_proof jsonb;
  v_key text;
  v_from date;
  v_to date;
  v_count integer;
  v_missing integer;
  v_snapshot uuid := gen_random_uuid();
  v_job uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_sums jsonb;
  v_combined boolean;
  v_naver_ids uuid[];
  v_naver_count integer := 0;
  v_total integer;
  v_participant record;
  v_date date;
  v_partition record;
  v_actual bigint;
  v_participants jsonb := '[]'::jsonb;
  v_naver_audit jsonb := '[]'::jsonb;
begin
  if current_user <> 'service_role' then raise exception 'META_CONTACT_FORBIDDEN'; end if;
  -- Lock the connection before report/partitions, matching every Meta writer.
  select * into c from public.media_connections where id=p_connection_id and provider='meta_ads' for update;
  if not found or c.status<>'active' or c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb then
    raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  select * into r from public.reports where id=p_report_id and tenant_id=c.tenant_id and workspace_id=c.workspace_id
    and advertiser_id=c.advertiser_id and status in ('draft','ready') and meta#>>'{data_source,kind}'='api'
    and (meta#>>'{data_source,provider}'='meta_ads' or meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1') for update;
  if not found then return jsonb_build_object('status','ineligible'); end if;
  if coalesce(r.meta#>>'{media_sync,date_from}','')!~'^\d{4}-\d{2}-\d{2}$' or
     coalesce(r.meta#>>'{media_sync,date_to}','')!~'^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('status','period_required'); end if;
  v_from:=(r.meta#>>'{media_sync,date_from}')::date; v_to:=(r.meta#>>'{media_sync,date_to}')::date;
  if p_target_date is null or p_target_date>=(v_now at time zone 'Asia/Seoul')::date or
    v_from>v_to or v_to-v_from>=31 then raise exception 'META_CONTACT_INVALID_RANGE'; end if;
  if v_to>p_target_date then return jsonb_build_object('status','period_not_completed'); end if;
  -- A mapping is required before even writing a waiting status.
  v_combined:=coalesce(r.meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1',false);
  if (v_combined and not exists(select 1 from public.manual_report_media_connections where report_id=r.id and connection_id=c.id
      and tenant_id=c.tenant_id and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id)) or
    (not v_combined and not exists(select 1 from public.report_media_connections where report_id=r.id and connection_id=c.id
      and tenant_id=c.tenant_id and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id)) then
    raise exception 'META_CONTACT_REPORT_REQUIRED'; end if;
  select count(*),coalesce(jsonb_agg(jsonb_build_object('date',date,'content_hash',content_hash) order by date),'[]'::jsonb)
    into v_pre_count,v_meta_audit from public.meta_ads_daily_partitions where connection_id=c.id and tenant_id=c.tenant_id
      and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id and date between v_from and v_to and policy=c.meta->'meta_ads_reporting';
  if v_pre_count<>v_to-v_from+1 then
    update public.reports set meta=jsonb_set(meta,'{meta_ads_daily_projection}',jsonb_build_object('status','waiting_meta',
      'date_from',v_from,'date_to',v_to,'checked_at',v_now),true) where id=r.id;
    return jsonb_build_object('status','waiting_meta'); end if;
  if v_combined and exists(select 1 from public.manual_report_media_connections m join public.media_connections n on n.id=m.connection_id
    cross join generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d
    where m.report_id=r.id and n.provider='naver_searchad' and not exists(select 1 from public.media_sync_fact_partitions p
      where p.workspace_id=r.workspace_id and p.advertiser_id=r.advertiser_id and p.provider='naver_searchad'
        and p.external_account_id=n.external_account_id and p.source_connection_id=n.id and p.date=d::date)) then
    update public.reports set meta=jsonb_set(meta,'{meta_ads_daily_projection}',jsonb_build_object('status','waiting_naver',
      'date_from',v_from,'date_to',v_to,'checked_at',v_now),true) where id=r.id;
    return jsonb_build_object('status','waiting_naver'); end if;
  select coalesce(jsonb_agg(x order by p.date,x->>'external_ad_id'),'[]'::jsonb),
    public.meta_ads_contact_totals_v1(coalesce(jsonb_agg(x),'[]'::jsonb),c.meta->'meta_ads_reporting')
    into v_row,v_proof from public.meta_ads_daily_partitions p cross join lateral jsonb_array_elements(p.rows) x
      where p.connection_id=c.id and p.date between v_from and v_to;
  p_payload:=jsonb_build_object('contract','meta_contact_snapshot_v1','workspace_id',r.workspace_id,'advertiser_id',r.advertiser_id,
    'report_id',r.id,'connection_id',c.id,'user_id',r.created_by,'external_account_id',c.external_account_id,
    'expected_report_updated_at',r.updated_at,'expected_current_ingestion_id',r.current_ingestion_id,
    'expected_connection_updated_at',c.updated_at,'expected_last_verified_at',c.last_verified_at,
    'date_from',v_from,'date_to',v_to,'policy',c.meta->'meta_ads_reporting','account_totals',v_proof,'page_count',1,'rows',v_row);

  if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload) > 8388608 or
     p_payload->>'contract' is distinct from 'meta_contact_snapshot_v1' or
     jsonb_typeof(p_payload->'rows') is distinct from 'array' then
    raise exception 'META_CONTACT_INVALID_INPUT';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload)) <> 17 or exists (
    select 1 from jsonb_object_keys(p_payload) k where k not in
    ('contract','workspace_id','advertiser_id','report_id','connection_id','user_id','external_account_id',
     'expected_report_updated_at','expected_current_ingestion_id','expected_connection_updated_at','expected_last_verified_at',
     'date_from','date_to','policy','account_totals','page_count','rows')) then
    raise exception 'META_CONTACT_INVALID_INPUT';
  end if;
  foreach v_key in array array['workspace_id','advertiser_id','report_id','connection_id','user_id'] loop
    if coalesce(p_payload->>v_key,'') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      raise exception 'META_CONTACT_INVALID_INPUT';
    end if;
  end loop;
  v_from := (p_payload->>'date_from')::date; v_to := (p_payload->>'date_to')::date;
  v_count := jsonb_array_length(p_payload->'rows');
  if v_from is null or v_to is null or v_from > v_to or v_to-v_from >= 31 or v_count < 0 or v_count > 25000 or
     coalesce(p_payload->>'page_count','') !~ '^[1-5]$' then raise exception 'META_CONTACT_INVALID_INPUT'; end if;

  select * into c from public.media_connections
    where id=(p_payload->>'connection_id')::uuid and provider='meta_ads'
      and workspace_id=(p_payload->>'workspace_id')::uuid and advertiser_id=(p_payload->>'advertiser_id')::uuid
    for update;
  if not found then raise exception 'META_CONTACT_CHANGED'; end if;
  if c.status <> 'active' or c.credential_version <> 1 or nullif(c.credential_ciphertext,'') is null or
     c.last_verified_at is null or c.external_account_id is distinct from p_payload->>'external_account_id' or
     c.updated_at is distinct from (p_payload->>'expected_connection_updated_at')::timestamptz or
     c.last_verified_at is distinct from (p_payload->>'expected_last_verified_at')::timestamptz then
    raise exception 'META_CONTACT_CHANGED';
  end if;
  v_policy := c.meta->'meta_ads_reporting';
  if v_policy is distinct from p_payload->'policy' or not public.meta_ads_contact_policy_valid_v1(v_policy,c.external_account_id) then
    raise exception 'META_CONTACT_POLICY_REQUIRED';
  end if;
  if v_to >= (v_now at time zone (v_policy->>'time_zone'))::date then raise exception 'META_CONTACT_INVALID_RANGE'; end if;

  select * into r from public.reports
    where id=(p_payload->>'report_id')::uuid and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id
      and meta#>>'{data_source,kind}'='api' and (meta#>>'{data_source,provider}'='meta_ads' or
        meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1')
    for update;
  if not found then raise exception 'META_CONTACT_REPORT_REQUIRED'; end if;
  v_combined := coalesce(r.meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1',false);
  if r.tenant_id is distinct from c.tenant_id or r.status not in ('draft','ready') or
     not exists(select 1 from public.report_types where id=r.report_type_id and key='db') or
     (not v_combined and r.meta#>'{data_source,providers}' is not null) or r.meta#>'{media_sync,auto_sync}' is not null or
     r.meta#>>'{media_sync,date_from}' is distinct from v_from::text or r.meta#>>'{media_sync,date_to}' is distinct from v_to::text or
     r.meta#>>'{media_sync,data_level}' is distinct from (case when v_combined then 'mixed' else 'creative' end) or r.meta#>>'{media_sync,mode}' is distinct from 'snapshot_replace' then
    raise exception 'META_CONTACT_REPORT_REQUIRED';
  end if;
  if r.updated_at is distinct from (p_payload->>'expected_report_updated_at')::timestamptz or
     r.current_ingestion_id is distinct from (p_payload->>'expected_current_ingestion_id')::uuid then
    raise exception 'META_CONTACT_CHANGED';
  end if;
  if v_combined then
    if r.meta#>'{data_source,providers}' is distinct from '["meta_ads","naver_searchad"]'::jsonb or
       r.meta#>'{data_source,provider}' is not null or r.meta->'url_contract_version' is distinct from '2'::jsonb or
       r.meta#>>'{public_identity,period_type}'='daily_sync' or
       v_policy->>'currency'<>'KRW' or v_policy->>'time_zone'<>'Asia/Seoul' or
       exists(select 1 from public.report_media_connections where report_id=r.id) then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
    perform 1 from public.manual_report_media_connections where report_id=r.id order by connection_id for share;
    select array_agg(mc.id order by mc.id) filter(where mc.provider='naver_searchad') into v_naver_ids
      from public.manual_report_media_connections m join public.media_connections mc on mc.id=m.connection_id
      where m.report_id=r.id and m.tenant_id=r.tenant_id and m.workspace_id=r.workspace_id and m.advertiser_id=r.advertiser_id
        and mc.tenant_id=r.tenant_id and mc.workspace_id=r.workspace_id and mc.advertiser_id=r.advertiser_id;
    if coalesce(cardinality(v_naver_ids),0) not between 1 and 15 or
       (select count(*) from public.manual_report_media_connections where report_id=r.id)<>cardinality(v_naver_ids)+1 or
       not exists(select 1 from public.manual_report_media_connections where report_id=r.id and connection_id=c.id) or
       (select count(distinct external_account_id) from public.media_connections where id=any(v_naver_ids))<>cardinality(v_naver_ids) then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
    for v_participant in select * from public.media_connections where id=any(v_naver_ids) order by id for share loop
      if v_participant.status<>'active' or nullif(v_participant.credential_ciphertext,'') is null then
        raise exception 'META_CONTACT_CHANGED';
      end if;
      v_actual := 0;
      for v_date in select d::date from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d loop
        -- Same account/date key used by the Naver fact writer, shared and nonblocking.
        if not pg_try_advisory_xact_lock_shared(hashtextextended(r.workspace_id::text||'|'||r.advertiser_id::text||
          '|naver_searchad|'||v_participant.external_account_id||'|'||v_date::text,0)) then
          raise exception 'NAVER_META_FACTS_CHANGED';
        end if;
        select * into v_partition from public.media_sync_fact_partitions where workspace_id=r.workspace_id
          and advertiser_id=r.advertiser_id and provider='naver_searchad' and external_account_id=v_participant.external_account_id
          and date=v_date for share;
        if not found or v_partition.source_connection_id<>v_participant.id then raise exception 'NAVER_META_COVERAGE_INCOMPLETE'; end if;
        if (select count(*) from public.media_sync_fact_rows f where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id
          and f.provider='naver_searchad' and f.external_account_id=v_participant.external_account_id and f.date=v_date
          and f.source_connection_id=v_participant.id and f.source_job_id=v_partition.source_job_id
          and f.row->>'provider'='naver_searchad' and f.row->>'external_account_id'=v_participant.external_account_id
          and f.row->>'date'=v_date::text)<>v_partition.row_count or
          (select count(*) from public.media_sync_fact_rows f where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id
          and f.provider='naver_searchad' and f.external_account_id=v_participant.external_account_id and f.date=v_date)<>v_partition.row_count then
          raise exception 'NAVER_META_FACTS_CHANGED';
        end if;
        v_actual := v_actual + v_partition.row_count;
        if v_actual+v_naver_count+v_count>50000 then raise exception 'NAVER_META_TOO_MANY_ROWS'; end if;
        v_naver_audit := v_naver_audit || jsonb_build_array(jsonb_build_object('connection_id',v_participant.id,'date',v_date,
          'source_job_id',v_partition.source_job_id,'updated_at',v_partition.updated_at,'row_count',v_partition.row_count));
      end loop;
      v_naver_count := v_naver_count+v_actual::integer;
      v_participants := v_participants || jsonb_build_array(jsonb_build_object('connection_id',v_participant.id,
        'provider','naver_searchad','external_account_id',v_participant.external_account_id,'row_count',v_actual));
    end loop;
  else
    perform 1 from public.report_media_connections where report_id=r.id and connection_id=c.id
      and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id and tenant_id=c.tenant_id for share;
    if not found or (select count(*) from public.report_media_connections where report_id=r.id) <> 1 then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
  end if;
  if exists(select 1 from public.media_sync_jobs where (report_id=r.id or connection_id=c.id) and status in ('pending','processing')) then
    raise exception 'ACTIVE_JOB_ALREADY_EXISTS';
  end if;

  v_proof := p_payload->'account_totals';
  if not public.meta_ads_contact_totals_valid_v1(v_proof,v_policy) then
    raise exception 'META_CONTACT_RECONCILIATION_FAILED';
  end if;
  foreach v_key in array public.meta_ads_contact_metric_keys_v1(v_policy) loop
    if coalesce(v_proof->>v_key,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
       (v_proof->>v_key)::numeric > 9007199254740991 then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
    if jsonb_typeof(v_row) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_row)) <> 31 or exists (
      select 1 from jsonb_object_keys(v_row) k where k not in
      ('date','report_date','day','ymd','channel','source','platform','device','campaign','campaign_name','group','group_name','adgroup_name',
       'creative','creative_name','impressions','clicks','cost','conversions','revenue','row_level','data_level','row_level_reason',
       'provider','ingestion_source','external_account_id','external_campaign_id','external_group_id','external_ad_id','external_creative_id','provider_meta')) then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
    -- Only the exact normalized contract is persisted. No arbitrary API fields or credentials.
    if v_row->>'date' is null or (v_row->>'date')::date not between v_from and v_to or
       to_char((v_row->>'date')::date,'YYYY-MM-DD') is distinct from v_row->>'date' or
       v_row->>'report_date' is distinct from v_row->>'date' or v_row->>'day' is distinct from v_row->>'date' or
       v_row->>'ymd' is distinct from v_row->>'date' or v_row->>'channel' is distinct from 'Meta Ads' or
       v_row->>'source' is distinct from 'Meta Ads' or v_row->>'platform' is distinct from 'Meta Ads' or
       v_row->>'device' is distinct from '' or v_row->>'provider' is distinct from 'meta_ads' or
       v_row->>'ingestion_source' is distinct from 'api' or v_row->>'external_account_id' is distinct from c.external_account_id or
       v_row->>'row_level' is distinct from 'creative' or v_row->>'data_level' is distinct from 'creative' or
       v_row->>'row_level_reason' is distinct from 'meta_ads_ad_daily_insights' or
       v_row->>'external_creative_id' is distinct from v_row->>'external_ad_id' or v_row->'revenue' is distinct from 'null'::jsonb then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
    foreach v_key in array array['external_campaign_id','external_group_id','external_ad_id'] loop
      if coalesce(v_row->>v_key,'') !~ '^[1-9][0-9]{0,29}$' then raise exception 'META_CONTACT_INVALID_ROW'; end if;
    end loop;
    foreach v_key in array array['campaign','group','creative'] loop
      if jsonb_typeof(v_row->v_key) is distinct from 'string' or length(v_row->>v_key) not between 1 and 2000 or
         (v_row->>v_key) ~ '[[:cntrl:]]' or v_row->>(v_key||'_name') is distinct from v_row->>v_key then
        raise exception 'META_CONTACT_INVALID_ROW';
      end if;
    end loop;
    if v_row->>'adgroup_name' is distinct from v_row->>'group' then raise exception 'META_CONTACT_INVALID_ROW'; end if;
    foreach v_key in array array['impressions','clicks','cost','conversions'] loop
      if jsonb_typeof(v_row->v_key) is distinct from 'number' or
         coalesce(v_row->>v_key,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
         (v_row->>v_key)::numeric > 9007199254740991 or
         (v_key in ('impressions','clicks') and (v_row->>v_key)::numeric <> trunc((v_row->>v_key)::numeric)) then
        raise exception 'META_CONTACT_INVALID_ROW';
      end if;
    end loop;
    if coalesce(v_row#>>'{provider_meta,conversion_value_source}','') not in ('reported','reconciled_absence') or
       (v_row#>>'{provider_meta,conversion_value_source}'='reconciled_absence' and (v_row->>'conversions')::numeric<>0) or
       not public.meta_ads_contact_row_meta_valid_v1(v_row,v_policy) then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'rows') x group by x->>'date',x->>'external_ad_id' having count(*)>1) then
    raise exception 'META_CONTACT_DUPLICATE_ROW';
  end if;
  select public.meta_ads_contact_totals_v1(coalesce(jsonb_agg(x),'[]'::jsonb),v_policy), count(*) filter(where x#>>'{provider_meta,conversion_value_source}'='reconciled_absence')
    into v_sums,v_missing from jsonb_array_elements(p_payload->'rows') x;
  foreach v_key in array public.meta_ads_contact_metric_keys_v1(v_policy) loop
    if (v_sums->>v_key)::numeric is distinct from (v_proof->>v_key)::numeric then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;

  v_fingerprint:=md5(jsonb_build_object('meta',v_meta_audit,'naver',v_naver_audit,'policy',v_policy,
    'date_from',v_from,'date_to',v_to,'participants',v_participants)::text);
  if r.meta#>>'{meta_ads_daily_projection,fingerprint}'=v_fingerprint and
    r.meta#>>'{meta_ads_daily_projection,ingestion_id}'=r.current_ingestion_id::text then
    return jsonb_build_object('status','unchanged','snapshot_ingestion_id',r.current_ingestion_id); end if;
  v_total := v_count + v_naver_count;
  insert into public.report_ingestions(id,workspace_id,report_id,kind,status,row_count,created_by)
    values(v_snapshot,r.workspace_id,r.id,'api','success',v_total,(p_payload->>'user_id')::uuid);
  insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
    select r.workspace_id,r.id,r.advertiser_id,ordinality::integer-1,value,(value->>'date')::date,'Meta Ads','','Meta Ads',v_snapshot
    from jsonb_array_elements(p_payload->'rows') with ordinality;
  if v_combined then
    insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
      select r.workspace_id,r.id,r.advertiser_id,v_count+(row_number() over(order by f.date,f.external_account_id,f.row_key))::integer-1,
        f.row,f.date,f.channel,f.device,f.source,v_snapshot
      from public.media_sync_fact_rows f join public.media_connections mc on mc.id=any(v_naver_ids)
        and mc.external_account_id=f.external_account_id and mc.provider=f.provider
      where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id and f.provider='naver_searchad'
        and f.date between v_from and v_to;
    get diagnostics v_actual = row_count;
    if v_actual<>v_naver_count then raise exception 'NAVER_META_FACTS_CHANGED'; end if;
    -- Completed materialization records only: these never enter a worker queue.
    for v_row in select value from jsonb_array_elements(v_participants) loop
      insert into public.media_sync_jobs(id,workspace_id,advertiser_id,report_id,connection_id,provider,external_account_id,
        date_from,date_to,data_level,mode,status,progress,raw_rows,normalized_rows,inserted_rows,failed_rows,
        previous_ingestion_id,snapshot_ingestion_id,attempt_count,created_by,started_at,finished_at)
      values(gen_random_uuid(),r.workspace_id,r.advertiser_id,r.id,(v_row->>'connection_id')::uuid,'naver_searchad',v_row->>'external_account_id',
        v_from,v_to,'mixed','snapshot_replace','done',100,(v_row->>'row_count')::integer,(v_row->>'row_count')::integer,
        (v_row->>'row_count')::integer,0,r.current_ingestion_id,v_snapshot,1,(p_payload->>'user_id')::uuid,v_now,v_now);
    end loop;
  end if;
  insert into public.media_sync_jobs(id,workspace_id,advertiser_id,report_id,connection_id,provider,external_account_id,
    date_from,date_to,data_level,mode,status,progress,raw_rows,normalized_rows,inserted_rows,failed_rows,
    previous_ingestion_id,snapshot_ingestion_id,attempt_count,created_by,started_at,finished_at)
    values(v_job,r.workspace_id,r.advertiser_id,r.id,c.id,'meta_ads',c.external_account_id,v_from,v_to,'creative','snapshot_replace',
      'done',100,v_count,v_count,v_count,0,r.current_ingestion_id,v_snapshot,1,(p_payload->>'user_id')::uuid,v_now,v_now)
    returning * into j;
  update public.reports set current_ingestion_id=v_snapshot,last_ingested_at=v_now,last_ingestion_run_id=v_job::text,
    meta=jsonb_set(r.meta,'{meta_ads_snapshot}',jsonb_build_object('contract','meta_contact_snapshot_v1','policy',v_policy,
      'account_totals',v_proof,'row_count',v_count,'rows_with_reconciled_absence',v_missing,'source','meta_ads_daily_partitions',
      'date_from',v_from,'date_to',v_to,'job_id',v_job,'ingestion_id',v_snapshot,'saved_at',v_now),true)
    where id=r.id;
  if v_combined then
    update public.reports set meta=jsonb_set(meta,'{multi_media_snapshot}',jsonb_build_object(
      'contract','naver_meta_contact_v1','date_from',v_from,'date_to',v_to,'row_count',v_total,'saved_at',v_now,
      'ingestion_id',v_snapshot,'conversion_aggregation','sum_provider_attributed_conversions',
      'participants',v_participants||jsonb_build_array(jsonb_build_object('connection_id',c.id,'provider','meta_ads',
        'external_account_id',c.external_account_id,'row_count',v_count)), 'naver_partitions',v_naver_audit),true) where id=r.id;
  end if;
  update public.reports set meta=jsonb_set(meta,'{meta_ads_daily_projection}',jsonb_build_object(
    'contract','meta_daily_v1','status','updated','date_from',v_from,'date_to',v_to,'fingerprint',v_fingerprint,
    'ingestion_id',v_snapshot,'updated_at',v_now,'partitions',v_meta_audit),true) where id=r.id;
  -- Published pointers, report status, old snapshots and all other providers remain untouched.
  return jsonb_build_object('status','updated','snapshot_ingestion_id',v_snapshot,'row_count',v_total);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.meta_ads_daily_eligible_v1()
 RETURNS TABLE(connection_id uuid, tenant_id uuid, workspace_id uuid, advertiser_id uuid, generation uuid, start_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select e.connection_id,e.tenant_id,e.workspace_id,e.advertiser_id,e.generation,e.start_date
  from public.meta_ads_daily_enrollments e join public.media_connections c on c.id=e.connection_id
    and c.tenant_id=e.tenant_id and c.workspace_id=e.workspace_id and c.advertiser_id=e.advertiser_id
  where current_user='service_role' and e.enabled and c.provider='meta_ads' and c.status='active' and c.credential_version=1
    and c.last_verified_at>=e.verified_at and e.credential_fingerprint=md5(c.credential_ciphertext)
    and e.policy=c.meta->'meta_ads_reporting'
    and public.meta_ads_contact_policy_valid_v1(e.policy,c.external_account_id,true)
    and c.meta#>>'{meta_ads_daily,contract}'='meta_daily_v1' and c.meta#>'{meta_ads_daily,enabled}'='true'::jsonb
    and c.meta#>>'{meta_ads_daily,start_date}'=e.start_date::text and c.meta#>>'{meta_ads_daily,time_zone}'='Asia/Seoul'
    and c.meta#>>'{meta_ads_daily,schedule}'='0 20 * * *' and c.meta#>'{meta_ads_daily,lookback_days}'='7'::jsonb;
$function$
;


CREATE OR REPLACE FUNCTION public.replace_meta_ads_daily_window_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
declare c public.media_connections%rowtype; r public.meta_ads_daily_runs%rowtype;
  v_from date; v_to date; v_policy jsonb; v_row jsonb; v_key text; v_proof jsonb; v_sums jsonb;
  v_date date; v_rows jsonb; v_count integer; v_evidence text; v_now timestamptz:=clock_timestamp();
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>8388608 or
    jsonb_typeof(p_payload->'rows') is distinct from 'array' or
    (select count(*) from jsonb_object_keys(p_payload))<>11 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
    ('connection_id','run_id','lease','expected_connection_updated_at','date_from','date_to','policy','rows','totals','evidence','page_count')) then
    raise exception 'META_DAILY_INVALID_INPUT'; end if;
  select * into c from public.media_connections where id=(p_payload->>'connection_id')::uuid and provider='meta_ads' for update;
  if not found or c.status<>'active' or c.credential_version<>1 or c.last_verified_at is null or
    nullif(c.credential_ciphertext,'') is null or c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb or
    c.updated_at is distinct from (p_payload->>'expected_connection_updated_at')::timestamptz then raise exception 'META_CONTACT_CHANGED'; end if;
  select * into r from public.meta_ads_daily_runs where id=(p_payload->>'run_id')::uuid and connection_id=c.id for update;
  if not found or r.status<>'processing' or r.lease is distinct from (p_payload->>'lease')::uuid or r.lease_until<=v_now or
    r.connection_updated_at is distinct from c.updated_at then raise exception 'META_DAILY_LEASE_LOST'; end if;
  v_from:=(p_payload->>'date_from')::date; v_to:=(p_payload->>'date_to')::date;
  v_count:=jsonb_array_length(p_payload->'rows'); v_evidence:=p_payload->>'evidence';
  if v_from is null or v_to is null or v_from>v_to or v_to-v_from>=7 or v_from<r.start_date or v_to>r.target_date or
    v_to>=(v_now at time zone 'Asia/Seoul')::date or v_count>2500 or coalesce(p_payload->>'page_count','')!~'^[1-5]$' or
    coalesce(v_evidence,'') not in ('reported','omitted_on_complete_insights','no_data') then raise exception 'META_DAILY_INVALID_RANGE'; end if;
  v_policy:=c.meta->'meta_ads_reporting';
  if v_policy is distinct from p_payload->'policy' or not public.meta_ads_contact_policy_valid_v1(v_policy,c.external_account_id,true) then raise exception 'META_CONTACT_POLICY_REQUIRED'; end if;
  v_proof:=p_payload->'totals';
  if not public.meta_ads_contact_totals_valid_v1(v_proof,v_policy) then
    raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  foreach v_key in array public.meta_ads_contact_metric_keys_v1(v_policy) loop
    if coalesce(v_proof->>v_key,'')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or (v_proof->>v_key)::numeric>9007199254740991 then
      raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
    if jsonb_typeof(v_row) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_row)) <> 31 or exists (
      select 1 from jsonb_object_keys(v_row) k where k not in
      ('date','report_date','day','ymd','channel','source','platform','device','campaign','campaign_name','group','group_name','adgroup_name',
       'creative','creative_name','impressions','clicks','cost','conversions','revenue','row_level','data_level','row_level_reason',
       'provider','ingestion_source','external_account_id','external_campaign_id','external_group_id','external_ad_id','external_creative_id','provider_meta')) then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
    -- Only the exact normalized contract is persisted. No arbitrary API fields or credentials.
    if v_row->>'date' is null or (v_row->>'date')::date not between v_from and v_to or
       to_char((v_row->>'date')::date,'YYYY-MM-DD') is distinct from v_row->>'date' or
       v_row->>'report_date' is distinct from v_row->>'date' or v_row->>'day' is distinct from v_row->>'date' or
       v_row->>'ymd' is distinct from v_row->>'date' or v_row->>'channel' is distinct from 'Meta Ads' or
       v_row->>'source' is distinct from 'Meta Ads' or v_row->>'platform' is distinct from 'Meta Ads' or
       v_row->>'device' is distinct from '' or v_row->>'provider' is distinct from 'meta_ads' or
       v_row->>'ingestion_source' is distinct from 'api' or v_row->>'external_account_id' is distinct from c.external_account_id or
       v_row->>'row_level' is distinct from 'creative' or v_row->>'data_level' is distinct from 'creative' or
       v_row->>'row_level_reason' is distinct from 'meta_ads_ad_daily_insights' or
       v_row->>'external_creative_id' is distinct from v_row->>'external_ad_id' or v_row->'revenue' is distinct from 'null'::jsonb then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
    foreach v_key in array array['external_campaign_id','external_group_id','external_ad_id'] loop
      if coalesce(v_row->>v_key,'') !~ '^[1-9][0-9]{0,29}$' then raise exception 'META_CONTACT_INVALID_ROW'; end if;
    end loop;
    foreach v_key in array array['campaign','group','creative'] loop
      if jsonb_typeof(v_row->v_key) is distinct from 'string' or length(v_row->>v_key) not between 1 and 2000 or
         (v_row->>v_key) ~ '[[:cntrl:]]' or v_row->>(v_key||'_name') is distinct from v_row->>v_key then
        raise exception 'META_CONTACT_INVALID_ROW';
      end if;
    end loop;
    if v_row->>'adgroup_name' is distinct from v_row->>'group' then raise exception 'META_CONTACT_INVALID_ROW'; end if;
    foreach v_key in array array['impressions','clicks','cost','conversions'] loop
      if jsonb_typeof(v_row->v_key) is distinct from 'number' or
         coalesce(v_row->>v_key,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
         (v_row->>v_key)::numeric > 9007199254740991 or
         (v_key in ('impressions','clicks') and (v_row->>v_key)::numeric <> trunc((v_row->>v_key)::numeric)) then
        raise exception 'META_CONTACT_INVALID_ROW';
      end if;
    end loop;
    if coalesce(v_row#>>'{provider_meta,conversion_value_source}','') not in ('reported','reconciled_absence') or
       (v_row#>>'{provider_meta,conversion_value_source}'='reconciled_absence' and (v_row->>'conversions')::numeric<>0) or
       not public.meta_ads_contact_row_meta_valid_v1(v_row,v_policy) then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'rows') x group by x->>'date',x->>'external_ad_id' having count(*)>1) then
    raise exception 'META_CONTACT_DUPLICATE_ROW';
  end if;
  select public.meta_ads_contact_totals_v1(coalesce(jsonb_agg(x),'[]'::jsonb),v_policy) into v_sums from jsonb_array_elements(p_payload->'rows') x;
  foreach v_key in array public.meta_ads_contact_metric_keys_v1(v_policy) loop
    if (v_sums->>v_key)::numeric is distinct from (v_proof->>v_key)::numeric then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;
  if (v_evidence='no_data' and v_count<>0) or (v_evidence<>'reported' and coalesce(v_proof->>'total_conversions',v_proof->>'website_contacts')::numeric<>0) then
    raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  for v_date in select d::date from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d loop
    select coalesce(jsonb_agg(x order by x->>'external_ad_id'),'[]'::jsonb) into v_rows
      from jsonb_array_elements(p_payload->'rows') x where x->>'date'=v_date::text;
    insert into public.meta_ads_daily_partitions(connection_id,tenant_id,workspace_id,advertiser_id,date,run_id,rows,row_count,content_hash,policy,proof,updated_at)
      values(c.id,c.tenant_id,c.workspace_id,c.advertiser_id,v_date,r.id,v_rows,jsonb_array_length(v_rows),md5(v_rows::text||v_policy::text),v_policy,
        jsonb_build_object('date_from',v_from,'date_to',v_to,'account_totals',v_proof,'evidence',v_evidence,
          'page_count',(p_payload->>'page_count')::integer,'complete',true),v_now)
      on conflict(connection_id,date) do update set run_id=excluded.run_id,rows=excluded.rows,row_count=excluded.row_count,
        content_hash=excluded.content_hash,policy=excluded.policy,proof=excluded.proof,updated_at=excluded.updated_at;
  end loop;
  return jsonb_build_object('row_count',v_count,'day_count',v_to-v_from+1);
end; $function$
;


CREATE OR REPLACE FUNCTION public.save_meta_ads_contact_snapshot_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
declare
  c public.media_connections%rowtype;
  r public.reports%rowtype;
  j public.media_sync_jobs%rowtype;
  v_row jsonb;
  v_policy jsonb;
  v_proof jsonb;
  v_key text;
  v_from date;
  v_to date;
  v_count integer;
  v_missing integer;
  v_snapshot uuid := gen_random_uuid();
  v_job uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_sums jsonb;
  v_combined boolean;
  v_naver_ids uuid[];
  v_naver_count integer := 0;
  v_total integer;
  v_participant record;
  v_date date;
  v_partition record;
  v_actual bigint;
  v_participants jsonb := '[]'::jsonb;
  v_naver_audit jsonb := '[]'::jsonb;
begin
  if current_user <> 'service_role' then raise exception 'META_CONTACT_FORBIDDEN'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload) > 8388608 or
     p_payload->>'contract' is distinct from 'meta_contact_snapshot_v1' or
     jsonb_typeof(p_payload->'rows') is distinct from 'array' then
    raise exception 'META_CONTACT_INVALID_INPUT';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload)) <> 17 or exists (
    select 1 from jsonb_object_keys(p_payload) k where k not in
    ('contract','workspace_id','advertiser_id','report_id','connection_id','user_id','external_account_id',
     'expected_report_updated_at','expected_current_ingestion_id','expected_connection_updated_at','expected_last_verified_at',
     'date_from','date_to','policy','account_totals','page_count','rows')) then
    raise exception 'META_CONTACT_INVALID_INPUT';
  end if;
  foreach v_key in array array['workspace_id','advertiser_id','report_id','connection_id','user_id'] loop
    if coalesce(p_payload->>v_key,'') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      raise exception 'META_CONTACT_INVALID_INPUT';
    end if;
  end loop;
  v_from := (p_payload->>'date_from')::date; v_to := (p_payload->>'date_to')::date;
  v_count := jsonb_array_length(p_payload->'rows');
  if v_from is null or v_to is null or v_from > v_to or v_to-v_from >= 31 or v_count < 1 or v_count > 2500 or
     coalesce(p_payload->>'page_count','') !~ '^[1-5]$' then raise exception 'META_CONTACT_INVALID_INPUT'; end if;

  select * into c from public.media_connections
    where id=(p_payload->>'connection_id')::uuid and provider='meta_ads'
      and workspace_id=(p_payload->>'workspace_id')::uuid and advertiser_id=(p_payload->>'advertiser_id')::uuid
    for update;
  if not found then raise exception 'META_CONTACT_CHANGED'; end if;
  if c.status <> 'active' or c.credential_version <> 1 or nullif(c.credential_ciphertext,'') is null or
     c.last_verified_at is null or c.external_account_id is distinct from p_payload->>'external_account_id' or
     c.updated_at is distinct from (p_payload->>'expected_connection_updated_at')::timestamptz or
     c.last_verified_at is distinct from (p_payload->>'expected_last_verified_at')::timestamptz then
    raise exception 'META_CONTACT_CHANGED';
  end if;
  v_policy := c.meta->'meta_ads_reporting';
  if v_policy is distinct from p_payload->'policy' or not public.meta_ads_contact_policy_valid_v1(v_policy,c.external_account_id) then
    raise exception 'META_CONTACT_POLICY_REQUIRED';
  end if;
  if v_to >= (v_now at time zone (v_policy->>'time_zone'))::date then raise exception 'META_CONTACT_INVALID_RANGE'; end if;

  select * into r from public.reports
    where id=(p_payload->>'report_id')::uuid and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id
      and meta#>>'{data_source,kind}'='api' and (meta#>>'{data_source,provider}'='meta_ads' or
        meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1')
    for update;
  if not found then raise exception 'META_CONTACT_REPORT_REQUIRED'; end if;
  v_combined := coalesce(r.meta#>>'{data_source,aggregation_contract}'='naver_meta_contact_v1',false);
  if r.tenant_id is distinct from c.tenant_id or r.status not in ('draft','ready') or
     not exists(select 1 from public.report_types where id=r.report_type_id and key='db') or
     (not v_combined and r.meta#>'{data_source,providers}' is not null) or r.meta#>'{media_sync,auto_sync}' is not null or
     r.meta#>>'{media_sync,date_from}' is distinct from v_from::text or r.meta#>>'{media_sync,date_to}' is distinct from v_to::text or
     r.meta#>>'{media_sync,data_level}' is distinct from (case when v_combined then 'mixed' else 'creative' end) or r.meta#>>'{media_sync,mode}' is distinct from 'snapshot_replace' then
    raise exception 'META_CONTACT_REPORT_REQUIRED';
  end if;
  if r.updated_at is distinct from (p_payload->>'expected_report_updated_at')::timestamptz or
     r.current_ingestion_id is distinct from (p_payload->>'expected_current_ingestion_id')::uuid then
    raise exception 'META_CONTACT_CHANGED';
  end if;
  if v_combined then
    if r.meta#>'{data_source,providers}' is distinct from '["meta_ads","naver_searchad"]'::jsonb or
       r.meta#>'{data_source,provider}' is not null or r.meta->'url_contract_version' is distinct from '2'::jsonb or
       r.meta#>>'{public_identity,period_type}'='daily_sync' or
       v_policy->>'currency'<>'KRW' or v_policy->>'time_zone'<>'Asia/Seoul' or
       exists(select 1 from public.report_media_connections where report_id=r.id) then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
    perform 1 from public.manual_report_media_connections where report_id=r.id order by connection_id for share;
    select array_agg(mc.id order by mc.id) filter(where mc.provider='naver_searchad') into v_naver_ids
      from public.manual_report_media_connections m join public.media_connections mc on mc.id=m.connection_id
      where m.report_id=r.id and m.tenant_id=r.tenant_id and m.workspace_id=r.workspace_id and m.advertiser_id=r.advertiser_id
        and mc.tenant_id=r.tenant_id and mc.workspace_id=r.workspace_id and mc.advertiser_id=r.advertiser_id;
    if coalesce(cardinality(v_naver_ids),0) not between 1 and 15 or
       (select count(*) from public.manual_report_media_connections where report_id=r.id)<>cardinality(v_naver_ids)+1 or
       not exists(select 1 from public.manual_report_media_connections where report_id=r.id and connection_id=c.id) or
       (select count(distinct external_account_id) from public.media_connections where id=any(v_naver_ids))<>cardinality(v_naver_ids) then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
    for v_participant in select * from public.media_connections where id=any(v_naver_ids) order by id for share loop
      if v_participant.status<>'active' or nullif(v_participant.credential_ciphertext,'') is null then
        raise exception 'META_CONTACT_CHANGED';
      end if;
      v_actual := 0;
      for v_date in select d::date from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d loop
        -- Same account/date key used by the Naver fact writer, shared and nonblocking.
        if not pg_try_advisory_xact_lock_shared(hashtextextended(r.workspace_id::text||'|'||r.advertiser_id::text||
          '|naver_searchad|'||v_participant.external_account_id||'|'||v_date::text,0)) then
          raise exception 'NAVER_META_FACTS_CHANGED';
        end if;
        select * into v_partition from public.media_sync_fact_partitions where workspace_id=r.workspace_id
          and advertiser_id=r.advertiser_id and provider='naver_searchad' and external_account_id=v_participant.external_account_id
          and date=v_date for share;
        if not found or v_partition.source_connection_id<>v_participant.id then raise exception 'NAVER_META_COVERAGE_INCOMPLETE'; end if;
        if (select count(*) from public.media_sync_fact_rows f where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id
          and f.provider='naver_searchad' and f.external_account_id=v_participant.external_account_id and f.date=v_date
          and f.source_connection_id=v_participant.id and f.source_job_id=v_partition.source_job_id
          and f.row->>'provider'='naver_searchad' and f.row->>'external_account_id'=v_participant.external_account_id
          and f.row->>'date'=v_date::text)<>v_partition.row_count or
          (select count(*) from public.media_sync_fact_rows f where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id
          and f.provider='naver_searchad' and f.external_account_id=v_participant.external_account_id and f.date=v_date)<>v_partition.row_count then
          raise exception 'NAVER_META_FACTS_CHANGED';
        end if;
        v_actual := v_actual + v_partition.row_count;
        if v_actual+v_naver_count+v_count>50000 then raise exception 'NAVER_META_TOO_MANY_ROWS'; end if;
        v_naver_audit := v_naver_audit || jsonb_build_array(jsonb_build_object('connection_id',v_participant.id,'date',v_date,
          'source_job_id',v_partition.source_job_id,'updated_at',v_partition.updated_at,'row_count',v_partition.row_count));
      end loop;
      v_naver_count := v_naver_count+v_actual::integer;
      v_participants := v_participants || jsonb_build_array(jsonb_build_object('connection_id',v_participant.id,
        'provider','naver_searchad','external_account_id',v_participant.external_account_id,'row_count',v_actual));
    end loop;
  else
    perform 1 from public.report_media_connections where report_id=r.id and connection_id=c.id
      and workspace_id=c.workspace_id and advertiser_id=c.advertiser_id and tenant_id=c.tenant_id for share;
    if not found or (select count(*) from public.report_media_connections where report_id=r.id) <> 1 then
      raise exception 'META_CONTACT_REPORT_REQUIRED';
    end if;
  end if;
  if exists(select 1 from public.media_sync_jobs where (report_id=r.id or connection_id=c.id) and status in ('pending','processing')) then
    raise exception 'ACTIVE_JOB_ALREADY_EXISTS';
  end if;

  v_proof := p_payload->'account_totals';
  if not public.meta_ads_contact_totals_valid_v1(v_proof,v_policy) then
    raise exception 'META_CONTACT_RECONCILIATION_FAILED';
  end if;
  foreach v_key in array public.meta_ads_contact_metric_keys_v1(v_policy) loop
    if coalesce(v_proof->>v_key,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
       (v_proof->>v_key)::numeric > 9007199254740991 then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
    if jsonb_typeof(v_row) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_row)) <> 31 or exists (
      select 1 from jsonb_object_keys(v_row) k where k not in
      ('date','report_date','day','ymd','channel','source','platform','device','campaign','campaign_name','group','group_name','adgroup_name',
       'creative','creative_name','impressions','clicks','cost','conversions','revenue','row_level','data_level','row_level_reason',
       'provider','ingestion_source','external_account_id','external_campaign_id','external_group_id','external_ad_id','external_creative_id','provider_meta')) then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
    -- Only the exact normalized contract is persisted. No arbitrary API fields or credentials.
    if v_row->>'date' is null or (v_row->>'date')::date not between v_from and v_to or
       to_char((v_row->>'date')::date,'YYYY-MM-DD') is distinct from v_row->>'date' or
       v_row->>'report_date' is distinct from v_row->>'date' or v_row->>'day' is distinct from v_row->>'date' or
       v_row->>'ymd' is distinct from v_row->>'date' or v_row->>'channel' is distinct from 'Meta Ads' or
       v_row->>'source' is distinct from 'Meta Ads' or v_row->>'platform' is distinct from 'Meta Ads' or
       v_row->>'device' is distinct from '' or v_row->>'provider' is distinct from 'meta_ads' or
       v_row->>'ingestion_source' is distinct from 'api' or v_row->>'external_account_id' is distinct from c.external_account_id or
       v_row->>'row_level' is distinct from 'creative' or v_row->>'data_level' is distinct from 'creative' or
       v_row->>'row_level_reason' is distinct from 'meta_ads_ad_daily_insights' or
       v_row->>'external_creative_id' is distinct from v_row->>'external_ad_id' or v_row->'revenue' is distinct from 'null'::jsonb then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
    foreach v_key in array array['external_campaign_id','external_group_id','external_ad_id'] loop
      if coalesce(v_row->>v_key,'') !~ '^[1-9][0-9]{0,29}$' then raise exception 'META_CONTACT_INVALID_ROW'; end if;
    end loop;
    foreach v_key in array array['campaign','group','creative'] loop
      if jsonb_typeof(v_row->v_key) is distinct from 'string' or length(v_row->>v_key) not between 1 and 2000 or
         (v_row->>v_key) ~ '[[:cntrl:]]' or v_row->>(v_key||'_name') is distinct from v_row->>v_key then
        raise exception 'META_CONTACT_INVALID_ROW';
      end if;
    end loop;
    if v_row->>'adgroup_name' is distinct from v_row->>'group' then raise exception 'META_CONTACT_INVALID_ROW'; end if;
    foreach v_key in array array['impressions','clicks','cost','conversions'] loop
      if jsonb_typeof(v_row->v_key) is distinct from 'number' or
         coalesce(v_row->>v_key,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or
         (v_row->>v_key)::numeric > 9007199254740991 or
         (v_key in ('impressions','clicks') and (v_row->>v_key)::numeric <> trunc((v_row->>v_key)::numeric)) then
        raise exception 'META_CONTACT_INVALID_ROW';
      end if;
    end loop;
    if coalesce(v_row#>>'{provider_meta,conversion_value_source}','') not in ('reported','reconciled_absence') or
       (v_row#>>'{provider_meta,conversion_value_source}'='reconciled_absence' and (v_row->>'conversions')::numeric<>0) or
       not public.meta_ads_contact_row_meta_valid_v1(v_row,v_policy) then
      raise exception 'META_CONTACT_INVALID_ROW';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'rows') x group by x->>'date',x->>'external_ad_id' having count(*)>1) then
    raise exception 'META_CONTACT_DUPLICATE_ROW';
  end if;
  select public.meta_ads_contact_totals_v1(coalesce(jsonb_agg(x),'[]'::jsonb),v_policy), count(*) filter(where x#>>'{provider_meta,conversion_value_source}'='reconciled_absence')
    into v_sums,v_missing from jsonb_array_elements(p_payload->'rows') x;
  foreach v_key in array public.meta_ads_contact_metric_keys_v1(v_policy) loop
    if (v_sums->>v_key)::numeric is distinct from (v_proof->>v_key)::numeric then raise exception 'META_CONTACT_RECONCILIATION_FAILED'; end if;
  end loop;

  v_total := v_count + v_naver_count;
  insert into public.report_ingestions(id,workspace_id,report_id,kind,status,row_count,created_by)
    values(v_snapshot,r.workspace_id,r.id,'api','success',v_total,(p_payload->>'user_id')::uuid);
  insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
    select r.workspace_id,r.id,r.advertiser_id,ordinality::integer-1,value,(value->>'date')::date,'Meta Ads','','Meta Ads',v_snapshot
    from jsonb_array_elements(p_payload->'rows') with ordinality;
  if v_combined then
    insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
      select r.workspace_id,r.id,r.advertiser_id,v_count+(row_number() over(order by f.date,f.external_account_id,f.row_key))::integer-1,
        f.row,f.date,f.channel,f.device,f.source,v_snapshot
      from public.media_sync_fact_rows f join public.media_connections mc on mc.id=any(v_naver_ids)
        and mc.external_account_id=f.external_account_id and mc.provider=f.provider
      where f.workspace_id=r.workspace_id and f.advertiser_id=r.advertiser_id and f.provider='naver_searchad'
        and f.date between v_from and v_to;
    get diagnostics v_actual = row_count;
    if v_actual<>v_naver_count then raise exception 'NAVER_META_FACTS_CHANGED'; end if;
    -- Completed materialization records only: these never enter a worker queue.
    for v_row in select value from jsonb_array_elements(v_participants) loop
      insert into public.media_sync_jobs(id,workspace_id,advertiser_id,report_id,connection_id,provider,external_account_id,
        date_from,date_to,data_level,mode,status,progress,raw_rows,normalized_rows,inserted_rows,failed_rows,
        previous_ingestion_id,snapshot_ingestion_id,attempt_count,created_by,started_at,finished_at)
      values(gen_random_uuid(),r.workspace_id,r.advertiser_id,r.id,(v_row->>'connection_id')::uuid,'naver_searchad',v_row->>'external_account_id',
        v_from,v_to,'mixed','snapshot_replace','done',100,(v_row->>'row_count')::integer,(v_row->>'row_count')::integer,
        (v_row->>'row_count')::integer,0,r.current_ingestion_id,v_snapshot,1,(p_payload->>'user_id')::uuid,v_now,v_now);
    end loop;
  end if;
  insert into public.media_sync_jobs(id,workspace_id,advertiser_id,report_id,connection_id,provider,external_account_id,
    date_from,date_to,data_level,mode,status,progress,raw_rows,normalized_rows,inserted_rows,failed_rows,
    previous_ingestion_id,snapshot_ingestion_id,attempt_count,created_by,started_at,finished_at)
    values(v_job,r.workspace_id,r.advertiser_id,r.id,c.id,'meta_ads',c.external_account_id,v_from,v_to,'creative','snapshot_replace',
      'done',100,v_count,v_count,v_count,0,r.current_ingestion_id,v_snapshot,1,(p_payload->>'user_id')::uuid,v_now,v_now)
    returning * into j;
  update public.reports set current_ingestion_id=v_snapshot,last_ingested_at=v_now,last_ingestion_run_id=v_job::text,
    meta=jsonb_set(r.meta,'{meta_ads_snapshot}',jsonb_build_object('contract','meta_contact_snapshot_v1','policy',v_policy,
      'account_totals',v_proof,'row_count',v_count,'rows_with_reconciled_absence',v_missing,'page_count',(p_payload->>'page_count')::integer,
      'date_from',v_from,'date_to',v_to,'job_id',v_job,'ingestion_id',v_snapshot,'saved_at',v_now),true)
    where id=r.id;
  if v_combined then
    update public.reports set meta=jsonb_set(meta,'{multi_media_snapshot}',jsonb_build_object(
      'contract','naver_meta_contact_v1','date_from',v_from,'date_to',v_to,'row_count',v_total,'saved_at',v_now,
      'ingestion_id',v_snapshot,'conversion_aggregation','sum_provider_attributed_conversions',
      'participants',v_participants||jsonb_build_array(jsonb_build_object('connection_id',c.id,'provider','meta_ads',
        'external_account_id',c.external_account_id,'row_count',v_count)), 'naver_partitions',v_naver_audit),true) where id=r.id;
  end if;
  update public.media_connections set last_sync_at=v_now,updated_at=v_now where id=c.id;
  -- Published pointers, report status, old snapshots and all other providers remain untouched.
  return jsonb_build_object('job',to_jsonb(j)-'error_detail','snapshot_ingestion_id',v_snapshot,'row_count',v_total);
end;
$function$
;
