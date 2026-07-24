// scripts/execute-exact-naver-production-recovery-materialization-only.ts

import { createHash } from "node:crypto";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  parseMediaSyncJobRecord,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  assertNaverSearchAdsCombinedStagingComplete,
  type MediaSyncStagingSummary,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  materializeMediaSyncSnapshot,
  MediaSyncSnapshotMaterializationError,
} from "../src/lib/media-sync/media-sync-snapshot-materialization-repository";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const CANDIDATE_JOB_ID =
  "4191baff-393f-4be8-bb38-31548d3ba051";

const SOURCE_JOB_ID =
  "9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7";

const REPORT_ID =
  "ea413950-4068-41e8-9ced-8355020d7e7d";

const WORKSPACE_ID =
  "27b1556f-9d42-496f-bd7e-5a59ebee71d4";

const ADVERTISER_ID =
  "da51e71a-01ce-42fb-a937-7af0b5f47786";

const CONNECTION_ID =
  "aba7d28f-ec85-49db-941a-fa5babe2af61";

const CURRENT_INGESTION_ID =
  "48401e55-55e5-4722-ba58-1ad2338eda04";

const PUBLISHED_INGESTION_ID =
  "6d74227e-8d3b-4782-b041-6915d1cc3b89";

const CLAIMED_AT =
  "2026-07-22 15:54:47.859002+00";

const CONFIRMATION_TOKEN =
  "7aa3be46fb606536de8c3bc9540a311426da8b203508cebeef1d2e93fd8668d2";

const REPAIRED_STAGING_FINGERPRINT =
  "1874890814e763dfe834ae0d97698157e707939ef5a213be8582a9bc264c35f1";

const SOURCE_IDENTITY_DIGEST =
  "ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40";

const EXPECTED_ROWS = 44_604;
const EXPECTED_SOURCE_ROWS = 44_514;

const EXPECTED_KEYWORD_ROWS = 43_310;
const EXPECTED_CREATIVE_ROWS = 1_244;
const EXPECTED_MIXED_ROWS = 50;

const EXPECTED_IMPRESSIONS = 7_075;
const EXPECTED_CLICKS = 1_183;
const EXPECTED_COST = 113_850;
const EXPECTED_CONVERSIONS = 67;
const EXPECTED_REVENUE = 12_729_300;

const EXPECTED_REPORT_INGESTIONS_BEFORE = 11;
const EXPECTED_TOTAL_REPORT_ROWS_BEFORE = 359_716;

const EXPECTED_CURRENT_DESCRIPTOR_ROWS = 118;
const EXPECTED_PUBLISHED_DESCRIPTOR_ROWS = 44_514;

const MATERIALIZATION_BATCH_SIZE = 2_000;
const DATABASE_PAGE_SIZE = 1_000;
const FINGERPRINT_BLOCK_SIZE = 10_000;

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const MEDIA_SYNC_STAGING_ROWS_TABLE =
  "media_sync_staging_rows";

const REPORTS_TABLE =
  "reports";

const REPORT_INGESTIONS_TABLE =
  "report_ingestions";

const REPORT_ROWS_TABLE =
  "report_rows";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

type UnknownRecord =
  Record<string, unknown>;

type ReportPointerState = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
};

