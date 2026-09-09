import {
  isValidYmd,
  type SafeMediaSyncJob,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const NAVER_DAILY_DATA_LEVEL =
  "keyword" as const;

const NAVER_DAILY_MODE =
  "snapshot_replace" as const;

const SEOUL_TIME_ZONE =
  "Asia/Seoul" as const;

const MILLISECONDS_PER_DAY =
  86_400_000;

const MAX_REQUIRED_ID_LENGTH =
  200;

const PARTITION_PAGE_SIZE =
  1_000;

export type NaverDailySchedulerConfig = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  continuityStartDate: string;
};

export type NaverDailySchedulerAction =
  | "noop_existing_done"
  | "noop_existing_active"
  | "noop_target_already_covered"
  | "created_or_replayed";

export type NaverDailySchedulerResult = {
  targetDate: string;
  jobId: string;
  action: NaverDailySchedulerAction;
  status:
    | "pending"
    | "processing"
    | "done";
};

export type NaverDailySchedulerErrorCode =
  | "INVALID_INPUT"
  | "DATABASE_ERROR"
  | "INVALID_JOB_RECORD"
  | "CONTINUITY_INVALID"
  | "BLOCK_HISTORY_GAP"
  | "EXACT_JOB_SCOPE_MISMATCH"
  | "EXACT_JOB_FAILED"
  | "OTHER_ACTIVE_NAVER_JOB"
  | "CREATE_RESULT_SCOPE_MISMATCH"
  | "CREATE_RESULT_FAILED"
  | "INVALID_JOB_STATUS";

export class NaverDailySchedulerError
  extends Error {
  readonly code:
    NaverDailySchedulerErrorCode;

  constructor(
    code:
      NaverDailySchedulerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverDailySchedulerError";

    this.code =
      code;
  }
}

type DailyCreateInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  date: string;
  dataLevel: "keyword";
};

type PartitionCoverageInput = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  dateFrom: string;
  dateTo: string;
};

export type NaverDailySchedulerDependencies = {
  buildJobId: (
    input: {
      reportId: string;
      connectionId: string;
      date: string;
    },
  ) => Promise<string>;

  loadPartitionCoverage: (
    input:
      PartitionCoverageInput,
  ) => Promise<string[]>;

  loadExactJob: (
    jobId: string,
  ) => Promise<SafeMediaSyncJob | null>;

  listActiveNaverJobs: (
  ) => Promise<SafeMediaSyncJob[]>;

  createJob: (
    input: DailyCreateInput,
  ) => Promise<SafeMediaSyncJob>;
};

export type RunNaverDailySchedulerOnceInput = {
  config:
    NaverDailySchedulerConfig;

  now?: Date;

  dependencies?:
    Partial<NaverDailySchedulerDependencies>;
};

function requireIdentity(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length >
      MAX_REQUIRED_ID_LENGTH
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_INPUT",
      `${fieldName} is invalid.`,
    );
  }

  return value.trim();
}

function requireYmd(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    !isValidYmd(
      normalized,
    )
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_INPUT",
      `${fieldName} must be a valid YYYY-MM-DD date.`,
    );
  }

  return normalized;
}

function requireValidDate(
  value: unknown,
  fieldName: string,
): Date {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(
      value.getTime(),
    )
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_INPUT",
      `${fieldName} must be a valid Date.`,
    );
  }

  return value;
}

function getSeoulCalendarParts(
  now: Date,
): {
  year: number;
  month: number;
  day: number;
} {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          SEOUL_TIME_ZONE,
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
      },
    ).formatToParts(
      now,
    );

  const map =
    new Map(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  const year =
    Number(
      map.get("year"),
    );

  const month =
    Number(
      map.get("month"),
    );

  const day =
    Number(
      map.get("day"),
    );

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_INPUT",
      "Asia/Seoul calendar date could not be resolved.",
    );
  }

  return {
    year,
    month,
    day,
  };
}

