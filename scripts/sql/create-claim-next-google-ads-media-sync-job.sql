create or replace function public.claim_next_google_ads_media_sync_job()
returns setof public.media_sync_jobs
language sql
security definer
set search_path = pg_catalog, public
as $function$
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

revoke all
on function
  public.claim_next_google_ads_media_sync_job()
from public;

revoke execute
on function
  public.claim_next_google_ads_media_sync_job()
from anon;

revoke execute
on function
  public.claim_next_google_ads_media_sync_job()
from authenticated;

grant execute
on function
  public.claim_next_google_ads_media_sync_job()
to service_role;
