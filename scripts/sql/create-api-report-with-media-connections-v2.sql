begin;

create or replace function public.create_api_report_with_media_connections_v2(
  p_workspace_id uuid,
  p_advertiser_id uuid,
  p_connection_ids uuid[],
  p_report_type_id uuid,
  p_title text,
  p_period_start date,
  p_period_end date,
  p_created_by uuid,
  p_meta jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_workspace_tenant_id uuid;
  v_advertiser_tenant_id uuid;

  v_connection_ids uuid[];
  v_connection_count integer;
  v_found_count integer;
  v_scope_count integer;
  v_active_count integer;
  v_credentials_count integer;
  v_supported_count integer;

  v_providers text[];

  v_meta jsonb;
  v_data_source jsonb;

  v_report public.reports%rowtype;
begin
  if
    p_workspace_id is null or
    p_advertiser_id is null or
    p_report_type_id is null or
    p_created_by is null
  then
    raise exception
      'API_REPORT_INVALID_INPUT: required identity is missing';
  end if;

  if
    p_connection_ids is null or
    cardinality(p_connection_ids) < 1 or
    cardinality(p_connection_ids) > 16
  then
    raise exception
      'API_REPORT_INVALID_INPUT: connection_ids must contain 1..16 values';
  end if;

  if array_position(
    p_connection_ids,
    null
  ) is not null then
    raise exception
      'API_REPORT_INVALID_INPUT: connection_ids contains null';
  end if;

  select
    array_agg(
      connection_id
      order by connection_id
    ),
    count(*)
  into
    v_connection_ids,
    v_connection_count
  from (
    select distinct
      value as connection_id
    from unnest(
      p_connection_ids
    ) as source(value)
  ) normalized;

  if
    v_connection_count <>
    cardinality(p_connection_ids)
  then
    raise exception
      'API_REPORT_INVALID_INPUT: duplicate connection_id';
  end if;

  if
    p_period_start is not null and
    p_period_end is not null and
    p_period_start > p_period_end
  then
    raise exception
      'API_REPORT_INVALID_INPUT: invalid report period';
  end if;

  if
    p_meta is not null and
    jsonb_typeof(p_meta) <> 'object'
  then
    raise exception
      'API_REPORT_INVALID_INPUT: meta must be a JSON object';
  end if;

  select
    workspace.tenant_id
  into
    v_workspace_tenant_id
  from public.workspaces workspace
  where workspace.id =
    p_workspace_id;

  if
    not found or
    v_workspace_tenant_id is null
  then
    raise exception
      'API_REPORT_SCOPE_INVALID: workspace not found';
  end if;

  select
    advertiser.tenant_id
  into
    v_advertiser_tenant_id
  from public.advertisers advertiser
  where
    advertiser.id =
      p_advertiser_id and
    advertiser.workspace_id =
      p_workspace_id;

  if
    not found or
    v_advertiser_tenant_id is null
  then
    raise exception
      'API_REPORT_SCOPE_INVALID: advertiser scope invalid';
  end if;

  if
    v_advertiser_tenant_id <>
    v_workspace_tenant_id
  then
    raise exception
      'API_REPORT_SCOPE_INVALID: advertiser tenant mismatch';
  end if;

  perform 1
  from public.report_types report_type
  where report_type.id =
    p_report_type_id;

  if not found then
    raise exception
      'API_REPORT_INVALID_INPUT: report type not found';
  end if;

  select count(*)
  into v_found_count
  from public.media_connections connection
  where connection.id =
    any(v_connection_ids);

  if
    v_found_count <>
    v_connection_count
  then
    raise exception
      'API_REPORT_CONNECTION_NOT_FOUND: one or more connections were not found';
  end if;

  select count(*)
  into v_scope_count
  from public.media_connections connection
  where
    connection.id =
      any(v_connection_ids) and
    connection.workspace_id =
      p_workspace_id and
    connection.advertiser_id =
      p_advertiser_id and
    connection.tenant_id =
      v_workspace_tenant_id;

  if
    v_scope_count <>
    v_connection_count
  then
    raise exception
      'API_REPORT_CONNECTION_SCOPE_INVALID: connection scope mismatch';
  end if;

  select count(*)
  into v_active_count
  from public.media_connections connection
  where
    connection.id =
      any(v_connection_ids) and
    connection.status =
      'active';

  if
    v_active_count <>
    v_connection_count
  then
    raise exception
      'API_REPORT_CONNECTION_NOT_ACTIVE: one or more connections are not active';
  end if;

  select count(*)
  into v_credentials_count
  from public.media_connections connection
  where
    connection.id =
      any(v_connection_ids) and
    connection.credential_ciphertext is not null and
    btrim(
      connection.credential_ciphertext
    ) <> '';

  if
    v_credentials_count <>
    v_connection_count
  then
    raise exception
      'API_REPORT_CONNECTION_CREDENTIALS_MISSING: one or more credentials are missing';
  end if;

  select count(*)
  into v_supported_count
  from public.media_connections connection
  where
    connection.id =
      any(v_connection_ids) and
    connection.provider in (
      'naver_searchad',
      'google_ads',
      'meta_ads'
    );

  if
    v_supported_count <>
    v_connection_count
  then
    raise exception
      'API_REPORT_INVALID_INPUT: unsupported media provider';
  end if;

  select
    array_agg(
      distinct connection.provider
      order by connection.provider
    )
  into v_providers
  from public.media_connections connection
  where connection.id =
    any(v_connection_ids);

  if
    v_providers is null or
    cardinality(v_providers) < 1
  then
    raise exception
      'API_REPORT_INVALID_INPUT: provider resolution failed';
  end if;

  v_meta :=
    coalesce(
      p_meta,
      '{}'::jsonb
    );

  v_data_source :=
    coalesce(
      v_meta -> 'data_source',
      '{}'::jsonb
    );

  if
    jsonb_typeof(v_data_source) <>
    'object'
  then
    raise exception
      'API_REPORT_INVALID_INPUT: data_source must be a JSON object';
  end if;

  v_data_source :=
    v_data_source
      - 'provider'
      - 'providers';

  v_data_source :=
    v_data_source ||
    jsonb_build_object(
      'kind',
      'api'
    );

  if cardinality(v_providers) = 1 then
    -- Single-media V2 remains compatible with the existing
    -- meta.data_source.provider mirror.
    v_data_source :=
      v_data_source ||
      jsonb_build_object(
        'provider',
        v_providers[1]
      );
  else
    -- Multi-media reports cannot truthfully expose one provider.
    -- The connection mapping remains authoritative.
    v_data_source :=
      v_data_source ||
      jsonb_build_object(
        'providers',
        to_jsonb(v_providers)
      );
  end if;

  v_meta :=
    jsonb_set(
      v_meta,
      '{data_source}',
      v_data_source,
      true
    );

  insert into public.reports (
    tenant_id,
    workspace_id,
    advertiser_id,
    report_type_id,
    title,
    status,
    period_start,
    period_end,
    created_by,
    meta
  )
  values (
    v_workspace_tenant_id,
    p_workspace_id,
    p_advertiser_id,
    p_report_type_id,
    coalesce(
      nullif(
        btrim(p_title),
        ''
      ),
      'New Report - Draft'
    ),
    'draft',
    p_period_start,
    p_period_end,
    p_created_by,
    v_meta
  )
  returning *
  into v_report;

  insert into public.report_media_connections (
    tenant_id,
    workspace_id,
    advertiser_id,
    report_id,
    connection_id
  )
  select
    v_workspace_tenant_id,
    p_workspace_id,
    p_advertiser_id,
    v_report.id,
    connection_id
  from unnest(
    v_connection_ids
  ) as mapping(connection_id)
  order by connection_id;

  return jsonb_build_object(
    'id',
      v_report.id,
    'workspace_id',
      v_report.workspace_id,
    'advertiser_id',
      v_report.advertiser_id,
    'report_type_id',
      v_report.report_type_id,
    'title',
      v_report.title,
    'status',
      v_report.status,
    'period_start',
      v_report.period_start,
    'period_end',
      v_report.period_end,
    'created_at',
      v_report.created_at,
    'meta',
      v_report.meta,
    'connection_ids',
      to_jsonb(v_connection_ids),
    'providers',
      to_jsonb(v_providers),
    'connection_id',
      case
        when cardinality(v_connection_ids) = 1
          then to_jsonb(v_connection_ids[1])
        else 'null'::jsonb
      end,
    'provider',
      case
        when cardinality(v_providers) = 1
          then to_jsonb(v_providers[1])
        else 'null'::jsonb
      end
  );
end;
$function$;

revoke all
on function public.create_api_report_with_media_connections_v2(
  uuid,
  uuid,
  uuid[],
  uuid,
  text,
  date,
  date,
  uuid,
  jsonb
)
from public;

revoke all
on function public.create_api_report_with_media_connections_v2(
  uuid,
  uuid,
  uuid[],
  uuid,
  text,
  date,
  date,
  uuid,
  jsonb
)
from anon;

revoke all
on function public.create_api_report_with_media_connections_v2(
  uuid,
  uuid,
  uuid[],
  uuid,
  text,
  date,
  date,
  uuid,
  jsonb
)
from authenticated;

grant execute
on function public.create_api_report_with_media_connections_v2(
  uuid,
  uuid,
  uuid[],
  uuid,
  text,
  date,
  date,
  uuid,
  jsonb
)
to service_role;

commit;
