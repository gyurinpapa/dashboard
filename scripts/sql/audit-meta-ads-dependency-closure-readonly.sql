-- Etrylue Performance: bounded dependency discovery evidence only; NOT a migration.
-- Run the WHOLE file in the same project's SQL editor that supplied the baseline.
-- Export ALL result rows as JSON; the manifest states expected_result_rows.
-- Discovery limits: 8 graph edges, 40 relations. Overflow remains PENDING.
-- Confirm the project ref separately;
-- current_database() alone does not identify a Supabase project.
-- Roots: public.companies, profiles, tenant_members, client_members__deprecated.
-- Includes reachable public/auth schema definitions, never their row data.
-- auth.users DATA (including identities/passwords/tokens) is NEVER selected.
-- Reads pg_catalog only. Does not read application rows, credentials, role
-- passwords or sequence values. Does not invoke any application function.
-- Function bodies/default expressions below are returned as definition TEXT.
-- No installation, schema/data mutation, job creation, worker or API calls.
-- Missing objects remain explicit. Dependency completeness is NEVER inferred
-- from pg_depend alone: PL/pgSQL text/dynamic SQL needs a subsequent review.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

WITH RECURSIVE
-- Discovery is catalog-only. Text matches are CANDIDATES, not proof of
-- executable dependencies; quoted/unqualified/dynamic SQL still needs review.
roots(schema_name, name) AS (
  VALUES ('public'::text, 'companies'::text), ('public', 'profiles'),
    ('public', 'tenant_members'), ('public', 'client_members__deprecated')
),
relations AS MATERIALIZED (
  SELECT c.oid, n.nspname::text AS schema_name, c.relname::text AS name
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','auth') AND c.relkind IN ('r','p','v','m','f')
),
functions AS MATERIALIZED (
  SELECT p.oid, n.nspname::text AS schema_name, p.proname::text AS name, p.prosrc
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','auth') AND p.prokind IN ('f','p')
),
owned_objects(owner_kind, owner_oid, classid, objid) AS (
  SELECT 'r'::text, r.oid, 'pg_catalog.pg_class'::regclass::oid, r.oid FROM relations r
  UNION SELECT 'f', f.oid, 'pg_catalog.pg_proc'::regclass::oid, f.oid FROM functions f
  UNION SELECT 'r', a.adrelid, 'pg_catalog.pg_attrdef'::regclass::oid, a.oid
    FROM pg_catalog.pg_attrdef a JOIN relations r ON r.oid=a.adrelid
  UNION SELECT 'r', c.conrelid, 'pg_catalog.pg_constraint'::regclass::oid, c.oid
    FROM pg_catalog.pg_constraint c JOIN relations r ON r.oid=c.conrelid
  UNION SELECT 'r', i.indrelid, 'pg_catalog.pg_class'::regclass::oid, i.indexrelid
    FROM pg_catalog.pg_index i JOIN relations r ON r.oid=i.indrelid
  UNION SELECT 'r', g.tgrelid, 'pg_catalog.pg_trigger'::regclass::oid, g.oid
    FROM pg_catalog.pg_trigger g JOIN relations r ON r.oid=g.tgrelid WHERE NOT g.tgisinternal
  UNION SELECT 'r', p.polrelid, 'pg_catalog.pg_policy'::regclass::oid, p.oid
    FROM pg_catalog.pg_policy p JOIN relations r ON r.oid=p.polrelid
),
text_references AS MATERIALIZED (
  SELECT f.oid, m.parts[1] AS schema_name, m.parts[2] AS name
  FROM functions f CROSS JOIN LATERAL
    regexp_matches(f.prosrc, '(public|auth)\.([A-Za-z_][A-Za-z0-9_]*)', 'g') m(parts)
),
edges(source_kind, source_oid, target_kind, target_oid) AS MATERIALIZED (
  SELECT o.owner_kind, o.owner_oid, 'r'::text, r.oid FROM owned_objects o
    JOIN pg_catalog.pg_depend d ON d.classid=o.classid AND d.objid=o.objid
    JOIN relations r ON d.refclassid='pg_catalog.pg_class'::regclass AND r.oid=d.refobjid
  UNION SELECT o.owner_kind, o.owner_oid, 'f', f.oid FROM owned_objects o
    JOIN pg_catalog.pg_depend d ON d.classid=o.classid AND d.objid=o.objid
    JOIN functions f ON d.refclassid='pg_catalog.pg_proc'::regclass AND f.oid=d.refobjid
  UNION SELECT 'r', c.conrelid, 'r', c.confrelid FROM pg_catalog.pg_constraint c
    JOIN relations a ON a.oid=c.conrelid JOIN relations b ON b.oid=c.confrelid WHERE c.contype='f'
  UNION SELECT 'r', g.tgrelid, 'f', g.tgfoid FROM pg_catalog.pg_trigger g
    JOIN relations r ON r.oid=g.tgrelid JOIN functions f ON f.oid=g.tgfoid WHERE NOT g.tgisinternal
  UNION SELECT 'f', t.oid, 'r', r.oid FROM text_references t
    JOIN relations r ON r.schema_name=t.schema_name AND r.name=t.name
  UNION SELECT 'f', t.oid, 'f', f.oid FROM text_references t
    JOIN functions f ON f.schema_name=t.schema_name AND f.name=t.name
),
walk(kind, oid, depth) AS (
  SELECT 'r'::text, r.oid, 0 FROM roots s
    JOIN relations r ON r.schema_name=s.schema_name AND r.name=s.name
  UNION
  SELECT e.target_kind, e.target_oid, w.depth+1 FROM walk w
    JOIN edges e ON e.source_kind=w.kind AND e.source_oid=w.oid WHERE w.depth<8
),
reached AS MATERIALIZED (SELECT kind, oid, min(depth) AS depth FROM walk GROUP BY kind, oid),
requested(schema_name, name) AS (
  SELECT schema_name, name FROM roots
  UNION
  SELECT r.schema_name, r.name FROM reached w JOIN relations r ON w.kind='r' AND w.oid=r.oid
  -- Overflow is explicit in the manifest; do not export an arbitrary subset.
  WHERE (SELECT count(*) FROM reached WHERE kind='r')<=40
),
targets AS (
  SELECT r.schema_name, r.name, c.oid, c.relkind, c.relowner, c.relacl,
    c.relrowsecurity, c.relforcerowsecurity, c.relispartition
  FROM requested r
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = r.schema_name
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = r.name
),
audit_roles AS (
  SELECT wanted.name, r.oid, r.rolsuper, r.rolinherit, r.rolbypassrls
  FROM (VALUES ('anon'::text), ('authenticated'), ('service_role')) wanted(name)
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname = wanted.name
),
objects(classid, objid) AS (
  SELECT 'pg_catalog.pg_class'::regclass::oid, t.oid FROM targets t WHERE t.oid IS NOT NULL
  UNION
  SELECT 'pg_catalog.pg_attrdef'::regclass::oid, d.oid
    FROM pg_catalog.pg_attrdef d JOIN targets t ON t.oid = d.adrelid
  UNION
  SELECT 'pg_catalog.pg_constraint'::regclass::oid, c.oid
    FROM pg_catalog.pg_constraint c JOIN targets t ON t.oid = c.conrelid
  UNION
  SELECT 'pg_catalog.pg_class'::regclass::oid, i.indexrelid
    FROM pg_catalog.pg_index i JOIN targets t ON t.oid = i.indrelid
  UNION
  SELECT 'pg_catalog.pg_trigger'::regclass::oid, g.oid
    FROM pg_catalog.pg_trigger g JOIN targets t ON t.oid = g.tgrelid WHERE NOT g.tgisinternal
  UNION
  SELECT 'pg_catalog.pg_policy'::regclass::oid, p.oid
    FROM pg_catalog.pg_policy p JOIN targets t ON t.oid = p.polrelid
),
function_seeds(oid) AS (
  SELECT oid FROM reached WHERE kind='f'
  UNION
  SELECT g.tgfoid FROM pg_catalog.pg_trigger g JOIN targets t ON t.oid = g.tgrelid
    WHERE NOT g.tgisinternal
  UNION
  SELECT d.refobjid FROM pg_catalog.pg_depend d
    JOIN objects o ON o.classid = d.classid AND o.objid = d.objid
    WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass
),
function_closure(oid) AS (
  SELECT oid FROM function_seeds
  UNION
  SELECT d.refobjid FROM pg_catalog.pg_depend d JOIN function_closure f
    ON d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = f.oid
    WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass
),
dependency_sources(classid, objid) AS (
  SELECT classid, objid FROM objects
  UNION
  SELECT 'pg_catalog.pg_proc'::regclass::oid, oid FROM function_closure
),
table_evidence AS (
  SELECT '20_table'::text AS section, format('%I.%I', t.schema_name, t.name) AS object_name,
    jsonb_build_object(
      'present', t.oid IS NOT NULL,
      'relation_kind', t.relkind,
      'supported_plain_table', coalesce(t.relkind = 'r' AND NOT t.relispartition, false),
      'owner', pg_get_userbyid(t.relowner), 'acl', t.relacl::text,
      'rls_enabled', t.relrowsecurity, 'rls_forced', t.relforcerowsecurity,
      'columns', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull, 'identity', a.attidentity,
        'generated', a.attgenerated, 'column_acl', a.attacl::text,
        'collation', CASE WHEN a.attcollation <> 0 THEN a.attcollation::regcollation::text END,
        'default_expression', pg_get_expr(d.adbin, d.adrelid)
      ) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped), '[]'::jsonb),
      'constraints', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'name', c.conname, 'kind', c.contype, 'validated', c.convalidated,
        'deferrable', c.condeferrable, 'initially_deferred', c.condeferred,
        'definition', pg_get_constraintdef(c.oid, false),
        'referenced_table', CASE WHEN c.confrelid <> 0 THEN c.confrelid::regclass::text END
      ) ORDER BY c.conname) FROM pg_catalog.pg_constraint c WHERE c.conrelid = t.oid), '[]'::jsonb),
      'indexes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'definition', pg_get_indexdef(i.indexrelid), 'unique', i.indisunique,
        'valid', i.indisvalid, 'ready', i.indisready
      ) ORDER BY i.indexrelid::regclass::text) FROM pg_catalog.pg_index i WHERE i.indrelid = t.oid), '[]'::jsonb),
      'policies', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
        'roles', (SELECT jsonb_agg(CASE WHEN u.role_oid = 0 THEN 'PUBLIC'
          ELSE pg_get_userbyid(u.role_oid) END ORDER BY u.role_oid)
          FROM unnest(p.polroles) u(role_oid)),
        'using', pg_get_expr(p.polqual, p.polrelid),
        'with_check', pg_get_expr(p.polwithcheck, p.polrelid)
      ) ORDER BY p.polname) FROM pg_catalog.pg_policy p WHERE p.polrelid = t.oid), '[]'::jsonb),
      'user_triggers', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'name', g.tgname, 'enabled', g.tgenabled,
        'trigger_definition', pg_get_triggerdef(g.oid, false),
        'function_identity', g.tgfoid::regprocedure::text,
        'function_definition', pg_get_functiondef(g.tgfoid),
        'function_definition_md5', md5(pg_get_functiondef(g.tgfoid))
      ) ORDER BY g.tgname) FROM pg_catalog.pg_trigger g
        WHERE g.tgrelid = t.oid AND NOT g.tgisinternal), '[]'::jsonb),
      'inheritance', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'child', h.inhrelid::regclass::text, 'parent', h.inhparent::regclass::text
      ) ORDER BY h.inhrelid, h.inhparent) FROM pg_catalog.pg_inherits h
        WHERE h.inhrelid = t.oid OR h.inhparent = t.oid), '[]'::jsonb),
      'rules', coalesce((SELECT jsonb_agg(pg_get_ruledef(w.oid, false) ORDER BY w.rulename)
        FROM pg_catalog.pg_rewrite w WHERE w.ev_class = t.oid), '[]'::jsonb),
      'role_access_before_rls', (SELECT jsonb_agg(jsonb_build_object(
        'role', r.name, 'role_exists', r.oid IS NOT NULL,
        'schema_usage', CASE WHEN r.oid IS NOT NULL AND t.oid IS NOT NULL THEN has_schema_privilege(r.oid, t.schema_name, 'USAGE') END,
        'select_any_column', CASE WHEN r.oid IS NOT NULL AND t.oid IS NOT NULL THEN has_any_column_privilege(r.oid, t.oid, 'SELECT') END,
        'insert_any_column', CASE WHEN r.oid IS NOT NULL AND t.oid IS NOT NULL THEN has_any_column_privilege(r.oid, t.oid, 'INSERT') END,
        'update_any_column', CASE WHEN r.oid IS NOT NULL AND t.oid IS NOT NULL THEN has_any_column_privilege(r.oid, t.oid, 'UPDATE') END,
        'delete', CASE WHEN r.oid IS NOT NULL AND t.oid IS NOT NULL THEN has_table_privilege(r.oid, t.oid, 'DELETE') END,
        'truncate', CASE WHEN r.oid IS NOT NULL AND t.oid IS NOT NULL THEN has_table_privilege(r.oid, t.oid, 'TRUNCATE') END
      ) ORDER BY r.name) FROM audit_roles r)
    ) AS detail
  FROM targets t
),
result AS (
  SELECT '00_context'::text AS section, 'audit_context'::text AS object_name,
    jsonb_build_object(
      'audit_version', 'etrylue-meta-closure-dependencies-readonly-v1',
      'captured_at', statement_timestamp(), 'database_name', current_database(),
      'current_user', current_user, 'server_version', current_setting('server_version'),
      'server_version_num', current_setting('server_version_num'),
      'transaction_read_only', current_setting('transaction_read_only'),
      'transaction_isolation', current_setting('transaction_isolation'),
      'lock_timeout', current_setting('lock_timeout'),
      'statement_timeout', current_setting('statement_timeout'),
      'reference_commit', 'f714e95a374592a0f7581a2d82132ab043fab35e',
      'transitive_dependencies_export_sha256', '5e5ed253bd4d154430b29f50b1a535eaa5a566c8544869ab9989570c27312414',
      'reference_dependencies_export_sha256', 'f7b5e4a10389e5f9f40e22ebe6f07d413309c21e963818dc7a50befcb72d3479',
      'previous_export_sha256', 'df89dfb74fd637f65707007d341f5bdcc469ab8e69bc30b49649586b0dab0f10',
      'project_identity', 'VERIFY_SUPABASE_PROJECT_REF_EXTERNALLY',
      'application_row_reads', 0, 'application_rpc_calls', 0,
      'role_metadata', (SELECT jsonb_agg(jsonb_build_object(
        'role', r.name, 'present', r.oid IS NOT NULL, 'superuser', r.rolsuper,
        'inherit', r.rolinherit, 'bypassrls', r.rolbypassrls
      ) ORDER BY r.name) FROM audit_roles r),
      'pgcrypto', (SELECT jsonb_build_object('version', e.extversion, 'schema', n.nspname)
        FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'pgcrypto')
    ) AS detail
  UNION ALL SELECT section, object_name, detail FROM table_evidence
  UNION ALL
  SELECT '30_dependencies', 'catalog_dependency_evidence', jsonb_build_object(
    'catalog_edges', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'source', pg_describe_object(d.classid, d.objid, d.objsubid),
      'target', pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid),
      'dependency_type', d.deptype
    ) ORDER BY d.classid, d.objid, d.objsubid, d.refclassid, d.refobjid, d.refobjsubid)
      FROM pg_catalog.pg_depend d JOIN dependency_sources s
        ON s.classid = d.classid AND s.objid = d.objid), '[]'::jsonb),
    'referenced_functions', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'identity', p.oid::regprocedure::text, 'kind', p.prokind,
      'owner', pg_get_userbyid(p.proowner), 'acl', p.proacl::text,
      'security_definer', p.prosecdef, 'settings', p.proconfig,
      'definition', CASE WHEN n.nspname <> 'pg_catalog' AND p.prokind IN ('f', 'p') THEN pg_get_functiondef(p.oid) END,
      'definition_md5', CASE WHEN n.nspname <> 'pg_catalog' AND p.prokind IN ('f', 'p') THEN md5(pg_get_functiondef(p.oid)) END,
      'definition_bytes', CASE WHEN n.nspname <> 'pg_catalog' AND p.prokind IN ('f', 'p') THEN octet_length(pg_get_functiondef(p.oid)) END,
      'public_execute', EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
      'role_execute', (SELECT jsonb_agg(jsonb_build_object('role', r.name,
        'execute', CASE WHEN r.oid IS NOT NULL THEN has_function_privilege(r.oid, p.oid, 'EXECUTE') END
      ) ORDER BY r.name) FROM audit_roles r)
    ) ORDER BY p.oid::regprocedure::text) FROM function_closure f
      JOIN pg_catalog.pg_proc p ON p.oid = f.oid
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace), '[]'::jsonb),
    'external_fk_targets', coalesce((SELECT jsonb_agg(x.name ORDER BY x.name) FROM (
      SELECT DISTINCT c.confrelid::regclass::text AS name
      FROM pg_catalog.pg_constraint c JOIN targets t ON t.oid = c.conrelid
      WHERE c.contype = 'f' AND NOT EXISTS (SELECT 1 FROM targets other WHERE other.oid = c.confrelid)
    ) x), '[]'::jsonb),
    'function_body_dependency_review', 'REQUIRED: text/dynamic SQL dependencies may not be catalog-tracked',
    'dependency_closure_verified', false
  )
  UNION ALL
  SELECT '90_manifest', 'completeness', jsonb_build_object(
    'requested_tables', (SELECT jsonb_agg(format('%I.%I', schema_name, name) ORDER BY schema_name, name) FROM requested),
    'tables_found', (SELECT count(*) FROM targets WHERE oid IS NOT NULL),
    'missing_tables', coalesce((SELECT jsonb_agg(format('%I.%I', schema_name, name) ORDER BY schema_name, name) FROM targets WHERE oid IS NULL), '[]'::jsonb),
    'unsupported_relations', coalesce((SELECT jsonb_agg(format('%I.%I', schema_name, name) ORDER BY schema_name, name) FROM targets
      WHERE oid IS NOT NULL AND (relkind <> 'r' OR relispartition)), '[]'::jsonb),
    'expected_result_rows', (SELECT count(*)+3 FROM requested),
    'root_tables', (SELECT jsonb_agg(format('%I.%I', schema_name, name) ORDER BY name) FROM roots),
    'discovered_relation_count', (SELECT count(*) FROM reached WHERE kind='r'),
    'relation_limit', 40, 'relation_limit_exceeded', (SELECT count(*)>40 FROM reached WHERE kind='r'),
    'depth_limit', 8,
    'unexpanded_graph_edges', (SELECT count(*) FROM edges e JOIN reached w
      ON w.kind=e.source_kind AND w.oid=e.source_oid WHERE NOT EXISTS(
        SELECT 1 FROM reached dest WHERE dest.kind=e.target_kind AND dest.oid=e.target_oid)),
    'text_discovery_limitations', 'Candidate public/auth unquoted qualified names only. Review all function bodies; dynamic/unqualified/quoted names and other schemas are not certified.',
    'dependency_closure_verified', false, 'isolated_db_ready', false,
    'next_action', 'REVIEW_EXPORT_AND_RESOLVE_REMAINING_DEPENDENCIES_BEFORE_ISOLATED_DB_SETUP'
  )
)
SELECT section, object_name, detail FROM result ORDER BY section, object_name;

ROLLBACK;
