import { createHash } from "node:crypto";
import { isValidYmd, MEDIA_SYNC_JOB_STATUSES, type MediaSyncJobStatus } from "./types";
import { getPreviousCompletedSeoulCalendarDate } from "./naver-searchads-daily-scheduler";
import type { MediaSyncJobRouteAccessContext } from "./media-sync-jobs-route-policy";

/** Separate request identity; existing daily job identities never change. */
export const GOOGLE_EXACT_DATE_REFRESH_CONTRACT = "google_ads_exact_date_refresh_v1" as const;
export const GOOGLE_EXACT_DATE_REFRESH_RPC = "request_google_ads_exact_date_refresh" as const;

export type GoogleExactDateRefreshErrorCode =
  | "INVALID_INPUT" | "ACCESS_DENIED" | "SCOPE_MISMATCH"
  | "DATE_NOT_COMPLETED" | "DATABASE_REJECTED" | "INVALID_RESULT";

export class GoogleExactDateRefreshError extends Error {
  constructor(readonly code: GoogleExactDateRefreshErrorCode) {
    super(code); // Never copy raw database, OAuth, or provider error text.
    this.name = "GoogleExactDateRefreshError";
  }
}

export type GoogleExactDateRefreshRequest = Readonly<{
  requestId: string;
  connectionId: string;
  externalAccountId: string;
  date: string;
  expectedSourceJobId: string;
  expectedFactUpdatedAt: string;
  expectedCurrentIngestionId: string;
  expectedPublishedIngestionId: string | null;
}>;

export type GoogleExactDateRefreshPayload = Readonly<{
  contract: typeof GOOGLE_EXACT_DATE_REFRESH_CONTRACT;
  request_id: string;
  workspace_id: string;
  advertiser_id: string;
  report_id: string;
  connection_id: string;
  external_account_id: string;
  date: string;
  actor_user_id: string;
  expected_source_job_id: string;
  expected_fact_updated_at: string;
  expected_current_ingestion_id: string;
  expected_published_ingestion_id: string | null;
}>;

export type GoogleExactDateRefreshPlan = Readonly<{
  jobId: string;
  payload: GoogleExactDateRefreshPayload;
  executionContract: "google_all_data_v1";
  automationContract: "daily_report_v2";
  replacementUnit: "whole_google_account_date";
  publication: "unchanged";
}>;

const REQUEST_KEYS = [
  "requestId", "connectionId", "externalAccountId", "date",
  "expectedSourceJobId", "expectedFactUpdatedAt",
  "expectedCurrentIngestionId", "expectedPublishedIngestionId",
] as const;

function requireCondition(ok: unknown, code: GoogleExactDateRefreshErrorCode): asserts ok {
  if (!ok) throw new GoogleExactDateRefreshError(code);
}

function uuid(value: unknown): string {
  requireCondition(typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), "INVALID_INPUT");
  return value.toLowerCase();
}

