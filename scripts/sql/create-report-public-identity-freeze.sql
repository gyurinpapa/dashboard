-- URL Contract V2
-- Freeze canonical report identity after first publish.
--
-- IMPORTANT:
-- - Definition only. Do not apply to Production before READ ONLY preflight.
-- - Legacy reports without meta.public_identity remain valid.
-- - Draft/unpublished reports may establish or revise identity.
-- - Once a report has been published, public_identity cannot change or disappear.

CREATE OR REPLACE FUNCTION public.etrylue_v2_guard_report_public_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_reports_v2_public_identity_freeze
ON public.reports;

CREATE TRIGGER trg_reports_v2_public_identity_freeze
BEFORE UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.etrylue_v2_guard_report_public_identity();
