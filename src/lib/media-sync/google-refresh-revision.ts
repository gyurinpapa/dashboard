import type { MediaSyncJobRouteAccessContext } from "./media-sync-jobs-route-policy";

export const GOOGLE_REFRESH_REVISION_REQUEST_RPC = "request_google_refresh_revision";
export const GOOGLE_REFRESH_REVISION_STEP_RPC = "step_google_refresh_revision";
export type GoogleRefreshRevisionAction = "status" | "prepare" | "batch" | "complete" | "activate" | "abandon";
export type GoogleRefreshRevisionDependencies = Readonly<{
  resolveAccess(request: Request, reportId: string): Promise<MediaSyncJobRouteAccessContext>;
  stepAtomically(payload: Readonly<Record<string, unknown>>): Promise<unknown>;
}>;
export class GoogleRefreshRevisionError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "ACCESS_DENIED" | "DATABASE_REJECTED" | "INVALID_RESULT") {
    super(code);
    this.name = "GoogleRefreshRevisionError";
  }
}
function requireValue(ok: unknown, code: GoogleRefreshRevisionError["code"]): asserts ok {
  if (!ok) throw new GoogleRefreshRevisionError(code);
}
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/** One explicit step per call. No implicit enqueue, loop, publish, retry or activation. */
export async function runGoogleRefreshRevisionStep(input: Readonly<{
  enabled?: boolean;
  executionApproved?: boolean;
  activationApproved?: boolean;
  httpRequest: Request;
  reportId: string;
  body: unknown;
  dependencies: GoogleRefreshRevisionDependencies;
}>) {
  if (input.enabled !== true || input.executionApproved !== true) return { action: "disabled" } as const;
  requireValue(input.body !== null && typeof input.body === "object" && !Array.isArray(input.body), "INVALID_INPUT");
  const b = input.body as Record<string, unknown>;
  requireValue(isUuid(b.requestId) && isUuid(input.reportId), "INVALID_INPUT");
  requireValue(["status", "prepare", "batch", "complete", "activate", "abandon"].includes(b.action as string), "INVALID_INPUT");
  const keys = b.action === "batch" ? ["requestId", "action", "batchStart", "batchSize"] : ["requestId", "action"];
  requireValue(Object.keys(b).length === keys.length && Object.keys(b).every(k => keys.includes(k)), "INVALID_INPUT");
  if (b.action === "activate" && input.activationApproved !== true) return { action: "disabled" } as const;
  if (b.action === "batch") {
    requireValue(Number.isSafeInteger(b.batchStart) && Number(b.batchStart) >= 0 &&
      Number.isSafeInteger(b.batchSize) && Number(b.batchSize) >= 1 && Number(b.batchSize) <= 5000, "INVALID_INPUT");
  }
  const a = await input.dependencies.resolveAccess(input.httpRequest, input.reportId);
  requireValue(a.canRunSync === true && ["true_master", "workspace", "own_created"].includes(a.accessScope) && a.reportId === input.reportId &&
    [a.userId, a.workspaceId, a.advertiserId].every(isUuid), "ACCESS_DENIED");
  const payload: Record<string, unknown> = {
    request_id: b.requestId.toLowerCase(), report_id: a.reportId, workspace_id: a.workspaceId,
    advertiser_id: a.advertiserId, actor_user_id: a.userId, action: b.action,
  };
  if (b.action === "batch") { payload.batch_start = b.batchStart; payload.batch_size = b.batchSize; }
  let raw: unknown;
  try { raw = await input.dependencies.stepAtomically(payload); }
  catch { throw new GoogleRefreshRevisionError("DATABASE_REJECTED"); }
  requireValue(raw !== null && typeof raw === "object" && !Array.isArray(raw), "INVALID_RESULT");
  const result = raw as Record<string, unknown>;
  requireValue(result.request_id === payload.request_id, "INVALID_RESULT");
  requireValue(result.report_id === undefined || result.report_id === a.reportId, "INVALID_RESULT");
  // Whitelist safe response fields: do not expose raw RPC diagnostics or stored request bodies.
  const safe: Record<string, unknown> = { action: b.action, requestId: payload.request_id };
  for (const key of ["state", "status", "revision_id", "run_id", "snapshot_ingestion_id", "ingestion_id", "expected_rows", "next_row_index", "complete", "idempotent"]) {
    const value = result[key];
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) safe[key] = value;
  }
  return Object.freeze(safe);
}