function toUtcYmd(
  date: Date,
): string {
  const year =
    String(
      date.getUTCFullYear(),
    ).padStart(
      4,
      "0",
    );

  const month =
    String(
      date.getUTCMonth() + 1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      date.getUTCDate(),
    ).padStart(
      2,
      "0",
    );

  return [
    year,
    month,
    day,
  ].join("-");
}

function parseYmdUtc(
  value: string,
): number {
  const [
    yearText,
    monthText,
    dayText,
  ] = value.split("-");

  return Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
  );
}

function enumerateDates(
  dateFrom: string,
  dateTo: string,
): string[] {
  const fromMs =
    parseYmdUtc(
      dateFrom,
    );

  const toMs =
    parseYmdUtc(
      dateTo,
    );

  if (
    toMs < fromMs
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_INPUT",
      "continuityStartDate must not be after the target date.",
    );
  }

  const dates: string[] = [];

  for (
    let cursor = fromMs;
    cursor <= toMs;
    cursor += MILLISECONDS_PER_DAY
  ) {
    dates.push(
      toUtcYmd(
        new Date(cursor),
      ),
    );
  }

  return dates;
}

export function getPreviousCompletedSeoulCalendarDate(
  now = new Date(),
): string {
  const validNow =
    requireValidDate(
      now,
      "now",
    );

  const {
    year,
    month,
    day,
  } =
    getSeoulCalendarParts(
      validNow,
    );

  const seoulCalendarDayAsUtc =
    Date.UTC(
      year,
      month - 1,
      day,
    );

  return toUtcYmd(
    new Date(
      seoulCalendarDayAsUtc -
        MILLISECONDS_PER_DAY,
    ),
  );
}

function normalizeConfig(
  config:
    NaverDailySchedulerConfig,
): NaverDailySchedulerConfig {
  return {
    reportId:
      requireIdentity(
        config.reportId,
        "reportId",
      ),

    connectionId:
      requireIdentity(
        config.connectionId,
        "connectionId",
      ),

    workspaceId:
      requireIdentity(
        config.workspaceId,
        "workspaceId",
      ),

    advertiserId:
      requireIdentity(
        config.advertiserId,
        "advertiserId",
      ),

    createdBy:
      requireIdentity(
        config.createdBy,
        "createdBy",
      ),

    continuityStartDate:
      requireYmd(
        config.continuityStartDate,
        "continuityStartDate",
      ),
  };
}

function assertExpectedScope(
  input: {
    job: SafeMediaSyncJob;
    config:
      NaverDailySchedulerConfig;
    jobId: string;
    targetDate: string;
    errorCode:
      | "EXACT_JOB_SCOPE_MISMATCH"
      | "CREATE_RESULT_SCOPE_MISMATCH";
  },
): void {
  const {
    job,
    config,
    jobId,
    targetDate,
    errorCode,
  } =
    input;

  const matches =
    job.id ===
      jobId &&
    job.report_id ===
      config.reportId &&
    job.connection_id ===
      config.connectionId &&
    job.workspace_id ===
      config.workspaceId &&
    job.advertiser_id ===
      config.advertiserId &&
    job.provider ===
      NAVER_SEARCH_ADS_PROVIDER &&
    job.date_from ===
      targetDate &&
    job.date_to ===
      targetDate &&
    job.data_level ===
      NAVER_DAILY_DATA_LEVEL &&
    job.mode ===
      NAVER_DAILY_MODE &&
    job.created_by ===
      config.createdBy;

  if (!matches) {
    throw new NaverDailySchedulerError(
      errorCode,
      "The deterministic daily job does not match the scheduler scope.",
    );
  }
}

