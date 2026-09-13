import {
  getSupabaseAdmin,
} from "../supabase/admin";
import {
  loadDailyReportV2ContiguousCoverage,
} from "./daily-report-v2-contiguous-coverage-repository";
import type {
  DailyReportV2SchedulerCandidate,
  DailyReportV2SchedulerDependencies,
} from "./daily-report-v2-scheduler";
import {
  createPendingDailyReportV2MediaSyncJob,
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import {
  isValidYmd,
  type SafeMediaSyncJob,
} from "./types";

const REPORTS_TABLE =
  "reports" as const;

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs" as const;

const DAILY_REPORT_V2_AUTOMATION_CONTRACT =
  "daily_report_v2" as const;

const DAILY_REPORT_V2_SCOPE =
  "all_mapped_supported_media" as const;

type UnknownRecord =
  Record<string, unknown>;

export type DailyReportV2SchedulerRepositoryErrorCode =
  | "DATABASE_ERROR"
  | "INVALID_REPORT"
  | "INVALID_RESULT";

export class DailyReportV2SchedulerRepositoryError
  extends Error {
  readonly code:
    DailyReportV2SchedulerRepositoryErrorCode;

  constructor(
    code:
      DailyReportV2SchedulerRepositoryErrorCode,
    message:
      string,
    options?:
      ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "DailyReportV2SchedulerRepositoryError";

    this.code =
      code;
  }
}

export type DailyReportV2SchedulerRepositoryGateway =
  Readonly<{
    listReportRows?: (
      input:
        Readonly<{
          targetDate:
            string;
        }>,
    ) => Promise<
      Readonly<{
        data:
          unknown;
        error:
          unknown;
      }>
    >;

    listActiveJobRows?: (
      input:
        Readonly<{
          reportId:
            string;
          workspaceId:
            string;
          advertiserId:
            string;
        }>,
    ) => Promise<
      Readonly<{
        data:
          unknown;
        error:
          unknown;
      }>
    >;

    loadExactJobRow?: (
      input:
        Readonly<{
          jobId:
            string;
        }>,
    ) => Promise<
      Readonly<{
        data:
          unknown;
        error:
          unknown;
      }>
    >;
  }>;

function isPlainObject(
  value:
    unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  );
}

function requireString(
  value:
    unknown,
  field:
    string,
): string {
  const normalized =
    typeof value ===
      "string"
      ? value.trim()
      : "";

  if (
    !normalized
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_REPORT",
      `${field} is invalid.`,
    );
  }

  return normalized;
}

function requireYmd(
  value:
    unknown,
  field:
    string,
): string {
  const normalized =
    requireString(
      value,
      field,
    );

  if (
    !isValidYmd(
      normalized,
    )
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_REPORT",
      `${field} must be YYYY-MM-DD.`,
    );
  }

  return normalized;
}

function parseCandidateRow(
  value:
    unknown,
): DailyReportV2SchedulerCandidate {
  if (
    !isPlainObject(
      value,
    )
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_REPORT",
      "Daily Report V2 candidate row is invalid.",
    );
  }

  const status =
    requireString(
      value.status,
      "report.status",
    );

  if (
    status !==
      "draft" &&
    status !==
      "ready"
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_REPORT",
      "Daily Report V2 candidate status is invalid.",
    );
  }

  if (
    !isPlainObject(
      value.meta,
    )
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_REPORT",
      "Daily Report V2 candidate meta is invalid.",
    );
  }

  const publicIdentity =
    isPlainObject(
      value.meta
        .public_identity,
    )
      ? value.meta
          .public_identity
      : null;

  const dataSource =
    isPlainObject(
      value.meta
        .data_source,
    )
      ? value.meta
          .data_source
      : null;

  const mediaSync =
    isPlainObject(
      value.meta
        .media_sync,
    )
      ? value.meta
          .media_sync
      : null;

  const autoSync =
    mediaSync &&
    isPlainObject(
      mediaSync.auto_sync,
    )
      ? mediaSync.auto_sync
      : null;

  if (
    dataSource?.kind !==
      "api" ||
    publicIdentity?.source_type !==
      "api" ||
    publicIdentity?.period_type !==
      "daily_sync" ||
    !autoSync ||
    autoSync.enabled !==
      true ||
    autoSync.contract !==
      DAILY_REPORT_V2_AUTOMATION_CONTRACT ||
    autoSync.scope !==
      DAILY_REPORT_V2_SCOPE
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_REPORT",
      "Report row does not match the Daily Report V2 canonical scheduler contract.",
    );
  }

  const identityStart =
    requireYmd(
      publicIdentity.period_key,
      "meta.public_identity.period_key",
    );

  const automationStart =
    requireYmd(
      autoSync.start_date,
      "meta.media_sync.auto_sync.start_date",
    );

  if (
    identityStart !==
      automationStart
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_REPORT",
      "Daily Report V2 canonical start-date authorities disagree.",
    );
  }

  return Object.freeze({
    reportId:
      requireString(
        value.id,
        "report.id",
      ),
    workspaceId:
      requireString(
        value.workspace_id,
        "report.workspace_id",
      ),
    advertiserId:
      requireString(
        value.advertiser_id,
        "report.advertiser_id",
      ),
    createdBy:
      requireString(
        value.created_by,
        "report.created_by",
      ),
    startDate:
      identityStart,
  });
}

