import { getSupabaseAdmin } from "../supabase/admin";

export type ReportPublishSnapshot = {
  reportId: string;
  sourceShareToken: string | null;
  currentIngestionId: string;
  currentCreativesBatchId: string | null;
  draftPeriodStart: string | null;
  draftPeriodEnd: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type CommitReportPublishSnapshotInput = {
  snapshot: ReportPublishSnapshot;
  includePublishedAt: boolean;
};

export type CommitReportPublishSnapshotResult = {
  shareToken: string;
  publishedAt: string | null;
  publishedIngestionId: string;
  publishedCreativesBatchId: string | null;
  publishedPeriodStart: string | null;
  publishedPeriodEnd: string | null;
};

export type ReportPublishSnapshotErrorCode =
  | "PUBLISH_CONFLICT"
  | "DATABASE_ERROR";

export class ReportPublishSnapshotError extends Error {
  readonly code: ReportPublishSnapshotErrorCode;

  constructor(
    code: ReportPublishSnapshotErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReportPublishSnapshotError";
    this.code = code;
  }
}

function normalizeExistingShareToken(value: string | null) {
  const token = String(value ?? "").trim();

  if (!token) return "";
  if (token.toLowerCase() === "null") return "";
  if (token.toLowerCase() === "undefined") return "";

  return token;
}

function randToken(len = 32) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let value = "";

  for (let index = 0; index < len; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }

  return value;
}

export async function commitReportPublishSnapshot(
  input: CommitReportPublishSnapshotInput,
): Promise<CommitReportPublishSnapshotResult> {
  const { snapshot, includePublishedAt } = input;
  const sb = getSupabaseAdmin();

  const shareToken =
    normalizeExistingShareToken(snapshot.sourceShareToken) || randToken(32);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    share_token: shareToken,
    status: "ready",
    updated_at: now,
    published_ingestion_id: snapshot.currentIngestionId,
    published_creatives_batch_id: snapshot.currentCreativesBatchId,
    published_period_start: snapshot.draftPeriodStart,
    published_period_end: snapshot.draftPeriodEnd,
    period_start: snapshot.draftPeriodStart,
    period_end: snapshot.draftPeriodEnd,
  };

  if (includePublishedAt) {
    patch.published_at = now;
  }

  let query = sb
    .from("reports")
    .update(patch)
    .eq("id", snapshot.reportId)
    .eq("current_ingestion_id", snapshot.currentIngestionId);

  query =
    snapshot.currentCreativesBatchId === null
      ? query.is("current_creatives_batch_id", null)
      : query.eq(
          "current_creatives_batch_id",
          snapshot.currentCreativesBatchId,
        );

  query =
    snapshot.draftPeriodStart === null
      ? query.is("draft_period_start", null)
      : query.eq("draft_period_start", snapshot.draftPeriodStart);

  query =
    snapshot.draftPeriodEnd === null
      ? query.is("draft_period_end", null)
      : query.eq("draft_period_end", snapshot.draftPeriodEnd);

  query =
    snapshot.periodStart === null
      ? query.is("period_start", null)
      : query.eq("period_start", snapshot.periodStart);

  query =
    snapshot.periodEnd === null
      ? query.is("period_end", null)
      : query.eq("period_end", snapshot.periodEnd);

  query =
    snapshot.sourceShareToken === null
      ? query.is("share_token", null)
      : query.eq("share_token", snapshot.sourceShareToken);

  const { data, error } = await query
    .select("id")
    .maybeSingle();

  if (error) {
    throw new ReportPublishSnapshotError(
      "DATABASE_ERROR",
      error.message || "The report snapshot could not be published.",
      { cause: error },
    );
  }

  if (!data) {
    throw new ReportPublishSnapshotError(
      "PUBLISH_CONFLICT",
      "The report source snapshot changed before publish commit.",
    );
  }

  return {
    shareToken,
    publishedAt: includePublishedAt ? now : null,
    publishedIngestionId: snapshot.currentIngestionId,
    publishedCreativesBatchId: snapshot.currentCreativesBatchId,
    publishedPeriodStart: snapshot.draftPeriodStart,
    publishedPeriodEnd: snapshot.draftPeriodEnd,
  };
}
