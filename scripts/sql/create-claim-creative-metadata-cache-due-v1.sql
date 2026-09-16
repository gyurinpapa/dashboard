create or replace function public.claim_creative_metadata_cache_due_v1(
  p_account_key text,
  p_keys text[],
  p_max_requests integer,
  p_refresh_ahead_ms integer
)
returns jsonb
language plpgsql
set search_path to ''
set statement_timeout to '2000ms'
set lock_timeout to '500ms'
as $function$
declare
  a etrylue_creative_cache_v1.accounts%rowtype;
  n timestamptz;
  refresh_before timestamptz;
  cached jsonb;
  found_count integer;
  due_count integer;
  effective_requests integer;
  state text;
  token uuid;
  retry timestamptz;
  deadline timestamptz;
begin
  if p_account_key is null
    or p_account_key !~ '^[0-9a-f]{64}$'
    or p_keys is null
    or cardinality(p_keys) not between 1 and 20
    or p_max_requests is null
    or p_max_requests not between 1 and 40
    or p_refresh_ahead_ms is null
    or p_refresh_ahead_ms not between 300000 and 21300000
    or exists(
      select 1
      from unnest(p_keys) k
      where k is null or k !~ '^[0-9a-f]{64}$'
    )
    or (
      select count(distinct k)
      from unnest(p_keys) k
    ) <> cardinality(p_keys)
  then
    raise exception 'INVALID_CACHE_INPUT';
  end if;

  insert into etrylue_creative_cache_v1.accounts(account_key)
  values(p_account_key)
  on conflict do nothing;

  select *
  into strict a
  from etrylue_creative_cache_v1.accounts
  where account_key = p_account_key
  for update;

  n := clock_timestamp();
  refresh_before := n + (p_refresh_ahead_ms::text || ' milliseconds')::interval;

  delete from etrylue_creative_cache_v1.entries
  where (account_key, cache_key) in (
    select account_key, cache_key
    from etrylue_creative_cache_v1.entries
    where account_key = p_account_key
      and expires_at < n - interval '1 day'
    order by expires_at
    limit 100
  );

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', cache_key,
          'metadata', payload,
          'expiresAt', floor(extract(epoch from expires_at) * 1000)
        )
        order by cache_key
      ),
      '[]'::jsonb
    ),
    count(*)
  into cached, found_count
  from etrylue_creative_cache_v1.entries
  where account_key = p_account_key
    and cache_key = any(p_keys)
    and expires_at > refresh_before;

  due_count := cardinality(p_keys) - found_count;

  -- Reserve only the provider-call budget proportional to keys that are
  -- actually missing or due for refresh. For the current collectors this is
  -- exact: Naver uses N requests, Google uses 1 + 2N requests.
  effective_requests := case
    when due_count <= 0 then 0
    else greatest(
      1,
      ceil(
        (p_max_requests::numeric * due_count::numeric) /
        cardinality(p_keys)::numeric
      )::integer
    )
  end;

  if found_count = cardinality(p_keys) then
    state := 'hit';
  elsif a.lease_until > n then
    state := 'busy';
    retry := a.lease_until;
  elsif a.next_allowed_at > n then
    state := 'cooldown';
    retry := a.next_allowed_at;
  else
    if a.window_start + interval '1 hour' <= n then
      a.window_start := n;
      a.reserved_requests := 0;
    end if;

    if a.reserved_requests + effective_requests > 120 then
      state := 'budget';
      retry := a.window_start + interval '1 hour';
    else
      state := 'leader';
      token := gen_random_uuid();
      deadline := n + interval '60 seconds';

      update etrylue_creative_cache_v1.accounts
      set lease_token = token,
          lease_until = deadline,
          lease_keys = p_keys,
          window_start = a.window_start,
          reserved_requests = a.reserved_requests + effective_requests
      where account_key = p_account_key;
    end if;
  end if;

  return jsonb_build_object(
    'status', state,
    'token', token,
    'leaseUntil', case
      when deadline is null then 0
      else floor(extract(epoch from deadline) * 1000)
    end,
    'now', floor(extract(epoch from n) * 1000),
    'retryAt', case
      when retry is null then 0
      else floor(extract(epoch from retry) * 1000)
    end,
    'entries', cached
  );
end;
$function$;

revoke all on function public.claim_creative_metadata_cache_due_v1(text, text[], integer, integer) from public;
revoke all on function public.claim_creative_metadata_cache_due_v1(text, text[], integer, integer) from anon;
revoke all on function public.claim_creative_metadata_cache_due_v1(text, text[], integer, integer) from authenticated;
grant execute on function public.claim_creative_metadata_cache_due_v1(text, text[], integer, integer) to service_role;