type ReportIngestionDescriptor = {
  id: string;
  workspace_id: string;
  report_id: string;
  kind: string;
  status: string;
  csv_path: string | null;
  row_count: number;
  error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type SourceProof = {
  rows: number;
  minRowIndex: number | null;
  maxRowIndex: number | null;
  identityDigest: string;
};

type CandidateProof = {
  rows: number;
  minRowIndex: number | null;
  maxRowIndex: number | null;

  distinctWindowRowKeys: number;

  keywordRows: number;
  creativeRows: number;
  mixedRows: number;

  invalidFingerprintRows: number;
  scopeMismatchRows: number;
  canonicalMismatchRows: number;
  invalidGrainRows: number;
  overlapRows: number;

  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;

  contentFingerprint: string;
};

type SentinelSnapshot = {
  rowCount: number;
  snapshot: string;
};

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function stableJson(
  value: unknown,
): string {
  if (value === undefined) {
    return "null";
  }

  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableJson)
      .join(",")}]`;
  }

  const record =
    value as UnknownRecord;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
}

function sha256(
  value: string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return value;
}

function requireNullableString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null) {
    return null;
  }

  return requireString(
    value,
    fieldName,
  );
}

function requireInteger(
  value: unknown,
  fieldName: string,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return parsed;
}

function metricNumber(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed =
      Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function canonicalTimestamp(
  value: unknown,
  fieldName: string,
): string {
  const raw =
    requireString(
      value,
      fieldName,
    ).trim();

  const match =
    raw.match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/,
    );

  if (!match) {
    throw new Error(
      `INVALID_${fieldName.toUpperCase()}_TIMESTAMP`,
    );
  }

  const date =
    match[1];

  const time =
    match[2];

  const fraction =
    match[3] ?? "";

  const rawOffset =
    match[4];

  let offset: string;

  if (
    rawOffset === "Z" ||
    rawOffset === "+00" ||
    rawOffset === "+0000" ||
    rawOffset === "+00:00"
  ) {
    offset = "+00:00";
  } else if (
    /^[+-]\d{2}$/.test(rawOffset)
  ) {
    offset =
      `${rawOffset}:00`;
  } else if (
    /^[+-]\d{4}$/.test(rawOffset)
  ) {
    offset =
      `${rawOffset.slice(0, 3)}:${rawOffset.slice(3)}`;
  } else {
    offset =
      rawOffset;
  }

  return `${date}T${time}${fraction}${offset}`;
}

function readExactArguments(): void {
  const [
    candidateJobId,
    confirmationToken,
    ...extra
  ] = process.argv
    .slice(2)
    .map(
      (value) =>
        value.trim(),
    );

  if (
    !candidateJobId ||
    !confirmationToken ||
    extra.length > 0
  ) {
    throw new Error(
      "Usage: node --env-file=.env.local --import tsx ./scripts/execute-exact-naver-production-recovery-materialization-only.ts <candidate-job-id> <confirmation-token>",
    );
  }

  if (
    candidateJobId !==
      CANDIDATE_JOB_ID ||
    confirmationToken !==
      CONFIRMATION_TOKEN
  ) {
    throw new Error(
      "EXACT_MATERIALIZATION_CONFIRMATION_MISMATCH",
    );
  }
}

function readNestedRecord(
  value: unknown,
  key: string,
): UnknownRecord {
  if (!isPlainObject(value)) {
    throw new Error(
      `INVALID_${key.toUpperCase()}_PARENT`,
    );
  }

  const nested =
    value[key];

  if (!isPlainObject(nested)) {
    throw new Error(
      `INVALID_${key.toUpperCase()}`,
    );
  }

  return nested;
}

function requireRecoveryValue(
  recovery: UnknownRecord,
  key: string,
  expected: string,
): void {
  if (
    String(
      recovery[key] ?? "",
    ) !== expected
  ) {
    throw new Error(
      `INVALID_RECOVERY_${key.toUpperCase()}`,
    );
  }
}

async function loadJob(
  jobId: string,
): Promise<MediaSyncJobRecord> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        MEDIA_SYNC_JOBS_TABLE,
      )
      .select("*")
      .eq(
        "id",
        jobId,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    throw new Error(
      "JOB_LOAD_FAILED",
      {
        cause:
          error ?? undefined,
      },
    );
  }

  return parseMediaSyncJobRecord(
    data,
  );
}

async function loadReportPointers():
Promise<ReportPointerState> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(REPORTS_TABLE)
      .select(
        "current_ingestion_id, published_ingestion_id",
      )
      .eq(
        "id",
        REPORT_ID,
      )
      .eq(
        "workspace_id",
        WORKSPACE_ID,
      )
      .eq(
        "advertiser_id",
        ADVERTISER_ID,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    throw new Error(
      "REPORT_POINTER_LOAD_FAILED",
      {
        cause:
          error ?? undefined,
      },
    );
  }

  return {
    currentIngestionId:
      data.current_ingestion_id ??
      null,

    publishedIngestionId:
      data.published_ingestion_id ??
      null,
  };
}

async function requireExactActiveJob():
Promise<void> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        MEDIA_SYNC_JOBS_TABLE,
      )
      .select(
        "id, status",
      )
      .eq(
        "report_id",
        REPORT_ID,
      )
      .in(
        "status",
        [
          "pending",
          "processing",
        ],
      );

  if (
    error ||
    !Array.isArray(data)
  ) {
    throw new Error(
      "ACTIVE_JOB_SCOPE_LOAD_FAILED",
      {
        cause:
          error ?? undefined,
      },
    );
  }

  if (
    data.length !== 1 ||
    data[0]?.id !==
      CANDIDATE_JOB_ID ||
    data[0]?.status !==
      PROCESSING_STATUS
  ) {
    throw new Error(
      "ACTIVE_JOB_SCOPE_MISMATCH",
    );
  }
}

function validateCandidatePrestate(
  job: MediaSyncJobRecord,
): {
  checkpointSnapshot: string;
  recoverySnapshot: string;
} {
  if (
    job.id !==
      CANDIDATE_JOB_ID ||
    job.report_id !==
      REPORT_ID ||
    job.workspace_id !==
      WORKSPACE_ID ||
    job.advertiser_id !==
      ADVERTISER_ID ||
    job.connection_id !==
      CONNECTION_ID ||
    job.provider !==
      NAVER_PROVIDER ||
    job.status !==
      PROCESSING_STATUS ||
    job.progress !== 99 ||
    job.attempt_count !== 12 ||
    job.raw_rows !==
      EXPECTED_ROWS ||
    job.normalized_rows !==
      EXPECTED_ROWS ||
    job.inserted_rows !==
      EXPECTED_ROWS ||
    job.failed_rows !== 0 ||
    job.previous_ingestion_id !==
      CURRENT_INGESTION_ID ||
    job.snapshot_ingestion_id !==
      null ||
    job.finished_at !==
      null ||
    job.error !==
      null
  ) {
    throw new Error(
      "CANDIDATE_PRESTATE_MISMATCH",
    );
  }

  const expectedClaimedAt =
    canonicalTimestamp(
      CLAIMED_AT,
      "claimed_at",
    );

  if (
    canonicalTimestamp(
      job.started_at,
      "started_at",
    ) !==
      expectedClaimedAt ||
    canonicalTimestamp(
      job.updated_at,
      "updated_at",
    ) !==
      expectedClaimedAt
  ) {
    throw new Error(
      "CANDIDATE_CLAIM_TIMESTAMP_MISMATCH",
    );
  }

  const checkpoint =
    readNestedRecord(
      job.error_detail,
      "processing_checkpoint",
    );

  const collector =
    readNestedRecord(
      checkpoint,
      "collector",
    );

  const keyword =
    readNestedRecord(
      collector,
      "keyword",
    );

  const authoritative =
    readNestedRecord(
      collector,
      "authoritative",
    );

  const recovery =
    readNestedRecord(
      checkpoint,
      "recovery",
    );

  if (
    String(
      checkpoint.version ?? "",
    ) !== "1" ||
    String(
      collector.combined_version ?? "",
    ) !== "1" ||
    String(
      collector.phase ?? "",
    ) !== "completed" ||
    String(
      collector.next_row_index ?? "",
    ) !==
      String(EXPECTED_ROWS) ||
    String(
      keyword.complete ?? "",
    ) !== "true" ||
    String(
      authoritative.complete ?? "",
    ) !== "true"
  ) {
    throw new Error(
      "COMPLETED_CHECKPOINT_MISMATCH",
    );
  }

  requireRecoveryValue(
    recovery,
    "contract_version",
    "2",
  );

  requireRecoveryValue(
    recovery,
    "source_job_id",
    SOURCE_JOB_ID,
  );

  requireRecoveryValue(
    recovery,
    "expected_current_ingestion_id",
    CURRENT_INGESTION_ID,
  );

  requireRecoveryValue(
    recovery,
    "expected_published_ingestion_id",
    PUBLISHED_INGESTION_ID,
  );

  requireRecoveryValue(
    recovery,
    "repair_kind",
    "brand_search_cross_grain_dedup_v1",
  );

  requireRecoveryValue(
    recovery,
    "repair_repaired_rows",
    String(EXPECTED_ROWS),
  );

  requireRecoveryValue(
    recovery,
    "repair_repaired_staging_fingerprint",
    REPAIRED_STAGING_FINGERPRINT,
  );

  requireRecoveryValue(
    recovery,
    "confirmation_token",
    CONFIRMATION_TOKEN,
  );

  return {
    checkpointSnapshot:
      stableJson(
        checkpoint,
      ),

    recoverySnapshot:
      stableJson(
        recovery,
      ),
  };
}

async function readReportIngestions():
Promise<ReportIngestionDescriptor[]> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        REPORT_INGESTIONS_TABLE,
      )
      .select(
        "id, workspace_id, report_id, kind, status, csv_path, row_count, error, created_by, created_at, updated_at",
      )
      .eq(
        "report_id",
        REPORT_ID,
      )
      .order(
        "id",
        {
          ascending: true,
        },
      );

  if (
    error ||
    !Array.isArray(data)
  ) {
    throw new Error(
      "REPORT_INGESTIONS_LOAD_FAILED",
      {
        cause:
          error ?? undefined,
      },
    );
  }

  return data.map(
    (
      item,
    ): ReportIngestionDescriptor => ({
      id:
        requireString(
          item.id,
          "ingestion_id",
        ),

      workspace_id:
        requireString(
          item.workspace_id,
          "ingestion_workspace_id",
        ),

      report_id:
        requireString(
          item.report_id,
          "ingestion_report_id",
        ),

      kind:
        requireString(
          item.kind,
          "ingestion_kind",
        ),

      status:
        requireString(
          item.status,
          "ingestion_status",
        ),

      csv_path:
        requireNullableString(
          item.csv_path,
          "ingestion_csv_path",
        ),

      row_count:
        requireInteger(
          item.row_count,
          "ingestion_row_count",
        ),

      error:
        requireNullableString(
          item.error,
          "ingestion_error",
        ),

      created_by:
        requireString(
          item.created_by,
          "ingestion_created_by",
        ),

      created_at:
        requireString(
          item.created_at,
          "ingestion_created_at",
        ),

      updated_at:
        requireString(
          item.updated_at,
          "ingestion_updated_at",
        ),
    }),
  );
}

function validateBaselineIngestions(
  rows:
    readonly ReportIngestionDescriptor[],
): void {
  if (
    rows.length !==
    EXPECTED_REPORT_INGESTIONS_BEFORE
  ) {
    throw new Error(
      "REPORT_INGESTION_COUNT_PRESTATE_MISMATCH",
    );
  }

  const current =
    rows.find(
      (row) =>
        row.id ===
        CURRENT_INGESTION_ID,
    );

  const published =
    rows.find(
      (row) =>
        row.id ===
        PUBLISHED_INGESTION_ID,
    );

  if (
    !current ||
    current.row_count !==
      EXPECTED_CURRENT_DESCRIPTOR_ROWS ||
    current.status !==
      "success" ||
    current.error !==
      null ||
    !published ||
    published.row_count !==
      EXPECTED_PUBLISHED_DESCRIPTOR_ROWS ||
    published.status !==
      "success" ||
    published.error !==
      null
  ) {
    throw new Error(
      "REPORT_INGESTION_DESCRIPTOR_PRESTATE_MISMATCH",
    );
  }
}

async function countReportRows(
  ingestionId?: string,
): Promise<number> {
  const supabase =
    getSupabaseAdmin();

  const result =
    ingestionId
      ? await supabase
          .from(
            REPORT_ROWS_TABLE,
          )
          .select(
            "id",
            {
              count: "exact",
              head: true,
            },
          )
          .eq(
            "report_id",
            REPORT_ID,
          )
          .eq(
            "ingestion_id",
            ingestionId,
          )
      : await supabase
          .from(
            REPORT_ROWS_TABLE,
          )
          .select(
            "id",
            {
              count: "exact",
              head: true,
            },
          )
          .eq(
            "report_id",
            REPORT_ID,
          );

  if (result.error) {
    throw new Error(
      "REPORT_ROWS_COUNT_FAILED",
      {
        cause:
          result.error,
      },
    );
  }

  return result.count ?? 0;
}

async function readSentinels(
  ingestionId: string,
  indexes:
    readonly number[],
): Promise<SentinelSnapshot> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(REPORT_ROWS_TABLE)
      .select(
        "id, row_index, row",
      )
      .eq(
        "report_id",
        REPORT_ID,
      )
      .eq(
        "ingestion_id",
        ingestionId,
      )
      .in(
        "row_index",
        [...indexes],
      )
      .order(
        "row_index",
        {
          ascending: true,
        },
      )
      .order(
        "id",
        {
          ascending: true,
        },
      );

  if (
    error ||
    !Array.isArray(data)
  ) {
    throw new Error(
      "SENTINEL_LOAD_FAILED",
      {
        cause:
          error ?? undefined,
      },
    );
  }

  return {
    rowCount:
      data.length,

    snapshot:
      stableJson(
        data,
      ),
  };
}

async function readSourceProof():
Promise<SourceProof> {
  const digest =
    createHash("sha256");

  let rows = 0;
  let minRowIndex:
    number | null = null;
  let maxRowIndex:
    number | null = null;

  for (
    let start = 0;
    ;
    start +=
      DATABASE_PAGE_SIZE
  ) {
    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          MEDIA_SYNC_STAGING_ROWS_TABLE,
        )
        .select(
          "row_index, date_window_index, date, row_key, row_fingerprint",
        )
        .eq(
          "job_id",
          SOURCE_JOB_ID,
        )
        .order(
          "row_index",
          {
            ascending: true,
          },
        )
        .order(
          "row_key",
          {
            ascending: true,
          },
        )
        .range(
          start,
          start +
            DATABASE_PAGE_SIZE -
            1,
        );

    if (
      error ||
      !Array.isArray(data)
    ) {
      throw new Error(
        "SOURCE_STAGING_LOAD_FAILED",
        {
          cause:
            error ?? undefined,
        },
      );
    }

    if (data.length === 0) {
      break;
    }

    for (const row of data) {
      const rowIndex =
        requireInteger(
          row.row_index,
          "source_row_index",
        );

      const windowIndex =
        requireInteger(
          row.date_window_index,
          "source_window_index",
        );

      const date =
        requireString(
          row.date,
          "source_date",
        );

      const rowKey =
        requireString(
          row.row_key,
          "source_row_key",
        );

      const fingerprint =
        requireString(
          row.row_fingerprint,
          "source_row_fingerprint",
        );

      if (rowIndex !== rows) {
        throw new Error(
          "SOURCE_ROW_INDEX_GAP",
        );
      }

      minRowIndex ??=
        rowIndex;

      maxRowIndex =
        rowIndex;

      rows += 1;

      digest.update(
        `[${rowIndex},${windowIndex},${JSON.stringify(date)},${JSON.stringify(rowKey)},${JSON.stringify(fingerprint)}]\n`,
        "utf8",
      );
    }

    if (
      data.length <
      DATABASE_PAGE_SIZE
    ) {
      break;
    }
  }

  return {
    rows,
    minRowIndex,
    maxRowIndex,
    identityDigest:
      digest.digest("hex"),
  };
}

async function readCandidateProof(
  materializedIngestionId?: string,
): Promise<CandidateProof> {
  const windowRowKeys =
    new Set<string>();

  const mixedCampaignIds =
    new Set<string>();

  const brandKeywordCampaignIds:
    string[] = [];

  const blockDescriptors:
    string[] = [];

  let blockIndex = -1;
  let blockRows = 0;
  let blockMin = 0;
  let blockMax = 0;

  let blockLines:
    string[] = [];

  let rows = 0;

  let minRowIndex:
    number | null = null;

  let maxRowIndex:
    number | null = null;

  let keywordRows = 0;
  let creativeRows = 0;
  let mixedRows = 0;

  let invalidFingerprintRows = 0;
  let scopeMismatchRows = 0;
  let canonicalMismatchRows = 0;
  let invalidGrainRows = 0;

  let impressions = 0;
  let clicks = 0;
  let cost = 0;
  let conversions = 0;
  let revenue = 0;

  const flushBlock =
    (): void => {
      if (blockRows === 0) {
        return;
      }

      blockDescriptors.push(
        `${blockIndex}:${blockRows}:${blockMin}:${blockMax}:${sha256(blockLines.join("\n"))}`,
      );

      blockRows = 0;
      blockLines = [];
    };

  for (
    let start = 0;
    start <
      EXPECTED_ROWS;
    start +=
      DATABASE_PAGE_SIZE
  ) {
    const end =
      Math.min(
        start +
          DATABASE_PAGE_SIZE -
          1,
        EXPECTED_ROWS - 1,
      );

    const stagingRequest =
      getSupabaseAdmin()
        .from(
          MEDIA_SYNC_STAGING_ROWS_TABLE,
        )
        .select(
          "row_index, date_window_index, date, channel, device, source, row_key, row_fingerprint, row, report_id, workspace_id, advertiser_id, connection_id, provider, external_account_id, date_from, date_to",
        )
        .eq(
          "job_id",
          CANDIDATE_JOB_ID,
        )
        .order(
          "row_index",
          {
            ascending: true,
          },
        )
        .range(
          start,
          end,
        );

    const reportRequest =
      materializedIngestionId
        ? getSupabaseAdmin()
            .from(
              REPORT_ROWS_TABLE,
            )
            .select(
              "report_id, workspace_id, advertiser_id, ingestion_id, row_index, date, channel, device, source, row",
            )
            .eq(
              "report_id",
              REPORT_ID,
            )
            .eq(
              "ingestion_id",
              materializedIngestionId,
            )
            .order(
              "row_index",
              {
                ascending: true,
              },
            )
            .range(
              start,
              end,
            )
        : null;

    const stagingResult =
      await stagingRequest;

    const reportResult =
      reportRequest
        ? await reportRequest
        : null;

    if (
      stagingResult.error ||
      !Array.isArray(
        stagingResult.data,
      ) ||
      (
        reportResult !== null &&
        (
          reportResult.error ||
          !Array.isArray(
            reportResult.data,
          )
        )
      )
    ) {
      throw new Error(
        "CANDIDATE_OR_MATERIALIZED_PAGE_LOAD_FAILED",
        {
          cause:
            stagingResult.error ??
            reportResult?.error ??
            undefined,
        },
      );
    }

    const expectedPageRows =
      end -
      start +
      1;

    if (
      stagingResult.data.length !==
        expectedPageRows ||
      (
        reportResult !== null &&
        reportResult.data.length !==
          expectedPageRows
      )
    ) {
      throw new Error(
        "CANDIDATE_OR_MATERIALIZED_PAGE_SIZE_MISMATCH",
      );
    }

    for (
      let offset = 0;
      offset <
        expectedPageRows;
      offset += 1
    ) {
      const staging =
        stagingResult.data[offset];

      const materialized =
        reportResult?.data[offset];

      if (
        !isPlainObject(
          staging.row,
        )
      ) {
        throw new Error(
          "INVALID_STAGING_CANONICAL_ROW",
        );
      }

      const row =
        staging.row;

      const expectedRowIndex =
        start + offset;

      const rowIndex =
        requireInteger(
          staging.row_index,
          "candidate_row_index",
        );

      const windowIndex =
        requireInteger(
          staging.date_window_index,
          "candidate_window_index",
        );

      const rowKey =
        requireString(
          staging.row_key,
          "candidate_row_key",
        );

      const rowFingerprint =
        requireString(
          staging.row_fingerprint,
          "candidate_row_fingerprint",
        );

      if (
        rowIndex !==
          expectedRowIndex
      ) {
        throw new Error(
          "CANDIDATE_ROW_INDEX_GAP",
        );
      }

      if (
        !/^[0-9a-f]{64}$/.test(
          rowFingerprint,
        )
      ) {
        invalidFingerprintRows += 1;
      }

      if (
        materialized !==
          undefined
      ) {
        if (
          !isPlainObject(
            materialized.row,
          ) ||
          materialized.report_id !==
            REPORT_ID ||
          materialized.workspace_id !==
            WORKSPACE_ID ||
          materialized.advertiser_id !==
            ADVERTISER_ID ||
          materialized.ingestion_id !==
            materializedIngestionId ||
          materialized.row_index !==
            rowIndex ||
          materialized.date !==
            staging.date ||
          materialized.channel !==
            staging.channel ||
          materialized.device !==
            staging.device ||
          materialized.source !==
            staging.source ||
          stableJson(
            materialized.row,
          ) !==
            stableJson(
              row,
            )
        ) {
          throw new Error(
            `MATERIALIZED_ROW_MISMATCH_AT_${rowIndex}`,
          );
        }
      }

      const nextBlockIndex =
        Math.floor(
          rowIndex /
          FINGERPRINT_BLOCK_SIZE,
        );

      if (
        nextBlockIndex !==
          blockIndex
      ) {
        flushBlock();

        blockIndex =
          nextBlockIndex;

        blockMin =
          rowIndex;
      }

      blockRows += 1;
      blockMax =
        rowIndex;

      blockLines.push(
        `${rowIndex}:${rowFingerprint}`,
      );

      minRowIndex ??=
        rowIndex;

      maxRowIndex =
        rowIndex;

      rows += 1;

      const uniqueWindowKey =
        `${windowIndex}\u0000${rowKey}`;

      if (
        windowRowKeys.has(
          uniqueWindowKey,
        )
      ) {
        throw new Error(
          "CANDIDATE_WINDOW_ROW_KEY_DUPLICATE",
        );
      }

      windowRowKeys.add(
        uniqueWindowKey,
      );

      if (
        staging.report_id !==
          REPORT_ID ||
        staging.workspace_id !==
          WORKSPACE_ID ||
        staging.advertiser_id !==
          ADVERTISER_ID ||
        staging.connection_id !==
          CONNECTION_ID ||
        staging.provider !==
          NAVER_PROVIDER
      ) {
        scopeMismatchRows += 1;
      }

      const date =
        String(
          staging.date ?? "",
        );

      if (
        String(
          row.date ?? "",
        ) !== date ||
        String(
          row.report_date ?? "",
        ) !== date ||
        String(
          row.day ?? "",
        ) !== date ||
        String(
          row.ymd ?? "",
        ) !== date ||
        String(
          row.channel ?? "",
        ) !==
          String(
            staging.channel ?? "",
          ) ||
        String(
          row.device ?? "",
        ) !==
          String(
            staging.device ?? "",
          ) ||
        String(
          row.source ?? "",
        ) !==
          String(
            staging.source ?? "",
          ) ||
        String(
          row.provider ?? "",
        ) !==
          NAVER_PROVIDER ||
        String(
          row.ingestion_source ?? "",
        ) !== "api" ||
        !rowKey.trim()
      ) {
        canonicalMismatchRows += 1;
      }

      const rowLevel =
        String(
          row.row_level ?? "",
        );

      const dataLevel =
        String(
          row.data_level ?? "",
        );

      const reason =
        String(
          row.row_level_reason ?? "",
        );

      if (rowLevel === "keyword") {
        keywordRows += 1;
      } else if (
        rowLevel === "creative"
      ) {
        creativeRows += 1;
      } else if (
        rowLevel === "mixed"
      ) {
        mixedRows += 1;
      }

      const validGrain =
        (
          rowLevel ===
            "keyword" &&
          dataLevel ===
            "keyword" &&
          reason ===
            "naver_searchad_registered_keyword_daily_stats"
        ) ||
        (
          rowLevel ===
            "creative" &&
          dataLevel ===
            "creative" &&
          reason ===
            "naver_searchad_shopping_ad_daily_stats"
        ) ||
        (
          rowLevel ===
            "mixed" &&
          dataLevel ===
            "mixed" &&
          reason ===
            "naver_searchad_brand_search_adgroup_daily_stats"
        );

      if (!validGrain) {
        invalidGrainRows += 1;
      }

      const campaignId =
        String(
          row.external_campaign_id ??
          "",
        ).trim();

      if (
        rowLevel === "mixed" &&
        reason ===
          "naver_searchad_brand_search_adgroup_daily_stats" &&
        campaignId
      ) {
        mixedCampaignIds.add(
          campaignId,
        );
      }

      const providerMeta =
        isPlainObject(
          row.provider_meta,
        )
          ? row.provider_meta
          : null;

      if (
        rowLevel === "keyword" &&
        reason ===
          "naver_searchad_registered_keyword_daily_stats" &&
        providerMeta
          ?.campaign_type ===
          "BRAND_SEARCH" &&
        campaignId
      ) {
        brandKeywordCampaignIds.push(
          campaignId,
        );
      }

      impressions +=
        metricNumber(
          row.impressions,
        );

      clicks +=
        metricNumber(
          row.clicks,
        );

      cost +=
        metricNumber(
          row.cost,
        );

      conversions +=
        metricNumber(
          row.conversions,
        );

      revenue +=
        metricNumber(
          row.revenue,
        );
    }
  }

  flushBlock();

  const overlapRows =
    brandKeywordCampaignIds
      .filter(
        (campaignId) =>
          mixedCampaignIds.has(
            campaignId,
          ),
      )
      .length;

  return {
    rows,
    minRowIndex,
    maxRowIndex,

    distinctWindowRowKeys:
      windowRowKeys.size,

    keywordRows,
    creativeRows,
    mixedRows,

    invalidFingerprintRows,
    scopeMismatchRows,
    canonicalMismatchRows,
    invalidGrainRows,
    overlapRows,

    impressions,
    clicks,
    cost,
    conversions,
    revenue,

    contentFingerprint:
      sha256(
        `chunked_sha256_v1:block_size=${FINGERPRINT_BLOCK_SIZE}\n${blockDescriptors.join("\n")}`,
      ),
  };
}

function validateCandidateProof(
  proof: CandidateProof,
): void {
  if (
    proof.rows !==
      EXPECTED_ROWS ||
    proof.minRowIndex !== 0 ||
    proof.maxRowIndex !==
      EXPECTED_ROWS - 1 ||
    proof.distinctWindowRowKeys !==
      EXPECTED_ROWS ||
    proof.keywordRows !==
      EXPECTED_KEYWORD_ROWS ||
    proof.creativeRows !==
      EXPECTED_CREATIVE_ROWS ||
    proof.mixedRows !==
      EXPECTED_MIXED_ROWS ||
    proof.invalidFingerprintRows !== 0 ||
    proof.scopeMismatchRows !== 0 ||
    proof.canonicalMismatchRows !== 0 ||
    proof.invalidGrainRows !== 0 ||
    proof.overlapRows !== 0 ||
    proof.impressions !==
      EXPECTED_IMPRESSIONS ||
    proof.clicks !==
      EXPECTED_CLICKS ||
    proof.cost !==
      EXPECTED_COST ||
    proof.conversions !==
      EXPECTED_CONVERSIONS ||
    proof.revenue !==
      EXPECTED_REVENUE ||
    proof.contentFingerprint !==
      REPAIRED_STAGING_FINGERPRINT
  ) {
    throw new Error(
      "CANDIDATE_OR_MATERIALIZED_PROOF_MISMATCH",
    );
  }
}

function validateCombinedSummary(
  summary:
    MediaSyncStagingSummary,
): void {
  if (
    !summary.isComplete ||
    summary.jobId !==
      CANDIDATE_JOB_ID ||
    summary.expectedRows !==
      EXPECTED_ROWS ||
    summary.totalRows !==
      EXPECTED_ROWS ||
    summary.minRowIndex !== 0 ||
    summary.maxRowIndex !==
      EXPECTED_ROWS - 1 ||
    summary.distinctRowIndexes !==
      EXPECTED_ROWS ||
    summary.rowsInExpectedRange !==
      EXPECTED_ROWS ||
    summary.missingExpectedRows !== 0 ||
    summary.outOfRangeRows !== 0 ||
    summary.scopeMismatchRows !== 0 ||
    summary.blankRowKeyRows !== 0 ||
    summary.missingFingerprintRows !== 0 ||
    summary.canonicalMismatchRows !== 0
  ) {
    throw new Error(
      "COMBINED_STAGING_SUMMARY_MISMATCH",
    );
  }
}

function comparableCandidateJob(
  job: MediaSyncJobRecord,
): UnknownRecord {
  const copy =
    {
      ...job,
    } as UnknownRecord;

  delete copy.updated_at;
  delete copy.snapshot_ingestion_id;

  return copy;
}

async function main():
Promise<void> {
  readExactArguments();

  console.log(
    "exact materialization mode:",
    "snapshot only; activation 0; finalization 0",
  );

  console.log(
    "candidate job id:",
    CANDIDATE_JOB_ID,
  );

  console.log(
    "materialization batch size:",
    MATERIALIZATION_BATCH_SIZE,
  );

  const candidateBefore =
    await loadJob(
      CANDIDATE_JOB_ID,
    );

  const sourceBefore =
    await loadJob(
      SOURCE_JOB_ID,
    );

  const {
    checkpointSnapshot,
    recoverySnapshot,
  } =
    validateCandidatePrestate(
      candidateBefore,
    );

  await requireExactActiveJob();

  const pointersBefore =
    await loadReportPointers();

  if (
    pointersBefore.currentIngestionId !==
      CURRENT_INGESTION_ID ||
    pointersBefore.publishedIngestionId !==
      PUBLISHED_INGESTION_ID
  ) {
    throw new Error(
      "REPORT_POINTER_PRESTATE_MISMATCH",
    );
  }

  const ingestionsBefore =
    await readReportIngestions();

  validateBaselineIngestions(
    ingestionsBefore,
  );

  const totalReportRowsBefore =
    await countReportRows();

  if (
    totalReportRowsBefore !==
    EXPECTED_TOTAL_REPORT_ROWS_BEFORE
  ) {
    throw new Error(
      "TOTAL_REPORT_ROWS_PRESTATE_MISMATCH",
    );
  }

  const [
    currentSentinelsBefore,
    publishedSentinelsBefore,
    sourceProofBefore,
    candidateProofBefore,
  ] =
    await Promise.all([
      readSentinels(
        CURRENT_INGESTION_ID,
        [
          0,
          58,
          117,
        ],
      ),

      readSentinels(
        PUBLISHED_INGESTION_ID,
        [
          0,
          22_256,
          44_513,
        ],
      ),

      readSourceProof(),

      readCandidateProof(),
    ]);

  if (
    currentSentinelsBefore.rowCount !== 3 ||
    publishedSentinelsBefore.rowCount !== 3
  ) {
    throw new Error(
      "SENTINEL_PRESTATE_MISMATCH",
    );
  }

  if (
    sourceProofBefore.rows !==
      EXPECTED_SOURCE_ROWS ||
    sourceProofBefore.minRowIndex !== 0 ||
    sourceProofBefore.maxRowIndex !==
      EXPECTED_SOURCE_ROWS - 1 ||
    sourceProofBefore.identityDigest !==
      SOURCE_IDENTITY_DIGEST
  ) {
    throw new Error(
      "SOURCE_PROOF_PRESTATE_MISMATCH",
    );
  }

  validateCandidateProof(
    candidateProofBefore,
  );

  const summary =
    await assertNaverSearchAdsCombinedStagingComplete({
      job:
        candidateBefore,

      expectedRows:
        EXPECTED_ROWS,
    });

  validateCombinedSummary(
    summary,
  );

  console.log(
    "preflight passed:",
    true,
  );

  const materialization =
    await materializeMediaSyncSnapshot({
      job:
        candidateBefore,

      summary,

      batchSize:
        MATERIALIZATION_BATCH_SIZE,
    });

  if (
    materialization.idempotent !==
      false ||
    materialization.rowCount !==
      EXPECTED_ROWS ||
    materialization.job.id !==
      CANDIDATE_JOB_ID ||
    materialization.job.status !==
      PROCESSING_STATUS ||
    materialization.job.progress !== 99 ||
    materialization.job.attempt_count !== 12 ||
    materialization.job.snapshot_ingestion_id !==
      materialization.snapshotIngestionId ||
    materialization.job.finished_at !==
      null ||
    materialization.job.error !==
      null ||
    materialization.stagingFingerprint !==
      materialization.materializedFingerprint
  ) {
    throw new Error(
      "MATERIALIZATION_RESULT_CONTRACT_MISMATCH",
    );
  }

  const snapshotIngestionId =
    materialization.snapshotIngestionId;

  const candidateAfter =
    await loadJob(
      CANDIDATE_JOB_ID,
    );

  const sourceAfter =
    await loadJob(
      SOURCE_JOB_ID,
    );

  const pointersAfter =
    await loadReportPointers();

  const ingestionsAfter =
    await readReportIngestions();

  const newIngestion =
    ingestionsAfter.find(
      (row) =>
        row.id ===
        snapshotIngestionId,
    );

  const existingIngestionsAfter =
    ingestionsAfter.filter(
      (row) =>
        row.id !==
        snapshotIngestionId,
    );

  if (
    ingestionsAfter.length !==
      EXPECTED_REPORT_INGESTIONS_BEFORE + 1 ||
    stableJson(
      existingIngestionsAfter,
    ) !==
      stableJson(
        ingestionsBefore,
      ) ||
    !newIngestion ||
    newIngestion.workspace_id !==
      WORKSPACE_ID ||
    newIngestion.report_id !==
      REPORT_ID ||
    newIngestion.kind !==
      "api" ||
    newIngestion.status !==
      "success" ||
    newIngestion.csv_path !==
      null ||
    newIngestion.row_count !==
      EXPECTED_ROWS ||
    newIngestion.error !==
      null ||
    newIngestion.created_by !==
      candidateBefore.created_by
  ) {
    throw new Error(
      "REPORT_INGESTION_POSTSTATE_MISMATCH",
    );
  }

  if (
    pointersAfter.currentIngestionId !==
      CURRENT_INGESTION_ID ||
    pointersAfter.publishedIngestionId !==
      PUBLISHED_INGESTION_ID ||
    stableJson(
      pointersAfter,
    ) !==
      stableJson(
        pointersBefore,
      )
  ) {
    throw new Error(
      "REPORT_POINTER_POSTSTATE_MISMATCH",
    );
  }

  const snapshotRowCount =
    await countReportRows(
      snapshotIngestionId,
    );

  if (
    snapshotRowCount !==
    EXPECTED_ROWS
  ) {
    throw new Error(
      "SNAPSHOT_REPORT_ROWS_COUNT_MISMATCH",
    );
  }

  const materializedProof =
    await readCandidateProof(
      snapshotIngestionId,
    );

  validateCandidateProof(
    materializedProof,
  );

  const [
    totalReportRowsAfter,
    currentSentinelsAfter,
    publishedSentinelsAfter,
    sourceProofAfter,
    candidateProofAfter,
  ] =
    await Promise.all([
      countReportRows(),

      readSentinels(
        CURRENT_INGESTION_ID,
        [
          0,
          58,
          117,
        ],
      ),

      readSentinels(
        PUBLISHED_INGESTION_ID,
        [
          0,
          22_256,
          44_513,
        ],
      ),

      readSourceProof(),

      readCandidateProof(),
    ]);

  validateCandidateProof(
    candidateProofAfter,
  );

  if (
    totalReportRowsAfter !==
      EXPECTED_TOTAL_REPORT_ROWS_BEFORE +
        EXPECTED_ROWS ||
    stableJson(
      currentSentinelsAfter,
    ) !==
      stableJson(
        currentSentinelsBefore,
      ) ||
    stableJson(
      publishedSentinelsAfter,
    ) !==
      stableJson(
        publishedSentinelsBefore,
      ) ||
    stableJson(
      sourceAfter,
    ) !==
      stableJson(
        sourceBefore,
      ) ||
    stableJson(
      sourceProofAfter,
    ) !==
      stableJson(
        sourceProofBefore,
      ) ||
    stableJson(
      candidateProofAfter,
    ) !==
      stableJson(
        candidateProofBefore,
      )
  ) {
    throw new Error(
      "PROTECTED_STATE_CHANGED",
    );
  }

  if (
    candidateAfter.status !==
      PROCESSING_STATUS ||
    candidateAfter.progress !== 99 ||
    candidateAfter.attempt_count !== 12 ||
    candidateAfter.snapshot_ingestion_id !==
      snapshotIngestionId ||
    candidateAfter.finished_at !==
      null ||
    candidateAfter.error !==
      null ||
    canonicalTimestamp(
      candidateAfter.started_at,
      "candidate_after_started_at",
    ) !==
      canonicalTimestamp(
        CLAIMED_AT,
        "claimed_at",
      ) ||
    stableJson(
      comparableCandidateJob(
        candidateAfter,
      ),
    ) !==
      stableJson(
        comparableCandidateJob(
          candidateBefore,
        ),
      )
  ) {
    throw new Error(
      "CANDIDATE_POSTSTATE_MISMATCH",
    );
  }

  const checkpointAfter =
    readNestedRecord(
      candidateAfter.error_detail,
      "processing_checkpoint",
    );

  const recoveryAfter =
    readNestedRecord(
      checkpointAfter,
      "recovery",
    );

  if (
    stableJson(
      checkpointAfter,
    ) !==
      checkpointSnapshot ||
    stableJson(
      recoveryAfter,
    ) !==
      recoverySnapshot
  ) {
    throw new Error(
      "CHECKPOINT_OR_RECOVERY_CHANGED",
    );
  }

  await requireExactActiveJob();

  console.log(
    JSON.stringify(
      {
        all_checks_passed:
          true,

        candidate_job_id:
          CANDIDATE_JOB_ID,

        status:
          candidateAfter.status,

        progress:
          candidateAfter.progress,

        attempt_count:
          candidateAfter.attempt_count,

        snapshot_ingestion_id:
          snapshotIngestionId,

        snapshot_ingestion_status:
          newIngestion.status,

        snapshot_ingestion_row_count:
          newIngestion.row_count,

        report_rows_created:
          snapshotRowCount,

        row_index_range:
          `0~${EXPECTED_ROWS - 1}`,

        keyword_rows:
          materializedProof.keywordRows,

        creative_rows:
          materializedProof.creativeRows,

        mixed_rows:
          materializedProof.mixedRows,

        impressions:
          materializedProof.impressions,

        clicks:
          materializedProof.clicks,

        cost:
          materializedProof.cost,

        conversions:
          materializedProof.conversions,

        revenue:
          materializedProof.revenue,

        repaired_staging_fingerprint:
          candidateProofAfter.contentFingerprint,

        materialized_content_fingerprint:
          materializedProof.contentFingerprint,

        content_fingerprint_matches:
          materializedProof.contentFingerprint ===
          REPAIRED_STAGING_FINGERPRINT,

        rpc_staging_fingerprint:
          materialization.stagingFingerprint,

        rpc_materialized_fingerprint:
          materialization.materializedFingerprint,

        rpc_fingerprints_match:
          materialization.stagingFingerprint ===
          materialization.materializedFingerprint,

        current_ingestion_id:
          pointersAfter.currentIngestionId,

        published_ingestion_id:
          pointersAfter.publishedIngestionId,

        report_pointers_unchanged:
          true,

        candidate_staging_unchanged:
          true,

        source_job_and_staging_unchanged:
          true,

        existing_report_ingestions_unchanged:
          true,

        current_published_sentinels_unchanged:
          true,

        activation_calls:
          0,

        finalization_calls:
          0,

        finished_at:
          candidateAfter.finished_at,

        error:
          candidateAfter.error,
      },
      null,
      2,
    ),
  );
}

main().catch(
  (
    error: unknown,
  ) => {
    const safeCode =
      error instanceof
        MediaSyncSnapshotMaterializationError
        ? error.code
        : error instanceof Error
          ? error.message
          : "EXACT_MATERIALIZATION_FAILED";

    console.error(
      "exact production recovery materialization failed:",
      safeCode,
    );

    console.error(
      "Do not rerun. Send this error output for read-only state inspection.",
    );

    process.exitCode = 1;
  },
);