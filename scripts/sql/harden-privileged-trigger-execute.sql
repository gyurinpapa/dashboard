begin;

revoke execute
on function public.etrylue_v2_assign_advertiser_tenant_scope()
from public, anon, authenticated;

revoke execute
on function public.etrylue_v2_assign_media_connection_tenant_scope()
from public, anon, authenticated;

revoke execute
on function public.etrylue_v2_assign_report_tenant_scope()
from public, anon, authenticated;

revoke execute
on function public.etrylue_v2_provision_tenant_member_from_workspace_member()
from public, anon, authenticated;

revoke execute
on function public.handle_new_user()
from public, anon, authenticated;

revoke execute
on function public.handle_new_user_create_profile()
from public, anon, authenticated;

/*
 * Fail closed.
 *
 * Contract:
 * - all six functions still exist
 * - all still return trigger
 * - all still SECURITY DEFINER
 * - existing trigger bindings still exist
 * - PUBLIC / anon / authenticated EXECUTE is gone
 * - service_role EXECUTE remains
 */
do $$
declare
  v_function_name text;
  v_oid oid;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_service_role_execute boolean;
  v_returns_trigger boolean;
  v_security_definer boolean;
  v_trigger_binding_count bigint;
begin
  foreach v_function_name in array array[
    'etrylue_v2_assign_advertiser_tenant_scope()',
    'etrylue_v2_assign_media_connection_tenant_scope()',
    'etrylue_v2_assign_report_tenant_scope()',
    'etrylue_v2_provision_tenant_member_from_workspace_member()',
    'handle_new_user()',
    'handle_new_user_create_profile()'
  ]
  loop
    v_oid := to_regprocedure('public.' || v_function_name);

    if v_oid is null then
      raise exception
        'M4B4C_ASSERTION_FAILED: function missing: %',
        v_function_name;
    end if;

    select
      p.prorettype = 'pg_catalog.trigger'::regtype,
      p.prosecdef,
      has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      ),
      has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      ),
      has_function_privilege(
        'service_role',
        p.oid,
        'EXECUTE'
      ),
      exists (
        select 1
        from aclexplode(
          coalesce(
            p.proacl,
            acldefault('f', p.proowner)
          )
        ) a
        where a.grantee = 0
          and a.privilege_type = 'EXECUTE'
      ),
      (
        select count(*)
        from pg_trigger t
        where t.tgfoid = p.oid
          and not t.tgisinternal
      )
    into
      v_returns_trigger,
      v_security_definer,
      v_anon_execute,
      v_authenticated_execute,
      v_service_role_execute,
      v_public_execute,
      v_trigger_binding_count
    from pg_proc p
    where p.oid = v_oid;

    if v_returns_trigger is distinct from true then
      raise exception
        'M4B4C_ASSERTION_FAILED: function is no longer RETURNS trigger: %',
        v_function_name;
    end if;

    if v_security_definer is distinct from true then
      raise exception
        'M4B4C_ASSERTION_FAILED: SECURITY DEFINER changed unexpectedly: %',
        v_function_name;
    end if;

    if v_trigger_binding_count < 1 then
      raise exception
        'M4B4C_ASSERTION_FAILED: trigger binding missing: %',
        v_function_name;
    end if;

    if v_public_execute
       or v_anon_execute
       or v_authenticated_execute then
      raise exception
        'M4B4C_ASSERTION_FAILED: unprivileged EXECUTE remains: %',
        v_function_name;
    end if;

    if v_service_role_execute is distinct from true then
      raise exception
        'M4B4C_ASSERTION_FAILED: service_role EXECUTE missing: %',
        v_function_name;
    end if;
  end loop;
end;
$$;

commit;

/* One Result Set postflight. */
with target_functions(function_signature) as (
  values
    ('etrylue_v2_assign_advertiser_tenant_scope()'::text),
    ('etrylue_v2_assign_media_connection_tenant_scope()'::text),
    ('etrylue_v2_assign_report_tenant_scope()'::text),
    ('etrylue_v2_provision_tenant_member_from_workspace_member()'::text),
    ('handle_new_user()'::text),
    ('handle_new_user_create_profile()'::text)
),
resolved as (
  select
    tf.function_signature,
    to_regprocedure('public.' || tf.function_signature)::oid as function_oid
  from target_functions tf
),
inventory as (
  select
    r.function_signature,
    p.oid,
    p.proowner,
    p.prosecdef,
    p.prorettype,
    exists (
      select 1
      from aclexplode(
        coalesce(
          p.proacl,
          acldefault('f', p.proowner)
        )
      ) a
      where a.grantee = 0
        and a.privilege_type = 'EXECUTE'
    ) as public_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
    (
      select count(*)
      from pg_trigger t
      where t.tgfoid = p.oid
        and not t.tgisinternal
    ) as trigger_binding_count
  from resolved r
  join pg_proc p
    on p.oid = r.function_oid
)
select
  function_signature as function_name,
  jsonb_build_object(
    'security_definer', prosecdef,
    'returns_trigger', prorettype = 'pg_catalog.trigger'::regtype,
    'public_execute', public_execute,
    'anon_execute', anon_execute,
    'authenticated_execute', authenticated_execute,
    'service_role_execute', service_role_execute,
    'trigger_binding_count', trigger_binding_count
  ) as detail
from inventory
order by function_signature;
