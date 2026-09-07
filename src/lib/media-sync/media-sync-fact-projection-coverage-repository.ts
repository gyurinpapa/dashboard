import { getSupabaseAdmin } from "../supabase/admin";
import type { MediaSyncJobRecord } from "./types";

const REPORTS_TABLE = "reports" as const;
const FACT_PARTITIONS_TABLE = "media_sync_fact_partitions" as const;
const FACT_ROWS_TABLE = "media_sync_fact_rows" as const;
const NAVER_PROVIDER = "naver_searchad" as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type MediaSyncFactProjectionCoverageErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_PROVIDER"
  | "REPORT_NOT_FOUND"
  | "SCOPE_MISMATCH"
  | "PERIOD_INVALID"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT"
  | "FACT_COUNT_MISMATCH";

export class MediaSyncFactProjectionCoverageError extends Error {
  readonly code: MediaSyncFactProjectionCoverageErrorCode;

  constructor(
    code: MediaSyncFactProjectionCoverageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MediaSyncFactProjectionCoverageError";
    this.code = code;
  }
}

export type MediaSyncFactProjectionCoverageDependencies = {
  loadReport?: (input: {
    reportId: string;
    workspaceId: string;
    advertiserId: string;
  }) => Promise<{ data: unknown; error: unknown }>;

  loadPartitions?: (input: {
    workspaceId: string;
    advertiserId: string;
    provider: typeof NAVER_PROVIDER;
    externalAccountId: string;
    projectionStart: string;
    projectionEnd: string;
  }) => Promise<{ data: unknown; error: unknown }>;

  countFacts?: (input: {
    workspaceId: string;
    advertiserId: string;
    provider: typeof NAVER_PROVIDER;
    externalAccountId: string;
    projectionStart: string;
    projectionEnd: string;
  }) => Promise<{ count: unknown; error: unknown }>;
};

export type LoadMediaSyncFactProjectionCoverageInput = {
  job: MediaSyncJobRecord;
  reportId: string;
  dependencies?: MediaSyncFactProjectionCoverageDependencies;
};

export type MediaSyncFactProjectionCoverage = {
  reportId: string;
  projectionStart: string;
  projectionEnd: string;
  expectedDates: number;
  coveredDates: number;
  missingDates: string[];
  partitionRows: number;
  factRows: number;
  complete: boolean;
};

type UnknownRecord = Record<string, unknown>;

type ReportPeriodRecord = {
  id: unknown;
  workspace_id: unknown;
  advertiser_id: unknown;
  draft_period_start: unknown;
  draft_period_end: unknown;
  period_start: unknown;
  period_end: unknown;
  meta: unknown;
};

type PartitionRecord = {
  date: unknown;
  row_count: unknown;
};

