-- URL Contract V2
-- Canonical report identity uniqueness guard.
--
-- IMPORTANT:
-- - This file only defines the guard.
-- - Do not apply to Production before a separate READ ONLY preflight.
-- - Existing reports without meta.public_identity are intentionally unaffected.
--
-- Canonical identity:
-- advertiser_id
-- + source_type
-- + report_type
-- + period_type
-- + period_key

CREATE UNIQUE INDEX reports_public_identity_uq
ON public.reports (
  advertiser_id,
  (meta #>> '{public_identity,source_type}'),
  (meta #>> '{public_identity,report_type}'),
  (meta #>> '{public_identity,period_type}'),
  (meta #>> '{public_identity,period_key}')
)
WHERE
  advertiser_id IS NOT NULL
  AND jsonb_typeof(meta -> 'public_identity') = 'object'
  AND COALESCE(
    BTRIM(meta #>> '{public_identity,source_type}'),
    ''
  ) <> ''
  AND COALESCE(
    BTRIM(meta #>> '{public_identity,report_type}'),
    ''
  ) <> ''
  AND COALESCE(
    BTRIM(meta #>> '{public_identity,period_type}'),
    ''
  ) <> ''
  AND COALESCE(
    BTRIM(meta #>> '{public_identity,period_key}'),
    ''
  ) <> '';