function toNoopResult(
  input: {
    job: SafeMediaSyncJob;
    jobId: string;
    targetDate: string;
  },
): NaverDailySchedulerResult {
  const {
    job,
    jobId,
    targetDate,
  } =
    input;

  if (
    job.status ===
    "done"
  ) {
    throw new NaverDailySchedulerError(
      "CONTINUITY_INVALID",
      "The deterministic daily job is done but its target fact partition is missing.",
    );
  }

  if (
    job.status ===
      "pending" ||
    job.status ===
      "processing"
  ) {
    return {
      targetDate,
      jobId,
      action:
        "noop_existing_active",
      status:
        job.status,
    };
  }

  if (
    job.status ===
    "failed"
  ) {
    throw new NaverDailySchedulerError(
      "EXACT_JOB_FAILED",
      "The deterministic daily job is failed. Automatic retry is forbidden.",
    );
  }

  throw new NaverDailySchedulerError(
    "INVALID_JOB_STATUS",
    "The deterministic daily job has an unsupported status.",
  );
}

function normalizeCoveredDates(
  input: {
    dates: string[];
    dateFrom: string;
    dateTo: string;
  },
): Set<string> {
  if (
    !Array.isArray(
      input.dates,
    )
  ) {
    throw new NaverDailySchedulerError(
      "CONTINUITY_INVALID",
      "The Naver fact partition coverage query returned an invalid result.",
    );
  }

  const covered =
    new Set<string>();

  for (
    const value of input.dates
  ) {
    if (
      typeof value !== "string" ||
      !isValidYmd(value) ||
      value < input.dateFrom ||
      value > input.dateTo ||
      covered.has(value)
    ) {
      throw new NaverDailySchedulerError(
        "CONTINUITY_INVALID",
        "The Naver fact partition coverage contains an invalid, out-of-range, or duplicate date.",
      );
    }

    covered.add(value);
  }

  return covered;
}

async function defaultBuildJobId(
  input: {
    reportId: string;
    connectionId: string;
    date: string;
  },
): Promise<string> {
  const daily =
    await import(
      "./naver-searchads-daily-incremental"
    );

  return daily
    .buildNaverDailyIncrementalJobId(
      input,
    );
}

async function defaultLoadPartitionCoverage(
  input:
    PartitionCoverageInput,
): Promise<string[]> {
  const admin =
    await import(
      "../supabase/admin"
    );

  const supabase =
    admin.getSupabaseAdmin();

  const {
    data: connectionRows,
    error: connectionError,
  } =
    await supabase
      .from(
        "media_connections",
      )
      .select(
        "id,external_account_id",
      )
      .eq(
        "id",
        input.connectionId,
      )
      .eq(
        "workspace_id",
        input.workspaceId,
      )
      .eq(
        "advertiser_id",
        input.advertiserId,
      )
      .eq(
        "provider",
        NAVER_SEARCH_ADS_PROVIDER,
      )
      .limit(2);

  if (connectionError) {
    throw new NaverDailySchedulerError(
      "DATABASE_ERROR",
      "The Naver continuity connection could not be loaded.",
      {
        cause:
          connectionError,
      },
    );
  }

  if (
    !Array.isArray(connectionRows) ||
    connectionRows.length !== 1
  ) {
    throw new NaverDailySchedulerError(
      "CONTINUITY_INVALID",
      "The Naver continuity connection scope is invalid.",
    );
  }

  const connection =
    connectionRows[0] as
      Record<string, unknown>;

  const externalAccountId =
    typeof connection.external_account_id ===
      "string"
      ? connection.external_account_id.trim()
      : "";

  if (!externalAccountId) {
    throw new NaverDailySchedulerError(
      "CONTINUITY_INVALID",
      "The Naver continuity connection external account is invalid.",
    );
  }

  const dates: string[] = [];

  for (
    let offset = 0;
    ;
    offset += PARTITION_PAGE_SIZE
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          "media_sync_fact_partitions",
        )
        .select(
          "date",
        )
        .eq(
          "workspace_id",
          input.workspaceId,
        )
        .eq(
          "advertiser_id",
          input.advertiserId,
        )
        .eq(
          "provider",
          NAVER_SEARCH_ADS_PROVIDER,
        )
        .eq(
          "external_account_id",
          externalAccountId,
        )
        .gte(
          "date",
          input.dateFrom,
        )
        .lte(
          "date",
          input.dateTo,
        )
        .order(
          "date",
          {
            ascending:
              true,
          },
        )
        .range(
          offset,
          offset +
            PARTITION_PAGE_SIZE -
            1,
        );

    if (error) {
      throw new NaverDailySchedulerError(
        "DATABASE_ERROR",
        "The Naver fact partition continuity could not be loaded.",
        {
          cause:
            error,
        },
      );
    }

    if (
      !Array.isArray(data)
    ) {
      throw new NaverDailySchedulerError(
        "CONTINUITY_INVALID",
        "The Naver fact partition continuity query returned an invalid result.",
      );
    }

    for (
      const row of data
    ) {
      const date =
        row &&
        typeof row === "object" &&
        typeof (
          row as Record<string, unknown>
        ).date === "string"
          ? String(
              (
                row as Record<string, unknown>
              ).date,
            )
          : "";

      dates.push(date);
    }

    if (
      data.length <
      PARTITION_PAGE_SIZE
    ) {
      break;
    }
  }

  return dates;
}