function isPlainObject(value: unknown): value is UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  code: "INVALID_INPUT" | "INVALID_DATABASE_RESULT",
): string {
  if (typeof value !== "string") {
    throw new MediaSyncFactProjectionCoverageError(
      code,
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new MediaSyncFactProjectionCoverageError(
      code,
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [
    yearText,
    monthText,
    dayText,
  ] = value.split("-");

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const utcMs = Date.UTC(
    year,
    month - 1,
    day,
  );

  const date = new Date(utcMs);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeNullableDate(
  value: unknown,
  fieldName: string,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new MediaSyncFactProjectionCoverageError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a date string or null.`,
    );
  }

  const normalized = value.trim();

  if (!isValidDate(normalized)) {
    throw new MediaSyncFactProjectionCoverageError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} is not a valid YYYY-MM-DD date.`,
    );
  }

  return normalized;
}

function normalizeNonNegativeSafeInteger(
  value: unknown,
  fieldName: string,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 0
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return numeric;
}

function enumerateDates(
  start: string,
  end: string,
): string[] {
  if (
    !isValidDate(start) ||
    !isValidDate(end)
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "PERIOD_INVALID",
      "The projection period is invalid.",
    );
  }

  const startMs =
    Date.parse(`${start}T00:00:00.000Z`);

  const endMs =
    Date.parse(`${end}T00:00:00.000Z`);

  if (endMs < startMs) {
    throw new MediaSyncFactProjectionCoverageError(
      "PERIOD_INVALID",
      "The projection period end precedes its start.",
    );
  }

  const dates: string[] = [];

  for (
    let currentMs = startMs;
    currentMs <= endMs;
    currentMs += 86_400_000
  ) {
    dates.push(
      new Date(currentMs)
        .toISOString()
        .slice(0, 10),
    );
  }

  if (dates.length === 0) {
    throw new MediaSyncFactProjectionCoverageError(
      "PERIOD_INVALID",
      "The projection period must contain at least one date.",
    );
  }

  return dates;
}

function validateInput(
  input: LoadMediaSyncFactProjectionCoverageInput,
): string {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "INVALID_INPUT",
      "Projection coverage input is required.",
    );
  }

  if (
    !input.job ||
    typeof input.job !== "object"
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "INVALID_INPUT",
      "A media sync job is required.",
    );
  }

  if (
    input.job.provider !==
      NAVER_PROVIDER
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "UNSUPPORTED_PROVIDER",
      "Canonical fact projection coverage currently supports only Naver Search Ads.",
    );
  }

  normalizeRequiredString(
    input.job.workspace_id,
    "job.workspace_id",
    "INVALID_INPUT",
  );

  normalizeRequiredString(
    input.job.advertiser_id,
    "job.advertiser_id",
    "INVALID_INPUT",
  );

  normalizeRequiredString(
    input.job.external_account_id,
    "job.external_account_id",
    "INVALID_INPUT",
  );

  return normalizeRequiredString(
    input.reportId,
    "reportId",
    "INVALID_INPUT",
  );
}

async function loadReportRecord(
  input: LoadMediaSyncFactProjectionCoverageInput,
  reportId: string,
): Promise<ReportPeriodRecord> {
  let result: {
    data: unknown;
    error: unknown;
  };

  if (
    input.dependencies?.loadReport
  ) {
    result =
      await input.dependencies.loadReport({
        reportId,
        workspaceId:
          input.job.workspace_id,
        advertiserId:
          input.job.advertiser_id,
      });
  } else {
    const supabase =
      getSupabaseAdmin();

    result =
      await supabase
        .from(REPORTS_TABLE)
        .select(
          "id, workspace_id, advertiser_id, draft_period_start, draft_period_end, period_start, period_end, meta",
        )
        .eq("id", reportId)
        .eq(
          "workspace_id",
          input.job.workspace_id,
        )
        .eq(
          "advertiser_id",
          input.job.advertiser_id,
        )
        .maybeSingle();
  }

  if (result.error) {
    throw new MediaSyncFactProjectionCoverageError(
      "DATABASE_ERROR",
      "The report projection period could not be loaded.",
      { cause: result.error },
    );
  }

  if (result.data === null) {
    throw new MediaSyncFactProjectionCoverageError(
      "REPORT_NOT_FOUND",
      "The report projection target was not found in the media sync scope.",
    );
  }

  if (!isPlainObject(result.data)) {
    throw new MediaSyncFactProjectionCoverageError(
      "INVALID_DATABASE_RESULT",
      "The report projection period result is invalid.",
    );
  }

  return result.data as unknown as
    ReportPeriodRecord;
}

