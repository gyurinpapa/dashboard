-- ISOLATED TEST ONLY: production schema definitions, no production rows.
-- Target: lpwmxtnzpgyrhphwufsd. No workers, cron, media connections or live credentials.
begin;
set local statement_timeout='20s';
set local search_path=public,extensions;
do $$begin if exists(select 1 from pg_tables where schemaname='public') then raise exception 'TEST_DATABASE_MUST_BE_EMPTY'; end if; end$$;
create table public."workspaces" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"created_by" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"owner_org_unit_id" uuid,
"workspace_kind" text DEFAULT 'project'::text NOT NULL,
"client_id" uuid,
"workspace_type" text DEFAULT 'team'::text NOT NULL,
"company_id" uuid,
"slug" text,
"owner_user_id" uuid,
"logo_storage_bucket" text,
"logo_storage_path" text,
"logo_updated_at" timestamp with time zone,
"tenant_id" uuid
);
create table public."companies" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"is_locked" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."workspace_members" (
"workspace_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"role" text DEFAULT 'staff'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"division" text,
"department" text,
"team" text
);
create table public."workspace_invites" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"email" text NOT NULL,
"role" text DEFAULT 'staff'::text NOT NULL,
"token" text NOT NULL,
"invited_by" uuid,
"accepted_by" uuid,
"status" text DEFAULT 'pending'::text NOT NULL,
"expires_at" timestamp with time zone,
"accepted_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."roles" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"name" text NOT NULL,
"rank" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."tenants" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"slug" text NOT NULL,
"tenant_type" text NOT NULL,
"status" text DEFAULT 'active'::text NOT NULL,
"created_by" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."tenant_members" (
"tenant_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"role" text DEFAULT 'member'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."org_units" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"parent_id" uuid,
"type" text NOT NULL,
"name" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."clients__deprecated" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"code" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."teams" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"department_id" uuid NOT NULL,
"name" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."report_types" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"key" text NOT NULL,
"name" text NOT NULL,
"schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."profiles" (
"id" uuid NOT NULL,
"company_id" uuid NOT NULL,
"name" text NOT NULL,
"department_id" uuid,
"team_id" uuid,
"role_id" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"email" text,
"platform_role" text
);
create table public."departments" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"name" text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."report_ingestions" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"report_id" uuid NOT NULL,
"kind" text DEFAULT 'csv'::text NOT NULL,
"status" text DEFAULT 'queued'::text NOT NULL,
"csv_path" text,
"row_count" integer,
"error" text,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."reports" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"report_type_id" uuid NOT NULL,
"title" text NOT NULL,
"period_start" date,
"period_end" date,
"status" text DEFAULT 'draft'::text NOT NULL,
"created_by" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
"share_token" text,
"advertiser_id" uuid,
"published_at" timestamp with time zone,
"last_ingested_at" timestamp with time zone,
"last_ingestion_run_id" text,
"last_published_at" timestamp with time zone,
"current_ingestion_id" uuid,
"published_ingestion_id" uuid,
"current_creatives_batch_id" uuid,
"published_creatives_batch_id" uuid,
"draft_period_start" date,
"draft_period_end" date,
"draft_period_preset" text,
"draft_period_label" text,
"published_period_start" date,
"published_period_end" date,
"published_period_preset" text,
"published_period_label" text,
"tenant_id" uuid
);
create table public."advertisers" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"workspace_id" uuid NOT NULL,
"name" text NOT NULL,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"public_slug" text,
"tenant_id" uuid
);
create table public."client_members__deprecated" (
"client_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"role" text DEFAULT 'owner'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
create table public."app_admins" (
"user_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
alter table public."workspaces" add constraint "workspaces_pkey" PRIMARY KEY (id);
alter table public."workspace_members" add constraint "workspace_members_pkey" PRIMARY KEY (workspace_id, user_id);
alter table public."workspaces" add constraint "workspaces_workspace_kind_check" CHECK ((workspace_kind = ANY (ARRAY['client'::text, 'team'::text, 'project'::text])));
alter table public."org_units" add constraint "org_units_type_check" CHECK ((type = ANY (ARRAY['company'::text, 'division'::text, 'department'::text, 'team'::text])));
alter table public."org_units" add constraint "org_units_pkey" PRIMARY KEY (id);
alter table public."report_types" add constraint "report_types_pkey" PRIMARY KEY (id);
alter table public."report_types" add constraint "report_types_key_key" UNIQUE (key);
alter table public."reports" add constraint "reports_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'archived'::text])));
alter table public."reports" add constraint "reports_pkey" PRIMARY KEY (id);
alter table public."clients__deprecated" add constraint "clients_pkey" PRIMARY KEY (id);
alter table public."clients__deprecated" add constraint "clients_code_key" UNIQUE (code);
alter table public."reports" add constraint "reports_share_token_key" UNIQUE (share_token);
alter table public."companies" add constraint "companies_pkey" PRIMARY KEY (id);
alter table public."roles" add constraint "roles_pkey" PRIMARY KEY (id);
alter table public."departments" add constraint "departments_pkey" PRIMARY KEY (id);
alter table public."teams" add constraint "teams_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."advertisers" add constraint "advertisers_pkey" PRIMARY KEY (id);
alter table public."report_ingestions" add constraint "report_ingestions_pkey" PRIMARY KEY (id);
alter table public."workspace_members" add constraint "workspace_members_role_check" CHECK ((role = ANY (ARRAY['master'::text, 'director'::text, 'admin'::text, 'staff'::text, 'client'::text])));
alter table public."workspaces" add constraint "workspaces_workspace_type_check" CHECK ((workspace_type = ANY (ARRAY['company'::text, 'team'::text, 'personal'::text])));
alter table public."profiles" add constraint "profiles_platform_role_check" CHECK (((platform_role IS NULL) OR (platform_role = 'platform_owner'::text)));
alter table public."workspace_invites" add constraint "workspace_invites_pkey" PRIMARY KEY (id);
alter table public."workspace_invites" add constraint "workspace_invites_token_key" UNIQUE (token);
alter table public."advertisers" add constraint "advertisers_public_slug_format_check" CHECK (((public_slug IS NULL) OR (TRIM(BOTH FROM public_slug) = ''::text) OR (public_slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'::text)));
alter table public."tenants" add constraint "tenants_name_not_blank_check" CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table public."tenants" add constraint "tenants_slug_format_check" CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'::text));
alter table public."tenants" add constraint "tenants_tenant_type_check" CHECK ((tenant_type = ANY (ARRAY['agency'::text, 'advertiser'::text])));
alter table public."tenants" add constraint "tenants_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text])));
alter table public."tenants" add constraint "tenants_pkey" PRIMARY KEY (id);
alter table public."tenant_members" add constraint "tenant_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));
alter table public."tenant_members" add constraint "tenant_members_pkey" PRIMARY KEY (tenant_id, user_id);
alter table public."workspaces" add constraint "workspaces_tenant_id_id_uq" UNIQUE (tenant_id, id);
alter table public."advertisers" add constraint "advertisers_tenant_workspace_id_uq" UNIQUE (tenant_id, workspace_id, id);
alter table public."reports" add constraint "reports_tenant_workspace_advertiser_id_uq" UNIQUE (tenant_id, workspace_id, advertiser_id, id);
alter table public."client_members__deprecated" add constraint "client_members_pkey" PRIMARY KEY (client_id, user_id);
alter table public."app_admins" add constraint "app_admins_pkey" PRIMARY KEY (user_id);
alter table public."workspace_members" add constraint "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."workspaces" add constraint "workspaces_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients__deprecated(id);
alter table public."org_units" add constraint "org_units_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES org_units(id) ON DELETE CASCADE;
alter table public."reports" add constraint "reports_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."reports" add constraint "reports_report_type_id_fkey" FOREIGN KEY (report_type_id) REFERENCES report_types(id) ON DELETE RESTRICT;
alter table public."roles" add constraint "roles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public."departments" add constraint "departments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public."teams" add constraint "teams_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table public."teams" add constraint "teams_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."profiles" add constraint "profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
alter table public."profiles" add constraint "profiles_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
alter table public."profiles" add constraint "profiles_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
alter table public."profiles" add constraint "profiles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
alter table public."advertisers" add constraint "advertisers_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."advertisers" add constraint "advertisers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public."reports" add constraint "reports_advertiser_id_fkey" FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE SET NULL;
alter table public."tenants" add constraint "tenants_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."tenant_members" add constraint "tenant_members_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table public."tenant_members" add constraint "tenant_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."workspaces" add constraint "workspaces_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
alter table public."advertisers" add constraint "advertisers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
alter table public."reports" add constraint "reports_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
alter table public."advertisers" add constraint "advertisers_tenant_workspace_fkey" FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON DELETE CASCADE;
alter table public."reports" add constraint "reports_tenant_workspace_fkey" FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON DELETE CASCADE;
alter table public."reports" add constraint "reports_tenant_workspace_advertiser_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id) REFERENCES advertisers(tenant_id, workspace_id, id) ON DELETE SET NULL (advertiser_id);
alter table public."client_members__deprecated" add constraint "client_members_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients__deprecated(id) ON DELETE CASCADE;
alter table public."app_admins" add constraint "app_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX roles_uq_company_name ON public.roles USING btree (company_id, name);
CREATE UNIQUE INDEX teams_uq_dept_name ON public.teams USING btree (department_id, name);
CREATE UNIQUE INDEX companies_name_uq ON public.companies USING btree (name);
CREATE INDEX workspace_members_user_id_idx ON public.workspace_members USING btree (user_id);
CREATE UNIQUE INDEX departments_uq_company_name ON public.departments USING btree (company_id, name);
CREATE INDEX org_units_parent_idx ON public.org_units USING btree (parent_id);
CREATE INDEX org_units_type_idx ON public.org_units USING btree (type);
CREATE INDEX idx_profiles_platform_role ON public.profiles USING btree (platform_role);
CREATE UNIQUE INDEX advertisers_uq_ws_name ON public.advertisers USING btree (workspace_id, name);
CREATE INDEX advertisers_ws_idx ON public.advertisers USING btree (workspace_id);
CREATE UNIQUE INDEX advertisers_public_slug_unique ON public.advertisers USING btree (lower(TRIM(BOTH FROM public_slug))) WHERE ((public_slug IS NOT NULL) AND (TRIM(BOTH FROM public_slug) <> ''::text));
CREATE INDEX advertisers_tenant_id_idx ON public.advertisers USING btree (tenant_id);
CREATE INDEX idx_report_ingestions_report ON public.report_ingestions USING btree (report_id, created_at DESC);
CREATE INDEX idx_report_ingestions_ws ON public.report_ingestions USING btree (workspace_id, created_at DESC);
CREATE INDEX workspace_invites_workspace_id_idx ON public.workspace_invites USING btree (workspace_id);
CREATE INDEX workspace_invites_email_idx ON public.workspace_invites USING btree (lower(email));
CREATE INDEX workspace_invites_token_idx ON public.workspace_invites USING btree (token);
CREATE INDEX workspaces_created_by_idx ON public.workspaces USING btree (created_by);
CREATE INDEX workspaces_owner_org_unit_idx ON public.workspaces USING btree (owner_org_unit_id);
CREATE INDEX workspaces_kind_idx ON public.workspaces USING btree (workspace_kind);
CREATE INDEX idx_workspaces_client_id ON public.workspaces USING btree (client_id);
CREATE INDEX workspaces_tenant_id_idx ON public.workspaces USING btree (tenant_id);
CREATE INDEX reports_workspace_idx ON public.reports USING btree (workspace_id);
CREATE INDEX reports_type_idx ON public.reports USING btree (report_type_id);
CREATE UNIQUE INDEX reports_uq_share_token ON public.reports USING btree (share_token) WHERE (share_token IS NOT NULL);
CREATE INDEX reports_published_at_idx ON public.reports USING btree (published_at);
CREATE UNIQUE INDEX reports_share_token_uniq ON public.reports USING btree (share_token) WHERE (share_token IS NOT NULL);
CREATE INDEX reports_last_ingested_at_idx ON public.reports USING btree (last_ingested_at);
CREATE INDEX reports_last_published_at_idx ON public.reports USING btree (last_published_at);
CREATE INDEX reports_tenant_workspace_advertiser_idx ON public.reports USING btree (tenant_id, workspace_id, advertiser_id);
CREATE INDEX reports_tenant_id_idx ON public.reports USING btree (tenant_id);
CREATE UNIQUE INDEX reports_public_identity_uq ON public.reports USING btree (advertiser_id, ((meta #>> '{public_identity,source_type}'::text[])), ((meta #>> '{public_identity,report_type}'::text[])), ((meta #>> '{public_identity,period_type}'::text[])), ((meta #>> '{public_identity,period_key}'::text[]))) WHERE ((advertiser_id IS NOT NULL) AND (jsonb_typeof((meta -> 'public_identity'::text)) = 'object'::text) AND (COALESCE(btrim((meta #>> '{public_identity,source_type}'::text[])), ''::text) <> ''::text) AND (COALESCE(btrim((meta #>> '{public_identity,report_type}'::text[])), ''::text) <> ''::text) AND (COALESCE(btrim((meta #>> '{public_identity,period_type}'::text[])), ''::text) <> ''::text) AND (COALESCE(btrim((meta #>> '{public_identity,period_key}'::text[])), ''::text) <> ''::text));
CREATE UNIQUE INDEX tenants_slug_uidx ON public.tenants USING btree (slug);
CREATE INDEX tenants_type_status_idx ON public.tenants USING btree (tenant_type, status);
CREATE INDEX tenant_members_user_id_idx ON public.tenant_members USING btree (user_id);
CREATE INDEX tenant_members_tenant_role_idx ON public.tenant_members USING btree (tenant_id, role);
CREATE OR REPLACE FUNCTION public.add_workspace_owner_member()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'master')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$function$
;
revoke all on function public."add_workspace_owner_member"() from public,anon,authenticated,service_role;
grant execute on function public."add_workspace_owner_member"() to public;
grant execute on function public."add_workspace_owner_member"() to anon;
grant execute on function public."add_workspace_owner_member"() to authenticated;
grant execute on function public."add_workspace_owner_member"() to service_role;
CREATE OR REPLACE FUNCTION public.etrylue_v2_assign_advertiser_tenant_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_workspace_tenant_id uuid;
begin
  select w.tenant_id
  into v_workspace_tenant_id
  from public.workspaces w
  where w.id = new.workspace_id;

  if not found then
    raise exception using
      errcode = '23503',
      message =
        'V2_TENANT_SCOPE_INVALID: advertiser workspace does not exist';
  end if;

  -- tenant_id는 client 입력이 아니라 workspace에서 파생한다.
  new.tenant_id := v_workspace_tenant_id;

  return new;
end
$function$
;
revoke all on function public."etrylue_v2_assign_advertiser_tenant_scope"() from public,anon,authenticated,service_role;
grant execute on function public."etrylue_v2_assign_advertiser_tenant_scope"() to service_role;
CREATE OR REPLACE FUNCTION public.etrylue_v2_assign_report_tenant_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_workspace_tenant_id uuid;

  v_advertiser_workspace_id uuid;
  v_advertiser_tenant_id uuid;
begin
  select w.tenant_id
  into v_workspace_tenant_id
  from public.workspaces w
  where w.id = new.workspace_id;

  if not found then
    raise exception using
      errcode = '23503',
      message =
        'V2_TENANT_SCOPE_INVALID: report workspace does not exist';
  end if;


  if new.advertiser_id is not null then
    select
      a.workspace_id,
      a.tenant_id
    into
      v_advertiser_workspace_id,
      v_advertiser_tenant_id
    from public.advertisers a
    where a.id = new.advertiser_id;

    if not found then
      raise exception using
        errcode = '23503',
        message =
          'V2_TENANT_SCOPE_INVALID: report advertiser does not exist';
    end if;

    if v_advertiser_workspace_id is distinct from new.workspace_id then
      raise exception using
        errcode = '23514',
        message =
          'V2_TENANT_SCOPE_INVALID: report and advertiser workspace mismatch';
    end if;

    if v_advertiser_tenant_id is distinct from v_workspace_tenant_id then
      raise exception using
        errcode = '23514',
        message =
          'V2_TENANT_SCOPE_INVALID: report and advertiser tenant mismatch';
    end if;
  end if;


  new.tenant_id := v_workspace_tenant_id;

  return new;
end
$function$
;
revoke all on function public."etrylue_v2_assign_report_tenant_scope"() from public,anon,authenticated,service_role;
grant execute on function public."etrylue_v2_assign_report_tenant_scope"() to service_role;
CREATE OR REPLACE FUNCTION public.etrylue_v2_guard_report_public_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_identity jsonb;
  v_new_identity jsonb;
  v_was_published boolean;
BEGIN
  v_old_identity := OLD.meta -> 'public_identity';
  v_new_identity := NEW.meta -> 'public_identity';

  v_was_published :=
    OLD.published_at IS NOT NULL
    OR OLD.published_ingestion_id IS NOT NULL;

  IF v_was_published
     AND v_old_identity IS DISTINCT FROM v_new_identity
  THEN
    RAISE EXCEPTION
      'REPORT_PUBLIC_IDENTITY_LOCKED: report % canonical identity cannot change after first publish',
      OLD.id;
  END IF;

  RETURN NEW;
END;
$function$
;
revoke all on function public."etrylue_v2_guard_report_public_identity"() from public,anon,authenticated,service_role;
grant execute on function public."etrylue_v2_guard_report_public_identity"() to public;
grant execute on function public."etrylue_v2_guard_report_public_identity"() to anon;
grant execute on function public."etrylue_v2_guard_report_public_identity"() to authenticated;
grant execute on function public."etrylue_v2_guard_report_public_identity"() to service_role;
CREATE OR REPLACE FUNCTION public.etrylue_v2_provision_tenant_member_from_workspace_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_tenant_id uuid;
begin

  select w.tenant_id
  into v_tenant_id
  from public.workspaces w
  where w.id = new.workspace_id;

  if not found then
    raise exception
      'V2_TENANT_PROVISIONING_FAILED: workspace % does not exist.',
      new.workspace_id;
  end if;


  -- Legacy / 아직 Tenant에 매핑되지 않은 workspace는
  -- 기존 동작을 그대로 유지한다.
  if v_tenant_id is null then
    return new;
  end if;


  -- 신규 Tenant membership만 member로 생성.
  -- 이미 owner/admin/member가 존재하면 아무것도 변경하지 않는다.
  insert into public.tenant_members (
    tenant_id,
    user_id,
    role
  )
  values (
    v_tenant_id,
    new.user_id,
    'member'
  )
  on conflict on constraint tenant_members_pkey
  do nothing;


  return new;
end
$function$
;
revoke all on function public."etrylue_v2_provision_tenant_member_from_workspace_member"() from public,anon,authenticated,service_role;
grant execute on function public."etrylue_v2_provision_tenant_member_from_workspace_member"() to service_role;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return new;
end;
$function$
;
revoke all on function public."handle_new_user"() from public,anon,authenticated,service_role;
grant execute on function public."handle_new_user"() to service_role;
CREATE OR REPLACE FUNCTION public.handle_new_user_create_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  default_company_id uuid;
begin
  select c.id into default_company_id
  from public.companies c
  where c.name = '000'
  limit 1;

  if default_company_id is null then
    raise exception 'default company(000) not found';
  end if;

  insert into public.profiles (id, company_id, name)
  values (new.id, default_company_id, coalesce(new.raw_user_meta_data->>'name', 'New User'))
  on conflict (id) do nothing;

  return new;
end;
$function$
;
revoke all on function public."handle_new_user_create_profile"() from public,anon,authenticated,service_role;
grant execute on function public."handle_new_user_create_profile"() to service_role;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.app_admins a
    where a.user_id = auth.uid()
  );
$function$
;
revoke all on function public."is_admin"() from public,anon,authenticated,service_role;
grant execute on function public."is_admin"() to public;
grant execute on function public."is_admin"() to anon;
grant execute on function public."is_admin"() to authenticated;
grant execute on function public."is_admin"() to service_role;
CREATE OR REPLACE FUNCTION public.prevent_locked_company_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.is_locked = true and (new.name is distinct from old.name) then
    raise exception 'company is locked';
  end if;
  return new;
end;
$function$
;
revoke all on function public."prevent_locked_company_update"() from public,anon,authenticated,service_role;
grant execute on function public."prevent_locked_company_update"() to public;
grant execute on function public."prevent_locked_company_update"() to anon;
grant execute on function public."prevent_locked_company_update"() to authenticated;
grant execute on function public."prevent_locked_company_update"() to service_role;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
revoke all on function public."set_updated_at"() from public,anon,authenticated,service_role;
grant execute on function public."set_updated_at"() to public;
grant execute on function public."set_updated_at"() to anon;
grant execute on function public."set_updated_at"() to authenticated;
grant execute on function public."set_updated_at"() to service_role;
revoke all on public."workspaces" from public,anon,authenticated,service_role;
alter table public."workspaces" enable row level security;
revoke all on public."companies" from public,anon,authenticated,service_role;
alter table public."companies" enable row level security;
revoke all on public."workspace_members" from public,anon,authenticated,service_role;
alter table public."workspace_members" enable row level security;
revoke all on public."workspace_invites" from public,anon,authenticated,service_role;
alter table public."workspace_invites" enable row level security;
revoke all on public."roles" from public,anon,authenticated,service_role;
alter table public."roles" enable row level security;
revoke all on public."tenants" from public,anon,authenticated,service_role;
alter table public."tenants" enable row level security;
revoke all on public."tenant_members" from public,anon,authenticated,service_role;
alter table public."tenant_members" enable row level security;
revoke all on public."org_units" from public,anon,authenticated,service_role;
alter table public."org_units" enable row level security;
revoke all on public."clients__deprecated" from public,anon,authenticated,service_role;
alter table public."clients__deprecated" enable row level security;
revoke all on public."teams" from public,anon,authenticated,service_role;
alter table public."teams" enable row level security;
revoke all on public."report_types" from public,anon,authenticated,service_role;
alter table public."report_types" enable row level security;
revoke all on public."profiles" from public,anon,authenticated,service_role;
alter table public."profiles" enable row level security;
revoke all on public."departments" from public,anon,authenticated,service_role;
alter table public."departments" enable row level security;
revoke all on public."report_ingestions" from public,anon,authenticated,service_role;
revoke all on public."reports" from public,anon,authenticated,service_role;
alter table public."reports" enable row level security;
revoke all on public."advertisers" from public,anon,authenticated,service_role;
alter table public."advertisers" enable row level security;
revoke all on public."client_members__deprecated" from public,anon,authenticated,service_role;
alter table public."client_members__deprecated" enable row level security;
revoke all on public."app_admins" from public,anon,authenticated,service_role;
alter table public."app_admins" enable row level security;
create policy "org_units_select_authenticated" on public."org_units" as PERMISSIVE for SELECT to authenticated using (true);
create policy "workspace_members_select_own" on public."workspace_members" as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy "clients_select_member" on public."clients__deprecated" as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM client_members__deprecated cm
  WHERE ((cm.client_id = clients__deprecated.id) AND (cm.user_id = auth.uid())))));
create policy "clients_insert_auth" on public."clients__deprecated" as PERMISSIVE for INSERT to authenticated with check (true);
create policy "companies_select_auth" on public."companies" as PERMISSIVE for SELECT to authenticated using (true);
create policy "companies_modify_admin" on public."companies" as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy "roles_select_auth" on public."roles" as PERMISSIVE for SELECT to authenticated using (true);
create policy "departments_select_auth" on public."departments" as PERMISSIVE for SELECT to authenticated using (true);
create policy "teams_select_auth" on public."teams" as PERMISSIVE for SELECT to authenticated using (true);
create policy "roles_modify_admin" on public."roles" as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy "departments_modify_admin" on public."departments" as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy "teams_modify_admin" on public."teams" as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy "profiles_select_own" on public."profiles" as PERMISSIVE for SELECT to authenticated using (((id = auth.uid()) OR is_admin()));
create policy "profiles_update_own" on public."profiles" as PERMISSIVE for UPDATE to authenticated using (((id = auth.uid()) OR is_admin())) with check (((id = auth.uid()) OR is_admin()));
create policy "profiles_insert_admin_only" on public."profiles" as PERMISSIVE for INSERT to authenticated with check (is_admin());
create policy "profiles_delete_admin" on public."profiles" as PERMISSIVE for DELETE to authenticated using (is_admin());
create policy "app_admins_modify_admin" on public."app_admins" as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy "app_admins_select_admin" on public."app_admins" as PERMISSIVE for SELECT to authenticated using (is_admin());
create policy "client_members_insert_own" on public."client_members__deprecated" as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy "client_members_select_own" on public."client_members__deprecated" as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
grant INSERT on public."roles" to "anon";
grant SELECT on public."roles" to "anon";
grant UPDATE on public."roles" to "anon";
grant DELETE on public."roles" to "anon";
grant INSERT on public."roles" to "authenticated";
grant SELECT on public."roles" to "authenticated";
grant UPDATE on public."roles" to "authenticated";
grant DELETE on public."roles" to "authenticated";
grant INSERT on public."roles" to "service_role";
grant SELECT on public."roles" to "service_role";
grant UPDATE on public."roles" to "service_role";
grant DELETE on public."roles" to "service_role";
grant TRUNCATE on public."roles" to "service_role";
grant REFERENCES on public."roles" to "service_role";
grant TRIGGER on public."roles" to "service_role";
grant INSERT on public."teams" to "anon";
grant SELECT on public."teams" to "anon";
grant UPDATE on public."teams" to "anon";
grant DELETE on public."teams" to "anon";
grant INSERT on public."teams" to "authenticated";
grant SELECT on public."teams" to "authenticated";
grant UPDATE on public."teams" to "authenticated";
grant DELETE on public."teams" to "authenticated";
grant INSERT on public."teams" to "service_role";
grant SELECT on public."teams" to "service_role";
grant UPDATE on public."teams" to "service_role";
grant DELETE on public."teams" to "service_role";
grant TRUNCATE on public."teams" to "service_role";
grant REFERENCES on public."teams" to "service_role";
grant TRIGGER on public."teams" to "service_role";
grant INSERT on public."companies" to "anon";
grant SELECT on public."companies" to "anon";
grant UPDATE on public."companies" to "anon";
grant DELETE on public."companies" to "anon";
grant INSERT on public."companies" to "authenticated";
grant SELECT on public."companies" to "authenticated";
grant UPDATE on public."companies" to "authenticated";
grant DELETE on public."companies" to "authenticated";
grant INSERT on public."companies" to "service_role";
grant SELECT on public."companies" to "service_role";
grant UPDATE on public."companies" to "service_role";
grant DELETE on public."companies" to "service_role";
grant TRUNCATE on public."companies" to "service_role";
grant REFERENCES on public."companies" to "service_role";
grant TRIGGER on public."companies" to "service_role";
grant INSERT on public."workspace_members" to "service_role";
grant SELECT on public."workspace_members" to "service_role";
grant UPDATE on public."workspace_members" to "service_role";
grant DELETE on public."workspace_members" to "service_role";
grant TRUNCATE on public."workspace_members" to "service_role";
grant REFERENCES on public."workspace_members" to "service_role";
grant TRIGGER on public."workspace_members" to "service_role";
grant INSERT on public."departments" to "anon";
grant SELECT on public."departments" to "anon";
grant UPDATE on public."departments" to "anon";
grant DELETE on public."departments" to "anon";
grant INSERT on public."departments" to "authenticated";
grant SELECT on public."departments" to "authenticated";
grant UPDATE on public."departments" to "authenticated";
grant DELETE on public."departments" to "authenticated";
grant INSERT on public."departments" to "service_role";
grant SELECT on public."departments" to "service_role";
grant UPDATE on public."departments" to "service_role";
grant DELETE on public."departments" to "service_role";
grant TRUNCATE on public."departments" to "service_role";
grant REFERENCES on public."departments" to "service_role";
grant TRIGGER on public."departments" to "service_role";
grant INSERT on public."org_units" to "anon";
grant SELECT on public."org_units" to "anon";
grant UPDATE on public."org_units" to "anon";
grant DELETE on public."org_units" to "anon";
grant INSERT on public."org_units" to "authenticated";
grant SELECT on public."org_units" to "authenticated";
grant UPDATE on public."org_units" to "authenticated";
grant DELETE on public."org_units" to "authenticated";
grant INSERT on public."org_units" to "service_role";
grant SELECT on public."org_units" to "service_role";
grant UPDATE on public."org_units" to "service_role";
grant DELETE on public."org_units" to "service_role";
grant TRUNCATE on public."org_units" to "service_role";
grant REFERENCES on public."org_units" to "service_role";
grant TRIGGER on public."org_units" to "service_role";
grant INSERT on public."profiles" to "anon";
grant SELECT on public."profiles" to "anon";
grant UPDATE on public."profiles" to "anon";
grant DELETE on public."profiles" to "anon";
grant INSERT on public."profiles" to "authenticated";
grant SELECT on public."profiles" to "authenticated";
grant UPDATE on public."profiles" to "authenticated";
grant DELETE on public."profiles" to "authenticated";
grant INSERT on public."profiles" to "service_role";
grant SELECT on public."profiles" to "service_role";
grant UPDATE on public."profiles" to "service_role";
grant DELETE on public."profiles" to "service_role";
grant TRUNCATE on public."profiles" to "service_role";
grant REFERENCES on public."profiles" to "service_role";
grant TRIGGER on public."profiles" to "service_role";
grant INSERT on public."advertisers" to "service_role";
grant SELECT on public."advertisers" to "service_role";
grant UPDATE on public."advertisers" to "service_role";
grant DELETE on public."advertisers" to "service_role";
grant TRUNCATE on public."advertisers" to "service_role";
grant REFERENCES on public."advertisers" to "service_role";
grant TRIGGER on public."advertisers" to "service_role";
grant INSERT on public."report_types" to "service_role";
grant SELECT on public."report_types" to "service_role";
grant UPDATE on public."report_types" to "service_role";
grant DELETE on public."report_types" to "service_role";
grant TRUNCATE on public."report_types" to "service_role";
grant REFERENCES on public."report_types" to "service_role";
grant TRIGGER on public."report_types" to "service_role";
grant INSERT on public."clients__deprecated" to "anon";
grant SELECT on public."clients__deprecated" to "anon";
grant UPDATE on public."clients__deprecated" to "anon";
grant DELETE on public."clients__deprecated" to "anon";
grant INSERT on public."clients__deprecated" to "authenticated";
grant SELECT on public."clients__deprecated" to "authenticated";
grant UPDATE on public."clients__deprecated" to "authenticated";
grant DELETE on public."clients__deprecated" to "authenticated";
grant INSERT on public."clients__deprecated" to "service_role";
grant SELECT on public."clients__deprecated" to "service_role";
grant UPDATE on public."clients__deprecated" to "service_role";
grant DELETE on public."clients__deprecated" to "service_role";
grant TRUNCATE on public."clients__deprecated" to "service_role";
grant REFERENCES on public."clients__deprecated" to "service_role";
grant TRIGGER on public."clients__deprecated" to "service_role";
grant INSERT on public."report_ingestions" to "service_role";
grant SELECT on public."report_ingestions" to "service_role";
grant UPDATE on public."report_ingestions" to "service_role";
grant DELETE on public."report_ingestions" to "service_role";
grant TRUNCATE on public."report_ingestions" to "service_role";
grant REFERENCES on public."report_ingestions" to "service_role";
grant TRIGGER on public."report_ingestions" to "service_role";
grant INSERT on public."workspace_invites" to "anon";
grant SELECT on public."workspace_invites" to "anon";
grant UPDATE on public."workspace_invites" to "anon";
grant DELETE on public."workspace_invites" to "anon";
grant INSERT on public."workspace_invites" to "authenticated";
grant SELECT on public."workspace_invites" to "authenticated";
grant UPDATE on public."workspace_invites" to "authenticated";
grant DELETE on public."workspace_invites" to "authenticated";
grant INSERT on public."workspace_invites" to "service_role";
grant SELECT on public."workspace_invites" to "service_role";
grant UPDATE on public."workspace_invites" to "service_role";
grant DELETE on public."workspace_invites" to "service_role";
grant TRUNCATE on public."workspace_invites" to "service_role";
grant REFERENCES on public."workspace_invites" to "service_role";
grant TRIGGER on public."workspace_invites" to "service_role";
grant INSERT on public."workspaces" to "service_role";
grant SELECT on public."workspaces" to "service_role";
grant UPDATE on public."workspaces" to "service_role";
grant DELETE on public."workspaces" to "service_role";
grant TRUNCATE on public."workspaces" to "service_role";
grant REFERENCES on public."workspaces" to "service_role";
grant TRIGGER on public."workspaces" to "service_role";
grant INSERT on public."reports" to "service_role";
grant SELECT on public."reports" to "service_role";
grant UPDATE on public."reports" to "service_role";
grant DELETE on public."reports" to "service_role";
grant TRUNCATE on public."reports" to "service_role";
grant REFERENCES on public."reports" to "service_role";
grant TRIGGER on public."reports" to "service_role";
grant INSERT on public."tenants" to "anon";
grant SELECT on public."tenants" to "anon";
grant UPDATE on public."tenants" to "anon";
grant DELETE on public."tenants" to "anon";
grant INSERT on public."tenants" to "authenticated";
grant SELECT on public."tenants" to "authenticated";
grant UPDATE on public."tenants" to "authenticated";
grant DELETE on public."tenants" to "authenticated";
grant INSERT on public."tenants" to "service_role";
grant SELECT on public."tenants" to "service_role";
grant UPDATE on public."tenants" to "service_role";
grant DELETE on public."tenants" to "service_role";
grant TRUNCATE on public."tenants" to "service_role";
grant REFERENCES on public."tenants" to "service_role";
grant TRIGGER on public."tenants" to "service_role";
grant INSERT on public."tenant_members" to "service_role";
grant SELECT on public."tenant_members" to "service_role";
grant UPDATE on public."tenant_members" to "service_role";
grant DELETE on public."tenant_members" to "service_role";
grant TRUNCATE on public."tenant_members" to "service_role";
grant REFERENCES on public."tenant_members" to "service_role";
grant TRIGGER on public."tenant_members" to "service_role";
grant INSERT on public."app_admins" to "anon";
grant SELECT on public."app_admins" to "anon";
grant UPDATE on public."app_admins" to "anon";
grant DELETE on public."app_admins" to "anon";
grant INSERT on public."app_admins" to "authenticated";
grant SELECT on public."app_admins" to "authenticated";
grant UPDATE on public."app_admins" to "authenticated";
grant DELETE on public."app_admins" to "authenticated";
grant INSERT on public."app_admins" to "service_role";
grant SELECT on public."app_admins" to "service_role";
grant UPDATE on public."app_admins" to "service_role";
grant DELETE on public."app_admins" to "service_role";
grant TRUNCATE on public."app_admins" to "service_role";
grant REFERENCES on public."app_admins" to "service_role";
grant TRIGGER on public."app_admins" to "service_role";
grant INSERT on public."client_members__deprecated" to "anon";
grant SELECT on public."client_members__deprecated" to "anon";
grant UPDATE on public."client_members__deprecated" to "anon";
grant DELETE on public."client_members__deprecated" to "anon";
grant INSERT on public."client_members__deprecated" to "authenticated";
grant SELECT on public."client_members__deprecated" to "authenticated";
grant UPDATE on public."client_members__deprecated" to "authenticated";
grant DELETE on public."client_members__deprecated" to "authenticated";
grant INSERT on public."client_members__deprecated" to "service_role";
grant SELECT on public."client_members__deprecated" to "service_role";
grant UPDATE on public."client_members__deprecated" to "service_role";
grant DELETE on public."client_members__deprecated" to "service_role";
grant TRUNCATE on public."client_members__deprecated" to "service_role";
grant REFERENCES on public."client_members__deprecated" to "service_role";
grant TRIGGER on public."client_members__deprecated" to "service_role";
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workspaces_add_owner AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION add_workspace_owner_member();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_companies_prevent_locked_update BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION prevent_locked_company_update();
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user_create_profile();
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_advertisers_v2_tenant_scope BEFORE INSERT OR UPDATE ON public.advertisers FOR EACH ROW EXECUTE FUNCTION etrylue_v2_assign_advertiser_tenant_scope();
CREATE TRIGGER trg_reports_v2_tenant_scope BEFORE INSERT OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION etrylue_v2_assign_report_tenant_scope();
CREATE TRIGGER trg_workspace_members_v2_provision_tenant_member AFTER INSERT ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION etrylue_v2_provision_tenant_member_from_workspace_member();
CREATE TRIGGER trg_reports_v2_public_identity_freeze BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION etrylue_v2_guard_report_public_identity();
-- Explicit nonfunctional ACL sentinel for onboarding migration prerequisite only.
-- Actual daily snapshot functions are NOT copied and cannot run in this test DB.
create function public.prepare_daily_report_v2_combined_snapshot(jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $$begin raise exception 'ISOLATED_TEST_DAILY_SYNC_DISABLED'; end$$;
revoke all on function public.prepare_daily_report_v2_combined_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.prepare_daily_report_v2_combined_snapshot(jsonb) to service_role;
comment on function public.prepare_daily_report_v2_combined_snapshot(jsonb) is 'ISOLATED TEST SENTINEL: never a production function';
-- Synthetic legacy prerequisite; ID is generated, not copied from production.
insert into public.companies(name) values('000');
commit;
