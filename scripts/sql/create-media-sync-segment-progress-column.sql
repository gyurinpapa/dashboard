/*
 * Etrylue Performance
 * Media sync segment progress durable authority
 *
 * Purpose:
 * - Add a provider-neutral durable sync segment progress field.
 * - Existing jobs remain unchanged because the column is nullable.
 * - Existing Naver / Google processing_checkpoint contracts remain untouched.
 * - Segment state validation and advancement are owned by application/RPC
 *   contracts added in later stages.
 */

alter table public.media_sync_jobs
add column if not exists sync_segment_progress jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname =
      'media_sync_jobs_sync_segment_progress_object_check'
      and conrelid =
        'public.media_sync_jobs'::regclass
  ) then
    alter table public.media_sync_jobs
    add constraint
      media_sync_jobs_sync_segment_progress_object_check
    check (
      sync_segment_progress is null
      or jsonb_typeof(
        sync_segment_progress
      ) = 'object'
    );
  end if;
end;
$$;

comment on column
  public.media_sync_jobs.sync_segment_progress
is
  'Nullable provider-neutral durable progress for sync_segment_v1 execution. Existing provider processing_checkpoint authority remains separate.';

notify pgrst, 'reload schema';