function parseProjectionPeriod(
  record: ReportPeriodRecord,
  input: LoadMediaSyncFactProjectionCoverageInput,
  reportId: string,
): {
  projectionStart: string;
  projectionEnd: string;
} {
  const returnedReportId =
    normalizeRequiredString(
      record.id,
      "report.id",
      "INVALID_DATABASE_RESULT",
    );

  const workspaceId =
    normalizeRequiredString(
      record.workspace_id,
      "report.workspace_id",
      "INVALID_DATABASE_RESULT",
    );

  const advertiserId =
    normalizeRequiredString(
      record.advertiser_id,
      "report.advertiser_id",
      "INVALID_DATABASE_RESULT",
    );

  if (
    returnedReportId !== reportId ||
    workspaceId !==
      input.job.workspace_id ||
    advertiserId !==
      input.job.advertiser_id
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "SCOPE_MISMATCH",
      "The report projection period scope does not match the media sync job.",
    );
  }

  const draftStart =
    normalizeNullableDate(
      record.draft_period_start,
      "report.draft_period_start",
    );

  const draftEnd =
    normalizeNullableDate(
      record.draft_period_end,
      "report.draft_period_end",
    );

  const periodStart =
    normalizeNullableDate(
      record.period_start,
      "report.period_start",
    );

  const periodEnd =
    normalizeNullableDate(
      record.period_end,
      "report.period_end",
    );

  const reportMeta =
    isPlainObject(record.meta)
      ? record.meta
      : {};

  const mediaSync =
    isPlainObject(reportMeta.media_sync)
      ? reportMeta.media_sync
      : {};

  const mediaSyncStart =
    normalizeNullableDate(
      mediaSync.date_from,
      "report.meta.media_sync.date_from",
    );

  const mediaSyncEnd =
    normalizeNullableDate(
      mediaSync.date_to,
      "report.meta.media_sync.date_to",
    );

  const projectionStart =
    draftStart ??
    periodStart ??
    mediaSyncStart;

  const projectionEnd =
    draftEnd ??
    periodEnd ??
    mediaSyncEnd;

  if (
    !projectionStart ||
    !projectionEnd
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "PERIOD_INVALID",
      "The report projection period is missing; job chunk dates are not a fallback.",
    );
  }

  enumerateDates(
    projectionStart,
    projectionEnd,
  );

  return {
    projectionStart,
    projectionEnd,
  };
}

async function loadPartitionRows(
  input: LoadMediaSyncFactProjectionCoverageInput,
  projectionStart: string,
  projectionEnd: string,
): Promise<PartitionRecord[]> {
  let result: {
    data: unknown;
    error: unknown;
  };

  if (
    input.dependencies?.loadPartitions
  ) {
    result =
      await input.dependencies
        .loadPartitions({
          workspaceId:
            input.job.workspace_id,
          advertiserId:
            input.job.advertiser_id,
          provider:
            NAVER_PROVIDER,
          externalAccountId:
            input.job.external_account_id,
          projectionStart,
          projectionEnd,
        });
  } else {
    const supabase =
      getSupabaseAdmin();

    result =
      await supabase
        .from(
          FACT_PARTITIONS_TABLE,
        )
        .select(
          "date, row_count",
        )
        .eq(
          "workspace_id",
          input.job.workspace_id,
        )
        .eq(
          "advertiser_id",
          input.job.advertiser_id,
        )
        .eq(
          "provider",
          NAVER_PROVIDER,
        )
        .eq(
          "external_account_id",
          input.job.external_account_id,
        )
        .gte(
          "date",
          projectionStart,
        )
        .lte(
          "date",
          projectionEnd,
        )
        .order(
          "date",
          { ascending: true },
        );
  }

  if (result.error) {
    throw new MediaSyncFactProjectionCoverageError(
      "DATABASE_ERROR",
      "Canonical fact partition coverage could not be loaded.",
      { cause: result.error },
    );
  }

  if (
    !Array.isArray(result.data)
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "INVALID_DATABASE_RESULT",
      "Canonical fact partition coverage returned an invalid result.",
    );
  }

  return result.data as
    PartitionRecord[];
}