async function defaultLoadExactJob(
  jobId: string,
): Promise<SafeMediaSyncJob | null> {
  const [
    admin,
    repository,
  ] =
    await Promise.all([
      import(
        "../supabase/admin"
      ),
      import(
        "./media-sync-jobs-repository"
      ),
    ]);

  const supabase =
    admin.getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "media_sync_jobs",
      )
      .select("*")
      .eq(
        "id",
        jobId,
      )
      .limit(2);

  if (error) {
    throw new NaverDailySchedulerError(
      "DATABASE_ERROR",
      "The deterministic daily job could not be loaded.",
      {
        cause:
          error,
      },
    );
  }

  if (
    !Array.isArray(data) ||
    data.length > 1
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_JOB_RECORD",
      "The deterministic daily job query returned an invalid result.",
    );
  }

  if (
    data.length ===
    0
  ) {
    return null;
  }

  try {
    return repository
      .parseMediaSyncJobRecord(
        data[0],
      );
  } catch (
    error
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_JOB_RECORD",
      "The deterministic daily job record is invalid.",
      {
        cause:
          error,
      },
    );
  }
}

async function defaultListActiveNaverJobs(
): Promise<SafeMediaSyncJob[]> {
  const [
    admin,
    repository,
  ] =
    await Promise.all([
      import(
        "../supabase/admin"
      ),
      import(
        "./media-sync-jobs-repository"
      ),
    ]);

  const supabase =
    admin.getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "media_sync_jobs",
      )
      .select("*")
      .eq(
        "provider",
        NAVER_SEARCH_ADS_PROVIDER,
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
      .limit(100);

  if (error) {
    throw new NaverDailySchedulerError(
      "DATABASE_ERROR",
      "Active Naver jobs could not be loaded.",
      {
        cause:
          error,
      },
    );
  }

  if (
    !Array.isArray(data)
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_JOB_RECORD",
      "The active Naver job query returned an invalid result.",
    );
  }

  try {
    return data.map(
      (row) =>
        repository
          .parseMediaSyncJobRecord(
            row,
          ),
    );
  } catch (
    error
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_JOB_RECORD",
      "An active Naver job record is invalid.",
      {
        cause:
          error,
      },
    );
  }
}

async function defaultCreateJob(
  input:
    DailyCreateInput,
): Promise<SafeMediaSyncJob> {
  const daily =
    await import(
      "./naver-searchads-daily-incremental"
    );

  return daily
    .createNaverDailyIncrementalJob(
      input,
    );
}

function buildDependencies(
  overrides:
    Partial<NaverDailySchedulerDependencies> =
      {},
): NaverDailySchedulerDependencies {
  return {
    buildJobId:
      overrides.buildJobId ??
      defaultBuildJobId,

    loadPartitionCoverage:
      overrides.loadPartitionCoverage ??
      defaultLoadPartitionCoverage,

    loadExactJob:
      overrides.loadExactJob ??
      defaultLoadExactJob,

    listActiveNaverJobs:
      overrides.listActiveNaverJobs ??
      defaultListActiveNaverJobs,

    createJob:
      overrides.createJob ??
      defaultCreateJob,
  };
}

