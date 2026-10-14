-- Atomic, service-role-only metadata enrichment. Original detail rows and row counts remain intact.
create or replace function public.enrich_naver_campaign_daily_authority(
  p_job_id uuid, p_started_at timestamptz, p_expected_rows bigint, p_stats jsonb
) returns bigint language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  j public.media_sync_jobs%rowtype;
  s jsonb;
  anchor uuid;
  changed bigint := 0;
  metric text;
begin
  select * into strict j from public.media_sync_jobs where id = p_job_id for update;
  if j.status <> 'processing' or j.provider <> 'naver_searchad'
     or j.started_at is distinct from p_started_at then
    raise exception 'Naver campaign authority claim mismatch';
  end if;
  if p_expected_rows < 0 or p_expected_rows is null or
     (select count(*) from public.media_sync_staging_rows where job_id = j.id) <> p_expected_rows then
    raise exception 'Naver campaign authority staging count mismatch';
  end if;
  if jsonb_typeof(p_stats) is distinct from 'array' then
    raise exception 'Naver campaign authority payload must be an array';
  end if;
  if exists (select 1 from jsonb_array_elements(p_stats) x
             group by x->>'campaign_id', x->>'date' having count(*) <> 1) then
    raise exception 'Duplicate Naver campaign authority scope';
  end if;
  -- A transaction either installs all carriers or none. Resume keeps the frozen observation.
  if exists (select 1 from public.media_sync_staging_rows where job_id = j.id
             and row->'provider_meta' ? 'campaign_daily_authority_v1') then
    return 0;
  end if;
  for s in select value from jsonb_array_elements(p_stats) loop
    if s->>'version' is distinct from '1' or coalesce(s->>'campaign_id','') = '' or
       coalesce(s->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or
       (s->>'date')::date not between j.date_from and j.date_to then
      raise exception 'Invalid Naver campaign authority scope';
    end if;
    foreach metric in array array['impressions','clicks','cost','conversions','revenue'] loop
      if jsonb_typeof(s->metric) is distinct from 'number' or (s->>metric)::numeric < 0 then
        raise exception 'Invalid Naver campaign authority metric';
      end if;
    end loop;
    select id into anchor from public.media_sync_staging_rows
      where job_id = j.id and workspace_id = j.workspace_id and advertiser_id = j.advertiser_id
        and date = (s->>'date')::date and row->>'provider' = j.provider
        and row->>'external_account_id' = j.external_account_id
        and row->>'external_campaign_id' = s->>'campaign_id'
        and row->'provider_meta'->>'campaign_type' = 'WEB_SITE'
      order by row_index limit 1;
    if anchor is null then
      if exists (select 1 from unnest(array['impressions','clicks','cost','conversions','revenue']) m
                 where (s->>m)::numeric <> 0) then
        raise exception 'Nonzero campaign authority has no collected detail scope';
      end if;
    else
      update public.media_sync_staging_rows set row = jsonb_set(
        row, '{provider_meta,campaign_daily_authority_v1}', s, true) where id = anchor;
      changed := changed + 1;
    end if;
  end loop;
  if exists (select 1 from public.media_sync_staging_rows r where r.job_id = j.id
    and r.row->'provider_meta'->>'campaign_type' = 'WEB_SITE'
    and not exists (select 1 from jsonb_array_elements(p_stats) x
      where x->>'campaign_id' = r.row->>'external_campaign_id' and x->>'date' = r.date::text)) then
    raise exception 'Collected WEB_SITE scope missing campaign authority';
  end if;
  return changed;
end;
$$;
revoke all on function public.enrich_naver_campaign_daily_authority(uuid,timestamptz,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.enrich_naver_campaign_daily_authority(uuid,timestamptz,bigint,jsonb) to service_role;