async function countFactRows(
  input: LoadMediaSyncFactProjectionCoverageInput,
  projectionStart: string,
  projectionEnd: string,
): Promise<number> {
  let result: {
    count: unknown;
    error: unknown;
  };

  if (
    input.dependencies?.countFacts
  ) {
    result =
      await input.dependencies
        .countFacts({
          workspaceId:
            input.job.workspace_id,
          advertiserId:
            input.job.advertiser_id,
          provider:
            NAVER_PROVIDER,
          externalAccountId:
            input.job.external_account_id,
          projectionStart,
          projectionEnd,
        });
  } else {
    const supabase =
      getSupabaseAdmin();

    const response =
      await supabase
        .from(
          FACT_ROWS_TABLE,
        )
        .select(
          "id",
          {
            count: "exact",
            head: true,
          },
        )
        .eq(
          "workspace_id",
          input.job.workspace_id,
        )
        .eq(
          "advertiser_id",
          input.job.advertiser_id,
        )
        .eq(
          "provider",
          NAVER_PROVIDER,
        )
        .eq(
          "external_account_id",
          input.job.external_account_id,
        )
        .gte(
          "date",
          projectionStart,
        )
        .lte(
          "date",
          projectionEnd,
        );

    result = {
      count: response.count,
      error: response.error,
    };
  }

  if (result.error) {
    throw new MediaSyncFactProjectionCoverageError(
      "DATABASE_ERROR",
      "Canonical fact rows could not be counted.",
      { cause: result.error },
    );
  }

  return normalizeNonNegativeSafeInteger(
    result.count ?? 0,
    "fact_rows",
  );
}

export async function loadMediaSyncFactProjectionCoverage(
  input: LoadMediaSyncFactProjectionCoverageInput,
): Promise<MediaSyncFactProjectionCoverage> {
  const reportId =
    validateInput(input);

  const report =
    await loadReportRecord(
      input,
      reportId,
    );

  const {
    projectionStart,
    projectionEnd,
  } =
    parseProjectionPeriod(
      report,
      input,
      reportId,
    );

  const expectedDateList =
    enumerateDates(
      projectionStart,
      projectionEnd,
    );

  const expectedDateSet =
    new Set(
      expectedDateList,
    );

  const partitions =
    await loadPartitionRows(
      input,
      projectionStart,
      projectionEnd,
    );

  const coveredDateSet =
    new Set<string>();

  let partitionRows = 0;

  for (
    const partition
    of partitions
  ) {
    if (
      !isPlainObject(partition)
    ) {
      throw new MediaSyncFactProjectionCoverageError(
        "INVALID_DATABASE_RESULT",
        "A canonical fact partition row is invalid.",
      );
    }

    const date =
      normalizeNullableDate(
        partition.date,
        "partition.date",
      );

    if (
      !date ||
      !expectedDateSet.has(date) ||
      coveredDateSet.has(date)
    ) {
      throw new MediaSyncFactProjectionCoverageError(
        "INVALID_DATABASE_RESULT",
        "Canonical fact partition dates violate the projection coverage contract.",
      );
    }

    const rowCount =
      normalizeNonNegativeSafeInteger(
        partition.row_count,
        "partition.row_count",
      );

    coveredDateSet.add(date);

    partitionRows += rowCount;

    if (
      !Number.isSafeInteger(
        partitionRows,
      )
    ) {
      throw new MediaSyncFactProjectionCoverageError(
        "INVALID_DATABASE_RESULT",
        "Canonical fact partition row counts exceed the safe integer range.",
      );
    }
  }

  const missingDates =
    expectedDateList.filter(
      (date) =>
        !coveredDateSet.has(
          date,
        ),
    );

  const factRows =
    await countFactRows(
      input,
      projectionStart,
      projectionEnd,
    );

  if (
    factRows !== partitionRows
  ) {
    throw new MediaSyncFactProjectionCoverageError(
      "FACT_COUNT_MISMATCH",
      "Canonical fact row count does not match the durable partition row-count authority.",
    );
  }

  return {
    reportId,
    projectionStart,
    projectionEnd,
    expectedDates:
      expectedDateList.length,
    coveredDates:
      coveredDateSet.size,
    missingDates,
    partitionRows,
    factRows,
    complete:
      missingDates.length === 0,
  };
}
