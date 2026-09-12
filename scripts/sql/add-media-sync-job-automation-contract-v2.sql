begin;

-- ============================================================
-- ETRYLUE DAILY REPORT V2
-- MEDIA SYNC JOB AUTOMATION CONTRACT
--
-- Additive / backward-compatible:
-- - NULL preserves all existing jobs and behavior.
-- - daily_report_v2 is internal scheduler routing authority only.
-- - execution_contract remains provider execution authority.
-- ============================================================

alter table public.media_sync_jobs
  add column if not exists automation_contract text null;

alter table public.media_sync_jobs
  drop constraint if exists media_sync_jobs_automation_contract_check;

alter table public.media_sync_jobs
  add constraint media_sync_jobs_automation_contract_check
  check (
    automation_contract is null
    or automation_contract = 'daily_report_v2'
  );

commit;
