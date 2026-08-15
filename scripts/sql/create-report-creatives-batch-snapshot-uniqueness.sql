-- Etrylue Performance / Stage 8 / Macro 2-R1
-- Creative Snapshot Batch-Aware Uniqueness
--
-- Production execution record.
-- This migration was executed only after READ ONLY preflight confirmed:
-- - report_creatives rows = 80
-- - batch_id IS NULL rows = 0
-- - broken current/published creative pointers = 0
-- - waiting/strong relation locks = 0
--
-- Purpose:
-- - replace report-wide creative uniqueness with batch-aware snapshot uniqueness
-- - allow immutable current/published/candidate batches to coexist
--
-- IMPORTANT: historical execution record. Do not re-run after PASS without a new preflight.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if exists (
    select 1
    from public.report_creatives
    where batch_id is null
  ) then
    raise exception
      'MACRO2R1_PRECONDITION_FAILED: report_creatives contains NULL batch_id rows';
  end if;

  if exists (
    select 1
    from public.report_creatives
    group by report_id, batch_id, creative_key
    having count(*) > 1
  ) then
    raise exception
      'MACRO2R1_PRECONDITION_FAILED: duplicate (report_id, batch_id, creative_key)';
  end if;

  if exists (
    select 1
    from public.report_creatives
    where key is not null
      and key <> ''
    group by report_id, batch_id, key
    having count(*) > 1
  ) then
    raise exception
      'MACRO2R1_PRECONDITION_FAILED: duplicate (report_id, batch_id, key)';
  end if;

  if exists (
    select 1
    from public.reports r
    where r.current_creatives_batch_id is not null
      and not exists (
        select 1
        from public.report_creatives c
        where c.report_id = r.id
          and c.batch_id = r.current_creatives_batch_id
      )
  ) then
    raise exception
      'MACRO2R1_PRECONDITION_FAILED: broken current creative pointer';
  end if;

  if exists (
    select 1
    from public.reports r
    where r.published_creatives_batch_id is not null
      and not exists (
        select 1
        from public.report_creatives c
        where c.report_id = r.id
          and c.batch_id = r.published_creatives_batch_id
      )
  ) then
    raise exception
      'MACRO2R1_PRECONDITION_FAILED: broken published creative pointer';
  end if;
end
$$;

drop index if exists public.report_creatives_report_id_creative_key_ux;
drop index if exists public.report_creatives_uniq;
drop index if exists public.report_creatives_uniq_report_key;
drop index if exists public.report_creatives_uq_report_key;
drop index if exists public.report_creatives_report_id_key_uniq;

create unique index report_creatives_report_batch_creative_key_ux
  on public.report_creatives (
    report_id,
    batch_id,
    creative_key
  );

create unique index report_creatives_report_batch_key_ux
  on public.report_creatives (
    report_id,
    batch_id,
    key
  )
  where key is not null
    and key <> '';

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'report_creatives'
      and indexname = 'report_creatives_report_batch_creative_key_ux'
  ) then
    raise exception
      'MACRO2R1_POSTCONDITION_FAILED: creative_key batch unique index missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'report_creatives'
      and indexname = 'report_creatives_report_batch_key_ux'
  ) then
    raise exception
      'MACRO2R1_POSTCONDITION_FAILED: key batch unique index missing';
  end if;
end
$$;

commit;