export async function runNaverDailySchedulerOnce(
  input:
    RunNaverDailySchedulerOnceInput,
): Promise<NaverDailySchedulerResult> {
  const config =
    normalizeConfig(
      input.config,
    );

  const targetDate =
    getPreviousCompletedSeoulCalendarDate(
      input.now ??
        new Date(),
    );

  const expectedDates =
    enumerateDates(
      config.continuityStartDate,
      targetDate,
    );

  const dependencies =
    buildDependencies(
      input.dependencies,
    );

  const jobId =
    await dependencies
      .buildJobId({
        reportId:
          config.reportId,
        connectionId:
          config.connectionId,
        date:
          targetDate,
      });

  requireIdentity(
    jobId,
    "jobId",
  );

  const coveredDates =
    normalizeCoveredDates({
      dates:
        await dependencies
          .loadPartitionCoverage({
            connectionId:
              config.connectionId,
            workspaceId:
              config.workspaceId,
            advertiserId:
              config.advertiserId,
            dateFrom:
              config.continuityStartDate,
            dateTo:
              targetDate,
          }),
      dateFrom:
        config.continuityStartDate,
      dateTo:
        targetDate,
    });

  if (
    coveredDates.has(
      targetDate,
    )
  ) {
    return {
      targetDate,
      jobId,
      action:
        "noop_target_already_covered",
      status:
        "done",
    };
  }

  const exactJob =
    await dependencies
      .loadExactJob(
        jobId,
      );

  if (
    exactJob
  ) {
    assertExpectedScope({
      job:
        exactJob,
      config,
      jobId,
      targetDate,
      errorCode:
        "EXACT_JOB_SCOPE_MISMATCH",
    });

    return toNoopResult({
      job:
        exactJob,
      jobId,
      targetDate,
    });
  }

  const historicalDates =
    expectedDates.slice(
      0,
      -1,
    );

  const missingHistoricalDates =
    historicalDates.filter(
      (date) =>
        !coveredDates.has(
          date,
        ),
    );

  if (
    missingHistoricalDates.length >
    0
  ) {
    const firstMissing =
      missingHistoricalDates
        .slice(0, 5)
        .join(",");

    throw new NaverDailySchedulerError(
      "BLOCK_HISTORY_GAP",
      `Historical Naver fact continuity is incomplete. Missing: ${firstMissing}.`,
    );
  }

  const activeJobs =
    await dependencies
      .listActiveNaverJobs();

  if (
    activeJobs.length >
    0
  ) {
    throw new NaverDailySchedulerError(
      "OTHER_ACTIVE_NAVER_JOB",
      "Another Naver job is active. Daily job creation is blocked.",
    );
  }

  const createdJob =
    await dependencies
      .createJob({
        reportId:
          config.reportId,
        connectionId:
          config.connectionId,
        workspaceId:
          config.workspaceId,
        advertiserId:
          config.advertiserId,
        createdBy:
          config.createdBy,
        date:
          targetDate,
        dataLevel:
          NAVER_DAILY_DATA_LEVEL,
      });

  assertExpectedScope({
    job:
      createdJob,
    config,
    jobId,
    targetDate,
    errorCode:
      "CREATE_RESULT_SCOPE_MISMATCH",
  });

  if (
    createdJob.status ===
    "failed"
  ) {
    throw new NaverDailySchedulerError(
      "CREATE_RESULT_FAILED",
      "The deterministic daily creator returned a failed job. Automatic retry is forbidden.",
    );
  }

  if (
    createdJob.status !==
      "pending" &&
    createdJob.status !==
      "processing" &&
    createdJob.status !==
      "done"
  ) {
    throw new NaverDailySchedulerError(
      "INVALID_JOB_STATUS",
      "The deterministic daily creator returned an unsupported status.",
    );
  }

  return {
    targetDate,
    jobId,
    action:
      "created_or_replayed",
    status:
      createdJob.status,
  };
}
