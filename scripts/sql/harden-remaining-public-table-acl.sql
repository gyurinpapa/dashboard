begin;

/*
 * Stage 8 / Macro 4-B5B
 *
 * Layer 1:
 * Remove table-level administrative/destructive privileges from
 * anon/authenticated across the remaining 17 public tables.
 *
 * SELECT is intentionally preserved.
 * Row-level INSERT/UPDATE/DELETE on RLS-enabled tables is intentionally
 * preserved in this remediation.
 */

revoke truncate, references, trigger, maintain
on table
  public.ad_data,
  public.app_admins,
  public.client_members__deprecated,
  public.clients__deprecated,
  public.companies,
  public.departments,
  public.insights,
  public.metrics_daily_backup_before_dedupe,
  public.metrics_daily_dedup,
  public.org_units,
  public.profiles,
  public.roles,
  public.sync_logs,
  public.sync_runs,
  public.teams,
  public.tenants,
  public.workspace_invites
from anon, authenticated;


/*
 * Layer 2:
 * These five tables had RLS disabled in the Production inventory.
 * Current HEAD has no browser/authenticated direct-write dependency.
 *
 * Remove direct row mutation authority as well.
 */

revoke insert, update, delete
on table
  public.insights,
  public.metrics_daily_backup_before_dedupe,
  public.metrics_daily_dedup,
  public.sync_logs,
  public.sync_runs
from anon, authenticated;


/*
 * Fail-closed assertions.
 */
do $$
declare
  v_table_name text;
  v_role_name text;

  v_all_tables constant text[] := array[
    'ad_data',
    'app_admins',
    'client_members__deprecated',
    'clients__deprecated',
    'companies',
    'departments',
    'insights',
    'metrics_daily_backup_before_dedupe',
    'metrics_daily_dedup',
    'org_units',
    'profiles',
    'roles',
    'sync_logs',
    'sync_runs',
    'teams',
    'tenants',
    'workspace_invites'
  ];

  v_rls_off_tables constant text[] := array[
    'insights',
    'metrics_daily_backup_before_dedupe',
    'metrics_daily_dedup',
    'sync_logs',
    'sync_runs'
  ];
