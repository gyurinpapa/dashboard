import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { getPreviousCompletedSeoulCalendarDate } from "../src/lib/media-sync/naver-searchads-daily-scheduler";

async function main() {
  if (process.env.META_DAILY_COLLECTOR_ENABLED !== "1") {
    console.log(JSON.stringify({ scheduler: "meta_daily_v1", event: "disabled" })); return;
  }
  const targetDate = getPreviousCompletedSeoulCalendarDate(new Date());
  const { data, error } = await getSupabaseAdmin().rpc("enqueue_meta_ads_daily_batch_v1", { p_target_date: targetDate });
  if (error) throw new Error("META_DAILY_ENQUEUE_FAILED");
  console.log(JSON.stringify({ scheduler: "meta_daily_v1", event: "enqueued", ...data }));
}
main().catch(() => {
  console.error(JSON.stringify({ scheduler: "meta_daily_v1", event: "failed", code: "META_DAILY_ENQUEUE_FAILED" }));
  process.exitCode = 1;
});
