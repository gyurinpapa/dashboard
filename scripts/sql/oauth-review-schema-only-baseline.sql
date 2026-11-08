-- OAuth review schema-only baseline. Target: nzudapumgzscfklgvsxw only.
-- Source metadata: 2026-11-08; source app ref: 2fd4a1ce7e22da4ae1ec06d83836337e6d8d8889.
-- Contains NO production rows, auth users, credential values, storage objects or scheduled jobs.
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL check_function_bodies = false;
DO $guard$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname IN ('public','etrylue_customer_private','etrylue_creative_cache_v1')) THEN
  RAISE EXCEPTION 'OAuth review baseline requires an empty application database';
 END IF;
END $guard$;
CREATE SCHEMA etrylue_customer_private;
CREATE SCHEMA etrylue_creative_cache_v1;

CREATE TABLE "etrylue_creative_cache_v1"."accounts" (
  "account_key" text NOT NULL,
  "lease_token" uuid,
  "lease_until" timestamp with time zone DEFAULT '-infinity'::timestamp with time zone NOT NULL,
  "lease_keys" text[] DEFAULT '{}'::text[] NOT NULL,
  "next_allowed_at" timestamp with time zone DEFAULT '-infinity'::timestamp with time zone NOT NULL,
  "window_start" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "reserved_requests" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "etrylue_creative_cache_v1"."entries" (
  "account_key" text NOT NULL,
  "cache_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "etrylue_customer_private"."accounts" (
  "user_id" uuid NOT NULL,
  "company_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_name" text NOT NULL,
  "contact_name" text NOT NULL,
  "tenant_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "provisioned_at" timestamp with time zone
);

CREATE TABLE "etrylue_customer_private"."scopes" (
  "user_id" uuid NOT NULL,
  "company_id" uuid NOT NULL
);

CREATE TABLE "etrylue_customer_private"."signup_limits" (
  "bucket" text NOT NULL,
  "attempts" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "public"."ad_data" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "date" date,
  "media" text,
  "campaign" text,
  "adgroup" text,
  "keyword" text,
  "impressions" bigint,
  "clicks" bigint,
  "cost" numeric,
  "conversions" bigint,
  "revenue" numeric,
  "created_at" timestamp without time zone DEFAULT now()
);

CREATE TABLE "public"."advertisers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "public_slug" text,
  "tenant_id" uuid,
  "billing_review_managed" boolean DEFAULT false NOT NULL
);

CREATE TABLE "public"."app_admins" (
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."client_members__deprecated" (
  "client_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'owner'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."clients__deprecated" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."companies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "is_locked" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."connections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "external_account_id" text,
  "display_name" text,
  "last_sync_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "account_id" text,
  "account_name" text,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamp with time zone,
  "scope" text,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_sync_since" date,
  "last_sync_until" date,
  "last_error" text,
  "credentials" jsonb
);

CREATE TABLE "public"."daily_report_meta_connections" (
  "report_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE "public"."daily_report_meta_snapshots" (
  "report_id" uuid NOT NULL,
  "source_ingestion_id" uuid NOT NULL,
  "fingerprint" text NOT NULL,
  "snapshot_ingestion_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "through_date" date NOT NULL,
  "source_rows" integer NOT NULL,
  "meta_rows" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE "public"."daily_report_v2_snapshot_runs" (
  "id" uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "report_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "through_date" date NOT NULL,
  "previous_ingestion_id" uuid,
  "snapshot_ingestion_id" uuid NOT NULL,
  "participant_contract" jsonb NOT NULL,
  "participant_count" integer NOT NULL,
  "expected_rows" integer NOT NULL,
  "status" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "source_fingerprint" text
);

CREATE TABLE "public"."departments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."ingestion_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid,
  "csv_bucket" text DEFAULT 'report_uploads'::text NOT NULL,
  "csv_path" text NOT NULL,
  "csv_name" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "parsed_rows" integer DEFAULT 0 NOT NULL,
  "valid_rows" integer DEFAULT 0 NOT NULL,
  "inserted_rows" integer DEFAULT 0 NOT NULL,
  "keyword_rows" integer DEFAULT 0 NOT NULL,
  "creative_rows" integer DEFAULT 0 NOT NULL,
  "mixed_rows" integer DEFAULT 0 NOT NULL,
  "unknown_rows" integer DEFAULT 0 NOT NULL,
  "batch_size" integer DEFAULT 0 NOT NULL,
  "committed_batches" integer DEFAULT 0 NOT NULL,
  "error" text,
  "error_detail" jsonb,
  "mode" text DEFAULT 'replace'::text NOT NULL,
  "created_by" uuid,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "previous_ingestion_id" uuid
);

CREATE TABLE "public"."insights" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL,
  "kind" text DEFAULT 'summary'::text NOT NULL,
  "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."manual_report_media_connections" (
  "tenant_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "report_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."media_connections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_account_id" text NOT NULL,
  "external_account_name" text,
  "credential_ciphertext" text,
  "credential_version" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "connected_at" timestamp with time zone,
  "last_verified_at" timestamp with time zone,
  "last_sync_at" timestamp with time zone,
  "last_error" text,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tenant_id" uuid
);

CREATE TABLE "public"."media_sync_fact_partitions" (
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_account_id" text NOT NULL,
  "date" date NOT NULL,
  "source_connection_id" uuid NOT NULL,
  "source_report_id" uuid NOT NULL,
  "source_job_id" uuid NOT NULL,
  "source_job_created_at" timestamp with time zone NOT NULL,
  "row_count" bigint NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."media_sync_fact_rows" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_account_id" text NOT NULL,
  "row_key" text NOT NULL,
  "date" date NOT NULL,
  "channel" text,
  "device" text,
  "source" text,
  "row" jsonb NOT NULL,
  "row_fingerprint" text GENERATED ALWAYS AS (encode(digest(("row")::text, 'sha256'::text), 'hex'::text)) STORED,
  "source_connection_id" uuid NOT NULL,
  "source_report_id" uuid NOT NULL,
  "source_job_id" uuid NOT NULL,
  "source_job_created_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."media_sync_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "report_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_account_id" text NOT NULL,
  "date_from" date NOT NULL,
  "date_to" date NOT NULL,
  "data_level" text DEFAULT 'keyword'::text NOT NULL,
  "mode" text DEFAULT 'snapshot_replace'::text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "raw_rows" integer DEFAULT 0 NOT NULL,
  "normalized_rows" integer DEFAULT 0 NOT NULL,
  "inserted_rows" integer DEFAULT 0 NOT NULL,
  "failed_rows" integer DEFAULT 0 NOT NULL,
  "previous_ingestion_id" uuid,
  "snapshot_ingestion_id" uuid,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "error" text,
  "error_detail" jsonb,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "execution_contract" text,
  "sync_segment_progress" jsonb,
  "automation_contract" text
);

CREATE TABLE "public"."media_sync_report_projections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "media_sync_job_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "report_id" uuid NOT NULL,
  "previous_ingestion_id" uuid,
  "snapshot_ingestion_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."media_sync_staging_rows" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "report_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_account_id" text NOT NULL,
  "date_window_index" integer NOT NULL,
  "date_from" date NOT NULL,
  "date_to" date NOT NULL,
  "row_index" bigint NOT NULL,
  "row_key" text NOT NULL,
  "date" date NOT NULL,
  "channel" text,
  "device" text,
  "source" text,
  "row" jsonb NOT NULL,
  "row_fingerprint" text GENERATED ALWAYS AS (encode(digest(("row")::text, 'sha256'::text), 'hex'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."meta_ads_collection_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "generation" uuid NOT NULL,
  "target_date" date NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease" uuid,
  "lease_until" timestamp with time zone,
  "error_code" text,
  "next_attempt_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "finished_at" timestamp with time zone
);

CREATE TABLE "public"."meta_ads_daily_enrollments" (
  "connection_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "generation" uuid DEFAULT gen_random_uuid() NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "start_date" date NOT NULL,
  "policy" jsonb NOT NULL,
  "credential_fingerprint" text NOT NULL,
  "verified_at" timestamp with time zone NOT NULL,
  "verified_by" uuid,
  "proof" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE "public"."meta_ads_daily_partitions" (
  "connection_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "date" date NOT NULL,
  "run_id" uuid NOT NULL,
  "rows" jsonb NOT NULL,
  "row_count" integer NOT NULL,
  "content_hash" text NOT NULL,
  "policy" jsonb NOT NULL,
  "proof" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE "public"."meta_ads_daily_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "target_date" date NOT NULL,
  "start_date" date NOT NULL,
  "connection_updated_at" timestamp with time zone NOT NULL,
  "lease" uuid NOT NULL,
  "lease_until" timestamp with time zone NOT NULL,
  "status" text NOT NULL,
  "attempts" integer DEFAULT 1 NOT NULL,
  "error_code" text,
  "started_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "finished_at" timestamp with time zone,
  "enrollment_generation" uuid
);

CREATE TABLE "public"."metrics_daily" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "source" text NOT NULL,
  "date" date NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "entity_name" text,
  "imp" bigint DEFAULT 0 NOT NULL,
  "click" bigint DEFAULT 0 NOT NULL,
  "cost" numeric(18,2) DEFAULT 0 NOT NULL,
  "conv" numeric(18,4) DEFAULT 0 NOT NULL,
  "revenue" numeric(18,2) DEFAULT 0 NOT NULL,
  "extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "channel" text NOT NULL,
  "meta" jsonb
);

CREATE TABLE "public"."metrics_daily_backup_before_dedupe" (
  "id" uuid,
  "workspace_id" uuid,
  "source" text,
  "date" date,
  "entity_type" text,
  "entity_id" text,
  "entity_name" text,
  "imp" bigint,
  "clk" bigint,
  "cost" numeric(18,2),
  "conv" numeric(18,4),
  "revenue" numeric(18,2),
  "extra" jsonb,
  "created_at" timestamp with time zone,
  "channel" text
);

CREATE TABLE "public"."metrics_daily_dedup" (
  "workspace_id" uuid,
  "source" text,
  "channel" text,
  "date" date,
  "imp" numeric,
  "clk" numeric,
  "cost" numeric,
  "conv" numeric,
  "revenue" numeric
);

CREATE TABLE "public"."org_units" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "parent_id" uuid,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."profiles" (
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

CREATE TABLE "public"."report_creatives" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid,
  "creative_key" text NOT NULL,
  "file_name" text NOT NULL,
  "storage_bucket" text DEFAULT 'uploads'::text NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" text,
  "bytes" bigint DEFAULT 0 NOT NULL,
  "width" integer,
  "height" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "uploaded_by" uuid,
  "key" text,
  "batch_id" uuid
);

CREATE TABLE "public"."report_ingestions" (
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

CREATE TABLE "public"."report_media_connections" (
  "tenant_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "advertiser_id" uuid NOT NULL,
  "report_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."report_rows" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "report_id" uuid NOT NULL,
  "advertiser_id" uuid,
  "row_index" integer NOT NULL,
  "row" jsonb NOT NULL,
  "date" date,
  "channel" text,
  "device" text,
  "source" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ingestion_id" uuid
);

CREATE TABLE "public"."report_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."reports" (
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

CREATE TABLE "public"."roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "rank" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."sync_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid,
  "source" text,
  "status" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."sync_runs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "source" text NOT NULL,
  "channel" text DEFAULT 'all'::text NOT NULL,
  "since" date,
  "until" date,
  "status" text DEFAULT 'running'::text NOT NULL,
  "inserted" integer DEFAULT 0 NOT NULL,
  "updated" integer DEFAULT 0 NOT NULL,
  "upserted" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);

CREATE TABLE "public"."teams" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "department_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."tenant_members" (
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'member'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."tenants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "tenant_type" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."workspace_invites" (
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

CREATE TABLE "public"."workspace_members" (
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'staff'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "division" text,
  "department" text,
  "team" text
);

CREATE TABLE "public"."workspaces" (
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
$function$;

CREATE OR REPLACE FUNCTION public.append_media_sync_staging_batch(p_payload jsonb)
 RETURNS TABLE(submitted_rows bigint, inserted_rows bigint, duplicate_rows bigint, first_row_index bigint, last_row_index bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;
  v_date_window_index integer;

  v_submitted_rows bigint := 0;
  v_inserted_rows bigint := 0;
  v_duplicate_rows bigint := 0;
  v_first_row_index bigint := null;
  v_last_row_index bigint := null;

  v_has_invalid_input boolean := false;
  v_has_internal_duplicate boolean := false;
  v_has_existing_scope_mismatch boolean := false;
  v_has_duplicate_conflict boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(btrim(p_payload ->> 'job_id'), '')::uuid;

    v_report_id :=
      nullif(btrim(p_payload ->> 'report_id'), '')::uuid;

    v_workspace_id :=
      nullif(btrim(p_payload ->> 'workspace_id'), '')::uuid;

    v_advertiser_id :=
      nullif(btrim(p_payload ->> 'advertiser_id'), '')::uuid;

    v_connection_id :=
      nullif(btrim(p_payload ->> 'connection_id'), '')::uuid;

    v_provider :=
      nullif(btrim(p_payload ->> 'provider'), '');

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(btrim(p_payload ->> 'date_from'), '')::date;

    v_date_to :=
      nullif(btrim(p_payload ->> 'date_to'), '')::date;

    v_date_window_index :=
      (p_payload ->> 'date_window_index')::integer;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_date_window_index is null
     or v_date_window_index < 0
     or v_date_from > v_date_to
     or not (p_payload ? 'rows')
     or jsonb_typeof(p_payload -> 'rows') <> 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
  end if;

  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_JOB_NOT_PROCESSING';
  end if;

  /*
   * Staging becomes immutable once snapshot materialization has started.
   *
   * The job row lock above serializes append and prepare transactions.
   * After prepare commits, either the primary snapshot mirror or a report
   * projection proves that materialization authority has been established.
   */
  if v_job.snapshot_ingestion_id is not null
     or exists (
       select 1
       from public.media_sync_report_projections as projection
       where projection.media_sync_job_id = v_job_id
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider not in (
       'naver_searchad',
       'google_ads'
     )
     or v_provider not in (
       'naver_searchad',
       'google_ads'
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_UNSUPPORTED_PROVIDER';
  end if;

  if (v_report_id is not null and v_job.report_id <> v_report_id)
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SCOPE_MISMATCH';
  end if;

  v_report_id := v_job.report_id;

  v_submitted_rows :=
    jsonb_array_length(p_payload -> 'rows');

  if v_submitted_rows = 0 then
    return query
    select
      0::bigint,
      0::bigint,
      0::bigint,
      null::bigint,
      null::bigint;

    return;
  end if;

  with input_rows as (
    select
      input.ordinality,

      input.item ->> 'row_index'
        as row_index_text,

      nullif(
        btrim(input.item ->> 'row_key'),
        ''
      ) as row_key,

      input.item ->> 'date'
        as date_text,

      input.item -> 'channel'
        as channel_json,

      input.item -> 'device'
        as device_json,

      input.item -> 'source'
        as source_json,

      input.item -> 'row'
        as row_json
    from jsonb_array_elements(
      p_payload -> 'rows'
    ) with ordinality as input(
      item,
      ordinality
    )
  )
  select exists (
    select 1
    from input_rows
    where row_index_text is null
       or row_index_text !~ '^[0-9]+$'
       or row_key is null
       or date_text is null
       or date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or row_json is null
       or jsonb_typeof(row_json) <> 'object'
       or (
         channel_json is not null
         and jsonb_typeof(channel_json) not in (
           'string',
           'null'
         )
       )
       or (
         device_json is not null
         and jsonb_typeof(device_json) not in (
           'string',
           'null'
         )
       )
       or (
         source_json is not null
         and jsonb_typeof(source_json) not in (
           'string',
           'null'
         )
       )
  )
  into v_has_invalid_input;

  if v_has_invalid_input then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
  end if;

  begin
    with input_rows as (
      select
        (input.item ->> 'row_index')::bigint
          as row_index,

        nullif(
          btrim(input.item ->> 'row_key'),
          ''
        ) as row_key,

        (input.item ->> 'date')::date
          as row_date,

        case
          when input.item -> 'channel' is null
            or jsonb_typeof(
              input.item -> 'channel'
            ) = 'null'
          then null
          else input.item ->> 'channel'
        end as channel,

        case
          when input.item -> 'device' is null
            or jsonb_typeof(
              input.item -> 'device'
            ) = 'null'
          then null
          else input.item ->> 'device'
        end as device,

        case
          when input.item -> 'source' is null
            or jsonb_typeof(
              input.item -> 'source'
            ) = 'null'
          then null
          else input.item ->> 'source'
        end as source,

        input.item -> 'row'
          as row_json
      from jsonb_array_elements(
        p_payload -> 'rows'
      ) as input(item)
    )
    select
      min(row_index),
      max(row_index)
    into
      v_first_row_index,
      v_last_row_index
    from input_rows;

    if v_first_row_index is null
       or v_first_row_index < 0
       or v_last_row_index is null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_INVALID_INPUT';
    end if;

    with input_rows as (
      select
        (input.item ->> 'row_index')::bigint
          as row_index,

        nullif(
          btrim(input.item ->> 'row_key'),
          ''
        ) as row_key,

        (input.item ->> 'date')::date
          as row_date
      from jsonb_array_elements(
        p_payload -> 'rows'
      ) as input(item)
    )
    select exists (
      select 1
      from input_rows
      where row_date < v_date_from
         or row_date > v_date_to
    )
    into v_has_invalid_input;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_INVALID_INPUT';
  end;

  if v_has_invalid_input then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
  end if;

  with input_rows as (
    select
      (input.item ->> 'row_index')::bigint
        as row_index,

      nullif(
        btrim(input.item ->> 'row_key'),
        ''
      ) as row_key
    from jsonb_array_elements(
      p_payload -> 'rows'
    ) as input(item)
  ),
  duplicate_row_indexes as (
    select row_index
    from input_rows
    group by row_index
    having count(*) > 1
  ),
  duplicate_row_keys as (
    select row_key
    from input_rows
    group by row_key
    having count(*) > 1
  )
  select
    exists(
      select 1
      from duplicate_row_indexes
    )
    or exists(
      select 1
      from duplicate_row_keys
    )
  into v_has_internal_duplicate;

  if v_has_internal_duplicate then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_DUPLICATE_CONFLICT';
  end if;

  /*
   * Existing rows for one job are written only while the same job row is
   * locked above, and every append validates the payload against that job.
   * Therefore one earliest existing row is the authoritative persisted-scope
   * witness for the job.
   *
   * The previous implementation scanned every staging row for the job on
   * every 100-row append. That made total work grow quadratically and caused
   * PostgreSQL statement timeout after tens of thousands of rows.
   *
   * This indexed probe is O(log n) through the unique (job_id, row_index)
   * index while preserving fail-closed scope validation. Duplicate retries
   * and row fingerprint conflicts remain validated below against both unique
   * identities.
   */
  select exists (
    select 1
    from (
      select
        existing.report_id,
        existing.workspace_id,
        existing.advertiser_id,
        existing.connection_id,
        existing.provider,
        existing.external_account_id,
        existing.date_from,
        existing.date_to
      from public.media_sync_staging_rows as existing
      where existing.job_id = v_job_id
      order by existing.row_index
      limit 1
    ) as existing_scope
    where existing_scope.report_id <> v_report_id
       or existing_scope.workspace_id <> v_workspace_id
       or existing_scope.advertiser_id <> v_advertiser_id
       or existing_scope.connection_id <> v_connection_id
       or existing_scope.provider <> v_provider
       or existing_scope.external_account_id <>
          v_external_account_id
       or existing_scope.date_from <> v_date_from
       or existing_scope.date_to <> v_date_to
  )
  into v_has_existing_scope_mismatch;

  if v_has_existing_scope_mismatch then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SCOPE_MISMATCH';
  end if;

  with input_rows as (
    select
      (input.item ->> 'row_index')::bigint
        as row_index,

      nullif(
        btrim(input.item ->> 'row_key'),
        ''
      ) as row_key,

      (input.item ->> 'date')::date
        as row_date,

      case
        when input.item -> 'channel' is null
          or jsonb_typeof(
            input.item -> 'channel'
          ) = 'null'
        then null
        else input.item ->> 'channel'
      end as channel,

      case
        when input.item -> 'device' is null
          or jsonb_typeof(
            input.item -> 'device'
          ) = 'null'
        then null
        else input.item ->> 'device'
      end as device,

      case
        when input.item -> 'source' is null
          or jsonb_typeof(
            input.item -> 'source'
          ) = 'null'
        then null
        else input.item ->> 'source'
      end as source,

      input.item -> 'row'
        as row_json,

      encode(
        digest(
          (input.item -> 'row')::text,
          'sha256'
        ),
        'hex'
      ) as row_fingerprint
    from jsonb_array_elements(
      p_payload -> 'rows'
    ) as input(item)
  ),
  compared as (
    select
      incoming.*,

      by_index.id
        as by_index_id,

      by_key.id
        as by_key_id,

      by_index.date_window_index
        as by_index_date_window_index,

      by_index.row_key
        as by_index_row_key,

      by_index.date
        as by_index_date,

      by_index.channel
        as by_index_channel,

      by_index.device
        as by_index_device,

      by_index.source
        as by_index_source,

      by_index.row_fingerprint
        as by_index_fingerprint,

      by_key.row_index
        as by_key_row_index,

      by_key.date
        as by_key_date,

      by_key.channel
        as by_key_channel,

      by_key.device
        as by_key_device,

      by_key.source
        as by_key_source,

      by_key.row_fingerprint
        as by_key_fingerprint
    from input_rows as incoming

    left join public.media_sync_staging_rows
      as by_index
      on by_index.job_id = v_job_id
     and by_index.row_index =
        incoming.row_index

    left join public.media_sync_staging_rows
      as by_key
      on by_key.job_id = v_job_id
     and by_key.date_window_index =
        v_date_window_index
     and by_key.row_key =
        incoming.row_key
  )
  select exists (
    select 1
    from compared
    where
      (
        by_index_id is not null
        and (
          by_index_date_window_index <>
            v_date_window_index
          or by_index_row_key <>
            row_key
          or by_index_date <>
            row_date
          or by_index_channel is distinct from
            channel
          or by_index_device is distinct from
            device
          or by_index_source is distinct from
            source
          or by_index_fingerprint <>
            row_fingerprint
        )
      )
      or
      (
        by_key_id is not null
        and (
          by_key_row_index <>
            row_index
          or by_key_date <>
            row_date
          or by_key_channel is distinct from
            channel
          or by_key_device is distinct from
            device
          or by_key_source is distinct from
            source
          or by_key_fingerprint <>
            row_fingerprint
        )
      )
      or
      (
        by_index_id is not null
        and by_key_id is not null
        and by_index_id <> by_key_id
      )
      or
      (
        by_index_id is null
        and by_key_id is not null
      )
      or
      (
        by_index_id is not null
        and by_key_id is null
      )
  )
  into v_has_duplicate_conflict;

  if v_has_duplicate_conflict then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_DUPLICATE_CONFLICT';
  end if;

  with input_rows as (
    select
      (input.item ->> 'row_index')::bigint
        as row_index,

      nullif(
        btrim(input.item ->> 'row_key'),
        ''
      ) as row_key,

      (input.item ->> 'date')::date
        as row_date,

      case
        when input.item -> 'channel' is null
          or jsonb_typeof(
            input.item -> 'channel'
          ) = 'null'
        then null
        else input.item ->> 'channel'
      end as channel,

      case
        when input.item -> 'device' is null
          or jsonb_typeof(
            input.item -> 'device'
          ) = 'null'
        then null
        else input.item ->> 'device'
      end as device,

      case
        when input.item -> 'source' is null
          or jsonb_typeof(
            input.item -> 'source'
          ) = 'null'
        then null
        else input.item ->> 'source'
      end as source,

      input.item -> 'row'
        as row_json
    from jsonb_array_elements(
      p_payload -> 'rows'
    ) as input(item)
  ),
  new_rows as (
    select incoming.*
    from input_rows as incoming
    left join public.media_sync_staging_rows
      as existing
      on existing.job_id = v_job_id
     and existing.row_index =
        incoming.row_index
    where existing.id is null
  ),
  inserted as (
    insert into public.media_sync_staging_rows (
      job_id,
      report_id,
      workspace_id,
      advertiser_id,
      connection_id,
      provider,
      external_account_id,
      date_window_index,
      date_from,
      date_to,
      row_index,
      row_key,
      date,
      channel,
      device,
      source,
      row
    )
    select
      v_job_id,
      v_report_id,
      v_workspace_id,
      v_advertiser_id,
      v_connection_id,
      v_provider,
      v_external_account_id,
      v_date_window_index,
      v_date_from,
      v_date_to,
      incoming.row_index,
      incoming.row_key,
      incoming.row_date,
      incoming.channel,
      incoming.device,
      incoming.source,
      incoming.row_json
    from new_rows as incoming
    returning id
  )
  select count(*)::bigint
  into v_inserted_rows
  from inserted;

  v_duplicate_rows :=
    v_submitted_rows - v_inserted_rows;

  return query
  select
    v_submitted_rows,
    v_inserted_rows,
    v_duplicate_rows,
    v_first_row_index,
    v_last_row_index;

exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_DUPLICATE_CONFLICT';

  when check_violation
    or not_null_violation
    or invalid_text_representation
    or numeric_value_out_of_range
    or datetime_field_overflow
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_INVALID_INPUT';
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_media_sync_snapshot(p_payload jsonb)
 RETURNS TABLE(job jsonb, previous_ingestion_id uuid, snapshot_ingestion_id uuid, current_ingestion_id uuid, published_ingestion_id uuid, row_count bigint, staging_fingerprint text, materialized_fingerprint text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;
  v_projection public.media_sync_report_projections%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_provider text;
  v_external_account_id text;
  v_date_from date;
  v_date_to date;
  v_expected_rows bigint;
  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;

  v_is_primary_projection boolean;

  v_completion_fingerprint text;

  v_published_ingestion_before uuid;
  v_job_status_before text;
  v_job_progress_before integer;
  v_job_finished_at_before timestamptz;
  v_job_error_before text;
  v_job_error_detail_before jsonb;
  v_job_snapshot_before uuid;
  v_job_updated_at_before timestamptz;

  v_idempotent boolean := false;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using message = 'MSA_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSA_INVALID_INPUT: invalid UUID input';
  end if;

  if p_payload ? 'previous_ingestion_id'
     and p_payload->'previous_ingestion_id' <> 'null'::jsonb
     and coalesce(p_payload->>'previous_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSA_INVALID_INPUT: previous_ingestion_id is invalid';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using message = 'MSA_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_provider := btrim(p_payload->>'provider');
    v_external_account_id := btrim(p_payload->>'external_account_id');
    v_date_from := (p_payload->>'date_from')::date;
    v_date_to := (p_payload->>'date_to')::date;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
    v_previous_ingestion_id := nullif(p_payload->>'previous_ingestion_id', '')::uuid;
    v_snapshot_ingestion_id := (p_payload->>'snapshot_ingestion_id')::uuid;
  exception
    when others then
      raise exception using message = 'MSA_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0
     or (
       v_expected_rows = 0
       and v_provider <> 'naver_searchad'
     ) then
    raise exception using message = 'MSA_INVALID_INPUT: payload values are invalid';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using message = 'MSA_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using message = 'MSA_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using message = 'MSA_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  if v_job.id <> v_job_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to then
    raise exception using message = 'MSA_SCOPE_MISMATCH: job scope does not match the request';
  end if;

  /*
   * V2-B downstream projection authority.
   *
   * Lock order is intentionally JOB FOR UPDATE -> PROJECTION FOR SHARE -> REPORT.
   * The projection owns the downstream previous/snapshot pointer binding.
   * The media_sync_job columns remain compatibility mirrors and the payload
   * pointer values remain request assertions; every copy must match exactly.
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using message = 'MSA_SCOPE_MISMATCH: report projection was not found';
  end if;

  if v_projection.media_sync_job_id <> v_job_id
     or v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.created_by is distinct from v_job.created_by
     or v_projection.previous_ingestion_id is distinct from v_previous_ingestion_id
     or v_projection.snapshot_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSA_SCOPE_MISMATCH: report projection authority does not match the job and request';
  end if;

  if v_is_primary_projection
     and (
       v_projection.previous_ingestion_id is distinct from v_job.previous_ingestion_id
       or v_projection.snapshot_ingestion_id is distinct from v_job.snapshot_ingestion_id
     ) then
    raise exception using message = 'MSA_SCOPE_MISMATCH: primary report projection compatibility mirrors do not match the job';
  end if;

  v_previous_ingestion_id := v_projection.previous_ingestion_id;
  v_snapshot_ingestion_id := v_projection.snapshot_ingestion_id;

  if v_job.mode <> 'snapshot_replace' then
    raise exception using message = 'MSA_SCOPE_MISMATCH: unsupported media sync mode';
  end if;

  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSA_SNAPSHOT_INVALID: processing checkpoint counts do not match';
  end if;

  v_job_status_before := v_job.status;
  v_job_progress_before := v_job.progress;
  v_job_finished_at_before := v_job.finished_at;
  v_job_error_before := v_job.error;
  v_job_error_detail_before := v_job.error_detail;
  v_job_snapshot_before := v_job.snapshot_ingestion_id;
  v_job_updated_at_before := v_job.updated_at;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using message = 'MSA_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id then
    raise exception using message = 'MSA_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  v_published_ingestion_before := v_report.published_ingestion_id;

  if v_report.current_ingestion_id is not distinct from v_snapshot_ingestion_id then
    v_idempotent := true;
  elsif v_report.current_ingestion_id is not distinct from v_previous_ingestion_id then
    v_idempotent := false;
  else
    raise exception using message = 'MSA_ACTIVATION_CONFLICT: current ingestion pointer no longer matches the job baseline';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id;

  if not found then
    raise exception using message = 'MSA_SNAPSHOT_NOT_MATERIALIZED: report ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status <> 'success'
     or v_ingestion.row_count is distinct from v_expected_rows::integer
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using message = 'MSA_SNAPSHOT_INVALID: report ingestion does not match the materialized job';
  end if;

  /*
   * Constant-time activation verification.
   *
   * prepare validates complete staging integrity. Every bounded materialization
   * batch then compares staging with report_rows exactly and advances
   * report_ingestions.row_count in the same transaction. Completion succeeds
   * only after that checkpoint reaches expected_rows and marks the API
   * ingestion successful.
   *
   * Re-reading all fresh staging/report_rows rows here would repeat work that
   * has already committed and can exceed the API role statement_timeout.
   */
  if v_ingestion.row_count
       is distinct from v_expected_rows::integer
     or v_ingestion.status <> 'success'
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSA_SNAPSHOT_INVALID: completed materialization checkpoint is invalid';
  end if;

  /*
   * Contract-compatible deterministic completion token.
   * This is identical to the constant-time token returned by
   * complete_media_sync_snapshot_materialization().
   */
  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_expected_rows::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if not v_idempotent then
    update public.reports as r
       set current_ingestion_id = v_snapshot_ingestion_id
     where r.id = v_report_id
       and r.current_ingestion_id is not distinct from v_previous_ingestion_id
       and r.published_ingestion_id is not distinct from v_published_ingestion_before;

    if not found then
      raise exception using message = 'MSA_ACTIVATION_CONFLICT: report pointer changed during activation';
    end if;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_report.current_ingestion_id is distinct from v_snapshot_ingestion_id
     or v_report.published_ingestion_id is distinct from v_published_ingestion_before then
    raise exception using message = 'MSA_ACTIVATION_CONFLICT: report pointers violate the activation contract';
  end if;

  if v_job.status is distinct from v_job_status_before
     or v_job.progress is distinct from v_job_progress_before
     or v_job.finished_at is distinct from v_job_finished_at_before
     or v_job.error is distinct from v_job_error_before
     or v_job.error_detail is distinct from v_job_error_detail_before
     or v_job.snapshot_ingestion_id is distinct from v_job_snapshot_before
     or v_job.updated_at is distinct from v_job_updated_at_before then
    raise exception using message = 'MSA_JOB_STATE_CHANGED: protected media sync job state changed unexpectedly';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_expected_rows,
    v_completion_fingerprint,
    v_completion_fingerprint,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_csv_ingestion_snapshot(p_payload jsonb)
 RETURNS TABLE(previous_ingestion_id uuid, candidate_ingestion_id uuid, current_ingestion_id uuid, published_ingestion_id uuid, row_count bigint, min_row_index bigint, max_row_index bigint, distinct_row_indexes bigint, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.ingestion_jobs%rowtype;
  v_report public.reports%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_previous_ingestion_id uuid;
  v_candidate_ingestion_id uuid;
  v_expected_rows bigint;

  v_row_count bigint;
  v_distinct_row_indexes bigint;
  v_min_row_index bigint;
  v_max_row_index bigint;
  v_scope_mismatch_rows bigint;

  v_published_ingestion_before uuid;
  v_idempotent boolean := false;
begin
  /*
   * Payload contract.
   *
   * Stage 8 / Macro 4-A authority hardening:
   * job_id is mandatory. CSV activation is owned exclusively by a queued
   * ingestion_jobs row that is already in processing state.
   */
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'CIA_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'candidate_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'CIA_INVALID_INPUT: invalid UUID input';
  end if;

  if not (p_payload ? 'job_id')
     or p_payload->'job_id' = 'null'::jsonb
     or coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'CIA_INVALID_INPUT: job_id is required and must be a valid UUID';
  end if;

  if p_payload ? 'previous_ingestion_id'
     and p_payload->'previous_ingestion_id' <> 'null'::jsonb
     and coalesce(p_payload->>'previous_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'CIA_INVALID_INPUT: previous_ingestion_id is invalid';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using
      message = 'CIA_INVALID_INPUT: expected_rows must be a positive integer';
  end if;

  begin
    v_job_id := nullif(p_payload->>'job_id', '')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_previous_ingestion_id :=
      nullif(p_payload->>'previous_ingestion_id', '')::uuid;
    v_candidate_ingestion_id :=
      (p_payload->>'candidate_ingestion_id')::uuid;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        message = 'CIA_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_expected_rows <= 0 then
    raise exception using
      message = 'CIA_INVALID_INPUT: expected_rows must be greater than zero';
  end if;

  /*
   * Required queued-job authority.
   *
   * Lock order is JOB FOR UPDATE -> REPORT FOR UPDATE.
   * The stored previous_ingestion_id is authority; the payload value is an
   * assertion and must match it exactly.
   */
  if v_job_id is not null then
    select *
      into v_job
      from public.ingestion_jobs as j
     where j.id = v_job_id
     for update;

    if not found then
      raise exception using
        message = 'CIA_JOB_NOT_FOUND: ingestion job was not found';
    end if;

    if v_job.status <> 'processing' then
      raise exception using
        message = 'CIA_JOB_NOT_PROCESSING: ingestion job must remain processing';
    end if;

    if v_job.mode <> 'queue'
       or v_job.id <> v_candidate_ingestion_id
       or v_job.report_id <> v_report_id
       or v_job.workspace_id <> v_workspace_id
       or v_job.previous_ingestion_id is distinct from v_previous_ingestion_id then
      raise exception using
        message = 'CIA_SCOPE_MISMATCH: queued ingestion job authority does not match the request';
    end if;

    if v_job.valid_rows <> v_expected_rows
       or v_job.inserted_rows <> v_expected_rows then
      raise exception using
        message = 'CIA_CANDIDATE_INVALID: queued ingestion job counts do not match the candidate';
    end if;
  end if;

  /*
   * REPORT is the activation authority.
   *
   * The row lock serializes pointer-changing operations for this report.
   * published_ingestion_id is captured before activation and must remain
   * exactly unchanged.
   */
  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message = 'CIA_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id then
    raise exception using
      message = 'CIA_SCOPE_MISMATCH: report workspace does not match the request';
  end if;

  if v_job_id is not null
     and v_report.advertiser_id is distinct from v_job.advertiser_id then
    raise exception using
      message = 'CIA_SCOPE_MISMATCH: report advertiser does not match the queued ingestion job';
  end if;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  /*
   * Activation authority:
   *
   * 1. Already pointing to the candidate:
   *    valid idempotent retry.
   *
   * 2. Still pointing to the baseline captured before candidate creation:
   *    activation may proceed.
   *
   * 3. Anything else:
   *    a newer/different ingestion changed the report, therefore fail closed.
   */
  if v_report.current_ingestion_id
       is not distinct from v_candidate_ingestion_id then
    v_idempotent := true;
  elsif v_report.current_ingestion_id
       is not distinct from v_previous_ingestion_id then
    v_idempotent := false;
  else
    raise exception using
      message = 'CIA_ACTIVATION_CONFLICT: current ingestion pointer no longer matches the candidate baseline';
  end if;

  /*
   * Candidate completeness verification.
   *
   * report_rows uniqueness is owned by:
   *   (report_id, ingestion_id, row_index)
   *
   * A valid completed CSV candidate therefore requires:
   * - exact expected row count
   * - row_index count exactly equal to expected rows
   * - contiguous range 0 .. expected_rows - 1
   * - exact report workspace/advertiser scope
   */
  select
    count(*)::bigint,
    count(distinct rr.row_index)::bigint,
    min(rr.row_index)::bigint,
    max(rr.row_index)::bigint,
    count(*) filter (
      where rr.workspace_id
              is distinct from v_report.workspace_id
         or rr.advertiser_id
              is distinct from v_report.advertiser_id
    )::bigint
    into
      v_row_count,
      v_distinct_row_indexes,
      v_min_row_index,
      v_max_row_index,
      v_scope_mismatch_rows
    from public.report_rows as rr
   where rr.report_id = v_report_id
     and rr.ingestion_id = v_candidate_ingestion_id;

  if v_row_count <> v_expected_rows
     or v_distinct_row_indexes <> v_expected_rows
     or v_min_row_index is distinct from 0::bigint
     or v_max_row_index
          is distinct from (v_expected_rows - 1)
     or v_scope_mismatch_rows <> 0 then
    raise exception using
      message = 'CIA_CANDIDATE_INVALID: CSV candidate rows are incomplete or out of scope';
  end if;

  /*
   * Atomic activation.
   *
   * published_ingestion_id participates in the conditional update only as a
   * preservation assertion. This RPC never writes the published pointer.
   */
  if not v_idempotent then
    update public.reports as r
       set current_ingestion_id = v_candidate_ingestion_id
     where r.id = v_report_id
       and r.current_ingestion_id
             is not distinct from v_previous_ingestion_id
       and r.published_ingestion_id
             is not distinct from v_published_ingestion_before;

    if not found then
      raise exception using
        message = 'CIA_ACTIVATION_CONFLICT: report pointer changed during activation';
    end if;
  end if;

  /*
   * Post-activation verification.
   */
  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_candidate_ingestion_id
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before then
    raise exception using
      message = 'CIA_ACTIVATION_CONFLICT: report pointers violate the CSV activation contract';
  end if;

  return query
  select
    v_previous_ingestion_id,
    v_candidate_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_row_count,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_naver_fact_snapshot(p_payload jsonb)
 RETURNS TABLE(job jsonb, report_id uuid, previous_ingestion_id uuid, snapshot_ingestion_id uuid, current_ingestion_id uuid, published_ingestion_id uuid, projection_start date, projection_end date, row_count bigint, completion_fingerprint text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_external_account_id text;

  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;

  v_projection_start date;
  v_projection_end date;
  v_expected_rows bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;
  v_fact_rows bigint;

  v_published_ingestion_before uuid;
  v_is_primary_projection boolean;

  v_completion_fingerprint text;
  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFA_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFA_INVALID_INPUT: invalid UUID input';
  end if;

  if p_payload ? 'previous_ingestion_id'
     and p_payload->'previous_ingestion_id' <> 'null'::jsonb
     and coalesce(p_payload->>'previous_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFA_INVALID_INPUT: previous_ingestion_id is invalid';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or coalesce(p_payload->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$'
  then
    raise exception using
      message = 'MSFA_INVALID_INPUT: activation inputs are invalid';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;

    v_external_account_id := btrim(p_payload->>'external_account_id');

    v_previous_ingestion_id :=
      nullif(p_payload->>'previous_ingestion_id', '')::uuid;
    v_snapshot_ingestion_id :=
      (p_payload->>'snapshot_ingestion_id')::uuid;

    v_projection_start := (p_payload->>'projection_start')::date;
    v_projection_end := (p_payload->>'projection_end')::date;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSFA_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_projection_start > v_projection_end
     or v_expected_rows < 0
     or v_expected_rows > 2147483647
  then
    raise exception using
      message = 'MSFA_INVALID_INPUT: activation values are invalid';
  end if;

  /*
   * Preserve the same lock order used by the fact snapshot lifecycle:
   *   JOB -> REPORT -> PROJECTION -> INGESTION.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFA_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFA_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFA_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
  then
    raise exception using
      message = 'MSFA_SCOPE_MISMATCH: job scope is not projection-safe';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message = 'MSFA_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
  then
    raise exception using
      message = 'MSFA_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  if coalesce(
      v_report.draft_period_start,
      v_report.period_start,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_from}'
        ),
        ''
      )::date
    )
       is distinct from v_projection_start
     or coalesce(
      v_report.draft_period_end,
      v_report.period_end,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_to}'
        ),
        ''
      )::date
    )
       is distinct from v_projection_end
  then
    raise exception using
      message = 'MSFA_PERIOD_CHANGED: report projection period changed before activation';
  end if;

  v_published_ingestion_before := v_report.published_ingestion_id;
  v_is_primary_projection := v_job.report_id = v_report_id;

  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSFA_PROJECTION_NOT_FOUND: report projection was not prepared';
  end if;

  if v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.previous_ingestion_id
          is distinct from v_previous_ingestion_id
     or v_projection.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id
     or v_projection.created_by is distinct from v_job.created_by
  then
    raise exception using
      message = 'MSFA_PROJECTION_CONFLICT: report projection authority does not match the request';
  end if;

  if v_is_primary_projection
     and (
       v_job.previous_ingestion_id
         is distinct from v_previous_ingestion_id
       or v_job.snapshot_ingestion_id
         is distinct from v_snapshot_ingestion_id
     )
  then
    raise exception using
      message = 'MSFA_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
  end if;

  if v_report.current_ingestion_id
       is not distinct from v_snapshot_ingestion_id
  then
    v_idempotent := true;
  elsif v_report.current_ingestion_id
          is not distinct from v_previous_ingestion_id
  then
    v_idempotent := false;
  else
    raise exception using
      message = 'MSFA_ACTIVATION_CONFLICT: report current pointer no longer matches projection baseline';
  end if;

  /*
   * Revalidate durable zero-row-aware canonical cardinality.
   */
  v_expected_dates :=
    (v_projection_end - v_projection_start)::bigint + 1;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint
    into
      v_partition_dates,
      v_partition_rows
    from public.media_sync_fact_partitions as p
   where p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = 'naver_searchad'
     and p.external_account_id = v_external_account_id
     and p.date >= v_projection_start
     and p.date <= v_projection_end;

  if v_partition_dates <> v_expected_dates
     or v_partition_rows <> v_expected_rows
  then
    raise exception using
      message = 'MSFA_FACT_COVERAGE_CHANGED: canonical partition authority changed before activation';
  end if;

  select count(*)::bigint
    into v_fact_rows
    from public.media_sync_fact_rows as f
   where f.workspace_id = v_workspace_id
     and f.advertiser_id = v_advertiser_id
     and f.provider = 'naver_searchad'
     and f.external_account_id = v_external_account_id
     and f.date >= v_projection_start
     and f.date <= v_projection_end;

  if v_fact_rows <> v_expected_rows then
    raise exception using
      message = 'MSFA_FACT_COUNT_MISMATCH: canonical fact row count changed before activation';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for share;

  if not found then
    raise exception using
      message = 'MSFA_SNAPSHOT_NOT_MATERIALIZED: projection ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status <> 'success'
     or v_ingestion.row_count is distinct from v_expected_rows::integer
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by
  then
    raise exception using
      message = 'MSFA_SNAPSHOT_INVALID: completed projection ingestion is invalid';
  end if;

  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_projection_start::text || ':' ||
          v_projection_end::text || ':' ||
          v_expected_rows::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if not v_idempotent then
    update public.reports as r
       set current_ingestion_id = v_snapshot_ingestion_id
     where r.id = v_report_id
       and r.workspace_id = v_workspace_id
       and r.advertiser_id is not distinct from v_advertiser_id
       and r.current_ingestion_id is not distinct from v_previous_ingestion_id
       and r.published_ingestion_id is not distinct from v_published_ingestion_before;

    if not found then
      raise exception using
        message = 'MSFA_ACTIVATION_CONFLICT: report pointer changed during activation';
    end if;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_snapshot_ingestion_id
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message = 'MSFA_ACTIVATION_CONFLICT: report pointers violate the activation contract';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_job.status <> 'processing'
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
  then
    raise exception using
      message = 'MSFA_JOB_STATE_CHANGED: protected media sync job state changed unexpectedly';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_report_id,
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_projection_start,
    v_projection_end,
    v_expected_rows,
    v_completion_fingerprint,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_naver_fact_snapshot_fanout(p_payload jsonb)
 RETURNS TABLE(job jsonb, projection_count bigint, primary_report_id uuid, primary_previous_ingestion_id uuid, primary_snapshot_ingestion_id uuid, primary_current_ingestion_id uuid, primary_published_ingestion_id uuid, primary_row_count bigint, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_connection public.media_connections%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_external_account_id text;

  v_projection_payload jsonb;
  v_report_id uuid;
  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;
  v_projection_start date;
  v_projection_end date;
  v_expected_rows bigint;

  v_payload_projection_count bigint;
  v_payload_distinct_report_count bigint;
  v_db_projection_count bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;
  v_fact_rows bigint;

  v_previous_state_count bigint := 0;
  v_snapshot_state_count bigint := 0;

  v_primary_report_id uuid;
  v_primary_previous_ingestion_id uuid;
  v_primary_snapshot_ingestion_id uuid;
  v_primary_current_ingestion_id uuid;
  v_primary_published_ingestion_id uuid;
  v_primary_row_count bigint;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFX_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFX_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or jsonb_typeof(p_payload->'projections') <> 'array'
     or jsonb_array_length(p_payload->'projections') = 0
  then
    raise exception using
      message = 'MSFX_INVALID_INPUT: external account and non-empty projections are required';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_payload->'projections') as item(value)
     where jsonb_typeof(item.value) <> 'object'
        or coalesce(item.value->>'report_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or (
          item.value ? 'previous_ingestion_id'
          and item.value->'previous_ingestion_id' <> 'null'::jsonb
          and coalesce(item.value->>'previous_ingestion_id', '') !~*
               '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
        or coalesce(item.value->>'snapshot_ingestion_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(item.value->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item.value->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item.value->>'expected_rows', '') !~ '^[0-9]+$'
  ) then
    raise exception using
      message = 'MSFX_INVALID_INPUT: projection payload is invalid';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_external_account_id := btrim(p_payload->>'external_account_id');
  exception
    when others then
      raise exception using
        message = 'MSFX_INVALID_INPUT: payload value could not be parsed';
  end;

  /*
   * Job-first lock keeps the projection set stable against prepare and
   * finalization for this execution.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFX_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFX_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFX_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
     or v_job.snapshot_ingestion_id is null
  then
    raise exception using
      message = 'MSFX_SCOPE_MISMATCH: job scope is not projection-safe';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for share;

  if not found then
    raise exception using
      message = 'MSFX_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> 'naver_searchad'
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      message = 'MSFX_SCOPE_MISMATCH: media connection does not match the job';
  end if;

  select
    jsonb_array_length(p_payload->'projections')::bigint,
    count(distinct (item.value->>'report_id'))::bigint
    into
      v_payload_projection_count,
      v_payload_distinct_report_count
    from jsonb_array_elements(p_payload->'projections') as item(value);

  if v_payload_projection_count <> v_payload_distinct_report_count then
    raise exception using
      message = 'MSFX_PROJECTION_SET_CONFLICT: duplicate report projection payload';
  end if;

  select count(*)::bigint
    into v_db_projection_count
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id;

  if v_db_projection_count = 0
     or v_db_projection_count <> v_payload_projection_count
  then
    raise exception using
      message = 'MSFX_PROJECTION_SET_CONFLICT: payload projection set does not match DB projection set';
  end if;

  if exists (
    select 1
      from public.media_sync_report_projections as p
     where p.media_sync_job_id = v_job_id
       and not exists (
         select 1
           from jsonb_array_elements(p_payload->'projections') as item(value)
          where item.value->>'report_id' = p.report_id::text
       )
  ) then
    raise exception using
      message = 'MSFX_PROJECTION_SET_CONFLICT: DB projection is missing from payload';
  end if;

  /*
   * Validate and lock every target report in deterministic report_id order.
   * No pointer is updated in this pass.
   */
  for v_projection_payload in
    select item.value
      from jsonb_array_elements(p_payload->'projections') as item(value)
     order by item.value->>'report_id'
  loop
    begin
      v_report_id :=
        (v_projection_payload->>'report_id')::uuid;

      v_previous_ingestion_id :=
        nullif(v_projection_payload->>'previous_ingestion_id', '')::uuid;

      v_snapshot_ingestion_id :=
        (v_projection_payload->>'snapshot_ingestion_id')::uuid;

      v_projection_start :=
        (v_projection_payload->>'projection_start')::date;

      v_projection_end :=
        (v_projection_payload->>'projection_end')::date;

      v_expected_rows :=
        (v_projection_payload->>'expected_rows')::bigint;
    exception
      when others then
        raise exception using
          message = 'MSFX_INVALID_INPUT: projection payload value could not be parsed';
    end;

    if v_projection_start > v_projection_end
       or v_expected_rows < 0
       or v_expected_rows > 2147483647
    then
      raise exception using
        message = 'MSFX_INVALID_INPUT: projection values are invalid';
    end if;

    select *
      into v_projection
      from public.media_sync_report_projections as p
     where p.media_sync_job_id = v_job_id
       and p.report_id = v_report_id
     for share;

    if not found then
      raise exception using
        message = 'MSFX_PROJECTION_SET_CONFLICT: report projection was not prepared';
    end if;

    if v_projection.workspace_id <> v_workspace_id
       or v_projection.advertiser_id <> v_advertiser_id
       or v_projection.report_id <> v_report_id
       or v_projection.previous_ingestion_id
            is distinct from v_previous_ingestion_id
       or v_projection.snapshot_ingestion_id
            is distinct from v_snapshot_ingestion_id
       or v_projection.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFX_PROJECTION_CONFLICT: projection authority does not match the request';
    end if;

    if v_report_id = v_job.report_id
       and (
         v_projection.previous_ingestion_id
           is distinct from v_job.previous_ingestion_id
         or v_projection.snapshot_ingestion_id
           is distinct from v_job.snapshot_ingestion_id
       )
    then
      raise exception using
        message = 'MSFX_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
    end if;

    select *
      into v_report
      from public.reports as r
     where r.id = v_report_id
     for update;

    if not found then
      raise exception using
        message = 'MSFX_REPORT_NOT_FOUND: projection report was not found';
    end if;

    if v_report.workspace_id <> v_workspace_id
       or v_report.advertiser_id is distinct from v_advertiser_id
    then
      raise exception using
        message = 'MSFX_SCOPE_MISMATCH: projection report scope does not match the job';
    end if;

    if coalesce(
      v_report.draft_period_start,
      v_report.period_start,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_from}'
        ),
        ''
      )::date
    )
         is distinct from v_projection_start
       or (
         coalesce(
           v_report.draft_period_end,
           v_report.period_end,
           nullif(
             btrim(
               v_report.meta #>> '{media_sync,date_to}'
             ),
             ''
           )::date
         ) is null
         or least(
           coalesce(
             v_report.draft_period_end,
             v_report.period_end,
             nullif(
               btrim(
                 v_report.meta #>> '{media_sync,date_to}'
               ),
               ''
             )::date
           ),
           v_job.date_to
         ) is distinct from v_projection_end
       )
    then
      raise exception using
        message = 'MSFX_PERIOD_CHANGED: report projection period changed before fanout activation';
    end if;

    if v_report.current_ingestion_id
         is not distinct from v_previous_ingestion_id
    then
      v_previous_state_count :=
        v_previous_state_count + 1;
    elsif v_report.current_ingestion_id
            is not distinct from v_snapshot_ingestion_id
    then
      v_snapshot_state_count :=
        v_snapshot_state_count + 1;
    else
      raise exception using
        message = 'MSFX_ACTIVATION_CONFLICT: report current pointer is neither previous nor snapshot';
    end if;

    select *
      into v_ingestion
      from public.report_ingestions as ri
     where ri.id = v_snapshot_ingestion_id
     for share;

    if not found then
      raise exception using
        message = 'MSFX_INGESTION_NOT_FOUND: projection ingestion was not found';
    end if;

    if v_ingestion.workspace_id <> v_workspace_id
       or v_ingestion.report_id <> v_report_id
       or v_ingestion.kind <> 'api'
       or v_ingestion.status <> 'success'
       or v_ingestion.row_count is distinct from v_expected_rows::integer
       or v_ingestion.csv_path is not null
       or v_ingestion.error is not null
       or v_ingestion.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFX_SNAPSHOT_INVALID: completed projection ingestion is invalid';
    end if;

    v_expected_dates :=
      (v_projection_end - v_projection_start)::bigint + 1;

    select
      count(*)::bigint,
      coalesce(sum(p.row_count), 0)::bigint
      into
        v_partition_dates,
        v_partition_rows
      from public.media_sync_fact_partitions as p
     where p.workspace_id = v_workspace_id
       and p.advertiser_id = v_advertiser_id
       and p.provider = 'naver_searchad'
       and p.external_account_id = v_external_account_id
       and p.date >= v_projection_start
       and p.date <= v_projection_end;

    if v_partition_dates <> v_expected_dates
       or v_partition_rows <> v_expected_rows
    then
      raise exception using
        message = 'MSFX_FACT_COVERAGE_CHANGED: canonical partition authority changed before fanout activation';
    end if;

    select count(*)::bigint
      into v_fact_rows
      from public.media_sync_fact_rows as f
     where f.workspace_id = v_workspace_id
       and f.advertiser_id = v_advertiser_id
       and f.provider = 'naver_searchad'
       and f.external_account_id = v_external_account_id
       and f.date >= v_projection_start
       and f.date <= v_projection_end;

    if v_fact_rows <> v_expected_rows then
      raise exception using
        message = 'MSFX_FACT_COUNT_MISMATCH: canonical fact row count changed before fanout activation';
    end if;

    if v_report_id = v_job.report_id then
      v_primary_report_id := v_report_id;
      v_primary_previous_ingestion_id := v_previous_ingestion_id;
      v_primary_snapshot_ingestion_id := v_snapshot_ingestion_id;
      v_primary_published_ingestion_id := v_report.published_ingestion_id;
      v_primary_row_count := v_expected_rows;
    end if;
  end loop;

  if v_primary_report_id is null
     or v_primary_snapshot_ingestion_id is null
  then
    raise exception using
      message = 'MSFX_PROJECTION_SET_CONFLICT: primary report projection is missing';
  end if;

  if v_previous_state_count > 0
     and v_snapshot_state_count > 0
  then
    raise exception using
      message = 'MSFX_PARTIAL_FANOUT_STATE: fanout reports are partially activated';
  end if;

  if v_snapshot_state_count = v_payload_projection_count then
    v_idempotent := true;
  elsif v_previous_state_count = v_payload_projection_count then
    v_idempotent := false;
  else
    raise exception using
      message = 'MSFX_ACTIVATION_CONFLICT: fanout pointer state is inconsistent';
  end if;

  /*
   * All updates below are in this same function transaction. Any failure
   * rolls back every report pointer update.
   */
  if not v_idempotent then
    for v_projection_payload in
      select item.value
        from jsonb_array_elements(p_payload->'projections') as item(value)
       order by item.value->>'report_id'
    loop
      v_report_id :=
        (v_projection_payload->>'report_id')::uuid;

      v_previous_ingestion_id :=
        nullif(v_projection_payload->>'previous_ingestion_id', '')::uuid;

      v_snapshot_ingestion_id :=
        (v_projection_payload->>'snapshot_ingestion_id')::uuid;

      update public.reports as r
         set current_ingestion_id = v_snapshot_ingestion_id
       where r.id = v_report_id
         and r.workspace_id = v_workspace_id
         and r.advertiser_id is not distinct from v_advertiser_id
         and r.current_ingestion_id is not distinct from v_previous_ingestion_id;

      if not found then
        raise exception using
          message = 'MSFX_ACTIVATION_CONFLICT: report pointer changed during atomic fanout activation';
      end if;
    end loop;
  end if;

  /*
   * Exact post-activation witness for every report.
   */
  for v_projection_payload in
    select item.value
      from jsonb_array_elements(p_payload->'projections') as item(value)
     order by item.value->>'report_id'
  loop
    v_report_id :=
      (v_projection_payload->>'report_id')::uuid;

    v_snapshot_ingestion_id :=
      (v_projection_payload->>'snapshot_ingestion_id')::uuid;

    select *
      into v_report
      from public.reports as r
     where r.id = v_report_id;

    if not found
       or v_report.current_ingestion_id
            is distinct from v_snapshot_ingestion_id
    then
      raise exception using
        message = 'MSFX_ACTIVATION_CONFLICT: report pointer failed atomic fanout activation postcheck';
    end if;

    if v_report_id = v_job.report_id then
      v_primary_current_ingestion_id :=
        v_report.current_ingestion_id;

      if v_report.published_ingestion_id
           is distinct from v_primary_published_ingestion_id
      then
        raise exception using
          message = 'MSFX_PUBLISHED_POINTER_CHANGED: primary published pointer changed during activation';
      end if;
    end if;
  end loop;

  if v_primary_current_ingestion_id
       is distinct from v_primary_snapshot_ingestion_id
  then
    raise exception using
      message = 'MSFX_ACTIVATION_CONFLICT: primary report did not activate its snapshot';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_job.status <> 'processing'
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
  then
    raise exception using
      message = 'MSFX_JOB_STATE_CHANGED: protected media sync job state changed unexpectedly';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_payload_projection_count,
    v_primary_report_id,
    v_primary_previous_ingestion_id,
    v_primary_snapshot_ingestion_id,
    v_primary_current_ingestion_id,
    v_primary_published_ingestion_id,
    v_primary_row_count,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_daily_report_v2_combined_snapshot(p_payload jsonb)
 RETURNS TABLE(run_id uuid, report_id uuid, previous_ingestion_id uuid, snapshot_ingestion_id uuid, current_ingestion_id uuid, published_ingestion_id uuid, row_count bigint, source_fingerprint text, status text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_run public.daily_report_v2_snapshot_runs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_run_id uuid;
  v_report_id uuid;

  v_source_fingerprint text;

  v_published_ingestion_before uuid;
  v_published_ingestion_after uuid;
  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or coalesce(p_payload->>'run_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message =
        'DRV2SA_INVALID_INPUT: activation payload is invalid';
  end if;

  begin
    v_run_id :=
      (p_payload->>'run_id')::uuid;
  exception
    when others then
      raise exception using
        message =
          'DRV2SA_INVALID_INPUT: run_id could not be parsed';
  end;

  /*
   * Discover report id without locking, then use the authoritative lock order:
   * REPORT FOR UPDATE -> RUN FOR UPDATE -> INGESTION FOR SHARE.
   */
  select r.report_id
    into v_report_id
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id;

  if not found then
    raise exception using
      message =
        'DRV2SA_RUN_NOT_FOUND: combined snapshot run was not found';
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message =
        'DRV2SA_REPORT_NOT_FOUND: report was not found';
  end if;

  select r.*
    into v_run
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id
   for update;

  if not found
     or v_run.report_id <> v_report_id
  then
    raise exception using
      message =
        'DRV2SA_RUN_CONFLICT: run identity changed before lock';
  end if;

  if v_run.status not in (
       'ready',
       'activated'
     )
  then
    raise exception using
      message =
        'DRV2SA_RUN_NOT_READY: combined snapshot run is not ready for activation';
  end if;

  if v_run.workspace_id <> v_report.workspace_id
     or v_run.advertiser_id
          is distinct from v_report.advertiser_id
     or v_run.created_by
          is distinct from v_report.created_by
  then
    raise exception using
      message =
        'DRV2SA_SCOPE_MISMATCH: run and report scope differ';
  end if;

  if v_report.status not in ('draft', 'ready')
     or v_report.meta #>> '{data_source,kind}' <> 'api'
     or v_report.meta #>> '{public_identity,source_type}' <> 'api'
     or v_report.meta #>> '{public_identity,period_type}' <>
          'daily_sync'
     or v_report.meta #>> '{public_identity,period_key}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,enabled}' <>
          'true'
     or v_report.meta #>> '{media_sync,auto_sync,contract}' <>
          'daily_report_v2'
     or v_report.meta #>> '{media_sync,auto_sync,start_date}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,scope}' <>
          'all_mapped_supported_media'
     or v_report.period_start is not null
     or v_report.period_end is not null
     or v_report.draft_period_start is not null
     or v_report.draft_period_end is not null
  then
    raise exception using
      message =
        'DRV2SA_INVALID_REPORT: report no longer matches Daily Report V2 contract';
  end if;

  if v_run.source_fingerprint is null
     or v_run.source_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      message =
        'DRV2SA_SOURCE_FINGERPRINT_MISSING: ready run lacks a valid source fingerprint';
  end if;

  /*
   * Exact pointer-state contract:
   *   ready     -> report must still point to previous ingestion
   *   activated -> report must already point to snapshot ingestion
   */
  if v_run.status = 'ready' then
    if v_report.current_ingestion_id
         is distinct from v_run.previous_ingestion_id
    then
      raise exception using
        message =
          'DRV2SA_ACTIVATION_CONFLICT: ready run no longer owns the report baseline pointer';
    end if;

    v_idempotent :=
      false;
  else
    if v_report.current_ingestion_id
         is distinct from v_run.snapshot_ingestion_id
    then
      raise exception using
        message =
          'DRV2SA_ACTIVATION_CONFLICT: activated run is not the report current snapshot';
    end if;

    v_idempotent :=
      true;
  end if;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  -- First publication remains explicit. Only a new, successful daily snapshot
  -- may advance an existing public data pointer. An idempotent retry must not
  -- republish or overwrite a subsequent manual publication decision.
  v_published_ingestion_after :=
    case
      when not v_idempotent
       and v_report.status = 'ready'
       and v_published_ingestion_before is not null
       and nullif(btrim(v_report.share_token), '') is not null
       and v_report.meta #>> '{data_source,kind}' = 'api'
       and v_report.meta #>> '{public_identity,period_type}' = 'daily_sync'
       and v_report.meta #>> '{media_sync,auto_sync,enabled}' = 'true'
       and v_report.meta #>> '{media_sync,auto_sync,contract}' = 'daily_report_v2'
      then v_run.snapshot_ingestion_id
      else v_published_ingestion_before
    end;

  /*
   * Freeze the exact canonical partition generations through pointer CAS.
   *
   * Naver and Google replacement both acquire FOR UPDATE on the same
   * account/date partition row before replacing canonical fact rows.
   * Holding FOR SHARE here therefore blocks a concurrent generation change
   * until this activation transaction commits or rolls back.
   *
   * All participant/date partitions already exist for a ready run.
   * Missing rows still fail closed via the stored source_fingerprint check.
   */
  perform 1
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
    join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = p.provider
     and fp.external_account_id = btrim(p.external_account_id)
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
   order by
     fp.provider,
     fp.external_account_id,
     fp.date
   for share of fp;

  /*
   * Revalidate the compact durable canonical source generation.
   * This uses only frozen participant scopes + partition metadata.
   * It intentionally does not rescan media_sync_fact_rows.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  scoped_partitions as (
    select
      fp.provider,
      fp.external_account_id,
      fp.date,
      fp.source_job_id,
      fp.source_job_created_at,
      fp.row_count
    from participants as pc
    join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
  )
  select
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              jsonb_build_array(
                provider,
                external_account_id,
                date::text,
                source_job_id::text,
                extract(
                  epoch from source_job_created_at
                )::text,
                row_count
              )::text,
              E'\n'
              order by
                date,
                provider,
                external_account_id,
                source_job_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_source_fingerprint
    from scoped_partitions;

  if v_source_fingerprint
       is distinct from v_run.source_fingerprint
  then
    raise exception using
      message =
        'DRV2SA_SOURCE_GENERATION_CHANGED: canonical partition generation changed before activation';
  end if;

  select ri.*
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_run.snapshot_ingestion_id
   for share;

  if not found then
    raise exception using
      message =
        'DRV2SA_INGESTION_NOT_FOUND: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_run.workspace_id
     or v_ingestion.report_id <> v_run.report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status <> 'success'
     or v_ingestion.row_count
          is distinct from v_run.expected_rows
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by
          is distinct from v_run.created_by
  then
    raise exception using
      message =
        'DRV2SA_INGESTION_INVALID: snapshot ingestion is not activation-safe';
  end if;

  if not v_idempotent then
    /*
     * Atomic CAS:
     *   current = previous -> snapshot
     * published advances only for an already-published ready daily report.
     * Both pointers commit together, after all existing readiness checks.
     */
    update public.reports as r
       set current_ingestion_id =
             v_run.snapshot_ingestion_id,
           published_ingestion_id =
             v_published_ingestion_after
     where r.id = v_run.report_id
       and r.workspace_id = v_run.workspace_id
       and r.advertiser_id
             is not distinct from v_run.advertiser_id
       and r.current_ingestion_id
             is not distinct from v_run.previous_ingestion_id
       and r.published_ingestion_id
             is not distinct from v_published_ingestion_before;

    if not found then
      raise exception using
        message =
          'DRV2SA_ACTIVATION_CONFLICT: report pointer changed during activation';
    end if;

    update public.daily_report_v2_snapshot_runs as r
       set status = 'activated',
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status = 'ready'
       and r.snapshot_ingestion_id =
             v_run.snapshot_ingestion_id
       and r.previous_ingestion_id
             is not distinct from v_run.previous_ingestion_id
       and r.source_fingerprint =
             v_run.source_fingerprint;

    if not found then
      raise exception using
        message =
          'DRV2SA_RUN_STATE_CONFLICT: ready run could not enter activated state';
    end if;

    v_run.status :=
      'activated';
  end if;

  /*
   * Exact postconditions.
   * Any failure raises inside this same transaction and rolls back pointer/run.
   */
  select r.*
    into v_report
    from public.reports as r
   where r.id = v_run.report_id;

  if not found
     or v_report.current_ingestion_id
          is distinct from v_run.snapshot_ingestion_id
     or v_report.published_ingestion_id
          is distinct from v_published_ingestion_after
  then
    raise exception using
      message =
        'DRV2SA_POSTCONDITION_FAILED: report pointers violate activation contract';
  end if;

  select r.*
    into v_run
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id;

  if not found
     or v_run.status <> 'activated'
     or v_run.source_fingerprint
          is distinct from v_source_fingerprint
  then
    raise exception using
      message =
        'DRV2SA_POSTCONDITION_FAILED: run state violates activation contract';
  end if;

  if v_ingestion.status <> 'success'
     or v_ingestion.row_count
          is distinct from v_run.expected_rows
  then
    raise exception using
      message =
        'DRV2SA_POSTCONDITION_FAILED: ingestion state violates activation contract';
  end if;

  return query
  select
    v_run.id,
    v_run.report_id,
    v_run.previous_ingestion_id,
    v_run.snapshot_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_ingestion.row_count::bigint,
    v_source_fingerprint,
    v_run.status,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION etrylue_customer_private.my_company()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select company_id from etrylue_customer_private.scopes where user_id=auth.uid();
$function$;

CREATE OR REPLACE FUNCTION etrylue_customer_private.guard_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if exists(select 1 from etrylue_customer_private.scopes where user_id=old.id)
    and (new.id,new.company_id,new.role_id,new.platform_role,new.email,new.department_id,new.team_id)
      is distinct from (old.id,old.company_id,old.role_id,old.platform_role,old.email,old.department_id,old.team_id) then
    raise exception 'CUSTOMER_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION etrylue_customer_private.guard_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare account etrylue_customer_private.accounts;
begin
  select * into account from etrylue_customer_private.accounts where user_id=new.user_id;
  if exists(select 1 from etrylue_customer_private.scopes where user_id=new.user_id) and new.role='master' then
    if tg_op='INSERT' and new.workspace_id=account.workspace_id and account.provisioned_at is null then
      new.role:='admin';
    else raise exception 'CUSTOMER_MASTER_FORBIDDEN'; end if;
  end if;
  return new;
end;
$function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.claim_next_naver_media_sync_job()
 RETURNS SETOF media_sync_jobs
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with claimable_job as (
    select job.id
    from public.media_sync_jobs as job
    where job.status = 'pending'
      and job.provider = 'naver_searchad'
    order by job.created_at asc, job.id asc
    for update skip locked
    limit 1
  )
  update public.media_sync_jobs as job
  set
    status = 'processing',
    started_at = now(),
    updated_at = now(),
    attempt_count = job.attempt_count + 1,
    error = null,
    error_detail =
      case
        when job.error_detail is not null
          and job.error_detail ? 'processing_checkpoint'
        then jsonb_build_object(
          'processing_checkpoint',
          job.error_detail -> 'processing_checkpoint'
        )
        else null
      end
  from claimable_job
  where job.id = claimable_job.id
  returning job.*;
$function$;

CREATE OR REPLACE FUNCTION public.complete_media_sync_snapshot_materialization(p_payload jsonb)
 RETURNS TABLE(job jsonb, snapshot_ingestion_id uuid, row_count bigint, staging_fingerprint text, materialized_fingerprint text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_completion_fingerprint text;

  v_is_primary_projection boolean;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id :=
      (p_payload->>'job_id')::uuid;

    v_report_id :=
      (p_payload->>'report_id')::uuid;

    v_workspace_id :=
      (p_payload->>'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload->>'advertiser_id')::uuid;

    v_connection_id :=
      (p_payload->>'connection_id')::uuid;

    v_snapshot_ingestion_id :=
      (p_payload->>'snapshot_ingestion_id')::uuid;

    v_provider :=
      btrim(p_payload->>'provider');

    v_external_account_id :=
      btrim(p_payload->>'external_account_id');

    v_date_from :=
      (p_payload->>'date_from')::date;

    v_date_to :=
      (p_payload->>'date_to')::date;

    v_expected_rows :=
      (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSMM_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0
     or (
       v_expected_rows = 0
       and v_provider <> 'naver_searchad'
     ) then
    raise exception using
      message = 'MSMM_INVALID_INPUT: completion payload values are invalid';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSMM_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using
      message = 'MSMM_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
     or v_job.mode <> 'snapshot_replace'
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: completion execution scope does not match the job';
  end if;

  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  /*
   * Macro 3-A1 projection completion authority.
   *
   * The selected projection owns target report previous/snapshot identity.
   * Job mirrors are checked only for the legacy primary projection.
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: report projection was not found';
  end if;

  if v_projection.media_sync_job_id <> v_job_id
     or v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.created_by
          is distinct from v_job.created_by
     or v_projection.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: report projection authority does not match the request';
  end if;

  if v_is_primary_projection
     and (
       v_projection.previous_ingestion_id
         is distinct from v_job.previous_ingestion_id
       or v_projection.snapshot_ingestion_id
         is distinct from v_job.snapshot_ingestion_id
     ) then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: primary projection no longer matches job compatibility mirrors';
  end if;

  v_previous_ingestion_id :=
    v_projection.previous_ingestion_id;

  v_snapshot_ingestion_id :=
    v_projection.snapshot_ingestion_id;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id
          is distinct from v_advertiser_id
     or v_report.current_ingestion_id
          is distinct from v_previous_ingestion_id then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report pointer no longer matches the materialization baseline';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion does not match the job';
  end if;

  /*
   * Constant-time staging completion verification.
   *
   * prepare_media_sync_snapshot_materialization() already validates complete
   * staging coverage and canonical row integrity before creating or resuming
   * the snapshot ingestion. Every bounded batch then compares its exact
   * report_rows range with staging and advances report_ingestions.row_count
   * in the same transaction. The sequential checkpoint guard prevents skipped
   * ranges, and a failed batch cannot commit its checkpoint.
   *
   * Therefore completion must not rescan all freshly inserted staging rows.
   * Fresh staging rows are not yet all-visible, so even an Index Only Scan can
   * perform one heap fetch per row and exceed the API role statement_timeout.
   */
  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using
      message = 'MSMM_STAGING_INCOMPLETE: staging checkpoint counts are incomplete';
  end if;

  /*
   * Constant-time materialization completion verification.
   *
   * Each bounded batch exactly compares report_rows with staging and advances
   * report_ingestions.row_count in the same transaction. Sequential checkpoint
   * enforcement prevents skipped ranges, and a failed batch cannot commit a
   * checkpoint. Therefore row_count = expected_rows proves that every bounded
   * range from 0 through expected_rows - 1 was committed and verified.
   *
   * Do not rescan all newly inserted report_rows here. Fresh rows are not yet
   * all-visible, so even an Index Only Scan performs one heap fetch per row and
   * can exceed the API role's statement_timeout.
   */
  if v_ingestion.row_count
       is distinct from v_expected_rows::integer then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: materialization checkpoint is incomplete';
  end if;

  /*
   * Contract-compatible deterministic completion token.
   * No full JSON rehash or ordered string aggregation is performed here.
   */
  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_expected_rows::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if v_ingestion.status = 'success' then
    if v_ingestion.row_count
         is distinct from v_expected_rows::integer then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: completed ingestion row count is invalid';
    end if;

    v_idempotent := true;
  else
    update public.report_ingestions as ri
       set status = 'success',
           row_count = v_expected_rows::integer,
           error = null,
           updated_at = pg_catalog.clock_timestamp()
     where ri.id = v_snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count =
             v_expected_rows::integer
       and ri.error is null;

    if not found then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion could not be completed';
    end if;

    v_idempotent := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report ingestion pointer changed during completion';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
    v_expected_rows,
    v_completion_fingerprint,
    v_completion_fingerprint,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_api_report_with_media_connection_v1(p_workspace_id uuid, p_advertiser_id uuid, p_connection_id uuid, p_report_type_id uuid, p_title text, p_period_start date, p_period_end date, p_created_by uuid, p_meta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_connection public.media_connections%rowtype;
  v_report public.reports%rowtype;

  v_meta jsonb;
  v_data_source jsonb;

  v_title text;
  v_data_level text;
  v_mode text;
begin
  if p_workspace_id is null then
    raise exception using
      errcode = '22023',
      message = 'API_REPORT_INVALID_INPUT: workspace_id is required';
  end if;

  if p_advertiser_id is null then
    raise exception using
      errcode = '22023',
      message = 'API_REPORT_INVALID_INPUT: advertiser_id is required';
  end if;

  if p_connection_id is null then
    raise exception using
      errcode = '22023',
      message = 'API_REPORT_INVALID_INPUT: connection_id is required';
  end if;

  if p_report_type_id is null then
    raise exception using
      errcode = '22023',
      message = 'API_REPORT_INVALID_INPUT: report_type_id is required';
  end if;

  if p_created_by is null then
    raise exception using
      errcode = '22023',
      message = 'API_REPORT_INVALID_INPUT: created_by is required';
  end if;


  select
    mc.*
  into v_connection
  from public.media_connections as mc
  where mc.id = p_connection_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'API_REPORT_CONNECTION_NOT_FOUND: media connection was not found';
  end if;


  if v_connection.tenant_id is null then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_CONNECTION_SCOPE_INVALID: connection tenant_id is null';
  end if;

  if v_connection.workspace_id is distinct from p_workspace_id then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_CONNECTION_SCOPE_INVALID: workspace mismatch';
  end if;

  if v_connection.advertiser_id is distinct from p_advertiser_id then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_CONNECTION_SCOPE_INVALID: advertiser mismatch';
  end if;

  if v_connection.status <> 'active' then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_CONNECTION_NOT_ACTIVE: connection must be active';
  end if;

  if nullif(
    btrim(coalesce(v_connection.credential_ciphertext, '')),
    ''
  ) is null then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_CONNECTION_CREDENTIALS_MISSING: active credentials are required';
  end if;


  v_meta := coalesce(
    p_meta,
    '{}'::jsonb
  );

  if jsonb_typeof(v_meta) <> 'object' then
    raise exception using
      errcode = '22023',
      message =
        'API_REPORT_INVALID_INPUT: meta must be a JSON object';
  end if;


  v_data_source :=
    case
      when jsonb_typeof(v_meta -> 'data_source') = 'object'
        then v_meta -> 'data_source'
      else '{}'::jsonb
    end;

  if lower(
    btrim(
      coalesce(
        v_data_source ->> 'kind',
        ''
      )
    )
  ) <> 'api' then
    raise exception using
      errcode = '22023',
      message =
        'API_REPORT_INVALID_INPUT: data_source.kind must be api';
  end if;


  v_data_level :=
    coalesce(
      nullif(
        btrim(
          coalesce(
            v_data_source ->> 'data_level',
            ''
          )
        ),
        ''
      ),
      'keyword'
    );

  v_mode :=
    coalesce(
      nullif(
        btrim(
          coalesce(
            v_data_source ->> 'mode',
            ''
          )
        ),
        ''
      ),
      'snapshot_replace'
    );


  v_data_source :=
    v_data_source
    ||
    jsonb_build_object(
      'kind',
      'api',
      'provider',
      v_connection.provider,
      'data_level',
      v_data_level,
      'mode',
      v_mode
    );

  v_meta :=
    jsonb_set(
      v_meta,
      '{data_source}',
      v_data_source,
      true
    );


  v_title :=
    coalesce(
      nullif(
        btrim(
          coalesce(
            p_title,
            ''
          )
        ),
        ''
      ),
      'New Report - Draft'
    );


  insert into public.reports (
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
    p_workspace_id,
    p_advertiser_id,
    p_report_type_id,
    v_title,
    'draft',
    p_period_start,
    p_period_end,
    p_created_by,
    v_meta
  )
  returning *
  into v_report;


  if v_report.tenant_id is null then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_SCOPE_INVALID: report tenant_id was not assigned';
  end if;

  if v_report.tenant_id
      is distinct from v_connection.tenant_id
  then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_SCOPE_INVALID: report and connection tenant mismatch';
  end if;

  if v_report.workspace_id
      is distinct from v_connection.workspace_id
  then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_SCOPE_INVALID: report and connection workspace mismatch';
  end if;

  if v_report.advertiser_id
      is distinct from v_connection.advertiser_id
  then
    raise exception using
      errcode = '23514',
      message =
        'API_REPORT_SCOPE_INVALID: report and connection advertiser mismatch';
  end if;


  insert into public.report_media_connections (
    tenant_id,
    workspace_id,
    advertiser_id,
    report_id,
    connection_id
  )
  values (
    v_report.tenant_id,
    v_report.workspace_id,
    v_report.advertiser_id,
    v_report.id,
    v_connection.id
  );


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
    'connection_id',
    v_connection.id,
    'provider',
    v_connection.provider
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.claim_next_google_ads_media_sync_job()
 RETURNS SETOF media_sync_jobs
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with claimable_job as (
    select
      job.id
    from public.media_sync_jobs as job
    where job.status = 'pending'
      and job.provider = 'google_ads'
    order by
      job.created_at asc,
      job.id asc
    for update skip locked
    limit 1
  )
  update public.media_sync_jobs as job
  set
    status = 'processing',
    started_at = now(),
    updated_at = now(),
    attempt_count =
      job.attempt_count + 1,
    error = null,
    error_detail =
      case
        when job.error_detail is not null
          and job.error_detail
            ? 'processing_checkpoint'
        then jsonb_build_object(
          'processing_checkpoint',
          job.error_detail
            -> 'processing_checkpoint'
        )
        else null
      end
  from claimable_job
  where
    job.id =
    claimable_job.id
  returning
    job.*;
$function$;

CREATE OR REPLACE FUNCTION public.complete_naver_searchads_fact_only_job(p_payload jsonb)
 RETURNS TABLE(job jsonb, covered_dates bigint, partition_rows bigint, fact_rows bigint, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_job_id uuid;
  v_date date;
  v_expected_dates bigint;
  v_covered_dates bigint := 0;
  v_partition_rows bigint := 0;
  v_fact_rows bigint := 0;
  v_bad_lineage bigint := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_idempotent boolean := false;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_INVALID_INPUT: payload must be a JSON object';
  end if;

  begin
    v_job_id := nullif(btrim(p_payload ->> 'job_id'), '')::uuid;
  exception when others then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_INVALID_INPUT: job_id is invalid';
  end;

  if v_job_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_INVALID_INPUT: job_id is required';
  end if;

  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_UNSUPPORTED_JOB: Naver snapshot_replace is required';
  end if;

  if v_job.snapshot_ingestion_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_SNAPSHOT_EXISTS: fact-only completion cannot own a snapshot';
  end if;

  if v_job.status = 'done' then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.failed_rows <> 0
       or v_job.error is not null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSFC_COMPLETION_CONFLICT: invalid done/null-snapshot state';
    end if;
    v_idempotent := true;
  elsif v_job.status = 'processing' then
    if v_job.finished_at is not null
       or v_job.failed_rows <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSFC_INVALID_JOB_STATE: processing job is not eligible';
    end if;
  else
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_JOB_NOT_PROCESSING: job must be processing or already done';
  end if;

  if v_job.date_to < v_job.date_from then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_DATE_WINDOW_INVALID: job date window is invalid';
  end if;

  if v_job.raw_rows <> v_job.inserted_rows
     or v_job.normalized_rows <> v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_JOB_COUNT_CONFLICT: reconciled job counts changed';
  end if;

  v_expected_dates := (v_job.date_to - v_job.date_from + 1)::bigint;

  -- Use the same account/date advisory-lock key as fact replacement.
  for v_date in
    select d::date
    from generate_series(
      v_job.date_from::timestamp,
      v_job.date_to::timestamp,
      interval '1 day'
    ) as d
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_job.workspace_id::text || '|' ||
        v_job.advertiser_id::text || '|' ||
        v_job.provider || '|' ||
        v_job.external_account_id || '|' ||
        v_date::text,
        0
      )
    );
  end loop;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint,
    count(*) filter (
      where p.source_connection_id is distinct from v_job.connection_id
         or p.source_report_id is distinct from v_job.report_id
         or p.source_job_id is distinct from v_job.id
         or p.source_job_created_at is distinct from v_job.created_at
    )::bigint
  into v_covered_dates, v_partition_rows, v_bad_lineage
  from public.media_sync_fact_partitions as p
  where p.workspace_id = v_job.workspace_id
    and p.advertiser_id = v_job.advertiser_id
    and p.provider = v_job.provider
    and p.external_account_id = v_job.external_account_id
    and p.date between v_job.date_from and v_job.date_to;

  if v_covered_dates <> v_expected_dates
     or v_bad_lineage <> 0
     or v_partition_rows <> v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_PARTITION_AUTHORITY_CONFLICT: exact job-date ownership is required';
  end if;

  select
    count(*)::bigint,
    count(*) filter (
      where f.source_connection_id is distinct from v_job.connection_id
         or f.source_report_id is distinct from v_job.report_id
         or f.source_job_id is distinct from v_job.id
         or f.source_job_created_at is distinct from v_job.created_at
    )::bigint
  into v_fact_rows, v_bad_lineage
  from public.media_sync_fact_rows as f
  where f.workspace_id = v_job.workspace_id
    and f.advertiser_id = v_job.advertiser_id
    and f.provider = v_job.provider
    and f.external_account_id = v_job.external_account_id
    and f.date between v_job.date_from and v_job.date_to;

  if v_bad_lineage <> 0
     or v_fact_rows <> v_partition_rows
     or v_fact_rows <> v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_FACT_AUTHORITY_CONFLICT: canonical facts do not match the chunk';
  end if;

  if not v_idempotent then
    update public.media_sync_jobs as j
    set status = 'done',
        progress = 100,
        finished_at = v_now,
        error = null,
        updated_at = v_now
    where j.id = v_job.id
      and j.status = 'processing'
      and j.snapshot_ingestion_id is null
      and j.finished_at is null
      and j.failed_rows = 0;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'MSFC_COMPLETION_CONFLICT: job changed during completion';
    end if;
  end if;

  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job.id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.snapshot_ingestion_id is not null
     or v_job.failed_rows <> 0
     or v_job.error is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSFC_POSTCONDITION_FAILED: fact-only completion contract failed';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_covered_dates,
    v_partition_rows,
    v_fact_rows,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_naver_fact_snapshot_materialization(p_payload jsonb)
 RETURNS TABLE(job jsonb, report_id uuid, snapshot_ingestion_id uuid, projection_start date, projection_end date, row_count bigint, completion_fingerprint text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_snapshot_ingestion_id uuid;

  v_external_account_id text;

  v_projection_start date;
  v_projection_end date;
  v_expected_rows bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;
  v_fact_rows bigint;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_is_primary_projection boolean;
  v_completion_fingerprint text;
  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFC_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFC_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or coalesce(p_payload->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$'
  then
    raise exception using
      message = 'MSFC_INVALID_INPUT: completion inputs are invalid';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_snapshot_ingestion_id := (p_payload->>'snapshot_ingestion_id')::uuid;

    v_external_account_id := btrim(p_payload->>'external_account_id');

    v_projection_start := (p_payload->>'projection_start')::date;
    v_projection_end := (p_payload->>'projection_end')::date;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSFC_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_projection_start > v_projection_end
     or v_expected_rows < 0
     or v_expected_rows > 2147483647
  then
    raise exception using
      message = 'MSFC_INVALID_INPUT: completion values are invalid';
  end if;

  /*
   * Lock order:
   *   JOB -> REPORT -> PROJECTION -> INGESTION.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFC_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFC_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFC_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
  then
    raise exception using
      message = 'MSFC_SCOPE_MISMATCH: job scope is not projection-safe';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSFC_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
  then
    raise exception using
      message = 'MSFC_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  if coalesce(
      v_report.draft_period_start,
      v_report.period_start,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_from}'
        ),
        ''
      )::date
    )
       is distinct from v_projection_start
     or (
       coalesce(
         v_report.draft_period_end,
         v_report.period_end,
         nullif(
           btrim(
             v_report.meta #>> '{media_sync,date_to}'
           ),
           ''
         )::date
       ) is null
       or least(
         coalesce(
           v_report.draft_period_end,
           v_report.period_end,
           nullif(
             btrim(
               v_report.meta #>> '{media_sync,date_to}'
             ),
             ''
           )::date
         ),
         v_job.date_to
       ) is distinct from v_projection_end
     )
  then
    raise exception using
      message = 'MSFC_PERIOD_CHANGED: report projection period changed during materialization';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;
  v_is_primary_projection := v_job.report_id = v_report_id;

  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSFC_PROJECTION_NOT_FOUND: report projection was not prepared';
  end if;

  if v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id
     or v_projection.created_by is distinct from v_job.created_by
  then
    raise exception using
      message = 'MSFC_PROJECTION_CONFLICT: report projection authority is invalid';
  end if;

  if v_report.current_ingestion_id
       is distinct from v_projection.previous_ingestion_id
  then
    raise exception using
      message = 'MSFC_POINTER_CHANGED: report current pointer changed before completion';
  end if;

  if v_is_primary_projection
     and (
       v_job.previous_ingestion_id
         is distinct from v_projection.previous_ingestion_id
       or v_job.snapshot_ingestion_id
         is distinct from v_snapshot_ingestion_id
     )
  then
    raise exception using
      message = 'MSFC_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
  end if;

  /*
   * Durable partition rows remain the zero-row-aware date authority.
   */
  v_expected_dates :=
    (v_projection_end - v_projection_start)::bigint + 1;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint
    into
      v_partition_dates,
      v_partition_rows
    from public.media_sync_fact_partitions as p
   where p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = 'naver_searchad'
     and p.external_account_id = v_external_account_id
     and p.date >= v_projection_start
     and p.date <= v_projection_end;

  if v_partition_dates <> v_expected_dates
     or v_partition_rows <> v_expected_rows
  then
    raise exception using
      message = 'MSFC_FACT_COVERAGE_CHANGED: canonical partition authority changed before completion';
  end if;

  /*
   * Recheck exact canonical row cardinality. This is intentionally a COUNT(*)
   * over the authoritative fact range, not a JSON rehash.
   */
  select count(*)::bigint
    into v_fact_rows
    from public.media_sync_fact_rows as f
   where f.workspace_id = v_workspace_id
     and f.advertiser_id = v_advertiser_id
     and f.provider = 'naver_searchad'
     and f.external_account_id = v_external_account_id
     and f.date >= v_projection_start
     and f.date <= v_projection_end;

  if v_fact_rows <> v_expected_rows then
    raise exception using
      message = 'MSFC_FACT_COUNT_MISMATCH: canonical fact row count changed before completion';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSFC_INGESTION_NOT_FOUND: projection ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by
     or v_ingestion.row_count is distinct from v_expected_rows::integer
  then
    raise exception using
      message = 'MSFC_MATERIALIZATION_INCOMPLETE: projection ingestion checkpoint is incomplete';
  end if;

  /*
   * Reject any impossible out-of-range destination row. Sequential bounded
   * batch verification plus row_count == expected_rows proves every expected
   * range was committed; this small indexed witness guards against extras.
   */
  if exists (
    select 1
      from public.report_rows as rr
     where rr.report_id = v_report_id
       and rr.ingestion_id = v_snapshot_ingestion_id
       and (
         rr.row_index < 0
         or rr.row_index >= v_expected_rows::integer
       )
     limit 1
  ) then
    raise exception using
      message = 'MSFC_MATERIALIZATION_CONFLICT: snapshot contains out-of-range report_rows';
  end if;

  if v_expected_rows = 0
     and exists (
       select 1
         from public.report_rows as rr
        where rr.report_id = v_report_id
          and rr.ingestion_id = v_snapshot_ingestion_id
        limit 1
     )
  then
    raise exception using
      message = 'MSFC_MATERIALIZATION_CONFLICT: zero-row snapshot contains report_rows';
  end if;

  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_projection_start::text || ':' ||
          v_projection_end::text || ':' ||
          v_expected_rows::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if v_ingestion.status = 'success' then
    v_idempotent := true;
  else
    update public.report_ingestions as ri
       set status = 'success',
           row_count = v_expected_rows::integer,
           error = null,
           updated_at = pg_catalog.clock_timestamp()
     where ri.id = v_snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count = v_expected_rows::integer
       and ri.error is null;

    if not found then
      raise exception using
        message = 'MSFC_COMPLETION_CONFLICT: snapshot ingestion could not be completed';
    end if;

    v_idempotent := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message = 'MSFC_POINTER_CHANGED: report pointers changed during completion';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_report_id,
    v_snapshot_ingestion_id,
    v_projection_start,
    v_projection_end,
    v_expected_rows,
    v_completion_fingerprint,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_api_report_with_media_connections_v2(p_workspace_id uuid, p_advertiser_id uuid, p_connection_ids uuid[], p_report_type_id uuid, p_title text, p_period_start date, p_period_end date, p_created_by uuid, p_meta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.complete_google_ads_daily_v2_fact_only_job(p_payload jsonb)
 RETURNS TABLE(job jsonb, covered_dates bigint, partition_rows bigint, fact_rows bigint, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_job_id uuid;

  v_checkpoint jsonb;
  v_collector jsonb;

  v_covered_dates bigint := 0;
  v_partition_rows bigint := 0;
  v_fact_rows bigint := 0;
  v_bad_lineage bigint := 0;

  v_now timestamptz :=
    pg_catalog.clock_timestamp();

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_INVALID_INPUT: payload must be a JSON object';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(
          p_payload ->> 'job_id'
        ),
        ''
      )::uuid;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FC_INVALID_INPUT: job_id is invalid';
  end;

  if v_job_id is null then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_INVALID_INPUT: job_id is required';
  end if;

  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.provider <> 'google_ads'
     or v_job.mode <> 'snapshot_replace'
     or v_job.execution_contract is distinct from
          'google_all_data_v1'
     or v_job.automation_contract is distinct from
          'daily_report_v2'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_UNSUPPORTED_JOB: Google Daily Report V2 ALL-DATA job is required';
  end if;

  if v_job.date_from <> v_job.date_to then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_DATE_SCOPE_MISMATCH: exact one-day job authority is required';
  end if;

  if v_job.snapshot_ingestion_id is not null then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_SNAPSHOT_EXISTS: fact-only completion cannot own a snapshot';
  end if;

  if v_job.status = 'done' then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.failed_rows <> 0
       or v_job.error is not null
    then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FC_COMPLETION_CONFLICT: invalid done/null-snapshot state';
    end if;

    v_idempotent := true;

  elsif v_job.status = 'processing' then
    if v_job.finished_at is not null
       or v_job.failed_rows <> 0
    then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FC_INVALID_JOB_STATE: processing job is not eligible';
    end if;

    v_idempotent := false;

  else
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_JOB_NOT_PROCESSING: job must be processing or already done';
  end if;

  if v_job.raw_rows <>
       v_job.inserted_rows
     or v_job.normalized_rows <>
          v_job.inserted_rows
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_JOB_COUNT_CONFLICT: Google row counts changed';
  end if;

  -- Durable completion witness is retained even after status=done.
  if jsonb_typeof(v_job.error_detail) <>
       'object'
     or jsonb_typeof(
       v_job.error_detail ->
         'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_CHECKPOINT_NOT_COMPLETED: processing checkpoint is missing';
  end if;

  v_checkpoint :=
    v_job.error_detail ->
      'processing_checkpoint';

  if jsonb_typeof(
       v_checkpoint -> 'collector'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_CHECKPOINT_NOT_COMPLETED: collector checkpoint is missing';
  end if;

  v_collector :=
    v_checkpoint -> 'collector';

  if v_checkpoint ->> 'execution_contract'
       is distinct from 'google_all_data_v1'
     or v_checkpoint ->> 'complete'
       is distinct from 'true'
     or v_checkpoint ->> 'failed_rows'
       is distinct from '0'
     or v_collector ->> 'google_version'
       is distinct from '1'
     or v_collector ->> 'all_data_version'
       is distinct from '1'
     or v_collector ->> 'phase'
       is distinct from 'completed'
     or v_collector ->> 'complete'
       is distinct from 'true'
     or v_collector -> 'cursor'
       is distinct from 'null'::jsonb
     or v_checkpoint ->> 'next_row_index'
       is distinct from
          v_job.inserted_rows::text
     or v_collector ->> 'next_row_index'
       is distinct from
          v_job.inserted_rows::text
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_CHECKPOINT_CONFLICT: durable Google completion authority changed';
  end if;

  -- Same canonical account/date lock used by replacement.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_job.workspace_id::text
        || '|'
        || v_job.advertiser_id::text
        || '|'
        || v_job.provider
        || '|'
        || v_job.external_account_id
        || '|'
        || v_job.date_from::text,
      0
    )
  );

  select
    count(*)::bigint,
    coalesce(
      sum(p.row_count),
      0
    )::bigint,

    count(*) filter (
      where p.source_connection_id
              is distinct from
                v_job.connection_id
         or p.source_report_id
              is distinct from
                v_job.report_id
         or p.source_job_id
              is distinct from
                v_job.id
         or p.source_job_created_at
              is distinct from
                v_job.created_at
    )::bigint

  into
    v_covered_dates,
    v_partition_rows,
    v_bad_lineage

  from public.media_sync_fact_partitions
    as p

  where p.workspace_id =
          v_job.workspace_id
    and p.advertiser_id =
          v_job.advertiser_id
    and p.provider =
          v_job.provider
    and p.external_account_id =
          v_job.external_account_id
    and p.date =
          v_job.date_from;

  if v_covered_dates <> 1
     or v_bad_lineage <> 0
     or v_partition_rows <>
          v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_PARTITION_AUTHORITY_CONFLICT: exact job/date ownership is required';
  end if;

  select
    count(*)::bigint,

    count(*) filter (
      where f.source_connection_id
              is distinct from
                v_job.connection_id
         or f.source_report_id
              is distinct from
                v_job.report_id
         or f.source_job_id
              is distinct from
                v_job.id
         or f.source_job_created_at
              is distinct from
                v_job.created_at
    )::bigint

  into
    v_fact_rows,
    v_bad_lineage

  from public.media_sync_fact_rows
    as f

  where f.workspace_id =
          v_job.workspace_id
    and f.advertiser_id =
          v_job.advertiser_id
    and f.provider =
          v_job.provider
    and f.external_account_id =
          v_job.external_account_id
    and f.date =
          v_job.date_from;

  if v_bad_lineage <> 0
     or v_fact_rows <>
          v_partition_rows
     or v_fact_rows <>
          v_job.inserted_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_FACT_AUTHORITY_CONFLICT: canonical facts do not match the job';
  end if;

  if not v_idempotent then
    update public.media_sync_jobs
      as j
    set
      status = 'done',
      progress = 100,
      finished_at = v_now,
      error = null,
      updated_at = v_now
    where j.id = v_job.id
      and j.status = 'processing'
      and j.snapshot_ingestion_id is null
      and j.finished_at is null
      and j.failed_rows = 0
      and j.automation_contract =
            'daily_report_v2'
      and j.execution_contract =
            'google_all_data_v1';

    if not found then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FC_COMPLETION_CONFLICT: job changed during completion';
    end if;
  end if;

  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job.id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.snapshot_ingestion_id
          is not null
     or v_job.failed_rows <> 0
     or v_job.error is not null
     or v_job.provider <> 'google_ads'
     or v_job.execution_contract
          is distinct from
            'google_all_data_v1'
     or v_job.automation_contract
          is distinct from
            'daily_report_v2'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FC_POSTCONDITION_FAILED: fact-only completion contract failed';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_covered_dates,
    v_partition_rows,
    v_fact_rows,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_daily_report_v2_combined_snapshot(p_payload jsonb)
 RETURNS TABLE(run_id uuid, report_id uuid, snapshot_ingestion_id uuid, row_count bigint, source_fingerprint text, status text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_run public.daily_report_v2_snapshot_runs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_run_id uuid;
  v_report_id uuid;

  v_expected_dates bigint;

  v_participant_rows bigint;
  v_distinct_fact_scopes bigint;
  v_invalid_participants bigint;
  v_participant_expected_rows bigint;
  v_bad_coverage bigint;

  v_source_fingerprint text;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or coalesce(p_payload->>'run_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message =
        'DRV2SC_INVALID_INPUT: completion payload is invalid';
  end if;

  begin
    v_run_id :=
      (p_payload->>'run_id')::uuid;
  exception
    when others then
      raise exception using
        message =
          'DRV2SC_INVALID_INPUT: run_id could not be parsed';
  end;

  select r.report_id
    into v_report_id
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id;

  if not found then
    raise exception using
      message =
        'DRV2SC_RUN_NOT_FOUND: combined snapshot run was not found';
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message =
        'DRV2SC_REPORT_NOT_FOUND: report was not found';
  end if;

  select r.*
    into v_run
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id
   for update;

  if not found
     or v_run.report_id <> v_report_id
  then
    raise exception using
      message =
        'DRV2SC_RUN_CONFLICT: run identity changed before lock';
  end if;

  if v_run.status not in (
       'prepared',
       'materializing',
       'ready'
     )
  then
    raise exception using
      message =
        'DRV2SC_RUN_NOT_COMPLETABLE: run is not completable';
  end if;

  if v_run.workspace_id <> v_report.workspace_id
     or v_run.advertiser_id
          is distinct from v_report.advertiser_id
     or v_run.created_by
          is distinct from v_report.created_by
  then
    raise exception using
      message =
        'DRV2SC_SCOPE_MISMATCH: run and report scope differ';
  end if;

  if v_report.status not in ('draft', 'ready')
     or v_report.meta #>> '{data_source,kind}' <> 'api'
     or v_report.meta #>> '{public_identity,source_type}' <> 'api'
     or v_report.meta #>> '{public_identity,period_type}' <>
          'daily_sync'
     or v_report.meta #>> '{public_identity,period_key}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,enabled}' <>
          'true'
     or v_report.meta #>> '{media_sync,auto_sync,contract}' <>
          'daily_report_v2'
     or v_report.meta #>> '{media_sync,auto_sync,start_date}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,scope}' <>
          'all_mapped_supported_media'
     or v_report.period_start is not null
     or v_report.period_end is not null
     or v_report.draft_period_start is not null
     or v_report.draft_period_end is not null
  then
    raise exception using
      message =
        'DRV2SC_INVALID_REPORT: report no longer matches Daily Report V2 contract';
  end if;

  if v_report.current_ingestion_id
       is distinct from v_run.previous_ingestion_id
  then
    raise exception using
      message =
        'DRV2SC_POINTER_CONFLICT: current ingestion changed after prepare';
  end if;

  with participants as (
    select
      p.connection_id,
      p.provider,
      btrim(p.external_account_id) as external_account_id,
      p.expected_rows
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  )
  select
    count(*)::bigint,
    count(
      distinct (
        provider,
        external_account_id
      )
    )::bigint,
    count(*) filter (
      where connection_id is null
         or provider not in (
              'naver_searchad',
              'google_ads'
            )
         or external_account_id is null
         or external_account_id = ''
         or expected_rows is null
         or expected_rows < 0
    )::bigint,
    coalesce(sum(expected_rows), 0)::bigint
    into
      v_participant_rows,
      v_distinct_fact_scopes,
      v_invalid_participants,
      v_participant_expected_rows
    from participants;

  if v_participant_rows <>
       v_run.participant_count::bigint
     or v_distinct_fact_scopes <>
          v_participant_rows
     or v_invalid_participants <> 0
     or v_participant_expected_rows <>
          v_run.expected_rows::bigint
  then
    raise exception using
      message =
        'DRV2SC_PARTICIPANT_CONTRACT_CONFLICT: frozen participant contract is invalid';
  end if;

  v_expected_dates :=
    (v_run.through_date - v_run.start_date)::bigint + 1;

  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id,
      p.expected_rows
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  coverage as (
    select
      pc.provider,
      pc.external_account_id,
      pc.expected_rows,
      count(fp.date)::bigint as covered_dates,
      coalesce(sum(fp.row_count), 0)::bigint as partition_rows
    from participants as pc
    left join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
    group by
      pc.provider,
      pc.external_account_id,
      pc.expected_rows
  )
  select count(*)::bigint
    into v_bad_coverage
    from coverage
   where covered_dates <> v_expected_dates
      or partition_rows <> expected_rows;

  if v_bad_coverage <> 0 then
    raise exception using
      message =
        'DRV2SC_FACT_COVERAGE_CHANGED: durable partition coverage changed before completion';
  end if;

  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  scoped_partitions as (
    select
      fp.provider,
      fp.external_account_id,
      fp.date,
      fp.source_job_id,
      fp.source_job_created_at,
      fp.row_count
    from participants as pc
    join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
  )
  select
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              jsonb_build_array(
                provider,
                external_account_id,
                date::text,
                source_job_id::text,
                extract(
                  epoch from source_job_created_at
                )::text,
                row_count
              )::text,
              E'\n'
              order by
                date,
                provider,
                external_account_id,
                source_job_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_source_fingerprint
    from scoped_partitions;

  if v_run.source_fingerprint is null then
    if v_run.expected_rows <> 0
       or v_run.status <> 'prepared'
    then
      raise exception using
        message =
          'DRV2SC_SOURCE_FINGERPRINT_CONFLICT: nonzero/open run was never materialized';
    end if;

    update public.daily_report_v2_snapshot_runs as r
       set source_fingerprint = v_source_fingerprint,
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status = 'prepared'
       and r.expected_rows = 0
       and r.source_fingerprint is null;

    if not found then
      raise exception using
        message =
          'DRV2SC_SOURCE_FINGERPRINT_CONFLICT: zero-row source fingerprint could not be frozen';
    end if;

    v_run.source_fingerprint :=
      v_source_fingerprint;
  elsif v_run.source_fingerprint
          is distinct from v_source_fingerprint
  then
    raise exception using
      message =
        'DRV2SC_SOURCE_GENERATION_CHANGED: canonical partition generation changed before completion';
  end if;

  select ri.*
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_run.snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message =
        'DRV2SC_INGESTION_NOT_FOUND: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_run.workspace_id
     or v_ingestion.report_id <> v_run.report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in (
          'processing',
          'success'
        )
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by
          is distinct from v_run.created_by
     or v_ingestion.row_count
          is distinct from v_run.expected_rows
  then
    raise exception using
      message =
        'DRV2SC_MATERIALIZATION_INCOMPLETE: ingestion checkpoint is incomplete';
  end if;

  if v_run.expected_rows > 0
     and v_run.status = 'prepared'
  then
    raise exception using
      message =
        'DRV2SC_RUN_NOT_MATERIALIZED: nonzero run never entered materializing';
  end if;

  if v_run.status = 'ready'
     and v_ingestion.status <> 'success'
  then
    raise exception using
      message =
        'DRV2SC_READY_CONFLICT: ready run does not own a successful ingestion';
  end if;

  if v_run.status in (
       'prepared',
       'materializing'
     )
     and v_ingestion.status <> 'processing'
  then
    raise exception using
      message =
        'DRV2SC_PROCESSING_CONFLICT: open run ingestion is not processing';
  end if;

  /*
   * Partition row_count is compact durable authority, but completion still
   * needs one bounded witness that the canonical fact source has no row beyond
   * expected_rows. This closes both:
   *   - N expected partition rows but N+1 canonical fact rows
   *   - authoritative zero-row partition with an impossible hidden fact row
   *
   * OFFSET expected_rows + LIMIT 1 is bounded and avoids a full fact rescan.
   */
  if exists (
    with participants as (
      select
        p.provider,
        btrim(p.external_account_id) as external_account_id
      from jsonb_to_recordset(v_run.participant_contract)
        as p(
          connection_id uuid,
          provider text,
          external_account_id text,
          expected_rows bigint
        )
    )
    select 1
      from participants as pc
      join public.media_sync_fact_rows as f
        on f.workspace_id = v_run.workspace_id
       and f.advertiser_id = v_run.advertiser_id
       and f.provider = pc.provider
       and f.external_account_id = pc.external_account_id
       and f.date >= v_run.start_date
       and f.date <= v_run.through_date
     order by
       f.date,
       f.provider,
       f.external_account_id,
       f.row_key
     offset v_run.expected_rows
     limit 1
  ) then
    raise exception using
      message =
        'DRV2SC_FACT_SOURCE_EXTRA_ROWS: canonical fact source exceeds frozen expected_rows';
  end if;

  /*
   * Sequential exact batch verification + atomic row_count checkpoint proves
   * every expected destination range was committed. Only bounded indexed
   * witnesses are used here; no full fresh report_rows rescan.
   */
  if exists (
    select 1
      from public.report_rows as rr
     where rr.report_id = v_run.report_id
       and rr.ingestion_id = v_run.snapshot_ingestion_id
       and (
         rr.row_index < 0
         or rr.row_index >= v_run.expected_rows
       )
     limit 1
  ) then
    raise exception using
      message =
        'DRV2SC_MATERIALIZATION_CONFLICT: snapshot contains out-of-range report_rows';
  end if;

  if v_run.expected_rows = 0
     and exists (
       select 1
         from public.report_rows as rr
        where rr.report_id = v_run.report_id
          and rr.ingestion_id = v_run.snapshot_ingestion_id
        limit 1
     )
  then
    raise exception using
      message =
        'DRV2SC_MATERIALIZATION_CONFLICT: zero-row snapshot contains report_rows';
  end if;

  if v_run.expected_rows > 0
     and (
       not exists (
         select 1
           from public.report_rows as rr
          where rr.report_id = v_run.report_id
            and rr.ingestion_id = v_run.snapshot_ingestion_id
            and rr.row_index = 0
       )
       or not exists (
         select 1
           from public.report_rows as rr
          where rr.report_id = v_run.report_id
            and rr.ingestion_id = v_run.snapshot_ingestion_id
            and rr.row_index =
                  v_run.expected_rows - 1
       )
     )
  then
    raise exception using
      message =
        'DRV2SC_MATERIALIZATION_CONFLICT: snapshot endpoint witnesses are missing';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  if v_run.status = 'ready' then
    v_idempotent :=
      true;
  else
    update public.report_ingestions as ri
       set status = 'success',
           row_count = v_run.expected_rows,
           error = null,
           updated_at = pg_catalog.clock_timestamp()
     where ri.id = v_run.snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count = v_run.expected_rows
       and ri.error is null;

    if not found then
      raise exception using
        message =
          'DRV2SC_COMPLETION_CONFLICT: snapshot ingestion could not be completed';
    end if;

    update public.daily_report_v2_snapshot_runs as r
       set status = 'ready',
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status in (
         'prepared',
         'materializing'
       )
       and r.source_fingerprint =
             v_source_fingerprint;

    if not found then
      raise exception using
        message =
          'DRV2SC_COMPLETION_CONFLICT: snapshot run could not enter ready state';
    end if;

    v_run.status :=
      'ready';

    v_idempotent :=
      false;
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_run.report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message =
        'DRV2SC_POINTER_CHANGED: report pointers changed during completion';
  end if;

  return query
  select
    v_run.id,
    v_run.report_id,
    v_run.snapshot_ingestion_id,
    v_run.expected_rows::bigint,
    v_source_fingerprint,
    v_run.status,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_creative_metadata_cache_v1(p_account_key text, p_keys text[], p_max_requests integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '2000ms'
 SET lock_timeout TO '500ms'
AS $function$
declare a etrylue_creative_cache_v1.accounts%rowtype; n timestamptz; cached jsonb; found_count integer;
 state text; token uuid; retry timestamptz; deadline timestamptz;
begin
 if p_account_key is null or p_account_key !~ '^[0-9a-f]{64}$' or p_keys is null or cardinality(p_keys) not between 1 and 20
  or p_max_requests is null or p_max_requests not between 1 and 40
  or exists(select 1 from unnest(p_keys) k where k is null or k !~ '^[0-9a-f]{64}$')
  or (select count(distinct k) from unnest(p_keys) k)<>cardinality(p_keys) then raise exception 'INVALID_CACHE_INPUT'; end if;
 insert into etrylue_creative_cache_v1.accounts(account_key) values(p_account_key) on conflict do nothing;
 select * into strict a from etrylue_creative_cache_v1.accounts where account_key=p_account_key for update;
 n:=clock_timestamp();
 -- Bounded old-generation cleanup; never removes fresh values on a failed refresh.
 delete from etrylue_creative_cache_v1.entries where (account_key,cache_key) in
  (select account_key,cache_key from etrylue_creative_cache_v1.entries where account_key=p_account_key and expires_at<n-interval '1 day' order by expires_at limit 100);
 select coalesce(jsonb_agg(jsonb_build_object('key',cache_key,'metadata',payload,'expiresAt',floor(extract(epoch from expires_at)*1000)) order by cache_key),'[]'::jsonb),count(*)
 into cached,found_count from etrylue_creative_cache_v1.entries where account_key=p_account_key and cache_key=any(p_keys) and expires_at>n;
 if found_count=cardinality(p_keys) then state:='hit';
 elsif a.lease_until>n then state:='busy';retry:=a.lease_until;
 elsif a.next_allowed_at>n then state:='cooldown';retry:=a.next_allowed_at;
 else
  if a.window_start+interval '1 hour'<=n then a.window_start:=n;a.reserved_requests:=0;end if;
  if a.reserved_requests+p_max_requests>120 then state:='budget';retry:=a.window_start+interval '1 hour';
  else
   state:='leader';token:=gen_random_uuid();deadline:=n+interval '60 seconds';
   update etrylue_creative_cache_v1.accounts set lease_token=token,lease_until=deadline,lease_keys=p_keys,
    window_start=a.window_start,reserved_requests=a.reserved_requests+p_max_requests where account_key=p_account_key;
  end if;
 end if;
 return jsonb_build_object('status',state,'token',token,'leaseUntil',case when deadline is null then 0 else floor(extract(epoch from deadline)*1000) end,
  'now',floor(extract(epoch from n)*1000),'retryAt',case when retry is null then 0 else floor(extract(epoch from retry)*1000) end,'entries',cached);
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_creative_metadata_cache_due_v1(p_account_key text, p_keys text[], p_max_requests integer, p_refresh_ahead_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '2000ms'
 SET lock_timeout TO '500ms'
AS $function$
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

CREATE OR REPLACE FUNCTION public.claim_meta_ads_daily_run_v1(p_connection_id uuid, p_target_date date, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
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
end; $function$;

CREATE OR REPLACE FUNCTION public.claim_meta_ads_collection_task_v1(p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
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
end; $function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(ws uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select exists (
  select 1
  from public.workspace_members wm
  where wm.workspace_id = ws
    and wm.user_id = uid
);
$function$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(ws uuid, uid uuid, min_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select exists (
  select 1
  from public.workspace_members wm
  where wm.workspace_id = ws
    and wm.user_id = uid
    and public.role_level(wm.role) >= public.role_level(min_role)
);
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_create_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare default_company_id uuid; customer_company_id uuid;
begin
  select u.* into new from auth.users u where u.id=new.id;
  if not found then return null; end if;
  if new.raw_app_meta_data->>'etrylue_customer_version' = '1' then
    insert into etrylue_customer_private.accounts(user_id,company_name,contact_name,tenant_type)
    values(new.id,new.raw_app_meta_data->>'company_name',new.raw_app_meta_data->>'contact_name',new.raw_app_meta_data->>'tenant_type') returning company_id into customer_company_id;
    insert into etrylue_customer_private.scopes values(new.id,customer_company_id);
    return new;
  end if;
  -- Deploy the server-side invite marker BEFORE installing this migration.
  if new.raw_app_meta_data->>'etrylue_invite_version' is distinct from '1' then
    raise exception 'CUSTOMER_REGISTRATION_ROUTE_REQUIRED';
  end if;
  select w.company_id into customer_company_id from public.workspaces w
    join etrylue_customer_private.accounts a on a.company_id=w.company_id
    where w.id::text=new.raw_app_meta_data->>'invited_workspace_id';
  if found then
    insert into etrylue_customer_private.scopes values(new.id,customer_company_id);
    insert into public.profiles(id,company_id,name,email)
      values(new.id,customer_company_id,coalesce(new.raw_user_meta_data->>'name','New User'),new.email);
    return new;
  end if;
  -- Existing legacy invitation profile behavior is preserved.
  select c.id into default_company_id from public.companies c where c.name='000' limit 1;
  if default_company_id is null then raise exception 'default company(000) not found'; end if;
  insert into public.profiles(id,company_id,name)
  values(new.id,default_company_id,coalesce(new.raw_user_meta_data->>'name','New User'))
  on conflict(id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_report_rows_batch(p_report_id uuid, p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted integer;
begin
  delete from public.report_rows
  where ctid in (
    select ctid
    from public.report_rows
    where report_id = p_report_id
    limit greatest(1, least(p_limit, 10000))
  );

  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_media_sync_job(p_payload jsonb)
 RETURNS TABLE(job jsonb, snapshot_ingestion_id uuid, current_ingestion_id uuid, published_ingestion_id uuid, row_count bigint, staging_fingerprint text, materialized_fingerprint text, finished_at timestamp with time zone, connection_id uuid, connection_last_sync_at timestamp with time zone, connection_updated boolean, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;
  v_connection public.media_connections%rowtype;
  v_projection public.media_sync_report_projections%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_provider text;
  v_external_account_id text;
  v_date_from date;
  v_date_to date;
  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;
  v_expected_rows bigint;

  v_completion_fingerprint text;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;
  v_previous_ingestion_before uuid;
  v_snapshot_ingestion_before uuid;
  v_raw_rows_before integer;
  v_normalized_rows_before integer;
  v_inserted_rows_before integer;
  v_failed_rows_before integer;
  v_error_detail_before jsonb;

  v_finished_at timestamptz;
  v_connection_updated boolean := false;
  v_idempotent boolean := false;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using message = 'MSF_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSF_INVALID_INPUT: invalid UUID input';
  end if;

  if p_payload ? 'previous_ingestion_id'
     and p_payload->'previous_ingestion_id' <> 'null'::jsonb
     and coalesce(p_payload->>'previous_ingestion_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSF_INVALID_INPUT: previous_ingestion_id is invalid';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using message = 'MSF_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_provider := btrim(p_payload->>'provider');
    v_external_account_id := btrim(p_payload->>'external_account_id');
    v_date_from := (p_payload->>'date_from')::date;
    v_date_to := (p_payload->>'date_to')::date;
    v_previous_ingestion_id := nullif(p_payload->>'previous_ingestion_id', '')::uuid;
    v_snapshot_ingestion_id := (p_payload->>'snapshot_ingestion_id')::uuid;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using message = 'MSF_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0
     or (
       v_expected_rows = 0
       and v_provider <> 'naver_searchad'
     ) then
    raise exception using message = 'MSF_INVALID_INPUT: payload values are invalid';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using message = 'MSF_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status = 'done' then
    v_idempotent := true;
  elsif v_job.status = 'processing' then
    v_idempotent := false;
  else
    raise exception using message = 'MSF_JOB_NOT_PROCESSING: media sync job must be processing or already done';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using message = 'MSF_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.id <> v_job_id
     or v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to then
    raise exception using message = 'MSF_SCOPE_MISMATCH: job scope does not match the request';
  end if;

  /*
   * V2-B downstream projection authority.
   *
   * Lock order is intentionally JOB FOR UPDATE -> PROJECTION FOR SHARE -> REPORT.
   * The projection owns the downstream previous/snapshot pointer binding.
   * The media_sync_job columns remain compatibility mirrors and the payload
   * pointer values remain request assertions; every copy must match exactly.
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report projection was not found';
  end if;

  if v_projection.media_sync_job_id <> v_job_id
     or v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.created_by is distinct from v_job.created_by
     or v_projection.previous_ingestion_id is distinct from v_job.previous_ingestion_id
     or v_projection.snapshot_ingestion_id is distinct from v_job.snapshot_ingestion_id
     or v_projection.previous_ingestion_id is distinct from v_previous_ingestion_id
     or v_projection.snapshot_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report projection authority does not match the job and request';
  end if;

  v_previous_ingestion_id := v_projection.previous_ingestion_id;
  v_snapshot_ingestion_id := v_projection.snapshot_ingestion_id;

  if v_job.mode <> 'snapshot_replace' then
    raise exception using message = 'MSF_SCOPE_MISMATCH: unsupported media sync mode';
  end if;

  if v_job.snapshot_ingestion_id is null then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: media sync job has no materialized snapshot';
  end if;

  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: final checkpoint counts do not match';
  end if;

  if v_idempotent then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.error is not null then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: completed job state is inconsistent';
    end if;
    v_finished_at := v_job.finished_at;
  end if;

  v_previous_ingestion_before := v_job.previous_ingestion_id;
  v_snapshot_ingestion_before := v_job.snapshot_ingestion_id;
  v_raw_rows_before := v_job.raw_rows;
  v_normalized_rows_before := v_job.normalized_rows;
  v_inserted_rows_before := v_job.inserted_rows;
  v_failed_rows_before := v_job.failed_rows;
  v_error_detail_before := v_job.error_detail;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using message = 'MSF_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id then
    raise exception using message = 'MSF_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;

  if v_report.current_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: report current pointer does not use the materialized snapshot';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for update;

  if not found then
    raise exception using message = 'MSF_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> v_provider
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active' then
    raise exception using message = 'MSF_SCOPE_MISMATCH: media connection scope does not match the job';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id;

  if not found then
    raise exception using message = 'MSF_SNAPSHOT_NOT_ACTIVE: active report ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status <> 'success'
     or v_ingestion.row_count is distinct from v_expected_rows::integer
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: active report ingestion does not match the job';
  end if;

  /*
   * Constant-time finalization verification.
   *
   * prepare validates complete staging integrity. Every bounded materialization
   * batch then compares staging with report_rows exactly and advances
   * report_ingestions.row_count in the same transaction. Completion succeeds
   * only after that checkpoint reaches expected_rows and marks the API
   * ingestion successful.
   *
   * Re-reading all fresh staging/report_rows rows here would repeat work that
   * has already committed and can exceed the API role statement_timeout.
   */
  if v_ingestion.row_count
       is distinct from v_expected_rows::integer
     or v_ingestion.status <> 'success'
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSF_SNAPSHOT_INVALID: completed materialization checkpoint is invalid';
  end if;

  /*
   * Contract-compatible deterministic completion token.
   * This is identical to the constant-time token returned by
   * complete_media_sync_snapshot_materialization().
   */
  v_completion_fingerprint :=
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          v_job_id::text || ':' ||
          v_report_id::text || ':' ||
          v_snapshot_ingestion_id::text || ':' ||
          v_expected_rows::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text || ':' ||
          '0' || ':' ||
          (v_expected_rows - 1)::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

  if not v_idempotent then
    /*
     * Macro 3-A3 execution-finalization authority.
     *
     * Finalization remains a single execution/job transition owned by the
     * primary projection compatibility binding. Before processing -> done,
     * every report projection for this job must already be independently
     * activated to its own projection-owned snapshot, and that snapshot
     * ingestion must be complete and successful.
     *
     * The job row is already locked FOR UPDATE above. Activation uses the
     * same job-first lock order, so this gate serializes against activation
     * for the same execution without changing report pointer ownership.
     */
    if exists (
      select 1
      from public.media_sync_report_projections as fp
      left join public.reports as fr
        on fr.id = fp.report_id
      left join public.report_ingestions as fi
        on fi.id = fp.snapshot_ingestion_id
      where fp.media_sync_job_id = v_job_id
        and (
          fp.workspace_id <> v_workspace_id
          or fp.advertiser_id <> v_advertiser_id
          or fp.created_by is distinct from v_job.created_by
          or fr.id is null
          or fr.workspace_id <> v_workspace_id
          or fr.advertiser_id is distinct from v_advertiser_id
          or fr.current_ingestion_id
               is distinct from fp.snapshot_ingestion_id
          or fi.id is null
          or fi.workspace_id <> v_workspace_id
          or fi.report_id <> fp.report_id
          or fi.kind <> 'api'
          or fi.status <> 'success'
          or fi.row_count is distinct from v_expected_rows::integer
          or fi.csv_path is not null
          or fi.error is not null
          or fi.created_by is distinct from v_job.created_by
        )
    ) then
      raise exception using
        message = 'MSF_PROJECTIONS_NOT_ACTIVE: every report projection must be activated before job finalization';
    end if;

    v_finished_at := pg_catalog.clock_timestamp();

    update public.media_sync_jobs as j
       set status = 'done',
           progress = 100,
           finished_at = v_finished_at,
           error = null,
           updated_at = v_finished_at
     where j.id = v_job_id
       and j.status = 'processing'
       and j.snapshot_ingestion_id = v_snapshot_ingestion_id
       and j.previous_ingestion_id is not distinct from v_previous_ingestion_id
       and j.finished_at is null;

    if not found then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: media sync job changed during finalization';
    end if;
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.error is not null
     or v_job.previous_ingestion_id is distinct from v_previous_ingestion_before
     or v_job.snapshot_ingestion_id is distinct from v_snapshot_ingestion_before
     or v_job.raw_rows is distinct from v_raw_rows_before
     or v_job.normalized_rows is distinct from v_normalized_rows_before
     or v_job.inserted_rows is distinct from v_inserted_rows_before
     or v_job.failed_rows is distinct from v_failed_rows_before
     or v_job.error_detail is distinct from v_error_detail_before then
    raise exception using message = 'MSF_FINALIZATION_CONFLICT: finalized job violates the contract';
  end if;

  v_finished_at := v_job.finished_at;

  if v_connection.last_sync_at is null
     or v_connection.last_sync_at < v_finished_at then
    update public.media_connections as c
       set last_sync_at = v_finished_at,
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
     where c.id = v_connection_id
       and c.workspace_id = v_workspace_id
       and c.advertiser_id = v_advertiser_id
       and c.provider = v_provider
       and c.external_account_id = v_external_account_id
       and c.status = 'active'
       and (
         c.last_sync_at is null
         or c.last_sync_at < v_finished_at
       )
     returning * into v_connection;

    if not found then
      raise exception using message = 'MSF_FINALIZATION_CONFLICT: media connection changed during finalization';
    end if;

    v_connection_updated := true;
  else
    v_connection_updated := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id is distinct from v_current_ingestion_before
     or v_report.current_ingestion_id is distinct from v_snapshot_ingestion_id
     or v_report.published_ingestion_id is distinct from v_published_ingestion_before then
    raise exception using message = 'MSF_FINALIZATION_CONFLICT: report pointer changed during finalization';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
    v_report.current_ingestion_id,
    v_report.published_ingestion_id,
    v_expected_rows,
    v_completion_fingerprint,
    v_completion_fingerprint,
    v_finished_at,
    v_connection.id,
    v_connection.last_sync_at,
    v_connection_updated,
    v_idempotent;
end;
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.etrylue_v2_assign_media_connection_tenant_scope()
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
        'V2_TENANT_SCOPE_INVALID: media connection workspace does not exist';
  end if;


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
        'V2_TENANT_SCOPE_INVALID: media connection advertiser does not exist';
  end if;


  if v_advertiser_workspace_id is distinct from new.workspace_id then
    raise exception using
      errcode = '23514',
      message =
        'V2_TENANT_SCOPE_INVALID: media connection and advertiser workspace mismatch';
  end if;


  if v_advertiser_tenant_id is distinct from v_workspace_tenant_id then
    raise exception using
      errcode = '23514',
      message =
        'V2_TENANT_SCOPE_INVALID: media connection and advertiser tenant mismatch';
  end if;


  new.tenant_id := v_workspace_tenant_id;

  return new;
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.finalize_naver_fact_snapshot_job(p_payload jsonb)
 RETURNS TABLE(job jsonb, finished_at timestamp with time zone, connection_id uuid, connection_last_sync_at timestamp with time zone, connection_updated boolean, projection_count bigint, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_connection public.media_connections%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_external_account_id text;

  v_projection_payload jsonb;
  v_report_id uuid;
  v_snapshot_ingestion_id uuid;
  v_projection_start date;
  v_projection_end date;
  v_expected_rows bigint;

  v_payload_projection_count bigint;
  v_payload_distinct_report_count bigint;
  v_db_projection_count bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;
  v_fact_rows bigint;

  v_finished_at timestamptz;
  v_connection_updated boolean := false;
  v_idempotent boolean := false;

  v_previous_ingestion_before uuid;
  v_snapshot_ingestion_before uuid;
  v_raw_rows_before integer;
  v_normalized_rows_before integer;
  v_inserted_rows_before integer;
  v_failed_rows_before integer;
  v_error_detail_before jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFF_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFF_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or jsonb_typeof(p_payload->'projections') <> 'array'
     or jsonb_array_length(p_payload->'projections') = 0
  then
    raise exception using
      message = 'MSFF_INVALID_INPUT: external account and non-empty projections are required';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_payload->'projections') as item(value)
     where jsonb_typeof(item.value) <> 'object'
        or coalesce(item.value->>'report_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(item.value->>'snapshot_ingestion_id', '') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(item.value->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item.value->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item.value->>'expected_rows', '') !~ '^[0-9]+$'
  ) then
    raise exception using
      message = 'MSFF_INVALID_INPUT: projection payload is invalid';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_external_account_id := btrim(p_payload->>'external_account_id');
  exception
    when others then
      raise exception using
        message = 'MSFF_INVALID_INPUT: payload value could not be parsed';
  end;

  /*
   * Job-first locking serializes prepare / activation / finalization for this
   * execution and prevents projection-set growth after the exact-set gate.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFF_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status = 'done' then
    v_idempotent := true;
  elsif v_job.status = 'processing' then
    v_idempotent := false;
  else
    raise exception using
      message = 'MSFF_JOB_NOT_FINALIZABLE: media sync job must be processing or already done';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFF_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
     or v_job.snapshot_ingestion_id is null
  then
    raise exception using
      message = 'MSFF_SCOPE_MISMATCH: job scope is not full-projection safe';
  end if;

  if v_idempotent then
    if v_job.progress <> 100
       or v_job.finished_at is null
       or v_job.error is not null
    then
      raise exception using
        message = 'MSFF_FINALIZATION_CONFLICT: completed job state is inconsistent';
    end if;
  else
    if v_job.finished_at is not null then
      raise exception using
        message = 'MSFF_FINALIZATION_CONFLICT: processing job already has finished_at';
    end if;
  end if;

  v_previous_ingestion_before := v_job.previous_ingestion_id;
  v_snapshot_ingestion_before := v_job.snapshot_ingestion_id;
  v_raw_rows_before := v_job.raw_rows;
  v_normalized_rows_before := v_job.normalized_rows;
  v_inserted_rows_before := v_job.inserted_rows;
  v_failed_rows_before := v_job.failed_rows;
  v_error_detail_before := v_job.error_detail;

  select
    jsonb_array_length(p_payload->'projections')::bigint,
    count(distinct (item.value->>'report_id'))::bigint
    into
      v_payload_projection_count,
      v_payload_distinct_report_count
    from jsonb_array_elements(p_payload->'projections') as item(value);

  if v_payload_projection_count <> v_payload_distinct_report_count then
    raise exception using
      message = 'MSFF_PROJECTION_SET_CONFLICT: duplicate report projection payload';
  end if;

  select count(*)::bigint
    into v_db_projection_count
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id;

  if v_db_projection_count = 0
     or v_db_projection_count <> v_payload_projection_count
  then
    raise exception using
      message = 'MSFF_PROJECTION_SET_CONFLICT: payload projection set does not match DB projection set';
  end if;

  /*
   * Validate every payload projection independently. Different fanout reports
   * may have different period ranges and row counts.
   */
  for v_projection_payload in
    select item.value
      from jsonb_array_elements(p_payload->'projections') as item(value)
  loop
    begin
      v_report_id :=
        (v_projection_payload->>'report_id')::uuid;

      v_snapshot_ingestion_id :=
        (v_projection_payload->>'snapshot_ingestion_id')::uuid;

      v_projection_start :=
        (v_projection_payload->>'projection_start')::date;

      v_projection_end :=
        (v_projection_payload->>'projection_end')::date;

      v_expected_rows :=
        (v_projection_payload->>'expected_rows')::bigint;
    exception
      when others then
        raise exception using
          message = 'MSFF_INVALID_INPUT: projection payload value could not be parsed';
    end;

    if v_projection_start > v_projection_end
       or v_expected_rows < 0
       or v_expected_rows > 2147483647
    then
      raise exception using
        message = 'MSFF_INVALID_INPUT: projection values are invalid';
    end if;

    select *
      into v_projection
      from public.media_sync_report_projections as p
     where p.media_sync_job_id = v_job_id
       and p.report_id = v_report_id
     for share;

    if not found then
      raise exception using
        message = 'MSFF_PROJECTION_SET_CONFLICT: projection payload report was not prepared';
    end if;

    if v_projection.workspace_id <> v_workspace_id
       or v_projection.advertiser_id <> v_advertiser_id
       or v_projection.report_id <> v_report_id
       or v_projection.snapshot_ingestion_id
            is distinct from v_snapshot_ingestion_id
       or v_projection.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFF_PROJECTION_CONFLICT: projection authority is invalid';
    end if;

    if v_report_id = v_job.report_id
       and (
         v_projection.previous_ingestion_id
           is distinct from v_job.previous_ingestion_id
         or v_projection.snapshot_ingestion_id
           is distinct from v_job.snapshot_ingestion_id
       )
    then
      raise exception using
        message = 'MSFF_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
    end if;

    select *
      into v_report
      from public.reports as r
     where r.id = v_report_id
     for share;

    if not found then
      raise exception using
        message = 'MSFF_REPORT_NOT_FOUND: projection report was not found';
    end if;

    if v_report.workspace_id <> v_workspace_id
       or v_report.advertiser_id is distinct from v_advertiser_id
       or v_report.current_ingestion_id
            is distinct from v_snapshot_ingestion_id
    then
      raise exception using
        message = 'MSFF_PROJECTION_NOT_ACTIVE: report does not use its projection snapshot';
    end if;

    if coalesce(
      v_report.draft_period_start,
      v_report.period_start,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_from}'
        ),
        ''
      )::date
    )
         is distinct from v_projection_start
       or (
         coalesce(
           v_report.draft_period_end,
           v_report.period_end,
           nullif(
             btrim(
               v_report.meta #>> '{media_sync,date_to}'
             ),
             ''
           )::date
         ) is null
         or least(
           coalesce(
             v_report.draft_period_end,
             v_report.period_end,
             nullif(
               btrim(
                 v_report.meta #>> '{media_sync,date_to}'
               ),
               ''
             )::date
           ),
           v_job.date_to
         ) is distinct from v_projection_end
       )
    then
      raise exception using
        message = 'MSFF_PERIOD_CHANGED: projection report period changed before finalization';
    end if;

    select *
      into v_ingestion
      from public.report_ingestions as ri
     where ri.id = v_snapshot_ingestion_id
     for share;

    if not found then
      raise exception using
        message = 'MSFF_INGESTION_NOT_FOUND: active projection ingestion was not found';
    end if;

    if v_ingestion.workspace_id <> v_workspace_id
       or v_ingestion.report_id <> v_report_id
       or v_ingestion.kind <> 'api'
       or v_ingestion.status <> 'success'
       or v_ingestion.row_count is distinct from v_expected_rows::integer
       or v_ingestion.csv_path is not null
       or v_ingestion.error is not null
       or v_ingestion.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFF_SNAPSHOT_INVALID: active projection ingestion is invalid';
    end if;

    v_expected_dates :=
      (v_projection_end - v_projection_start)::bigint + 1;

    select
      count(*)::bigint,
      coalesce(sum(p.row_count), 0)::bigint
      into
        v_partition_dates,
        v_partition_rows
      from public.media_sync_fact_partitions as p
     where p.workspace_id = v_workspace_id
       and p.advertiser_id = v_advertiser_id
       and p.provider = 'naver_searchad'
       and p.external_account_id = v_external_account_id
       and p.date >= v_projection_start
       and p.date <= v_projection_end;

    if v_partition_dates <> v_expected_dates
       or v_partition_rows <> v_expected_rows
    then
      raise exception using
        message = 'MSFF_FACT_COVERAGE_CHANGED: canonical partition authority changed before finalization';
    end if;

    select count(*)::bigint
      into v_fact_rows
      from public.media_sync_fact_rows as f
     where f.workspace_id = v_workspace_id
       and f.advertiser_id = v_advertiser_id
       and f.provider = 'naver_searchad'
       and f.external_account_id = v_external_account_id
       and f.date >= v_projection_start
       and f.date <= v_projection_end;

    if v_fact_rows <> v_expected_rows then
      raise exception using
        message = 'MSFF_FACT_COUNT_MISMATCH: canonical fact row count changed before finalization';
    end if;
  end loop;

  /*
   * Exact-set defense in the opposite direction: every DB projection must have
   * exactly one payload entry.
   */
  if exists (
    select 1
      from public.media_sync_report_projections as p
     where p.media_sync_job_id = v_job_id
       and not exists (
         select 1
           from jsonb_array_elements(p_payload->'projections') as item(value)
          where item.value->>'report_id' = p.report_id::text
       )
  ) then
    raise exception using
      message = 'MSFF_PROJECTION_SET_CONFLICT: DB projection is missing from payload';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for update;

  if not found then
    raise exception using
      message = 'MSFF_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> 'naver_searchad'
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      message = 'MSFF_SCOPE_MISMATCH: media connection does not match the job';
  end if;

  if not v_idempotent then
    v_finished_at := pg_catalog.clock_timestamp();

    update public.media_sync_jobs as j
       set status = 'done',
           progress = 100,
           finished_at = v_finished_at,
           error = null,
           updated_at = v_finished_at
     where j.id = v_job_id
       and j.status = 'processing'
       and j.finished_at is null
       and j.snapshot_ingestion_id is not distinct from v_snapshot_ingestion_before
       and j.previous_ingestion_id is not distinct from v_previous_ingestion_before
       and j.raw_rows is not distinct from v_raw_rows_before
       and j.normalized_rows is not distinct from v_normalized_rows_before
       and j.inserted_rows is not distinct from v_inserted_rows_before
       and j.failed_rows is not distinct from v_failed_rows_before
       and j.error_detail is not distinct from v_error_detail_before;

    if not found then
      raise exception using
        message = 'MSFF_FINALIZATION_CONFLICT: media sync job changed during finalization';
    end if;
  else
    v_finished_at := v_job.finished_at;
  end if;

  /*
   * Full projection completion owns connection freshness. Fact-only chunk
   * completion intentionally does not update this field.
   */
  if v_connection.last_sync_at is null
     or v_connection.last_sync_at < v_finished_at
  then
    update public.media_connections as c
       set last_sync_at = v_finished_at,
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
     where c.id = v_connection_id
       and c.workspace_id = v_workspace_id
       and c.advertiser_id = v_advertiser_id
       and c.provider = 'naver_searchad'
       and c.external_account_id = v_external_account_id
       and c.status = 'active'
       and (
         c.last_sync_at is null
         or c.last_sync_at < v_finished_at
       )
    returning *
      into v_connection;

    if not found then
      raise exception using
        message = 'MSFF_FINALIZATION_CONFLICT: media connection changed during finalization';
    end if;

    v_connection_updated := true;
  else
    v_connection_updated := false;
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  if v_job.status <> 'done'
     or v_job.progress <> 100
     or v_job.finished_at is null
     or v_job.error is not null
     or v_job.previous_ingestion_id
          is distinct from v_previous_ingestion_before
     or v_job.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_before
     or v_job.raw_rows is distinct from v_raw_rows_before
     or v_job.normalized_rows is distinct from v_normalized_rows_before
     or v_job.inserted_rows is distinct from v_inserted_rows_before
     or v_job.failed_rows is distinct from v_failed_rows_before
     or v_job.error_detail is distinct from v_error_detail_before
  then
    raise exception using
      message = 'MSFF_FINALIZATION_CONFLICT: finalized job violates the protected-state contract';
  end if;

  v_finished_at := v_job.finished_at;

  return query
  select
    to_jsonb(v_job),
    v_finished_at,
    v_connection.id,
    v_connection.last_sync_at,
    v_connection_updated,
    v_db_projection_count,
    v_idempotent;
end;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.materialize_daily_report_v2_combined_snapshot_batch(p_payload jsonb)
 RETURNS TABLE(run_id uuid, report_id uuid, snapshot_ingestion_id uuid, expected_rows bigint, batch_start bigint, batch_end_exclusive bigint, expected_batch_rows bigint, inserted_rows bigint, materialized_batch_rows bigint, next_row_index bigint, complete boolean, status text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
#variable_conflict use_column
declare
  v_run public.daily_report_v2_snapshot_runs%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_run_id uuid;
  v_report_id uuid;

  v_batch_start bigint;
  v_batch_size bigint;
  v_batch_end_exclusive bigint;
  v_expected_batch_rows bigint;

  v_expected_dates bigint;

  v_participant_rows bigint;
  v_distinct_fact_scopes bigint;
  v_invalid_participants bigint;
  v_participant_expected_rows bigint;
  v_bad_coverage bigint;

  v_source_fingerprint text;

  v_checkpoint_before bigint;
  v_source_batch_rows bigint;
  v_inserted_rows bigint := 0;
  v_materialized_batch_rows bigint;
  v_batch_mismatch_rows bigint;
  v_next_row_index bigint;
  v_complete boolean;
  v_idempotent boolean := false;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      message =
        'DRV2SM_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'run_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'batch_start', '') !~
       '^[0-9]+$'
     or coalesce(p_payload->>'batch_size', '') !~
       '^[0-9]+$'
  then
    raise exception using
      message =
        'DRV2SM_INVALID_INPUT: materialization values are invalid';
  end if;

  begin
    v_run_id :=
      (p_payload->>'run_id')::uuid;

    v_batch_start :=
      (p_payload->>'batch_start')::bigint;

    v_batch_size :=
      (p_payload->>'batch_size')::bigint;
  exception
    when others then
      raise exception using
        message =
          'DRV2SM_INVALID_INPUT: materialization values could not be parsed';
  end;

  if v_batch_start < 0
     or v_batch_size <= 0
     or v_batch_size > 5000
  then
    raise exception using
      message =
        'DRV2SM_INVALID_INPUT: materialization batch range is invalid';
  end if;

  /*
   * Read the report id without locking, then lock REPORT -> RUN -> INGESTION.
   * This matches prepare's report-first authority and avoids run/report
   * lock-order inversion.
   */
  select r.report_id
    into v_report_id
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id;

  if not found then
    raise exception using
      message =
        'DRV2SM_RUN_NOT_FOUND: combined snapshot run was not found';
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message =
        'DRV2SM_REPORT_NOT_FOUND: report was not found';
  end if;

  select r.*
    into v_run
    from public.daily_report_v2_snapshot_runs as r
   where r.id = v_run_id
   for update;

  if not found
     or v_run.report_id <> v_report_id
  then
    raise exception using
      message =
        'DRV2SM_RUN_CONFLICT: run identity changed before lock';
  end if;

  if v_run.status not in (
       'prepared',
       'materializing',
       'ready'
     )
  then
    raise exception using
      message =
        'DRV2SM_RUN_NOT_MATERIALIZABLE: run is not materializable';
  end if;

  if v_run.workspace_id <> v_report.workspace_id
     or v_run.advertiser_id
          is distinct from v_report.advertiser_id
     or v_run.created_by
          is distinct from v_report.created_by
  then
    raise exception using
      message =
        'DRV2SM_SCOPE_MISMATCH: run and report scope differ';
  end if;

  if v_report.status not in ('draft', 'ready')
     or v_report.meta #>> '{data_source,kind}' <> 'api'
     or v_report.meta #>> '{public_identity,source_type}' <> 'api'
     or v_report.meta #>> '{public_identity,period_type}' <>
          'daily_sync'
     or v_report.meta #>> '{public_identity,period_key}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,enabled}' <>
          'true'
     or v_report.meta #>> '{media_sync,auto_sync,contract}' <>
          'daily_report_v2'
     or v_report.meta #>> '{media_sync,auto_sync,start_date}' <>
          v_run.start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,scope}' <>
          'all_mapped_supported_media'
     or v_report.period_start is not null
     or v_report.period_end is not null
     or v_report.draft_period_start is not null
     or v_report.draft_period_end is not null
  then
    raise exception using
      message =
        'DRV2SM_INVALID_REPORT: report no longer matches Daily Report V2 contract';
  end if;

  if v_report.current_ingestion_id
       is distinct from v_run.previous_ingestion_id
  then
    raise exception using
      message =
        'DRV2SM_POINTER_CONFLICT: current ingestion changed after prepare';
  end if;

  if v_run.expected_rows <= 0 then
    raise exception using
      message =
        'DRV2SM_ZERO_ROW_RUN: zero-row run must complete without batch materialization';
  end if;

  if v_batch_start >= v_run.expected_rows then
    raise exception using
      message =
        'DRV2SM_INVALID_INPUT: batch_start exceeds combined snapshot range';
  end if;

  v_batch_end_exclusive :=
    least(
      v_batch_start + v_batch_size,
      v_run.expected_rows::bigint
    );

  v_expected_batch_rows :=
    v_batch_end_exclusive - v_batch_start;

  /*
   * Validate frozen participant contract.
   */
  with participants as (
    select
      p.connection_id,
      p.provider,
      btrim(p.external_account_id) as external_account_id,
      p.expected_rows
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  )
  select
    count(*)::bigint,
    count(
      distinct (
        provider,
        external_account_id
      )
    )::bigint,
    count(*) filter (
      where connection_id is null
         or provider not in (
              'naver_searchad',
              'google_ads'
            )
         or external_account_id is null
         or external_account_id = ''
         or expected_rows is null
         or expected_rows < 0
    )::bigint,
    coalesce(sum(expected_rows), 0)::bigint
    into
      v_participant_rows,
      v_distinct_fact_scopes,
      v_invalid_participants,
      v_participant_expected_rows
    from participants;

  if v_participant_rows <>
       v_run.participant_count::bigint
     or v_distinct_fact_scopes <>
          v_participant_rows
     or v_invalid_participants <> 0
     or v_participant_expected_rows <>
          v_run.expected_rows::bigint
  then
    raise exception using
      message =
        'DRV2SM_PARTICIPANT_CONTRACT_CONFLICT: frozen participant contract is invalid';
  end if;

  v_expected_dates :=
    (v_run.through_date - v_run.start_date)::bigint + 1;

  /*
   * Every frozen participant must still own every durable date partition and
   * the same participant-level row cardinality captured at prepare.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id,
      p.expected_rows
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  coverage as (
    select
      pc.provider,
      pc.external_account_id,
      pc.expected_rows,
      count(fp.date)::bigint as covered_dates,
      coalesce(sum(fp.row_count), 0)::bigint as partition_rows
    from participants as pc
    left join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
    group by
      pc.provider,
      pc.external_account_id,
      pc.expected_rows
  )
  select count(*)::bigint
    into v_bad_coverage
    from coverage
   where covered_dates <> v_expected_dates
      or partition_rows <> expected_rows;

  if v_bad_coverage <> 0 then
    raise exception using
      message =
        'DRV2SM_FACT_COVERAGE_CHANGED: durable partition coverage changed after prepare';
  end if;

  /*
   * Freeze/verify exact partition generation. This is intentionally based on
   * compact partition metadata, not the full fact JSON payload.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  scoped_partitions as (
    select
      fp.provider,
      fp.external_account_id,
      fp.date,
      fp.source_job_id,
      fp.source_job_created_at,
      fp.row_count
    from participants as pc
    join public.media_sync_fact_partitions as fp
      on fp.workspace_id = v_run.workspace_id
     and fp.advertiser_id = v_run.advertiser_id
     and fp.provider = pc.provider
     and fp.external_account_id = pc.external_account_id
     and fp.date >= v_run.start_date
     and fp.date <= v_run.through_date
  )
  select
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              jsonb_build_array(
                provider,
                external_account_id,
                date::text,
                source_job_id::text,
                extract(
                  epoch from source_job_created_at
                )::text,
                row_count
              )::text,
              E'\n'
              order by
                date,
                provider,
                external_account_id,
                source_job_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_source_fingerprint
    from scoped_partitions;

  if v_run.source_fingerprint is null then
    if v_run.status <> 'prepared' then
      raise exception using
        message =
          'DRV2SM_SOURCE_FINGERPRINT_CONFLICT: non-prepared run lacks source fingerprint';
    end if;

    update public.daily_report_v2_snapshot_runs as r
       set source_fingerprint = v_source_fingerprint,
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status = 'prepared'
       and r.source_fingerprint is null;

    if not found then
      raise exception using
        message =
          'DRV2SM_SOURCE_FINGERPRINT_CONFLICT: source fingerprint could not be frozen';
    end if;

    v_run.source_fingerprint :=
      v_source_fingerprint;
  elsif v_run.source_fingerprint
          is distinct from v_source_fingerprint
  then
    raise exception using
      message =
        'DRV2SM_SOURCE_GENERATION_CHANGED: canonical partition generation changed during snapshot build';
  end if;

  select ri.*
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_run.snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message =
        'DRV2SM_INGESTION_NOT_FOUND: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_run.workspace_id
     or v_ingestion.report_id <> v_run.report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in (
          'processing',
          'success'
        )
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by
          is distinct from v_run.created_by
     or v_ingestion.row_count is null
     or v_ingestion.row_count < 0
     or v_ingestion.row_count >
          v_run.expected_rows
  then
    raise exception using
      message =
        'DRV2SM_INGESTION_CONFLICT: snapshot ingestion is invalid';
  end if;

  if v_run.status = 'ready'
     and (
       v_ingestion.status <> 'success'
       or v_ingestion.row_count
            is distinct from v_run.expected_rows
     )
  then
    raise exception using
      message =
        'DRV2SM_READY_CONFLICT: ready run does not own a successful ingestion';
  end if;

  if v_run.status in (
       'prepared',
       'materializing'
     )
     and v_ingestion.status <> 'processing'
  then
    raise exception using
      message =
        'DRV2SM_PROCESSING_CONFLICT: open run ingestion is not processing';
  end if;

  v_checkpoint_before :=
    v_ingestion.row_count::bigint;

  if v_run.status = 'prepared'
     and v_checkpoint_before <> 0
  then
    raise exception using
      message =
        'DRV2SM_CHECKPOINT_CONFLICT: prepared run has a nonzero checkpoint';
  end if;

  if v_batch_start > v_checkpoint_before then
    raise exception using
      message =
        'DRV2SM_CHECKPOINT_CONFLICT: batch start skips the ingestion checkpoint';
  end if;

  if v_checkpoint_before > v_batch_start
     and v_checkpoint_before < v_batch_end_exclusive
  then
    raise exception using
      message =
        'DRV2SM_CHECKPOINT_CONFLICT: checkpoint falls inside requested batch';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  /*
   * Prove the exact bounded canonical source slice exists.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  bounded_source as materialized (
    select
      f.workspace_id,
      f.advertiser_id,
      f.date,
      f.provider,
      f.external_account_id,
      f.channel,
      f.device,
      f.source,
      f.row,
      f.row_key
    from participants as pc
    join public.media_sync_fact_rows as f
      on f.workspace_id = v_run.workspace_id
     and f.advertiser_id = v_run.advertiser_id
     and f.provider = pc.provider
     and f.external_account_id = pc.external_account_id
     and f.date >= v_run.start_date
     and f.date <= v_run.through_date
    order by
      f.date,
      f.provider,
      f.external_account_id,
      f.row_key
    offset v_batch_start
    limit v_expected_batch_rows
  )
  select count(*)::bigint
    into v_source_batch_rows
    from bounded_source;

  if v_source_batch_rows <>
       v_expected_batch_rows
  then
    raise exception using
      message =
        'DRV2SM_FACT_SOURCE_INCOMPLETE: bounded canonical source is incomplete';
  end if;

  /*
   * New range: insert exact rows and then atomically advance checkpoint.
   * Already-checkpointed range: verify only.
   */
  if v_checkpoint_before = v_batch_start
     and v_ingestion.status = 'processing'
  then
    with participants as (
      select
        p.provider,
        btrim(p.external_account_id) as external_account_id
      from jsonb_to_recordset(v_run.participant_contract)
        as p(
          connection_id uuid,
          provider text,
          external_account_id text,
          expected_rows bigint
        )
    ),
    bounded_source_base as materialized (
      select
        f.workspace_id,
        f.advertiser_id,
        f.date,
        f.provider,
        f.external_account_id,
        f.channel,
        f.device,
        f.source,
        f.row,
        f.row_key
      from participants as pc
      join public.media_sync_fact_rows as f
        on f.workspace_id = v_run.workspace_id
       and f.advertiser_id = v_run.advertiser_id
       and f.provider = pc.provider
       and f.external_account_id = pc.external_account_id
       and f.date >= v_run.start_date
       and f.date <= v_run.through_date
      order by
        f.date,
        f.provider,
        f.external_account_id,
        f.row_key
      offset v_batch_start
      limit v_expected_batch_rows
    ),
    bounded_source as materialized (
      select
        b.workspace_id,
        b.advertiser_id,
        b.date,
        b.channel,
        b.device,
        b.source,
        b.row,
        (
          v_batch_start +
          row_number() over (
            order by
              b.date,
              b.provider,
              b.external_account_id,
              b.row_key
          ) - 1
        )::integer as row_index
      from bounded_source_base as b
    )
    insert into public.report_rows (
      workspace_id,
      report_id,
      advertiser_id,
      row_index,
      row,
      date,
      channel,
      device,
      source,
      ingestion_id
    )
    select
      s.workspace_id,
      v_run.report_id,
      s.advertiser_id,
      s.row_index,
      s.row,
      s.date,
      s.channel,
      s.device,
      s.source,
      v_run.snapshot_ingestion_id
    from bounded_source as s
    order by s.row_index
    on conflict (
      report_id,
      ingestion_id,
      row_index
    )
    where ingestion_id is not null
    do nothing;

    get diagnostics
      v_inserted_rows = row_count;
  else
    v_inserted_rows := 0;
  end if;

  /*
   * Exact bounded destination verification.
   */
  with participants as (
    select
      p.provider,
      btrim(p.external_account_id) as external_account_id
    from jsonb_to_recordset(v_run.participant_contract)
      as p(
        connection_id uuid,
        provider text,
        external_account_id text,
        expected_rows bigint
      )
  ),
  bounded_source_base as materialized (
    select
      f.workspace_id,
      f.advertiser_id,
      f.date,
      f.provider,
      f.external_account_id,
      f.channel,
      f.device,
      f.source,
      f.row,
      f.row_key
    from participants as pc
    join public.media_sync_fact_rows as f
      on f.workspace_id = v_run.workspace_id
     and f.advertiser_id = v_run.advertiser_id
     and f.provider = pc.provider
     and f.external_account_id = pc.external_account_id
     and f.date >= v_run.start_date
     and f.date <= v_run.through_date
    order by
      f.date,
      f.provider,
      f.external_account_id,
      f.row_key
    offset v_batch_start
    limit v_expected_batch_rows
  ),
  bounded_source as materialized (
    select
      b.workspace_id,
      b.advertiser_id,
      b.date,
      b.channel,
      b.device,
      b.source,
      b.row,
      (
        v_batch_start +
        row_number() over (
          order by
            b.date,
            b.provider,
            b.external_account_id,
            b.row_key
        ) - 1
      )::integer as row_index
    from bounded_source_base as b
  )
  select
    count(rr.id)::bigint,
    count(*) filter (
      where rr.id is null
         or rr.workspace_id <> s.workspace_id
         or rr.report_id <> v_run.report_id
         or rr.advertiser_id
              is distinct from s.advertiser_id
         or rr.ingestion_id
              is distinct from v_run.snapshot_ingestion_id
         or rr.row_index <> s.row_index
         or rr.row is distinct from s.row
         or rr.date is distinct from s.date
         or rr.channel is distinct from s.channel
         or rr.device is distinct from s.device
         or rr.source is distinct from s.source
    )::bigint
    into
      v_materialized_batch_rows,
      v_batch_mismatch_rows
    from bounded_source as s
    left join public.report_rows as rr
      on rr.report_id = v_run.report_id
     and rr.ingestion_id = v_run.snapshot_ingestion_id
     and rr.row_index = s.row_index;

  if v_materialized_batch_rows <>
       v_expected_batch_rows
     or v_batch_mismatch_rows <> 0
  then
    raise exception using
      message =
        'DRV2SM_MATERIALIZATION_CONFLICT: report_rows batch differs from frozen canonical facts';
  end if;

  if v_checkpoint_before = v_batch_start
     and v_ingestion.status = 'processing'
  then
    update public.report_ingestions as ri
       set row_count =
             v_batch_end_exclusive::integer,
           updated_at =
             pg_catalog.clock_timestamp()
     where ri.id = v_run.snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count =
             v_batch_start::integer
       and ri.error is null;

    if not found then
      raise exception using
        message =
          'DRV2SM_CHECKPOINT_CONFLICT: processing checkpoint could not be advanced';
    end if;

    v_next_row_index :=
      v_batch_end_exclusive;

    v_idempotent :=
      false;
  else
    v_next_row_index :=
      v_checkpoint_before;

    v_idempotent :=
      true;
  end if;

  if v_run.status = 'prepared' then
    update public.daily_report_v2_snapshot_runs as r
       set status = 'materializing',
           updated_at = pg_catalog.clock_timestamp()
     where r.id = v_run_id
       and r.status = 'prepared'
       and r.source_fingerprint =
             v_source_fingerprint;

    if not found then
      raise exception using
        message =
          'DRV2SM_RUN_STATE_CONFLICT: prepared run could not enter materializing';
    end if;

    v_run.status :=
      'materializing';
  end if;

  v_complete :=
    v_next_row_index >=
      v_run.expected_rows::bigint;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_run.report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message =
        'DRV2SM_POINTER_CHANGED: report pointers changed during materialization';
  end if;

  return query
  select
    v_run.id,
    v_run.report_id,
    v_run.snapshot_ingestion_id,
    v_run.expected_rows::bigint,
    v_batch_start,
    v_batch_end_exclusive,
    v_expected_batch_rows,
    v_inserted_rows,
    v_materialized_batch_rows,
    v_next_row_index,
    v_complete,
    v_run.status,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_creative_metadata_cache_v1(p_account_key text, p_token uuid, p_entries jsonb, p_outcome text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '2000ms'
 SET lock_timeout TO '500ms'
AS $function$
declare a etrylue_creative_cache_v1.accounts%rowtype; n timestamptz; e jsonb; payload jsonb; expiry timestamptz; asset jsonb;
 used_keys text[]:='{}';fetched timestamptz;cooldown interval;
begin
 if p_account_key is null or p_account_key !~ '^[0-9a-f]{64}$' or p_token is null or p_entries is null or jsonb_typeof(p_entries)<>'array'
  or jsonb_array_length(p_entries)>20 or octet_length(p_entries::text)>400000 or p_outcome is null or p_outcome not in ('success','failure','rate_limited') then raise exception 'INVALID_CACHE_INPUT';end if;
 select * into a from etrylue_creative_cache_v1.accounts where account_key=p_account_key for update;
 n:=clock_timestamp();
 if not found or a.lease_token is distinct from p_token or a.lease_until<=n then return false;end if;
 for e in select value from jsonb_array_elements(p_entries) loop
  payload:=e->'metadata';
  if jsonb_typeof(e)<>'object' or e->>'key' is null or not(e->>'key'=any(a.lease_keys)) or e->>'key'=any(used_keys)
   or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>16384
   or payload->>'status' is distinct from 'ready' or payload->>'temporalBasis' is distinct from 'observed_at_fetch'
   or payload->'issues' is distinct from '[]'::jsonb or jsonb_typeof(payload->'assets') is distinct from 'array'
   or exists(select 1 from jsonb_object_keys(payload) k where k not in ('identity','revision','fetchedAt','sourceUpdatedAt','temporalBasis','status','displayName','headlines','descriptions','assets','issues'))
   then raise exception 'INVALID_CACHE_ENTRY';end if;
  used_keys:=array_append(used_keys,e->>'key');
  fetched:=(payload->>'fetchedAt')::timestamptz;
  if fetched is null or fetched>n+interval '60 seconds' then raise exception 'INVALID_CACHE_TIME';end if;
  expiry:=least(n+interval '6 hours',fetched+interval '6 hours');
  for asset in select value from jsonb_array_elements(payload->'assets') loop
   if asset->>'expiresAt' is not null then expiry:=least(expiry,(asset->>'expiresAt')::timestamptz);end if;
  end loop;
  if expiry<=n then raise exception 'EXPIRED_CACHE_ENTRY';end if;
  insert into etrylue_creative_cache_v1.entries(account_key,cache_key,payload,expires_at) values(p_account_key,e->>'key',payload,expiry)
   on conflict(account_key,cache_key) do update set payload=excluded.payload,expires_at=excluded.expires_at;
 end loop;
 if (select count(*) from etrylue_creative_cache_v1.entries where account_key=p_account_key)>5000 then raise exception 'CACHE_CAPACITY';end if;
 cooldown:=case p_outcome when 'success' then interval '60 seconds' when 'rate_limited' then interval '15 minutes' else interval '5 minutes' end;
 update etrylue_creative_cache_v1.accounts set lease_token=null,lease_until='-infinity',lease_keys='{}',next_allowed_at=n+cooldown where account_key=p_account_key;
 return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_billing_review_advertiser()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if tg_op='INSERT' then
    if new.billing_review_managed and (current_user not in ('postgres','service_role')
      or current_setting('role',true) in ('anon','authenticated')) then
      raise exception 'BILLING_MARKER_SERVER_ONLY';
    end if;
  else
    if new.billing_review_managed is distinct from old.billing_review_managed then
      raise exception 'BILLING_MARKER_IMMUTABLE';
    end if;
    if old.billing_review_managed and
      (new.id,new.workspace_id,new.tenant_id,new.created_by) is distinct from
      (old.id,old.workspace_id,old.tenant_id,old.created_by) then
      raise exception 'BILLING_TARGET_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enrich_naver_campaign_daily_authority(p_job_id uuid, p_started_at timestamp with time zone, p_expected_rows bigint, p_stats jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.finish_meta_ads_daily_run_v1(p_run_id uuid, p_lease uuid, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
declare r public.meta_ads_daily_runs%rowtype; c public.media_connections%rowtype; v_id uuid;
  v_status text; v_missing integer; v_through date; v_now timestamptz:=clock_timestamp(); v_view jsonb;
begin
  if current_user<>'service_role' then raise exception 'META_DAILY_FORBIDDEN'; end if;
  if p_error is not null and (length(p_error)>100 or p_error!~'^[A-Z_]+$') then raise exception 'META_DAILY_INVALID_INPUT'; end if;
  select connection_id into v_id from public.meta_ads_daily_runs where id=p_run_id;
  select * into c from public.media_connections where id=v_id for update;
  select * into r from public.meta_ads_daily_runs where id=p_run_id for update;
  if not found or r.status<>'processing' or r.lease is distinct from p_lease or r.lease_until<=v_now then raise exception 'META_DAILY_LEASE_LOST'; end if;
  if c.updated_at is distinct from r.connection_updated_at or c.meta#>'{meta_ads_daily,enabled}' is distinct from 'true'::jsonb then
    update public.meta_ads_daily_runs set status='failed',error_code='META_CONTACT_CHANGED',finished_at=v_now where id=r.id;
    return jsonb_build_object('status','failed','error_code','META_CONTACT_CHANGED'); end if;
  select count(*),min(d::date)-1 into v_missing,v_through from generate_series(r.start_date::timestamp,r.target_date::timestamp,interval '1 day') d
    where not exists(select 1 from public.meta_ads_daily_partitions p where p.connection_id=c.id and p.date=d::date and p.policy=c.meta->'meta_ads_reporting');
  if v_missing=0 then v_through:=r.target_date; end if;
  v_status:=case when p_error is not null then 'failed' when v_missing>0 then 'partial' else 'done' end;
  update public.meta_ads_daily_runs set status=v_status,error_code=p_error,finished_at=v_now where id=r.id;
  v_view:=jsonb_build_object('status',v_status,'last_attempt_at',v_now,'target_date',r.target_date,
    'through_date',case when v_through>=r.start_date then v_through else null end,'start_date',r.start_date,'missing_days',v_missing,
    'last_success_at',case when v_status='done' then to_jsonb(v_now) else c.meta#>'{meta_ads_daily_status,last_success_at}' end,'error_code',p_error);
  update public.media_connections set meta=jsonb_set(meta,'{meta_ads_daily_status}',v_view,true),updated_at=v_now,
    last_sync_at=case when v_status='done' then v_now else last_sync_at end where id=c.id;
  return v_view;
end; $function$;

CREATE OR REPLACE FUNCTION public.enqueue_meta_ads_daily_batch_v1(p_target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
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
end; $function$;

CREATE OR REPLACE FUNCTION public.finish_meta_ads_collection_task_v1(p_task_id uuid, p_lease uuid, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
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
end; $function$;

CREATE OR REPLACE FUNCTION public.materialize_media_sync_snapshot(p_payload jsonb)
 RETURNS TABLE(job jsonb, snapshot_ingestion_id uuid, row_count bigint, staging_fingerprint text, materialized_fingerprint text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_connection public.media_connections%rowtype;
  v_existing_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_provider text;
  v_external_account_id text;
  v_date_from date;
  v_date_to date;
  v_expected_rows bigint;

  v_snapshot_ingestion_id uuid;

  v_total_rows bigint;
  v_distinct_row_indexes bigint;
  v_rows_in_expected_range bigint;
  v_scope_mismatch_rows bigint;
  v_blank_row_key_rows bigint;
  v_missing_fingerprint_rows bigint;
  v_canonical_mismatch_rows bigint;
  v_min_row_index bigint;
  v_max_row_index bigint;
  v_oversized_row_index_rows bigint;

  v_staging_fingerprint text;
  v_materialized_fingerprint text;
  v_materialized_rows bigint;
  v_materialized_distinct_indexes bigint;
  v_materialized_min_index integer;
  v_materialized_max_index integer;
  v_materialized_scope_mismatch_rows bigint;
  v_materialized_canonical_mismatch_rows bigint;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;
  v_job_status_before text;
  v_job_progress_before integer;
  v_job_finished_at_before timestamptz;
  v_job_error_before text;
  v_job_error_detail_before jsonb;

  v_idempotent boolean := false;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using message = 'MSMM_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using message = 'MSMM_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using message = 'MSMM_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_provider := btrim(p_payload->>'provider');
    v_external_account_id := btrim(p_payload->>'external_account_id');
    v_date_from := (p_payload->>'date_from')::date;
    v_date_to := (p_payload->>'date_to')::date;
    v_expected_rows := (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using message = 'MSMM_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0 then
    raise exception using message = 'MSMM_INVALID_INPUT: payload values are invalid';
  end if;

  -- Existing CSV ingestion rejects a zero-row result. Keep that result contract.
  if v_expected_rows = 0 then
    raise exception using message = 'MSMM_EMPTY_STAGING: zero-row snapshots are not materialized';
  end if;

  select *
    into v_job
    from public.media_sync_jobs
   where id = v_job_id
   for update;

  if not found then
    raise exception using message = 'MSMM_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using message = 'MSMM_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad' or v_provider <> 'naver_searchad' then
    raise exception using message = 'MSMM_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.id <> v_job_id
     or v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to then
    raise exception using message = 'MSMM_SCOPE_MISMATCH: job scope does not match the request';
  end if;

  if v_job.mode <> 'snapshot_replace' then
    raise exception using message = 'MSMM_SCOPE_MISMATCH: unsupported media sync mode';
  end if;

  select *
    into v_report
    from public.reports
   where id = v_report_id
   for share;

  if not found then
    raise exception using message = 'MSMM_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id then
    raise exception using message = 'MSMM_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  select *
    into v_connection
    from public.media_connections
   where id = v_connection_id
   for share;

  if not found then
    raise exception using message = 'MSMM_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> v_provider
     or v_connection.external_account_id <> v_external_account_id then
    raise exception using message = 'MSMM_SCOPE_MISMATCH: connection scope does not match the job';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;
  v_job_status_before := v_job.status;
  v_job_progress_before := v_job.progress;
  v_job_finished_at_before := v_job.finished_at;
  v_job_error_before := v_job.error;
  v_job_error_detail_before := v_job.error_detail;

  select
    count(*)::bigint,
    count(distinct s.row_index)::bigint,
    count(*) filter (
      where s.row_index >= 0
        and s.row_index < v_expected_rows
    )::bigint,
    count(*) filter (
      where s.job_id <> v_job_id
         or s.report_id <> v_report_id
         or s.workspace_id <> v_workspace_id
         or s.advertiser_id <> v_advertiser_id
         or s.connection_id <> v_connection_id
         or s.provider <> v_provider
         or s.external_account_id <> v_external_account_id
         or s.date_from <> v_date_from
         or s.date_to <> v_date_to
         or s.date < v_date_from
         or s.date > v_date_to
    )::bigint,
    count(*) filter (where btrim(s.row_key) = '')::bigint,
    count(*) filter (
      where s.row_fingerprint is null
         or s.row_fingerprint !~ '^[0-9a-f]{64}$'
    )::bigint,
    count(*) filter (
      where jsonb_typeof(s.row) <> 'object'
         or coalesce(s.row->>'date', '') <> s.date::text
         or coalesce(s.row->>'report_date', '') <> s.date::text
         or coalesce(s.row->>'day', '') <> s.date::text
         or coalesce(s.row->>'ymd', '') <> s.date::text
         or coalesce(s.row->>'channel', '') <> coalesce(s.channel, '')
         or coalesce(s.row->>'device', '') <> coalesce(s.device, '')
         or coalesce(s.row->>'source', '') <> coalesce(s.source, '')
         or coalesce(s.row->>'provider', '') <> v_provider
         or coalesce(s.row->>'external_account_id', '') <> v_external_account_id
         or coalesce(s.row->>'ingestion_source', '') <> 'api'
         or encode(
              extensions.digest(
                pg_catalog.convert_to(s.row::text, 'UTF8'),
                'sha256'
              ),
              'hex'
            ) <> s.row_fingerprint
    )::bigint,
    min(s.row_index),
    max(s.row_index),
    count(*) filter (where s.row_index > 2147483647)::bigint,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              s.row_index::text || ':' || s.row_fingerprint,
              E'\n'
              order by s.row_index
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into
    v_total_rows,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows,
    v_canonical_mismatch_rows,
    v_min_row_index,
    v_max_row_index,
    v_oversized_row_index_rows,
    v_staging_fingerprint
  from public.media_sync_staging_rows s
  where s.job_id = v_job_id;

  if v_total_rows <> v_expected_rows
     or v_distinct_row_indexes <> v_expected_rows
     or v_rows_in_expected_range <> v_expected_rows
     or v_scope_mismatch_rows <> 0
     or v_blank_row_key_rows <> 0
     or v_missing_fingerprint_rows <> 0
     or v_canonical_mismatch_rows <> 0
     or v_min_row_index <> 0
     or v_max_row_index <> v_expected_rows - 1
     or v_oversized_row_index_rows <> 0 then
    raise exception using message = 'MSMM_STAGING_INCOMPLETE: staging completeness verification failed';
  end if;

  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using message = 'MSMM_STAGING_INCOMPLETE: processing checkpoint counts do not match staging';
  end if;

  if v_job.snapshot_ingestion_id is not null then
    v_snapshot_ingestion_id := v_job.snapshot_ingestion_id;

    select *
      into v_existing_ingestion
      from public.report_ingestions
     where id = v_snapshot_ingestion_id;

    if not found
       or v_existing_ingestion.workspace_id <> v_workspace_id
       or v_existing_ingestion.report_id <> v_report_id
       or v_existing_ingestion.kind <> 'api'
       or v_existing_ingestion.status <> 'success'
       or v_existing_ingestion.row_count is distinct from v_expected_rows::integer
       or v_existing_ingestion.csv_path is not null
       or v_existing_ingestion.error is not null
       or v_existing_ingestion.created_by is distinct from v_job.created_by then
      raise exception using message = 'MSMM_MATERIALIZATION_CONFLICT: existing snapshot ingestion does not match the job';
    end if;

    select
      count(*)::bigint,
      count(distinct r.row_index)::bigint,
      min(r.row_index),
      max(r.row_index),
      count(*) filter (
        where r.report_id <> v_report_id
           or r.workspace_id <> v_workspace_id
           or r.advertiser_id is distinct from v_advertiser_id
           or r.ingestion_id <> v_snapshot_ingestion_id
      )::bigint,
      count(*) filter (
        where coalesce(r.row->>'date', '') <> coalesce(r.date::text, '')
           or coalesce(r.row->>'channel', '') <> coalesce(r.channel, '')
           or coalesce(r.row->>'device', '') <> coalesce(r.device, '')
           or coalesce(r.row->>'source', '') <> coalesce(r.source, '')
      )::bigint,
      encode(
        extensions.digest(
          pg_catalog.convert_to(
            coalesce(
              string_agg(
                r.row_index::text || ':' ||
                encode(
                  extensions.digest(
                    pg_catalog.convert_to(r.row::text, 'UTF8'),
                    'sha256'
                  ),
                  'hex'
                ),
                E'\n'
                order by r.row_index
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    into
      v_materialized_rows,
      v_materialized_distinct_indexes,
      v_materialized_min_index,
      v_materialized_max_index,
      v_materialized_scope_mismatch_rows,
      v_materialized_canonical_mismatch_rows,
      v_materialized_fingerprint
    from public.report_rows r
    where r.report_id = v_report_id
      and r.ingestion_id = v_snapshot_ingestion_id;

    if v_materialized_rows <> v_expected_rows
       or v_materialized_distinct_indexes <> v_expected_rows
       or v_materialized_min_index <> 0
       or v_materialized_max_index <> v_expected_rows - 1
       or v_materialized_scope_mismatch_rows <> 0
       or v_materialized_canonical_mismatch_rows <> 0
       or v_materialized_fingerprint <> v_staging_fingerprint then
      raise exception using message = 'MSMM_MATERIALIZATION_CONFLICT: existing report rows differ from staging';
    end if;

    v_idempotent := true;
  else
    insert into public.report_ingestions (
      workspace_id,
      report_id,
      kind,
      status,
      csv_path,
      row_count,
      error,
      created_by,
      created_at,
      updated_at
    ) values (
      v_workspace_id,
      v_report_id,
      'api',
      'success',
      null,
      v_expected_rows::integer,
      null,
      v_job.created_by,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    )
    returning id into v_snapshot_ingestion_id;

    insert into public.report_rows (
      workspace_id,
      report_id,
      advertiser_id,
      row_index,
      row,
      date,
      channel,
      device,
      source,
      ingestion_id
    )
    select
      s.workspace_id,
      s.report_id,
      s.advertiser_id,
      s.row_index::integer,
      s.row,
      s.date,
      s.channel,
      s.device,
      s.source,
      v_snapshot_ingestion_id
    from public.media_sync_staging_rows s
    where s.job_id = v_job_id
    order by s.row_index;

    get diagnostics v_materialized_rows = row_count;

    if v_materialized_rows <> v_expected_rows then
      raise exception using message = 'MSMM_MATERIALIZATION_CONFLICT: inserted report row count is invalid';
    end if;

    select
      count(distinct r.row_index)::bigint,
      min(r.row_index),
      max(r.row_index),
      count(*) filter (
        where r.report_id <> v_report_id
           or r.workspace_id <> v_workspace_id
           or r.advertiser_id is distinct from v_advertiser_id
           or r.ingestion_id <> v_snapshot_ingestion_id
      )::bigint,
      count(*) filter (
        where coalesce(r.row->>'date', '') <> coalesce(r.date::text, '')
           or coalesce(r.row->>'channel', '') <> coalesce(r.channel, '')
           or coalesce(r.row->>'device', '') <> coalesce(r.device, '')
           or coalesce(r.row->>'source', '') <> coalesce(r.source, '')
      )::bigint,
      encode(
        extensions.digest(
          pg_catalog.convert_to(
            coalesce(
              string_agg(
                r.row_index::text || ':' ||
                encode(
                  extensions.digest(
                    pg_catalog.convert_to(r.row::text, 'UTF8'),
                    'sha256'
                  ),
                  'hex'
                ),
                E'\n'
                order by r.row_index
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    into
      v_materialized_distinct_indexes,
      v_materialized_min_index,
      v_materialized_max_index,
      v_materialized_scope_mismatch_rows,
      v_materialized_canonical_mismatch_rows,
      v_materialized_fingerprint
    from public.report_rows r
    where r.report_id = v_report_id
      and r.ingestion_id = v_snapshot_ingestion_id;

    if v_materialized_distinct_indexes <> v_expected_rows
       or v_materialized_min_index <> 0
       or v_materialized_max_index <> v_expected_rows - 1
       or v_materialized_scope_mismatch_rows <> 0
       or v_materialized_canonical_mismatch_rows <> 0
       or v_materialized_fingerprint <> v_staging_fingerprint then
      raise exception using message = 'MSMM_MATERIALIZATION_CONFLICT: materialized report rows failed verification';
    end if;

    update public.media_sync_jobs as j
       set snapshot_ingestion_id = v_snapshot_ingestion_id,
           updated_at = pg_catalog.clock_timestamp()
     where j.id = v_job_id
       and j.status = 'processing'
       and j.snapshot_ingestion_id is null;

    if not found then
      raise exception using message = 'MSMM_MATERIALIZATION_CONFLICT: job snapshot pointer could not be recorded';
    end if;
  end if;

  select * into v_report
    from public.reports
   where id = v_report_id;

  select * into v_job
    from public.media_sync_jobs
   where id = v_job_id;

  if v_report.current_ingestion_id is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id is distinct from v_published_ingestion_before then
    raise exception using message = 'MSMM_POINTER_CHANGED: report ingestion pointer changed unexpectedly';
  end if;

  if v_job.status is distinct from v_job_status_before
     or v_job.progress is distinct from v_job_progress_before
     or v_job.finished_at is distinct from v_job_finished_at_before
     or v_job.error is distinct from v_job_error_before
     or v_job.error_detail is distinct from v_job_error_detail_before
     or v_job.snapshot_ingestion_id is distinct from v_snapshot_ingestion_id then
    raise exception using message = 'MSMM_JOB_STATE_CHANGED: protected media sync job state changed unexpectedly';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
    v_expected_rows,
    v_staging_fingerprint,
    v_materialized_fingerprint,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_media_sync_snapshot_batch(p_payload jsonb)
 RETURNS TABLE(job jsonb, snapshot_ingestion_id uuid, batch_start bigint, batch_end_exclusive bigint, expected_batch_rows bigint, inserted_rows bigint, materialized_batch_rows bigint, next_row_index bigint, complete boolean, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_report public.reports%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;
  v_batch_start bigint;
  v_batch_size bigint;
  v_batch_end_exclusive bigint;
  v_expected_batch_rows bigint;

  v_existing_batch_rows bigint;
  v_inserted_rows bigint;
  v_materialized_batch_rows bigint;
  v_batch_mismatch_rows bigint;

  v_next_row_index bigint;

  v_is_primary_projection boolean;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_complete boolean := false;
  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$'
     or coalesce(p_payload->>'batch_start', '') !~ '^[0-9]+$'
     or coalesce(p_payload->>'batch_size', '') !~ '^[0-9]+$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: numeric materialization inputs are invalid';
  end if;

  begin
    v_job_id :=
      (p_payload->>'job_id')::uuid;

    v_report_id :=
      (p_payload->>'report_id')::uuid;

    v_workspace_id :=
      (p_payload->>'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload->>'advertiser_id')::uuid;

    v_connection_id :=
      (p_payload->>'connection_id')::uuid;

    v_snapshot_ingestion_id :=
      (p_payload->>'snapshot_ingestion_id')::uuid;

    v_provider :=
      btrim(p_payload->>'provider');

    v_external_account_id :=
      btrim(p_payload->>'external_account_id');

    v_date_from :=
      (p_payload->>'date_from')::date;

    v_date_to :=
      (p_payload->>'date_to')::date;

    v_expected_rows :=
      (p_payload->>'expected_rows')::bigint;

    v_batch_start :=
      (p_payload->>'batch_start')::bigint;

    v_batch_size :=
      (p_payload->>'batch_size')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSMM_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows <= 0
     or v_batch_start < 0
     or v_batch_start >= v_expected_rows
     or v_batch_size <= 0
     or v_batch_size > 5000 then
    raise exception using
      message = 'MSMM_INVALID_INPUT: materialization batch range is invalid';
  end if;

  v_batch_end_exclusive :=
    least(
      v_batch_start + v_batch_size,
      v_expected_rows
    );

  v_expected_batch_rows :=
    v_batch_end_exclusive - v_batch_start;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSMM_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using
      message = 'MSMM_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
     or v_job.mode <> 'snapshot_replace'
     or v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: batch execution scope does not match the job';
  end if;

  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  /*
   * Macro 3-A1 projection materialization authority.
   *
   * The target report and snapshot are owned by the selected projection.
   * Job report/previous/snapshot columns are checked only when this is the
   * legacy primary projection.
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: report projection was not found';
  end if;

  if v_projection.media_sync_job_id <> v_job_id
     or v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.created_by
          is distinct from v_job.created_by
     or v_projection.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: report projection authority does not match the request';
  end if;

  if v_is_primary_projection
     and (
       v_projection.previous_ingestion_id
         is distinct from v_job.previous_ingestion_id
       or v_projection.snapshot_ingestion_id
         is distinct from v_job.snapshot_ingestion_id
     ) then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: primary projection no longer matches job compatibility mirrors';
  end if;

  v_previous_ingestion_id :=
    v_projection.previous_ingestion_id;

  v_snapshot_ingestion_id :=
    v_projection.snapshot_ingestion_id;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id
          is distinct from v_advertiser_id
     or v_report.current_ingestion_id
          is distinct from v_previous_ingestion_id then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report pointer no longer matches the materialization baseline';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: snapshot ingestion does not match the job';
  end if;

  if v_ingestion.status = 'success' then
    if v_ingestion.row_count
         is distinct from v_expected_rows::integer then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: completed ingestion row count is invalid';
    end if;

    v_complete := true;
  else
    if v_ingestion.row_count is null
       or v_ingestion.row_count < 0
       or v_ingestion.row_count > v_expected_rows then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: processing snapshot checkpoint is invalid';
    end if;

    if v_batch_start <>
         v_ingestion.row_count::bigint then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: batch start does not match the processing checkpoint';
    end if;
  end if;

  select count(*)::bigint
    into v_existing_batch_rows
    from public.report_rows as r
   where r.report_id = v_report_id
     and r.ingestion_id = v_snapshot_ingestion_id
     and r.row_index >= v_batch_start::integer
     and r.row_index < v_batch_end_exclusive::integer;

  insert into public.report_rows (
    workspace_id,
    report_id,
    advertiser_id,
    row_index,
    row,
    date,
    channel,
    device,
    source,
    ingestion_id
  )
  select
    s.workspace_id,
    v_report_id,
    s.advertiser_id,
    s.row_index::integer,
    s.row,
    s.date,
    s.channel,
    s.device,
    s.source,
    v_snapshot_ingestion_id
  from public.media_sync_staging_rows as s
  where s.job_id = v_job_id
    and s.row_index >= v_batch_start
    and s.row_index < v_batch_end_exclusive
  order by s.row_index
  on conflict (
    report_id,
    ingestion_id,
    row_index
  )
  where ingestion_id is not null
  do nothing;

  get diagnostics
    v_inserted_rows = row_count;

  /*
   * Verify from the bounded staging range outward.
   *
   * The destination-driven form can choose the broad
   * (report_id, ingestion_id) index and filter row_index only after scanning
   * many rows from the growing snapshot. Keep verification proportional to the
   * current batch by materializing the bounded staging rows first and doing one
   * exact destination lookup per row.
   */
  with bounded_staging as materialized (
    select
      s.id,
      s.workspace_id,
      s.report_id,
      s.advertiser_id,
      s.row_index,
      s.row,
      s.date,
      s.channel,
      s.device,
      s.source
    from public.media_sync_staging_rows as s
    where s.job_id = v_job_id
      and s.row_index >= v_batch_start
      and s.row_index < v_batch_end_exclusive
  )
  select
    count(r.id)::bigint,

    count(*) filter (
      where r.id is null
         or s.report_id is distinct from v_job.report_id
         or r.workspace_id <> s.workspace_id
         or r.report_id <> v_report_id
         or r.advertiser_id
              is distinct from s.advertiser_id
         or r.ingestion_id
              is distinct from v_snapshot_ingestion_id
         or r.row_index <> s.row_index::integer
         or r.row is distinct from s.row
         or r.date is distinct from s.date
         or r.channel is distinct from s.channel
         or r.device is distinct from s.device
         or r.source is distinct from s.source
    )::bigint
  into
    v_materialized_batch_rows,
    v_batch_mismatch_rows
  from bounded_staging as s
  left join lateral (
    select
      r.id,
      r.workspace_id,
      r.report_id,
      r.advertiser_id,
      r.ingestion_id,
      r.row_index,
      r.row,
      r.date,
      r.channel,
      r.device,
      r.source
    from public.report_rows as r
    where r.report_id = v_report_id
      and r.ingestion_id = v_snapshot_ingestion_id
      and r.row_index = s.row_index::integer
    limit 1
  ) as r
    on true;

  if v_materialized_batch_rows <> v_expected_batch_rows
     or v_batch_mismatch_rows <> 0 then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: materialized batch differs from staging';
  end if;

  if v_existing_batch_rows = v_expected_batch_rows
     and v_inserted_rows = 0 then
    v_idempotent := true;
  else
    v_idempotent := false;
  end if;

  /*
   * Atomically advance the processing checkpoint only after the complete
   * bounded range has been inserted and exactly verified.
   *
   * Because this update is in the same transaction as the batch insert and
   * comparison, a failed or timed-out batch cannot leave row_count ahead of
   * committed report_rows.
   *
   * Completed snapshots are exact-retried from row 0 and therefore do not
   * mutate the already-final row_count.
   */
  if v_ingestion.status = 'processing' then
    update public.report_ingestions as ri
       set row_count =
             v_batch_end_exclusive::integer,
           updated_at =
             pg_catalog.clock_timestamp()
     where ri.id = v_snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count =
             v_batch_start::integer
       and ri.error is null;

    if not found then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: processing checkpoint could not be advanced';
    end if;
  end if;

  v_next_row_index :=
    v_batch_end_exclusive;

  v_complete :=
    v_next_row_index >= v_expected_rows;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report ingestion pointer changed during batch materialization';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
    v_batch_start,
    v_batch_end_exclusive,
    v_expected_batch_rows,
    v_inserted_rows,
    v_materialized_batch_rows,
    v_next_row_index,
    v_complete,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_naver_fact_snapshot_batch(p_payload jsonb)
 RETURNS TABLE(job jsonb, report_id uuid, snapshot_ingestion_id uuid, projection_start date, projection_end date, expected_rows bigint, batch_start bigint, batch_end_exclusive bigint, expected_batch_rows bigint, inserted_rows bigint, materialized_batch_rows bigint, next_row_index bigint, complete boolean, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
#variable_conflict use_column
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;
  v_snapshot_ingestion_id uuid;

  v_external_account_id text;

  v_projection_start date;
  v_projection_end date;

  v_expected_rows bigint;
  v_batch_start bigint;
  v_batch_size bigint;
  v_batch_end_exclusive bigint;
  v_expected_batch_rows bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;

  v_source_batch_rows bigint;
  v_inserted_rows bigint := 0;
  v_materialized_batch_rows bigint;
  v_batch_mismatch_rows bigint;

  v_checkpoint_before bigint;
  v_next_row_index bigint;
  v_complete boolean := false;
  v_idempotent boolean := false;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_is_primary_projection boolean;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFB_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'snapshot_ingestion_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFB_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = ''
     or coalesce(p_payload->>'projection_start', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'projection_end', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$'
     or coalesce(p_payload->>'batch_start', '') !~ '^[0-9]+$'
     or coalesce(p_payload->>'batch_size', '') !~ '^[0-9]+$'
  then
    raise exception using
      message = 'MSFB_INVALID_INPUT: materialization inputs are invalid';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_snapshot_ingestion_id := (p_payload->>'snapshot_ingestion_id')::uuid;

    v_external_account_id := btrim(p_payload->>'external_account_id');

    v_projection_start := (p_payload->>'projection_start')::date;
    v_projection_end := (p_payload->>'projection_end')::date;

    v_expected_rows := (p_payload->>'expected_rows')::bigint;
    v_batch_start := (p_payload->>'batch_start')::bigint;
    v_batch_size := (p_payload->>'batch_size')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSFB_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_projection_start > v_projection_end
     or v_expected_rows <= 0
     or v_expected_rows > 2147483647
     or v_batch_start < 0
     or v_batch_start >= v_expected_rows
     or v_batch_size <= 0
     or v_batch_size > 5000
  then
    raise exception using
      message = 'MSFB_INVALID_INPUT: materialization batch range is invalid';
  end if;

  v_batch_end_exclusive :=
    least(
      v_batch_start + v_batch_size,
      v_expected_rows
    );

  v_expected_batch_rows :=
    v_batch_end_exclusive - v_batch_start;

  /*
   * Lock order matches prepare:
   *   JOB -> REPORT -> PROJECTION -> INGESTION.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFB_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFB_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFB_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
     or v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
  then
    raise exception using
      message = 'MSFB_SCOPE_MISMATCH: job scope is not projection-safe';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSFB_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
  then
    raise exception using
      message = 'MSFB_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  if coalesce(
      v_report.draft_period_start,
      v_report.period_start,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_from}'
        ),
        ''
      )::date
    )
       is distinct from v_projection_start
     or (
       coalesce(
         v_report.draft_period_end,
         v_report.period_end,
         nullif(
           btrim(
             v_report.meta #>> '{media_sync,date_to}'
           ),
           ''
         )::date
       ) is null
       or least(
         coalesce(
           v_report.draft_period_end,
           v_report.period_end,
           nullif(
             btrim(
               v_report.meta #>> '{media_sync,date_to}'
             ),
             ''
           )::date
         ),
         v_job.date_to
       ) is distinct from v_projection_end
     )
  then
    raise exception using
      message = 'MSFB_PERIOD_CHANGED: report projection period changed after prepare';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;

  v_is_primary_projection := v_job.report_id = v_report_id;

  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSFB_PROJECTION_NOT_FOUND: report projection was not prepared';
  end if;

  if v_projection.workspace_id <> v_workspace_id
     or v_projection.advertiser_id <> v_advertiser_id
     or v_projection.report_id <> v_report_id
     or v_projection.snapshot_ingestion_id
          is distinct from v_snapshot_ingestion_id
     or v_projection.created_by is distinct from v_job.created_by
  then
    raise exception using
      message = 'MSFB_PROJECTION_CONFLICT: report projection authority is invalid';
  end if;

  if v_report.current_ingestion_id
       is distinct from v_projection.previous_ingestion_id
  then
    raise exception using
      message = 'MSFB_POINTER_CHANGED: report current pointer changed after prepare';
  end if;

  if v_is_primary_projection
     and (
       v_job.previous_ingestion_id
         is distinct from v_projection.previous_ingestion_id
       or v_job.snapshot_ingestion_id
         is distinct from v_snapshot_ingestion_id
     )
  then
    raise exception using
      message = 'MSFB_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
  end if;

  /*
   * Revalidate durable report-period coverage without rescanning all fact JSON.
   * Exact fact-row count is revalidated by completion; each bounded batch
   * independently proves its own canonical source slice exists exactly.
   */
  v_expected_dates :=
    (v_projection_end - v_projection_start)::bigint + 1;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint
    into
      v_partition_dates,
      v_partition_rows
    from public.media_sync_fact_partitions as p
   where p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = 'naver_searchad'
     and p.external_account_id = v_external_account_id
     and p.date >= v_projection_start
     and p.date <= v_projection_end;

  if v_partition_dates <> v_expected_dates
     or v_partition_rows <> v_expected_rows
  then
    raise exception using
      message = 'MSFB_FACT_COVERAGE_CHANGED: canonical partition authority changed after prepare';
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSFB_INGESTION_NOT_FOUND: projection ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by
     or v_ingestion.row_count is null
     or v_ingestion.row_count < 0
     or v_ingestion.row_count > v_expected_rows
  then
    raise exception using
      message = 'MSFB_INGESTION_CONFLICT: projection ingestion checkpoint is invalid';
  end if;

  if v_ingestion.status = 'success'
     and v_ingestion.row_count is distinct from v_expected_rows::integer
  then
    raise exception using
      message = 'MSFB_INGESTION_CONFLICT: completed projection ingestion row count is invalid';
  end if;

  v_checkpoint_before := v_ingestion.row_count::bigint;

  if v_batch_start > v_checkpoint_before then
    raise exception using
      message = 'MSFB_CHECKPOINT_CONFLICT: batch start skips the ingestion checkpoint';
  end if;

  if v_checkpoint_before > v_batch_start
     and v_checkpoint_before < v_batch_end_exclusive
  then
    raise exception using
      message = 'MSFB_CHECKPOINT_CONFLICT: ingestion checkpoint falls inside the requested batch';
  end if;

  /*
   * Materialize the requested canonical slice first, then assign destination
   * row_index values relative to that slice. OFFSET/LIMIT are applied before
   * row_number(), preventing row-index double counting.
   */
  with bounded_source_base as materialized (
    select
      f.workspace_id,
      f.advertiser_id,
      f.date,
      f.channel,
      f.device,
      f.source,
      f.row,
      f.row_key
    from public.media_sync_fact_rows as f
    where f.workspace_id = v_workspace_id
      and f.advertiser_id = v_advertiser_id
      and f.provider = 'naver_searchad'
      and f.external_account_id = v_external_account_id
      and f.date >= v_projection_start
      and f.date <= v_projection_end
    order by
      f.date,
      f.row_key
    offset v_batch_start
    limit v_expected_batch_rows
  ),
  bounded_source as materialized (
    select
      b.workspace_id,
      b.advertiser_id,
      b.date,
      b.channel,
      b.device,
      b.source,
      b.row,
      b.row_key,
      (
        v_batch_start +
        row_number() over (
          order by b.date, b.row_key
        ) - 1
      )::integer as row_index
    from bounded_source_base as b
  )
  select count(*)::bigint
    into v_source_batch_rows
    from bounded_source;

  if v_source_batch_rows <> v_expected_batch_rows then
    raise exception using
      message = 'MSFB_FACT_SOURCE_INCOMPLETE: bounded canonical fact source is incomplete';
  end if;

  /*
   * If this exact range is already checkpointed, treat it as a replay and
   * verify only. Otherwise insert the range and atomically advance checkpoint.
   */
  if v_checkpoint_before = v_batch_start
     and v_ingestion.status = 'processing'
  then
    with bounded_source_base as materialized (
      select
        f.workspace_id,
        f.advertiser_id,
        f.date,
        f.channel,
        f.device,
        f.source,
        f.row,
        f.row_key
      from public.media_sync_fact_rows as f
      where f.workspace_id = v_workspace_id
        and f.advertiser_id = v_advertiser_id
        and f.provider = 'naver_searchad'
        and f.external_account_id = v_external_account_id
        and f.date >= v_projection_start
        and f.date <= v_projection_end
      order by
        f.date,
        f.row_key
      offset v_batch_start
      limit v_expected_batch_rows
    ),
    bounded_source as materialized (
      select
        b.workspace_id,
        b.advertiser_id,
        b.date,
        b.channel,
        b.device,
        b.source,
        b.row,
        b.row_key,
        (
          v_batch_start +
          row_number() over (
            order by b.date, b.row_key
          ) - 1
        )::integer as row_index
      from bounded_source_base as b
    )
    insert into public.report_rows (
      workspace_id,
      report_id,
      advertiser_id,
      row_index,
      row,
      date,
      channel,
      device,
      source,
      ingestion_id
    )
    select
      s.workspace_id,
      v_report_id,
      s.advertiser_id,
      s.row_index,
      s.row,
      s.date,
      s.channel,
      s.device,
      s.source,
      v_snapshot_ingestion_id
    from bounded_source as s
    order by s.row_index
    on conflict (
      report_id,
      ingestion_id,
      row_index
    )
    where ingestion_id is not null
    do nothing;

    get diagnostics
      v_inserted_rows = row_count;
  else
    v_inserted_rows := 0;
  end if;

  /*
   * Exact bounded destination verification.
   */
  with bounded_source_base as materialized (
    select
      f.workspace_id,
      f.advertiser_id,
      f.date,
      f.channel,
      f.device,
      f.source,
      f.row,
      f.row_key
    from public.media_sync_fact_rows as f
    where f.workspace_id = v_workspace_id
      and f.advertiser_id = v_advertiser_id
      and f.provider = 'naver_searchad'
      and f.external_account_id = v_external_account_id
      and f.date >= v_projection_start
      and f.date <= v_projection_end
    order by
      f.date,
      f.row_key
    offset v_batch_start
    limit v_expected_batch_rows
  ),
  bounded_source as materialized (
    select
      b.workspace_id,
      b.advertiser_id,
      b.date,
      b.channel,
      b.device,
      b.source,
      b.row,
      b.row_key,
      (
        v_batch_start +
        row_number() over (
          order by b.date, b.row_key
        ) - 1
      )::integer as row_index
    from bounded_source_base as b
  )
  select
    count(r.id)::bigint,
    count(*) filter (
      where r.id is null
         or r.workspace_id <> s.workspace_id
         or r.report_id <> v_report_id
         or r.advertiser_id is distinct from s.advertiser_id
         or r.ingestion_id is distinct from v_snapshot_ingestion_id
         or r.row_index <> s.row_index
         or r.row is distinct from s.row
         or r.date is distinct from s.date
         or r.channel is distinct from s.channel
         or r.device is distinct from s.device
         or r.source is distinct from s.source
    )::bigint
    into
      v_materialized_batch_rows,
      v_batch_mismatch_rows
    from bounded_source as s
    left join public.report_rows as r
      on r.report_id = v_report_id
     and r.ingestion_id = v_snapshot_ingestion_id
     and r.row_index = s.row_index;

  if v_materialized_batch_rows <> v_expected_batch_rows
     or v_batch_mismatch_rows <> 0
  then
    raise exception using
      message = 'MSFB_MATERIALIZATION_CONFLICT: report_rows batch differs from canonical facts';
  end if;

  if v_checkpoint_before = v_batch_start
     and v_ingestion.status = 'processing'
  then
    update public.report_ingestions as ri
       set row_count = v_batch_end_exclusive::integer,
           updated_at = pg_catalog.clock_timestamp()
     where ri.id = v_snapshot_ingestion_id
       and ri.status = 'processing'
       and ri.row_count = v_batch_start::integer
       and ri.error is null;

    if not found then
      raise exception using
        message = 'MSFB_CHECKPOINT_CONFLICT: processing checkpoint could not be advanced';
    end if;

    v_next_row_index := v_batch_end_exclusive;
    v_idempotent := false;
  else
    v_next_row_index := v_checkpoint_before;
    v_idempotent := true;
  end if;

  v_complete :=
    v_next_row_index >= v_expected_rows;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message = 'MSFB_POINTER_CHANGED: report pointers changed during batch materialization';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_report_id,
    v_snapshot_ingestion_id,
    v_projection_start,
    v_projection_end,
    v_expected_rows,
    v_batch_start,
    v_batch_end_exclusive,
    v_expected_batch_rows,
    v_inserted_rows,
    v_materialized_batch_rows,
    v_next_row_index,
    v_complete,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_daily_report_v2_combined_snapshot(p_payload jsonb)
 RETURNS TABLE(run_id uuid, report_id uuid, previous_ingestion_id uuid, snapshot_ingestion_id uuid, start_date date, through_date date, participant_contract jsonb, participant_count integer, expected_rows integer, status text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_report public.reports%rowtype;
  v_existing public.daily_report_v2_snapshot_runs%rowtype;

  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_created_by uuid;

  v_start_date date;
  v_through_date date;

  v_expected_dates bigint;

  v_participant_count bigint;
  v_distinct_fact_scope_count bigint;
  v_inactive_participant_count bigint;
  v_complete_participant_count bigint;

  v_participant_contract jsonb;
  v_expected_rows bigint;

  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;
  v_run_id uuid;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      message =
        'DRV2S_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'created_by', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'start_date', '') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or coalesce(p_payload->>'through_date', '') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then
    raise exception using
      message =
        'DRV2S_INVALID_INPUT: payload values are invalid';
  end if;

  begin
    v_report_id :=
      (p_payload->>'report_id')::uuid;

    v_workspace_id :=
      (p_payload->>'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload->>'advertiser_id')::uuid;

    v_created_by :=
      (p_payload->>'created_by')::uuid;

    v_start_date :=
      (p_payload->>'start_date')::date;

    v_through_date :=
      (p_payload->>'through_date')::date;
  exception
    when others then
      raise exception using
        message =
          'DRV2S_INVALID_INPUT: payload values could not be parsed';
  end;

  if v_start_date > v_through_date then
    raise exception using
      message =
        'DRV2S_INVALID_INPUT: start_date exceeds through_date';
  end if;

  select r.*
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message =
        'DRV2S_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
     or v_report.created_by is distinct from v_created_by
  then
    raise exception using
      message =
        'DRV2S_SCOPE_MISMATCH: report scope does not match request';
  end if;

  if v_report.status not in ('draft', 'ready')
     or v_report.meta #>> '{data_source,kind}' <> 'api'
     or v_report.meta #>> '{public_identity,source_type}' <> 'api'
     or v_report.meta #>> '{public_identity,period_type}' <> 'daily_sync'
     or v_report.meta #>> '{public_identity,period_key}' <> v_start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,enabled}' <> 'true'
     or v_report.meta #>> '{media_sync,auto_sync,contract}' <> 'daily_report_v2'
     or v_report.meta #>> '{media_sync,auto_sync,start_date}' <> v_start_date::text
     or v_report.meta #>> '{media_sync,auto_sync,scope}' <>
          'all_mapped_supported_media'
  then
    raise exception using
      message =
        'DRV2S_INVALID_REPORT: report does not match Daily Report V2 canonical contract';
  end if;

  if v_report.period_start is not null
     or v_report.period_end is not null
     or v_report.draft_period_start is not null
     or v_report.draft_period_end is not null
  then
    raise exception using
      message =
        'DRV2S_INVALID_REPORT: daily_sync report must not retain fixed-range authority';
  end if;

  select run.*
    into v_existing
    from public.daily_report_v2_snapshot_runs as run
   where run.report_id = v_report_id
     and run.through_date = v_through_date
   for update;

  if found then
    if v_existing.workspace_id <> v_workspace_id
       or v_existing.advertiser_id <> v_advertiser_id
       or v_existing.start_date <> v_start_date
       or v_existing.created_by <> v_created_by
    then
      raise exception using
        message =
          'DRV2S_RUN_CONFLICT: existing run scope differs';
    end if;

    if v_existing.status = 'activated' then
      if v_report.current_ingestion_id
           is distinct from v_existing.snapshot_ingestion_id
      then
        raise exception using
          message =
            'DRV2S_POINTER_CONFLICT: activated run is not current';
      end if;
    else
      if v_report.current_ingestion_id
           is distinct from v_existing.previous_ingestion_id
      then
        raise exception using
          message =
            'DRV2S_POINTER_CONFLICT: report current pointer changed after prepare';
      end if;
    end if;

    v_idempotent := true;

    return query
    select
      v_existing.id,
      v_existing.report_id,
      v_existing.previous_ingestion_id,
      v_existing.snapshot_ingestion_id,
      v_existing.start_date,
      v_existing.through_date,
      v_existing.participant_contract,
      v_existing.participant_count,
      v_existing.expected_rows,
      v_existing.status,
      v_idempotent;

    return;
  end if;

  if exists (
    select 1
      from public.daily_report_v2_snapshot_runs as open_run
     where open_run.report_id = v_report_id
       and open_run.status in (
         'prepared',
         'materializing',
         'ready'
       )
  ) then
    raise exception using
      message =
        'DRV2S_OPEN_RUN_CONFLICT: another combined snapshot run is still open';
  end if;

  v_expected_dates :=
    (v_through_date - v_start_date)::bigint + 1;

  with mapped_supported as (
    select
      c.id as connection_id,
      c.provider,
      c.external_account_id,
      c.status
    from public.report_media_connections as mapping
    join public.media_connections as c
      on c.id = mapping.connection_id
    where mapping.report_id = v_report_id
      and mapping.workspace_id = v_workspace_id
      and mapping.advertiser_id = v_advertiser_id
      and c.workspace_id = v_workspace_id
      and c.advertiser_id = v_advertiser_id
      and c.provider in (
        'naver_searchad',
        'google_ads'
      )
  ),
  participant_coverage as (
    select
      m.connection_id,
      m.provider,
      m.external_account_id,
      m.status,
      count(p.date)::bigint as covered_dates,
      coalesce(sum(p.row_count), 0)::bigint as row_count
    from mapped_supported as m
    left join public.media_sync_fact_partitions as p
      on p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = m.provider
     and p.external_account_id = m.external_account_id
     and p.date >= v_start_date
     and p.date <= v_through_date
    group by
      m.connection_id,
      m.provider,
      m.external_account_id,
      m.status
  )
  select
    count(*)::bigint,
    count(
      distinct (
        pc.provider,
        pc.external_account_id
      )
    )::bigint,
    count(*) filter (
      where pc.status <> 'active'
    )::bigint,
    count(*) filter (
      where pc.covered_dates = v_expected_dates
    )::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'connection_id', pc.connection_id,
          'provider', pc.provider,
          'external_account_id', pc.external_account_id,
          'expected_rows', pc.row_count
        )
        order by
          case pc.provider
            when 'naver_searchad' then 0
            when 'google_ads' then 1
            else 99
          end,
          pc.external_account_id,
          pc.connection_id
      ),
      '[]'::jsonb
    ),
    coalesce(sum(pc.row_count), 0)::bigint
    into
      v_participant_count,
      v_distinct_fact_scope_count,
      v_inactive_participant_count,
      v_complete_participant_count,
      v_participant_contract,
      v_expected_rows
    from participant_coverage as pc;

  if v_participant_count = 0 then
    raise exception using
      message =
        'DRV2S_NO_PARTICIPANTS: no mapped supported media participate';
  end if;

  if v_distinct_fact_scope_count <> v_participant_count then
    raise exception using
      message =
        'DRV2S_DUPLICATE_FACT_SCOPE: multiple mappings target the same provider/account fact scope';
  end if;

  if v_inactive_participant_count <> 0 then
    raise exception using
      message =
        'DRV2S_INACTIVE_PARTICIPANT: every participating connection must be active';
  end if;

  if v_complete_participant_count <> v_participant_count then
    raise exception using
      message =
        'DRV2S_FACT_COVERAGE_INCOMPLETE: every participant must have contiguous durable partitions through target';
  end if;

  if v_expected_rows > 2147483647 then
    raise exception using
      message =
        'DRV2S_ROW_CAPACITY_EXCEEDED: combined snapshot exceeds report_rows row_index capacity';
  end if;

  v_previous_ingestion_id :=
    v_report.current_ingestion_id;

  insert into public.report_ingestions (
    workspace_id,
    report_id,
    kind,
    status,
    csv_path,
    row_count,
    error,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_workspace_id,
    v_report_id,
    'api',
    'processing',
    null,
    0,
    null,
    v_created_by,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  )
  returning id
    into v_snapshot_ingestion_id;

  insert into public.daily_report_v2_snapshot_runs (
    workspace_id,
    advertiser_id,
    report_id,
    start_date,
    through_date,
    previous_ingestion_id,
    snapshot_ingestion_id,
    participant_contract,
    participant_count,
    expected_rows,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_workspace_id,
    v_advertiser_id,
    v_report_id,
    v_start_date,
    v_through_date,
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_participant_contract,
    v_participant_count::integer,
    v_expected_rows::integer,
    'prepared',
    v_created_by,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  )
  returning id
    into v_run_id;

  if v_report.current_ingestion_id
       is distinct from v_previous_ingestion_id
  then
    raise exception using
      message =
        'DRV2S_POINTER_CONFLICT: report current pointer changed during prepare';
  end if;

  return query
  select
    v_run_id,
    v_report_id,
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_start_date,
    v_through_date,
    v_participant_contract,
    v_participant_count::integer,
    v_expected_rows::integer,
    'prepared'::text,
    false;
end;
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.meta_ads_contact_policy_valid_v1(p jsonb, account_id text, krw_only boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(jsonb_typeof(p)='object' and
    (not (p ? 'instant_form') or p->'instant_form'='{"field":"actions","action_type":"onsite_conversion.lead_grouped"}'::jsonb) and
    (p-'instant_form')=jsonb_build_object('contract','meta_contact_snapshot_v1','enabled',true,'external_account_id',account_id,
      'currency',p->>'currency','time_zone',p->>'time_zone','conversion_field','conversions','conversion_action_type','contact_website',
      'missing_conversion','zero_after_complete_reconciliation','revenue','not_provided','attribution','platform_default','report_type','db') and
    account_id~'^[1-9][0-9]{0,29}$' and p->>'currency'~'^[A-Z]{3}$' and
    exists(select 1 from pg_timezone_names where name=p->>'time_zone') and
    (not krw_only or (p->>'currency'='KRW' and p->>'time_zone'='Asia/Seoul')),false);
$function$;

CREATE OR REPLACE FUNCTION public.meta_ads_contact_metric_keys_v1(p jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select array['impressions','clicks','spend','website_contacts']::text[] ||
    case when p ? 'instant_form' then array['instant_form_submissions','total_conversions']::text[] else '{}'::text[] end;
$function$;

CREATE OR REPLACE FUNCTION public.meta_ads_contact_totals_valid_v1(t jsonb, p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare k text;
begin
  if jsonb_typeof(t) is distinct from 'object' or
    (select count(*) from jsonb_object_keys(t))<>cardinality(public.meta_ads_contact_metric_keys_v1(p)) then return false; end if;
  foreach k in array public.meta_ads_contact_metric_keys_v1(p) loop
    if coalesce(t->>k,'')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or (t->>k)::numeric>9007199254740991 then return false; end if;
  end loop;
  return not (p ? 'instant_form') or (t->>'total_conversions')::numeric=
    (t->>'website_contacts')::numeric+(t->>'instant_form_submissions')::numeric;
end; $function$;

CREATE OR REPLACE FUNCTION public.meta_ads_contact_row_meta_valid_v1(r jsonb, p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
end; $function$;

CREATE OR REPLACE FUNCTION public.meta_ads_contact_totals_v1(rows jsonb, p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object('impressions',coalesce(sum((x->>'impressions')::numeric),0),
    'clicks',coalesce(sum((x->>'clicks')::numeric),0),'spend',coalesce(sum((x->>'cost')::numeric),0),
    'website_contacts',coalesce(sum(case when p ? 'instant_form' then (x#>>'{provider_meta,website_contacts}')::numeric
      else (x->>'conversions')::numeric end),0)) ||
    case when p ? 'instant_form' then jsonb_build_object(
      'instant_form_submissions',coalesce(sum((x#>>'{provider_meta,instant_form_submissions}')::numeric),0),
      'total_conversions',coalesce(sum((x->>'conversions')::numeric),0)) else '{}'::jsonb end
    from jsonb_array_elements(rows) x;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.prepare_media_sync_snapshot_materialization(p_payload jsonb)
 RETURNS TABLE(job jsonb, snapshot_ingestion_id uuid, expected_rows bigint, next_row_index bigint, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_connection public.media_connections%rowtype;
  v_ingestion public.report_ingestions%rowtype;
  v_projection public.media_sync_report_projections%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;
  v_expected_rows bigint;

  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;
  v_next_row_index bigint;

  v_is_primary_projection boolean;

  v_total_rows bigint;
  v_distinct_row_indexes bigint;
  v_rows_in_expected_range bigint;
  v_scope_mismatch_rows bigint;
  v_blank_row_key_rows bigint;
  v_missing_fingerprint_rows bigint;
  v_canonical_mismatch_rows bigint;
  v_min_row_index bigint;
  v_max_row_index bigint;
  v_oversized_row_index_rows bigint;


  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(p_payload->>'expected_rows', '') !~ '^[0-9]+$' then
    raise exception using
      message = 'MSMM_INVALID_INPUT: expected_rows must be a non-negative integer';
  end if;

  begin
    v_job_id :=
      (p_payload->>'job_id')::uuid;

    v_report_id :=
      (p_payload->>'report_id')::uuid;

    v_workspace_id :=
      (p_payload->>'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload->>'advertiser_id')::uuid;

    v_connection_id :=
      (p_payload->>'connection_id')::uuid;

    v_provider :=
      btrim(p_payload->>'provider');

    v_external_account_id :=
      btrim(p_payload->>'external_account_id');

    v_date_from :=
      (p_payload->>'date_from')::date;

    v_date_to :=
      (p_payload->>'date_to')::date;

    v_expected_rows :=
      (p_payload->>'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        message = 'MSMM_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_provider = ''
     or v_external_account_id = ''
     or v_date_from > v_date_to
     or v_expected_rows < 0 then
    raise exception using
      message = 'MSMM_INVALID_INPUT: payload values are invalid';
  end if;

  if v_expected_rows = 0
     and v_provider <> 'naver_searchad' then
    raise exception using
      message = 'MSMM_EMPTY_STAGING: zero-row snapshots are not materialized';
  end if;

  if v_expected_rows > 2147483647 then
    raise exception using
      message = 'MSMM_INVALID_INPUT: expected_rows exceeds report_rows row_index capacity';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSMM_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads') then
    raise exception using
      message = 'MSMM_UNSUPPORTED_PROVIDER: only Naver Search Ads is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
     or v_job.mode <> 'snapshot_replace' then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: execution scope does not match the request';
  end if;

  /*
   * Macro 3-A1 compatibility rule.
   *
   * job.report_id remains a legacy primary-projection mirror only.
   * It no longer decides which report may consume this execution's canonical
   * staging dataset.
   */
  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  if v_job.inserted_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.failed_rows <> 0 then
    raise exception using
      message = 'MSMM_STAGING_INCOMPLETE: processing checkpoint counts do not match staging';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  if v_is_primary_projection
     and v_report.current_ingestion_id
           is distinct from v_job.previous_ingestion_id then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: primary report current pointer no longer matches the job compatibility baseline';
  end if;

  v_current_ingestion_before :=
    v_report.current_ingestion_id;

  v_published_ingestion_before :=
    v_report.published_ingestion_id;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for share;

  if not found then
    raise exception using
      message = 'MSMM_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> v_provider
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active' then
    raise exception using
      message = 'MSMM_SCOPE_MISMATCH: connection scope does not match the job';
  end if;


  /*
   * Naver combined staging authority.
   *
   * Immediately before materialization, the Naver worker has already:
   *
   * 1) loaded a row-index-only whole-job base summary,
   * 2) validated every staging row in bounded 2,000-row batches,
   * 3) verified scope / row key / fingerprint / canonical grain,
   * 4) loaded the base summary again,
   * 5) rejected the result if the before/after summaries differ.
   *
   * append_media_sync_staging_batch() serializes on the same job row and
   * staging append is service-role authority only. Once any snapshot or
   * projection is established, append refuses further writes.
   *
   * Repeating the complete heap validation here therefore adds another O(n)
   * scan after the exact combined validation has already succeeded.
   *
   * For Naver keep only indexed boundary witnesses. Because:
   *
   * - (job_id, row_index) is unique,
   * - combined validation already proved totalRows = expectedRows,
   * - combined validation already proved min = 0 / max = expectedRows - 1,
   * - an additional successful append cannot create another in-range
   *   row_index after that complete set exists,
   *
   * any newly inserted row would necessarily move the maximum boundary and
   * fail this check.
   *
   * Google keeps the legacy complete validation below unchanged.
   */
  if v_provider = 'naver_searchad' then
    select s.row_index
      into v_min_row_index
      from public.media_sync_staging_rows as s
     where s.job_id = v_job_id
     order by s.row_index asc
     limit 1;

    select s.row_index
      into v_max_row_index
      from public.media_sync_staging_rows as s
     where s.job_id = v_job_id
     order by s.row_index desc
     limit 1;

    if v_expected_rows = 0 then
      if v_min_row_index is not null
         or v_max_row_index is not null then
        raise exception using
          message =
            'MSMM_STAGING_INCOMPLETE: authoritative zero-row Naver staging is not empty';
      end if;
    elsif v_min_row_index is distinct from 0
       or v_max_row_index
            is distinct from
            v_expected_rows - 1 then
      raise exception using
        message =
          'MSMM_STAGING_INCOMPLETE: Naver staging boundary authority changed after combined validation';
    end if;

    /*
     * Preserve the local variables' validated semantic values.
     * No full staging scan is required on this Naver branch.
     */
    v_total_rows :=
      v_expected_rows;

    v_distinct_row_indexes :=
      v_expected_rows;

    v_rows_in_expected_range :=
      v_expected_rows;

    v_scope_mismatch_rows := 0;
    v_blank_row_key_rows := 0;
    v_missing_fingerprint_rows := 0;
    v_canonical_mismatch_rows := 0;
    v_oversized_row_index_rows := 0;

  else
    select
      count(*)::bigint,
      count(distinct s.row_index)::bigint,

      count(*) filter (
        where s.row_index >= 0
          and s.row_index < v_expected_rows
      )::bigint,

      count(*) filter (
        where s.report_id <> v_job.report_id
           or s.workspace_id <> v_workspace_id
           or s.advertiser_id <> v_advertiser_id
           or s.connection_id <> v_connection_id
           or s.provider <> v_provider
           or s.external_account_id <> v_external_account_id
           or s.date_from <> v_date_from
           or s.date_to <> v_date_to
           or s.date < v_date_from
           or s.date > v_date_to
      )::bigint,

      count(*) filter (
        where btrim(s.row_key) = ''
      )::bigint,

      count(*) filter (
        where s.row_fingerprint is null
           or s.row_fingerprint !~ '^[0-9a-f]{64}$'
      )::bigint,

      count(*) filter (
        where case
          when v_provider = 'naver_searchad' then false
          else (
            jsonb_typeof(s.row) <> 'object'
            or coalesce(s.row->>'date', '') <> s.date::text
            or coalesce(s.row->>'report_date', '') <> s.date::text
            or coalesce(s.row->>'day', '') <> s.date::text
            or coalesce(s.row->>'ymd', '') <> s.date::text
            or coalesce(s.row->>'channel', '') <> coalesce(s.channel, '')
            or coalesce(s.row->>'device', '') <> coalesce(s.device, '')
            or coalesce(s.row->>'source', '') <> coalesce(s.source, '')
            or coalesce(s.row->>'provider', '') <> v_provider
            or coalesce(
                 s.row->>'external_account_id',
                 ''
               ) <> v_external_account_id
            or coalesce(
                 s.row->>'ingestion_source',
                 ''
               ) <> 'api'
            or encode(
                 extensions.digest(
                   pg_catalog.convert_to(
                     s.row::text,
                     'UTF8'
                   ),
                   'sha256'
                 ),
                 'hex'
               ) <> s.row_fingerprint
          )
        end
      )::bigint,

      min(s.row_index),
      max(s.row_index),

      count(*) filter (
        where s.row_index > 2147483647
      )::bigint
    into
      v_total_rows,
      v_distinct_row_indexes,
      v_rows_in_expected_range,
      v_scope_mismatch_rows,
      v_blank_row_key_rows,
      v_missing_fingerprint_rows,
      v_canonical_mismatch_rows,
      v_min_row_index,
      v_max_row_index,
      v_oversized_row_index_rows
    from public.media_sync_staging_rows as s
    where s.job_id = v_job_id;

    if v_total_rows <> v_expected_rows
       or v_distinct_row_indexes <> v_expected_rows
       or v_rows_in_expected_range <> v_expected_rows
       or v_scope_mismatch_rows <> 0
       or v_blank_row_key_rows <> 0
       or v_missing_fingerprint_rows <> 0
       or v_canonical_mismatch_rows <> 0
       or v_min_row_index <> 0
       or v_max_row_index <> v_expected_rows - 1
       or v_oversized_row_index_rows <> 0 then
      raise exception using
        message =
          'MSMM_STAGING_INCOMPLETE: staging completeness verification failed';
    end if;
  end if;

  /*
   * Macro 3-A1 projection-first materialization ownership.
   *
   * - (job_id, report_id) identifies the target projection.
   * - an existing projection owns previous/snapshot ingestion identity.
   * - a new projection takes its previous pointer from the target report and
   *   allocates its own snapshot ingestion.
   * - job previous/snapshot columns remain fail-closed compatibility mirrors
   *   only for the legacy primary projection (job.report_id).
   */
  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for update;

  if found then
    if v_projection.workspace_id <> v_workspace_id
       or v_projection.advertiser_id <> v_advertiser_id
       or v_projection.report_id <> v_report_id
       or v_projection.created_by
            is distinct from v_job.created_by then
      raise exception using
        message = 'MSMM_PROJECTION_CONFLICT: existing report projection scope is invalid';
    end if;

    v_previous_ingestion_id :=
      v_projection.previous_ingestion_id;

    v_snapshot_ingestion_id :=
      v_projection.snapshot_ingestion_id;

    if v_report.current_ingestion_id
         is distinct from v_previous_ingestion_id then
      raise exception using
        message = 'MSMM_POINTER_CHANGED: target report current pointer no longer matches the projection baseline';
    end if;

    if v_is_primary_projection
       and (
         v_projection.previous_ingestion_id
           is distinct from v_job.previous_ingestion_id
         or v_projection.snapshot_ingestion_id
           is distinct from v_job.snapshot_ingestion_id
       ) then
      raise exception using
        message = 'MSMM_PROJECTION_CONFLICT: primary projection no longer matches job compatibility mirrors';
    end if;
  else
    v_previous_ingestion_id :=
      v_report.current_ingestion_id;

    if v_is_primary_projection
       and v_previous_ingestion_id
             is distinct from v_job.previous_ingestion_id then
      raise exception using
        message = 'MSMM_POINTER_CHANGED: primary projection baseline no longer matches the job compatibility mirror';
    end if;

    if v_is_primary_projection
       and v_job.snapshot_ingestion_id is not null then
      /*
       * Compatibility recovery for a legacy primary execution whose snapshot
       * mirror already exists but whose projection row is absent.
       */
      v_snapshot_ingestion_id :=
        v_job.snapshot_ingestion_id;
    else
      insert into public.report_ingestions (
        workspace_id,
        report_id,
        kind,
        status,
        csv_path,
        row_count,
        error,
        created_by,
        created_at,
        updated_at
      )
      values (
        v_workspace_id,
        v_report_id,
        'api',
        'processing',
        null,
        0,
        null,
        v_job.created_by,
        pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp()
      )
      returning id
        into v_snapshot_ingestion_id;
    end if;

    begin
      insert into public.media_sync_report_projections (
        media_sync_job_id,
        workspace_id,
        advertiser_id,
        report_id,
        previous_ingestion_id,
        snapshot_ingestion_id,
        created_by
      )
      values (
        v_job_id,
        v_workspace_id,
        v_advertiser_id,
        v_report_id,
        v_previous_ingestion_id,
        v_snapshot_ingestion_id,
        v_job.created_by
      )
      returning *
        into v_projection;
    exception
      when unique_violation then
        raise exception using
          message = 'MSMM_PROJECTION_CONFLICT: report projection identity is already bound';
    end;

    if v_is_primary_projection
       and v_job.snapshot_ingestion_id is null then
      update public.media_sync_jobs as j
         set snapshot_ingestion_id =
               v_snapshot_ingestion_id,
             updated_at =
               pg_catalog.clock_timestamp()
       where j.id = v_job_id
         and j.status = 'processing'
         and j.snapshot_ingestion_id is null;

      if not found then
        raise exception using
          message = 'MSMM_MATERIALIZATION_CONFLICT: primary job snapshot compatibility mirror could not be recorded';
      end if;
    end if;
  end if;

  /*
   * The snapshot ingestion is projection-owned for both primary and additional
   * report projections. Validate it after the projection identity is fixed.
   */
  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: projection snapshot ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by then
    raise exception using
      message = 'MSMM_MATERIALIZATION_CONFLICT: projection snapshot ingestion does not match the target report';
  end if;

  if v_ingestion.status = 'success' then
    if v_ingestion.row_count
         is distinct from v_expected_rows::integer then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: completed projection snapshot row count is invalid';
    end if;

    v_next_row_index :=
      v_expected_rows;

    v_idempotent := true;
  else
    if v_ingestion.row_count is null
       or v_ingestion.row_count < 0
       or v_ingestion.row_count > v_expected_rows then
      raise exception using
        message = 'MSMM_MATERIALIZATION_CONFLICT: projection snapshot checkpoint is invalid';
    end if;

    v_next_row_index :=
      v_ingestion.row_count::bigint;

    v_idempotent := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before then
    raise exception using
      message = 'MSMM_POINTER_CHANGED: report ingestion pointer changed unexpectedly';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_snapshot_ingestion_id,
    v_expected_rows,
    v_next_row_index,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_naver_fact_snapshot_materialization(p_payload jsonb)
 RETURNS TABLE(job jsonb, report_id uuid, previous_ingestion_id uuid, snapshot_ingestion_id uuid, projection_start date, projection_end date, expected_rows bigint, next_row_index bigint, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_report public.reports%rowtype;
  v_connection public.media_connections%rowtype;
  v_projection public.media_sync_report_projections%rowtype;
  v_ingestion public.report_ingestions%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_external_account_id text;

  v_projection_start date;
  v_projection_end date;
  v_expected_rows bigint;

  v_expected_dates bigint;
  v_partition_dates bigint;
  v_partition_rows bigint;
  v_fact_rows bigint;

  v_job_expected_dates bigint;
  v_job_owned_dates bigint;
  v_job_partition_rows bigint;

  v_previous_ingestion_id uuid;
  v_snapshot_ingestion_id uuid;

  v_current_ingestion_before uuid;
  v_published_ingestion_before uuid;

  v_is_primary_projection boolean;
  v_next_row_index bigint;
  v_idempotent boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      message = 'MSFP_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(p_payload->>'job_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'report_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'workspace_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'advertiser_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(p_payload->>'connection_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      message = 'MSFP_INVALID_INPUT: invalid UUID input';
  end if;

  if coalesce(btrim(p_payload->>'external_account_id'), '') = '' then
    raise exception using
      message = 'MSFP_INVALID_INPUT: external_account_id is required';
  end if;

  begin
    v_job_id := (p_payload->>'job_id')::uuid;
    v_report_id := (p_payload->>'report_id')::uuid;
    v_workspace_id := (p_payload->>'workspace_id')::uuid;
    v_advertiser_id := (p_payload->>'advertiser_id')::uuid;
    v_connection_id := (p_payload->>'connection_id')::uuid;
    v_external_account_id := btrim(p_payload->>'external_account_id');
  exception
    when others then
      raise exception using
        message = 'MSFP_INVALID_INPUT: payload value could not be parsed';
  end;

  /*
   * Lock order:
   *   JOB -> REPORT -> CONNECTION -> PROJECTION/INGESTION.
   *
   * The job remains processing throughout prepare.
   */
  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id
   for update;

  if not found then
    raise exception using
      message = 'MSFP_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      message = 'MSFP_JOB_NOT_PROCESSING: media sync job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_job.mode <> 'snapshot_replace'
  then
    raise exception using
      message = 'MSFP_UNSUPPORTED_JOB: only Naver snapshot_replace is supported';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.external_account_id <> v_external_account_id
  then
    raise exception using
      message = 'MSFP_SCOPE_MISMATCH: job scope does not match the request';
  end if;

  if v_job.finished_at is not null
     or v_job.failed_rows is distinct from 0
     or v_job.raw_rows is distinct from v_job.normalized_rows
     or v_job.normalized_rows is distinct from v_job.inserted_rows
  then
    raise exception using
      message = 'MSFP_JOB_INVALID: processing checkpoint is not projection-safe';
  end if;

  /*
   * Require the current chunk itself to have reached canonical fact storage.
   * Projection-period partitions may legitimately belong to older chunk jobs,
   * but every date owned by this job must now point to this exact job lineage.
   */
  v_job_expected_dates :=
    (v_job.date_to - v_job.date_from)::bigint + 1;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint
    into
      v_job_owned_dates,
      v_job_partition_rows
    from public.media_sync_fact_partitions as p
   where p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = 'naver_searchad'
     and p.external_account_id = v_external_account_id
     and p.date >= v_job.date_from
     and p.date <= v_job.date_to
     and p.source_connection_id = v_job.connection_id
     and p.source_report_id = v_job.report_id
     and p.source_job_id = v_job.id
     and p.source_job_created_at = v_job.created_at;

  if v_job_owned_dates <> v_job_expected_dates
     or v_job_partition_rows is distinct from v_job.inserted_rows::bigint
  then
    raise exception using
      message = 'MSFP_FACT_REPLACEMENT_INCOMPLETE: current job chunk is not fully committed to canonical facts';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id
   for update;

  if not found then
    raise exception using
      message = 'MSFP_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_workspace_id
     or v_report.advertiser_id is distinct from v_advertiser_id
  then
    raise exception using
      message = 'MSFP_SCOPE_MISMATCH: report scope does not match the job';
  end if;

  /*
   * Current projection authority:
   *   draft_period_start -> period_start -> meta.media_sync.date_from
   *   draft_period_end   -> period_end   -> meta.media_sync.date_to
   *
   * Job chunk dates are never a fallback for report period authority.
 * job.date_to only bounds an in-progress report's execution end for MTD.
   */
  v_projection_start :=
    coalesce(
      v_report.draft_period_start,
      v_report.period_start,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_from}'
        ),
        ''
      )::date
    );

  v_projection_end :=
    coalesce(
      v_report.draft_period_end,
      v_report.period_end,
      nullif(
        btrim(
          v_report.meta #>> '{media_sync,date_to}'
        ),
        ''
      )::date
    );

  /*
   * Preserve the stored report period.
   * Only the execution projection end is bounded to the canonical
   * daily job authority for an in-progress month.
   */
  if v_projection_end is not null then
    v_projection_end :=
      least(
        v_projection_end,
        v_job.date_to
      );
  end if;

  if v_projection_start is null
     or v_projection_end is null
     or v_projection_start > v_projection_end
  then
    raise exception using
      message = 'MSFP_PERIOD_INVALID: report projection period is missing or invalid';
  end if;

  select *
    into v_connection
    from public.media_connections as c
   where c.id = v_connection_id
   for share;

  if not found then
    raise exception using
      message = 'MSFP_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_workspace_id
     or v_connection.advertiser_id <> v_advertiser_id
     or v_connection.provider <> 'naver_searchad'
     or v_connection.external_account_id <> v_external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      message = 'MSFP_SCOPE_MISMATCH: media connection does not match the job';
  end if;

  /*
   * Durable date ownership is authoritative even for zero-row dates.
   */
  v_expected_dates :=
    (v_projection_end - v_projection_start)::bigint + 1;

  select
    count(*)::bigint,
    coalesce(sum(p.row_count), 0)::bigint
    into
      v_partition_dates,
      v_partition_rows
    from public.media_sync_fact_partitions as p
   where p.workspace_id = v_workspace_id
     and p.advertiser_id = v_advertiser_id
     and p.provider = 'naver_searchad'
     and p.external_account_id = v_external_account_id
     and p.date >= v_projection_start
     and p.date <= v_projection_end;

  if v_partition_dates <> v_expected_dates then
    raise exception using
      message = 'MSFP_FACT_COVERAGE_INCOMPLETE: canonical date partitions are incomplete';
  end if;

  select count(*)::bigint
    into v_fact_rows
    from public.media_sync_fact_rows as f
   where f.workspace_id = v_workspace_id
     and f.advertiser_id = v_advertiser_id
     and f.provider = 'naver_searchad'
     and f.external_account_id = v_external_account_id
     and f.date >= v_projection_start
     and f.date <= v_projection_end;

  if v_fact_rows <> v_partition_rows then
    raise exception using
      message = 'MSFP_FACT_COUNT_MISMATCH: fact rows do not match durable partition authority';
  end if;

  v_expected_rows := v_fact_rows;

  if v_expected_rows > 2147483647 then
    raise exception using
      message = 'MSFP_INVALID_INPUT: expected rows exceed report_rows row_index capacity';
  end if;

  v_is_primary_projection :=
    v_job.report_id = v_report_id;

  if v_is_primary_projection
     and v_report.current_ingestion_id
           is distinct from v_job.previous_ingestion_id
  then
    raise exception using
      message = 'MSFP_POINTER_CHANGED: primary report pointer no longer matches job baseline';
  end if;

  v_current_ingestion_before := v_report.current_ingestion_id;
  v_published_ingestion_before := v_report.published_ingestion_id;

  select *
    into v_projection
    from public.media_sync_report_projections as p
   where p.media_sync_job_id = v_job_id
     and p.report_id = v_report_id
   for update;

  if found then
    if v_projection.workspace_id <> v_workspace_id
       or v_projection.advertiser_id <> v_advertiser_id
       or v_projection.report_id <> v_report_id
       or v_projection.created_by is distinct from v_job.created_by
    then
      raise exception using
        message = 'MSFP_PROJECTION_CONFLICT: existing projection scope is invalid';
    end if;

    v_previous_ingestion_id := v_projection.previous_ingestion_id;
    v_snapshot_ingestion_id := v_projection.snapshot_ingestion_id;

    if v_report.current_ingestion_id
         is distinct from v_previous_ingestion_id
    then
      raise exception using
        message = 'MSFP_POINTER_CHANGED: target report pointer no longer matches projection baseline';
    end if;

    if v_is_primary_projection
       and (
         v_job.previous_ingestion_id
           is distinct from v_previous_ingestion_id
         or v_job.snapshot_ingestion_id
           is distinct from v_snapshot_ingestion_id
       )
    then
      raise exception using
        message = 'MSFP_PROJECTION_CONFLICT: primary projection no longer matches job mirrors';
    end if;
  else
    v_previous_ingestion_id := v_report.current_ingestion_id;

    if v_is_primary_projection
       and v_previous_ingestion_id
             is distinct from v_job.previous_ingestion_id
    then
      raise exception using
        message = 'MSFP_POINTER_CHANGED: primary projection baseline no longer matches job mirror';
    end if;

    insert into public.report_ingestions (
      workspace_id,
      report_id,
      kind,
      status,
      csv_path,
      row_count,
      error,
      created_by,
      created_at,
      updated_at
    )
    values (
      v_workspace_id,
      v_report_id,
      'api',
      'processing',
      null,
      0,
      null,
      v_job.created_by,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    )
    returning id into v_snapshot_ingestion_id;

    begin
      insert into public.media_sync_report_projections (
        media_sync_job_id,
        workspace_id,
        advertiser_id,
        report_id,
        previous_ingestion_id,
        snapshot_ingestion_id,
        created_by
      )
      values (
        v_job_id,
        v_workspace_id,
        v_advertiser_id,
        v_report_id,
        v_previous_ingestion_id,
        v_snapshot_ingestion_id,
        v_job.created_by
      )
      returning * into v_projection;
    exception
      when unique_violation then
        raise exception using
          message = 'MSFP_PROJECTION_CONFLICT: projection identity is already bound';
    end;

    if v_is_primary_projection then
      if v_job.snapshot_ingestion_id is null then
        update public.media_sync_jobs as j
           set snapshot_ingestion_id = v_snapshot_ingestion_id,
               updated_at = pg_catalog.clock_timestamp()
         where j.id = v_job_id
           and j.status = 'processing'
           and j.snapshot_ingestion_id is null;

        if not found then
          raise exception using
            message = 'MSFP_PROJECTION_CONFLICT: primary snapshot mirror could not be recorded';
        end if;
      elsif v_job.snapshot_ingestion_id
              is distinct from v_snapshot_ingestion_id
      then
        raise exception using
          message = 'MSFP_PROJECTION_CONFLICT: primary snapshot mirror conflicts with projection';
      end if;
    end if;
  end if;

  select *
    into v_ingestion
    from public.report_ingestions as ri
   where ri.id = v_snapshot_ingestion_id
   for update;

  if not found then
    raise exception using
      message = 'MSFP_INGESTION_NOT_FOUND: projection ingestion was not found';
  end if;

  if v_ingestion.workspace_id <> v_workspace_id
     or v_ingestion.report_id <> v_report_id
     or v_ingestion.kind <> 'api'
     or v_ingestion.status not in ('processing', 'success')
     or v_ingestion.csv_path is not null
     or v_ingestion.error is not null
     or v_ingestion.created_by is distinct from v_job.created_by
  then
    raise exception using
      message = 'MSFP_INGESTION_CONFLICT: projection ingestion is invalid';
  end if;

  if v_ingestion.status = 'success' then
    if v_ingestion.row_count
         is distinct from v_expected_rows::integer
    then
      raise exception using
        message = 'MSFP_INGESTION_CONFLICT: completed ingestion row count is invalid';
    end if;

    v_next_row_index := v_expected_rows;
    v_idempotent := true;
  else
    if v_ingestion.row_count is null
       or v_ingestion.row_count < 0
       or v_ingestion.row_count > v_expected_rows
    then
      raise exception using
        message = 'MSFP_INGESTION_CONFLICT: processing ingestion checkpoint is invalid';
    end if;

    v_next_row_index := v_ingestion.row_count::bigint;
    v_idempotent := false;
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_report_id;

  if v_report.current_ingestion_id
       is distinct from v_current_ingestion_before
     or v_report.published_ingestion_id
       is distinct from v_published_ingestion_before
  then
    raise exception using
      message = 'MSFP_POINTER_CHANGED: report pointers changed during prepare';
  end if;

  select *
    into v_job
    from public.media_sync_jobs as j
   where j.id = v_job_id;

  return query
  select
    to_jsonb(v_job),
    v_report_id,
    v_previous_ingestion_id,
    v_snapshot_ingestion_id,
    v_projection_start,
    v_projection_end,
    v_expected_rows,
    v_next_row_index,
    v_idempotent;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_creative_metadata_cache_v1(p_account_key text, p_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '2000ms'
AS $function$
BEGIN
 IF p_account_key IS NULL OR p_account_key !~ '^[0-9a-f]{64}$' OR p_keys IS NULL OR cardinality(p_keys) NOT BETWEEN 1 AND 20
 OR EXISTS(SELECT 1 FROM unnest(p_keys) k WHERE k IS NULL OR k !~ '^[0-9a-f]{64}$')
 OR (SELECT count(DISTINCT k) FROM unnest(p_keys) k)<>cardinality(p_keys) THEN RAISE EXCEPTION 'INVALID_CACHE_INPUT';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('key',cache_key,'metadata',payload,'expiresAt',floor(extract(epoch FROM expires_at)*1000)) ORDER BY cache_key),'[]'::jsonb)
 FROM etrylue_creative_cache_v1.entries WHERE account_key=p_account_key AND cache_key=ANY(p_keys) AND expires_at>statement_timestamp());
END;
$function$;

CREATE OR REPLACE FUNCTION public.prune_creative_metadata_cache_v1(p_after_account_key text DEFAULT NULL::text, p_account_limit integer DEFAULT 50, p_entry_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '500ms'
 SET statement_timeout TO '2000ms'
AS $function$
DECLARE
 keys text[]; k text; a etrylue_creative_cache_v1.accounts%rowtype;
 n timestamptz; scanned integer:=0; skipped integer:=0; active integer:=0;
 removed_entries integer:=0; removed_accounts integer:=0; changed integer:=0;
 next_key text; more boolean:=false;
BEGIN
 IF (p_after_account_key IS NOT NULL AND p_after_account_key !~ '^[0-9a-f]{64}$')
  OR p_account_limit IS NULL OR p_account_limit NOT BETWEEN 1 AND 100
  OR p_entry_limit IS NULL OR p_entry_limit NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'INVALID_RETENTION_INPUT';
 END IF;
 -- Bounded keyset page, including one lookahead key; no full-table expiry scan.
 SELECT coalesce(array_agg(q.account_key ORDER BY q.account_key),'{}'::text[]) INTO keys
 FROM (SELECT account_key FROM etrylue_creative_cache_v1.accounts
       WHERE account_key>coalesce(p_after_account_key,'')
       ORDER BY account_key LIMIT p_account_limit+1) q;
 more:=cardinality(keys)>p_account_limit;
 FOREACH k IN ARRAY keys[1:p_account_limit] LOOP
  -- Resume before unprocessed accounts when the global delete budget is spent.
  IF removed_entries>=p_entry_limit THEN more:=true;EXIT;END IF;
  scanned:=scanned+1; next_key:=k;
  -- Same account-first lock order as claim/finish. Do not wait for active writers.
  SELECT * INTO a FROM etrylue_creative_cache_v1.accounts
   WHERE account_key=k FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN skipped:=skipped+1;CONTINUE;END IF;
  n:=clock_timestamp();
  IF a.lease_until>n THEN active:=active+1;CONTINUE;END IF;
  -- Preserve all material on an account whose shared cooldown still applies.
  IF a.next_allowed_at>n THEN CONTINUE;END IF;
  IF removed_entries<p_entry_limit THEN
   DELETE FROM etrylue_creative_cache_v1.entries e
   WHERE (e.account_key,e.cache_key) IN (
    SELECT x.account_key,x.cache_key FROM etrylue_creative_cache_v1.entries x
    WHERE x.account_key=k AND x.expires_at<n-interval '24 hours'
    ORDER BY x.expires_at,x.cache_key
    LIMIT least(100,p_entry_limit-removed_entries)
    FOR UPDATE SKIP LOCKED
   );
   GET DIAGNOSTICS changed=ROW_COUNT;
   removed_entries:=removed_entries+changed;
  END IF;
  -- No last-access claim: window_start is the actual last budget-window anchor.
  -- A seven-day-old anchor, expired lease/cooldown and no entries are all required.
  -- Never delete a current hourly reservation to make room for new API calls.
  IF a.window_start<n-interval '7 days'
   AND NOT EXISTS(SELECT 1 FROM etrylue_creative_cache_v1.entries WHERE account_key=k) THEN
   DELETE FROM etrylue_creative_cache_v1.accounts WHERE account_key=k;
   GET DIAGNOSTICS changed=ROW_COUNT;
   removed_accounts:=removed_accounts+changed;
  END IF;
 END LOOP;
 RETURN jsonb_build_object(
  'scannedAccounts',scanned,'skippedLockedAccounts',skipped,'activeLeaseAccounts',active,
  'deletedEntries',removed_entries,'deletedAccounts',removed_accounts,
  'nextCursor',CASE WHEN more THEN next_key ELSE NULL END,
  'sweepComplete',NOT more
 );
END;
$function$;

CREATE OR REPLACE FUNCTION public.provision_etrylue_customer(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare account etrylue_customer_private.accounts; user_email text;
begin
  select * into account from etrylue_customer_private.accounts where user_id=p_user_id for update;
  if not found then raise exception 'CUSTOMER_ACCOUNT_REQUIRED'; end if;
  select email into user_email from auth.users where id=p_user_id and email_confirmed_at is not null;
  if not found then raise exception 'CUSTOMER_EMAIL_UNVERIFIED'; end if;
  if account.provisioned_at is null then
    if exists(select 1 from public.profiles where id=p_user_id)
      or exists(select 1 from public.workspace_members where user_id=p_user_id)
      or exists(select 1 from public.tenant_members where user_id=p_user_id) then
      raise exception 'CUSTOMER_EXISTING_IDENTITY';
    end if;
    insert into public.companies(id,name) values(account.company_id,account.company_name);
    insert into public.profiles(id,company_id,name,email)
    values(p_user_id,account.company_id,account.contact_name,user_email);
    insert into public.tenants(id,name,slug,tenant_type,created_by)
    values(account.tenant_id,account.company_name,'customer-'||account.tenant_id::text,account.tenant_type,p_user_id);
    insert into public.tenant_members(tenant_id,user_id,role) values(account.tenant_id,p_user_id,'owner');
    insert into public.workspaces(id,name,created_by,owner_user_id,company_id,tenant_id,workspace_type,workspace_kind)
    values(account.workspace_id,account.company_name,p_user_id,p_user_id,account.company_id,account.tenant_id,'company','project');
    if not exists(select 1 from public.workspace_members where workspace_id=account.workspace_id and user_id=p_user_id and role='admin') then
      raise exception 'CUSTOMER_MEMBERSHIP_INVARIANT';
    end if;
    update etrylue_customer_private.accounts set provisioned_at=clock_timestamp() where user_id=p_user_id;
  end if;
  return jsonb_build_object('company_id',account.company_id,'tenant_id',account.tenant_id,'workspace_id',account.workspace_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_naver_searchads_brand_search_cross_grain_staging(p_payload jsonb)
 RETURNS TABLE(job jsonb, reconciliation_kind text, reconciliation_version integer, changed boolean, already_reconciled boolean, source_rows bigint, excluded_rows bigint, retained_rows bigint, mixed_campaign_count bigint, matched_campaign_count bigint, remaining_overlap_rows bigint, excluded_impressions numeric, excluded_clicks numeric, excluded_cost numeric, excluded_conversions numeric, excluded_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_kind constant text :=
    'brand_search_cross_grain_dedup_v1';

  v_version constant integer :=
    1;

  v_default_batch_size constant integer :=
    500;

  v_min_batch_size constant integer :=
    100;

  v_max_batch_size constant integer :=
    10000;

  v_job public.media_sync_jobs%rowtype;
  v_updated_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;
  v_batch_size integer;

  v_checkpoint jsonb;
  v_reconciliation jsonb;
  v_work jsonb;
  v_error_detail jsonb;
  v_now timestamptz :=
    pg_catalog.clock_timestamp();

  v_work_phase text;
  v_work_started_at timestamptz;
  v_cursor bigint := 0;
  v_validated_rows bigint := 0;

  v_source_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;

  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_invalid_fingerprint_rows bigint := 0;
  v_canonical_mismatch_rows bigint := 0;

  v_source_scope_mismatch_rows bigint := 0;
  v_source_blank_row_key_rows bigint := 0;
  v_source_invalid_fingerprint_rows bigint := 0;
  v_source_canonical_mismatch_rows bigint := 0;

  v_retained_scope_mismatch_rows bigint := 0;
  v_retained_blank_row_key_rows bigint := 0;
  v_retained_invalid_fingerprint_rows bigint := 0;
  v_retained_canonical_mismatch_rows bigint := 0;

  v_batch_rows bigint := 0;
  v_batch_min_row_index bigint := null;
  v_batch_max_row_index bigint := null;
  v_batch_scope_mismatch_rows bigint := 0;
  v_batch_blank_row_key_rows bigint := 0;
  v_batch_invalid_fingerprint_rows bigint := 0;
  v_batch_canonical_mismatch_rows bigint := 0;
  v_batch_remaining_overlap_rows bigint := 0;

  v_excluded_rows bigint := 0;
  v_retained_rows bigint := 0;

  v_mixed_campaign_count bigint := 0;
  v_matched_campaign_count bigint := 0;
  v_remaining_overlap_rows bigint := 0;

  v_excluded_impressions numeric := 0;
  v_excluded_clicks numeric := 0;
  v_excluded_cost numeric := 0;
  v_excluded_conversions numeric := 0;
  v_excluded_revenue numeric := 0;

  v_reindex_offset bigint := 0;
  v_reindex_required_rows bigint := 0;
  v_first_excluded_row_index bigint := null;
  v_shifted_rows bigint := 0;
  v_deleted_rows bigint := 0;
  v_reindexed_rows bigint := 0;
  v_batch_end bigint := 0;
  v_mixed_campaign_ids jsonb := '[]'::jsonb;
  v_matched_campaign_ids jsonb := '[]'::jsonb;
  v_batch_excluded_rows bigint := 0;
  v_batch_reindex_rows bigint := 0;
  v_batch_first_excluded_row_index bigint := null;
  v_batch_excluded_impressions numeric := 0;
  v_batch_excluded_clicks numeric := 0;
  v_batch_excluded_cost numeric := 0;
  v_batch_excluded_conversions numeric := 0;
  v_batch_excluded_revenue numeric := 0;
  v_affected_rows bigint := 0;

  v_existing_source_rows bigint;
  v_existing_excluded_rows bigint;
  v_existing_retained_rows bigint;
  v_existing_mixed_campaign_count bigint;
  v_existing_matched_campaign_count bigint;
  v_existing_excluded_impressions numeric;
  v_existing_excluded_clicks numeric;
  v_existing_excluded_cost numeric;
  v_existing_excluded_conversions numeric;
  v_existing_excluded_revenue numeric;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;

    v_batch_size :=
      coalesce(
        nullif(
          btrim(p_payload ->> 'batch_size'),
          ''
        )::integer,
        v_default_batch_size
      );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_date_from > v_date_to
     or v_batch_size < v_min_batch_size
     or v_batch_size > v_max_batch_size
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_INVALID_INPUT';
  end if;

  /*
   * Every append/checkpoint/reconciliation operation serializes through the
   * same job row. The lock exists only for the current bounded RPC call.
   */
  select media_job.*
  into v_job
  from public.media_sync_jobs as media_job
  where media_job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_JOB_NOT_FOUND';
  end if;

  /*
   * The locked job is the report authority. The worker intentionally omits
   * report_id from the RPC payload so an untrusted duplicate scope value
   * cannot compete with the authoritative job row.
   */
  v_report_id :=
    v_job.report_id;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_SCOPE_MISMATCH';
  end if;

  if v_job.snapshot_ingestion_id is not null
     or v_job.finished_at is not null
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_INVALID_JOB';
  end if;

  if jsonb_typeof(v_job.error_detail) <> 'object'
     or jsonb_typeof(
       v_job.error_detail -> 'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_CHECKPOINT_NOT_COMPLETED';
  end if;

  v_checkpoint :=
    v_job.error_detail -> 'processing_checkpoint';

  if v_checkpoint #>> '{collector,phase}'
       is distinct from 'completed'
     or v_checkpoint #>> '{collector,keyword,complete}'
       is distinct from 'true'
     or v_checkpoint #>> '{collector,authoritative,complete}'
       is distinct from 'true'
     or v_checkpoint #>> '{failed_rows}'
       is distinct from '0'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_CHECKPOINT_NOT_COMPLETED';
  end if;

  v_reconciliation :=
    v_checkpoint -> 'reconciliation';

  /*
   * Idempotent completed response. This path intentionally performs only
   * bounded structural checks because the retained rows were already fully
   * batch-validated before the audit was committed.
   */
  if v_reconciliation is not null
     and v_reconciliation <> 'null'::jsonb
  then
    if jsonb_typeof(v_reconciliation) <> 'object'
       or v_reconciliation ->> 'kind'
          is distinct from v_kind
       or v_reconciliation ->> 'version'
          is distinct from v_version::text
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    begin
      v_existing_source_rows :=
        (v_reconciliation ->> 'source_rows')::bigint;
      v_existing_excluded_rows :=
        (v_reconciliation ->> 'excluded_rows')::bigint;
      v_existing_retained_rows :=
        (v_reconciliation ->> 'retained_rows')::bigint;
      v_existing_mixed_campaign_count :=
        (v_reconciliation ->> 'mixed_campaign_count')::bigint;
      v_existing_matched_campaign_count :=
        (v_reconciliation ->> 'matched_campaign_count')::bigint;
      v_existing_excluded_impressions :=
        (v_reconciliation ->> 'excluded_impressions')::numeric;
      v_existing_excluded_clicks :=
        (v_reconciliation ->> 'excluded_clicks')::numeric;
      v_existing_excluded_cost :=
        (v_reconciliation ->> 'excluded_cost')::numeric;
      v_existing_excluded_conversions :=
        (v_reconciliation ->> 'excluded_conversions')::numeric;
      v_existing_excluded_revenue :=
        (v_reconciliation ->> 'excluded_revenue')::numeric;
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'NSBGR_RECONCILIATION_CONFLICT';
    end;

    if v_existing_source_rows < 0
       or v_existing_excluded_rows < 0
       or v_existing_retained_rows < 0
       or v_existing_source_rows -
          v_existing_excluded_rows <>
          v_existing_retained_rows
       or v_existing_mixed_campaign_count < 0
       or v_existing_matched_campaign_count < 0
       or v_existing_matched_campaign_count >
          v_existing_mixed_campaign_count
       or v_expected_rows <> v_existing_retained_rows
       or v_job.raw_rows <> v_existing_retained_rows
       or v_job.normalized_rows <> v_existing_retained_rows
       or v_job.inserted_rows <> v_existing_retained_rows
       or v_checkpoint #>> '{raw_rows}'
          is distinct from v_existing_retained_rows::text
       or v_checkpoint #>> '{normalized_rows}'
          is distinct from v_existing_retained_rows::text
       or v_checkpoint #>> '{inserted_rows}'
          is distinct from v_existing_retained_rows::text
       or v_checkpoint #>> '{collector,next_row_index}'
          is distinct from v_existing_retained_rows::text
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    select
      count(staging.id)::bigint,
      min(staging.row_index),
      max(staging.row_index),
      count(distinct staging.row_index)::bigint,
      count(staging.id) filter (
        where staging.report_id <> v_report_id
           or staging.workspace_id <> v_workspace_id
           or staging.advertiser_id <> v_advertiser_id
           or staging.connection_id <> v_connection_id
           or staging.provider <> v_provider
           or staging.external_account_id <>
              v_external_account_id
           or staging.date_from <> v_date_from
           or staging.date_to <> v_date_to
           or staging.date < v_date_from
           or staging.date > v_date_to
      )::bigint,
      count(staging.id) filter (
        where btrim(staging.row_key) = ''
      )::bigint
    into
      v_source_rows,
      v_min_row_index,
      v_max_row_index,
      v_distinct_row_indexes,
      v_scope_mismatch_rows,
      v_blank_row_key_rows
    from public.media_sync_staging_rows as staging
    where staging.job_id = v_job_id;

    select count(*)::bigint
    into v_remaining_overlap_rows
    from public.media_sync_staging_rows as keyword_row
    where keyword_row.job_id = v_job_id
      and keyword_row.row ->> 'row_level' = 'keyword'
      and keyword_row.row ->> 'data_level' = 'keyword'
      and keyword_row.row ->> 'row_level_reason' =
          'naver_searchad_registered_keyword_daily_stats'
      and keyword_row.row #>> '{provider_meta,campaign_type}' =
          'BRAND_SEARCH'
      and exists (
        select 1
        from public.media_sync_staging_rows as mixed_row
        where mixed_row.job_id = v_job_id
          and mixed_row.row ->> 'row_level' = 'mixed'
          and mixed_row.row ->> 'data_level' = 'mixed'
          and mixed_row.row ->> 'row_level_reason' =
              'naver_searchad_brand_search_adgroup_daily_stats'
          and mixed_row.row #>> '{provider_meta,campaign_type}' =
              'BRAND_SEARCH'
          and mixed_row.row #>> '{provider_meta,authoritative_grain}' =
              'adgroup'
          and nullif(
                btrim(
                  mixed_row.row ->> 'external_campaign_id'
                ),
                ''
              ) =
              nullif(
                btrim(
                  keyword_row.row ->> 'external_campaign_id'
                ),
                ''
              )
      );

    if v_source_rows <> v_existing_retained_rows
       or v_distinct_row_indexes <> v_existing_retained_rows
       or (
         v_existing_retained_rows = 0
         and (
           v_min_row_index is not null
           or v_max_row_index is not null
         )
       )
       or (
         v_existing_retained_rows > 0
         and (
           v_min_row_index <> 0
           or v_max_row_index <>
              v_existing_retained_rows - 1
         )
       )
       or v_scope_mismatch_rows <> 0
       or v_blank_row_key_rows <> 0
       or v_remaining_overlap_rows <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    return query
    select
      to_jsonb(v_job),
      v_kind,
      v_version,
      false,
      true,
      v_existing_source_rows,
      v_existing_excluded_rows,
      v_existing_retained_rows,
      v_existing_mixed_campaign_count,
      v_existing_matched_campaign_count,
      v_remaining_overlap_rows,
      v_existing_excluded_impressions,
      v_existing_excluded_clicks,
      v_existing_excluded_cost,
      v_existing_excluded_conversions,
      v_existing_excluded_revenue;

    return;
  end if;

  if v_job.raw_rows <> v_expected_rows
     or v_job.normalized_rows <> v_expected_rows
     or v_job.inserted_rows <> v_expected_rows
     or v_checkpoint #>> '{raw_rows}'
        is distinct from v_expected_rows::text
     or v_checkpoint #>> '{normalized_rows}'
        is distinct from v_expected_rows::text
     or v_checkpoint #>> '{inserted_rows}'
        is distinct from v_expected_rows::text
     or v_checkpoint #>> '{collector,next_row_index}'
        is distinct from v_expected_rows::text
  then
    raise exception using
      errcode = 'P0001',
      message = 'NSBGR_CHECKPOINT_NOT_COMPLETED';
  end if;

  v_work :=
    v_checkpoint -> 'reconciliation_work';

  if v_work is null
     or v_work = 'null'::jsonb
  then
    v_work_started_at := v_now;
    v_work_phase := 'source_validation';
    v_cursor := 0;
    v_validated_rows := 0;
    v_source_rows := v_expected_rows;
    v_retained_rows := v_expected_rows;

    v_work :=
      jsonb_build_object(
        'kind', v_kind,
        'version', v_version,
        'phase', v_work_phase,
        'source_rows', v_source_rows,
        'excluded_rows', 0,
        'retained_rows', v_retained_rows,
        'mixed_campaign_count', 0,
        'matched_campaign_count', 0,
        'excluded_impressions', 0,
        'excluded_clicks', 0,
        'excluded_cost', 0,
        'excluded_conversions', 0,
        'excluded_revenue', 0,
        'cursor', v_cursor,
        'validated_rows', v_validated_rows,
        'source_scope_mismatch_rows', 0,
        'source_blank_row_key_rows', 0,
        'source_invalid_fingerprint_rows', 0,
        'source_canonical_mismatch_rows', 0,
        'retained_scope_mismatch_rows', 0,
        'retained_blank_row_key_rows', 0,
        'retained_invalid_fingerprint_rows', 0,
        'retained_canonical_mismatch_rows', 0,
        'batch_size', v_batch_size,
        'started_at', to_jsonb(v_work_started_at),
        'updated_at', to_jsonb(v_now)
      );
  else
    if jsonb_typeof(v_work) <> 'object'
       or v_work ->> 'kind' is distinct from v_kind
       or v_work ->> 'version' is distinct from v_version::text
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    begin
      v_work_phase :=
        v_work ->> 'phase';
      v_work_started_at :=
        (v_work ->> 'started_at')::timestamptz;
      v_source_rows :=
        (v_work ->> 'source_rows')::bigint;
      v_excluded_rows :=
        (v_work ->> 'excluded_rows')::bigint;
      v_retained_rows :=
        (v_work ->> 'retained_rows')::bigint;
      v_mixed_campaign_count :=
        (v_work ->> 'mixed_campaign_count')::bigint;
      v_matched_campaign_count :=
        (v_work ->> 'matched_campaign_count')::bigint;
      v_excluded_impressions :=
        (v_work ->> 'excluded_impressions')::numeric;
      v_excluded_clicks :=
        (v_work ->> 'excluded_clicks')::numeric;
      v_excluded_cost :=
        (v_work ->> 'excluded_cost')::numeric;
      v_excluded_conversions :=
        (v_work ->> 'excluded_conversions')::numeric;
      v_excluded_revenue :=
        (v_work ->> 'excluded_revenue')::numeric;
      v_cursor :=
        (v_work ->> 'cursor')::bigint;
      v_validated_rows :=
        (v_work ->> 'validated_rows')::bigint;
      v_source_scope_mismatch_rows :=
        (v_work ->> 'source_scope_mismatch_rows')::bigint;
      v_source_blank_row_key_rows :=
        (v_work ->> 'source_blank_row_key_rows')::bigint;
      v_source_invalid_fingerprint_rows :=
        (v_work ->> 'source_invalid_fingerprint_rows')::bigint;
      v_source_canonical_mismatch_rows :=
        (v_work ->> 'source_canonical_mismatch_rows')::bigint;
      v_retained_scope_mismatch_rows :=
        (v_work ->> 'retained_scope_mismatch_rows')::bigint;
      v_retained_blank_row_key_rows :=
        (v_work ->> 'retained_blank_row_key_rows')::bigint;
      v_retained_invalid_fingerprint_rows :=
        (v_work ->> 'retained_invalid_fingerprint_rows')::bigint;
      v_retained_canonical_mismatch_rows :=
        (v_work ->> 'retained_canonical_mismatch_rows')::bigint;
      v_reindex_required_rows :=
        coalesce(nullif(v_work ->> 'reindex_required_rows', '')::bigint, 0);
      v_first_excluded_row_index :=
        nullif(v_work ->> 'first_excluded_row_index', '')::bigint;
      v_reindex_offset :=
        coalesce(nullif(v_work ->> 'reindex_offset', '')::bigint, 0);
      v_shifted_rows :=
        coalesce(nullif(v_work ->> 'shifted_rows', '')::bigint, 0);
      v_deleted_rows :=
        coalesce(nullif(v_work ->> 'deleted_rows', '')::bigint, 0);
      v_reindexed_rows :=
        coalesce(nullif(v_work ->> 'reindexed_rows', '')::bigint, 0);
      v_mixed_campaign_ids :=
        coalesce(v_work -> 'mixed_campaign_ids', '[]'::jsonb);
      v_matched_campaign_ids :=
        coalesce(v_work -> 'matched_campaign_ids', '[]'::jsonb);
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'NSBGR_RECONCILIATION_CONFLICT';
    end;

    if v_work_phase not in (
         'source_validation',
         'mutation',
         'mutation_discover',
         'mutation_classify',
         'mutation_shift',
         'mutation_delete',
         'mutation_reindex',
         'mutation_verify',
         'retained_validation',
         'finalization'
       )
       or v_work_started_at is null
       or v_source_rows < 0
       or v_excluded_rows < 0
       or v_retained_rows < 0
       or v_source_rows - v_excluded_rows <> v_retained_rows
       or v_mixed_campaign_count < 0
       or v_matched_campaign_count < 0
       or v_matched_campaign_count > v_mixed_campaign_count
       or v_cursor < 0
       or v_validated_rows < 0
       or v_cursor <> v_validated_rows
       or v_reindex_required_rows < 0
       or v_shifted_rows < 0
       or v_deleted_rows < 0
       or v_reindexed_rows < 0
       or v_shifted_rows > v_reindex_required_rows
       or v_deleted_rows > v_excluded_rows
       or v_reindexed_rows > v_reindex_required_rows
       or jsonb_typeof(v_mixed_campaign_ids) <> 'array'
       or jsonb_typeof(v_matched_campaign_ids) <> 'array'
       or jsonb_array_length(v_mixed_campaign_ids) <> v_mixed_campaign_count
       or jsonb_array_length(v_matched_campaign_ids) <> v_matched_campaign_count
       or (
         v_work_phase in (
           'mutation_shift',
           'mutation_delete',
           'mutation_reindex',
           'mutation_verify'
         )
         and (
           v_excluded_rows <= 0
           or v_first_excluded_row_index is null
           or v_first_excluded_row_index < 0
           or v_first_excluded_row_index >= v_source_rows
           or v_reindex_offset <> v_source_rows + 1
           or v_reindex_required_rows <>
              v_retained_rows - v_first_excluded_row_index
         )
       )
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;
  end if;

  /*
   * Phase 1: validate source rows in bounded row_index batches.
   */
  if v_work_phase = 'source_validation' then
    if v_expected_rows <> v_source_rows
       or v_retained_rows <> v_source_rows
       or v_excluded_rows <> 0
       or v_cursor > v_source_rows
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    with batch as materialized (
      select staging.*
      from public.media_sync_staging_rows as staging
      where staging.job_id = v_job_id
        and staging.row_index >= v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    )
    select
      count(batch.id)::bigint,
      min(batch.row_index),
      max(batch.row_index),
      count(batch.id) filter (
        where batch.report_id <> v_report_id
           or batch.workspace_id <> v_workspace_id
           or batch.advertiser_id <> v_advertiser_id
           or batch.connection_id <> v_connection_id
           or batch.provider <> v_provider
           or batch.external_account_id <>
              v_external_account_id
           or batch.date_from <> v_date_from
           or batch.date_to <> v_date_to
           or batch.date < v_date_from
           or batch.date > v_date_to
      )::bigint,
      count(batch.id) filter (
        where btrim(batch.row_key) = ''
      )::bigint,
      count(batch.id) filter (
        where batch.row_fingerprint is null
           or batch.row_fingerprint !~ '^[0-9a-f]{64}$'
           or batch.row_fingerprint is distinct from
              encode(
                extensions.digest(
                  pg_catalog.convert_to(
                    batch.row::text,
                    'UTF8'
                  ),
                  'sha256'
                ),
                'hex'
              )
      )::bigint,
      count(batch.id) filter (
        where jsonb_typeof(batch.row) <> 'object'
           or coalesce(batch.row ->> 'date', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'report_date', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'day', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'ymd', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'channel', '') <>
              coalesce(batch.channel, '')
           or coalesce(batch.row ->> 'device', '') <>
              coalesce(batch.device, '')
           or coalesce(batch.row ->> 'source', '') <>
              coalesce(batch.source, '')
           or coalesce(batch.row ->> 'provider', '') <>
              'naver_searchad'
           or coalesce(
                batch.row ->> 'external_account_id',
                ''
              ) <> v_external_account_id
           or coalesce(
                batch.row ->> 'ingestion_source',
                ''
              ) <> 'api'
      )::bigint
    into
      v_batch_rows,
      v_batch_min_row_index,
      v_batch_max_row_index,
      v_batch_scope_mismatch_rows,
      v_batch_blank_row_key_rows,
      v_batch_invalid_fingerprint_rows,
      v_batch_canonical_mismatch_rows
    from batch;

    if v_batch_rows > 0
       and (
         v_batch_min_row_index <> v_cursor
         or v_batch_max_row_index <>
            v_cursor + v_batch_rows - 1
       )
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_STAGING_CHANGED';
    end if;

    v_cursor :=
      v_cursor + v_batch_rows;
    v_validated_rows :=
      v_validated_rows + v_batch_rows;
    v_source_scope_mismatch_rows :=
      v_source_scope_mismatch_rows +
      v_batch_scope_mismatch_rows;
    v_source_blank_row_key_rows :=
      v_source_blank_row_key_rows +
      v_batch_blank_row_key_rows;
    v_source_invalid_fingerprint_rows :=
      v_source_invalid_fingerprint_rows +
      v_batch_invalid_fingerprint_rows;
    v_source_canonical_mismatch_rows :=
      v_source_canonical_mismatch_rows +
      v_batch_canonical_mismatch_rows;

    if v_cursor > v_source_rows
       or v_validated_rows <> v_cursor
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_STAGING_CHANGED';
    end if;

    if v_cursor = v_source_rows then
      /*
       * The unique (job_id, row_index) contract plus every bounded batch's
       * contiguous min/max proof establishes the complete 0..N-1 range.
       * Recounting and count(distinct) across the whole staging set here made
       * an otherwise bounded step scale with multi-million-row jobs.
       */
      if v_source_scope_mismatch_rows <> 0
         or v_source_blank_row_key_rows <> 0
         or v_source_invalid_fingerprint_rows <> 0
         or v_source_canonical_mismatch_rows <> 0
      then
        raise exception using
          errcode = 'P0001',
          message = 'NSBGR_STAGING_CHANGED';
      end if;

      v_work_phase :=
        'mutation';
      v_cursor := 0;
      v_validated_rows := 0;
    elsif v_batch_rows = 0 then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_STAGING_CHANGED';
    end if;

    v_work :=
      jsonb_build_object(
        'kind', v_kind,
        'version', v_version,
        'phase', v_work_phase,
        'source_rows', v_source_rows,
        'excluded_rows', 0,
        'retained_rows', v_source_rows,
        'mixed_campaign_count', 0,
        'matched_campaign_count', 0,
        'excluded_impressions', 0,
        'excluded_clicks', 0,
        'excluded_cost', 0,
        'excluded_conversions', 0,
        'excluded_revenue', 0,
        'cursor', v_cursor,
        'validated_rows', v_validated_rows,
        'source_scope_mismatch_rows',
          v_source_scope_mismatch_rows,
        'source_blank_row_key_rows',
          v_source_blank_row_key_rows,
        'source_invalid_fingerprint_rows',
          v_source_invalid_fingerprint_rows,
        'source_canonical_mismatch_rows',
          v_source_canonical_mismatch_rows,
        'retained_scope_mismatch_rows', 0,
        'retained_blank_row_key_rows', 0,
        'retained_invalid_fingerprint_rows', 0,
        'retained_canonical_mismatch_rows', 0,
        'batch_size', v_batch_size,
        'started_at', to_jsonb(v_work_started_at),
        'updated_at', to_jsonb(v_now)
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{saved_at}',
        to_jsonb(v_now),
        true
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{reconciliation_work}',
        v_work,
        true
      );

    v_error_detail :=
      jsonb_set(
        v_job.error_detail,
        '{processing_checkpoint}',
        v_checkpoint,
        true
      );

    update public.media_sync_jobs as media_job
    set error_detail = v_error_detail,
        updated_at = v_now
    where media_job.id = v_job_id
      and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null
      and media_job.finished_at is null;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '40001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    select media_job.*
    into v_updated_job
    from public.media_sync_jobs as media_job
    where media_job.id = v_job_id;

    return query
    select
      to_jsonb(v_updated_job),
      v_kind,
      v_version,
      false,
      false,
      v_source_rows,
      0::bigint,
      v_source_rows,
      0::bigint,
      0::bigint,
      0::bigint,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric,
      0::numeric;

    return;
  end if;

  /* Phase 2a: initialize bounded discovery from the legacy mutation state. */
  if v_work_phase = 'mutation' then
    if v_expected_rows <> v_source_rows
       or v_cursor <> 0
       or v_validated_rows <> 0
       or v_source_scope_mismatch_rows <> 0
       or v_source_blank_row_key_rows <> 0
       or v_source_invalid_fingerprint_rows <> 0
       or v_source_canonical_mismatch_rows <> 0
    then
      raise exception using errcode = 'P0001', message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    v_work_phase := 'mutation_discover';
    v_cursor := 0;
    v_validated_rows := 0;
    v_excluded_rows := 0;
    v_retained_rows := v_source_rows;
    v_mixed_campaign_count := 0;
    v_matched_campaign_count := 0;
    v_excluded_impressions := 0;
    v_excluded_clicks := 0;
    v_excluded_cost := 0;
    v_excluded_conversions := 0;
    v_excluded_revenue := 0;
    v_reindex_required_rows := 0;
    v_first_excluded_row_index := null;
    v_reindex_offset := 0;
    v_shifted_rows := 0;
    v_deleted_rows := 0;
    v_reindexed_rows := 0;
    v_mixed_campaign_ids := '[]'::jsonb;
    v_matched_campaign_ids := '[]'::jsonb;

    v_work := jsonb_build_object(
      'kind', v_kind, 'version', v_version, 'phase', v_work_phase,
      'source_rows', v_source_rows, 'excluded_rows', v_excluded_rows,
      'retained_rows', v_retained_rows,
      'mixed_campaign_count', v_mixed_campaign_count,
      'matched_campaign_count', v_matched_campaign_count,
      'excluded_impressions', v_excluded_impressions,
      'excluded_clicks', v_excluded_clicks,
      'excluded_cost', v_excluded_cost,
      'excluded_conversions', v_excluded_conversions,
      'excluded_revenue', v_excluded_revenue,
      'cursor', v_cursor, 'validated_rows', v_validated_rows,
      'source_scope_mismatch_rows', v_source_scope_mismatch_rows,
      'source_blank_row_key_rows', v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows', v_source_invalid_fingerprint_rows,
      'source_canonical_mismatch_rows', v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows', 0,
      'retained_blank_row_key_rows', 0,
      'retained_invalid_fingerprint_rows', 0,
      'retained_canonical_mismatch_rows', 0,
      'reindex_required_rows', v_reindex_required_rows,
      'first_excluded_row_index', to_jsonb(v_first_excluded_row_index),
      'reindex_offset', v_reindex_offset,
      'shifted_rows', v_shifted_rows,
      'deleted_rows', v_deleted_rows,
      'reindexed_rows', v_reindexed_rows,
      'mixed_campaign_ids', v_mixed_campaign_ids,
      'matched_campaign_ids', v_matched_campaign_ids,
      'batch_size', v_batch_size,
      'started_at', to_jsonb(v_work_started_at),
      'updated_at', to_jsonb(v_now)
    );

    v_checkpoint := jsonb_set(v_checkpoint, '{saved_at}', to_jsonb(v_now), true);
    v_checkpoint := jsonb_set(v_checkpoint, '{reconciliation_work}', v_work, true);
    v_error_detail := jsonb_set(v_job.error_detail, '{processing_checkpoint}', v_checkpoint, true);

    update public.media_sync_jobs as media_job
    set error_detail = v_error_detail, updated_at = v_now
    where media_job.id = v_job_id
      and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null
      and media_job.finished_at is null;
    get diagnostics v_affected_rows = row_count;
    if v_affected_rows <> 1 then
      raise exception using errcode = '40001', message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id = v_job_id;
    return query select to_jsonb(v_updated_job), v_kind, v_version, false, false,
      v_source_rows, 0::bigint, v_source_rows, 0::bigint, 0::bigint,
      0::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  /* Phase 2b: discover authoritative BRAND_SEARCH campaign IDs in bounded batches. */
  if v_work_phase = 'mutation_discover' then
    if v_expected_rows <> v_source_rows
       or v_excluded_rows <> 0
       or v_retained_rows <> v_source_rows
       or v_cursor > v_source_rows
    then
      raise exception using errcode = 'P0001', message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    with batch as materialized (
      select staging.*
      from public.media_sync_staging_rows as staging
      where staging.job_id = v_job_id and staging.row_index >= v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    ),
    all_ids as (
      select value as campaign_id
      from jsonb_array_elements_text(v_mixed_campaign_ids)
      union
      select nullif(btrim(batch.row ->> 'external_campaign_id'), '') as campaign_id
      from batch
      where batch.row ->> 'row_level' = 'mixed'
        and batch.row ->> 'data_level' = 'mixed'
        and batch.row ->> 'row_level_reason' =
            'naver_searchad_brand_search_adgroup_daily_stats'
        and batch.row #>> '{provider_meta,campaign_type}' = 'BRAND_SEARCH'
        and batch.row #>> '{provider_meta,authoritative_grain}' = 'adgroup'
        and nullif(btrim(batch.row ->> 'external_campaign_id'), '') is not null
    )
    select
      (select count(*)::bigint from batch),
      (select min(batch.row_index)::bigint from batch),
      (select max(batch.row_index)::bigint from batch),
      coalesce(
        (select jsonb_agg(all_ids.campaign_id order by all_ids.campaign_id) from all_ids),
        '[]'::jsonb
      )
    into v_batch_rows, v_batch_min_row_index, v_batch_max_row_index, v_mixed_campaign_ids;

    if v_batch_rows > 0 and (
         v_batch_min_row_index <> v_cursor
         or v_batch_max_row_index <> v_cursor + v_batch_rows - 1
       )
    then
      raise exception using errcode = 'P0001', message = 'NSBGR_STAGING_CHANGED';
    end if;

    v_cursor := v_cursor + v_batch_rows;
    v_validated_rows := v_cursor;
    v_mixed_campaign_count := jsonb_array_length(v_mixed_campaign_ids);

    if v_cursor = v_source_rows then
      v_work_phase := 'mutation_classify';
      v_cursor := 0;
      v_validated_rows := 0;
    elsif v_batch_rows = 0 then
      raise exception using errcode = 'P0001', message = 'NSBGR_STAGING_CHANGED';
    end if;

    v_work := jsonb_build_object(
      'kind', v_kind, 'version', v_version, 'phase', v_work_phase,
      'source_rows', v_source_rows, 'excluded_rows', 0,
      'retained_rows', v_source_rows,
      'mixed_campaign_count', v_mixed_campaign_count,
      'matched_campaign_count', 0,
      'excluded_impressions', 0, 'excluded_clicks', 0,
      'excluded_cost', 0, 'excluded_conversions', 0, 'excluded_revenue', 0,
      'cursor', v_cursor, 'validated_rows', v_validated_rows,
      'source_scope_mismatch_rows', v_source_scope_mismatch_rows,
      'source_blank_row_key_rows', v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows', v_source_invalid_fingerprint_rows,
      'source_canonical_mismatch_rows', v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows', 0,
      'retained_blank_row_key_rows', 0,
      'retained_invalid_fingerprint_rows', 0,
      'retained_canonical_mismatch_rows', 0,
      'reindex_required_rows', 0,
      'first_excluded_row_index', to_jsonb(null::bigint),
      'reindex_offset', 0,
      'shifted_rows', 0, 'deleted_rows', 0, 'reindexed_rows', 0,
      'mixed_campaign_ids', v_mixed_campaign_ids,
      'matched_campaign_ids', '[]'::jsonb,
      'batch_size', v_batch_size,
      'started_at', to_jsonb(v_work_started_at), 'updated_at', to_jsonb(v_now)
    );

    v_checkpoint := jsonb_set(v_checkpoint, '{saved_at}', to_jsonb(v_now), true);
    v_checkpoint := jsonb_set(v_checkpoint, '{reconciliation_work}', v_work, true);
    v_error_detail := jsonb_set(v_job.error_detail, '{processing_checkpoint}', v_checkpoint, true);
    update public.media_sync_jobs as media_job
    set error_detail = v_error_detail, updated_at = v_now
    where media_job.id = v_job_id and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows = row_count;
    if v_affected_rows <> 1 then raise exception using errcode='40001', message='NSBGR_RECONCILIATION_CONFLICT'; end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job), v_kind, v_version, false, false,
      v_source_rows, 0::bigint, v_source_rows, v_mixed_campaign_count, 0::bigint,
      0::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  /* Phase 2c: classify exact exclusions and metrics in bounded batches. */
  if v_work_phase = 'mutation_classify' then
    if v_expected_rows <> v_source_rows or v_cursor > v_source_rows
       or v_mixed_campaign_count <> jsonb_array_length(v_mixed_campaign_ids)
    then
      raise exception using errcode='P0001', message='NSBGR_RECONCILIATION_CONFLICT';
    end if;

    with batch as materialized (
      select staging.* from public.media_sync_staging_rows as staging
      where staging.job_id=v_job_id and staging.row_index>=v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    ),
    mixed_ids as materialized (
      select value as campaign_id from jsonb_array_elements_text(v_mixed_campaign_ids)
    ),
    classified as materialized (
      select batch.*,
        nullif(btrim(batch.row ->> 'external_campaign_id'),'') as campaign_id,
        (
          batch.row ->> 'row_level'='keyword'
          and batch.row ->> 'data_level'='keyword'
          and batch.row ->> 'row_level_reason'='naver_searchad_registered_keyword_daily_stats'
          and batch.row #>> '{provider_meta,campaign_type}'='BRAND_SEARCH'
          and exists (
            select 1 from mixed_ids
            where mixed_ids.campaign_id=nullif(btrim(batch.row ->> 'external_campaign_id'),'')
          )
        ) as excluded
      from batch
    ),
    stats as (
      select min(classified.row_index) filter(where classified.excluded)::bigint as batch_first
      from classified
    ),
    all_matched as (
      select value as campaign_id from jsonb_array_elements_text(v_matched_campaign_ids)
      union
      select classified.campaign_id from classified
      where classified.excluded and classified.campaign_id is not null
    )
    select
      (select count(*)::bigint from classified),
      (select min(row_index)::bigint from classified),
      (select max(row_index)::bigint from classified),
      (select count(*) filter(where excluded)::bigint from classified),
      (select batch_first from stats),
      (
        select count(*) filter(
          where not classified.excluded
            and classified.row_index >= coalesce(v_first_excluded_row_index, stats.batch_first)
        )::bigint
        from classified cross join stats
      ),
      coalesce((select sum(coalesce((row ->> 'impressions')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select sum(coalesce((row ->> 'clicks')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select sum(coalesce((row ->> 'cost')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select sum(coalesce((row ->> 'conversions')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select sum(coalesce((row ->> 'revenue')::numeric,0)) filter(where excluded) from classified),0),
      coalesce((select jsonb_agg(all_matched.campaign_id order by all_matched.campaign_id) from all_matched),'[]'::jsonb)
    into
      v_batch_rows, v_batch_min_row_index, v_batch_max_row_index,
      v_batch_excluded_rows, v_batch_first_excluded_row_index,
      v_batch_reindex_rows,
      v_batch_excluded_impressions, v_batch_excluded_clicks,
      v_batch_excluded_cost, v_batch_excluded_conversions,
      v_batch_excluded_revenue, v_matched_campaign_ids;

    if v_batch_rows>0 and (
      v_batch_min_row_index<>v_cursor or v_batch_max_row_index<>v_cursor+v_batch_rows-1
    ) then raise exception using errcode='P0001', message='NSBGR_STAGING_CHANGED'; end if;

    if v_first_excluded_row_index is null and v_batch_first_excluded_row_index is not null then
      v_first_excluded_row_index := v_batch_first_excluded_row_index;
    end if;
    v_excluded_rows := v_excluded_rows + v_batch_excluded_rows;
    v_retained_rows := v_source_rows - v_excluded_rows;
    v_reindex_required_rows := v_reindex_required_rows + v_batch_reindex_rows;
    v_excluded_impressions := v_excluded_impressions + v_batch_excluded_impressions;
    v_excluded_clicks := v_excluded_clicks + v_batch_excluded_clicks;
    v_excluded_cost := v_excluded_cost + v_batch_excluded_cost;
    v_excluded_conversions := v_excluded_conversions + v_batch_excluded_conversions;
    v_excluded_revenue := v_excluded_revenue + v_batch_excluded_revenue;
    v_matched_campaign_count := jsonb_array_length(v_matched_campaign_ids);
    v_cursor := v_cursor + v_batch_rows;
    v_validated_rows := v_cursor;

    if v_cursor=v_source_rows then
      if v_excluded_rows<0 or v_retained_rows<0
         or v_excluded_rows+v_retained_rows<>v_source_rows
         or v_matched_campaign_count>v_mixed_campaign_count
         or (
           v_excluded_rows=0 and (v_first_excluded_row_index is not null or v_reindex_required_rows<>0)
         )
         or (
           v_excluded_rows>0 and (
             v_first_excluded_row_index is null
             or v_reindex_required_rows<>v_retained_rows-v_first_excluded_row_index
           )
         )
      then raise exception using errcode='P0001', message='NSBGR_RECONCILIATION_CONFLICT'; end if;

      if v_excluded_rows=0 then
        v_work_phase:='retained_validation'; v_cursor:=0; v_validated_rows:=0; v_reindex_offset:=0;
      else
        v_work_phase:='mutation_shift'; v_cursor:=v_first_excluded_row_index; v_validated_rows:=v_cursor;
        v_reindex_offset:=v_source_rows+1;
      end if;
    elsif v_batch_rows=0 then
      raise exception using errcode='P0001', message='NSBGR_STAGING_CHANGED';
    end if;

    v_work:=jsonb_build_object(
      'kind',v_kind,'version',v_version,'phase',v_work_phase,
      'source_rows',v_source_rows,'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,
      'mixed_campaign_count',v_mixed_campaign_count,'matched_campaign_count',v_matched_campaign_count,
      'excluded_impressions',v_excluded_impressions,'excluded_clicks',v_excluded_clicks,
      'excluded_cost',v_excluded_cost,'excluded_conversions',v_excluded_conversions,
      'excluded_revenue',v_excluded_revenue,'cursor',v_cursor,'validated_rows',v_validated_rows,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,
      'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,
      'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,
      'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,
      'first_excluded_row_index',to_jsonb(v_first_excluded_row_index),
      'reindex_offset',v_reindex_offset,'shifted_rows',0,'deleted_rows',0,'reindexed_rows',0,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now)
    );
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set error_detail=v_error_detail,updated_at=v_now
    where media_job.id=v_job_id and media_job.status='processing' and media_job.updated_at=v_job.updated_at
      and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;
    if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT'; end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,false,false,
      v_source_rows,v_excluded_rows,v_retained_rows,v_mixed_campaign_count,v_matched_campaign_count,
      v_excluded_rows,v_excluded_impressions,v_excluded_clicks,v_excluded_cost,
      v_excluded_conversions,v_excluded_revenue;
    return;
  end if;

  /* Phase 2d: shift one bounded original row-index range to temporary indexes. */
  if v_work_phase='mutation_shift' then
    if v_expected_rows<>v_source_rows or v_cursor<v_first_excluded_row_index or v_cursor>v_source_rows
       or v_shifted_rows>v_reindex_required_rows
    then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT'; end if;
    v_batch_end:=least(v_cursor+v_batch_size::bigint,v_source_rows);
    with mixed_ids as materialized (
      select value as campaign_id from jsonb_array_elements_text(v_mixed_campaign_ids)
    ), targets as materialized (
      select staging.id from public.media_sync_staging_rows as staging
      where staging.job_id=v_job_id and staging.row_index>=v_cursor and staging.row_index<v_batch_end
        and not (
          staging.row ->> 'row_level'='keyword' and staging.row ->> 'data_level'='keyword'
          and staging.row ->> 'row_level_reason'='naver_searchad_registered_keyword_daily_stats'
          and staging.row #>> '{provider_meta,campaign_type}'='BRAND_SEARCH'
          and exists(select 1 from mixed_ids where mixed_ids.campaign_id=nullif(btrim(staging.row ->> 'external_campaign_id'),''))
        )
    )
    update public.media_sync_staging_rows as staging set row_index=staging.row_index+v_reindex_offset
    from targets where staging.id=targets.id;
    get diagnostics v_affected_rows=row_count;
    v_shifted_rows:=v_shifted_rows+v_affected_rows; v_cursor:=v_batch_end; v_validated_rows:=v_cursor;
    if v_shifted_rows>v_reindex_required_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT'; end if;
    if v_cursor=v_source_rows then
      if v_shifted_rows<>v_reindex_required_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT'; end if;
      v_work_phase:='mutation_delete';v_cursor:=0;v_validated_rows:=0;
    end if;
    v_work:=jsonb_build_object(
      'kind',v_kind,'version',v_version,'phase',v_work_phase,'source_rows',v_source_rows,
      'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,
      'mixed_campaign_count',v_mixed_campaign_count,'matched_campaign_count',v_matched_campaign_count,
      'excluded_impressions',v_excluded_impressions,'excluded_clicks',v_excluded_clicks,
      'excluded_cost',v_excluded_cost,'excluded_conversions',v_excluded_conversions,'excluded_revenue',v_excluded_revenue,
      'cursor',v_cursor,'validated_rows',v_validated_rows,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,'first_excluded_row_index',v_first_excluded_row_index,
      'reindex_offset',v_reindex_offset,'shifted_rows',v_shifted_rows,'deleted_rows',v_deleted_rows,'reindexed_rows',v_reindexed_rows,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now));
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set error_detail=v_error_detail,updated_at=v_now
    where media_job.id=v_job_id and media_job.status='processing' and media_job.updated_at=v_job.updated_at
      and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,false,false,v_source_rows,v_excluded_rows,v_retained_rows,
      v_mixed_campaign_count,v_matched_campaign_count,v_excluded_rows-v_deleted_rows,
      v_excluded_impressions,v_excluded_clicks,v_excluded_cost,v_excluded_conversions,v_excluded_revenue;return;
  end if;

  /* Phase 2e: delete one bounded batch of exact cross-grain rows. */
  if v_work_phase='mutation_delete' then
    if v_expected_rows<>v_source_rows or v_shifted_rows<>v_reindex_required_rows or v_deleted_rows>v_excluded_rows
    then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    with mixed_ids as materialized(select value as campaign_id from jsonb_array_elements_text(v_mixed_campaign_ids)),
    targets as materialized(
      select staging.id from public.media_sync_staging_rows as staging
      where staging.job_id=v_job_id and staging.row_index<v_reindex_offset
        and staging.row ->> 'row_level'='keyword' and staging.row ->> 'data_level'='keyword'
        and staging.row ->> 'row_level_reason'='naver_searchad_registered_keyword_daily_stats'
        and staging.row #>> '{provider_meta,campaign_type}'='BRAND_SEARCH'
        and exists(select 1 from mixed_ids where mixed_ids.campaign_id=nullif(btrim(staging.row ->> 'external_campaign_id'),''))
      order by staging.row_index,staging.row_key,staging.id limit v_batch_size)
    delete from public.media_sync_staging_rows as staging using targets where staging.id=targets.id;
    get diagnostics v_affected_rows=row_count;
    if v_affected_rows=0 and v_deleted_rows<v_excluded_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    v_deleted_rows:=v_deleted_rows+v_affected_rows;v_cursor:=v_deleted_rows;v_validated_rows:=v_cursor;
    if v_deleted_rows>v_excluded_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    if v_deleted_rows=v_excluded_rows then v_work_phase:='mutation_reindex';v_cursor:=0;v_validated_rows:=0;end if;
    v_work:=jsonb_build_object('kind',v_kind,'version',v_version,'phase',v_work_phase,'source_rows',v_source_rows,
      'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,'mixed_campaign_count',v_mixed_campaign_count,
      'matched_campaign_count',v_matched_campaign_count,'excluded_impressions',v_excluded_impressions,
      'excluded_clicks',v_excluded_clicks,'excluded_cost',v_excluded_cost,'excluded_conversions',v_excluded_conversions,
      'excluded_revenue',v_excluded_revenue,'cursor',v_cursor,'validated_rows',v_validated_rows,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,'first_excluded_row_index',v_first_excluded_row_index,'reindex_offset',v_reindex_offset,
      'shifted_rows',v_shifted_rows,'deleted_rows',v_deleted_rows,'reindexed_rows',v_reindexed_rows,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now));
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set error_detail=v_error_detail,updated_at=v_now where media_job.id=v_job_id and media_job.status='processing'
      and media_job.updated_at=v_job.updated_at and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,v_deleted_rows>0,false,v_source_rows,v_excluded_rows,v_retained_rows,
      v_mixed_campaign_count,v_matched_campaign_count,v_excluded_rows-v_deleted_rows,v_excluded_impressions,v_excluded_clicks,
      v_excluded_cost,v_excluded_conversions,v_excluded_revenue;return;
  end if;

  /* Phase 2f: restore one bounded batch from temporary indexes. */
  if v_work_phase='mutation_reindex' then
    if v_expected_rows<>v_source_rows or v_deleted_rows<>v_excluded_rows or v_reindexed_rows>v_reindex_required_rows
    then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    with selected as materialized(
      select staging.id,row_number() over(order by staging.row_index,staging.row_key,staging.id)::bigint as batch_rank
      from public.media_sync_staging_rows as staging where staging.job_id=v_job_id and staging.row_index>=v_reindex_offset
      order by staging.row_index,staging.row_key,staging.id limit v_batch_size),
    targets as materialized(select selected.id,v_first_excluded_row_index+v_reindexed_rows+selected.batch_rank-1 as new_row_index from selected)
    update public.media_sync_staging_rows as staging set row_index=targets.new_row_index from targets where staging.id=targets.id;
    get diagnostics v_affected_rows=row_count;
    if v_affected_rows=0 and v_reindexed_rows<v_reindex_required_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    v_reindexed_rows:=v_reindexed_rows+v_affected_rows;v_cursor:=v_reindexed_rows;v_validated_rows:=v_cursor;
    if v_reindexed_rows>v_reindex_required_rows then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    if v_reindexed_rows=v_reindex_required_rows then v_work_phase:='mutation_verify';v_cursor:=0;v_validated_rows:=0;end if;
    v_work:=jsonb_build_object('kind',v_kind,'version',v_version,'phase',v_work_phase,'source_rows',v_source_rows,
      'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,'mixed_campaign_count',v_mixed_campaign_count,
      'matched_campaign_count',v_matched_campaign_count,'excluded_impressions',v_excluded_impressions,
      'excluded_clicks',v_excluded_clicks,'excluded_cost',v_excluded_cost,'excluded_conversions',v_excluded_conversions,
      'excluded_revenue',v_excluded_revenue,'cursor',v_cursor,'validated_rows',v_validated_rows,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,'first_excluded_row_index',v_first_excluded_row_index,'reindex_offset',v_reindex_offset,
      'shifted_rows',v_shifted_rows,'deleted_rows',v_deleted_rows,'reindexed_rows',v_reindexed_rows,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now));
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set error_detail=v_error_detail,updated_at=v_now where media_job.id=v_job_id and media_job.status='processing'
      and media_job.updated_at=v_job.updated_at and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,true,false,v_source_rows,v_excluded_rows,v_retained_rows,
      v_mixed_campaign_count,v_matched_campaign_count,0::bigint,v_excluded_impressions,v_excluded_clicks,v_excluded_cost,
      v_excluded_conversions,v_excluded_revenue;return;
  end if;

  /* Phase 2g: verify bounded mutation before retained validation. */
  if v_work_phase='mutation_verify' then
    if v_expected_rows<>v_source_rows or v_shifted_rows<>v_reindex_required_rows
       or v_deleted_rows<>v_excluded_rows or v_reindexed_rows<>v_reindex_required_rows
    then raise exception using errcode='P0001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    /*
     * The following retained-validation phase rechecks every surviving row in
     * bounded row_index batches. Avoid a full-table recount and correlated
     * BRAND_SEARCH overlap scan at this transition.
     */
    v_work_phase:='retained_validation';v_cursor:=0;v_validated_rows:=0;
    v_work:=jsonb_build_object('kind',v_kind,'version',v_version,'phase',v_work_phase,
      'source_rows',(v_work ->> 'source_rows')::bigint,'excluded_rows',v_excluded_rows,'retained_rows',v_retained_rows,
      'mixed_campaign_count',v_mixed_campaign_count,'matched_campaign_count',v_matched_campaign_count,
      'excluded_impressions',v_excluded_impressions,'excluded_clicks',v_excluded_clicks,'excluded_cost',v_excluded_cost,
      'excluded_conversions',v_excluded_conversions,'excluded_revenue',v_excluded_revenue,'cursor',0,'validated_rows',0,
      'source_scope_mismatch_rows',v_source_scope_mismatch_rows,'source_blank_row_key_rows',v_source_blank_row_key_rows,
      'source_invalid_fingerprint_rows',v_source_invalid_fingerprint_rows,'source_canonical_mismatch_rows',v_source_canonical_mismatch_rows,
      'retained_scope_mismatch_rows',0,'retained_blank_row_key_rows',0,'retained_invalid_fingerprint_rows',0,'retained_canonical_mismatch_rows',0,
      'reindex_required_rows',v_reindex_required_rows,'first_excluded_row_index',v_first_excluded_row_index,'reindex_offset',v_reindex_offset,
      'shifted_rows',v_shifted_rows,'deleted_rows',v_deleted_rows,'reindexed_rows',v_reindexed_rows,
      'mixed_campaign_ids',v_mixed_campaign_ids,'matched_campaign_ids',v_matched_campaign_ids,
      'batch_size',v_batch_size,'started_at',to_jsonb(v_work_started_at),'updated_at',to_jsonb(v_now));
    v_checkpoint:=jsonb_set(v_checkpoint,'{saved_at}',to_jsonb(v_now),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{raw_rows}',to_jsonb(v_retained_rows),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{normalized_rows}',to_jsonb(v_retained_rows),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{inserted_rows}',to_jsonb(v_retained_rows),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{failed_rows}',to_jsonb(0),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{collector,next_row_index}',to_jsonb(v_retained_rows),true);
    v_checkpoint:=jsonb_set(v_checkpoint,'{reconciliation_work}',v_work,true);
    v_error_detail:=jsonb_set(v_job.error_detail,'{processing_checkpoint}',v_checkpoint,true);
    update public.media_sync_jobs as media_job set raw_rows=v_retained_rows,normalized_rows=v_retained_rows,
      inserted_rows=v_retained_rows,failed_rows=0,error_detail=v_error_detail,updated_at=v_now
    where media_job.id=v_job_id and media_job.status='processing' and media_job.updated_at=v_job.updated_at
      and media_job.snapshot_ingestion_id is null and media_job.finished_at is null;
    get diagnostics v_affected_rows=row_count;if v_affected_rows<>1 then raise exception using errcode='40001',message='NSBGR_RECONCILIATION_CONFLICT';end if;
    select media_job.* into v_updated_job from public.media_sync_jobs as media_job where media_job.id=v_job_id;
    return query select to_jsonb(v_updated_job),v_kind,v_version,true,false,(v_work ->> 'source_rows')::bigint,
      v_excluded_rows,v_retained_rows,v_mixed_campaign_count,v_matched_campaign_count,0::bigint,
      v_excluded_impressions,v_excluded_clicks,v_excluded_cost,v_excluded_conversions,v_excluded_revenue;return;
  end if;

  /*
   * Phase 3: validate retained rows in bounded row_index batches.
   */
  if v_work_phase = 'retained_validation' then
    if v_expected_rows <> v_retained_rows
       or v_cursor > v_retained_rows
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    with batch as materialized (
      select staging.*
      from public.media_sync_staging_rows as staging
      where staging.job_id = v_job_id
        and staging.row_index >= v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    )
    select
      count(batch.id)::bigint,
      min(batch.row_index),
      max(batch.row_index),
      count(batch.id) filter (
        where batch.report_id <> v_report_id
           or batch.workspace_id <> v_workspace_id
           or batch.advertiser_id <> v_advertiser_id
           or batch.connection_id <> v_connection_id
           or batch.provider <> v_provider
           or batch.external_account_id <>
              v_external_account_id
           or batch.date_from <> v_date_from
           or batch.date_to <> v_date_to
           or batch.date < v_date_from
           or batch.date > v_date_to
      )::bigint,
      count(batch.id) filter (
        where btrim(batch.row_key) = ''
      )::bigint,
      count(batch.id) filter (
        where batch.row_fingerprint is null
           or batch.row_fingerprint !~ '^[0-9a-f]{64}$'
           or batch.row_fingerprint is distinct from
              encode(
                extensions.digest(
                  pg_catalog.convert_to(
                    batch.row::text,
                    'UTF8'
                  ),
                  'sha256'
                ),
                'hex'
              )
      )::bigint,
      count(batch.id) filter (
        where jsonb_typeof(batch.row) <> 'object'
           or coalesce(batch.row ->> 'date', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'report_date', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'day', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'ymd', '') <>
              batch.date::text
           or coalesce(batch.row ->> 'channel', '') <>
              coalesce(batch.channel, '')
           or coalesce(batch.row ->> 'device', '') <>
              coalesce(batch.device, '')
           or coalesce(batch.row ->> 'source', '') <>
              coalesce(batch.source, '')
           or coalesce(batch.row ->> 'provider', '') <>
              'naver_searchad'
           or coalesce(
                batch.row ->> 'external_account_id',
                ''
              ) <> v_external_account_id
           or coalesce(
                batch.row ->> 'ingestion_source',
                ''
              ) <> 'api'
      )::bigint
    into
      v_batch_rows,
      v_batch_min_row_index,
      v_batch_max_row_index,
      v_batch_scope_mismatch_rows,
      v_batch_blank_row_key_rows,
      v_batch_invalid_fingerprint_rows,
      v_batch_canonical_mismatch_rows
    from batch;

    if v_batch_rows > 0
       and (
         v_batch_min_row_index <> v_cursor
         or v_batch_max_row_index <>
            v_cursor + v_batch_rows - 1
       )
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    select count(*)::bigint
    into v_batch_remaining_overlap_rows
    from (
      select staging.row
      from public.media_sync_staging_rows as staging
      where staging.job_id = v_job_id
        and staging.row_index >= v_cursor
      order by staging.row_index, staging.row_key, staging.id
      limit v_batch_size
    ) as retained_batch
    where retained_batch.row ->> 'row_level' = 'keyword'
      and retained_batch.row ->> 'data_level' = 'keyword'
      and retained_batch.row ->> 'row_level_reason' =
          'naver_searchad_registered_keyword_daily_stats'
      and retained_batch.row #>> '{provider_meta,campaign_type}' =
          'BRAND_SEARCH'
      and exists (
        select 1
        from jsonb_array_elements_text(
          v_mixed_campaign_ids
        ) as mixed_campaign(campaign_id)
        where mixed_campaign.campaign_id =
          nullif(
            btrim(
              retained_batch.row ->> 'external_campaign_id'
            ),
            ''
          )
      );

    if v_batch_remaining_overlap_rows <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    v_cursor :=
      v_cursor + v_batch_rows;
    v_validated_rows :=
      v_validated_rows + v_batch_rows;
    v_retained_scope_mismatch_rows :=
      v_retained_scope_mismatch_rows +
      v_batch_scope_mismatch_rows;
    v_retained_blank_row_key_rows :=
      v_retained_blank_row_key_rows +
      v_batch_blank_row_key_rows;
    v_retained_invalid_fingerprint_rows :=
      v_retained_invalid_fingerprint_rows +
      v_batch_invalid_fingerprint_rows;
    v_retained_canonical_mismatch_rows :=
      v_retained_canonical_mismatch_rows +
      v_batch_canonical_mismatch_rows;

    if v_cursor > v_retained_rows
       or v_validated_rows <> v_cursor
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    if v_cursor = v_retained_rows then
      if v_retained_scope_mismatch_rows <> 0
         or v_retained_blank_row_key_rows <> 0
         or v_retained_invalid_fingerprint_rows <> 0
         or v_retained_canonical_mismatch_rows <> 0
      then
        raise exception using
          errcode = 'P0001',
          message = 'NSBGR_POSTCONDITION_FAILED';
      end if;

      v_work_phase :=
        'finalization';
      v_cursor := 0;
      v_validated_rows := 0;
    elsif v_batch_rows = 0 then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    v_work :=
      jsonb_build_object(
        'kind', v_kind,
        'version', v_version,
        'phase', v_work_phase,
        'source_rows',
          (v_work ->> 'source_rows')::bigint,
        'excluded_rows', v_excluded_rows,
        'retained_rows', v_retained_rows,
        'mixed_campaign_count', v_mixed_campaign_count,
        'matched_campaign_count', v_matched_campaign_count,
        'excluded_impressions', v_excluded_impressions,
        'excluded_clicks', v_excluded_clicks,
        'excluded_cost', v_excluded_cost,
        'excluded_conversions', v_excluded_conversions,
        'excluded_revenue', v_excluded_revenue,
        'cursor', v_cursor,
        'validated_rows', v_validated_rows,
        'source_scope_mismatch_rows',
          v_source_scope_mismatch_rows,
        'source_blank_row_key_rows',
          v_source_blank_row_key_rows,
        'source_invalid_fingerprint_rows',
          v_source_invalid_fingerprint_rows,
        'source_canonical_mismatch_rows',
          v_source_canonical_mismatch_rows,
        'retained_scope_mismatch_rows',
          v_retained_scope_mismatch_rows,
        'retained_blank_row_key_rows',
          v_retained_blank_row_key_rows,
        'retained_invalid_fingerprint_rows',
          v_retained_invalid_fingerprint_rows,
        'retained_canonical_mismatch_rows',
          v_retained_canonical_mismatch_rows,
        'reindex_required_rows', v_reindex_required_rows,
        'first_excluded_row_index', v_first_excluded_row_index,
        'reindex_offset', v_reindex_offset,
        'shifted_rows', v_shifted_rows,
        'deleted_rows', v_deleted_rows,
        'reindexed_rows', v_reindexed_rows,
        'mixed_campaign_ids', v_mixed_campaign_ids,
        'matched_campaign_ids', v_matched_campaign_ids,
        'batch_size', v_batch_size,
        'started_at', to_jsonb(v_work_started_at),
        'updated_at', to_jsonb(v_now)
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{saved_at}',
        to_jsonb(v_now),
        true
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{reconciliation_work}',
        v_work,
        true
      );

    v_error_detail :=
      jsonb_set(
        v_job.error_detail,
        '{processing_checkpoint}',
        v_checkpoint,
        true
      );

    update public.media_sync_jobs as media_job
    set error_detail = v_error_detail,
        updated_at = v_now
    where media_job.id = v_job_id
      and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null
      and media_job.finished_at is null;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '40001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    select media_job.*
    into v_updated_job
    from public.media_sync_jobs as media_job
    where media_job.id = v_job_id;

    return query
    select
      to_jsonb(v_updated_job),
      v_kind,
      v_version,
      v_excluded_rows > 0,
      false,
      (v_work ->> 'source_rows')::bigint,
      v_excluded_rows,
      v_retained_rows,
      v_mixed_campaign_count,
      v_matched_campaign_count,
      0::bigint,
      v_excluded_impressions,
      v_excluded_clicks,
      v_excluded_cost,
      v_excluded_conversions,
      v_excluded_revenue;

    return;
  end if;

  /*
   * Phase 4: commit the unchanged final reconciliation audit contract.
   */
  if v_work_phase = 'finalization' then
    if v_expected_rows <> v_retained_rows
       or v_cursor <> 0
       or v_validated_rows <> 0
       or v_source_scope_mismatch_rows <> 0
       or v_source_blank_row_key_rows <> 0
       or v_source_invalid_fingerprint_rows <> 0
       or v_source_canonical_mismatch_rows <> 0
       or v_retained_scope_mismatch_rows <> 0
       or v_retained_blank_row_key_rows <> 0
       or v_retained_invalid_fingerprint_rows <> 0
       or v_retained_canonical_mismatch_rows <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    /*
     * Source and retained validation already proved every row in bounded
     * batches, including the absence of a remaining BRAND_SEARCH overlap.
     * Finalization therefore commits only that completed proof instead of
     * rescanning the entire staging set under a 60-second statement timeout.
     */
    v_remaining_overlap_rows := 0;

    v_reconciliation :=
      jsonb_build_object(
        'kind', v_kind,
        'version', v_version,
        'source_rows',
          (v_work ->> 'source_rows')::bigint,
        'excluded_rows', v_excluded_rows,
        'retained_rows', v_retained_rows,
        'mixed_campaign_count', v_mixed_campaign_count,
        'matched_campaign_count', v_matched_campaign_count,
        'excluded_impressions', v_excluded_impressions,
        'excluded_clicks', v_excluded_clicks,
        'excluded_cost', v_excluded_cost,
        'excluded_conversions', v_excluded_conversions,
        'excluded_revenue', v_excluded_revenue,
        'applied_at', to_jsonb(v_now)
      );

    v_checkpoint :=
      v_checkpoint - 'reconciliation_work';

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{saved_at}',
        to_jsonb(v_now),
        true
      );

    v_checkpoint :=
      jsonb_set(
        v_checkpoint,
        '{reconciliation}',
        v_reconciliation,
        true
      );

    v_error_detail :=
      jsonb_set(
        v_job.error_detail,
        '{processing_checkpoint}',
        v_checkpoint,
        true
      );

    update public.media_sync_jobs as media_job
    set raw_rows = v_retained_rows,
        normalized_rows = v_retained_rows,
        inserted_rows = v_retained_rows,
        failed_rows = 0,
        error_detail = v_error_detail,
        updated_at = v_now
    where media_job.id = v_job_id
      and media_job.status = 'processing'
      and media_job.updated_at = v_job.updated_at
      and media_job.snapshot_ingestion_id is null
      and media_job.finished_at is null;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '40001',
        message = 'NSBGR_RECONCILIATION_CONFLICT';
    end if;

    select media_job.*
    into v_updated_job
    from public.media_sync_jobs as media_job
    where media_job.id = v_job_id;

    if not found
       or v_updated_job.status <> 'processing'
       or v_updated_job.snapshot_ingestion_id is not null
       or v_updated_job.finished_at is not null
       or v_updated_job.raw_rows <> v_retained_rows
       or v_updated_job.normalized_rows <> v_retained_rows
       or v_updated_job.inserted_rows <> v_retained_rows
       or v_updated_job.failed_rows <> 0
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,collector,phase}'
            is distinct from 'completed'
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,collector,next_row_index}'
            is distinct from v_retained_rows::text
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,collector,keyword,complete}'
            is distinct from 'true'
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,collector,authoritative,complete}'
            is distinct from 'true'
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,reconciliation,kind}'
            is distinct from v_kind
       or v_updated_job.error_detail
            #>> '{processing_checkpoint,reconciliation,version}'
            is distinct from v_version::text
       or v_updated_job.error_detail
            #> '{processing_checkpoint,reconciliation_work}'
            is not null
    then
      raise exception using
        errcode = 'P0001',
        message = 'NSBGR_POSTCONDITION_FAILED';
    end if;

    return query
    select
      to_jsonb(v_updated_job),
      v_kind,
      v_version,
      v_excluded_rows > 0,
      false,
      (v_reconciliation ->> 'source_rows')::bigint,
      v_excluded_rows,
      v_retained_rows,
      v_mixed_campaign_count,
      v_matched_campaign_count,
      v_remaining_overlap_rows,
      v_excluded_impressions,
      v_excluded_clicks,
      v_excluded_cost,
      v_excluded_conversions,
      v_excluded_revenue;

    return;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'NSBGR_RECONCILIATION_CONFLICT';
end;
$function$;

CREATE OR REPLACE FUNCTION public.recover_stale_csv_ingestion_job(p_job_id uuid, p_cutoff timestamp with time zone)
 RETURNS TABLE(job_id uuid, report_id uuid, recovered boolean, final_status text, candidate_referenced boolean, candidate_is_current boolean, deleted_candidate_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.ingestion_jobs%rowtype;
  v_report public.reports%rowtype;

  v_now timestamptz := clock_timestamp();
  v_candidate_referenced boolean := false;
  v_candidate_is_current boolean := false;
  v_deleted_candidate_rows bigint := 0;

  v_ingestion_meta jsonb;
  v_meta_owner_job_id text;
begin
  if p_job_id is null then
    raise exception using
      message = 'CSR_INVALID_INPUT: p_job_id is required';
  end if;

  if p_cutoff is null or p_cutoff >= v_now then
    raise exception using
      message = 'CSR_INVALID_INPUT: p_cutoff must be earlier than the current time';
  end if;

  /*
   * Lock order is JOB FOR UPDATE -> REPORT FOR UPDATE, matching CSV activation.
   * The stale decision and pointer classification therefore cannot race with
   * activate_csv_ingestion_snapshot for the same queued job.
   */
  select *
    into v_job
    from public.ingestion_jobs as j
   where j.id = p_job_id
   for update;

  if not found then
    return query
    select
      p_job_id,
      null::uuid,
      false,
      null::text,
      false,
      false,
      0::bigint;
    return;
  end if;

  if v_job.status <> 'processing'
     or v_job.updated_at >= p_cutoff then
    return query
    select
      v_job.id,
      v_job.report_id,
      false,
      v_job.status,
      false,
      false,
      0::bigint;
    return;
  end if;

  if v_job.mode <> 'queue' then
    raise exception using
      message = 'CSR_SCOPE_MISMATCH: stale recovery only supports queued CSV ingestion jobs';
  end if;

  select *
    into v_report
    from public.reports as r
   where r.id = v_job.report_id
   for update;

  if not found then
    raise exception using
      message = 'CSR_REPORT_NOT_FOUND: report was not found';
  end if;

  if v_report.workspace_id <> v_job.workspace_id
     or v_report.advertiser_id is distinct from v_job.advertiser_id then
    raise exception using
      message = 'CSR_SCOPE_MISMATCH: report scope does not match the stale ingestion job';
  end if;

  v_candidate_is_current :=
    v_report.current_ingestion_id is not distinct from v_job.id;

  v_candidate_referenced :=
    v_candidate_is_current
    or v_report.published_ingestion_id is not distinct from v_job.id;

  if v_candidate_referenced then
    update public.ingestion_jobs as j
       set status = 'done',
           progress = 100,
           error = null,
           error_detail = null,
           finished_at = v_now,
           updated_at = v_now
     where j.id = v_job.id
       and j.status = 'processing';

    if not found then
      raise exception using
        message = 'CSR_JOB_STATE_CHANGED: stale ingestion job changed before recovery';
    end if;

    if v_candidate_is_current then
      v_ingestion_meta :=
        coalesce(v_report.meta->'ingestion', '{}'::jsonb);

      v_meta_owner_job_id :=
        coalesce(
          nullif(v_ingestion_meta->>'job_id', ''),
          nullif(v_ingestion_meta->>'ingestion_id', '')
        );

      if v_meta_owner_job_id = v_job.id::text then
        update public.reports as r
           set meta =
                 coalesce(r.meta, '{}'::jsonb)
                 || jsonb_build_object(
                      'ingestion',
                      v_ingestion_meta
                      || jsonb_build_object(
                           'status', 'done',
                           'progress', 100,
                           'error', null,
                           'finished_at', v_now,
                           'in_flight_inserts', 0
                         )
                    ),
               updated_at = v_now
         where r.id = v_report.id;
      end if;
    end if;

    return query
    select
      v_job.id,
      v_job.report_id,
      true,
      'done'::text,
      true,
      v_candidate_is_current,
      0::bigint;
    return;
  end if;

  delete from public.report_rows as rr
   where rr.report_id = v_job.report_id
     and rr.ingestion_id = v_job.id;

  get diagnostics v_deleted_candidate_rows = row_count;

  update public.ingestion_jobs as j
     set status = 'failed',
         progress = 100,
         error = 'STALE_PROCESSING_JOB',
         error_detail = jsonb_build_object(
           'code', 'STALE_PROCESSING_JOB',
           'message', 'CSV ingestion processing job exceeded the stale processing threshold before activation.',
           'stage', 'stale_recovery',
           'source', 'automatic_recovery',
           'cutoff', p_cutoff,
           'recovered_at', v_now
         ),
         finished_at = v_now,
         updated_at = v_now
   where j.id = v_job.id
     and j.status = 'processing';

  if not found then
    raise exception using
      message = 'CSR_JOB_STATE_CHANGED: stale ingestion job changed before recovery';
  end if;

  v_ingestion_meta :=
    coalesce(v_report.meta->'ingestion', '{}'::jsonb);

  v_meta_owner_job_id :=
    coalesce(
      nullif(v_ingestion_meta->>'job_id', ''),
      nullif(v_ingestion_meta->>'ingestion_id', '')
    );

  if v_meta_owner_job_id = v_job.id::text then
    update public.reports as r
       set meta =
             coalesce(r.meta, '{}'::jsonb)
             || jsonb_build_object(
                  'ingestion',
                  v_ingestion_meta
                  || jsonb_build_object(
                       'status', 'failed',
                       'progress', 100,
                       'error', 'STALE_PROCESSING_JOB',
                       'finished_at', v_now,
                       'in_flight_inserts', 0
                     )
                ),
           updated_at = v_now
     where r.id = v_report.id;
  end if;

  return query
  select
    v_job.id,
    v_job.report_id,
    true,
    'failed'::text,
    false,
    false,
    v_deleted_candidate_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.role_level(role text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
select case role
  when 'master' then 100
  when 'director' then 80
  when 'admin' then 60
  when 'staff' then 40
  when 'client' then 10
  else 0
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_google_ads_all_data_processing_checkpoint(p_payload jsonb)
 RETURNS SETOF media_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_execution_contract text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_raw_rows bigint;
  v_normalized_rows bigint;
  v_inserted_rows bigint;
  v_failed_rows bigint;

  v_collector jsonb;

  v_google_version bigint;
  v_all_data_version bigint;
  v_phase text;
  v_phase_rank integer;

  v_date_window_index bigint;
  v_next_row_index bigint;
  v_complete boolean;
  v_cursor jsonb;

  v_has_product_routing boolean;
  v_product_route jsonb;
  v_product_index bigint;
  v_product_family text;

  v_cursor_version bigint;
  v_cursor_phase text;
  v_cursor_external_account_id text;
  v_cursor_date_window_index bigint;
  v_cursor_date_from date;
  v_cursor_date_to date;
  v_cursor_expected_row_start_index bigint;
  v_phase_cursor jsonb;

  v_existing_checkpoint jsonb;
  v_existing_collector jsonb;
  v_existing_execution_contract text;
  v_existing_phase text;
  v_existing_phase_rank integer;
  v_existing_date_window_index bigint;
  v_existing_next_row_index bigint;
  v_existing_complete boolean;
  v_existing_cursor jsonb;

  v_existing_has_product_routing boolean;
  v_existing_product_route jsonb;
  v_existing_product_index bigint;
  v_existing_product_family text;

  v_checkpoint jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      (p_payload ->> 'job_id')::uuid;

    v_report_id :=
      (p_payload ->> 'report_id')::uuid;

    v_workspace_id :=
      (p_payload ->> 'workspace_id')::uuid;

    v_advertiser_id :=
      (p_payload ->> 'advertiser_id')::uuid;

    v_connection_id :=
      (p_payload ->> 'connection_id')::uuid;

    v_provider :=
      nullif(
        btrim(
          p_payload ->> 'provider'
        ),
        ''
      );

    v_execution_contract :=
      nullif(
        btrim(
          p_payload ->> 'execution_contract'
        ),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      (p_payload ->> 'date_from')::date;

    v_date_to :=
      (p_payload ->> 'date_to')::date;

    v_raw_rows :=
      (p_payload ->> 'raw_rows')::bigint;

    v_normalized_rows :=
      (p_payload ->> 'normalized_rows')::bigint;

    v_inserted_rows :=
      (p_payload ->> 'inserted_rows')::bigint;

    v_failed_rows :=
      (p_payload ->> 'failed_rows')::bigint;

    v_collector :=
      p_payload -> 'collector';

    v_google_version :=
      (
        v_collector ->>
        'google_version'
      )::bigint;

    v_all_data_version :=
      (
        v_collector ->>
        'all_data_version'
      )::bigint;

    v_phase :=
      nullif(
        btrim(
          v_collector ->>
          'phase'
        ),
        ''
      );

    v_date_window_index :=
      (
        v_collector ->>
        'date_window_index'
      )::bigint;

    v_next_row_index :=
      (
        v_collector ->>
        'next_row_index'
      )::bigint;

    v_complete :=
      (
        v_collector ->>
        'complete'
      )::boolean;

    v_cursor :=
      nullif(
        v_collector ->
          'cursor',
        'null'::jsonb
      );

    v_has_product_routing :=
      v_collector ?
        'product_route'
      or v_collector ?
        'product_index'
      or v_collector ?
        'product_family';

    v_product_route :=
      v_collector ->
      'product_route';

    v_product_index :=
      case
        when jsonb_typeof(
          v_collector ->
          'product_index'
        ) = 'number'
        and (
          v_collector ->>
          'product_index'
        ) ~ '^[0-9]+$'
        then (
          v_collector ->>
          'product_index'
        )::bigint
        else null
      end;

    v_product_family :=
      nullif(
        btrim(
          v_collector ->>
          'product_family'
        ),
        ''
      );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_execution_contract is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_date_from > v_date_to
     or v_raw_rows is null
     or v_raw_rows < 0
     or v_normalized_rows is null
     or v_normalized_rows < 0
     or v_inserted_rows is null
     or v_inserted_rows < 0
     or v_failed_rows is null
     or v_failed_rows <> 0
     or jsonb_typeof(v_collector) <> 'object'
     or v_google_version <> 1
     or v_all_data_version <> 1
     or v_phase not in (
       'product_boundary',
       'keyword',
       'search_ad',
       'demand_gen_ad',
       'display_ad',
       'shopping_ad',
       'youtube_ad',
       'performance_max_asset_group',
       'completed'
     )
     or v_date_window_index is null
     or v_date_window_index < 0
     or v_next_row_index is null
     or v_next_row_index < 0
     or v_complete is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;


  if v_has_product_routing then
    if not (
         v_collector ? 'product_route'
         and v_collector ? 'product_index'
         and v_collector ? 'product_family'
       )
       or jsonb_typeof(
            v_product_route
          ) <> 'array'
       or v_product_route not in (
            '[]'::jsonb,
            '["search"]'::jsonb,
            '["demand_gen"]'::jsonb,
            '["display"]'::jsonb,
            '["performance_max"]'::jsonb,
            '["shopping"]'::jsonb,
            '["youtube"]'::jsonb,
            '["search","demand_gen"]'::jsonb,
            '["search","display"]'::jsonb,
            '["search","performance_max"]'::jsonb,
            '["search","shopping"]'::jsonb,
            '["search","youtube"]'::jsonb,
            '["demand_gen","display"]'::jsonb,
            '["demand_gen","performance_max"]'::jsonb,
            '["demand_gen","shopping"]'::jsonb,
            '["demand_gen","youtube"]'::jsonb,
            '["display","performance_max"]'::jsonb,
            '["display","shopping"]'::jsonb,
            '["display","youtube"]'::jsonb,
            '["performance_max","shopping"]'::jsonb,
            '["performance_max","youtube"]'::jsonb,
            '["shopping","youtube"]'::jsonb,
            '["search","demand_gen","display"]'::jsonb,
            '["search","demand_gen","performance_max"]'::jsonb,
            '["search","demand_gen","shopping"]'::jsonb,
            '["search","demand_gen","youtube"]'::jsonb,
            '["search","display","performance_max"]'::jsonb,
            '["search","display","shopping"]'::jsonb,
            '["search","display","youtube"]'::jsonb,
            '["search","performance_max","shopping"]'::jsonb,
            '["search","performance_max","youtube"]'::jsonb,
            '["search","shopping","youtube"]'::jsonb,
            '["demand_gen","display","performance_max"]'::jsonb,
            '["demand_gen","display","shopping"]'::jsonb,
            '["demand_gen","display","youtube"]'::jsonb,
            '["demand_gen","performance_max","shopping"]'::jsonb,
            '["demand_gen","performance_max","youtube"]'::jsonb,
            '["demand_gen","shopping","youtube"]'::jsonb,
            '["display","performance_max","shopping"]'::jsonb,
            '["display","performance_max","youtube"]'::jsonb,
            '["display","shopping","youtube"]'::jsonb,
            '["performance_max","shopping","youtube"]'::jsonb,
            '["search","demand_gen","display","performance_max"]'::jsonb,
            '["search","demand_gen","display","shopping"]'::jsonb,
            '["search","demand_gen","display","youtube"]'::jsonb,
            '["search","demand_gen","performance_max","shopping"]'::jsonb,
            '["search","demand_gen","performance_max","youtube"]'::jsonb,
            '["search","demand_gen","shopping","youtube"]'::jsonb,
            '["search","display","performance_max","shopping"]'::jsonb,
            '["search","display","performance_max","youtube"]'::jsonb,
            '["search","display","shopping","youtube"]'::jsonb,
            '["search","performance_max","shopping","youtube"]'::jsonb,
            '["demand_gen","display","performance_max","shopping"]'::jsonb,
            '["demand_gen","display","performance_max","youtube"]'::jsonb,
            '["demand_gen","display","shopping","youtube"]'::jsonb,
            '["demand_gen","performance_max","shopping","youtube"]'::jsonb,
            '["display","performance_max","shopping","youtube"]'::jsonb,
            '["search","demand_gen","display","performance_max","shopping"]'::jsonb,
            '["search","demand_gen","display","performance_max","youtube"]'::jsonb,
            '["search","demand_gen","display","shopping","youtube"]'::jsonb,
            '["search","demand_gen","performance_max","shopping","youtube"]'::jsonb,
            '["search","display","performance_max","shopping","youtube"]'::jsonb,
            '["demand_gen","display","performance_max","shopping","youtube"]'::jsonb,
            '["search","demand_gen","display","performance_max","shopping","youtube"]'::jsonb
          )
       or v_product_index is null
       or v_product_index < 0
       or v_product_index >
            jsonb_array_length(
              v_product_route
            )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
    end if;

    if v_complete then
      if v_product_index <>
           jsonb_array_length(
             v_product_route
           )
         or v_product_family is not null
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    else
      if v_product_index >=
           jsonb_array_length(
             v_product_route
           )
         or v_product_family is distinct from
           (
             v_product_route ->>
             (
               v_product_index::integer
             )
           )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    end if;
  end if;

  if v_provider <> 'google_ads' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_execution_contract <>
       'google_all_data_v1'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_CONFLICT';
  end if;

  if v_raw_rows <> v_normalized_rows
     or v_raw_rows <> v_inserted_rows
     or v_inserted_rows <> v_next_row_index
     or v_failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_COUNTS';
  end if;

  v_phase_rank :=
    case v_phase
      when 'product_boundary' then 0
      when 'keyword' then 1
      when 'demand_gen_ad' then 1
      when 'display_ad' then 1
      when 'shopping_ad' then 1
      when 'youtube_ad' then 1
      when 'performance_max_asset_group' then 1
      when 'search_ad' then 2
      when 'completed' then 3
      else null
    end;

  if v_complete then
    if v_phase <> 'completed'
       or v_cursor is not null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
    end if;
  else
    if v_phase = 'product_boundary' then
      if not v_has_product_routing
         or v_cursor is not null
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    else
      if v_phase = 'completed'
         or jsonb_typeof(v_cursor) <> 'object'
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;

      begin
      v_cursor_version :=
        (
          v_cursor ->>
          'version'
        )::bigint;

      v_cursor_phase :=
        nullif(
          btrim(
            v_cursor ->>
            'phase'
          ),
          ''
        );

      v_cursor_external_account_id :=
        nullif(
          btrim(
            v_cursor ->>
            'externalAccountId'
          ),
          ''
        );

      v_cursor_date_window_index :=
        (
          v_cursor ->>
          'dateWindowIndex'
        )::bigint;

      v_cursor_date_from :=
        (
          v_cursor ->>
          'dateFrom'
        )::date;

      v_cursor_date_to :=
        (
          v_cursor ->>
          'dateTo'
        )::date;

      v_cursor_expected_row_start_index :=
        (
          v_cursor ->>
          'expectedRowStartIndex'
        )::bigint;

      v_phase_cursor :=
        v_cursor ->
        'phaseCursor';
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
    end;

    if v_cursor_version is distinct from 1
       or v_cursor_phase is distinct from
          v_phase
       or v_cursor_external_account_id
          is distinct from
          v_external_account_id
       or v_cursor_date_window_index
          is distinct from
          v_date_window_index
       or v_cursor_date_from
          is distinct from
          v_date_from
       or v_cursor_date_to
          is distinct from
          v_date_to
       or v_cursor_expected_row_start_index
          is distinct from
          v_next_row_index
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_SCOPE_MISMATCH';
    end if;

    if v_phase = 'keyword' then
      if jsonb_typeof(
           v_phase_cursor
         ) <> 'object'
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    elsif v_phase = 'search_ad' then
      if v_phase_cursor is not null
         and v_phase_cursor <> 'null'::jsonb
         and jsonb_typeof(
           v_phase_cursor
         ) <> 'object'
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    elsif v_phase in (
      'demand_gen_ad',
      'display_ad',
      'shopping_ad',
      'youtube_ad',
      'performance_max_asset_group'
    ) then
      if jsonb_typeof(
        v_phase_cursor
      ) <> 'object'
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
      end if;
    end if;
    end if;
  end if;

  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_FOUND';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'google_ads' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.execution_contract
       is distinct from
       'google_all_data_v1'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_CONFLICT';
  end if;

  if v_job.report_id <>
       v_report_id
     or v_job.workspace_id <>
       v_workspace_id
     or v_job.advertiser_id <>
       v_advertiser_id
     or v_job.connection_id <>
       v_connection_id
     or v_job.provider <>
       v_provider
     or v_job.external_account_id <>
       v_external_account_id
     or v_job.date_from <>
       v_date_from
     or v_job.date_to <>
       v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_SCOPE_MISMATCH';
  end if;

  if v_raw_rows <
       v_job.raw_rows
     or v_normalized_rows <
       v_job.normalized_rows
     or v_inserted_rows <
       v_job.inserted_rows
     or v_failed_rows <
       v_job.failed_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_REGRESSION';
  end if;

  if v_job.error_detail is not null then
    if jsonb_typeof(
         v_job.error_detail
       ) <> 'object'
       or (
         v_job.error_detail -
         'processing_checkpoint'
       ) <> '{}'::jsonb
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;
  end if;

  v_existing_checkpoint :=
    v_job.error_detail ->
    'processing_checkpoint';

  if jsonb_typeof(
       v_existing_checkpoint
     ) = 'object'
  then
    v_existing_collector :=
      v_existing_checkpoint ->
      'collector';

    if (
      v_existing_checkpoint ->>
      'version'
    ) is distinct from '1'
       or (
         v_existing_checkpoint ->>
         'execution_contract'
       ) is distinct from
         'google_all_data_v1'
       or jsonb_typeof(
         v_existing_collector
       ) is distinct from
         'object'
       or (
         v_existing_collector ->>
         'google_version'
       ) is distinct from '1'
       or (
         v_existing_collector ->>
         'all_data_version'
       ) is distinct from '1'
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    begin
      v_existing_execution_contract :=
        v_existing_checkpoint ->>
        'execution_contract';

      v_existing_phase :=
        v_existing_collector ->>
        'phase';

      v_existing_date_window_index :=
        (
          v_existing_checkpoint ->>
          'date_window_index'
        )::bigint;

      v_existing_next_row_index :=
        (
          v_existing_checkpoint ->>
          'next_row_index'
        )::bigint;

      v_existing_complete :=
        (
          v_existing_checkpoint ->>
          'complete'
        )::boolean;

      v_existing_cursor :=
        nullif(
          v_existing_collector ->
            'cursor',
          'null'::jsonb
        );

      v_existing_has_product_routing :=
        v_existing_collector ?
          'product_route'
        or v_existing_collector ?
          'product_index'
        or v_existing_collector ?
          'product_family';

      v_existing_product_route :=
        v_existing_collector ->
        'product_route';

      v_existing_product_index :=
        case
          when jsonb_typeof(
            v_existing_collector ->
            'product_index'
          ) = 'number'
          and (
            v_existing_collector ->>
            'product_index'
          ) ~ '^[0-9]+$'
          then (
            v_existing_collector ->>
            'product_index'
          )::bigint
          else null
        end;

      v_existing_product_family :=
        nullif(
          btrim(
            v_existing_collector ->>
            'product_family'
          ),
          ''
        );
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_CONFLICT';
    end;


    if v_existing_has_product_routing then
      if not (
           v_existing_collector ? 'product_route'
           and v_existing_collector ? 'product_index'
           and v_existing_collector ? 'product_family'
         )
         or jsonb_typeof(
              v_existing_product_route
            ) <> 'array'
         or v_existing_product_route not in (
              '[]'::jsonb,
              '["search"]'::jsonb,
              '["demand_gen"]'::jsonb,
              '["display"]'::jsonb,
              '["performance_max"]'::jsonb,
              '["shopping"]'::jsonb,
              '["youtube"]'::jsonb,
              '["search","demand_gen"]'::jsonb,
              '["search","display"]'::jsonb,
              '["search","performance_max"]'::jsonb,
              '["search","shopping"]'::jsonb,
              '["search","youtube"]'::jsonb,
              '["demand_gen","display"]'::jsonb,
              '["demand_gen","performance_max"]'::jsonb,
              '["demand_gen","shopping"]'::jsonb,
              '["demand_gen","youtube"]'::jsonb,
              '["display","performance_max"]'::jsonb,
              '["display","shopping"]'::jsonb,
              '["display","youtube"]'::jsonb,
              '["performance_max","shopping"]'::jsonb,
              '["performance_max","youtube"]'::jsonb,
              '["shopping","youtube"]'::jsonb,
              '["search","demand_gen","display"]'::jsonb,
              '["search","demand_gen","performance_max"]'::jsonb,
              '["search","demand_gen","shopping"]'::jsonb,
              '["search","demand_gen","youtube"]'::jsonb,
              '["search","display","performance_max"]'::jsonb,
              '["search","display","shopping"]'::jsonb,
              '["search","display","youtube"]'::jsonb,
              '["search","performance_max","shopping"]'::jsonb,
              '["search","performance_max","youtube"]'::jsonb,
              '["search","shopping","youtube"]'::jsonb,
              '["demand_gen","display","performance_max"]'::jsonb,
              '["demand_gen","display","shopping"]'::jsonb,
              '["demand_gen","display","youtube"]'::jsonb,
              '["demand_gen","performance_max","shopping"]'::jsonb,
              '["demand_gen","performance_max","youtube"]'::jsonb,
              '["demand_gen","shopping","youtube"]'::jsonb,
              '["display","performance_max","shopping"]'::jsonb,
              '["display","performance_max","youtube"]'::jsonb,
              '["display","shopping","youtube"]'::jsonb,
              '["performance_max","shopping","youtube"]'::jsonb,
              '["search","demand_gen","display","performance_max"]'::jsonb,
              '["search","demand_gen","display","shopping"]'::jsonb,
              '["search","demand_gen","display","youtube"]'::jsonb,
              '["search","demand_gen","performance_max","shopping"]'::jsonb,
              '["search","demand_gen","performance_max","youtube"]'::jsonb,
              '["search","demand_gen","shopping","youtube"]'::jsonb,
              '["search","display","performance_max","shopping"]'::jsonb,
              '["search","display","performance_max","youtube"]'::jsonb,
              '["search","display","shopping","youtube"]'::jsonb,
              '["search","performance_max","shopping","youtube"]'::jsonb,
              '["demand_gen","display","performance_max","shopping"]'::jsonb,
              '["demand_gen","display","performance_max","youtube"]'::jsonb,
              '["demand_gen","display","shopping","youtube"]'::jsonb,
              '["demand_gen","performance_max","shopping","youtube"]'::jsonb,
              '["display","performance_max","shopping","youtube"]'::jsonb,
              '["search","demand_gen","display","performance_max","shopping"]'::jsonb,
              '["search","demand_gen","display","performance_max","youtube"]'::jsonb,
              '["search","demand_gen","display","shopping","youtube"]'::jsonb,
              '["search","demand_gen","performance_max","shopping","youtube"]'::jsonb,
              '["search","display","performance_max","shopping","youtube"]'::jsonb,
              '["demand_gen","display","performance_max","shopping","youtube"]'::jsonb,
              '["search","demand_gen","display","performance_max","shopping","youtube"]'::jsonb
            )
         or v_existing_product_index is null
         or v_existing_product_index < 0
         or v_existing_product_index >
              jsonb_array_length(
                v_existing_product_route
              )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_CONFLICT';
      end if;

      if v_existing_complete then
        if v_existing_product_index <>
             jsonb_array_length(
               v_existing_product_route
             )
           or v_existing_product_family is not null
        then
          raise exception using
            errcode = 'P0001',
            message = 'MSC_CHECKPOINT_CONFLICT';
        end if;
      else
        if v_existing_product_index >=
             jsonb_array_length(
               v_existing_product_route
             )
           or v_existing_product_family is distinct from
             (
               v_existing_product_route ->>
               (
                 v_existing_product_index::integer
               )
             )
        then
          raise exception using
            errcode = 'P0001',
            message = 'MSC_CHECKPOINT_CONFLICT';
        end if;
      end if;
    end if;

    v_existing_phase_rank :=
      case v_existing_phase
        when 'product_boundary' then 0
        when 'keyword' then 1
        when 'demand_gen_ad' then 1
        when 'display_ad' then 1
        when 'shopping_ad' then 1
        when 'youtube_ad' then 1
        when 'performance_max_asset_group' then 1
        when 'search_ad' then 2
        when 'completed' then 3
        else null
      end;

    if v_existing_execution_contract
         is distinct from
         'google_all_data_v1'
       or v_existing_phase_rank is null
       or v_existing_date_window_index
          is null
       or v_existing_next_row_index
          is null
       or v_existing_complete is null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    if v_date_window_index <>
         v_existing_date_window_index
       or v_next_row_index <
         v_existing_next_row_index
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;

    if v_has_product_routing <>
         v_existing_has_product_routing
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    if v_has_product_routing then
      if v_product_route is distinct from
           v_existing_product_route
         or v_product_index <
           v_existing_product_index
         or v_product_index >
           (
             v_existing_product_index +
             1
           )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;

      if v_product_index =
          v_existing_product_index
        and (
          v_phase_rank <
            v_existing_phase_rank
          or (
            v_phase_rank >
              (
                v_existing_phase_rank +
                1
              )
            and not (
              v_existing_phase =
                'product_boundary'
              and v_phase =
                'search_ad'
              and v_existing_product_family =
                'search'
              and v_product_family =
                'search'
              and (
                v_phase_cursor is null
                or v_phase_cursor =
                  'null'::jsonb
              )
            )
          )
        )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    else
      if v_phase_rank <
           v_existing_phase_rank
         or v_phase_rank >
           (
             v_existing_phase_rank +
             1
           )
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    end if;

    if v_existing_complete then
      if not v_complete
         or v_phase <>
            v_existing_phase
         or v_next_row_index <>
            v_existing_next_row_index
         or v_cursor is distinct from
            v_existing_cursor
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    elsif v_phase_rank =
          v_existing_phase_rank
       and v_next_row_index =
          v_existing_next_row_index
    then
      if v_complete <>
           v_existing_complete
         or v_cursor is distinct from
           v_existing_cursor
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    end if;
  else
    if v_existing_checkpoint is not null
       or v_job.raw_rows <> 0
       or v_job.normalized_rows <> 0
       or v_job.inserted_rows <> 0
       or v_job.failed_rows <> 0
       or v_phase = 'completed'
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;
  end if;

  v_checkpoint :=
    jsonb_build_object(
      'version',
        1,

      'saved_at',
        to_jsonb(
          statement_timestamp()
        ),

      'execution_contract',
        'google_all_data_v1',

      'date_window_index',
        v_date_window_index,

      'next_row_index',
        v_next_row_index,

      'raw_rows',
        v_raw_rows,

      'normalized_rows',
        v_normalized_rows,

      'inserted_rows',
        v_inserted_rows,

      'failed_rows',
        v_failed_rows,

      'complete',
        v_complete,

      'collector',
        jsonb_build_object(
          'google_version',
            1,

          'all_data_version',
            1,

          'phase',
            v_phase,

          'date_window_index',
            v_date_window_index,

          'next_row_index',
            v_next_row_index,

          'complete',
            v_complete,

          'cursor',
            v_cursor
        ) ||
        case
          when v_has_product_routing then
            jsonb_build_object(
              'product_route',
                v_product_route,

              'product_index',
                v_product_index,

              'product_family',
                v_product_family
            )
          else
            '{}'::jsonb
        end
    );

  update public.media_sync_jobs
  set
    raw_rows =
      v_raw_rows,

    normalized_rows =
      v_normalized_rows,

    inserted_rows =
      v_inserted_rows,

    failed_rows =
      v_failed_rows,

    error =
      null,

    error_detail =
      jsonb_set(
        coalesce(
          error_detail,
          '{}'::jsonb
        ),
        '{processing_checkpoint}',
        v_checkpoint,
        true
      ),

    updated_at =
      statement_timestamp()

  where id =
      v_job_id
    and status =
      'processing'
    and execution_contract =
      'google_all_data_v1'

  returning *
  into v_job;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  return next v_job;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_naver_searchads_fact_date(p_payload jsonb)
 RETURNS TABLE(job jsonb, scope_date date, source_rows bigint, deleted_rows bigint, inserted_rows bigint, fact_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_connection public.media_connections%rowtype;

  v_job_id uuid;
  v_date date;

  v_checkpoint jsonb;
  v_reconciliation jsonb;

  v_retained_rows bigint;
  v_remaining_overlap_rows bigint;

  v_min_row_index bigint;
  v_max_row_index bigint;

  v_source_rows bigint := 0;
  v_distinct_row_keys bigint := 0;
  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_invalid_fingerprint_rows bigint := 0;
  v_invalid_row_rows bigint := 0;

  v_partition_source_job_id uuid;
  v_partition_source_job_created_at timestamptz;
  v_partition_row_count bigint;

  v_deleted_rows bigint := 0;
  v_inserted_rows bigint := 0;
  v_fact_rows bigint := 0;

  v_now timestamptz :=
    pg_catalog.clock_timestamp();
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(
       p_payload ->> 'job_id',
       ''
     ) !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_INVALID_INPUT: job_id is invalid';
  end if;

  begin
    v_job_id :=
      (p_payload ->> 'job_id')::uuid;

    v_date :=
      nullif(
        btrim(
          p_payload ->> 'date'
        ),
        ''
      )::date;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'MSFR_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_date is null then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_INVALID_INPUT: date is required';
  end if;

  /*
   * Same-job serialization.
   */
  select media_job.*
  into v_job
  from public.media_sync_jobs as media_job
  where media_job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_JOB_NOT_PROCESSING: job must remain processing';
  end if;

  if v_job.provider <> 'naver_searchad' then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_UNSUPPORTED_PROVIDER: initial fact replacement supports only Naver Search Ads';
  end if;

  if v_job.mode <> 'snapshot_replace' then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_MODE_MISMATCH: job mode must remain snapshot_replace';
  end if;

  /*
   * Fact replacement belongs before existing snapshot materialization.
   *
   * Once snapshot_ingestion_id exists the worker must resume the existing
   * projection path instead of replaying canonical replacement.
   */
  if v_job.snapshot_ingestion_id is not null
     or v_job.finished_at is not null
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_INVALID_JOB_STATE: fact replacement boundary has passed';
  end if;

  if v_date < v_job.date_from
     or v_date > v_job.date_to
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_DATE_SCOPE_MISMATCH: date is outside the job window';
  end if;

  /*
   * Active connection remains the account authority.
   */
  select connection.*
  into v_connection
  from public.media_connections as connection
  where connection.id = v_job.connection_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <> v_job.workspace_id
     or v_connection.advertiser_id <> v_job.advertiser_id
     or v_connection.provider <> v_job.provider
     or v_connection.external_account_id <>
        v_job.external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_SCOPE_MISMATCH: active connection does not match the job';
  end if;

  /*
   * Destructive replacement authority:
   *
   * completed keyword collector
   * + completed authoritative collector
   * + completed cross-grain reconciliation
   *
   * This gate is what makes zero-row replacement safe.
   */
  if jsonb_typeof(v_job.error_detail) <>
       'object'
     or jsonb_typeof(
       v_job.error_detail ->
         'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_CHECKPOINT_NOT_COMPLETED: processing checkpoint is missing';
  end if;

  v_checkpoint :=
    v_job.error_detail ->
      'processing_checkpoint';

  if v_checkpoint #>>
       '{collector,phase}'
       is distinct from 'completed'
     or v_checkpoint #>>
       '{collector,keyword,complete}'
       is distinct from 'true'
     or v_checkpoint #>>
       '{collector,authoritative,complete}'
       is distinct from 'true'
     or v_checkpoint #>>
       '{failed_rows}'
       is distinct from '0'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_CHECKPOINT_NOT_COMPLETED: authoritative collectors are incomplete';
  end if;

  v_reconciliation :=
    v_checkpoint ->
      'reconciliation';

  if jsonb_typeof(v_reconciliation) <>
       'object'
     or v_reconciliation ->> 'kind'
        is distinct from
          'brand_search_cross_grain_dedup_v1'
     or v_reconciliation ->> 'version'
        is distinct from '1'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_RECONCILIATION_NOT_COMPLETED: reconciliation authority is missing';
  end if;

  begin
    v_retained_rows :=
      (v_reconciliation ->>
        'retained_rows')::bigint;

    v_remaining_overlap_rows :=
      (v_reconciliation ->>
        'remaining_overlap_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'MSFR_RECONCILIATION_INVALID: reconciliation counts are invalid';
  end;

  if v_retained_rows < 0
     or v_remaining_overlap_rows <> 0
     or v_job.raw_rows <> v_retained_rows
     or v_job.normalized_rows <> v_retained_rows
     or v_job.inserted_rows <> v_retained_rows
     or v_checkpoint #>>
          '{raw_rows}'
        is distinct from
          v_retained_rows::text
     or v_checkpoint #>>
          '{normalized_rows}'
        is distinct from
          v_retained_rows::text
     or v_checkpoint #>>
          '{inserted_rows}'
        is distinct from
          v_retained_rows::text
     or v_checkpoint #>>
          '{collector,next_row_index}'
        is distinct from
          v_retained_rows::text
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_RECONCILIATION_CONFLICT: retained staging authority changed';
  end if;

  /*
   * Cheap post-reconciliation boundary witness.
   *
   * Reconciliation has already fully validated/reindexed retained rows.
   * Any later append would necessarily move this unique row_index boundary.
   *
   * Zero rows are explicitly valid.
   */
  if v_retained_rows = 0 then
    if exists (
      select 1
      from public.media_sync_staging_rows
      where job_id = v_job.id
      limit 1
    ) then
      raise exception using
        errcode = 'P0001',
        message =
          'MSFR_STAGING_CHANGED: zero-row authority no longer matches staging';
    end if;
  else
    select staging.row_index
    into v_min_row_index
    from public.media_sync_staging_rows
      as staging
    where staging.job_id = v_job.id
    order by staging.row_index asc
    limit 1;

    select staging.row_index
    into v_max_row_index
    from public.media_sync_staging_rows
      as staging
    where staging.job_id = v_job.id
    order by staging.row_index desc
    limit 1;

    if v_min_row_index is distinct from 0
       or v_max_row_index
          is distinct from
            v_retained_rows - 1
    then
      raise exception using
        errcode = 'P0001',
        message =
          'MSFR_STAGING_CHANGED: retained staging boundary changed';
    end if;
  end if;

  /*
   * Serialize every job targeting the same canonical account/date.
   * The job-row lock alone cannot serialize two distinct jobs.
   */
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_job.workspace_id::text
        || '|'
        || v_job.advertiser_id::text
        || '|'
        || v_job.provider
        || '|'
        || v_job.external_account_id
        || '|'
        || v_date::text,
      0
    )
  );

  /*
   * Validate only the date partition that is about to be replaced.
   * The whole retained staging set was already reconciled above.
   */
  select
    count(staging.id)::bigint,

    count(
      distinct staging.row_key
    )::bigint,

    count(staging.id) filter (
      where staging.report_id <>
              v_job.report_id
         or staging.workspace_id <>
              v_job.workspace_id
         or staging.advertiser_id <>
              v_job.advertiser_id
         or staging.connection_id <>
              v_job.connection_id
         or staging.provider <>
              v_job.provider
         or staging.external_account_id <>
              v_job.external_account_id
         or staging.date_from <>
              v_job.date_from
         or staging.date_to <>
              v_job.date_to
    )::bigint,

    count(staging.id) filter (
      where btrim(
        staging.row_key
      ) = ''
    )::bigint,

    count(staging.id) filter (
      where staging.row_fingerprint
              is null
         or staging.row_fingerprint
              !~ '^[0-9a-f]{64}$'
         or staging.row_fingerprint
              is distinct from
                encode(
                  extensions.digest(
                    (staging.row)::text,
                    'sha256'
                  ),
                  'hex'
                )
    )::bigint,

    count(staging.id) filter (
      where jsonb_typeof(
        staging.row
      ) <> 'object'
    )::bigint

  into
    v_source_rows,
    v_distinct_row_keys,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_invalid_fingerprint_rows,
    v_invalid_row_rows

  from public.media_sync_staging_rows
    as staging

  where staging.job_id = v_job.id
    and staging.date = v_date;

  if v_source_rows <>
       v_distinct_row_keys
     or v_scope_mismatch_rows <> 0
     or v_blank_row_key_rows <> 0
     or v_invalid_fingerprint_rows <> 0
     or v_invalid_row_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_DATE_STAGING_INVALID: date partition failed canonical validation';
  end if;

  /*
   * Durable partition ownership.
   *
   * Advisory locking serializes concurrent jobs targeting the same date.
   * The partition table then preserves latest-job authority even when the
   * authoritative result contains zero fact rows.
   */
  select
    partition.source_job_id,
    partition.source_job_created_at,
    partition.row_count
  into
    v_partition_source_job_id,
    v_partition_source_job_created_at,
    v_partition_row_count
  from public.media_sync_fact_partitions
    as partition
  where partition.workspace_id =
          v_job.workspace_id
    and partition.advertiser_id =
          v_job.advertiser_id
    and partition.provider =
          v_job.provider
    and partition.external_account_id =
          v_job.external_account_id
    and partition.date =
          v_date
  for update;

  if found
     and (
       v_partition_source_job_created_at,
       v_partition_source_job_id
     ) > (
       v_job.created_at,
       v_job.id
     )
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_STALE_JOB: a newer job already owns this canonical date';
  end if;

  /*
   * Exact date-partition replacement.
   *
   * DELETE and INSERT are one database transaction.
   * If any validation or insert fails, the old partition is restored
   * automatically by PostgreSQL rollback.
   *
   * Completely omitted/zero dates naturally execute as:
   *   delete old partition
   *   insert zero rows
   */
  with deleted as (
    delete
    from public.media_sync_fact_rows
      as fact
    where fact.workspace_id =
            v_job.workspace_id
      and fact.advertiser_id =
            v_job.advertiser_id
      and fact.provider =
            v_job.provider
      and fact.external_account_id =
            v_job.external_account_id
      and fact.date =
            v_date

    returning
      fact.row_key,
      fact.row_fingerprint,
      fact.source_job_id,
      fact.created_at,
      fact.updated_at
  ),

  inserted as (
    insert into public.media_sync_fact_rows (
      workspace_id,
      advertiser_id,
      provider,
      external_account_id,
      row_key,
      date,
      channel,
      device,
      source,
      row,
      source_connection_id,
      source_report_id,
      source_job_id,
      source_job_created_at,
      created_at,
      updated_at
    )

    select
      staging.workspace_id,
      staging.advertiser_id,
      staging.provider,
      staging.external_account_id,
      staging.row_key,
      staging.date,
      staging.channel,
      staging.device,
      staging.source,
      staging.row,

      v_job.connection_id,
      v_job.report_id,
      v_job.id,
      v_job.created_at,

      coalesce(
        old_fact.created_at,
        v_now
      ),

      case
        when old_fact.row_key
               is not null
         and old_fact.row_fingerprint
               is not distinct from
                 staging.row_fingerprint
         and old_fact.source_job_id =
               v_job.id
          then old_fact.updated_at
        else v_now
      end

    from public.media_sync_staging_rows
      as staging

    left join deleted
      as old_fact
      on old_fact.row_key =
           staging.row_key

    where staging.job_id =
            v_job.id
      and staging.date =
            v_date

    returning id
  )

  select
    (
      select count(*)::bigint
      from deleted
    ),
    (
      select count(*)::bigint
      from inserted
    )

  into
    v_deleted_rows,
    v_inserted_rows;

  if v_inserted_rows <>
       v_source_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_INSERT_COUNT_MISMATCH: inserted fact count does not match authoritative date rows';
  end if;

  select count(fact.id)::bigint
  into v_fact_rows
  from public.media_sync_fact_rows
    as fact
  where fact.workspace_id =
          v_job.workspace_id
    and fact.advertiser_id =
          v_job.advertiser_id
    and fact.provider =
          v_job.provider
    and fact.external_account_id =
          v_job.external_account_id
    and fact.date =
          v_date;

  if v_fact_rows <>
       v_source_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_POSTCHECK_FAILED: canonical fact count does not match authoritative date rows';
  end if;

  insert into public.media_sync_fact_partitions (
    workspace_id,
    advertiser_id,
    provider,
    external_account_id,
    date,
    source_connection_id,
    source_report_id,
    source_job_id,
    source_job_created_at,
    row_count,
    updated_at
  )
  values (
    v_job.workspace_id,
    v_job.advertiser_id,
    v_job.provider,
    v_job.external_account_id,
    v_date,
    v_job.connection_id,
    v_job.report_id,
    v_job.id,
    v_job.created_at,
    v_source_rows,
    v_now
  )
  on conflict (
    workspace_id,
    advertiser_id,
    provider,
    external_account_id,
    date
  )
  do update
  set
    source_connection_id =
      excluded.source_connection_id,
    source_report_id =
      excluded.source_report_id,
    source_job_id =
      excluded.source_job_id,
    source_job_created_at =
      excluded.source_job_created_at,
    row_count =
      excluded.row_count,
    updated_at =
      excluded.updated_at
  where (
    public.media_sync_fact_partitions.source_job_created_at,
    public.media_sync_fact_partitions.source_job_id
  ) <= (
    excluded.source_job_created_at,
    excluded.source_job_id
  );

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'MSFR_STALE_JOB: partition authority advanced concurrently';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_date,
    v_source_rows,
    v_deleted_rows,
    v_inserted_rows,
    v_fact_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_google_ads_daily_v2_fact_date(p_payload jsonb)
 RETURNS TABLE(job jsonb, scope_date date, source_rows bigint, deleted_rows bigint, inserted_rows bigint, fact_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;
  v_connection public.media_connections%rowtype;

  v_job_id uuid;
  v_date date;

  v_checkpoint jsonb;
  v_collector jsonb;

  v_checkpoint_next_rows bigint;
  v_checkpoint_raw_rows bigint;
  v_checkpoint_normalized_rows bigint;
  v_checkpoint_inserted_rows bigint;
  v_collector_next_rows bigint;

  v_total_rows bigint := 0;
  v_distinct_row_indexes bigint := 0;
  v_min_row_index bigint;
  v_max_row_index bigint;
  v_distinct_row_keys bigint := 0;
  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_invalid_fingerprint_rows bigint := 0;
  v_invalid_row_rows bigint := 0;

  v_partition_source_job_id uuid;
  v_partition_source_job_created_at timestamptz;

  v_deleted_rows bigint := 0;
  v_inserted_rows bigint := 0;
  v_fact_rows bigint := 0;

  v_now timestamptz :=
    pg_catalog.clock_timestamp();
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INVALID_INPUT: payload must be a JSON object';
  end if;

  if coalesce(
       p_payload ->> 'job_id',
       ''
     ) !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INVALID_INPUT: job_id is invalid';
  end if;

  begin
    v_job_id :=
      (p_payload ->> 'job_id')::uuid;

    v_date :=
      nullif(
        btrim(
          p_payload ->> 'date'
        ),
        ''
      )::date;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FR_INVALID_INPUT: payload value could not be parsed';
  end;

  if v_date is null then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INVALID_INPUT: date is required';
  end if;

  -- Same-job serialization.
  select j.*
  into v_job
  from public.media_sync_jobs as j
  where j.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_JOB_NOT_FOUND: media sync job was not found';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_JOB_NOT_PROCESSING: job must remain processing';
  end if;

  if v_job.provider <> 'google_ads'
     or v_job.mode <> 'snapshot_replace'
     or v_job.execution_contract is distinct from
          'google_all_data_v1'
     or v_job.automation_contract is distinct from
          'daily_report_v2'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_UNSUPPORTED_JOB: Google Daily Report V2 ALL-DATA job is required';
  end if;

  if v_job.snapshot_ingestion_id is not null
     or v_job.finished_at is not null
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INVALID_JOB_STATE: fact replacement boundary has passed';
  end if;

  -- Daily Report V2 intentionally creates one provider job per exact date.
  if v_job.date_from <> v_job.date_to
     or v_date <> v_job.date_from
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_DATE_SCOPE_MISMATCH: exact one-day job authority is required';
  end if;

  -- Active connection remains account authority.
  select connection.*
  into v_connection
  from public.media_connections as connection
  where connection.id = v_job.connection_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CONNECTION_NOT_FOUND: media connection was not found';
  end if;

  if v_connection.workspace_id <>
       v_job.workspace_id
     or v_connection.advertiser_id <>
       v_job.advertiser_id
     or v_connection.provider <>
       v_job.provider
     or v_connection.external_account_id <>
       v_job.external_account_id
     or v_connection.status <> 'active'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_SCOPE_MISMATCH: active connection does not match the job';
  end if;

  -- ----------------------------------------------------------
  -- Durable Google ALL-DATA completion authority.
  -- ----------------------------------------------------------

  if jsonb_typeof(v_job.error_detail) <>
       'object'
     or jsonb_typeof(
       v_job.error_detail ->
         'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CHECKPOINT_NOT_COMPLETED: processing checkpoint is missing';
  end if;

  v_checkpoint :=
    v_job.error_detail ->
      'processing_checkpoint';

  if jsonb_typeof(
       v_checkpoint -> 'collector'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CHECKPOINT_NOT_COMPLETED: collector checkpoint is missing';
  end if;

  v_collector :=
    v_checkpoint -> 'collector';

  if v_checkpoint ->> 'execution_contract'
       is distinct from 'google_all_data_v1'
     or v_checkpoint ->> 'complete'
       is distinct from 'true'
     or v_checkpoint ->> 'failed_rows'
       is distinct from '0'
     or v_collector ->> 'google_version'
       is distinct from '1'
     or v_collector ->> 'all_data_version'
       is distinct from '1'
     or v_collector ->> 'phase'
       is distinct from 'completed'
     or v_collector ->> 'complete'
       is distinct from 'true'
     or v_collector -> 'cursor'
       is distinct from 'null'::jsonb
     or v_checkpoint ->> 'date_window_index'
       is distinct from
          v_collector ->> 'date_window_index'
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CHECKPOINT_NOT_COMPLETED: Google ALL-DATA terminal checkpoint is invalid';
  end if;

  begin
    v_checkpoint_next_rows :=
      (v_checkpoint ->>
        'next_row_index')::bigint;

    v_checkpoint_raw_rows :=
      (v_checkpoint ->>
        'raw_rows')::bigint;

    v_checkpoint_normalized_rows :=
      (v_checkpoint ->>
        'normalized_rows')::bigint;

    v_checkpoint_inserted_rows :=
      (v_checkpoint ->>
        'inserted_rows')::bigint;

    v_collector_next_rows :=
      (v_collector ->>
        'next_row_index')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FR_CHECKPOINT_INVALID: Google row counters are invalid';
  end;

  if v_checkpoint_next_rows < 0
     or v_checkpoint_raw_rows <>
          v_checkpoint_next_rows
     or v_checkpoint_normalized_rows <>
          v_checkpoint_next_rows
     or v_checkpoint_inserted_rows <>
          v_checkpoint_next_rows
     or v_collector_next_rows <>
          v_checkpoint_next_rows
     or v_job.raw_rows <>
          v_checkpoint_next_rows
     or v_job.normalized_rows <>
          v_checkpoint_next_rows
     or v_job.inserted_rows <>
          v_checkpoint_next_rows
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_CHECKPOINT_CONFLICT: durable Google row boundary changed';
  end if;

  -- ----------------------------------------------------------
  -- Full persisted staging boundary witness.
  --
  -- This independently re-checks the same canonical boundary
  -- after the application staging summary and before destructive
  -- fact replacement.
  -- ----------------------------------------------------------

  select
    count(staging.id)::bigint,

    count(
      distinct staging.row_index
    )::bigint,

    min(staging.row_index)::bigint,

    max(staging.row_index)::bigint,

    count(
      distinct staging.row_key
    )::bigint,

    count(staging.id) filter (
      where staging.report_id <>
              v_job.report_id
         or staging.workspace_id <>
              v_job.workspace_id
         or staging.advertiser_id <>
              v_job.advertiser_id
         or staging.connection_id <>
              v_job.connection_id
         or staging.provider <>
              v_job.provider
         or staging.external_account_id <>
              v_job.external_account_id
         or staging.date_from <>
              v_job.date_from
         or staging.date_to <>
              v_job.date_to
         or staging.date <>
              v_date
    )::bigint,

    count(staging.id) filter (
      where btrim(
        staging.row_key
      ) = ''
    )::bigint,

    count(staging.id) filter (
      where staging.row_fingerprint
              is null
         or staging.row_fingerprint
              !~ '^[0-9a-f]{64}$'
         or staging.row_fingerprint
              is distinct from
                encode(
                  extensions.digest(
                    (staging.row)::text,
                    'sha256'
                  ),
                  'hex'
                )
    )::bigint,

    count(staging.id) filter (
      where jsonb_typeof(
        staging.row
      ) <> 'object'
    )::bigint

  into
    v_total_rows,
    v_distinct_row_indexes,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_keys,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_invalid_fingerprint_rows,
    v_invalid_row_rows

  from public.media_sync_staging_rows
    as staging

  where staging.job_id =
          v_job.id;

  if v_total_rows <>
       v_job.inserted_rows
     or v_distinct_row_indexes <>
          v_total_rows
     or v_distinct_row_keys <>
          v_total_rows
     or v_scope_mismatch_rows <> 0
     or v_blank_row_key_rows <> 0
     or v_invalid_fingerprint_rows <> 0
     or v_invalid_row_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_STAGING_CHANGED: persisted staging authority is invalid';
  end if;

  if v_total_rows = 0 then
    if v_min_row_index is not null
       or v_max_row_index is not null
    then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FR_STAGING_CHANGED: zero-row staging contains row bounds';
    end if;
  else
    if v_min_row_index is distinct from 0
       or v_max_row_index
            is distinct from
              v_total_rows - 1
    then
      raise exception using
        errcode = 'P0001',
        message =
          'GADV2FR_STAGING_CHANGED: staging row-index boundary changed';
    end if;
  end if;

  -- Serialize all jobs targeting the same canonical account/date.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_job.workspace_id::text
        || '|'
        || v_job.advertiser_id::text
        || '|'
        || v_job.provider
        || '|'
        || v_job.external_account_id
        || '|'
        || v_date::text,
      0
    )
  );

  -- Preserve newer canonical authority.
  select
    partition.source_job_id,
    partition.source_job_created_at
  into
    v_partition_source_job_id,
    v_partition_source_job_created_at
  from public.media_sync_fact_partitions
    as partition
  where partition.workspace_id =
          v_job.workspace_id
    and partition.advertiser_id =
          v_job.advertiser_id
    and partition.provider =
          v_job.provider
    and partition.external_account_id =
          v_job.external_account_id
    and partition.date =
          v_date
  for update;

  if found
     and (
       v_partition_source_job_created_at,
       v_partition_source_job_id
     ) > (
       v_job.created_at,
       v_job.id
     )
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_STALE_JOB: a newer job already owns this canonical date';
  end if;

  -- Exact date replacement. Zero-row replacement is valid.
  with deleted as (
    delete
    from public.media_sync_fact_rows
      as fact
    where fact.workspace_id =
            v_job.workspace_id
      and fact.advertiser_id =
            v_job.advertiser_id
      and fact.provider =
            v_job.provider
      and fact.external_account_id =
            v_job.external_account_id
      and fact.date =
            v_date
    returning
      fact.row_key,
      fact.row_fingerprint,
      fact.source_job_id,
      fact.created_at,
      fact.updated_at
  ),
  inserted as (
    insert into public.media_sync_fact_rows (
      workspace_id,
      advertiser_id,
      provider,
      external_account_id,
      row_key,
      date,
      channel,
      device,
      source,
      row,
      source_connection_id,
      source_report_id,
      source_job_id,
      source_job_created_at,
      created_at,
      updated_at
    )
    select
      staging.workspace_id,
      staging.advertiser_id,
      staging.provider,
      staging.external_account_id,
      staging.row_key,
      staging.date,
      staging.channel,
      staging.device,
      staging.source,
      staging.row,

      v_job.connection_id,
      v_job.report_id,
      v_job.id,
      v_job.created_at,

      coalesce(
        old_fact.created_at,
        v_now
      ),

      case
        when old_fact.row_key
               is not null
         and old_fact.row_fingerprint
               is not distinct from
                 staging.row_fingerprint
         and old_fact.source_job_id =
               v_job.id
          then old_fact.updated_at
        else v_now
      end

    from public.media_sync_staging_rows
      as staging

    left join deleted
      as old_fact
      on old_fact.row_key =
           staging.row_key

    where staging.job_id =
            v_job.id
      and staging.date =
            v_date

    returning id
  )

  select
    (
      select count(*)::bigint
      from deleted
    ),
    (
      select count(*)::bigint
      from inserted
    )

  into
    v_deleted_rows,
    v_inserted_rows;

  if v_inserted_rows <>
       v_total_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_INSERT_COUNT_MISMATCH: fact insert count changed';
  end if;

  select count(fact.id)::bigint
  into v_fact_rows
  from public.media_sync_fact_rows
    as fact
  where fact.workspace_id =
          v_job.workspace_id
    and fact.advertiser_id =
          v_job.advertiser_id
    and fact.provider =
          v_job.provider
    and fact.external_account_id =
          v_job.external_account_id
    and fact.date =
          v_date;

  if v_fact_rows <>
       v_total_rows
  then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_POSTCHECK_FAILED: canonical fact count changed';
  end if;

  insert into public.media_sync_fact_partitions (
    workspace_id,
    advertiser_id,
    provider,
    external_account_id,
    date,
    source_connection_id,
    source_report_id,
    source_job_id,
    source_job_created_at,
    row_count,
    updated_at
  )
  values (
    v_job.workspace_id,
    v_job.advertiser_id,
    v_job.provider,
    v_job.external_account_id,
    v_date,
    v_job.connection_id,
    v_job.report_id,
    v_job.id,
    v_job.created_at,
    v_total_rows,
    v_now
  )
  on conflict (
    workspace_id,
    advertiser_id,
    provider,
    external_account_id,
    date
  )
  do update
  set
    source_connection_id =
      excluded.source_connection_id,
    source_report_id =
      excluded.source_report_id,
    source_job_id =
      excluded.source_job_id,
    source_job_created_at =
      excluded.source_job_created_at,
    row_count =
      excluded.row_count,
    updated_at =
      excluded.updated_at
  where (
    public.media_sync_fact_partitions.source_job_created_at,
    public.media_sync_fact_partitions.source_job_id
  ) <= (
    excluded.source_job_created_at,
    excluded.source_job_id
  );

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'GADV2FR_STALE_JOB: partition authority advanced concurrently';
  end if;

  return query
  select
    to_jsonb(v_job),
    v_date,
    v_total_rows,
    v_deleted_rows,
    v_inserted_rows,
    v_fact_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_etrylue_customer_signup(p_email text, p_client_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare k text; n integer; existing_id uuid;
begin
  if p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email))
    or p_email not like '%@%' or p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'CUSTOMER_INPUT_INVALID';
  end if;
  delete from etrylue_customer_private.signup_limits where expires_at < now()-interval '1 day';
  foreach k in array array['email:'||md5(p_email),'client:'||p_client_hash] loop
    insert into etrylue_customer_private.signup_limits(bucket,attempts,expires_at)
      values(k,1,now()+interval '1 hour')
    on conflict(bucket) do update set
      attempts=case when signup_limits.expires_at<=now() then 1 else signup_limits.attempts+1 end,
      expires_at=case when signup_limits.expires_at<=now() then now()+interval '1 hour' else signup_limits.expires_at end
    returning attempts into n;
    if n > (case when k like 'email:%' then 5 else 20 end) then return 'limited'; end if;
  end loop;
  select id into existing_id from auth.users where lower(email)=p_email limit 1;
  if existing_id is null then return 'new'; end if;
  if exists(select 1 from etrylue_customer_private.accounts where user_id=existing_id and provisioned_at is null)
    and exists(select 1 from auth.users where id=existing_id and email_confirmed_at is null) then return 'pending'; end if;
  return 'existing';
end;
$function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.resolve_daily_report_meta_snapshot_v1(p_report_id uuid, p_source_ingestion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '3s'
AS $function$
declare r public.reports%rowtype; c public.media_connections%rowtype; m public.daily_report_meta_connections%rowtype;
  s public.daily_report_v2_snapshot_runs%rowtype; cached public.daily_report_meta_snapshots%rowtype;
  v_days integer; v_meta_rows integer; v_source_rows integer; v_inserted integer; v_audit jsonb; v_rows jsonb;
  v_fingerprint text; v_snapshot uuid:=gen_random_uuid();
begin
  if current_user<>'service_role' then raise exception 'DAILY_META_FORBIDDEN'; end if;
  select * into m from public.daily_report_meta_connections where report_id=p_report_id;
  if not found then return jsonb_build_object('status','unattached','snapshot_ingestion_id',p_source_ingestion_id); end if;
  -- Serialize only this new projection; never lock a Naver queue or source report.
  perform pg_advisory_xact_lock(hashtextextended('daily_meta_projection|'||p_report_id::text,0));
  select * into r from public.reports where id=m.report_id and tenant_id=m.tenant_id
    and workspace_id=m.workspace_id and advertiser_id=m.advertiser_id;
  if not found or r.current_ingestion_id is distinct from p_source_ingestion_id or
    r.meta#>>'{data_source,provider}' is distinct from 'naver_searchad' or
    r.meta#>>'{public_identity,period_type}' is distinct from 'daily_sync' or
    r.meta#>>'{media_sync,auto_sync,contract}' is distinct from 'daily_report_v2' or
    not exists(select 1 from public.report_types where id=r.report_type_id and key='db') then
    raise exception 'DAILY_META_SOURCE_CHANGED'; end if;
  select * into s from public.daily_report_v2_snapshot_runs where report_id=r.id and workspace_id=r.workspace_id
    and advertiser_id=r.advertiser_id and snapshot_ingestion_id=p_source_ingestion_id and status='activated';
  if not found or s.start_date::text is distinct from r.meta#>>'{public_identity,period_key}' then
    raise exception 'DAILY_META_SOURCE_NOT_READY'; end if;
  select * into c from public.media_connections where id=m.connection_id and tenant_id=r.tenant_id
    and workspace_id=r.workspace_id and advertiser_id=r.advertiser_id and provider='meta_ads';
  if not found then raise exception 'DAILY_META_SCOPE_MISMATCH'; end if;
  -- Copy all partitions from one MVCC statement; a collector correction cannot mix versions.
  select count(*),coalesce(sum(row_count),0),jsonb_agg(jsonb_build_object('date',date,'hash',content_hash) order by date),
    coalesce(jsonb_agg(rows order by date),'[]'::jsonb)
    into v_days,v_meta_rows,v_audit,v_rows from public.meta_ads_daily_partitions
    where connection_id=c.id and tenant_id=r.tenant_id and workspace_id=r.workspace_id and advertiser_id=r.advertiser_id
      and date between s.start_date and s.through_date and policy=c.meta->'meta_ads_reporting';
  if v_days<>s.through_date-s.start_date+1 then raise exception 'DAILY_META_COVERAGE_INCOMPLETE'; end if;
  v_fingerprint:=md5(jsonb_build_object('source',p_source_ingestion_id,'connection',c.id,'partitions',v_audit,
    'policy',c.meta->'meta_ads_reporting')::text);
  select * into cached from public.daily_report_meta_snapshots where report_id=r.id
    and source_ingestion_id=p_source_ingestion_id and fingerprint=v_fingerprint;
  if found then return jsonb_build_object('status','ready','snapshot_ingestion_id',cached.snapshot_ingestion_id,
    'source_rows',cached.source_rows,'meta_rows',cached.meta_rows,'through_date',cached.through_date); end if;
  select count(*) into v_source_rows from public.report_rows where report_id=r.id and ingestion_id=p_source_ingestion_id;
  if v_source_rows<>s.expected_rows or v_source_rows+v_meta_rows>150000 or not exists(
    select 1 from public.report_ingestions where id=p_source_ingestion_id and report_id=r.id and workspace_id=r.workspace_id
      and kind='api' and status='success' and row_count=v_source_rows) or exists(
    select 1 from public.report_rows where report_id=r.id and ingestion_id=p_source_ingestion_id
      and (workspace_id<>r.workspace_id or advertiser_id is distinct from r.advertiser_id or
        row->>'provider' is distinct from 'naver_searchad')) then raise exception 'DAILY_META_SOURCE_INVALID'; end if;
  insert into public.report_ingestions(id,workspace_id,report_id,kind,status,row_count,created_by)
    values(v_snapshot,r.workspace_id,r.id,'api','success',v_source_rows+v_meta_rows,m.created_by);
  insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
    select workspace_id,report_id,advertiser_id,(row_number() over(order by row_index))::integer-1,
      row,date,channel,device,source,v_snapshot from public.report_rows where report_id=r.id and ingestion_id=p_source_ingestion_id;
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_source_rows then raise exception 'DAILY_META_SOURCE_CHANGED'; end if;
  insert into public.report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,device,source,ingestion_id)
    select r.workspace_id,r.id,r.advertiser_id,v_source_rows+(row_number() over(order by day_ord,row_ord))::integer-1,
      x,(x->>'date')::date,'Meta Ads','','Meta Ads',v_snapshot
    from jsonb_array_elements(v_rows) with ordinality d(day_rows,day_ord)
    cross join lateral jsonb_array_elements(day_rows) with ordinality a(x,row_ord);
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_meta_rows then raise exception 'DAILY_META_SOURCE_CHANGED'; end if;
  if (select current_ingestion_id from public.reports where id=r.id) is distinct from p_source_ingestion_id then
    raise exception 'DAILY_META_SOURCE_CHANGED'; end if;
  insert into public.daily_report_meta_snapshots(report_id,source_ingestion_id,fingerprint,snapshot_ingestion_id,
    connection_id,start_date,through_date,source_rows,meta_rows)
    values(r.id,p_source_ingestion_id,v_fingerprint,v_snapshot,c.id,s.start_date,s.through_date,v_source_rows,v_meta_rows);
  return jsonb_build_object('status','ready','snapshot_ingestion_id',v_snapshot,
    'source_rows',v_source_rows,'meta_rows',v_meta_rows,'through_date',s.through_date);
end; $function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.summarize_media_sync_staging(p_payload jsonb)
 RETURNS TABLE(job_id uuid, expected_rows bigint, total_rows bigint, min_row_index bigint, max_row_index bigint, distinct_row_indexes bigint, rows_in_expected_range bigint, missing_expected_rows bigint, out_of_range_rows bigint, scope_mismatch_rows bigint, blank_row_key_rows bigint, missing_fingerprint_rows bigint, canonical_mismatch_rows bigint, date_window_count bigint, date_window_summaries jsonb, is_complete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_total_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;
  v_rows_in_expected_range bigint := 0;
  v_missing_expected_rows bigint := 0;
  v_out_of_range_rows bigint := 0;

  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_missing_fingerprint_rows bigint := 0;
  v_canonical_mismatch_rows bigint := 0;

  v_date_window_count bigint := 0;
  v_date_window_summaries jsonb := '[]'::jsonb;

  v_is_complete boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * append RPC는 동일 job에 FOR UPDATE를 사용한다.
   * summary는 FOR SHARE를 사용하여 실행 중인 append와 직렬화하고,
   * 하나의 안정된 staging 상태를 검증한다.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider not in ('naver_searchad', 'google_ads')
     or v_provider not in ('naver_searchad', 'google_ads')
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  select
    count(*)::bigint,

    min(staging.row_index),
    max(staging.row_index),

    count(
      distinct staging.row_index
    )::bigint,

    count(*) filter (
      where staging.row_index >= 0
        and staging.row_index <
          v_expected_rows
    )::bigint,

    count(*) filter (
      where staging.row_index < 0
         or staging.row_index >=
            v_expected_rows
    )::bigint,

    count(*) filter (
      where staging.report_id <>
              v_report_id
         or staging.workspace_id <>
              v_workspace_id
         or staging.advertiser_id <>
              v_advertiser_id
         or staging.connection_id <>
              v_connection_id
         or staging.provider <>
              v_provider
         or staging.external_account_id <>
              v_external_account_id
         or staging.date_from <>
              v_date_from
         or staging.date_to <>
              v_date_to
         or staging.date <
              v_date_from
         or staging.date >
              v_date_to
    )::bigint,

    count(*) filter (
      where staging.row_key is null
         or length(
              btrim(staging.row_key)
            ) = 0
    )::bigint,

    count(*) filter (
      where staging.row_fingerprint is null
         or staging.row_fingerprint !~
              '^[0-9a-f]{64}$'
    )::bigint,

    count(*) filter (
      where jsonb_typeof(staging.row) <>
              'object'

         or staging.row ->> 'date'
              is distinct from
              to_char(
                staging.date,
                'YYYY-MM-DD'
              )

         or staging.row ->> 'report_date'
              is distinct from
              to_char(
                staging.date,
                'YYYY-MM-DD'
              )

         or staging.row ->> 'day'
              is distinct from
              to_char(
                staging.date,
                'YYYY-MM-DD'
              )

         or staging.row ->> 'ymd'
              is distinct from
              to_char(
                staging.date,
                'YYYY-MM-DD'
              )

         or staging.row ->> 'channel'
              is distinct from
              staging.channel

         or staging.row ->> 'device'
              is distinct from
              staging.device

         or staging.row ->> 'source'
              is distinct from
              staging.source

         or staging.row ->> 'provider'
              is distinct from
              staging.provider

         or staging.row ->> 'external_account_id'
              is distinct from
              staging.external_account_id

         or staging.row ->> 'ingestion_source'
              is distinct from
              'api'

         or staging.row ->> 'row_level'
              is distinct from
              'keyword'

         or staging.row ->> 'data_level'
              is distinct from
              'keyword'

         or nullif(
              btrim(
                staging.row
                  ->> 'external_campaign_id'
              ),
              ''
            ) is null

         or nullif(
              btrim(
                staging.row
                  ->> 'external_group_id'
              ),
              ''
            ) is null

         or nullif(
              btrim(
                staging.row
                  ->> 'external_keyword_id'
              ),
              ''
            ) is null

         or staging.row_fingerprint <>
              encode(
                extensions.digest(
                  staging.row::text,
                  'sha256'
                ),
                'hex'
              )
    )::bigint
  into
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_out_of_range_rows,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows,
    v_canonical_mismatch_rows
  from public.media_sync_staging_rows
    as staging
  where staging.job_id = v_job_id;

  v_missing_expected_rows :=
    greatest(
      v_expected_rows -
        v_rows_in_expected_range,
      0
    );

  select
    count(*)::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date_window_index',
            windows.date_window_index,
          'row_count',
            windows.row_count,
          'min_row_index',
            windows.min_row_index,
          'max_row_index',
            windows.max_row_index,
          'min_date',
            windows.min_date,
          'max_date',
            windows.max_date
        )
        order by
          windows.date_window_index
      ),
      '[]'::jsonb
    )
  into
    v_date_window_count,
    v_date_window_summaries
  from (
    select
      staging.date_window_index,

      count(*)::bigint
        as row_count,

      min(staging.row_index)
        as min_row_index,

      max(staging.row_index)
        as max_row_index,

      min(staging.date)::text
        as min_date,

      max(staging.date)::text
        as max_date
    from public.media_sync_staging_rows
      as staging
    where staging.job_id = v_job_id
    group by
      staging.date_window_index
  ) as windows;

  v_is_complete :=
    v_total_rows =
      v_expected_rows

    and v_distinct_row_indexes =
      v_expected_rows

    and v_rows_in_expected_range =
      v_expected_rows

    and v_missing_expected_rows = 0

    and v_out_of_range_rows = 0

    and v_scope_mismatch_rows = 0

    and v_blank_row_key_rows = 0

    and v_missing_fingerprint_rows = 0

    and v_canonical_mismatch_rows = 0

    and (
      (
        v_expected_rows = 0
        and v_min_row_index is null
        and v_max_row_index is null
        and v_date_window_count = 0
      )
      or
      (
        v_expected_rows > 0
        and v_min_row_index = 0
        and v_max_row_index =
          v_expected_rows - 1
        and v_date_window_count > 0
      )
    );

  return query
  select
    v_job_id,
    v_expected_rows,
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_missing_expected_rows,
    v_out_of_range_rows,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows,
    v_canonical_mismatch_rows,
    v_date_window_count,
    v_date_window_summaries,
    v_is_complete;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_media_sync_processing_checkpoint(p_payload jsonb)
 RETURNS SETOF media_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_raw_rows bigint;
  v_normalized_rows bigint;
  v_inserted_rows bigint;
  v_failed_rows bigint;

  v_discovered_keywords bigint;
  v_completed_keywords bigint;

  v_stats_requests_attempted bigint;
  v_stats_requests_succeeded bigint;
  v_retry_count bigint;

  v_date_window_index bigint;
  v_cursor jsonb;

  v_progress integer;
  v_checkpoint jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_raw_rows :=
      (p_payload ->> 'raw_rows')::bigint;

    v_normalized_rows :=
      (p_payload ->> 'normalized_rows')::bigint;

    v_inserted_rows :=
      (p_payload ->> 'inserted_rows')::bigint;

    v_failed_rows :=
      (p_payload ->> 'failed_rows')::bigint;

    v_discovered_keywords :=
      (
        p_payload ->
        'collector' ->>
        'discovered_keywords'
      )::bigint;

    v_completed_keywords :=
      (
        p_payload ->
        'collector' ->>
        'completed_keywords'
      )::bigint;

    v_stats_requests_attempted :=
      (
        p_payload ->
        'collector' ->>
        'stats_requests_attempted'
      )::bigint;

    v_stats_requests_succeeded :=
      (
        p_payload ->
        'collector' ->>
        'stats_requests_succeeded'
      )::bigint;

    v_retry_count :=
      (
        p_payload ->
        'collector' ->>
        'retry_count'
      )::bigint;

    v_date_window_index :=
      (
        p_payload ->
        'collector' ->>
        'date_window_index'
      )::bigint;

    v_cursor :=
      p_payload ->
      'collector' ->
      'cursor';
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null

     or v_raw_rows is null
     or v_raw_rows < 0

     or v_normalized_rows is null
     or v_normalized_rows < 0

     or v_inserted_rows is null
     or v_inserted_rows < 0

     or v_failed_rows is null
     or v_failed_rows < 0

     or v_discovered_keywords is null
     or v_discovered_keywords < 0

     or v_completed_keywords is null
     or v_completed_keywords < 0

     or v_stats_requests_attempted is null
     or v_stats_requests_attempted < 0

     or v_stats_requests_succeeded is null
     or v_stats_requests_succeeded < 0

     or v_retry_count is null
     or v_retry_count < 0

     or v_date_window_index is null
     or v_date_window_index < 0

     or v_cursor is null
     or jsonb_typeof(v_cursor) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  if v_provider <> 'naver_searchad' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_completed_keywords >
       v_discovered_keywords
     or v_stats_requests_succeeded >
       v_stats_requests_attempted
     or v_inserted_rows >
       v_normalized_rows
     or v_failed_rows >
       v_raw_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_COUNTS';
  end if;

  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_FOUND';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_SCOPE_MISMATCH';
  end if;

  /*
   * count는 절대 뒤로 후퇴할 수 없다.
   * exact retry는 같은 값이므로 허용한다.
   */
  if v_raw_rows < v_job.raw_rows
     or v_normalized_rows <
        v_job.normalized_rows
     or v_inserted_rows <
        v_job.inserted_rows
     or v_failed_rows <
        v_job.failed_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_REGRESSION';
  end if;

  /*
   * 기존 processing checkpoint가 있다면
   * 상세 collector count도 후퇴할 수 없다.
   */
  if jsonb_typeof(
       v_job.error_detail ->
       'processing_checkpoint'
     ) = 'object'
  then
    if v_discovered_keywords <
         coalesce(
           (
             v_job.error_detail ->
             'processing_checkpoint' ->
             'collector' ->>
             'discovered_keywords'
           )::bigint,
           0
         )

       or v_completed_keywords <
         coalesce(
           (
             v_job.error_detail ->
             'processing_checkpoint' ->
             'collector' ->>
             'completed_keywords'
           )::bigint,
           0
         )

       or v_stats_requests_attempted <
         coalesce(
           (
             v_job.error_detail ->
             'processing_checkpoint' ->
             'collector' ->>
             'stats_requests_attempted'
           )::bigint,
           0
         )

       or v_stats_requests_succeeded <
         coalesce(
           (
             v_job.error_detail ->
             'processing_checkpoint' ->
             'collector' ->>
             'stats_requests_succeeded'
           )::bigint,
           0
         )

       or v_retry_count <
         coalesce(
           (
             v_job.error_detail ->
             'processing_checkpoint' ->
             'collector' ->>
             'retry_count'
           )::bigint,
           0
         )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;
  end if;

  if v_discovered_keywords = 0 then
    v_progress := 0;
  else
    v_progress :=
      least(
        99,
        floor(
          (
            v_completed_keywords::numeric *
            100
          ) /
          v_discovered_keywords::numeric
        )::integer
      );
  end if;

  /*
   * processing 상태에서는 progress 100 금지.
   */
  v_progress :=
    greatest(
      v_job.progress,
      v_progress
    );

  v_checkpoint :=
    jsonb_build_object(
      'version',
        1,

      'saved_at',
        to_jsonb(
          statement_timestamp()
        ),

      'date_window_index',
        v_date_window_index,

      'raw_rows',
        v_raw_rows,

      'normalized_rows',
        v_normalized_rows,

      'inserted_rows',
        v_inserted_rows,

      'failed_rows',
        v_failed_rows,

      'collector',
        jsonb_build_object(
          'discovered_keywords',
            v_discovered_keywords,

          'completed_keywords',
            v_completed_keywords,

          'stats_requests_attempted',
            v_stats_requests_attempted,

          'stats_requests_succeeded',
            v_stats_requests_succeeded,

          'retry_count',
            v_retry_count,

          'cursor',
            v_cursor
        )
    );

  update public.media_sync_jobs
  set
    progress =
      v_progress,

    raw_rows =
      v_raw_rows,

    normalized_rows =
      v_normalized_rows,

    inserted_rows =
      v_inserted_rows,

    failed_rows =
      v_failed_rows,

    error =
      null,

    error_detail =
      jsonb_set(
        coalesce(
          error_detail,
          '{}'::jsonb
        ),
        '{processing_checkpoint}',
        v_checkpoint,
        true
      ),

    updated_at =
      statement_timestamp()
  where id = v_job_id
    and status = 'processing'
  returning *
  into v_job;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  return next v_job;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_naver_searchads_combined_processing_checkpoint(p_payload jsonb)
 RETURNS SETOF media_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_raw_rows bigint;
  v_normalized_rows bigint;
  v_inserted_rows bigint;
  v_failed_rows bigint;

  v_collector jsonb;

  v_discovered_keywords bigint;
  v_completed_keywords bigint;
  v_stats_requests_attempted bigint;
  v_stats_requests_succeeded bigint;
  v_retry_count bigint;
  v_date_window_index bigint;
  v_cursor jsonb;

  v_combined_version bigint;
  v_phase text;
  v_next_row_index bigint;

  v_keyword jsonb;
  v_keyword_complete boolean;
  v_keyword_cursor jsonb;
  v_keyword_counts jsonb;
  v_keyword_discovered bigint;
  v_keyword_completed bigint;
  v_keyword_stats_attempted bigint;
  v_keyword_stats_succeeded bigint;
  v_keyword_retry_count bigint;

  v_authoritative jsonb;
  v_authoritative_complete boolean;
  v_authoritative_cursor jsonb;
  v_authoritative_counts jsonb;
  v_authoritative_discovered bigint;
  v_authoritative_completed bigint;
  v_authoritative_stats_attempted bigint;
  v_authoritative_stats_succeeded bigint;
  v_authoritative_retry_count bigint;

  v_existing_checkpoint jsonb;
  v_existing_collector jsonb;
  v_existing_phase text;
  v_existing_phase_rank integer;
  v_requested_phase_rank integer;
  v_existing_next_row_index bigint;
  v_existing_date_window_index bigint;
  v_existing_keyword jsonb;
  v_existing_keyword_counts jsonb;
  v_existing_authoritative jsonb;
  v_existing_authoritative_counts jsonb;
  v_existing_keyword_complete boolean;
  v_existing_authoritative_complete boolean;
  v_existing_keyword_discovered bigint;
  v_existing_keyword_completed bigint;
  v_existing_keyword_stats_attempted bigint;
  v_existing_keyword_stats_succeeded bigint;
  v_existing_keyword_retry_count bigint;
  v_existing_authoritative_discovered bigint;
  v_existing_authoritative_completed bigint;
  v_existing_authoritative_stats_attempted bigint;
  v_existing_authoritative_stats_succeeded bigint;
  v_existing_authoritative_retry_count bigint;

  v_progress integer;
  v_checkpoint jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_raw_rows :=
      (p_payload ->> 'raw_rows')::bigint;

    v_normalized_rows :=
      (p_payload ->> 'normalized_rows')::bigint;

    v_inserted_rows :=
      (p_payload ->> 'inserted_rows')::bigint;

    v_failed_rows :=
      (p_payload ->> 'failed_rows')::bigint;

    v_collector :=
      p_payload -> 'collector';

    v_discovered_keywords :=
      (
        v_collector ->>
        'discovered_keywords'
      )::bigint;

    v_completed_keywords :=
      (
        v_collector ->>
        'completed_keywords'
      )::bigint;

    v_stats_requests_attempted :=
      (
        v_collector ->>
        'stats_requests_attempted'
      )::bigint;

    v_stats_requests_succeeded :=
      (
        v_collector ->>
        'stats_requests_succeeded'
      )::bigint;

    v_retry_count :=
      (
        v_collector ->>
        'retry_count'
      )::bigint;

    v_date_window_index :=
      (
        v_collector ->>
        'date_window_index'
      )::bigint;

    v_cursor :=
      v_collector ->
      'cursor';

    v_combined_version :=
      (
        v_collector ->>
        'combined_version'
      )::bigint;

    v_phase :=
      nullif(
        btrim(
          v_collector ->>
          'phase'
        ),
        ''
      );

    v_next_row_index :=
      (
        v_collector ->>
        'next_row_index'
      )::bigint;

    v_keyword :=
      v_collector ->
      'keyword';

    v_keyword_complete :=
      (
        v_keyword ->>
        'complete'
      )::boolean;

    v_keyword_cursor :=
      v_keyword ->
      'cursor';

    v_keyword_counts :=
      v_keyword ->
      'counts';

    v_keyword_discovered :=
      (
        v_keyword_counts ->>
        'discovered'
      )::bigint;

    v_keyword_completed :=
      (
        v_keyword_counts ->>
        'completed'
      )::bigint;

    v_keyword_stats_attempted :=
      (
        v_keyword_counts ->>
        'statsRequestsAttempted'
      )::bigint;

    v_keyword_stats_succeeded :=
      (
        v_keyword_counts ->>
        'statsRequestsSucceeded'
      )::bigint;

    v_keyword_retry_count :=
      (
        v_keyword_counts ->>
        'retryCount'
      )::bigint;

    v_authoritative :=
      v_collector ->
      'authoritative';

    v_authoritative_complete :=
      (
        v_authoritative ->>
        'complete'
      )::boolean;

    v_authoritative_cursor :=
      v_authoritative ->
      'cursor';

    v_authoritative_counts :=
      v_authoritative ->
      'counts';

    v_authoritative_discovered :=
      (
        v_authoritative_counts ->>
        'discovered'
      )::bigint;

    v_authoritative_completed :=
      (
        v_authoritative_counts ->>
        'completed'
      )::bigint;

    v_authoritative_stats_attempted :=
      (
        v_authoritative_counts ->>
        'statsRequestsAttempted'
      )::bigint;

    v_authoritative_stats_succeeded :=
      (
        v_authoritative_counts ->>
        'statsRequestsSucceeded'
      )::bigint;

    v_authoritative_retry_count :=
      (
        v_authoritative_counts ->>
        'retryCount'
      )::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null

     or v_raw_rows is null
     or v_raw_rows < 0

     or v_normalized_rows is null
     or v_normalized_rows < 0

     or v_inserted_rows is null
     or v_inserted_rows < 0

     or v_failed_rows is null
     or v_failed_rows <> 0

     or v_collector is null
     or jsonb_typeof(v_collector) <> 'object'

     or v_discovered_keywords is null
     or v_discovered_keywords < 0

     or v_completed_keywords is null
     or v_completed_keywords < 0

     or v_stats_requests_attempted is null
     or v_stats_requests_attempted < 0

     or v_stats_requests_succeeded is null
     or v_stats_requests_succeeded < 0

     or v_retry_count is null
     or v_retry_count < 0

     or v_date_window_index is null
     or v_date_window_index < 0

     or v_cursor is null
     or jsonb_typeof(v_cursor) <> 'object'

     or v_combined_version <> 1

     or v_phase not in (
       'keyword',
       'authoritative',
       'completed'
     )

     or v_next_row_index is null
     or v_next_row_index < 0

     or v_keyword is null
     or jsonb_typeof(v_keyword) <> 'object'
     or not (v_keyword ? 'complete')
     or jsonb_typeof(
       v_keyword -> 'complete'
     ) <> 'boolean'
     or not (v_keyword ? 'cursor')
     or coalesce(
       jsonb_typeof(v_keyword_cursor),
       ''
     ) not in (
       'object',
       'null'
     )
     or v_keyword_counts is null
     or jsonb_typeof(v_keyword_counts) <> 'object'

     or v_keyword_discovered is null
     or v_keyword_discovered < 0

     or v_keyword_completed is null
     or v_keyword_completed < 0

     or v_keyword_stats_attempted is null
     or v_keyword_stats_attempted < 0

     or v_keyword_stats_succeeded is null
     or v_keyword_stats_succeeded < 0

     or v_keyword_retry_count is null
     or v_keyword_retry_count < 0

     or v_authoritative is null
     or jsonb_typeof(v_authoritative) <> 'object'
     or not (v_authoritative ? 'complete')
     or jsonb_typeof(
       v_authoritative -> 'complete'
     ) <> 'boolean'
     or not (v_authoritative ? 'cursor')
     or coalesce(
       jsonb_typeof(v_authoritative_cursor),
       ''
     ) not in (
       'object',
       'null'
     )
     or v_authoritative_counts is null
     or jsonb_typeof(v_authoritative_counts) <> 'object'

     or v_authoritative_discovered is null
     or v_authoritative_discovered < 0

     or v_authoritative_completed is null
     or v_authoritative_completed < 0

     or v_authoritative_stats_attempted is null
     or v_authoritative_stats_attempted < 0

     or v_authoritative_stats_succeeded is null
     or v_authoritative_stats_succeeded < 0

     or v_authoritative_retry_count is null
     or v_authoritative_retry_count < 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  if v_provider <> 'naver_searchad' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_completed_keywords >
       v_discovered_keywords
     or v_stats_requests_succeeded >
       v_stats_requests_attempted
     or v_inserted_rows >
       v_normalized_rows
     or v_failed_rows >
       v_raw_rows

     or v_keyword_completed >
       v_keyword_discovered
     or v_keyword_stats_succeeded >
       v_keyword_stats_attempted

     or v_authoritative_completed >
       v_authoritative_discovered
     or v_authoritative_stats_succeeded >
       v_authoritative_stats_attempted

     or v_raw_rows <>
       v_normalized_rows
     or v_raw_rows <>
       v_inserted_rows
     or v_inserted_rows <>
       v_next_row_index

     or v_discovered_keywords <>
       v_keyword_discovered
     or v_completed_keywords <>
       v_keyword_completed

     or v_stats_requests_attempted <>
       (
         v_keyword_stats_attempted +
         v_authoritative_stats_attempted
       )

     or v_stats_requests_succeeded <>
       (
         v_keyword_stats_succeeded +
         v_authoritative_stats_succeeded
       )

     or v_retry_count <>
       (
         v_keyword_retry_count +
         v_authoritative_retry_count
       )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_COUNTS';
  end if;

  if (
       jsonb_typeof(v_keyword_cursor) = 'null'
       and v_cursor <> '{}'::jsonb
     )
     or (
       jsonb_typeof(v_keyword_cursor) = 'object'
       and v_cursor <> v_keyword_cursor
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  if (
       v_phase = 'keyword'
       and (
         v_keyword_complete
         or v_authoritative_complete
       )
     )
     or (
       v_phase = 'authoritative'
       and (
         not v_keyword_complete
         or v_authoritative_complete
       )
     )
     or (
       v_phase = 'completed'
       and (
         not v_keyword_complete
         or not v_authoritative_complete
       )
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_COUNTS';
  end if;

  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_FOUND';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  if (v_report_id is not null and v_job.report_id <> v_report_id)
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_SCOPE_MISMATCH';
  end if;

  /*
   * Overall stored counts can never move backwards.
   * Exact retry remains valid because equal values are allowed.
   */
  if v_raw_rows < v_job.raw_rows
     or v_normalized_rows <
        v_job.normalized_rows
     or v_inserted_rows <
        v_job.inserted_rows
     or v_failed_rows <
        v_job.failed_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_REGRESSION';
  end if;

  v_existing_checkpoint :=
    v_job.error_detail ->
    'processing_checkpoint';

  v_existing_collector :=
    v_existing_checkpoint ->
    'collector';

  /*
   * Preserve the existing legacy regression guards.
   */
  if jsonb_typeof(
       v_existing_checkpoint
     ) = 'object'
  then
    if v_discovered_keywords <
         coalesce(
           (
             v_existing_collector ->>
             'discovered_keywords'
           )::bigint,
           0
         )

       or v_completed_keywords <
         coalesce(
           (
             v_existing_collector ->>
             'completed_keywords'
           )::bigint,
           0
         )

       or v_stats_requests_attempted <
         coalesce(
           (
             v_existing_collector ->>
             'stats_requests_attempted'
           )::bigint,
           0
         )

       or v_stats_requests_succeeded <
         coalesce(
           (
             v_existing_collector ->>
             'stats_requests_succeeded'
           )::bigint,
           0
         )

       or v_retry_count <
         coalesce(
           (
             v_existing_collector ->>
             'retry_count'
           )::bigint,
           0
         )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;
  end if;

  /*
   * Combined-to-combined resume adds strict phase, row-index, and
   * per-phase collector regression guards.
   *
   * A legacy checkpoint can safely transition into the first combined
   * checkpoint because it has no combined_version field.
   */
  if jsonb_typeof(
       v_existing_collector
     ) = 'object'
     and (
       v_existing_collector ->>
       'combined_version'
     ) = '1'
  then
    begin
      v_existing_phase :=
        v_existing_collector ->>
        'phase';

      v_existing_next_row_index :=
        (
          v_existing_collector ->>
          'next_row_index'
        )::bigint;

      v_existing_date_window_index :=
        (
          v_existing_collector ->>
          'date_window_index'
        )::bigint;

      v_existing_keyword :=
        v_existing_collector ->
        'keyword';

      v_existing_keyword_complete :=
        (
          v_existing_keyword ->>
          'complete'
        )::boolean;

      v_existing_keyword_counts :=
        v_existing_keyword ->
        'counts';

      v_existing_keyword_discovered :=
        (
          v_existing_keyword_counts ->>
          'discovered'
        )::bigint;

      v_existing_keyword_completed :=
        (
          v_existing_keyword_counts ->>
          'completed'
        )::bigint;

      v_existing_keyword_stats_attempted :=
        (
          v_existing_keyword_counts ->>
          'statsRequestsAttempted'
        )::bigint;

      v_existing_keyword_stats_succeeded :=
        (
          v_existing_keyword_counts ->>
          'statsRequestsSucceeded'
        )::bigint;

      v_existing_keyword_retry_count :=
        (
          v_existing_keyword_counts ->>
          'retryCount'
        )::bigint;

      v_existing_authoritative :=
        v_existing_collector ->
        'authoritative';

      v_existing_authoritative_complete :=
        (
          v_existing_authoritative ->>
          'complete'
        )::boolean;

      v_existing_authoritative_counts :=
        v_existing_authoritative ->
        'counts';

      v_existing_authoritative_discovered :=
        (
          v_existing_authoritative_counts ->>
          'discovered'
        )::bigint;

      v_existing_authoritative_completed :=
        (
          v_existing_authoritative_counts ->>
          'completed'
        )::bigint;

      v_existing_authoritative_stats_attempted :=
        (
          v_existing_authoritative_counts ->>
          'statsRequestsAttempted'
        )::bigint;

      v_existing_authoritative_stats_succeeded :=
        (
          v_existing_authoritative_counts ->>
          'statsRequestsSucceeded'
        )::bigint;

      v_existing_authoritative_retry_count :=
        (
          v_existing_authoritative_counts ->>
          'retryCount'
        )::bigint;
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
    end;

    v_existing_phase_rank :=
      case v_existing_phase
        when 'keyword' then 0
        when 'authoritative' then 1
        when 'completed' then 2
        else -1
      end;

    v_requested_phase_rank :=
      case v_phase
        when 'keyword' then 0
        when 'authoritative' then 1
        when 'completed' then 2
        else -1
      end;

    if v_existing_phase_rank < 0
       or v_requested_phase_rank <
          v_existing_phase_rank

       or v_date_window_index <>
          v_existing_date_window_index

       or v_next_row_index <
          v_existing_next_row_index

       or (
         v_existing_keyword_complete
         and not v_keyword_complete
       )

       or (
         v_existing_authoritative_complete
         and not v_authoritative_complete
       )

       or v_keyword_discovered <
          v_existing_keyword_discovered

       or v_keyword_completed <
          v_existing_keyword_completed

       or v_keyword_stats_attempted <
          v_existing_keyword_stats_attempted

       or v_keyword_stats_succeeded <
          v_existing_keyword_stats_succeeded

       or v_keyword_retry_count <
          v_existing_keyword_retry_count

       or v_authoritative_discovered <
          v_existing_authoritative_discovered

       or v_authoritative_completed <
          v_existing_authoritative_completed

       or v_authoritative_stats_attempted <
          v_existing_authoritative_stats_attempted

       or v_authoritative_stats_succeeded <
          v_existing_authoritative_stats_succeeded

       or v_authoritative_retry_count <
          v_existing_authoritative_retry_count
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;
  end if;

  /*
   * Keep the legacy progress calculation unchanged.
   * Processing state can never reach 100.
   */
  if v_discovered_keywords = 0 then
    v_progress := 0;
  else
    v_progress :=
      least(
        99,
        floor(
          (
            v_completed_keywords::numeric *
            100
          ) /
          v_discovered_keywords::numeric
        )::integer
      );
  end if;

  v_progress :=
    greatest(
      v_job.progress,
      v_progress
    );

  v_checkpoint :=
    jsonb_build_object(
      'version',
        1,

      'saved_at',
        to_jsonb(
          statement_timestamp()
        ),

      'date_window_index',
        v_date_window_index,

      'raw_rows',
        v_raw_rows,

      'normalized_rows',
        v_normalized_rows,

      'inserted_rows',
        v_inserted_rows,

      'failed_rows',
        v_failed_rows,

      'collector',
        jsonb_build_object(
          /*
           * Legacy keyword fields remain byte-compatible in shape.
           */
          'discovered_keywords',
            v_discovered_keywords,

          'completed_keywords',
            v_completed_keywords,

          'stats_requests_attempted',
            v_stats_requests_attempted,

          'stats_requests_succeeded',
            v_stats_requests_succeeded,

          'retry_count',
            v_retry_count,

          'date_window_index',
            v_date_window_index,

          'cursor',
            v_cursor,

          /*
           * Combined phase state is additive.
           */
          'combined_version',
            1,

          'phase',
            v_phase,

          'next_row_index',
            v_next_row_index,

          'keyword',
            jsonb_build_object(
              'complete',
                v_keyword_complete,

              'cursor',
                v_keyword_cursor,

              'counts',
                jsonb_build_object(
                  'discovered',
                    v_keyword_discovered,

                  'completed',
                    v_keyword_completed,

                  'statsRequestsAttempted',
                    v_keyword_stats_attempted,

                  'statsRequestsSucceeded',
                    v_keyword_stats_succeeded,

                  'retryCount',
                    v_keyword_retry_count
                )
            ),

          'authoritative',
            jsonb_build_object(
              'complete',
                v_authoritative_complete,

              'cursor',
                v_authoritative_cursor,

              'counts',
                jsonb_build_object(
                  'discovered',
                    v_authoritative_discovered,

                  'completed',
                    v_authoritative_completed,

                  'statsRequestsAttempted',
                    v_authoritative_stats_attempted,

                  'statsRequestsSucceeded',
                    v_authoritative_stats_succeeded,

                  'retryCount',
                    v_authoritative_retry_count
                )
            )
        )
    );

  update public.media_sync_jobs
  set
    progress =
      v_progress,

    raw_rows =
      v_raw_rows,

    normalized_rows =
      v_normalized_rows,

    inserted_rows =
      v_inserted_rows,

    failed_rows =
      v_failed_rows,

    error =
      null,

    error_detail =
      jsonb_set(
        coalesce(
          error_detail,
          '{}'::jsonb
        ),
        '{processing_checkpoint}',
        v_checkpoint,
        true
      ),

    updated_at =
      statement_timestamp()
  where id = v_job_id
    and status = 'processing'
  returning *
  into v_job;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  return next v_job;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_google_ads_keyword_processing_checkpoint(p_payload jsonb)
 RETURNS SETOF media_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_raw_rows bigint;
  v_normalized_rows bigint;
  v_inserted_rows bigint;
  v_failed_rows bigint;

  v_collector jsonb;

  v_google_version bigint;
  v_phase text;

  v_date_window_index bigint;
  v_next_row_index bigint;
  v_completed_page_count bigint;

  v_complete boolean;
  v_cursor jsonb;

  v_cursor_version bigint;
  v_cursor_external_account_id text;
  v_cursor_date_window_index bigint;
  v_cursor_date_from date;
  v_cursor_date_to date;

  v_page_cursor jsonb;
  v_page_token text;
  v_page_version bigint;
  v_page_index bigint;
  v_page text;

  v_existing_checkpoint jsonb;
  v_existing_collector jsonb;
  v_existing_date_window_index bigint;
  v_existing_next_row_index bigint;
  v_existing_completed_page_count bigint;
  v_existing_complete boolean;
  v_existing_cursor jsonb;

  v_checkpoint jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      (
        p_payload ->> 'date_from'
      )::date;

    v_date_to :=
      (
        p_payload ->> 'date_to'
      )::date;

    v_raw_rows :=
      (
        p_payload ->> 'raw_rows'
      )::bigint;

    v_normalized_rows :=
      (
        p_payload ->> 'normalized_rows'
      )::bigint;

    v_inserted_rows :=
      (
        p_payload ->> 'inserted_rows'
      )::bigint;

    v_failed_rows :=
      (
        p_payload ->> 'failed_rows'
      )::bigint;

    v_collector :=
      p_payload ->
      'collector';

    v_google_version :=
      (
        v_collector ->>
        'google_version'
      )::bigint;

    v_phase :=
      nullif(
        btrim(
          v_collector ->>
          'phase'
        ),
        ''
      );

    v_date_window_index :=
      (
        v_collector ->>
        'date_window_index'
      )::bigint;

    v_next_row_index :=
      (
        v_collector ->>
        'next_row_index'
      )::bigint;

    v_completed_page_count :=
      (
        v_collector ->>
        'completed_page_count'
      )::bigint;

    v_complete :=
      (
        v_collector ->>
        'complete'
      )::boolean;

    v_cursor :=
      v_collector ->
      'cursor';
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null

     or v_date_from is null
     or v_date_to is null
     or v_date_from > v_date_to

     or v_raw_rows is null
     or v_raw_rows < 0

     or v_normalized_rows is null
     or v_normalized_rows < 0

     or v_inserted_rows is null
     or v_inserted_rows < 0

     or v_failed_rows is null
     or v_failed_rows <> 0

     or v_collector is null
     or jsonb_typeof(v_collector) <> 'object'

     or v_google_version is distinct from 1

     or v_phase is distinct from 'keyword'

     or v_date_window_index is null
     or v_date_window_index < 0

     or v_next_row_index is null
     or v_next_row_index < 0

     or v_completed_page_count is null
     or v_completed_page_count < 1

     or v_complete is null

     or not (v_collector ? 'cursor')
     or coalesce(
       jsonb_typeof(v_cursor),
       ''
     ) not in (
       'object',
       'null'
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_INPUT';
  end if;

  if v_provider <> 'google_ads' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_UNSUPPORTED_PROVIDER';
  end if;

  if v_raw_rows <> v_normalized_rows
     or v_raw_rows <> v_inserted_rows
     or v_inserted_rows <> v_next_row_index
     or v_failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_INVALID_COUNTS';
  end if;

  if v_complete then
    if jsonb_typeof(v_cursor) <> 'null' then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_COUNTS';
    end if;
  else
    if jsonb_typeof(v_cursor) <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_INVALID_COUNTS';
    end if;

    begin
      v_cursor_version :=
        (
          v_cursor ->>
          'version'
        )::bigint;

      v_cursor_external_account_id :=
        nullif(
          btrim(
            v_cursor ->>
            'externalAccountId'
          ),
          ''
        );

      v_cursor_date_window_index :=
        (
          v_cursor ->>
          'dateWindowIndex'
        )::bigint;

      v_cursor_date_from :=
        (
          v_cursor ->>
          'dateFrom'
        )::date;

      v_cursor_date_to :=
        (
          v_cursor ->>
          'dateTo'
        )::date;

      v_page_cursor :=
        v_cursor ->
        'page';

      v_page_version :=
        (
          v_page_cursor ->>
          'version'
        )::bigint;

      v_page_index :=
        (
          v_page_cursor ->>
          'pageIndex'
        )::bigint;

      v_page_token :=
        nullif(
          btrim(
            v_page_cursor ->>
            'page'
          ),
          ''
        );
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_INVALID_INPUT';
    end;

    if v_cursor_version
         is distinct from 1
       or v_cursor_external_account_id
         is distinct from
          v_external_account_id
       or v_cursor_date_window_index
         is distinct from
          v_date_window_index
       or v_cursor_date_from
         is distinct from
          v_date_from
       or v_cursor_date_to
         is distinct from
          v_date_to
       or v_page_version
         is distinct from 1
       or v_page_index
         is distinct from
          v_completed_page_count
       or v_page_token is null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_SCOPE_MISMATCH';
    end if;
  end if;

  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_FOUND';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_SCOPE_MISMATCH';
  end if;

  if v_raw_rows < v_job.raw_rows
     or v_normalized_rows <
        v_job.normalized_rows
     or v_inserted_rows <
        v_job.inserted_rows
     or v_failed_rows <
        v_job.failed_rows
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_CHECKPOINT_REGRESSION';
  end if;

  v_existing_checkpoint :=
    v_job.error_detail ->
    'processing_checkpoint';

  if jsonb_typeof(
       v_existing_checkpoint
     ) = 'object'
  then
    v_existing_collector :=
      v_existing_checkpoint ->
      'collector';

    if (
      v_existing_checkpoint ->>
      'version'
    ) is distinct from '1'
       or jsonb_typeof(
         v_existing_collector
       ) is distinct from 'object'
       or (
         v_existing_collector ->>
         'google_version'
       ) is distinct from '1'
       or (
         v_existing_collector ->>
         'phase'
       ) is distinct from 'keyword'
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    begin
      v_existing_date_window_index :=
        (
          v_existing_checkpoint ->>
          'date_window_index'
        )::bigint;

      v_existing_next_row_index :=
        (
          v_existing_checkpoint ->>
          'next_row_index'
        )::bigint;

      v_existing_completed_page_count :=
        (
          v_existing_collector ->>
          'completed_page_count'
        )::bigint;

      v_existing_complete :=
        (
          v_existing_checkpoint ->>
          'complete'
        )::boolean;

      v_existing_cursor :=
        v_existing_collector ->
        'cursor';
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_CONFLICT';
    end;

    if v_existing_date_window_index is null
       or v_existing_next_row_index is null
       or v_existing_completed_page_count is null
       or v_existing_complete is null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;

    if v_date_window_index <>
         v_existing_date_window_index
       or v_next_row_index <
         v_existing_next_row_index
       or v_completed_page_count <
         v_existing_completed_page_count
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;

    if v_existing_complete then
      if not v_complete
         or v_next_row_index <>
            v_existing_next_row_index
         or v_completed_page_count <>
            v_existing_completed_page_count
         or v_cursor is distinct from
            v_existing_cursor
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    elsif v_next_row_index =
            v_existing_next_row_index
       and v_completed_page_count =
            v_existing_completed_page_count
    then
      if v_complete <>
           v_existing_complete
         or v_cursor is distinct from
            v_existing_cursor
      then
        raise exception using
          errcode = 'P0001',
          message = 'MSC_CHECKPOINT_REGRESSION';
      end if;
    elsif v_completed_page_count <>
            (
              v_existing_completed_page_count +
              1
            )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_REGRESSION';
    end if;
  else
    if v_job.inserted_rows <> 0
       or v_completed_page_count <> 1
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSC_CHECKPOINT_CONFLICT';
    end if;
  end if;

  v_checkpoint :=
    jsonb_build_object(
      'version',
        1,

      'saved_at',
        to_jsonb(
          statement_timestamp()
        ),

      'date_window_index',
        v_date_window_index,

      'next_row_index',
        v_next_row_index,

      'raw_rows',
        v_raw_rows,

      'normalized_rows',
        v_normalized_rows,

      'inserted_rows',
        v_inserted_rows,

      'failed_rows',
        v_failed_rows,

      'complete',
        v_complete,

      'collector',
        jsonb_build_object(
          'google_version',
            1,

          'phase',
            'keyword',

          'completed_page_count',
            v_completed_page_count,

          'cursor',
            v_cursor
        )
    );

  update public.media_sync_jobs
  set
    raw_rows =
      v_raw_rows,

    normalized_rows =
      v_normalized_rows,

    inserted_rows =
      v_inserted_rows,

    failed_rows =
      v_failed_rows,

    error =
      null,

    error_detail =
      jsonb_set(
        coalesce(
          error_detail,
          '{}'::jsonb
        ),
        '{processing_checkpoint}',
        v_checkpoint,
        true
      ),

    updated_at =
      statement_timestamp()

  where id = v_job_id
    and status = 'processing'

  returning *
  into v_job;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSC_JOB_NOT_PROCESSING';
  end if;

  return next v_job;
end;
$function$;

CREATE OR REPLACE FUNCTION public.summarize_google_ads_all_data_staging_base(p_payload jsonb)
 RETURNS TABLE(job_id uuid, expected_rows bigint, total_rows bigint, min_row_index bigint, max_row_index bigint, distinct_row_indexes bigint, rows_in_expected_range bigint, missing_expected_rows bigint, out_of_range_rows bigint, scope_mismatch_rows bigint, blank_row_key_rows bigint, missing_fingerprint_rows bigint, date_window_count bigint, date_window_summaries jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_execution_contract text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_total_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;
  v_rows_in_expected_range bigint := 0;
  v_missing_expected_rows bigint := 0;
  v_out_of_range_rows bigint := 0;

  /*
   * Full validation values are accumulated by the bounded validator.
   * These placeholders preserve one stable summary result contract.
   */
  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_missing_fingerprint_rows bigint := 0;

  v_date_window_count bigint := 0;
  v_date_window_summaries jsonb := '[]'::jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_execution_contract :=
      nullif(
        btrim(
          p_payload ->> 'execution_contract'
        ),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_execution_contract is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * append_media_sync_staging_batch locks this same job FOR UPDATE.
   *
   * FOR SHARE serializes this read with an in-flight append and gives this
   * statement one stable staging authority boundary.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'google_ads'
     or v_provider <> 'google_ads'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.execution_contract <>
       'google_all_data_v1'
     or v_execution_contract <>
       'google_all_data_v1'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.execution_contract <>
        v_execution_contract
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  /*
   * The completed ALL-DATA checkpoint saver atomically pins all successful
   * counters to nextRowIndex. The summary must use that exact durable row
   * boundary rather than inventing another authority.
   */
  if coalesce(v_job.raw_rows, -1) <>
       v_expected_rows
     or coalesce(v_job.normalized_rows, -1) <>
        v_expected_rows
     or coalesce(v_job.inserted_rows, -1) <>
        v_expected_rows
     or coalesce(v_job.failed_rows, -1) <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  /*
   * The unique (job_id, row_index) staging authority means count(*) also
   * represents the distinct persisted row-index count.
   */
  select
    count(*)::bigint,
    min(staging.row_index),
    max(staging.row_index),
    count(*)::bigint,

    count(*) filter (
      where staging.row_index >= 0
        and staging.row_index <
          v_expected_rows
    )::bigint,

    count(*) filter (
      where staging.row_index < 0
         or staging.row_index >=
            v_expected_rows
    )::bigint

  into
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_out_of_range_rows

  from public.media_sync_staging_rows
    as staging

  where staging.job_id =
    v_job_id;

  v_missing_expected_rows :=
    greatest(
      v_expected_rows -
        v_rows_in_expected_range,
      0
    );

  return query
  select
    v_job_id,
    v_expected_rows,
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_missing_expected_rows,
    v_out_of_range_rows,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows,
    v_date_window_count,
    v_date_window_summaries;
end;
$function$;

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
          and date=v_date;
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
$function$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.summarize_naver_searchads_combined_staging(p_payload jsonb)
 RETURNS TABLE(job_id uuid, expected_rows bigint, total_rows bigint, min_row_index bigint, max_row_index bigint, distinct_row_indexes bigint, rows_in_expected_range bigint, missing_expected_rows bigint, out_of_range_rows bigint, scope_mismatch_rows bigint, blank_row_key_rows bigint, missing_fingerprint_rows bigint, canonical_mismatch_rows bigint, date_window_count bigint, date_window_summaries jsonb, is_complete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_total_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;
  v_rows_in_expected_range bigint := 0;
  v_missing_expected_rows bigint := 0;
  v_out_of_range_rows bigint := 0;

  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_missing_fingerprint_rows bigint := 0;
  v_canonical_mismatch_rows bigint := 0;

  v_date_window_count bigint := 0;
  v_date_window_summaries jsonb := '[]'::jsonb;

  v_is_complete boolean := false;

  /*
   * Backward-compatible full-summary validation path.
   *
   * Large production snapshots use the separate base and validation batch
   * RPCs above so each PostgREST call has its own statement timeout budget.
   */
  v_validation_batch_size bigint := 2000;
  v_validation_after_row_index bigint := null;
  v_validation_batch_rows bigint := 0;
  v_validation_batch_max_row_index bigint := null;
  v_validation_batch_canonical_mismatch_rows bigint := 0;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * append RPC는 동일 job에 FOR UPDATE를 사용한다.
   * summary는 FOR SHARE를 사용하여 실행 중인 append와 직렬화하고,
   * 하나의 안정된 staging 상태를 검증한다.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  /*
   * Fast whole-job summary.
   *
   * The job_id predicate uses the existing staging job indexes. Expensive
   * canonical JSON and SHA-256 verification is deliberately excluded here
   * and performed below in bounded batches.
   */
  select
    count(*)::bigint,

    min(staging.row_index),
    max(staging.row_index),

    count(
      distinct staging.row_index
    )::bigint,

    count(*) filter (
      where staging.row_index >= 0
        and staging.row_index <
          v_expected_rows
    )::bigint,

    count(*) filter (
      where staging.row_index < 0
         or staging.row_index >=
            v_expected_rows
    )::bigint,

    count(*) filter (
      where staging.report_id <>
              v_report_id
         or staging.workspace_id <>
              v_workspace_id
         or staging.advertiser_id <>
              v_advertiser_id
         or staging.connection_id <>
              v_connection_id
         or staging.provider <>
              v_provider
         or staging.external_account_id <>
              v_external_account_id
         or staging.date_from <>
              v_date_from
         or staging.date_to <>
              v_date_to
         or staging.date <
              v_date_from
         or staging.date >
              v_date_to
    )::bigint,

    count(*) filter (
      where staging.row_key is null
         or length(
              btrim(staging.row_key)
            ) = 0
    )::bigint,

    count(*) filter (
      where staging.row_fingerprint is null
         or staging.row_fingerprint !~
              '^[0-9a-f]{64}$'
    )::bigint
  into
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_out_of_range_rows,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows
  from public.media_sync_staging_rows
    as staging
  where staging.job_id = v_job_id;

  /*
   * Backward-compatible in-function validation loop.
   *
   * This preserves the original direct RPC contract. The worker repository
   * does not use this full RPC for large production snapshots.
   */
  v_validation_after_row_index := null;
  v_canonical_mismatch_rows := 0;

  loop
    with validation_batch as materialized (
      select
        staging.row_index,
        staging.date,
        staging.channel,
        staging.device,
        staging.source,
        staging.provider,
        staging.external_account_id,
        staging.row,
        staging.row_fingerprint
      from public.media_sync_staging_rows
        as staging
      where staging.job_id = v_job_id
        and (
          v_validation_after_row_index is null
          or staging.row_index >
             v_validation_after_row_index
        )
      order by staging.row_index
      limit v_validation_batch_size
    )
    select
      count(*)::bigint,
      max(staging.row_index),
      count(*) filter (
        where
          jsonb_typeof(staging.row) <>
                   'object'

              or staging.row ->> 'date'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'report_date'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'day'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'ymd'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'channel'
                   is distinct from
                   staging.channel

              or staging.row ->> 'device'
                   is distinct from
                   staging.device

              or staging.row ->> 'source'
                   is distinct from
                   staging.source

              or staging.row ->> 'provider'
                   is distinct from
                   staging.provider

              or staging.row ->> 'external_account_id'
                   is distinct from
                   staging.external_account_id

              or staging.row ->> 'ingestion_source'
                   is distinct from
                   'api'

              /*
               * All combined rows share campaign/group identity and display names.
               */
              or nullif(
                   btrim(
                     staging.row
                       ->> 'external_campaign_id'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'external_group_id'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'campaign'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'group'
                   ),
                   ''
                 ) is null

              /*
               * Exactly one verified canonical grain is allowed per row.
               *
               * WEB_SITE    -> keyword (KPI authority) + creative (detail-only ad)
               * SHOPPING    -> creative (authoritative ad)
               * BRAND_SEARCH -> mixed (authoritative adgroup)
               */
              or not (
                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'keyword'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'keyword'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_registered_keyword_daily_stats'

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'external_keyword_id'
                    ),
                    ''
                  ) is not null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_creative_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'keyword'
                    ),
                    ''
                  ) is not null
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'row_level_reason'
                    in (
                      'naver_searchad_shopping_ad_daily_stats',
                      'naver_searchad_web_site_ad_daily_stats'
                    )

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'external_creative_id'
                    ),
                    ''
                  ) is not null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_keyword_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'creative'
                    ),
                    ''
                  ) is not null
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_brand_search_adgroup_daily_stats'

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_keyword_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_creative_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative_name',
                        ''
                      )
                    ),
                    ''
                  ) is null
                )
              )

              or staging.row_fingerprint <>
                   encode(
                     extensions.digest(
                       staging.row::text,
                       'sha256'
                     ),
                     'hex'
                   )
      )::bigint
    into
      v_validation_batch_rows,
      v_validation_batch_max_row_index,
      v_validation_batch_canonical_mismatch_rows
    from validation_batch
      as staging;

    exit when v_validation_batch_rows = 0;

    v_canonical_mismatch_rows :=
      v_canonical_mismatch_rows +
      v_validation_batch_canonical_mismatch_rows;

    if v_validation_batch_max_row_index is null
       or (
         v_validation_after_row_index is not null
         and v_validation_batch_max_row_index <=
             v_validation_after_row_index
       )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
    end if;

    v_validation_after_row_index :=
      v_validation_batch_max_row_index;
  end loop;

  v_missing_expected_rows :=
    greatest(
      v_expected_rows -
        v_rows_in_expected_range,
      0
    );

  select
    count(*)::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date_window_index',
            windows.date_window_index,
          'row_count',
            windows.row_count,
          'min_row_index',
            windows.min_row_index,
          'max_row_index',
            windows.max_row_index,
          'min_date',
            windows.min_date,
          'max_date',
            windows.max_date
        )
        order by
          windows.date_window_index
      ),
      '[]'::jsonb
    )
  into
    v_date_window_count,
    v_date_window_summaries
  from (
    select
      staging.date_window_index,

      count(*)::bigint
        as row_count,

      min(staging.row_index)
        as min_row_index,

      max(staging.row_index)
        as max_row_index,

      min(staging.date)::text
        as min_date,

      max(staging.date)::text
        as max_date
    from public.media_sync_staging_rows
      as staging
    where staging.job_id = v_job_id
    group by
      staging.date_window_index
  ) as windows;

  v_is_complete :=
    v_total_rows =
      v_expected_rows

    and v_distinct_row_indexes =
      v_expected_rows

    and v_rows_in_expected_range =
      v_expected_rows

    and v_missing_expected_rows = 0

    and v_out_of_range_rows = 0

    and v_scope_mismatch_rows = 0

    and v_blank_row_key_rows = 0

    and v_missing_fingerprint_rows = 0

    and v_canonical_mismatch_rows = 0

    and (
      (
        v_expected_rows = 0
        and v_min_row_index is null
        and v_max_row_index is null
        and v_date_window_count = 0
      )
      or
      (
        v_expected_rows > 0
        and v_min_row_index = 0
        and v_max_row_index =
          v_expected_rows - 1
        and v_date_window_count > 0
      )
    );

  return query
  select
    v_job_id,
    v_expected_rows,
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_missing_expected_rows,
    v_out_of_range_rows,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows,
    v_canonical_mismatch_rows,
    v_date_window_count,
    v_date_window_summaries,
    v_is_complete;
end;
$function$;

CREATE OR REPLACE FUNCTION public.summarize_naver_searchads_combined_staging_base(p_payload jsonb)
 RETURNS TABLE(job_id uuid, expected_rows bigint, total_rows bigint, min_row_index bigint, max_row_index bigint, distinct_row_indexes bigint, rows_in_expected_range bigint, missing_expected_rows bigint, out_of_range_rows bigint, scope_mismatch_rows bigint, blank_row_key_rows bigint, missing_fingerprint_rows bigint, date_window_count bigint, date_window_summaries jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_total_rows bigint := 0;
  v_min_row_index bigint := null;
  v_max_row_index bigint := null;
  v_distinct_row_indexes bigint := 0;
  v_rows_in_expected_range bigint := 0;
  v_missing_expected_rows bigint := 0;
  v_out_of_range_rows bigint := 0;

  v_scope_mismatch_rows bigint := 0;
  v_blank_row_key_rows bigint := 0;
  v_missing_fingerprint_rows bigint := 0;

  v_date_window_count bigint := 0;
  v_date_window_summaries jsonb := '[]'::jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * append RPC는 동일 job에 FOR UPDATE를 사용한다.
   * summary는 FOR SHARE를 사용하여 실행 중인 append와 직렬화하고,
   * 하나의 안정된 staging 상태를 검증한다.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  /*
   * Constant-time combined base authority.
   *
   * The collector/checkpoint contract already persists the authoritative
   * inserted row count on media_sync_jobs.
   *
   * Database schema authority guarantees:
   * - UNIQUE (job_id, row_index)
   * - CHECK (row_index >= 0)
   *
   * Therefore this base RPC does not rescan every staging row.
   *
   * It uses:
   * - job checkpoint counts as the expected persisted cardinality,
   * - one indexed ascending boundary probe,
   * - one indexed descending boundary probe.
   *
   * Exact row coverage is still independently proven immediately afterward
   * by validate_naver_searchads_combined_staging_batch_v3(), which walks every
   * row in bounded 2,000-row batches. The repository also requires the
   * validated row total to equal this base total and reloads the base summary
   * after validation.
   *
   * Fail-closed reasoning:
   * - duplicate row indexes are impossible by UNIQUE authority;
   * - negative row indexes are impossible by CHECK authority;
   * - an extra row outside the expected range moves max_row_index;
   * - a missing row makes bounded validation cover fewer rows than total_rows;
   * - count/checkpoint disagreement forces rows_in_expected_range to zero.
   *
   * This removes the O(n) whole-job index scan that reached ~7 seconds at
   * 1,709,290 rows and previously inherited the PostgREST 8-second timeout.
   */

  v_total_rows :=
    coalesce(
      v_job.inserted_rows,
      0
    );

  v_distinct_row_indexes :=
    v_total_rows;

  select staging.row_index
  into v_min_row_index
  from public.media_sync_staging_rows as staging
  where staging.job_id = v_job_id
  order by staging.row_index asc
  limit 1;

  select staging.row_index
  into v_max_row_index
  from public.media_sync_staging_rows as staging
  where staging.job_id = v_job_id
  order by staging.row_index desc
  limit 1;

  /*
   * Return an exact complete-looking range only when every checkpoint count
   * agrees and the indexed boundaries prove all possible row indexes are
   * inside the requested range.
   *
   * Any disagreement deliberately returns a conservative incomplete summary.
   */
  if v_job.raw_rows = v_total_rows
     and v_job.normalized_rows = v_total_rows
     and v_job.failed_rows = 0
     and (
       (
         v_total_rows = 0
         and v_min_row_index is null
         and v_max_row_index is null
       )
       or
       (
         v_total_rows > 0
         and v_min_row_index = 0
         and v_max_row_index = v_total_rows - 1
         and v_max_row_index < v_expected_rows
       )
     )
  then
    v_rows_in_expected_range :=
      v_total_rows;

    v_out_of_range_rows := 0;
  else
    v_rows_in_expected_range := 0;

    v_out_of_range_rows :=
      v_total_rows;
  end if;

  v_missing_expected_rows :=
    greatest(
      v_expected_rows -
        v_rows_in_expected_range,
      0
    );

  /*
   * These fields remain in the RPC return contract for compatibility. Their
   * verified values are supplied by the bounded v2 batch accumulation.
   */
  v_scope_mismatch_rows := 0;
  v_blank_row_key_rows := 0;
  v_missing_fingerprint_rows := 0;
  v_date_window_count := 0;
  v_date_window_summaries := '[]'::jsonb;

  return query
  select
    v_job_id,
    v_expected_rows,
    v_total_rows,
    v_min_row_index,
    v_max_row_index,
    v_distinct_row_indexes,
    v_rows_in_expected_range,
    v_missing_expected_rows,
    v_out_of_range_rows,
    v_scope_mismatch_rows,
    v_blank_row_key_rows,
    v_missing_fingerprint_rows,
    v_date_window_count,
    v_date_window_summaries;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_naver_searchads_combined_staging_batch(p_payload jsonb)
 RETURNS TABLE(job_id uuid, after_row_index bigint, batch_size bigint, batch_rows bigint, batch_max_row_index bigint, canonical_mismatch_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_validation_batch_size bigint := 2000;
  v_validation_after_row_index bigint := null;
  v_validation_batch_rows bigint := 0;
  v_validation_batch_max_row_index bigint := null;
  v_validation_batch_canonical_mismatch_rows bigint := 0;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  begin
    v_validation_after_row_index :=
      case
        when not (
          p_payload ? 'after_row_index'
        )
        or p_payload -> 'after_row_index' =
           'null'::jsonb
        then null
        else (
          p_payload ->> 'after_row_index'
        )::bigint
      end;

    v_validation_batch_size :=
      (p_payload ->> 'batch_size')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_validation_after_row_index < 0
     or v_validation_batch_size is null
     or v_validation_batch_size < 1
     or v_validation_batch_size > 2000
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * append RPC는 동일 job에 FOR UPDATE를 사용한다.
   * summary는 FOR SHARE를 사용하여 실행 중인 append와 직렬화하고,
   * 하나의 안정된 staging 상태를 검증한다.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

    with validation_batch as materialized (
      select
        staging.row_index,
        staging.date,
        staging.channel,
        staging.device,
        staging.source,
        staging.provider,
        staging.external_account_id,
        staging.row,
        staging.row_fingerprint
      from public.media_sync_staging_rows
        as staging
      where staging.job_id = v_job_id
        and (
          v_validation_after_row_index is null
          or staging.row_index >
             v_validation_after_row_index
        )
      order by staging.row_index
      limit v_validation_batch_size
    )
    select
      count(*)::bigint,
      max(staging.row_index),
      count(*) filter (
        where
          jsonb_typeof(staging.row) <>
                   'object'

              or staging.row ->> 'date'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'report_date'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'day'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'ymd'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'channel'
                   is distinct from
                   staging.channel

              or staging.row ->> 'device'
                   is distinct from
                   staging.device

              or staging.row ->> 'source'
                   is distinct from
                   staging.source

              or staging.row ->> 'provider'
                   is distinct from
                   staging.provider

              or staging.row ->> 'external_account_id'
                   is distinct from
                   staging.external_account_id

              or staging.row ->> 'ingestion_source'
                   is distinct from
                   'api'

              /*
               * All combined rows share campaign/group identity and display names.
               */
              or nullif(
                   btrim(
                     staging.row
                       ->> 'external_campaign_id'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'external_group_id'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'campaign'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'group'
                   ),
                   ''
                 ) is null

              /*
               * Exactly one verified canonical grain is allowed per row.
               *
               * WEB_SITE    -> keyword
               * SHOPPING    -> creative (authoritative ad)
               * BRAND_SEARCH -> mixed (authoritative adgroup)
               */
              or not (
                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'keyword'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'keyword'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_registered_keyword_daily_stats'

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'external_keyword_id'
                    ),
                    ''
                  ) is not null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_creative_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'keyword'
                    ),
                    ''
                  ) is not null
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_shopping_ad_daily_stats'

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'external_creative_id'
                    ),
                    ''
                  ) is not null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_keyword_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'creative'
                    ),
                    ''
                  ) is not null
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_brand_search_adgroup_daily_stats'

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_keyword_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_creative_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative_name',
                        ''
                      )
                    ),
                    ''
                  ) is null
                )
              )

              or staging.row_fingerprint <>
                   encode(
                     extensions.digest(
                       staging.row::text,
                       'sha256'
                     ),
                     'hex'
                   )
      )::bigint
    into
      v_validation_batch_rows,
      v_validation_batch_max_row_index,
      v_validation_batch_canonical_mismatch_rows
    from validation_batch
      as staging;

  return query
  select
    v_job_id,
    v_validation_after_row_index,
    v_validation_batch_size,
    v_validation_batch_rows,
    v_validation_batch_max_row_index,
    v_validation_batch_canonical_mismatch_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_google_ads_all_data_staging_batch_v1(p_payload jsonb)
 RETURNS TABLE(job_id uuid, after_row_index bigint, batch_size bigint, batch_rows bigint, batch_max_row_index bigint, scope_mismatch_rows bigint, blank_row_key_rows bigint, missing_fingerprint_rows bigint, canonical_mismatch_rows bigint, date_window_summaries jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_execution_contract text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_validation_batch_size bigint := 2000;
  v_validation_after_row_index bigint := null;

  v_validation_batch_rows bigint := 0;
  v_validation_batch_max_row_index bigint := null;

  v_validation_batch_scope_mismatch_rows bigint := 0;
  v_validation_batch_blank_row_key_rows bigint := 0;
  v_validation_batch_missing_fingerprint_rows bigint := 0;
  v_validation_batch_canonical_mismatch_rows bigint := 0;

  v_validation_batch_date_window_summaries
    jsonb := '[]'::jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_execution_contract :=
      nullif(
        btrim(
          p_payload ->> 'execution_contract'
        ),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  begin
    v_validation_after_row_index :=
      case
        when not (
          p_payload ? 'after_row_index'
        )
        or p_payload -> 'after_row_index' =
           'null'::jsonb
        then null

        else (
          p_payload ->> 'after_row_index'
        )::bigint
      end;

    v_validation_batch_size :=
      (p_payload ->> 'batch_size')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_execution_contract is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_validation_after_row_index < 0
     or v_validation_batch_size is null
     or v_validation_batch_size < 1
     or v_validation_batch_size > 2000
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * Serialize one bounded read with an active append on the same job.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'google_ads'
     or v_provider <> 'google_ads'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.execution_contract <>
       'google_all_data_v1'
     or v_execution_contract <>
       'google_all_data_v1'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.execution_contract <>
        v_execution_contract
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  if coalesce(v_job.raw_rows, -1) <>
       v_expected_rows
     or coalesce(v_job.normalized_rows, -1) <>
        v_expected_rows
     or coalesce(v_job.inserted_rows, -1) <>
        v_expected_rows
     or coalesce(v_job.failed_rows, -1) <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

  with validation_batch as materialized (
    select
      staging.date_window_index,
      staging.row_index,

      staging.report_id,
      staging.workspace_id,
      staging.advertiser_id,
      staging.connection_id,

      staging.date_from,
      staging.date_to,

      staging.row_key,
      staging.date,

      staging.channel,
      staging.device,
      staging.source,

      staging.provider,
      staging.external_account_id,

      staging.row,
      staging.row_fingerprint

    from public.media_sync_staging_rows
      as staging

    where staging.job_id =
      v_job_id

      and (
        v_validation_after_row_index
          is null

        or staging.row_index >
          v_validation_after_row_index
      )

    order by staging.row_index

    limit v_validation_batch_size
  )

  select
    count(*)::bigint,

    max(staging.row_index),

    /*
     * Persisted outer scope.
     */
    count(*) filter (
      where staging.report_id <>
              v_report_id

         or staging.workspace_id <>
              v_workspace_id

         or staging.advertiser_id <>
              v_advertiser_id

         or staging.connection_id <>
              v_connection_id

         or staging.provider <>
              v_provider

         or staging.external_account_id <>
              v_external_account_id

         or staging.date_from <>
              v_date_from

         or staging.date_to <>
              v_date_to

         or staging.date <
              v_date_from

         or staging.date >
              v_date_to
    )::bigint,

    /*
     * Physical identity fields.
     */
    count(*) filter (
      where staging.row_key is null
         or length(
              btrim(staging.row_key)
            ) = 0
    )::bigint,

    count(*) filter (
      where staging.row_fingerprint
              is null

         or staging.row_fingerprint
              !~ '^[0-9a-f]{64}$'
    )::bigint,

    /*
     * Complete persisted canonical contract.
     *
     * The row key is rebuilt independently from canonical row +
     * provider_meta authority and compared to the stored key.
     */
    count(*) filter (
      where
        jsonb_typeof(staging.row) <>
          'object'

        or staging.row ->> 'date'
             is distinct from
             to_char(
               staging.date,
               'YYYY-MM-DD'
             )

        or staging.row ->> 'report_date'
             is distinct from
             to_char(
               staging.date,
               'YYYY-MM-DD'
             )

        or staging.row ->> 'day'
             is distinct from
             to_char(
               staging.date,
               'YYYY-MM-DD'
             )

        or staging.row ->> 'ymd'
             is distinct from
             to_char(
               staging.date,
               'YYYY-MM-DD'
             )

        /* Match the existing TypeScript nullable presentation-field mapping. */
        or nullif(btrim(staging.row ->> 'channel'), '')
             is distinct from
             staging.channel

        or nullif(btrim(staging.row ->> 'device'), '')
             is distinct from
             staging.device

        or nullif(btrim(staging.row ->> 'source'), '')
             is distinct from
             staging.source

        or staging.row ->> 'provider'
             is distinct from
             staging.provider

        or staging.row ->> 'external_account_id'
             is distinct from
             staging.external_account_id

        or staging.row ->> 'ingestion_source'
             is distinct from
             'api'

        or nullif(
             btrim(
               staging.row
                 ->> 'external_campaign_id'
             ),
             ''
           ) is null

        or nullif(
             btrim(
               staging.row
                 ->> 'external_group_id'
             ),
             ''
           ) is null

        or nullif(
             btrim(
               staging.row
                 ->> 'campaign'
             ),
             ''
           ) is null

        or nullif(
             btrim(
               staging.row
                 ->> 'group'
             ),
             ''
           ) is null

        or staging.row ->> 'row_level'
             is distinct from
             staging.row ->> 'data_level'

        /*
         * Provider authority metadata.
         */
        or jsonb_typeof(
             staging.row -> 'provider_meta'
           ) is distinct from
           'object'

        or staging.row
             #>> '{provider_meta,provider}'
             is distinct from
             'google_ads'

        or not (
          (
            staging.row #>> '{provider_meta,campaign_type}'
              is not distinct from 'SEARCH'
            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from 'search'
          )
          or
          (
            staging.row #>> '{provider_meta,campaign_type}'
              is not distinct from 'DEMAND_GEN'
            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from 'demand_gen'
          )
          or
          (
            staging.row #>> '{provider_meta,campaign_type}'
              is not distinct from 'DISPLAY'
            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from 'display'
          )
          or
          (
            staging.row #>> '{provider_meta,campaign_type}'
              is not distinct from 'PERFORMANCE_MAX'
            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from 'performance_max'
          )
        )

        or not (
          (
            staging.row #>> '{provider_meta,product_family}'
              in ('search', 'demand_gen', 'display')
            and staging.row
                  #>> '{provider_meta,authoritative_grain}'
                  is not distinct from
                  'ad'
          )
          or
          (
            staging.row #>> '{provider_meta,product_family}'
              is not distinct from
              'performance_max'
            and staging.row
                  #>> '{provider_meta,authoritative_grain}'
                  is not distinct from
                  'asset_group'
          )
        )

        /*
         * Exactly one executable ALL-DATA canonical grain.
         */
        or not (
          (
            staging.row ->> 'row_level'
              is not distinct from
              'keyword'

            and staging.row ->> 'data_level'
              is not distinct from
              'keyword'

            and staging.row ->> 'row_level_reason'
              is not distinct from
              'google_ads_keyword_daily_stats'

            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from 'search'

            and nullif(
                  btrim(
                    staging.row
                      ->> 'external_keyword_id'
                  ),
                  ''
                ) is not null

            and nullif(
                  btrim(
                    coalesce(
                      staging.row
                        ->> 'external_creative_id',
                      ''
                    )
                  ),
                  ''
                ) is null

            and nullif(
                  btrim(
                    staging.row
                      ->> 'keyword'
                  ),
                  ''
                ) is not null

            and staging.row
                  #>> '{provider_meta,entity_type}'
                  is not distinct from
                  'keyword'

            and staging.row
                  #>> '{provider_meta,entity_id}'
                  is not distinct from
                  staging.row
                    ->> 'external_keyword_id'
          )

          or

          (
            staging.row ->> 'row_level'
              is not distinct from
              'creative'

            and staging.row ->> 'data_level'
              is not distinct from
              'creative'

            and (
              (
                staging.row #>> '{provider_meta,product_family}'
                  is not distinct from 'search'
                and staging.row ->> 'row_level_reason'
                  is not distinct from 'google_ads_search_ad_daily_stats'
              )
              or
              (
                staging.row #>> '{provider_meta,product_family}'
                  is not distinct from 'demand_gen'
                and staging.row ->> 'row_level_reason'
                  is not distinct from 'google_ads_demand_gen_ad_daily_stats'
              )
              or
              (
                staging.row #>> '{provider_meta,product_family}'
                  is not distinct from 'display'
                and staging.row ->> 'row_level_reason'
                  is not distinct from 'google_ads_display_ad_daily_stats'
              )
            )

            and nullif(
                  btrim(
                    staging.row
                      ->> 'external_creative_id'
                  ),
                  ''
                ) is not null

            and nullif(
                  btrim(
                    coalesce(
                      staging.row
                        ->> 'external_keyword_id',
                      ''
                    )
                  ),
                  ''
                ) is null

            and nullif(
                  btrim(
                    staging.row
                      ->> 'creative'
                  ),
                  ''
                ) is not null

            and staging.row
                  #>> '{provider_meta,entity_type}'
                  is not distinct from
                  'ad'

            and staging.row
                  #>> '{provider_meta,entity_id}'
                  is not distinct from
                  staging.row
                    ->> 'external_creative_id'
          )

          or

          (
            staging.row ->> 'row_level'
              is not distinct from
              'creative'

            and staging.row ->> 'data_level'
              is not distinct from
              'creative'

            and staging.row #>> '{provider_meta,product_family}'
              is not distinct from
              'performance_max'

            and staging.row ->> 'row_level_reason'
              is not distinct from
              'google_ads_performance_max_asset_group_daily_stats'

            and nullif(
                  btrim(
                    staging.row
                      ->> 'external_creative_id'
                  ),
                  ''
                ) is not null

            and nullif(
                  btrim(
                    coalesce(
                      staging.row
                        ->> 'external_keyword_id',
                      ''
                    )
                  ),
                  ''
                ) is null

            and nullif(
                  btrim(
                    staging.row
                      ->> 'creative'
                  ),
                  ''
                ) is not null

            and staging.row
                  #>> '{provider_meta,entity_type}'
                  is not distinct from
                  'asset_group'

            and staging.row
                  #>> '{provider_meta,entity_id}'
                  is not distinct from
                  staging.row
                    ->> 'external_creative_id'
          )
        )

        /*
         * Exact persisted ALL-DATA product-specific row identity.
         *
         * array_to_json(text[]) emits the same compact JSON-array shape used
         * by JSON.stringify() in the TypeScript staging contract.
         */
        or staging.row_key
             is distinct from
             array_to_json(
               array[
                 'google_ads'::text,
                 staging.row #>> '{provider_meta,product_family}',

                 staging.row
                   #>> '{provider_meta,entity_type}',

                 staging.row
                   ->> 'external_account_id',

                 staging.row
                   ->> 'external_campaign_id',

                 staging.row
                   ->> 'external_group_id',

                 staging.row
                   #>> '{provider_meta,entity_id}',

                 staging.row
                   ->> 'date'
               ]::text[]
             )::text

        /*
         * Stored generated fingerprint must still represent the persisted
         * canonical JSON exactly.
         */
        or staging.row_fingerprint <>
             encode(
               extensions.digest(
                 staging.row::text,
                 'sha256'
               ),
               'hex'
             )
    )::bigint,

    /*
     * Per-batch date-window structural summaries.
     */
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date_window_index',
              windows.date_window_index,

            'row_count',
              windows.row_count,

            'min_row_index',
              windows.min_row_index,

            'max_row_index',
              windows.max_row_index,

            'min_date',
              windows.min_date,

            'max_date',
              windows.max_date
          )
          order by
            windows.date_window_index
        )

        from (
          select
            batch_rows.date_window_index,

            count(*)::bigint
              as row_count,

            min(batch_rows.row_index)
              as min_row_index,

            max(batch_rows.row_index)
              as max_row_index,

            min(batch_rows.date)::text
              as min_date,

            max(batch_rows.date)::text
              as max_date

          from validation_batch
            as batch_rows

          group by
            batch_rows.date_window_index
        ) as windows
      ),
      '[]'::jsonb
    )

  into
    v_validation_batch_rows,
    v_validation_batch_max_row_index,

    v_validation_batch_scope_mismatch_rows,
    v_validation_batch_blank_row_key_rows,
    v_validation_batch_missing_fingerprint_rows,
    v_validation_batch_canonical_mismatch_rows,

    v_validation_batch_date_window_summaries

  from validation_batch
    as staging;

  return query
  select
    v_job_id,
    v_validation_after_row_index,
    v_validation_batch_size,
    v_validation_batch_rows,
    v_validation_batch_max_row_index,

    v_validation_batch_scope_mismatch_rows,
    v_validation_batch_blank_row_key_rows,
    v_validation_batch_missing_fingerprint_rows,
    v_validation_batch_canonical_mismatch_rows,

    v_validation_batch_date_window_summaries;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transition_naver_media_sync_segment(p_payload jsonb)
 RETURNS SETOF media_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_progress jsonb;
  v_next_progress jsonb;

  v_existing_progress jsonb;
  v_checkpoint jsonb;
  v_collector jsonb;

  v_expected_current_index bigint;
  v_expected_completed_count bigint;
  v_expected_total_count bigint;
  v_expected_complete boolean;

  v_next_current_index bigint;
  v_next_completed_count bigint;
  v_next_total_count bigint;
  v_next_complete boolean;

  v_checkpoint_index bigint;
  v_checkpoint_phase text;
  v_checkpoint_next_row_index bigint;
  v_checkpoint_inserted_rows bigint;
  v_checkpoint_failed_rows bigint;

  v_expected_total_from_dates bigint;

  v_next_checkpoint jsonb;
  v_next_error_detail jsonb;

  v_is_exact_replay boolean := false;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      (
        p_payload ->> 'date_from'
      )::date;

    v_date_to :=
      (
        p_payload ->> 'date_to'
      )::date;

    v_expected_progress :=
      p_payload -> 'expected_progress';

    v_next_progress :=
      p_payload -> 'next_progress';
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_date_to < v_date_from
     or jsonb_typeof(v_expected_progress) <> 'object'
     or jsonb_typeof(v_next_progress) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_INPUT';
  end if;

  select *
  into v_job
  from public.media_sync_jobs
  where id = v_job_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_JOB_NOT_FOUND';
  end if;

  if v_job.status <> 'processing'
     or v_job.snapshot_ingestion_id is not null
     or v_job.finished_at is not null
     or v_job.failed_rows <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_JOB_NOT_PROCESSING';
  end if;

  if v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <> v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_SCOPE_MISMATCH';
  end if;

  if v_job.provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_UNSUPPORTED_PROVIDER';
  end if;

  begin
    if v_expected_progress ->> 'contract'
         is distinct from 'sync_segment_v1'
       or (
         v_expected_progress ->> 'version'
       )::bigint is distinct from 1
       or (
         v_expected_progress ->> 'segmentDays'
       )::bigint is distinct from 7
       or (
         v_expected_progress ->> 'dateFrom'
       )::date is distinct from v_job.date_from
       or (
         v_expected_progress ->> 'dateTo'
       )::date is distinct from v_job.date_to
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_PROGRESS';
    end if;

    if v_next_progress ->> 'contract'
         is distinct from 'sync_segment_v1'
       or (
         v_next_progress ->> 'version'
       )::bigint is distinct from 1
       or (
         v_next_progress ->> 'segmentDays'
       )::bigint is distinct from 7
       or (
         v_next_progress ->> 'dateFrom'
       )::date is distinct from v_job.date_from
       or (
         v_next_progress ->> 'dateTo'
       )::date is distinct from v_job.date_to
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_PROGRESS';
    end if;

    v_expected_current_index :=
      (
        v_expected_progress ->> 'currentIndex'
      )::bigint;

    v_expected_completed_count :=
      (
        v_expected_progress ->> 'completedCount'
      )::bigint;

    v_expected_total_count :=
      (
        v_expected_progress ->> 'totalCount'
      )::bigint;

    v_expected_complete :=
      (
        v_expected_progress ->> 'complete'
      )::boolean;

    if v_next_progress -> 'currentIndex' =
         'null'::jsonb
    then
      v_next_current_index :=
        null;
    else
      v_next_current_index :=
        (
          v_next_progress ->> 'currentIndex'
        )::bigint;
    end if;

    v_next_completed_count :=
      (
        v_next_progress ->> 'completedCount'
      )::bigint;

    v_next_total_count :=
      (
        v_next_progress ->> 'totalCount'
      )::bigint;

    v_next_complete :=
      (
        v_next_progress ->> 'complete'
      )::boolean;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_PROGRESS';
  end;

  v_expected_total_from_dates :=
    ceil(
      (
        (
          v_job.date_to -
          v_job.date_from +
          1
        )::numeric
      ) /
      7::numeric
    )::bigint;

  if v_expected_total_count
       is distinct from
       v_expected_total_from_dates
     or v_next_total_count
       is distinct from
       v_expected_total_count
     or v_expected_completed_count is null
     or v_expected_current_index is null
     or v_expected_complete is null
     or v_next_completed_count is null
     or v_next_complete is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_PROGRESS';
  end if;

  if v_expected_complete
     or v_expected_completed_count < 0
     or v_expected_completed_count >=
        v_expected_total_count
     or v_expected_current_index <>
        v_expected_completed_count
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_PROGRESS';
  end if;

  if v_next_completed_count <>
       v_expected_completed_count + 1
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_INVALID_TRANSITION';
  end if;

  if v_next_complete then
    if v_next_completed_count <>
         v_next_total_count
       or v_next_current_index is not null
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_TRANSITION';
    end if;
  else
    if v_next_completed_count >=
         v_next_total_count
       or v_next_current_index is null
       or v_next_current_index <>
          v_next_completed_count
       or v_next_current_index <>
          v_expected_current_index + 1
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_INVALID_TRANSITION';
    end if;
  end if;

  v_existing_progress :=
    v_job.sync_segment_progress;

  if v_existing_progress =
       v_next_progress
  then
    v_is_exact_replay :=
      true;
  elsif v_existing_progress is distinct from
        v_expected_progress
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_PROGRESS_MISMATCH';
  end if;

  if jsonb_typeof(v_job.error_detail) <>
       'object'
     or jsonb_typeof(
       v_job.error_detail ->
       'processing_checkpoint'
     ) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_CHECKPOINT_MISSING';
  end if;

  v_checkpoint :=
    v_job.error_detail ->
    'processing_checkpoint';

  v_collector :=
    v_checkpoint ->
    'collector';

  if jsonb_typeof(v_collector) <>
       'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_CHECKPOINT_INVALID';
  end if;

  if not v_is_exact_replay then
    begin
      v_checkpoint_index :=
        (
          v_collector ->>
          'date_window_index'
        )::bigint;

      v_checkpoint_phase :=
        v_collector ->>
        'phase';

      v_checkpoint_next_row_index :=
        (
          v_collector ->>
          'next_row_index'
        )::bigint;

      v_checkpoint_inserted_rows :=
        (
          v_checkpoint ->>
          'inserted_rows'
        )::bigint;

      v_checkpoint_failed_rows :=
        (
          v_checkpoint ->>
          'failed_rows'
        )::bigint;
    exception
      when others then
        raise exception using
          errcode = 'P0001',
          message = 'MNST_CHECKPOINT_INVALID';
    end;

    if v_checkpoint_phase
         is distinct from 'completed'
       or v_checkpoint_index
         is distinct from
         v_expected_current_index
       or v_checkpoint_next_row_index
         is distinct from
         v_job.inserted_rows
       or v_checkpoint_inserted_rows
         is distinct from
         v_job.inserted_rows
       or v_checkpoint_failed_rows
         is distinct from 0
       or v_collector #>>
          '{keyword,complete}'
          is distinct from 'true'
       or v_collector #>>
          '{authoritative,complete}'
          is distinct from 'true'
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_CHECKPOINT_NOT_COMPLETED';
    end if;
  end if;

  if v_next_complete then
    if v_is_exact_replay then
      if v_collector #>>
           '{phase}'
           is distinct from 'completed'
         or (
           v_collector ->>
           'date_window_index'
         )::bigint is distinct from
           v_expected_current_index
      then
        raise exception using
          errcode = 'P0001',
          message = 'MNST_REPLAY_MISMATCH';
      end if;

      return next v_job;
      return;
    end if;

    update public.media_sync_jobs
    set
      sync_segment_progress =
        v_next_progress,

      updated_at =
        statement_timestamp()

    where id = v_job_id
      and status = 'processing'
      and snapshot_ingestion_id is null
      and finished_at is null

    returning *
    into v_job;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_JOB_NOT_PROCESSING';
    end if;

    return next v_job;
    return;
  end if;

  v_next_checkpoint :=
    jsonb_build_object(
      'version',
        1,

      'saved_at',
        to_jsonb(
          statement_timestamp()
        ),

      'date_window_index',
        v_next_current_index,

      'raw_rows',
        v_job.raw_rows,

      'normalized_rows',
        v_job.normalized_rows,

      'inserted_rows',
        v_job.inserted_rows,

      'failed_rows',
        0,

      'collector',
        jsonb_build_object(
          'discovered_keywords',
            0,

          'completed_keywords',
            0,

          'stats_requests_attempted',
            0,

          'stats_requests_succeeded',
            0,

          'retry_count',
            0,

          'date_window_index',
            v_next_current_index,

          'cursor',
            null,

          'combined_version',
            1,

          'phase',
            'keyword',

          'next_row_index',
            v_job.inserted_rows,

          'keyword',
            jsonb_build_object(
              'complete',
                false,

              'cursor',
                null,

              'counts',
                jsonb_build_object(
                  'discovered',
                    0,

                  'completed',
                    0,

                  'statsRequestsAttempted',
                    0,

                  'statsRequestsSucceeded',
                    0,

                  'retryCount',
                    0
                )
            ),

          'authoritative',
            jsonb_build_object(
              'complete',
                false,

              'cursor',
                null,

              'counts',
                jsonb_build_object(
                  'discovered',
                    0,

                  'completed',
                    0,

                  'statsRequestsAttempted',
                    0,

                  'statsRequestsSucceeded',
                    0,

                  'retryCount',
                    0
                )
            )
        )
    );

  if v_is_exact_replay then
    if (
      v_checkpoint - 'saved_at'
    ) is distinct from
      (
        v_next_checkpoint -
        'saved_at'
      )
    then
      raise exception using
        errcode = 'P0001',
        message = 'MNST_REPLAY_MISMATCH';
    end if;

    return next v_job;
    return;
  end if;

  v_next_error_detail :=
    jsonb_set(
      v_job.error_detail,
      '{processing_checkpoint}',
      v_next_checkpoint,
      true
    );

  update public.media_sync_jobs
  set
    sync_segment_progress =
      v_next_progress,

    error_detail =
      v_next_error_detail,

    updated_at =
      statement_timestamp()

  where id = v_job_id
    and status = 'processing'
    and snapshot_ingestion_id is null
    and finished_at is null

  returning *
  into v_job;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MNST_JOB_NOT_PROCESSING';
  end if;

  return next v_job;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_naver_searchads_combined_staging_batch_v2(p_payload jsonb)
 RETURNS TABLE(job_id uuid, after_row_index bigint, batch_size bigint, batch_rows bigint, batch_max_row_index bigint, scope_mismatch_rows bigint, blank_row_key_rows bigint, missing_fingerprint_rows bigint, canonical_mismatch_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_validation_batch_size bigint := 2000;
  v_validation_after_row_index bigint := null;
  v_validation_batch_rows bigint := 0;
  v_validation_batch_max_row_index bigint := null;
  v_validation_batch_scope_mismatch_rows bigint := 0;
  v_validation_batch_blank_row_key_rows bigint := 0;
  v_validation_batch_missing_fingerprint_rows bigint := 0;
  v_validation_batch_canonical_mismatch_rows bigint := 0;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  begin
    v_validation_after_row_index :=
      case
        when not (
          p_payload ? 'after_row_index'
        )
        or p_payload -> 'after_row_index' =
           'null'::jsonb
        then null
        else (
          p_payload ->> 'after_row_index'
        )::bigint
      end;

    v_validation_batch_size :=
      (p_payload ->> 'batch_size')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_validation_after_row_index < 0
     or v_validation_batch_size is null
     or v_validation_batch_size < 1
     or v_validation_batch_size > 2000
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * append RPC는 동일 job에 FOR UPDATE를 사용한다.
   * summary는 FOR SHARE를 사용하여 실행 중인 append와 직렬화하고,
   * 하나의 안정된 staging 상태를 검증한다.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

    with validation_batch as materialized (
      select
        staging.row_index,
        staging.report_id,
        staging.workspace_id,
        staging.advertiser_id,
        staging.connection_id,
        staging.date_from,
        staging.date_to,
        staging.row_key,
        staging.date,
        staging.channel,
        staging.device,
        staging.source,
        staging.provider,
        staging.external_account_id,
        staging.row,
        staging.row_fingerprint
      from public.media_sync_staging_rows
        as staging
      where staging.job_id = v_job_id
        and (
          v_validation_after_row_index is null
          or staging.row_index >
             v_validation_after_row_index
        )
      order by staging.row_index
      limit v_validation_batch_size
    )
    select
      count(*)::bigint,
      max(staging.row_index),
      count(*) filter (
        where staging.report_id <> v_report_id
           or staging.workspace_id <> v_workspace_id
           or staging.advertiser_id <> v_advertiser_id
           or staging.connection_id <> v_connection_id
           or staging.provider <> v_provider
           or staging.external_account_id <> v_external_account_id
           or staging.date_from <> v_date_from
           or staging.date_to <> v_date_to
           or staging.date < v_date_from
           or staging.date > v_date_to
      )::bigint,
      count(*) filter (
        where staging.row_key is null
           or length(btrim(staging.row_key)) = 0
      )::bigint,
      count(*) filter (
        where staging.row_fingerprint is null
           or staging.row_fingerprint !~ '^[0-9a-f]{64}$'
      )::bigint,
      count(*) filter (
        where
          jsonb_typeof(staging.row) <>
                   'object'

              or staging.row ->> 'date'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'report_date'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'day'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'ymd'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'channel'
                   is distinct from
                   staging.channel

              or staging.row ->> 'device'
                   is distinct from
                   staging.device

              or staging.row ->> 'source'
                   is distinct from
                   staging.source

              or staging.row ->> 'provider'
                   is distinct from
                   staging.provider

              or staging.row ->> 'external_account_id'
                   is distinct from
                   staging.external_account_id

              or staging.row ->> 'ingestion_source'
                   is distinct from
                   'api'

              /*
               * All combined rows share campaign/group identity and display names.
               */
              or nullif(
                   btrim(
                     staging.row
                       ->> 'external_campaign_id'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'external_group_id'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'campaign'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'group'
                   ),
                   ''
                 ) is null

              /*
               * Exactly one verified canonical grain is allowed per row.
               *
               * WEB_SITE    -> keyword
               * SHOPPING    -> creative (authoritative ad)
               * BRAND_SEARCH -> mixed (authoritative adgroup)
               */
              or not (
                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'keyword'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'keyword'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_registered_keyword_daily_stats'

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'external_keyword_id'
                    ),
                    ''
                  ) is not null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_creative_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'keyword'
                    ),
                    ''
                  ) is not null
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_shopping_ad_daily_stats'

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'external_creative_id'
                    ),
                    ''
                  ) is not null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_keyword_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'creative'
                    ),
                    ''
                  ) is not null
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_brand_search_adgroup_daily_stats'

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_keyword_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_creative_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative_name',
                        ''
                      )
                    ),
                    ''
                  ) is null
                )
              )

              or staging.row_fingerprint <>
                   encode(
                     extensions.digest(
                       staging.row::text,
                       'sha256'
                     ),
                     'hex'
                   )
      )::bigint
    into
      v_validation_batch_rows,
      v_validation_batch_max_row_index,
      v_validation_batch_scope_mismatch_rows,
      v_validation_batch_blank_row_key_rows,
      v_validation_batch_missing_fingerprint_rows,
      v_validation_batch_canonical_mismatch_rows
    from validation_batch
      as staging;

  return query
  select
    v_job_id,
    v_validation_after_row_index,
    v_validation_batch_size,
    v_validation_batch_rows,
    v_validation_batch_max_row_index,
    v_validation_batch_scope_mismatch_rows,
    v_validation_batch_blank_row_key_rows,
    v_validation_batch_missing_fingerprint_rows,
    v_validation_batch_canonical_mismatch_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_naver_searchads_combined_staging_batch_v3(p_payload jsonb)
 RETURNS TABLE(job_id uuid, after_row_index bigint, batch_size bigint, batch_rows bigint, batch_max_row_index bigint, scope_mismatch_rows bigint, blank_row_key_rows bigint, missing_fingerprint_rows bigint, canonical_mismatch_rows bigint, date_window_summaries jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '2min'
AS $function$
declare
  v_job public.media_sync_jobs%rowtype;

  v_job_id uuid;
  v_report_id uuid;
  v_workspace_id uuid;
  v_advertiser_id uuid;
  v_connection_id uuid;

  v_provider text;
  v_external_account_id text;

  v_date_from date;
  v_date_to date;

  v_expected_rows bigint;

  v_validation_batch_size bigint := 2000;
  v_validation_after_row_index bigint := null;
  v_validation_batch_rows bigint := 0;
  v_validation_batch_max_row_index bigint := null;
  v_validation_batch_scope_mismatch_rows bigint := 0;
  v_validation_batch_blank_row_key_rows bigint := 0;
  v_validation_batch_missing_fingerprint_rows bigint := 0;
  v_validation_batch_canonical_mismatch_rows bigint := 0;
  v_validation_batch_date_window_summaries jsonb := '[]'::jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  begin
    v_job_id :=
      nullif(
        btrim(p_payload ->> 'job_id'),
        ''
      )::uuid;

    v_report_id :=
      nullif(
        btrim(p_payload ->> 'report_id'),
        ''
      )::uuid;

    v_workspace_id :=
      nullif(
        btrim(p_payload ->> 'workspace_id'),
        ''
      )::uuid;

    v_advertiser_id :=
      nullif(
        btrim(p_payload ->> 'advertiser_id'),
        ''
      )::uuid;

    v_connection_id :=
      nullif(
        btrim(p_payload ->> 'connection_id'),
        ''
      )::uuid;

    v_provider :=
      nullif(
        btrim(p_payload ->> 'provider'),
        ''
      );

    v_external_account_id :=
      nullif(
        btrim(
          p_payload ->> 'external_account_id'
        ),
        ''
      );

    v_date_from :=
      nullif(
        btrim(p_payload ->> 'date_from'),
        ''
      )::date;

    v_date_to :=
      nullif(
        btrim(p_payload ->> 'date_to'),
        ''
      )::date;

    v_expected_rows :=
      (p_payload ->> 'expected_rows')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  begin
    v_validation_after_row_index :=
      case
        when not (
          p_payload ? 'after_row_index'
        )
        or p_payload -> 'after_row_index' =
           'null'::jsonb
        then null
        else (
          p_payload ->> 'after_row_index'
        )::bigint
      end;

    v_validation_batch_size :=
      (p_payload ->> 'batch_size')::bigint;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'MSS_SUMMARY_INVALID_INPUT';
  end;

  if v_job_id is null
     or v_report_id is null
     or v_workspace_id is null
     or v_advertiser_id is null
     or v_connection_id is null
     or v_provider is null
     or v_external_account_id is null
     or v_date_from is null
     or v_date_to is null
     or v_expected_rows is null
     or v_expected_rows < 0
     or v_expected_rows > 9007199254740991
     or v_validation_after_row_index < 0
     or v_validation_batch_size is null
     or v_validation_batch_size < 1
     or v_validation_batch_size > 2000
     or v_date_from > v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_INPUT';
  end if;

  /*
   * append RPC는 동일 job에 FOR UPDATE를 사용한다.
   * summary는 FOR SHARE를 사용하여 실행 중인 append와 직렬화하고,
   * 하나의 안정된 staging 상태를 검증한다.
   */
  select job.*
  into v_job
  from public.media_sync_jobs as job
  where job.id = v_job_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_INVALID_JOB';
  end if;

  if v_job.status <> 'processing' then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_JOB_NOT_PROCESSING';
  end if;

  if v_job.provider <> 'naver_searchad'
     or v_provider <> 'naver_searchad'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_UNSUPPORTED_PROVIDER';
  end if;

  if v_job.report_id <> v_report_id
     or v_job.workspace_id <> v_workspace_id
     or v_job.advertiser_id <> v_advertiser_id
     or v_job.connection_id <> v_connection_id
     or v_job.provider <> v_provider
     or v_job.external_account_id <>
        v_external_account_id
     or v_job.date_from <> v_date_from
     or v_job.date_to <> v_date_to
  then
    raise exception using
      errcode = 'P0001',
      message = 'MSS_SUMMARY_SCOPE_MISMATCH';
  end if;

    with validation_batch as materialized (
      select
        staging.date_window_index,
        staging.row_index,
        staging.report_id,
        staging.workspace_id,
        staging.advertiser_id,
        staging.connection_id,
        staging.date_from,
        staging.date_to,
        staging.row_key,
        staging.date,
        staging.channel,
        staging.device,
        staging.source,
        staging.provider,
        staging.external_account_id,
        staging.row,
        staging.row_fingerprint
      from public.media_sync_staging_rows
        as staging
      where staging.job_id = v_job_id
        and (
          v_validation_after_row_index is null
          or staging.row_index >
             v_validation_after_row_index
        )
      order by staging.row_index
      limit v_validation_batch_size
    )
    select
      count(*)::bigint,
      max(staging.row_index),
      count(*) filter (
        where staging.report_id <> v_report_id
           or staging.workspace_id <> v_workspace_id
           or staging.advertiser_id <> v_advertiser_id
           or staging.connection_id <> v_connection_id
           or staging.provider <> v_provider
           or staging.external_account_id <> v_external_account_id
           or staging.date_from <> v_date_from
           or staging.date_to <> v_date_to
           or staging.date < v_date_from
           or staging.date > v_date_to
      )::bigint,
      count(*) filter (
        where staging.row_key is null
           or length(btrim(staging.row_key)) = 0
      )::bigint,
      count(*) filter (
        where staging.row_fingerprint is null
           or staging.row_fingerprint !~ '^[0-9a-f]{64}$'
      )::bigint,
      count(*) filter (
        where
          jsonb_typeof(staging.row) <>
                   'object'

              or staging.row ->> 'date'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'report_date'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'day'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'ymd'
                   is distinct from
                   to_char(
                     staging.date,
                     'YYYY-MM-DD'
                   )

              or staging.row ->> 'channel'
                   is distinct from
                   staging.channel

              or staging.row ->> 'device'
                   is distinct from
                   staging.device

              or staging.row ->> 'source'
                   is distinct from
                   staging.source

              or staging.row ->> 'provider'
                   is distinct from
                   staging.provider

              or staging.row ->> 'external_account_id'
                   is distinct from
                   staging.external_account_id

              or staging.row ->> 'ingestion_source'
                   is distinct from
                   'api'

              /*
               * All combined rows share campaign/group identity and display names.
               */
              or nullif(
                   btrim(
                     staging.row
                       ->> 'external_campaign_id'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'external_group_id'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'campaign'
                   ),
                   ''
                 ) is null

              or nullif(
                   btrim(
                     staging.row
                       ->> 'group'
                   ),
                   ''
                 ) is null

              /*
               * Exactly one verified canonical grain is allowed per row.
               *
               * WEB_SITE    -> keyword (KPI authority) + creative (detail-only ad)
               * SHOPPING    -> creative (authoritative ad)
               * BRAND_SEARCH -> mixed (authoritative adgroup)
               */
              or not (
                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'keyword'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'keyword'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_registered_keyword_daily_stats'

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'external_keyword_id'
                    ),
                    ''
                  ) is not null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_creative_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'keyword'
                    ),
                    ''
                  ) is not null
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'creative'

                  and staging.row ->> 'row_level_reason'
                    in (
                      'naver_searchad_shopping_ad_daily_stats',
                      'naver_searchad_web_site_ad_daily_stats'
                    )

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'external_creative_id'
                    ),
                    ''
                  ) is not null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_keyword_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      staging.row
                        ->> 'creative'
                    ),
                    ''
                  ) is not null
                )

                or

                (
                  staging.row ->> 'row_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'data_level'
                    is not distinct from
                    'mixed'

                  and staging.row ->> 'row_level_reason'
                    is not distinct from
                    'naver_searchad_brand_search_adgroup_daily_stats'

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_keyword_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_creative_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'external_ad_id',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'keyword_name',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative',
                        ''
                      )
                    ),
                    ''
                  ) is null

                  and nullif(
                    btrim(
                      coalesce(
                        staging.row
                          ->> 'creative_name',
                        ''
                      )
                    ),
                    ''
                  ) is null
                )
              )

              or staging.row_fingerprint <>
                   encode(
                     extensions.digest(
                       staging.row::text,
                       'sha256'
                     ),
                     'hex'
                   )
      )::bigint,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'date_window_index', windows.date_window_index,
              'row_count', windows.row_count,
              'min_row_index', windows.min_row_index,
              'max_row_index', windows.max_row_index,
              'min_date', windows.min_date,
              'max_date', windows.max_date
            )
            order by windows.date_window_index
          )
          from (
            select
              batch_rows.date_window_index,
              count(*)::bigint as row_count,
              min(batch_rows.row_index) as min_row_index,
              max(batch_rows.row_index) as max_row_index,
              min(batch_rows.date)::text as min_date,
              max(batch_rows.date)::text as max_date
            from validation_batch as batch_rows
            group by batch_rows.date_window_index
          ) as windows
        ),
        '[]'::jsonb
      )
    into
      v_validation_batch_rows,
      v_validation_batch_max_row_index,
      v_validation_batch_scope_mismatch_rows,
      v_validation_batch_blank_row_key_rows,
      v_validation_batch_missing_fingerprint_rows,
      v_validation_batch_canonical_mismatch_rows,
      v_validation_batch_date_window_summaries
    from validation_batch
      as staging;

  return query
  select
    v_job_id,
    v_validation_after_row_index,
    v_validation_batch_size,
    v_validation_batch_rows,
    v_validation_batch_max_row_index,
    v_validation_batch_scope_mismatch_rows,
    v_validation_batch_blank_row_key_rows,
    v_validation_batch_missing_fingerprint_rows,
    v_validation_batch_canonical_mismatch_rows,
    v_validation_batch_date_window_summaries;
end;
$function$;

ALTER TABLE "etrylue_creative_cache_v1"."accounts" ADD CONSTRAINT "accounts_account_key_check" CHECK ((account_key ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "etrylue_creative_cache_v1"."accounts" ADD CONSTRAINT "accounts_pkey" PRIMARY KEY (account_key);
ALTER TABLE "etrylue_creative_cache_v1"."accounts" ADD CONSTRAINT "accounts_reserved_requests_check" CHECK (((reserved_requests >= 0) AND (reserved_requests <= 120)));
ALTER TABLE "etrylue_creative_cache_v1"."entries" ADD CONSTRAINT "entries_cache_key_check" CHECK ((cache_key ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "etrylue_creative_cache_v1"."entries" ADD CONSTRAINT "entries_payload_check" CHECK (((jsonb_typeof(payload) = 'object'::text) AND (octet_length((payload)::text) <= 16384)));
ALTER TABLE "etrylue_creative_cache_v1"."entries" ADD CONSTRAINT "entries_pkey" PRIMARY KEY (account_key, cache_key);
ALTER TABLE "etrylue_customer_private"."accounts" ADD CONSTRAINT "accounts_company_id_key" UNIQUE (company_id);
ALTER TABLE "etrylue_customer_private"."accounts" ADD CONSTRAINT "accounts_company_name_check" CHECK (((length(btrim(company_name)) >= 1) AND (length(btrim(company_name)) <= 100)));
ALTER TABLE "etrylue_customer_private"."accounts" ADD CONSTRAINT "accounts_contact_name_check" CHECK (((length(btrim(contact_name)) >= 1) AND (length(btrim(contact_name)) <= 80)));
ALTER TABLE "etrylue_customer_private"."accounts" ADD CONSTRAINT "accounts_pkey" PRIMARY KEY (user_id);
ALTER TABLE "etrylue_customer_private"."accounts" ADD CONSTRAINT "accounts_tenant_id_key" UNIQUE (tenant_id);
ALTER TABLE "etrylue_customer_private"."accounts" ADD CONSTRAINT "accounts_tenant_type_check" CHECK ((tenant_type = ANY (ARRAY['agency'::text, 'advertiser'::text])));
ALTER TABLE "etrylue_customer_private"."accounts" ADD CONSTRAINT "accounts_workspace_id_key" UNIQUE (workspace_id);
ALTER TABLE "etrylue_customer_private"."scopes" ADD CONSTRAINT "scopes_pkey" PRIMARY KEY (user_id);
ALTER TABLE "etrylue_customer_private"."signup_limits" ADD CONSTRAINT "signup_limits_pkey" PRIMARY KEY (bucket);
ALTER TABLE "public"."ad_data" ADD CONSTRAINT "ad_data_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."advertisers" ADD CONSTRAINT "advertisers_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."advertisers" ADD CONSTRAINT "advertisers_public_slug_format_check" CHECK (((public_slug IS NULL) OR (TRIM(BOTH FROM public_slug) = ''::text) OR (public_slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'::text)));
ALTER TABLE "public"."advertisers" ADD CONSTRAINT "advertisers_tenant_workspace_id_uq" UNIQUE (tenant_id, workspace_id, id);
ALTER TABLE "public"."app_admins" ADD CONSTRAINT "app_admins_pkey" PRIMARY KEY (user_id);
ALTER TABLE "public"."client_members__deprecated" ADD CONSTRAINT "client_members_pkey" PRIMARY KEY (client_id, user_id);
ALTER TABLE "public"."clients__deprecated" ADD CONSTRAINT "clients_code_key" UNIQUE (code);
ALTER TABLE "public"."clients__deprecated" ADD CONSTRAINT "clients_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."connections" ADD CONSTRAINT "connections_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."connections" ADD CONSTRAINT "connections_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'expired'::text, 'error'::text])));
ALTER TABLE "public"."connections" ADD CONSTRAINT "connections_unique" UNIQUE (workspace_id, source, external_account_id);
ALTER TABLE "public"."daily_report_meta_connections" ADD CONSTRAINT "daily_report_meta_connections_pkey" PRIMARY KEY (report_id);
ALTER TABLE "public"."daily_report_meta_snapshots" ADD CONSTRAINT "daily_report_meta_snapshots_pkey" PRIMARY KEY (report_id, source_ingestion_id, fingerprint);
ALTER TABLE "public"."daily_report_meta_snapshots" ADD CONSTRAINT "daily_report_meta_snapshots_snapshot_ingestion_id_key" UNIQUE (snapshot_ingestion_id);
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_date_order_chk" CHECK ((start_date <= through_date));
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_expected_rows_chk" CHECK ((expected_rows >= 0));
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_participant_contract_chk" CHECK ((jsonb_typeof(participant_contract) = 'array'::text));
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_participant_count_chk" CHECK ((participant_count > 0));
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_source_fingerprint_chk" CHECK (((source_fingerprint IS NULL) OR (source_fingerprint ~ '^[0-9a-f]{64}$'::text)));
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_status_chk" CHECK ((status = ANY (ARRAY['prepared'::text, 'materializing'::text, 'ready'::text, 'activated'::text])));
ALTER TABLE "public"."departments" ADD CONSTRAINT "departments_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."insights" ADD CONSTRAINT "insights_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."manual_report_media_connections" ADD CONSTRAINT "manual_report_media_connections_pkey" PRIMARY KEY (report_id, connection_id);
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_active_credential_check" CHECK (((status <> 'active'::text) OR (credential_ciphertext IS NOT NULL)));
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_credential_version_check" CHECK ((credential_version >= 1));
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_external_account_id_check" CHECK ((length(TRIM(BOTH FROM external_account_id)) > 0));
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_meta_object_check" CHECK ((jsonb_typeof(meta) = 'object'::text));
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_provider_check" CHECK ((provider = ANY (ARRAY['naver_searchad'::text, 'google_ads'::text, 'meta_ads'::text])));
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_provider_not_blank_check" CHECK ((length(TRIM(BOTH FROM provider)) > 0));
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'disconnected'::text, 'error'::text])));
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_tenant_workspace_advertiser_id_uq" UNIQUE (tenant_id, workspace_id, advertiser_id, id);
ALTER TABLE "public"."media_sync_fact_partitions" ADD CONSTRAINT "media_sync_fact_partitions_external_account_not_blank" CHECK ((length(btrim(external_account_id)) > 0));
ALTER TABLE "public"."media_sync_fact_partitions" ADD CONSTRAINT "media_sync_fact_partitions_pkey" PRIMARY KEY (workspace_id, advertiser_id, provider, external_account_id, date);
ALTER TABLE "public"."media_sync_fact_partitions" ADD CONSTRAINT "media_sync_fact_partitions_provider_check" CHECK ((provider = ANY (ARRAY['naver_searchad'::text, 'google_ads'::text, 'meta_ads'::text])));
ALTER TABLE "public"."media_sync_fact_partitions" ADD CONSTRAINT "media_sync_fact_partitions_row_count_check" CHECK ((row_count >= 0));
ALTER TABLE "public"."media_sync_fact_rows" ADD CONSTRAINT "media_sync_fact_rows_external_account_not_blank" CHECK ((length(btrim(external_account_id)) > 0));
ALTER TABLE "public"."media_sync_fact_rows" ADD CONSTRAINT "media_sync_fact_rows_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."media_sync_fact_rows" ADD CONSTRAINT "media_sync_fact_rows_provider_check" CHECK ((provider = ANY (ARRAY['naver_searchad'::text, 'google_ads'::text, 'meta_ads'::text])));
ALTER TABLE "public"."media_sync_fact_rows" ADD CONSTRAINT "media_sync_fact_rows_row_key_not_blank" CHECK ((length(btrim(row_key)) > 0));
ALTER TABLE "public"."media_sync_fact_rows" ADD CONSTRAINT "media_sync_fact_rows_row_object_check" CHECK ((jsonb_typeof("row") = 'object'::text));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_attempt_count_check" CHECK ((attempt_count >= 0));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_automation_contract_check" CHECK (((automation_contract IS NULL) OR (automation_contract = 'daily_report_v2'::text)));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_data_level_check" CHECK ((data_level = ANY (ARRAY['keyword'::text, 'creative'::text, 'mixed'::text, 'unknown'::text])));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_date_range_check" CHECK ((date_from <= date_to));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_error_detail_object_check" CHECK (((error_detail IS NULL) OR (jsonb_typeof(error_detail) = 'object'::text)));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_execution_contract_check" CHECK (((execution_contract IS NULL) OR (execution_contract = 'google_all_data_v1'::text)));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_external_account_id_check" CHECK ((length(TRIM(BOTH FROM external_account_id)) > 0));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_failed_rows_check" CHECK ((failed_rows >= 0));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_inserted_rows_check" CHECK ((inserted_rows >= 0));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_mode_check" CHECK ((mode = 'snapshot_replace'::text));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_normalized_rows_check" CHECK ((normalized_rows >= 0));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_progress_check" CHECK (((progress >= 0) AND (progress <= 100)));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_provider_check" CHECK ((provider = ANY (ARRAY['naver_searchad'::text, 'google_ads'::text, 'meta_ads'::text])));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_raw_rows_check" CHECK ((raw_rows >= 0));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE "public"."media_sync_jobs" ADD CONSTRAINT "media_sync_jobs_sync_segment_progress_object_check" CHECK (((sync_segment_progress IS NULL) OR (jsonb_typeof(sync_segment_progress) = 'object'::text)));
ALTER TABLE "public"."media_sync_report_projections" ADD CONSTRAINT "media_sync_report_projections_media_sync_job_id_report_id_key" UNIQUE (media_sync_job_id, report_id);
ALTER TABLE "public"."media_sync_report_projections" ADD CONSTRAINT "media_sync_report_projections_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."media_sync_report_projections" ADD CONSTRAINT "media_sync_report_projections_snapshot_ingestion_id_key" UNIQUE (snapshot_ingestion_id);
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_date_range_check" CHECK ((date_from <= date_to));
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_date_window_index_check" CHECK ((date_window_index >= 0));
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_external_account_not_blank_check" CHECK ((length(btrim(external_account_id)) > 0));
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_job_row_index_unique" UNIQUE (job_id, row_index);
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_job_window_row_key_unique" UNIQUE (job_id, date_window_index, row_key);
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_provider_check" CHECK ((provider = ANY (ARRAY['naver_searchad'::text, 'google_ads'::text, 'meta_ads'::text])));
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_row_date_in_window_check" CHECK (((date >= date_from) AND (date <= date_to)));
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_row_index_check" CHECK ((row_index >= 0));
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_row_key_not_blank_check" CHECK ((length(btrim(row_key)) > 0));
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_row_object_check" CHECK ((jsonb_typeof("row") = 'object'::text));
ALTER TABLE "public"."meta_ads_collection_queue" ADD CONSTRAINT "meta_ads_collection_queue_connection_id_target_date_generat_key" UNIQUE (connection_id, target_date, generation);
ALTER TABLE "public"."meta_ads_collection_queue" ADD CONSTRAINT "meta_ads_collection_queue_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."meta_ads_collection_queue" ADD CONSTRAINT "meta_ads_collection_queue_reason_check" CHECK ((reason = ANY (ARRAY['initial'::text, 'scheduled'::text, 'catchup'::text])));
ALTER TABLE "public"."meta_ads_collection_queue" ADD CONSTRAINT "meta_ads_collection_queue_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE "public"."meta_ads_daily_enrollments" ADD CONSTRAINT "meta_ads_daily_enrollments_pkey" PRIMARY KEY (connection_id);
ALTER TABLE "public"."meta_ads_daily_enrollments" ADD CONSTRAINT "meta_ads_daily_enrollments_tenant_id_workspace_id_advertise_key" UNIQUE (tenant_id, workspace_id, advertiser_id, connection_id);
ALTER TABLE "public"."meta_ads_daily_partitions" ADD CONSTRAINT "meta_ads_daily_partitions_check" CHECK ((((row_count >= 0) AND (row_count <= 2500)) AND (row_count = jsonb_array_length(rows))));
ALTER TABLE "public"."meta_ads_daily_partitions" ADD CONSTRAINT "meta_ads_daily_partitions_pkey" PRIMARY KEY (connection_id, date);
ALTER TABLE "public"."meta_ads_daily_partitions" ADD CONSTRAINT "meta_ads_daily_partitions_rows_check" CHECK ((jsonb_typeof(rows) = 'array'::text));
ALTER TABLE "public"."meta_ads_daily_runs" ADD CONSTRAINT "meta_ads_daily_runs_connection_id_target_date_key" UNIQUE (connection_id, target_date);
ALTER TABLE "public"."meta_ads_daily_runs" ADD CONSTRAINT "meta_ads_daily_runs_id_connection_id_key" UNIQUE (id, connection_id);
ALTER TABLE "public"."meta_ads_daily_runs" ADD CONSTRAINT "meta_ads_daily_runs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."meta_ads_daily_runs" ADD CONSTRAINT "meta_ads_daily_runs_status_check" CHECK ((status = ANY (ARRAY['processing'::text, 'done'::text, 'partial'::text, 'failed'::text])));
ALTER TABLE "public"."metrics_daily" ADD CONSTRAINT "metrics_daily_channel_check" CHECK ((channel = ANY (ARRAY['search'::text, 'display'::text])));
ALTER TABLE "public"."metrics_daily" ADD CONSTRAINT "metrics_daily_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."metrics_daily" ADD CONSTRAINT "metrics_daily_unique" UNIQUE (workspace_id, source, date, entity_type, entity_id);
ALTER TABLE "public"."metrics_daily" ADD CONSTRAINT "unique_metrics_daily" UNIQUE (date, workspace_id, source, entity_id, entity_type);
ALTER TABLE "public"."org_units" ADD CONSTRAINT "org_units_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."org_units" ADD CONSTRAINT "org_units_type_check" CHECK ((type = ANY (ARRAY['company'::text, 'division'::text, 'department'::text, 'team'::text])));
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_platform_role_check" CHECK (((platform_role IS NULL) OR (platform_role = 'platform_owner'::text)));
ALTER TABLE "public"."report_creatives" ADD CONSTRAINT "report_creatives_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."report_ingestions" ADD CONSTRAINT "report_ingestions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."report_media_connections" ADD CONSTRAINT "report_media_connections_pkey" PRIMARY KEY (report_id, connection_id);
ALTER TABLE "public"."report_rows" ADD CONSTRAINT "report_rows_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."report_types" ADD CONSTRAINT "report_types_key_key" UNIQUE (key);
ALTER TABLE "public"."report_types" ADD CONSTRAINT "report_types_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_share_token_key" UNIQUE (share_token);
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'archived'::text])));
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_tenant_workspace_advertiser_id_uq" UNIQUE (tenant_id, workspace_id, advertiser_id, id);
ALTER TABLE "public"."roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."sync_logs" ADD CONSTRAINT "sync_logs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."sync_runs" ADD CONSTRAINT "sync_runs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tenant_members" ADD CONSTRAINT "tenant_members_pkey" PRIMARY KEY (tenant_id, user_id);
ALTER TABLE "public"."tenant_members" ADD CONSTRAINT "tenant_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_name_not_blank_check" CHECK ((length(TRIM(BOTH FROM name)) > 0));
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_slug_format_check" CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'::text));
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text])));
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_tenant_type_check" CHECK ((tenant_type = ANY (ARRAY['agency'::text, 'advertiser'::text])));
ALTER TABLE "public"."workspace_invites" ADD CONSTRAINT "workspace_invites_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspace_invites" ADD CONSTRAINT "workspace_invites_token_key" UNIQUE (token);
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY (workspace_id, user_id);
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK ((role = ANY (ARRAY['master'::text, 'director'::text, 'admin'::text, 'staff'::text, 'client'::text])));
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_tenant_id_id_uq" UNIQUE (tenant_id, id);
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_workspace_kind_check" CHECK ((workspace_kind = ANY (ARRAY['client'::text, 'team'::text, 'project'::text])));
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_workspace_type_check" CHECK ((workspace_type = ANY (ARRAY['company'::text, 'team'::text, 'personal'::text])));
CREATE INDEX creative_cache_expiry_v1 ON etrylue_creative_cache_v1.entries USING btree (account_key, expires_at);
CREATE UNIQUE INDEX advertisers_public_slug_unique ON public.advertisers USING btree (lower(TRIM(BOTH FROM public_slug))) WHERE ((public_slug IS NOT NULL) AND (TRIM(BOTH FROM public_slug) <> ''::text));
CREATE INDEX advertisers_tenant_id_idx ON public.advertisers USING btree (tenant_id);
CREATE UNIQUE INDEX advertisers_uq_ws_name ON public.advertisers USING btree (workspace_id, name);
CREATE INDEX advertisers_ws_idx ON public.advertisers USING btree (workspace_id);
CREATE INDEX idx_client_members_user ON public.client_members__deprecated USING btree (user_id);
CREATE UNIQUE INDEX companies_name_uq ON public.companies USING btree (name);
CREATE INDEX connections_source_idx ON public.connections USING btree (source);
CREATE INDEX connections_workspace_idx ON public.connections USING btree (workspace_id);
CREATE INDEX daily_report_meta_connections_connection_idx ON public.daily_report_meta_connections USING btree (connection_id);
CREATE INDEX daily_report_meta_connections_connection_scope_idx ON public.daily_report_meta_connections USING btree (tenant_id, workspace_id, advertiser_id, connection_id);
CREATE INDEX daily_report_meta_connections_report_scope_idx ON public.daily_report_meta_connections USING btree (tenant_id, workspace_id, advertiser_id, report_id);
CREATE INDEX daily_report_meta_snapshots_connection_idx ON public.daily_report_meta_snapshots USING btree (connection_id);
CREATE INDEX daily_report_meta_snapshots_source_idx ON public.daily_report_meta_snapshots USING btree (source_ingestion_id);
CREATE UNIQUE INDEX daily_report_v2_snapshot_runs_one_open_per_report_uidx ON public.daily_report_v2_snapshot_runs USING btree (report_id) WHERE (status = ANY (ARRAY['prepared'::text, 'materializing'::text, 'ready'::text]));
CREATE UNIQUE INDEX daily_report_v2_snapshot_runs_report_through_uidx ON public.daily_report_v2_snapshot_runs USING btree (report_id, through_date);
CREATE INDEX daily_report_v2_snapshot_runs_scope_idx ON public.daily_report_v2_snapshot_runs USING btree (workspace_id, advertiser_id, report_id, through_date);
CREATE UNIQUE INDEX daily_report_v2_snapshot_runs_snapshot_ingestion_uidx ON public.daily_report_v2_snapshot_runs USING btree (snapshot_ingestion_id);
CREATE UNIQUE INDEX departments_uq_company_name ON public.departments USING btree (company_id, name);
CREATE UNIQUE INDEX ingestion_jobs_one_active_job_per_report_uidx ON public.ingestion_jobs USING btree (report_id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE INDEX ingestion_jobs_report_id_idx ON public.ingestion_jobs USING btree (report_id);
CREATE INDEX ingestion_jobs_report_status_idx ON public.ingestion_jobs USING btree (report_id, status, created_at DESC);
CREATE INDEX ingestion_jobs_status_created_at_idx ON public.ingestion_jobs USING btree (status, created_at DESC);
CREATE INDEX ingestion_jobs_workspace_id_idx ON public.ingestion_jobs USING btree (workspace_id);
CREATE INDEX insights_report_id_idx ON public.insights USING btree (report_id);
CREATE UNIQUE INDEX insights_report_kind_uniq ON public.insights USING btree (report_id, kind);
CREATE INDEX manual_report_media_connections_connection_idx ON public.manual_report_media_connections USING btree (connection_id, report_id);
CREATE INDEX media_connections_provider_status_idx ON public.media_connections USING btree (provider, status);
CREATE INDEX media_connections_tenant_id_idx ON public.media_connections USING btree (tenant_id);
CREATE UNIQUE INDEX media_connections_tenant_provider_account_owner_uidx ON public.media_connections USING btree (tenant_id, provider, external_account_id) WHERE ((tenant_id IS NOT NULL) AND (status <> 'disconnected'::text));
CREATE INDEX media_connections_workspace_advertiser_idx ON public.media_connections USING btree (workspace_id, advertiser_id);
CREATE UNIQUE INDEX media_connections_workspace_advertiser_provider_account_uidx ON public.media_connections USING btree (workspace_id, advertiser_id, provider, external_account_id);
CREATE INDEX media_connections_workspace_status_idx ON public.media_connections USING btree (workspace_id, status);
CREATE UNIQUE INDEX media_sync_fact_rows_identity_unique ON public.media_sync_fact_rows USING btree (workspace_id, advertiser_id, provider, external_account_id, row_key);
CREATE INDEX media_sync_fact_rows_replacement_scope_index ON public.media_sync_fact_rows USING btree (workspace_id, advertiser_id, provider, external_account_id, date);
CREATE INDEX media_sync_fact_rows_retention_date_index ON public.media_sync_fact_rows USING btree (workspace_id, date);
CREATE INDEX media_sync_fact_rows_source_job_index ON public.media_sync_fact_rows USING btree (source_job_id);
CREATE INDEX media_sync_jobs_connection_created_at_idx ON public.media_sync_jobs USING btree (connection_id, created_at DESC);
CREATE UNIQUE INDEX media_sync_jobs_one_active_job_per_connection_uidx ON public.media_sync_jobs USING btree (connection_id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE UNIQUE INDEX media_sync_jobs_one_active_job_per_report_uidx ON public.media_sync_jobs USING btree (report_id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE INDEX media_sync_jobs_report_created_at_idx ON public.media_sync_jobs USING btree (report_id, created_at DESC);
CREATE INDEX media_sync_jobs_snapshot_ingestion_idx ON public.media_sync_jobs USING btree (snapshot_ingestion_id) WHERE (snapshot_ingestion_id IS NOT NULL);
CREATE INDEX media_sync_jobs_status_created_at_idx ON public.media_sync_jobs USING btree (status, created_at);
CREATE INDEX media_sync_jobs_workspace_advertiser_idx ON public.media_sync_jobs USING btree (workspace_id, advertiser_id);
CREATE INDEX media_sync_staging_rows_job_date_index ON public.media_sync_staging_rows USING btree (job_id, date);
CREATE INDEX media_sync_staging_rows_job_window_index ON public.media_sync_staging_rows USING btree (job_id, date_window_index, row_index);
CREATE INDEX media_sync_staging_rows_replacement_scope_index ON public.media_sync_staging_rows USING btree (report_id, provider, external_account_id, date);
CREATE INDEX media_sync_staging_rows_scope_index ON public.media_sync_staging_rows USING btree (workspace_id, advertiser_id, report_id, connection_id, job_id);
CREATE INDEX meta_ads_collection_queue_due_idx ON public.meta_ads_collection_queue USING btree (next_attempt_at, created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE INDEX metrics_daily_entity_idx ON public.metrics_daily USING btree (entity_type, entity_id);
CREATE INDEX metrics_daily_source_idx ON public.metrics_daily USING btree (source);
CREATE UNIQUE INDEX metrics_daily_uniq ON public.metrics_daily USING btree (workspace_id, source, channel, date, entity_type, entity_id);
CREATE UNIQUE INDEX metrics_daily_uq_full_key ON public.metrics_daily USING btree (workspace_id, source, channel, date, entity_type, entity_id);
CREATE UNIQUE INDEX metrics_daily_uq_ws_source_channel_date_entity ON public.metrics_daily USING btree (workspace_id, source, channel, date, entity_id);
CREATE INDEX metrics_daily_ws_date_idx ON public.metrics_daily USING btree (workspace_id, date);
CREATE INDEX org_units_parent_idx ON public.org_units USING btree (parent_id);
CREATE INDEX org_units_type_idx ON public.org_units USING btree (type);
CREATE INDEX idx_profiles_platform_role ON public.profiles USING btree (platform_role);
CREATE INDEX idx_report_creatives_report_batch ON public.report_creatives USING btree (report_id, batch_id);
CREATE INDEX report_creatives_idx_report ON public.report_creatives USING btree (report_id, updated_at DESC);
CREATE INDEX report_creatives_idx_report_key ON public.report_creatives USING btree (report_id, creative_key);
CREATE INDEX report_creatives_idx_workspace ON public.report_creatives USING btree (workspace_id);
CREATE UNIQUE INDEX report_creatives_report_batch_creative_key_ux ON public.report_creatives USING btree (report_id, batch_id, creative_key);
CREATE UNIQUE INDEX report_creatives_report_batch_key_ux ON public.report_creatives USING btree (report_id, batch_id, key) WHERE ((key IS NOT NULL) AND (key <> ''::text));
CREATE INDEX report_creatives_report_id_idx ON public.report_creatives USING btree (report_id);
CREATE INDEX idx_report_ingestions_report ON public.report_ingestions USING btree (report_id, created_at DESC);
CREATE INDEX idx_report_ingestions_ws ON public.report_ingestions USING btree (workspace_id, created_at DESC);
CREATE INDEX report_media_connections_connection_id_idx ON public.report_media_connections USING btree (connection_id, report_id);
CREATE UNIQUE INDEX report_media_connections_one_connection_per_report_uidx ON public.report_media_connections USING btree (report_id);
CREATE INDEX idx_report_rows_report ON public.report_rows USING btree (report_id, row_index);
CREATE INDEX idx_report_rows_report_channel ON public.report_rows USING btree (report_id, channel);
CREATE INDEX idx_report_rows_report_date ON public.report_rows USING btree (report_id, date);
CREATE INDEX idx_report_rows_report_device ON public.report_rows USING btree (report_id, device);
CREATE INDEX idx_report_rows_report_id ON public.report_rows USING btree (report_id);
CREATE INDEX idx_report_rows_report_ingestion ON public.report_rows USING btree (report_id, ingestion_id);
CREATE INDEX idx_report_rows_report_source ON public.report_rows USING btree (report_id, source);
CREATE INDEX report_rows_idx_report_date ON public.report_rows USING btree (report_id, date);
CREATE INDEX report_rows_report_ingestion_date_idx ON public.report_rows USING btree (report_id, ingestion_id, date);
CREATE UNIQUE INDEX report_rows_report_ingestion_row_index_uidx ON public.report_rows USING btree (report_id, ingestion_id, row_index) WHERE (ingestion_id IS NOT NULL);
CREATE INDEX reports_last_ingested_at_idx ON public.reports USING btree (last_ingested_at);
CREATE INDEX reports_last_published_at_idx ON public.reports USING btree (last_published_at);
CREATE UNIQUE INDEX reports_public_identity_uq ON public.reports USING btree (advertiser_id, ((meta #>> '{public_identity,source_type}'::text[])), ((meta #>> '{public_identity,report_type}'::text[])), ((meta #>> '{public_identity,period_type}'::text[])), ((meta #>> '{public_identity,period_key}'::text[]))) WHERE ((advertiser_id IS NOT NULL) AND (jsonb_typeof((meta -> 'public_identity'::text)) = 'object'::text) AND (COALESCE(btrim((meta #>> '{public_identity,source_type}'::text[])), ''::text) <> ''::text) AND (COALESCE(btrim((meta #>> '{public_identity,report_type}'::text[])), ''::text) <> ''::text) AND (COALESCE(btrim((meta #>> '{public_identity,period_type}'::text[])), ''::text) <> ''::text) AND (COALESCE(btrim((meta #>> '{public_identity,period_key}'::text[])), ''::text) <> ''::text));
CREATE INDEX reports_published_at_idx ON public.reports USING btree (published_at);
CREATE UNIQUE INDEX reports_share_token_uniq ON public.reports USING btree (share_token) WHERE (share_token IS NOT NULL);
CREATE INDEX reports_tenant_id_idx ON public.reports USING btree (tenant_id);
CREATE INDEX reports_tenant_workspace_advertiser_idx ON public.reports USING btree (tenant_id, workspace_id, advertiser_id);
CREATE INDEX reports_type_idx ON public.reports USING btree (report_type_id);
CREATE UNIQUE INDEX reports_uq_share_token ON public.reports USING btree (share_token) WHERE (share_token IS NOT NULL);
CREATE INDEX reports_workspace_idx ON public.reports USING btree (workspace_id);
CREATE UNIQUE INDEX roles_uq_company_name ON public.roles USING btree (company_id, name);
CREATE INDEX sync_runs_ws_source_time ON public.sync_runs USING btree (workspace_id, source, started_at DESC);
CREATE UNIQUE INDEX teams_uq_dept_name ON public.teams USING btree (department_id, name);
CREATE INDEX tenant_members_tenant_role_idx ON public.tenant_members USING btree (tenant_id, role);
CREATE INDEX tenant_members_user_id_idx ON public.tenant_members USING btree (user_id);
CREATE UNIQUE INDEX tenants_slug_uidx ON public.tenants USING btree (slug);
CREATE INDEX tenants_type_status_idx ON public.tenants USING btree (tenant_type, status);
CREATE INDEX workspace_invites_email_idx ON public.workspace_invites USING btree (lower(email));
CREATE INDEX workspace_invites_token_idx ON public.workspace_invites USING btree (token);
CREATE INDEX workspace_invites_workspace_id_idx ON public.workspace_invites USING btree (workspace_id);
CREATE INDEX workspace_members_user_id_idx ON public.workspace_members USING btree (user_id);
CREATE INDEX idx_workspaces_client_id ON public.workspaces USING btree (client_id);
CREATE INDEX workspaces_created_by_idx ON public.workspaces USING btree (created_by);
CREATE INDEX workspaces_kind_idx ON public.workspaces USING btree (workspace_kind);
CREATE INDEX workspaces_owner_org_unit_idx ON public.workspaces USING btree (owner_org_unit_id);
CREATE INDEX workspaces_tenant_id_idx ON public.workspaces USING btree (tenant_id);
ALTER TABLE "etrylue_creative_cache_v1"."entries" ADD CONSTRAINT "entries_account_key_fkey" FOREIGN KEY (account_key) REFERENCES etrylue_creative_cache_v1.accounts(account_key);
ALTER TABLE "etrylue_customer_private"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "etrylue_customer_private"."scopes" ADD CONSTRAINT "scopes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."advertisers" ADD CONSTRAINT "advertisers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE "public"."advertisers" ADD CONSTRAINT "advertisers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "public"."advertisers" ADD CONSTRAINT "advertisers_tenant_workspace_fkey" FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE "public"."advertisers" ADD CONSTRAINT "advertisers_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."app_admins" ADD CONSTRAINT "app_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."client_members__deprecated" ADD CONSTRAINT "client_members_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients__deprecated(id) ON DELETE CASCADE;
ALTER TABLE "public"."connections" ADD CONSTRAINT "connections_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."daily_report_meta_connections" ADD CONSTRAINT "daily_report_meta_connection_tenant_id_workspace_id_adver_fkey1" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, connection_id) REFERENCES media_connections(tenant_id, workspace_id, advertiser_id, id) ON DELETE RESTRICT;
ALTER TABLE "public"."daily_report_meta_connections" ADD CONSTRAINT "daily_report_meta_connections_tenant_id_workspace_id_adver_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, report_id) REFERENCES reports(tenant_id, workspace_id, advertiser_id, id) ON DELETE CASCADE;
ALTER TABLE "public"."daily_report_meta_snapshots" ADD CONSTRAINT "daily_report_meta_snapshots_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES media_connections(id);
ALTER TABLE "public"."daily_report_meta_snapshots" ADD CONSTRAINT "daily_report_meta_snapshots_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;
ALTER TABLE "public"."daily_report_meta_snapshots" ADD CONSTRAINT "daily_report_meta_snapshots_snapshot_ingestion_id_fkey" FOREIGN KEY (snapshot_ingestion_id) REFERENCES report_ingestions(id);
ALTER TABLE "public"."daily_report_meta_snapshots" ADD CONSTRAINT "daily_report_meta_snapshots_source_ingestion_id_fkey" FOREIGN KEY (source_ingestion_id) REFERENCES report_ingestions(id);
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_previous_ingestion_fk" FOREIGN KEY (previous_ingestion_id) REFERENCES report_ingestions(id) ON DELETE RESTRICT;
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_report_fk" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ADD CONSTRAINT "daily_report_v2_snapshot_runs_snapshot_ingestion_fk" FOREIGN KEY (snapshot_ingestion_id) REFERENCES report_ingestions(id) ON DELETE RESTRICT;
ALTER TABLE "public"."departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE "public"."insights" ADD CONSTRAINT "insights_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;
ALTER TABLE "public"."manual_report_media_connections" ADD CONSTRAINT "manual_report_media_connecti_tenant_id_workspace_id_adver_fkey1" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, connection_id) REFERENCES media_connections(tenant_id, workspace_id, advertiser_id, id) ON DELETE CASCADE;
ALTER TABLE "public"."manual_report_media_connections" ADD CONSTRAINT "manual_report_media_connectio_tenant_id_workspace_id_adver_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, report_id) REFERENCES reports(tenant_id, workspace_id, advertiser_id, id) ON DELETE CASCADE;
ALTER TABLE "public"."media_connections" ADD CONSTRAINT "media_connections_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "public"."media_sync_fact_partitions" ADD CONSTRAINT "media_sync_fact_partitions_advertiser_id_fkey" FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE;
ALTER TABLE "public"."media_sync_fact_partitions" ADD CONSTRAINT "media_sync_fact_partitions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."media_sync_fact_rows" ADD CONSTRAINT "media_sync_fact_rows_advertiser_id_fkey" FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE;
ALTER TABLE "public"."media_sync_fact_rows" ADD CONSTRAINT "media_sync_fact_rows_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."media_sync_report_projections" ADD CONSTRAINT "media_sync_report_projections_media_sync_job_id_fkey" FOREIGN KEY (media_sync_job_id) REFERENCES media_sync_jobs(id) ON DELETE CASCADE;
ALTER TABLE "public"."media_sync_staging_rows" ADD CONSTRAINT "media_sync_staging_rows_job_id_fkey" FOREIGN KEY (job_id) REFERENCES media_sync_jobs(id) ON DELETE CASCADE;
ALTER TABLE "public"."meta_ads_collection_queue" ADD CONSTRAINT "meta_ads_collection_queue_tenant_id_workspace_id_advertise_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, connection_id) REFERENCES meta_ads_daily_enrollments(tenant_id, workspace_id, advertiser_id, connection_id) ON DELETE RESTRICT;
ALTER TABLE "public"."meta_ads_daily_enrollments" ADD CONSTRAINT "meta_ads_daily_enrollments_tenant_id_workspace_id_advertis_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, connection_id) REFERENCES media_connections(tenant_id, workspace_id, advertiser_id, id) ON DELETE RESTRICT;
ALTER TABLE "public"."meta_ads_daily_partitions" ADD CONSTRAINT "meta_ads_daily_partitions_run_id_connection_id_fkey" FOREIGN KEY (run_id, connection_id) REFERENCES meta_ads_daily_runs(id, connection_id) ON DELETE RESTRICT;
ALTER TABLE "public"."meta_ads_daily_partitions" ADD CONSTRAINT "meta_ads_daily_partitions_tenant_id_workspace_id_advertise_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, connection_id) REFERENCES media_connections(tenant_id, workspace_id, advertiser_id, id) ON DELETE RESTRICT;
ALTER TABLE "public"."meta_ads_daily_runs" ADD CONSTRAINT "meta_ads_daily_runs_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES media_connections(id);
ALTER TABLE "public"."metrics_daily" ADD CONSTRAINT "metrics_daily_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."org_units" ADD CONSTRAINT "org_units_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES org_units(id) ON DELETE CASCADE;
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE "public"."report_creatives" ADD CONSTRAINT "report_creatives_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;
ALTER TABLE "public"."report_creatives" ADD CONSTRAINT "report_creatives_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."report_media_connections" ADD CONSTRAINT "report_media_connections_connection_scope_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, connection_id) REFERENCES media_connections(tenant_id, workspace_id, advertiser_id, id) ON DELETE CASCADE;
ALTER TABLE "public"."report_media_connections" ADD CONSTRAINT "report_media_connections_report_scope_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id, report_id) REFERENCES reports(tenant_id, workspace_id, advertiser_id, id) ON DELETE CASCADE;
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_advertiser_id_fkey" FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE SET NULL;
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_report_type_id_fkey" FOREIGN KEY (report_type_id) REFERENCES report_types(id) ON DELETE RESTRICT;
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_tenant_workspace_advertiser_fkey" FOREIGN KEY (tenant_id, workspace_id, advertiser_id) REFERENCES advertisers(tenant_id, workspace_id, id) ON DELETE SET NULL (advertiser_id);
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_tenant_workspace_fkey" FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE "public"."sync_logs" ADD CONSTRAINT "sync_logs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE "public"."tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE "public"."tenant_members" ADD CONSTRAINT "tenant_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients__deprecated(id);
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

REVOKE ALL ON SCHEMA "public" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA "etrylue_customer_private" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA "etrylue_customer_private" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "etrylue_customer_private" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "etrylue_customer_private" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA "etrylue_creative_cache_v1" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA "etrylue_creative_cache_v1" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "etrylue_creative_cache_v1" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "etrylue_creative_cache_v1" FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA "etrylue_creative_cache_v1" TO "service_role";
GRANT USAGE ON SCHEMA "etrylue_customer_private" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT DELETE ON TABLE "etrylue_creative_cache_v1"."accounts" TO "service_role";
GRANT INSERT ON TABLE "etrylue_creative_cache_v1"."accounts" TO "service_role";
GRANT SELECT ON TABLE "etrylue_creative_cache_v1"."accounts" TO "service_role";
GRANT UPDATE ON TABLE "etrylue_creative_cache_v1"."accounts" TO "service_role";
GRANT DELETE ON TABLE "etrylue_creative_cache_v1"."entries" TO "service_role";
GRANT INSERT ON TABLE "etrylue_creative_cache_v1"."entries" TO "service_role";
GRANT SELECT ON TABLE "etrylue_creative_cache_v1"."entries" TO "service_role";
GRANT UPDATE ON TABLE "etrylue_creative_cache_v1"."entries" TO "service_role";
GRANT DELETE ON TABLE "public"."ad_data" TO "anon";
GRANT INSERT ON TABLE "public"."ad_data" TO "anon";
GRANT SELECT ON TABLE "public"."ad_data" TO "anon";
GRANT UPDATE ON TABLE "public"."ad_data" TO "anon";
GRANT DELETE ON TABLE "public"."ad_data" TO "authenticated";
GRANT INSERT ON TABLE "public"."ad_data" TO "authenticated";
GRANT SELECT ON TABLE "public"."ad_data" TO "authenticated";
GRANT UPDATE ON TABLE "public"."ad_data" TO "authenticated";
GRANT DELETE ON TABLE "public"."ad_data" TO "service_role";
GRANT INSERT ON TABLE "public"."ad_data" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."ad_data" TO "service_role";
GRANT REFERENCES ON TABLE "public"."ad_data" TO "service_role";
GRANT SELECT ON TABLE "public"."ad_data" TO "service_role";
GRANT TRIGGER ON TABLE "public"."ad_data" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."ad_data" TO "service_role";
GRANT UPDATE ON TABLE "public"."ad_data" TO "service_role";
GRANT SELECT ON SEQUENCE "public"."ad_data_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."ad_data_id_seq" TO "anon";
GRANT USAGE ON SEQUENCE "public"."ad_data_id_seq" TO "anon";
GRANT SELECT ON SEQUENCE "public"."ad_data_id_seq" TO "authenticated";
GRANT UPDATE ON SEQUENCE "public"."ad_data_id_seq" TO "authenticated";
GRANT USAGE ON SEQUENCE "public"."ad_data_id_seq" TO "authenticated";
GRANT SELECT ON SEQUENCE "public"."ad_data_id_seq" TO "service_role";
GRANT UPDATE ON SEQUENCE "public"."ad_data_id_seq" TO "service_role";
GRANT USAGE ON SEQUENCE "public"."ad_data_id_seq" TO "service_role";
GRANT DELETE ON TABLE "public"."advertisers" TO "service_role";
GRANT INSERT ON TABLE "public"."advertisers" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."advertisers" TO "service_role";
GRANT REFERENCES ON TABLE "public"."advertisers" TO "service_role";
GRANT SELECT ON TABLE "public"."advertisers" TO "service_role";
GRANT TRIGGER ON TABLE "public"."advertisers" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."advertisers" TO "service_role";
GRANT UPDATE ON TABLE "public"."advertisers" TO "service_role";
GRANT DELETE ON TABLE "public"."app_admins" TO "anon";
GRANT INSERT ON TABLE "public"."app_admins" TO "anon";
GRANT SELECT ON TABLE "public"."app_admins" TO "anon";
GRANT UPDATE ON TABLE "public"."app_admins" TO "anon";
GRANT DELETE ON TABLE "public"."app_admins" TO "authenticated";
GRANT INSERT ON TABLE "public"."app_admins" TO "authenticated";
GRANT SELECT ON TABLE "public"."app_admins" TO "authenticated";
GRANT UPDATE ON TABLE "public"."app_admins" TO "authenticated";
GRANT DELETE ON TABLE "public"."app_admins" TO "service_role";
GRANT INSERT ON TABLE "public"."app_admins" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."app_admins" TO "service_role";
GRANT REFERENCES ON TABLE "public"."app_admins" TO "service_role";
GRANT SELECT ON TABLE "public"."app_admins" TO "service_role";
GRANT TRIGGER ON TABLE "public"."app_admins" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."app_admins" TO "service_role";
GRANT UPDATE ON TABLE "public"."app_admins" TO "service_role";
GRANT DELETE ON TABLE "public"."client_members__deprecated" TO "anon";
GRANT INSERT ON TABLE "public"."client_members__deprecated" TO "anon";
GRANT SELECT ON TABLE "public"."client_members__deprecated" TO "anon";
GRANT UPDATE ON TABLE "public"."client_members__deprecated" TO "anon";
GRANT DELETE ON TABLE "public"."client_members__deprecated" TO "authenticated";
GRANT INSERT ON TABLE "public"."client_members__deprecated" TO "authenticated";
GRANT SELECT ON TABLE "public"."client_members__deprecated" TO "authenticated";
GRANT UPDATE ON TABLE "public"."client_members__deprecated" TO "authenticated";
GRANT DELETE ON TABLE "public"."client_members__deprecated" TO "service_role";
GRANT INSERT ON TABLE "public"."client_members__deprecated" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."client_members__deprecated" TO "service_role";
GRANT REFERENCES ON TABLE "public"."client_members__deprecated" TO "service_role";
GRANT SELECT ON TABLE "public"."client_members__deprecated" TO "service_role";
GRANT TRIGGER ON TABLE "public"."client_members__deprecated" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."client_members__deprecated" TO "service_role";
GRANT UPDATE ON TABLE "public"."client_members__deprecated" TO "service_role";
GRANT DELETE ON TABLE "public"."clients__deprecated" TO "anon";
GRANT INSERT ON TABLE "public"."clients__deprecated" TO "anon";
GRANT SELECT ON TABLE "public"."clients__deprecated" TO "anon";
GRANT UPDATE ON TABLE "public"."clients__deprecated" TO "anon";
GRANT DELETE ON TABLE "public"."clients__deprecated" TO "authenticated";
GRANT INSERT ON TABLE "public"."clients__deprecated" TO "authenticated";
GRANT SELECT ON TABLE "public"."clients__deprecated" TO "authenticated";
GRANT UPDATE ON TABLE "public"."clients__deprecated" TO "authenticated";
GRANT DELETE ON TABLE "public"."clients__deprecated" TO "service_role";
GRANT INSERT ON TABLE "public"."clients__deprecated" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."clients__deprecated" TO "service_role";
GRANT REFERENCES ON TABLE "public"."clients__deprecated" TO "service_role";
GRANT SELECT ON TABLE "public"."clients__deprecated" TO "service_role";
GRANT TRIGGER ON TABLE "public"."clients__deprecated" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."clients__deprecated" TO "service_role";
GRANT UPDATE ON TABLE "public"."clients__deprecated" TO "service_role";
GRANT DELETE ON TABLE "public"."companies" TO "anon";
GRANT INSERT ON TABLE "public"."companies" TO "anon";
GRANT SELECT ON TABLE "public"."companies" TO "anon";
GRANT UPDATE ON TABLE "public"."companies" TO "anon";
GRANT DELETE ON TABLE "public"."companies" TO "authenticated";
GRANT INSERT ON TABLE "public"."companies" TO "authenticated";
GRANT SELECT ON TABLE "public"."companies" TO "authenticated";
GRANT UPDATE ON TABLE "public"."companies" TO "authenticated";
GRANT DELETE ON TABLE "public"."companies" TO "service_role";
GRANT INSERT ON TABLE "public"."companies" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."companies" TO "service_role";
GRANT REFERENCES ON TABLE "public"."companies" TO "service_role";
GRANT SELECT ON TABLE "public"."companies" TO "service_role";
GRANT TRIGGER ON TABLE "public"."companies" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."companies" TO "service_role";
GRANT UPDATE ON TABLE "public"."companies" TO "service_role";
GRANT DELETE ON TABLE "public"."connections" TO "service_role";
GRANT INSERT ON TABLE "public"."connections" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."connections" TO "service_role";
GRANT REFERENCES ON TABLE "public"."connections" TO "service_role";
GRANT SELECT ON TABLE "public"."connections" TO "service_role";
GRANT TRIGGER ON TABLE "public"."connections" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."connections" TO "service_role";
GRANT UPDATE ON TABLE "public"."connections" TO "service_role";
GRANT DELETE ON TABLE "public"."daily_report_meta_connections" TO "service_role";
GRANT INSERT ON TABLE "public"."daily_report_meta_connections" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."daily_report_meta_connections" TO "service_role";
GRANT REFERENCES ON TABLE "public"."daily_report_meta_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_report_meta_connections" TO "service_role";
GRANT TRIGGER ON TABLE "public"."daily_report_meta_connections" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."daily_report_meta_connections" TO "service_role";
GRANT UPDATE ON TABLE "public"."daily_report_meta_connections" TO "service_role";
GRANT DELETE ON TABLE "public"."daily_report_meta_snapshots" TO "service_role";
GRANT INSERT ON TABLE "public"."daily_report_meta_snapshots" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."daily_report_meta_snapshots" TO "service_role";
GRANT REFERENCES ON TABLE "public"."daily_report_meta_snapshots" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_report_meta_snapshots" TO "service_role";
GRANT TRIGGER ON TABLE "public"."daily_report_meta_snapshots" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."daily_report_meta_snapshots" TO "service_role";
GRANT UPDATE ON TABLE "public"."daily_report_meta_snapshots" TO "service_role";
GRANT DELETE ON TABLE "public"."daily_report_v2_snapshot_runs" TO "service_role";
GRANT INSERT ON TABLE "public"."daily_report_v2_snapshot_runs" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."daily_report_v2_snapshot_runs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."daily_report_v2_snapshot_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_report_v2_snapshot_runs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."daily_report_v2_snapshot_runs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."daily_report_v2_snapshot_runs" TO "service_role";
GRANT UPDATE ON TABLE "public"."daily_report_v2_snapshot_runs" TO "service_role";
GRANT DELETE ON TABLE "public"."departments" TO "anon";
GRANT INSERT ON TABLE "public"."departments" TO "anon";
GRANT SELECT ON TABLE "public"."departments" TO "anon";
GRANT UPDATE ON TABLE "public"."departments" TO "anon";
GRANT DELETE ON TABLE "public"."departments" TO "authenticated";
GRANT INSERT ON TABLE "public"."departments" TO "authenticated";
GRANT SELECT ON TABLE "public"."departments" TO "authenticated";
GRANT UPDATE ON TABLE "public"."departments" TO "authenticated";
GRANT DELETE ON TABLE "public"."departments" TO "service_role";
GRANT INSERT ON TABLE "public"."departments" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."departments" TO "service_role";
GRANT REFERENCES ON TABLE "public"."departments" TO "service_role";
GRANT SELECT ON TABLE "public"."departments" TO "service_role";
GRANT TRIGGER ON TABLE "public"."departments" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."departments" TO "service_role";
GRANT UPDATE ON TABLE "public"."departments" TO "service_role";
GRANT SELECT ON TABLE "public"."ingestion_jobs" TO "anon";
GRANT SELECT ON TABLE "public"."ingestion_jobs" TO "authenticated";
GRANT DELETE ON TABLE "public"."ingestion_jobs" TO "service_role";
GRANT INSERT ON TABLE "public"."ingestion_jobs" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."ingestion_jobs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."ingestion_jobs" TO "service_role";
GRANT SELECT ON TABLE "public"."ingestion_jobs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."ingestion_jobs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."ingestion_jobs" TO "service_role";
GRANT UPDATE ON TABLE "public"."ingestion_jobs" TO "service_role";
GRANT SELECT ON TABLE "public"."insights" TO "anon";
GRANT SELECT ON TABLE "public"."insights" TO "authenticated";
GRANT DELETE ON TABLE "public"."insights" TO "service_role";
GRANT INSERT ON TABLE "public"."insights" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."insights" TO "service_role";
GRANT REFERENCES ON TABLE "public"."insights" TO "service_role";
GRANT SELECT ON TABLE "public"."insights" TO "service_role";
GRANT TRIGGER ON TABLE "public"."insights" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."insights" TO "service_role";
GRANT UPDATE ON TABLE "public"."insights" TO "service_role";
GRANT DELETE ON TABLE "public"."manual_report_media_connections" TO "service_role";
GRANT INSERT ON TABLE "public"."manual_report_media_connections" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."manual_report_media_connections" TO "service_role";
GRANT REFERENCES ON TABLE "public"."manual_report_media_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."manual_report_media_connections" TO "service_role";
GRANT TRIGGER ON TABLE "public"."manual_report_media_connections" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."manual_report_media_connections" TO "service_role";
GRANT UPDATE ON TABLE "public"."manual_report_media_connections" TO "service_role";
GRANT DELETE ON TABLE "public"."media_connections" TO "service_role";
GRANT INSERT ON TABLE "public"."media_connections" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."media_connections" TO "service_role";
GRANT REFERENCES ON TABLE "public"."media_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."media_connections" TO "service_role";
GRANT TRIGGER ON TABLE "public"."media_connections" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."media_connections" TO "service_role";
GRANT UPDATE ON TABLE "public"."media_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."media_sync_fact_partitions" TO "service_role";
GRANT SELECT ON TABLE "public"."media_sync_fact_rows" TO "service_role";
GRANT DELETE ON TABLE "public"."media_sync_jobs" TO "service_role";
GRANT INSERT ON TABLE "public"."media_sync_jobs" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."media_sync_jobs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."media_sync_jobs" TO "service_role";
GRANT SELECT ON TABLE "public"."media_sync_jobs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."media_sync_jobs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."media_sync_jobs" TO "service_role";
GRANT UPDATE ON TABLE "public"."media_sync_jobs" TO "service_role";
GRANT DELETE ON TABLE "public"."media_sync_report_projections" TO "service_role";
GRANT INSERT ON TABLE "public"."media_sync_report_projections" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."media_sync_report_projections" TO "service_role";
GRANT REFERENCES ON TABLE "public"."media_sync_report_projections" TO "service_role";
GRANT SELECT ON TABLE "public"."media_sync_report_projections" TO "service_role";
GRANT TRIGGER ON TABLE "public"."media_sync_report_projections" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."media_sync_report_projections" TO "service_role";
GRANT UPDATE ON TABLE "public"."media_sync_report_projections" TO "service_role";
GRANT DELETE ON TABLE "public"."media_sync_staging_rows" TO "service_role";
GRANT INSERT ON TABLE "public"."media_sync_staging_rows" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."media_sync_staging_rows" TO "service_role";
GRANT REFERENCES ON TABLE "public"."media_sync_staging_rows" TO "service_role";
GRANT SELECT ON TABLE "public"."media_sync_staging_rows" TO "service_role";
GRANT TRIGGER ON TABLE "public"."media_sync_staging_rows" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."media_sync_staging_rows" TO "service_role";
GRANT UPDATE ON TABLE "public"."media_sync_staging_rows" TO "service_role";
GRANT DELETE ON TABLE "public"."meta_ads_collection_queue" TO "service_role";
GRANT INSERT ON TABLE "public"."meta_ads_collection_queue" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."meta_ads_collection_queue" TO "service_role";
GRANT REFERENCES ON TABLE "public"."meta_ads_collection_queue" TO "service_role";
GRANT SELECT ON TABLE "public"."meta_ads_collection_queue" TO "service_role";
GRANT TRIGGER ON TABLE "public"."meta_ads_collection_queue" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."meta_ads_collection_queue" TO "service_role";
GRANT UPDATE ON TABLE "public"."meta_ads_collection_queue" TO "service_role";
GRANT DELETE ON TABLE "public"."meta_ads_daily_enrollments" TO "service_role";
GRANT INSERT ON TABLE "public"."meta_ads_daily_enrollments" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."meta_ads_daily_enrollments" TO "service_role";
GRANT REFERENCES ON TABLE "public"."meta_ads_daily_enrollments" TO "service_role";
GRANT SELECT ON TABLE "public"."meta_ads_daily_enrollments" TO "service_role";
GRANT TRIGGER ON TABLE "public"."meta_ads_daily_enrollments" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."meta_ads_daily_enrollments" TO "service_role";
GRANT UPDATE ON TABLE "public"."meta_ads_daily_enrollments" TO "service_role";
GRANT DELETE ON TABLE "public"."meta_ads_daily_partitions" TO "service_role";
GRANT INSERT ON TABLE "public"."meta_ads_daily_partitions" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."meta_ads_daily_partitions" TO "service_role";
GRANT REFERENCES ON TABLE "public"."meta_ads_daily_partitions" TO "service_role";
GRANT SELECT ON TABLE "public"."meta_ads_daily_partitions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."meta_ads_daily_partitions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."meta_ads_daily_partitions" TO "service_role";
GRANT UPDATE ON TABLE "public"."meta_ads_daily_partitions" TO "service_role";
GRANT DELETE ON TABLE "public"."meta_ads_daily_runs" TO "service_role";
GRANT INSERT ON TABLE "public"."meta_ads_daily_runs" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."meta_ads_daily_runs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."meta_ads_daily_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."meta_ads_daily_runs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."meta_ads_daily_runs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."meta_ads_daily_runs" TO "service_role";
GRANT UPDATE ON TABLE "public"."meta_ads_daily_runs" TO "service_role";
GRANT DELETE ON TABLE "public"."metrics_daily" TO "service_role";
GRANT INSERT ON TABLE "public"."metrics_daily" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."metrics_daily" TO "service_role";
GRANT REFERENCES ON TABLE "public"."metrics_daily" TO "service_role";
GRANT SELECT ON TABLE "public"."metrics_daily" TO "service_role";
GRANT TRIGGER ON TABLE "public"."metrics_daily" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."metrics_daily" TO "service_role";
GRANT UPDATE ON TABLE "public"."metrics_daily" TO "service_role";
GRANT SELECT ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "anon";
GRANT SELECT ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "authenticated";
GRANT DELETE ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "service_role";
GRANT INSERT ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "service_role";
GRANT REFERENCES ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "service_role";
GRANT SELECT ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "service_role";
GRANT TRIGGER ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "service_role";
GRANT UPDATE ON TABLE "public"."metrics_daily_backup_before_dedupe" TO "service_role";
GRANT SELECT ON TABLE "public"."metrics_daily_dedup" TO "anon";
GRANT SELECT ON TABLE "public"."metrics_daily_dedup" TO "authenticated";
GRANT DELETE ON TABLE "public"."metrics_daily_dedup" TO "service_role";
GRANT INSERT ON TABLE "public"."metrics_daily_dedup" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."metrics_daily_dedup" TO "service_role";
GRANT REFERENCES ON TABLE "public"."metrics_daily_dedup" TO "service_role";
GRANT SELECT ON TABLE "public"."metrics_daily_dedup" TO "service_role";
GRANT TRIGGER ON TABLE "public"."metrics_daily_dedup" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."metrics_daily_dedup" TO "service_role";
GRANT UPDATE ON TABLE "public"."metrics_daily_dedup" TO "service_role";
GRANT DELETE ON TABLE "public"."org_units" TO "anon";
GRANT INSERT ON TABLE "public"."org_units" TO "anon";
GRANT SELECT ON TABLE "public"."org_units" TO "anon";
GRANT UPDATE ON TABLE "public"."org_units" TO "anon";
GRANT DELETE ON TABLE "public"."org_units" TO "authenticated";
GRANT INSERT ON TABLE "public"."org_units" TO "authenticated";
GRANT SELECT ON TABLE "public"."org_units" TO "authenticated";
GRANT UPDATE ON TABLE "public"."org_units" TO "authenticated";
GRANT DELETE ON TABLE "public"."org_units" TO "service_role";
GRANT INSERT ON TABLE "public"."org_units" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."org_units" TO "service_role";
GRANT REFERENCES ON TABLE "public"."org_units" TO "service_role";
GRANT SELECT ON TABLE "public"."org_units" TO "service_role";
GRANT TRIGGER ON TABLE "public"."org_units" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."org_units" TO "service_role";
GRANT UPDATE ON TABLE "public"."org_units" TO "service_role";
GRANT DELETE ON TABLE "public"."profiles" TO "anon";
GRANT INSERT ON TABLE "public"."profiles" TO "anon";
GRANT SELECT ON TABLE "public"."profiles" TO "anon";
GRANT UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT DELETE ON TABLE "public"."profiles" TO "authenticated";
GRANT INSERT ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT DELETE ON TABLE "public"."profiles" TO "service_role";
GRANT INSERT ON TABLE "public"."profiles" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."profiles" TO "service_role";
GRANT REFERENCES ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "service_role";
GRANT TRIGGER ON TABLE "public"."profiles" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."profiles" TO "service_role";
GRANT UPDATE ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."report_creatives" TO "anon";
GRANT SELECT ON TABLE "public"."report_creatives" TO "authenticated";
GRANT DELETE ON TABLE "public"."report_creatives" TO "service_role";
GRANT INSERT ON TABLE "public"."report_creatives" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."report_creatives" TO "service_role";
GRANT REFERENCES ON TABLE "public"."report_creatives" TO "service_role";
GRANT SELECT ON TABLE "public"."report_creatives" TO "service_role";
GRANT TRIGGER ON TABLE "public"."report_creatives" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."report_creatives" TO "service_role";
GRANT UPDATE ON TABLE "public"."report_creatives" TO "service_role";
GRANT DELETE ON TABLE "public"."report_ingestions" TO "service_role";
GRANT INSERT ON TABLE "public"."report_ingestions" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."report_ingestions" TO "service_role";
GRANT REFERENCES ON TABLE "public"."report_ingestions" TO "service_role";
GRANT SELECT ON TABLE "public"."report_ingestions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."report_ingestions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."report_ingestions" TO "service_role";
GRANT UPDATE ON TABLE "public"."report_ingestions" TO "service_role";
GRANT DELETE ON TABLE "public"."report_media_connections" TO "service_role";
GRANT INSERT ON TABLE "public"."report_media_connections" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."report_media_connections" TO "service_role";
GRANT REFERENCES ON TABLE "public"."report_media_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."report_media_connections" TO "service_role";
GRANT TRIGGER ON TABLE "public"."report_media_connections" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."report_media_connections" TO "service_role";
GRANT UPDATE ON TABLE "public"."report_media_connections" TO "service_role";
GRANT DELETE ON TABLE "public"."report_rows" TO "service_role";
GRANT INSERT ON TABLE "public"."report_rows" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."report_rows" TO "service_role";
GRANT REFERENCES ON TABLE "public"."report_rows" TO "service_role";
GRANT SELECT ON TABLE "public"."report_rows" TO "service_role";
GRANT TRIGGER ON TABLE "public"."report_rows" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."report_rows" TO "service_role";
GRANT UPDATE ON TABLE "public"."report_rows" TO "service_role";
GRANT DELETE ON TABLE "public"."report_types" TO "service_role";
GRANT INSERT ON TABLE "public"."report_types" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."report_types" TO "service_role";
GRANT REFERENCES ON TABLE "public"."report_types" TO "service_role";
GRANT SELECT ON TABLE "public"."report_types" TO "service_role";
GRANT TRIGGER ON TABLE "public"."report_types" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."report_types" TO "service_role";
GRANT UPDATE ON TABLE "public"."report_types" TO "service_role";
GRANT DELETE ON TABLE "public"."reports" TO "service_role";
GRANT INSERT ON TABLE "public"."reports" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."reports" TO "service_role";
GRANT REFERENCES ON TABLE "public"."reports" TO "service_role";
GRANT SELECT ON TABLE "public"."reports" TO "service_role";
GRANT TRIGGER ON TABLE "public"."reports" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."reports" TO "service_role";
GRANT UPDATE ON TABLE "public"."reports" TO "service_role";
GRANT DELETE ON TABLE "public"."roles" TO "anon";
GRANT INSERT ON TABLE "public"."roles" TO "anon";
GRANT SELECT ON TABLE "public"."roles" TO "anon";
GRANT UPDATE ON TABLE "public"."roles" TO "anon";
GRANT DELETE ON TABLE "public"."roles" TO "authenticated";
GRANT INSERT ON TABLE "public"."roles" TO "authenticated";
GRANT SELECT ON TABLE "public"."roles" TO "authenticated";
GRANT UPDATE ON TABLE "public"."roles" TO "authenticated";
GRANT DELETE ON TABLE "public"."roles" TO "service_role";
GRANT INSERT ON TABLE "public"."roles" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."roles" TO "service_role";
GRANT REFERENCES ON TABLE "public"."roles" TO "service_role";
GRANT SELECT ON TABLE "public"."roles" TO "service_role";
GRANT TRIGGER ON TABLE "public"."roles" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."roles" TO "service_role";
GRANT UPDATE ON TABLE "public"."roles" TO "service_role";
GRANT SELECT ON TABLE "public"."sync_logs" TO "anon";
GRANT SELECT ON TABLE "public"."sync_logs" TO "authenticated";
GRANT DELETE ON TABLE "public"."sync_logs" TO "service_role";
GRANT INSERT ON TABLE "public"."sync_logs" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."sync_logs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."sync_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."sync_logs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."sync_logs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."sync_logs" TO "service_role";
GRANT UPDATE ON TABLE "public"."sync_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."sync_runs" TO "anon";
GRANT SELECT ON TABLE "public"."sync_runs" TO "authenticated";
GRANT DELETE ON TABLE "public"."sync_runs" TO "service_role";
GRANT INSERT ON TABLE "public"."sync_runs" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."sync_runs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."sync_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."sync_runs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."sync_runs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."sync_runs" TO "service_role";
GRANT UPDATE ON TABLE "public"."sync_runs" TO "service_role";
GRANT DELETE ON TABLE "public"."teams" TO "anon";
GRANT INSERT ON TABLE "public"."teams" TO "anon";
GRANT SELECT ON TABLE "public"."teams" TO "anon";
GRANT UPDATE ON TABLE "public"."teams" TO "anon";
GRANT DELETE ON TABLE "public"."teams" TO "authenticated";
GRANT INSERT ON TABLE "public"."teams" TO "authenticated";
GRANT SELECT ON TABLE "public"."teams" TO "authenticated";
GRANT UPDATE ON TABLE "public"."teams" TO "authenticated";
GRANT DELETE ON TABLE "public"."teams" TO "service_role";
GRANT INSERT ON TABLE "public"."teams" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."teams" TO "service_role";
GRANT REFERENCES ON TABLE "public"."teams" TO "service_role";
GRANT SELECT ON TABLE "public"."teams" TO "service_role";
GRANT TRIGGER ON TABLE "public"."teams" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."teams" TO "service_role";
GRANT UPDATE ON TABLE "public"."teams" TO "service_role";
GRANT DELETE ON TABLE "public"."tenant_members" TO "service_role";
GRANT INSERT ON TABLE "public"."tenant_members" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."tenant_members" TO "service_role";
GRANT REFERENCES ON TABLE "public"."tenant_members" TO "service_role";
GRANT SELECT ON TABLE "public"."tenant_members" TO "service_role";
GRANT TRIGGER ON TABLE "public"."tenant_members" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."tenant_members" TO "service_role";
GRANT UPDATE ON TABLE "public"."tenant_members" TO "service_role";
GRANT DELETE ON TABLE "public"."tenants" TO "anon";
GRANT INSERT ON TABLE "public"."tenants" TO "anon";
GRANT SELECT ON TABLE "public"."tenants" TO "anon";
GRANT UPDATE ON TABLE "public"."tenants" TO "anon";
GRANT DELETE ON TABLE "public"."tenants" TO "authenticated";
GRANT INSERT ON TABLE "public"."tenants" TO "authenticated";
GRANT SELECT ON TABLE "public"."tenants" TO "authenticated";
GRANT UPDATE ON TABLE "public"."tenants" TO "authenticated";
GRANT DELETE ON TABLE "public"."tenants" TO "service_role";
GRANT INSERT ON TABLE "public"."tenants" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."tenants" TO "service_role";
GRANT REFERENCES ON TABLE "public"."tenants" TO "service_role";
GRANT SELECT ON TABLE "public"."tenants" TO "service_role";
GRANT TRIGGER ON TABLE "public"."tenants" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."tenants" TO "service_role";
GRANT UPDATE ON TABLE "public"."tenants" TO "service_role";
GRANT DELETE ON TABLE "public"."workspace_invites" TO "anon";
GRANT INSERT ON TABLE "public"."workspace_invites" TO "anon";
GRANT SELECT ON TABLE "public"."workspace_invites" TO "anon";
GRANT UPDATE ON TABLE "public"."workspace_invites" TO "anon";
GRANT DELETE ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT INSERT ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT SELECT ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT UPDATE ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT DELETE ON TABLE "public"."workspace_invites" TO "service_role";
GRANT INSERT ON TABLE "public"."workspace_invites" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."workspace_invites" TO "service_role";
GRANT REFERENCES ON TABLE "public"."workspace_invites" TO "service_role";
GRANT SELECT ON TABLE "public"."workspace_invites" TO "service_role";
GRANT TRIGGER ON TABLE "public"."workspace_invites" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."workspace_invites" TO "service_role";
GRANT UPDATE ON TABLE "public"."workspace_invites" TO "service_role";
GRANT DELETE ON TABLE "public"."workspace_members" TO "service_role";
GRANT INSERT ON TABLE "public"."workspace_members" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."workspace_members" TO "service_role";
GRANT REFERENCES ON TABLE "public"."workspace_members" TO "service_role";
GRANT SELECT ON TABLE "public"."workspace_members" TO "service_role";
GRANT TRIGGER ON TABLE "public"."workspace_members" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."workspace_members" TO "service_role";
GRANT UPDATE ON TABLE "public"."workspace_members" TO "service_role";
GRANT DELETE ON TABLE "public"."workspaces" TO "service_role";
GRANT INSERT ON TABLE "public"."workspaces" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."workspaces" TO "service_role";
GRANT REFERENCES ON TABLE "public"."workspaces" TO "service_role";
GRANT SELECT ON TABLE "public"."workspaces" TO "service_role";
GRANT TRIGGER ON TABLE "public"."workspaces" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."workspaces" TO "service_role";
GRANT UPDATE ON TABLE "public"."workspaces" TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."add_workspace_owner_member"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."add_workspace_owner_member"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."add_workspace_owner_member"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."add_workspace_owner_member"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_workspace_member"(_workspace_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."role_level"(role text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."role_level"(role text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."role_level"(role text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."role_level"(role text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_workspace_member"(ws uuid, uid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."has_workspace_role"(ws uuid, uid uuid, min_role text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."prevent_locked_company_update"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."prevent_locked_company_update"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."prevent_locked_company_update"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."prevent_locked_company_update"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."handle_new_user_create_profile"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."delete_report_rows_batch"(p_report_id uuid, p_limit integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."claim_next_naver_media_sync_job"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."append_media_sync_staging_batch"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."summarize_media_sync_staging"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."save_media_sync_processing_checkpoint"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."materialize_media_sync_snapshot"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."activate_media_sync_snapshot"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."finalize_media_sync_job"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."prepare_media_sync_snapshot_materialization"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."materialize_media_sync_snapshot_batch"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."complete_media_sync_snapshot_materialization"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."save_naver_searchads_combined_processing_checkpoint"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."summarize_naver_searchads_combined_staging"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."summarize_naver_searchads_combined_staging_base"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."validate_naver_searchads_combined_staging_batch"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."validate_naver_searchads_combined_staging_batch_v2"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."validate_naver_searchads_combined_staging_batch_v3"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."reconcile_naver_searchads_brand_search_cross_grain_staging"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."etrylue_v2_assign_advertiser_tenant_scope"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."etrylue_v2_assign_report_tenant_scope"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."etrylue_v2_assign_media_connection_tenant_scope"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."etrylue_v2_provision_tenant_member_from_workspace_member"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."activate_csv_ingestion_snapshot"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."recover_stale_csv_ingestion_job"(p_job_id uuid, p_cutoff timestamp with time zone) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."create_api_report_with_media_connection_v1"(p_workspace_id uuid, p_advertiser_id uuid, p_connection_id uuid, p_report_type_id uuid, p_title text, p_period_start date, p_period_end date, p_created_by uuid, p_meta jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."save_google_ads_keyword_processing_checkpoint"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."claim_next_google_ads_media_sync_job"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."save_google_ads_all_data_processing_checkpoint"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."summarize_google_ads_all_data_staging_base"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."validate_google_ads_all_data_staging_batch_v1"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."replace_naver_searchads_fact_date"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."complete_naver_searchads_fact_only_job"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."prepare_naver_fact_snapshot_materialization"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."materialize_naver_fact_snapshot_batch"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."complete_naver_fact_snapshot_materialization"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."activate_naver_fact_snapshot"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."activate_naver_fact_snapshot_fanout"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."finalize_naver_fact_snapshot_job"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."etrylue_v2_guard_report_public_identity"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."etrylue_v2_guard_report_public_identity"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."etrylue_v2_guard_report_public_identity"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."etrylue_v2_guard_report_public_identity"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."transition_naver_media_sync_segment"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."create_api_report_with_media_connections_v2"(p_workspace_id uuid, p_advertiser_id uuid, p_connection_ids uuid[], p_report_type_id uuid, p_title text, p_period_start date, p_period_end date, p_created_by uuid, p_meta jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."replace_google_ads_daily_v2_fact_date"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."complete_google_ads_daily_v2_fact_only_job"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."prepare_daily_report_v2_combined_snapshot"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."materialize_daily_report_v2_combined_snapshot_batch"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."complete_daily_report_v2_combined_snapshot"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."activate_daily_report_v2_combined_snapshot"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."claim_creative_metadata_cache_v1"(p_account_key text, p_keys text[], p_max_requests integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."finish_creative_metadata_cache_v1"(p_account_key text, p_token uuid, p_entries jsonb, p_outcome text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."read_creative_metadata_cache_v1"(p_account_key text, p_keys text[]) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."prune_creative_metadata_cache_v1"(p_after_account_key text, p_account_limit integer, p_entry_limit integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."claim_creative_metadata_cache_due_v1"(p_account_key text, p_keys text[], p_max_requests integer, p_refresh_ahead_ms integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "etrylue_customer_private"."my_company"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."provision_etrylue_customer"(p_user_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."reserve_etrylue_customer_signup"(p_email text, p_client_hash text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."guard_billing_review_advertiser"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."enrich_naver_campaign_daily_authority"(p_job_id uuid, p_started_at timestamp with time zone, p_expected_rows bigint, p_stats jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."save_meta_ads_contact_snapshot_v1"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."create_naver_meta_report_v1"(p_workspace_id uuid, p_advertiser_id uuid, p_connection_ids uuid[], p_report_type_id uuid, p_title text, p_period_start date, p_period_end date, p_created_by uuid, p_meta jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."claim_meta_ads_daily_run_v1"(p_connection_id uuid, p_target_date date, p_lease uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."replace_meta_ads_daily_window_v1"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."finish_meta_ads_daily_run_v1"(p_run_id uuid, p_lease uuid, p_error text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."materialize_meta_ads_daily_report_v1"(p_report_id uuid, p_connection_id uuid, p_target_date date) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."meta_ads_daily_eligible_v1"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."activate_meta_ads_daily_connection_v1"(p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."enqueue_meta_ads_daily_batch_v1"(p_target_date date) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."claim_meta_ads_collection_task_v1"(p_lease uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."finish_meta_ads_collection_task_v1"(p_task_id uuid, p_lease uuid, p_error text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."attach_daily_report_meta_v1"(p_report_id uuid, p_connection_ids uuid[], p_user_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."resolve_daily_report_meta_snapshot_v1"(p_report_id uuid, p_source_ingestion_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."meta_ads_contact_policy_valid_v1"(p jsonb, account_id text, krw_only boolean) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."meta_ads_contact_metric_keys_v1"(p jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."meta_ads_contact_totals_valid_v1"(t jsonb, p jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."meta_ads_contact_row_meta_valid_v1"(r jsonb, p jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."meta_ads_contact_totals_v1"(rows jsonb, p jsonb) TO "service_role";
ALTER TABLE "etrylue_creative_cache_v1"."accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "etrylue_creative_cache_v1"."entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "etrylue_customer_private"."accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "etrylue_customer_private"."scopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "etrylue_customer_private"."signup_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ad_data" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."advertisers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."app_admins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."client_members__deprecated" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clients__deprecated" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_report_meta_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_report_meta_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_report_v2_snapshot_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ingestion_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."insights" ENABLE ROW LEVEL SECURITY;
-- Preserve the source application's existing read visibility with explicit RLS.
CREATE POLICY review_preserve_existing_select ON "public"."insights" FOR SELECT TO "anon", "authenticated" USING (true);
ALTER TABLE "public"."manual_report_media_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_sync_fact_partitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_sync_fact_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_sync_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_sync_report_projections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_sync_report_projections" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_sync_staging_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media_sync_staging_rows" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."meta_ads_collection_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meta_ads_daily_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meta_ads_daily_partitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meta_ads_daily_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."metrics_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."metrics_daily_backup_before_dedupe" ENABLE ROW LEVEL SECURITY;
-- Preserve the source application's existing read visibility with explicit RLS.
CREATE POLICY review_preserve_existing_select ON "public"."metrics_daily_backup_before_dedupe" FOR SELECT TO "anon", "authenticated" USING (true);
ALTER TABLE "public"."metrics_daily_dedup" ENABLE ROW LEVEL SECURITY;
-- Preserve the source application's existing read visibility with explicit RLS.
CREATE POLICY review_preserve_existing_select ON "public"."metrics_daily_dedup" FOR SELECT TO "anon", "authenticated" USING (true);
ALTER TABLE "public"."org_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_creatives" ENABLE ROW LEVEL SECURITY;
-- Preserve the source application's existing read visibility with explicit RLS.
CREATE POLICY review_preserve_existing_select ON "public"."report_creatives" FOR SELECT TO "anon", "authenticated" USING (true);
ALTER TABLE "public"."report_ingestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_media_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sync_logs" ENABLE ROW LEVEL SECURITY;
-- Preserve the source application's existing read visibility with explicit RLS.
CREATE POLICY review_preserve_existing_select ON "public"."sync_logs" FOR SELECT TO "anon", "authenticated" USING (true);
ALTER TABLE "public"."sync_runs" ENABLE ROW LEVEL SECURITY;
-- Preserve the source application's existing read visibility with explicit RLS.
CREATE POLICY review_preserve_existing_select ON "public"."sync_runs" FOR SELECT TO "anon", "authenticated" USING (true);
ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_admins_modify_admin" ON "public"."app_admins" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "app_admins_select_admin" ON "public"."app_admins" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin());
CREATE POLICY "client_members_insert_own" ON "public"."client_members__deprecated" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "client_members_select_own" ON "public"."client_members__deprecated" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));
CREATE POLICY "clients_insert_auth" ON "public"."clients__deprecated" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "clients_select_member" ON "public"."clients__deprecated" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM client_members__deprecated cm
  WHERE ((cm.client_id = clients__deprecated.id) AND (cm.user_id = auth.uid())))));
CREATE POLICY "companies_modify_admin" ON "public"."companies" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "companies_select_auth" ON "public"."companies" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "customer_company_boundary" ON "public"."companies" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL) OR (id = ( SELECT etrylue_customer_private.my_company() AS my_company)))) WITH CHECK (((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL) OR (id = ( SELECT etrylue_customer_private.my_company() AS my_company))));
CREATE POLICY "customer_department_boundary" ON "public"."departments" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL) OR (company_id = ( SELECT etrylue_customer_private.my_company() AS my_company)))) WITH CHECK (((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL) OR (company_id = ( SELECT etrylue_customer_private.my_company() AS my_company))));
CREATE POLICY "departments_modify_admin" ON "public"."departments" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "departments_select_auth" ON "public"."departments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "customer_org_boundary" ON "public"."org_units" AS RESTRICTIVE FOR ALL TO "authenticated" USING ((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL)) WITH CHECK ((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL));
CREATE POLICY "org_units_select_authenticated" ON "public"."org_units" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "profiles_delete_admin" ON "public"."profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin());
CREATE POLICY "profiles_insert_admin_only" ON "public"."profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_admin());
CREATE POLICY "profiles_select_own" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((id = auth.uid()) OR is_admin()));
CREATE POLICY "profiles_update_own" ON "public"."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((id = auth.uid()) OR is_admin())) WITH CHECK (((id = auth.uid()) OR is_admin()));
CREATE POLICY "customer_role_boundary" ON "public"."roles" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL) OR (company_id = ( SELECT etrylue_customer_private.my_company() AS my_company)))) WITH CHECK (((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL) OR (company_id = ( SELECT etrylue_customer_private.my_company() AS my_company))));
CREATE POLICY "roles_modify_admin" ON "public"."roles" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "roles_select_auth" ON "public"."roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "customer_team_boundary" ON "public"."teams" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL) OR (company_id = ( SELECT etrylue_customer_private.my_company() AS my_company)))) WITH CHECK (((( SELECT etrylue_customer_private.my_company() AS my_company) IS NULL) OR (company_id = ( SELECT etrylue_customer_private.my_company() AS my_company))));
CREATE POLICY "teams_modify_admin" ON "public"."teams" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "teams_select_auth" ON "public"."teams" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "workspace_members_select_own" ON "public"."workspace_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));
ALTER FUNCTION "public"."add_workspace_owner_member"() SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."is_workspace_member"(_workspace_id uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."is_workspace_member"(ws uuid, uid uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."has_workspace_role"(ws uuid, uid uuid, min_role text) SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."is_admin"() SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."etrylue_v2_guard_report_public_identity"() SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."prevent_locked_company_update"() SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."role_level"(role text) SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."set_updated_at"() SET search_path = public, pg_catalog;
ALTER FUNCTION "public"."touch_updated_at"() SET search_path = public, pg_catalog;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE CONSTRAINT TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION handle_new_user_create_profile();
CREATE TRIGGER billing_review_advertiser_identity BEFORE INSERT OR UPDATE ON public.advertisers FOR EACH ROW EXECUTE FUNCTION guard_billing_review_advertiser();
CREATE TRIGGER trg_advertisers_v2_tenant_scope BEFORE INSERT OR UPDATE ON public.advertisers FOR EACH ROW EXECUTE FUNCTION etrylue_v2_assign_advertiser_tenant_scope();
CREATE TRIGGER trg_companies_prevent_locked_update BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION prevent_locked_company_update();
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_connections_updated_at BEFORE UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_insights_updated_at BEFORE UPDATE ON public.insights FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_media_connections_v2_tenant_scope BEFORE INSERT OR UPDATE ON public.media_connections FOR EACH ROW EXECUTE FUNCTION etrylue_v2_assign_media_connection_tenant_scope();
CREATE TRIGGER customer_profile_identity BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION etrylue_customer_private.guard_profile();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_report_creatives_touch BEFORE UPDATE ON public.report_creatives FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reports_v2_public_identity_freeze BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION etrylue_v2_guard_report_public_identity();
CREATE TRIGGER trg_reports_v2_tenant_scope BEFORE INSERT OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION etrylue_v2_assign_report_tenant_scope();
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customer_membership_role BEFORE INSERT OR UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION etrylue_customer_private.guard_membership();
CREATE TRIGGER trg_workspace_members_v2_provision_tenant_member AFTER INSERT ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION etrylue_v2_provision_tenant_member_from_workspace_member();
CREATE TRIGGER trg_workspaces_add_owner AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION add_workspace_owner_member();
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();
NOTIFY pgrst, 'reload schema';