export function buildGoogleExactDateRefreshJobId(requestId: string): string {
  const bytes = createHash("sha256")
    .update(`${GOOGLE_EXACT_DATE_REFRESH_CONTRACT}\u001f${uuid(requestId)}`, "utf8")
    .digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Access must come from the existing server-side run_sync resolver, never a request body. */
export function buildGoogleExactDateRefreshPlan(input: Readonly<{
  access: MediaSyncJobRouteAccessContext;
  reportId: string;
  request: unknown;
  now?: Date;
}>): GoogleExactDateRefreshPlan {
  const { access } = input;
  requireCondition(access?.canRunSync === true &&
    ["true_master", "workspace", "own_created"].includes(access.accessScope), "ACCESS_DENIED");
  const reportId = uuid(input.reportId);
  requireCondition(uuid(access.reportId) === reportId, "SCOPE_MISMATCH");
  const raw = input.request;
  requireCondition(raw !== null && typeof raw === "object" && !Array.isArray(raw), "INVALID_INPUT");
  const record = raw as Record<string, unknown>;
  // In particular, reject campaign/product filters, date ranges and force/retry flags.
  requireCondition(Object.keys(record).length === REQUEST_KEYS.length &&
    Object.keys(record).every(key => (REQUEST_KEYS as readonly string[]).includes(key)), "INVALID_INPUT");
  const date = record.date;
  requireCondition(typeof date === "string" && isValidYmd(date), "INVALID_INPUT");
  const now = input.now ?? new Date();
  requireCondition(Number.isFinite(now.getTime()), "INVALID_INPUT");
  requireCondition(date <= getPreviousCompletedSeoulCalendarDate(now), "DATE_NOT_COMPLETED");
  requireCondition(typeof record.externalAccountId === "string" && /^\d{10}$/.test(record.externalAccountId), "INVALID_INPUT");
  const factUpdatedAt = record.expectedFactUpdatedAt;
  // Preserve PostgreSQL microseconds; do not round through Date.toISOString().
  requireCondition(typeof factUpdatedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(factUpdatedAt) &&
    Number.isFinite(Date.parse(factUpdatedAt)), "INVALID_INPUT");
  const payload: GoogleExactDateRefreshPayload = Object.freeze({
    contract: GOOGLE_EXACT_DATE_REFRESH_CONTRACT,
    request_id: uuid(record.requestId),
    workspace_id: uuid(access.workspaceId),
    advertiser_id: uuid(access.advertiserId),
    report_id: reportId,
    connection_id: uuid(record.connectionId),
    external_account_id: record.externalAccountId,
    date,
    actor_user_id: uuid(access.userId),
    expected_source_job_id: uuid(record.expectedSourceJobId),
    expected_fact_updated_at: factUpdatedAt,
    expected_current_ingestion_id: uuid(record.expectedCurrentIngestionId),
    expected_published_ingestion_id: record.expectedPublishedIngestionId === null
      ? null : uuid(record.expectedPublishedIngestionId),
  });
  const jobId = buildGoogleExactDateRefreshJobId(payload.request_id);
  requireCondition(jobId !== payload.expected_source_job_id, "INVALID_INPUT");
  return Object.freeze({ jobId, payload, executionContract: "google_all_data_v1",
    automationContract: "daily_report_v2", replacementUnit: "whole_google_account_date", publication: "unchanged" });
}

export type GoogleExactDateRefreshDependencies = Readonly<{
  resolveAccess: (request: Request, reportId: string) => Promise<MediaSyncJobRouteAccessContext>;
  /** One transaction: validate current scope and baseline, reserve request, insert new job. */
  requestAtomically: (payload: GoogleExactDateRefreshPayload) => Promise<unknown>;
}>;

export type GoogleExactDateRefreshResult =
  | Readonly<{ action: "disabled" }>
  | Readonly<{ action: "created" | "existing"; jobId: string; requestId: string;
      status: MediaSyncJobStatus }>;

/** Offline-testable orchestration. Production entry point keeps both gates closed. */
export async function runGoogleExactDateRefresh(input: Readonly<{
  enabled?: boolean;
  liveApprovalConfirmed?: boolean;
  httpRequest: Request;
  reportId: string;
  request: unknown;
  dependencies: GoogleExactDateRefreshDependencies;
  now?: Date;
}>): Promise<GoogleExactDateRefreshResult> {
  if (input.enabled !== true || input.liveApprovalConfirmed !== true) {
    return Object.freeze({ action: "disabled" });
  }
  const access = await input.dependencies.resolveAccess(input.httpRequest, input.reportId);
  const plan = buildGoogleExactDateRefreshPlan({ access, reportId: input.reportId,
    request: input.request, now: input.now });
  let raw: unknown;
  try { raw = await input.dependencies.requestAtomically(plan.payload); }
  catch { throw new GoogleExactDateRefreshError("DATABASE_REJECTED"); }
  requireCondition(raw !== null && typeof raw === "object" && !Array.isArray(raw), "INVALID_RESULT");
  const r = raw as Record<string, unknown>;
  requireCondition(r.request_id === plan.payload.request_id && r.job_id === plan.jobId &&
    typeof r.replayed === "boolean" &&
    MEDIA_SYNC_JOB_STATUSES.includes(r.status as MediaSyncJobStatus) &&
    (r.replayed === true || r.status === "pending"), "INVALID_RESULT");
  return Object.freeze({ action: r.replayed ? "existing" : "created", jobId: plan.jobId,
    requestId: plan.payload.request_id, status: r.status as MediaSyncJobStatus });
}
