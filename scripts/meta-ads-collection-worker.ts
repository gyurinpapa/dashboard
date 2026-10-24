import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { createMetaDailyRunner, metaDailyErrorCode } from "../src/lib/media-sync/meta-ads-daily-runner";

const log = (event: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ worker: "meta_collection_v1", event, ...fields }));
async function main() {
  if (process.env.META_DAILY_QUEUE_WORKER_ENABLED !== "1") { log("disabled"); return; }
  const db = getSupabaseAdmin(), runner = createMetaDailyRunner(db);
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  log("started");
  while (!stopping) {
    let taskId: string | null = null;
    const lease = randomUUID();
    try {
      const claimed = await db.rpc("claim_meta_ads_collection_task_v1", { p_lease: lease });
      if (claimed.error) throw new Error("META_QUEUE_CLAIM_FAILED");
      const task = claimed.data;
      if (task) {
        taskId = task.id;
        log("claimed", { task_id: task.id, connection_id: task.connection_id, target_date: task.target_date, attempt: task.attempt });
        let error: string | null = null;
        try { if (await runner.collect(task.connection_id, task.target_date)) error = "META_DAILY_FAILED"; }
        catch (failure) { error = metaDailyErrorCode(failure); }
        const finished = await db.rpc("finish_meta_ads_collection_task_v1", { p_task_id: task.id, p_lease: lease, p_error: error });
        if (finished.error) throw new Error("META_QUEUE_FINISH_FAILED");
        log("finished", { task_id: task.id, status: finished.data?.status, code: error });
        continue;
      }
    } catch {
      // A broken account/task never terminates another account's collection.
      log("task_error", { task_id: taskId, code: "META_QUEUE_OPERATION_FAILED" });
    }
    for (let i = 0; i < 10 && !stopping; i++) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  log("stopped");
}
main().catch(() => { log("failed", { code: "META_QUEUE_WORKER_FAILED" }); process.exitCode = 1; });