async function defaultListReportRows(
  input:
    Readonly<{
      targetDate:
        string;
    }>,
) {
  if (
    !isValidYmd(
      input.targetDate,
    )
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_REPORT",
      "Daily Report V2 scheduler targetDate is invalid.",
    );
  }

  const supabase =
    getSupabaseAdmin();

  return await supabase
    .from(
      REPORTS_TABLE,
    )
    .select(
      [
        "id",
        "workspace_id",
        "advertiser_id",
        "created_by",
        "status",
        "meta",
      ].join(","),
    )
    .in(
      "status",
      [
        "draft",
        "ready",
      ],
    )
    .contains(
      "meta",
      {
        media_sync: {
          auto_sync: {
            enabled:
              true,
            contract:
              DAILY_REPORT_V2_AUTOMATION_CONTRACT,
          },
        },
      },
    )
    .order(
      "id",
      {
        ascending:
          true,
      },
    );
}

async function defaultListActiveJobRows(
  input:
    Readonly<{
      reportId:
        string;
      workspaceId:
        string;
      advertiserId:
        string;
    }>,
) {
  const supabase =
    getSupabaseAdmin();

  return await supabase
    .from(
      MEDIA_SYNC_JOBS_TABLE,
    )
    .select("*")
    .eq(
      "report_id",
      input.reportId,
    )
    .eq(
      "workspace_id",
      input.workspaceId,
    )
    .eq(
      "advertiser_id",
      input.advertiserId,
    )
    .in(
      "status",
      [
        "pending",
        "processing",
      ],
    )
    .order(
      "created_at",
      {
        ascending:
          true,
      },
    )
    .limit(
      2,
    );
}

async function defaultLoadExactJobRow(
  input:
    Readonly<{
      jobId:
        string;
    }>,
) {
  const supabase =
    getSupabaseAdmin();

  return await supabase
    .from(
      MEDIA_SYNC_JOBS_TABLE,
    )
    .select("*")
    .eq(
      "id",
      input.jobId,
    )
    .limit(
      2,
    );
}

function parseJobRows(
  value:
    unknown,
  label:
    string,
): SafeMediaSyncJob[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    throw new DailyReportV2SchedulerRepositoryError(
      "INVALID_RESULT",
      `${label} returned an invalid result.`,
    );
  }

  return value.map(
    (
      row,
    ) =>
      parseMediaSyncJobRecord(
        row,
      ),
  );
}

export function createDailyReportV2SchedulerDatabaseDependencies(
  gateway:
    DailyReportV2SchedulerRepositoryGateway = {},
): DailyReportV2SchedulerDependencies {
  const listReportRows =
    gateway.listReportRows ??
    defaultListReportRows;

  const listActiveJobRows =
    gateway.listActiveJobRows ??
    defaultListActiveJobRows;

  const loadExactJobRow =
    gateway.loadExactJobRow ??
    defaultLoadExactJobRow;

  return {
    listCandidates:
      async (
        input,
      ) => {
        const response =
          await listReportRows(
            input,
          );

        if (
          response.error
        ) {
          throw new DailyReportV2SchedulerRepositoryError(
            "DATABASE_ERROR",
            "Daily Report V2 scheduler candidates could not be loaded.",
            {
              cause:
                response.error,
            },
          );
        }

        if (
          !Array.isArray(
            response.data,
          )
        ) {
          throw new DailyReportV2SchedulerRepositoryError(
            "INVALID_RESULT",
            "Daily Report V2 scheduler candidate query returned an invalid result.",
          );
        }

        return response.data
          .map(
            parseCandidateRow,
          )
          .sort(
            (
              left,
              right,
            ) =>
              left.reportId
                .localeCompare(
                  right.reportId,
                ),
          );
      },

    loadCoverage:
      loadDailyReportV2ContiguousCoverage,

    listActiveJobsForReport:
      async (
        input,
      ) => {
        const response =
          await listActiveJobRows(
            input,
          );

        if (
          response.error
        ) {
          throw new DailyReportV2SchedulerRepositoryError(
            "DATABASE_ERROR",
            "Daily Report V2 active report jobs could not be loaded.",
            {
              cause:
                response.error,
            },
          );
        }

        return parseJobRows(
          response.data,
          "Daily Report V2 active job query",
        );
      },

    loadExactJob:
      async (
        jobId,
      ) => {
        const response =
          await loadExactJobRow({
            jobId,
          });

        if (
          response.error
        ) {
          throw new DailyReportV2SchedulerRepositoryError(
            "DATABASE_ERROR",
            "Daily Report V2 deterministic job could not be loaded.",
            {
              cause:
                response.error,
            },
          );
        }

        const rows =
          parseJobRows(
            response.data,
            "Daily Report V2 deterministic job query",
          );

        if (
          rows.length >
            1
        ) {
          throw new DailyReportV2SchedulerRepositoryError(
            "INVALID_RESULT",
            "Daily Report V2 deterministic job query returned duplicate rows.",
          );
        }

        return rows[0] ??
          null;
      },

    createJob:
      createPendingDailyReportV2MediaSyncJob,
  };
}
