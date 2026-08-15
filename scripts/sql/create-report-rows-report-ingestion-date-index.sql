-- Etrylue Performance
-- CSV Period Lightweight
-- Macro 1-C1
-- Repository record for the Production report_rows date-range access path.
--
-- Production index:
--   report_rows_report_ingestion_date_idx
--   (report_id, ingestion_id, date)
--
-- Safety:
-- - CREATE INDEX CONCURRENTLY avoids the stronger write blocking of ordinary CREATE INDEX.
-- - IF NOT EXISTS keeps the script idempotent when the index already exists.
-- - PostgreSQL does not allow CREATE INDEX CONCURRENTLY inside an explicit transaction block.
--
-- Do not wrap this statement in BEGIN/COMMIT.

create index concurrently if not exists report_rows_report_ingestion_date_idx
on public.report_rows using btree (
  report_id,
  ingestion_id,
  date
);
