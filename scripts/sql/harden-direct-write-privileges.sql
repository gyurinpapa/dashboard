begin;

revoke
  insert,
  update,
  delete,
  truncate,
  references,
  trigger,
  maintain
on table public.report_creatives
from anon, authenticated;

revoke
  insert,
  update,
  delete,
  truncate,
  references,
  trigger,
  maintain
on table public.ingestion_jobs
from anon, authenticated;

/*
 * Fail-closed post-mutation assertions.
 *
 * Expected:
 * - anon/authenticated SELECT remains available
 * - every direct write/admin privilege is removed
 * - service_role keeps its existing authority
 * - RLS states remain unchanged
 */
do $$
declare
  v_report_creatives_rls boolean;
  v_ingestion_jobs_rls boolean;
begin
  select c.relrowsecurity
    into v_report_creatives_rls
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'report_creatives'
     and c.relkind in ('r', 'p');

  select c.relrowsecurity
    into v_ingestion_jobs_rls
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'ingestion_jobs'
     and c.relkind in ('r', 'p');

  if v_report_creatives_rls is distinct from false then
    raise exception
      'M4B3_ASSERTION_FAILED: report_creatives RLS state changed unexpectedly';
  end if;

  if v_ingestion_jobs_rls is distinct from true then
    raise exception
      'M4B3_ASSERTION_FAILED: ingestion_jobs RLS state changed unexpectedly';
  end if;

  if not has_table_privilege(
      'anon',
      'public.report_creatives',
      'SELECT'
    )
    or not has_table_privilege(
      'authenticated',
      'public.report_creatives',
      'SELECT'
    )
    or not has_table_privilege(
      'anon',
      'public.ingestion_jobs',
      'SELECT'
    )
    or not has_table_privilege(
      'authenticated',
      'public.ingestion_jobs',
      'SELECT'
    ) then
    raise exception
      'M4B3_ASSERTION_FAILED: expected SELECT privilege was removed';
  end if;

  if
    has_table_privilege('anon', 'public.report_creatives', 'INSERT')
    or has_table_privilege('anon', 'public.report_creatives', 'UPDATE')
    or has_table_privilege('anon', 'public.report_creatives', 'DELETE')
    or has_table_privilege('anon', 'public.report_creatives', 'TRUNCATE')
    or has_table_privilege('anon', 'public.report_creatives', 'REFERENCES')
    or has_table_privilege('anon', 'public.report_creatives', 'TRIGGER')
    or has_table_privilege('anon', 'public.report_creatives', 'MAINTAIN')

    or has_table_privilege('authenticated', 'public.report_creatives', 'INSERT')
    or has_table_privilege('authenticated', 'public.report_creatives', 'UPDATE')
    or has_table_privilege('authenticated', 'public.report_creatives', 'DELETE')
    or has_table_privilege('authenticated', 'public.report_creatives', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.report_creatives', 'REFERENCES')
    or has_table_privilege('authenticated', 'public.report_creatives', 'TRIGGER')
    or has_table_privilege('authenticated', 'public.report_creatives', 'MAINTAIN')

    or has_table_privilege('anon', 'public.ingestion_jobs', 'INSERT')
    or has_table_privilege('anon', 'public.ingestion_jobs', 'UPDATE')
    or has_table_privilege('anon', 'public.ingestion_jobs', 'DELETE')
    or has_table_privilege('anon', 'public.ingestion_jobs', 'TRUNCATE')
    or has_table_privilege('anon', 'public.ingestion_jobs', 'REFERENCES')
    or has_table_privilege('anon', 'public.ingestion_jobs', 'TRIGGER')
    or has_table_privilege('anon', 'public.ingestion_jobs', 'MAINTAIN')

    or has_table_privilege('authenticated', 'public.ingestion_jobs', 'INSERT')
    or has_table_privilege('authenticated', 'public.ingestion_jobs', 'UPDATE')
    or has_table_privilege('authenticated', 'public.ingestion_jobs', 'DELETE')
    or has_table_privilege('authenticated', 'public.ingestion_jobs', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.ingestion_jobs', 'REFERENCES')
    or has_table_privilege('authenticated', 'public.ingestion_jobs', 'TRIGGER')
    or has_table_privilege('authenticated', 'public.ingestion_jobs', 'MAINTAIN')
  then
    raise exception
      'M4B3_ASSERTION_FAILED: direct write/admin privilege remains';
  end if;

  if not has_table_privilege(
      'service_role',
      'public.report_creatives',
      'SELECT'
    )
    or not has_table_privilege(
      'service_role',
      'public.report_creatives',
      'INSERT'
    )
    or not has_table_privilege(
      'service_role',
      'public.report_creatives',
      'UPDATE'
    )
    or not has_table_privilege(
      'service_role',
      'public.report_creatives',
      'DELETE'
    )
    or not has_table_privilege(
      'service_role',
      'public.ingestion_jobs',
      'SELECT'
    )
    or not has_table_privilege(
      'service_role',
      'public.ingestion_jobs',
      'INSERT'
    )
    or not has_table_privilege(
      'service_role',
      'public.ingestion_jobs',
      'UPDATE'
    )
    or not has_table_privilege(
      'service_role',
      'public.ingestion_jobs',
      'DELETE'
    ) then
    raise exception
      'M4B3_ASSERTION_FAILED: service_role authority changed unexpectedly';
  end if;
end;
$$;

commit;

with targets(table_name) as (
  values
    ('ingestion_jobs'::text),
    ('report_creatives'::text)
),
roles(role_name) as (
  values
    ('anon'::text),
    ('authenticated'::text),
    ('service_role'::text)
)
select
  t.table_name,
  r.role_name,
  has_table_privilege(
    r.role_name,
    format('public.%I', t.table_name),
    'SELECT'
  ) as can_select,
  has_table_privilege(
    r.role_name,
    format('public.%I', t.table_name),
    'INSERT'
  ) as can_insert,
  has_table_privilege(
    r.role_name,
    format('public.%I', t.table_name),
    'UPDATE'
  ) as can_update,
  has_table_privilege(
    r.role_name,
    format('public.%I', t.table_name),
    'DELETE'
  ) as can_delete,
  has_table_privilege(
    r.role_name,
    format('public.%I', t.table_name),
    'TRUNCATE'
  ) as can_truncate,
  has_table_privilege(
    r.role_name,
    format('public.%I', t.table_name),
    'REFERENCES'
  ) as can_references,
  has_table_privilege(
    r.role_name,
    format('public.%I', t.table_name),
    'TRIGGER'
  ) as can_trigger,
  has_table_privilege(
    r.role_name,
    format('public.%I', t.table_name),
    'MAINTAIN'
  ) as can_maintain
from targets t
cross join roles r
order by
  t.table_name,
  r.role_name;