begin

  /*
   * Every target table must still exist.
   */
  foreach v_table_name in array v_all_tables
  loop
    if to_regclass(
      format('public.%I', v_table_name)
    ) is null then
      raise exception
        'M4B5B_ASSERTION_FAILED: target table missing: %',
        v_table_name;
    end if;
  end loop;


  /*
   * anon/authenticated:
   * SELECT must remain.
   * Table-level admin/destructive authority must be gone.
   */
  foreach v_role_name in array array['anon', 'authenticated']
  loop
    foreach v_table_name in array v_all_tables
    loop

      if not has_table_privilege(
        v_role_name,
        format('public.%I', v_table_name),
        'SELECT'
      ) then
        raise exception
          'M4B5B_ASSERTION_FAILED: SELECT unexpectedly removed: role=% table=%',
          v_role_name,
          v_table_name;
      end if;

      if
        has_table_privilege(
          v_role_name,
          format('public.%I', v_table_name),
          'TRUNCATE'
        )
        or has_table_privilege(
          v_role_name,
          format('public.%I', v_table_name),
          'REFERENCES'
        )
        or has_table_privilege(
          v_role_name,
          format('public.%I', v_table_name),
          'TRIGGER'
        )
        or has_table_privilege(
          v_role_name,
          format('public.%I', v_table_name),
          'MAINTAIN'
        )
      then
        raise exception
          'M4B5B_ASSERTION_FAILED: table-level authority remains: role=% table=%',
          v_role_name,
          v_table_name;
      end if;

    end loop;
  end loop;


  /*
   * RLS-OFF P1 group:
   * direct row mutation authority must be gone.
   */
  foreach v_role_name in array array['anon', 'authenticated']
  loop
    foreach v_table_name in array v_rls_off_tables
    loop

      if
        has_table_privilege(
          v_role_name,
          format('public.%I', v_table_name),
          'INSERT'
        )
        or has_table_privilege(
          v_role_name,
          format('public.%I', v_table_name),
          'UPDATE'
        )
        or has_table_privilege(
          v_role_name,
          format('public.%I', v_table_name),
          'DELETE'
        )
      then
        raise exception
          'M4B5B_ASSERTION_FAILED: RLS-OFF direct DML remains: role=% table=%',
          v_role_name,
          v_table_name;
      end if;

    end loop;
  end loop;


  /*
   * service_role authority must remain unchanged.
   */
  foreach v_table_name in array v_all_tables
  loop

    if
      not has_table_privilege(
        'service_role',
        format('public.%I', v_table_name),
        'SELECT'
      )
      or not has_table_privilege(
        'service_role',
        format('public.%I', v_table_name),
        'INSERT'
      )
      or not has_table_privilege(
        'service_role',
        format('public.%I', v_table_name),
        'UPDATE'
      )
      or not has_table_privilege(
        'service_role',
        format('public.%I', v_table_name),
        'DELETE'
      )
      or not has_table_privilege(
        'service_role',
        format('public.%I', v_table_name),
        'TRUNCATE'
      )
      or not has_table_privilege(
        'service_role',
        format('public.%I', v_table_name),
        'REFERENCES'
      )
      or not has_table_privilege(
        'service_role',
        format('public.%I', v_table_name),
        'TRIGGER'
      )
      or not has_table_privilege(
        'service_role',
        format('public.%I', v_table_name),
        'MAINTAIN'
      )
    then
      raise exception
        'M4B5B_ASSERTION_FAILED: service_role authority changed: table=%',
        v_table_name;
    end if;

  end loop;

end;
$$;

commit;


/*
 * One Result Set postflight.
 */
with target_tables(table_name, remove_direct_dml) as (
  values
    ('ad_data'::text, false),
    ('app_admins'::text, false),
    ('client_members__deprecated'::text, false),
    ('clients__deprecated'::text, false),
    ('companies'::text, false),
    ('departments'::text, false),
    ('insights'::text, true),
    ('metrics_daily_backup_before_dedupe'::text, true),
    ('metrics_daily_dedup'::text, true),
    ('org_units'::text, false),
    ('profiles'::text, false),
    ('roles'::text, false),
    ('sync_logs'::text, true),
    ('sync_runs'::text, true),
    ('teams'::text, false),
    ('tenants'::text, false),
    ('workspace_invites'::text, false)
),

roles(role_name) as (
  values
    ('anon'::text),
    ('authenticated'::text),
    ('service_role'::text)
)

select
  tt.table_name,
  r.role_name,

  tt.remove_direct_dml,

  has_table_privilege(
    r.role_name,
    format('public.%I', tt.table_name),
    'SELECT'
  ) as can_select,

  has_table_privilege(
    r.role_name,
    format('public.%I', tt.table_name),
    'INSERT'
  ) as can_insert,

  has_table_privilege(
    r.role_name,
    format('public.%I', tt.table_name),
    'UPDATE'
  ) as can_update,

  has_table_privilege(
    r.role_name,
    format('public.%I', tt.table_name),
    'DELETE'
  ) as can_delete,

  has_table_privilege(
    r.role_name,
    format('public.%I', tt.table_name),
    'TRUNCATE'
  ) as can_truncate,

  has_table_privilege(
    r.role_name,
    format('public.%I', tt.table_name),
    'REFERENCES'
  ) as can_references,

  has_table_privilege(
    r.role_name,
    format('public.%I', tt.table_name),
    'TRIGGER'
  ) as can_trigger,

  has_table_privilege(
    r.role_name,
    format('public.%I', tt.table_name),
    'MAINTAIN'
  ) as can_maintain

from target_tables tt
cross join roles r

order by
  tt.table_name,
  r.role_name;
