import {
  NAVER_DAILY_REPORT_AUTO_SYNC_CONTRACT,
} from "./media-sync-automation";
import type {
  NaverDailyReportCandidate,
  NaverDailyReportSchedulerDependencies,
} from "./naver-searchads-daily-report-scheduler";
import {
  isValidYmd,
  type SafeMediaConnection,
  type SafeMediaSyncJob,
} from "./types";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PARTITION_PAGE_SIZE =
  1_000;

type UnknownRow =
  Record<string, unknown>;

type CandidateLookupInput = {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
};

type ConnectionLookupInput = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
};

type PartitionLookupInput = {
  workspaceId: string;
  advertiserId: string;
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
};

export type NaverDailyReportSchedulerRepositoryGateway = {
  listReportRows:
    () => Promise<unknown[]>;

  listReportConnectionIds:
    (
      input:
        CandidateLookupInput,
    ) => Promise<string[]>;

  getSafeConnection:
    (
      input:
        ConnectionLookupInput,
    ) => Promise<
      SafeMediaConnection | null
    >;

  listActiveNaverJobs:
    () => Promise<
      SafeMediaSyncJob[]
    >;

  listPartitionDates:
    (
      input:
        PartitionLookupInput,
    ) => Promise<string[]>;

  loadExactJob:
    (
      jobId: string,
    ) => Promise<
      SafeMediaSyncJob | null
    >;
};

export class NaverDailyReportSchedulerRepositoryError
  extends Error {
  readonly code:
    | "DATABASE_ERROR"
    | "INVALID_REPORT"
    | "INVALID_MAPPING"
    | "INVALID_CONNECTION"
    | "INVALID_RESULT";

  constructor(
    code:
      NaverDailyReportSchedulerRepositoryError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverDailyReportSchedulerRepositoryError";

    this.code =
      code;
  }
}

function isPlainObject(
  value: unknown,
): value is UnknownRow {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function requireString(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!normalized) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "INVALID_REPORT",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeYmd(
  value: unknown,
): string | null {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  return isValidYmd(
    normalized,
  )
    ? normalized
    : null;
}

function resolveReportPeriod(
  report:
    UnknownRow,
): {
  start: string;
  end: string;
} {
  const meta =
    isPlainObject(report.meta)
      ? report.meta
      : {};

  const mediaSync =
    isPlainObject(meta.media_sync)
      ? meta.media_sync
      : {};

  const start =
    normalizeYmd(
      report.draft_period_start,
    ) ??
    normalizeYmd(
      report.period_start,
    ) ??
    normalizeYmd(
      mediaSync.date_from,
    );

  const end =
    normalizeYmd(
      report.draft_period_end,
    ) ??
    normalizeYmd(
      report.period_end,
    ) ??
    normalizeYmd(
      mediaSync.date_to,
    );

  if (
    !start ||
    !end ||
    start > end
  ) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "INVALID_REPORT",
      "The automatic Daily report period is invalid.",
    );
  }

  return {
    start,
    end,
  };
}

function assertReportScopedContract(
  report:
    UnknownRow,
): void {
  const status =
    requireString(
      report.status,
      "report.status",
    );

  if (
    status !== "draft" &&
    status !== "ready"
  ) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "INVALID_REPORT",
      "The automatic Daily report status is invalid.",
    );
  }

  const meta =
    isPlainObject(report.meta)
      ? report.meta
      : {};

  const dataSource =
    isPlainObject(meta.data_source)
      ? meta.data_source
      : {};

  const mediaSync =
    isPlainObject(meta.media_sync)
      ? meta.media_sync
      : {};

  const autoSync =
    isPlainObject(
      mediaSync.auto_sync,
    )
      ? mediaSync.auto_sync
      : null;

  if (
    dataSource.kind !== "api" ||
    autoSync?.enabled !== true ||
    autoSync?.contract !==
      NAVER_DAILY_REPORT_AUTO_SYNC_CONTRACT
  ) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "INVALID_REPORT",
      "The report does not match the report-scoped Naver Daily contract.",
    );
  }
}

function assertVerifiedNaverConnection(
  input: {
    connection:
      SafeMediaConnection;
    expected:
      ConnectionLookupInput;
  },
): void {
  const {
    connection,
    expected,
  } = input;

  if (
    connection.id !==
      expected.connectionId ||
    connection.workspace_id !==
      expected.workspaceId ||
    connection.advertiser_id !==
      expected.advertiserId ||
    connection.provider !==
      NAVER_PROVIDER ||
    connection.status !==
      "active" ||
    connection.has_credentials !==
      true ||
    !(
      connection.last_verified_at ||
      connection.last_sync_at
    ) ||
    !connection.external_account_id
      .trim()
  ) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "INVALID_CONNECTION",
      "The mapped Naver connection is not safely usable for Daily automation.",
    );
  }
}

async function defaultListReportRows(
): Promise<unknown[]> {
  const admin =
    await import(
      "../supabase/admin"
    );

  const supabase =
    admin.getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from("reports")
      .select(
        [
          "id",
          "workspace_id",
          "advertiser_id",
          "created_by",
          "status",
          "draft_period_start",
          "draft_period_end",
          "period_start",
          "period_end",
          "meta",
        ].join(","),
      )
      .neq(
        "status",
        "archived",
      )
      .contains(
        "meta",
        {
          media_sync: {
            auto_sync: {
              enabled: true,
              contract:
                NAVER_DAILY_REPORT_AUTO_SYNC_CONTRACT,
            },
          },
        },
      )
      .order(
        "id",
        {
          ascending: true,
        },
      );

  if (error) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "DATABASE_ERROR",
      "Automatic Daily reports could not be loaded.",
      {
        cause:
          error,
      },
    );
  }

  if (!Array.isArray(data)) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "INVALID_RESULT",
      "Automatic Daily report query returned an invalid result.",
    );
  }

  return data;
}

async function defaultListReportConnectionIds(
  input:
    CandidateLookupInput,
): Promise<string[]> {
  const repository =
    await import(
      "./media-sync-jobs-repository"
    );

  return repository
    .listReportMediaConnectionIds(
      input,
    );
}

async function defaultGetSafeConnection(
  input:
    ConnectionLookupInput,
): Promise<
  SafeMediaConnection | null
> {
  const repository =
    await import(
      "./media-connections-repository"
    );

  return repository
    .getSafeMediaConnection(
      input,
    );
}

async function defaultListActiveNaverJobs(
): Promise<
  SafeMediaSyncJob[]
> {
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
        NAVER_PROVIDER,
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
          ascending: true,
        },
      )
      .limit(1);

  if (error) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "DATABASE_ERROR",
      "Active Naver jobs could not be loaded.",
      {
        cause:
          error,
      },
    );
  }

  if (!Array.isArray(data)) {
    throw new NaverDailyReportSchedulerRepositoryError(
      "INVALID_RESULT",
      "Active Naver job query returned an invalid result.",
    );
  }

  return data.map(
    (row) =>
      repository
        .parseMediaSyncJobRecord(
          row,
        ),
  );
}

async function defaultListPartitionDates(
  input:
    PartitionLookupInput,
): Promise<string[]> {
  const admin =
    await import(
      "../supabase/admin"
    );

  const supabase =
    admin.getSupabaseAdmin();

  const dates: string[] =
    [];

  for (
    let offset = 0;
    ;
    offset +=
      PARTITION_PAGE_SIZE
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          "media_sync_fact_partitions",
        )
        .select("date")
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
          NAVER_PROVIDER,
        )
        .eq(
          "external_account_id",
          input.externalAccountId,
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
            ascending: true,
          },
        )
        .range(
          offset,
          offset +
            PARTITION_PAGE_SIZE -
            1,
        );

    if (error) {
      throw new NaverDailyReportSchedulerRepositoryError(
        "DATABASE_ERROR",
        "Naver fact partition coverage could not be loaded.",
        {
          cause:
            error,
        },
      );
    }

    if (!Array.isArray(data)) {
      throw new NaverDailyReportSchedulerRepositoryError(
        "INVALID_RESULT",
        "Naver fact partition query returned an invalid result.",
      );
    }

    for (
      const row of data
    ) {
      if (
        !isPlainObject(row) ||
        typeof row.date !==
          "string"
      ) {
        throw new NaverDailyReportSchedulerRepositoryError(
          "INVALID_RESULT",
          "Naver fact partition query returned an invalid date row.",
        );
      }

      dates.push(
        row.date,
      );
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
): Promise<
  SafeMediaSyncJob | null
> {
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
    throw new NaverDailyReportSchedulerRepositoryError(
      "DATABASE_ERROR",
      "The deterministic Daily job could not be loaded.",
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
    throw new NaverDailyReportSchedulerRepositoryError(
      "INVALID_RESULT",
      "The deterministic Daily job query returned an invalid result.",
    );
  }

  if (
    data.length ===
    0
  ) {
    return null;
  }

  return repository
    .parseMediaSyncJobRecord(
      data[0],
    );
}

function buildGateway(
  overrides:
    Partial<
      NaverDailyReportSchedulerRepositoryGateway
    > = {},
): NaverDailyReportSchedulerRepositoryGateway {
  return {
    listReportRows:
      overrides.listReportRows ??
      defaultListReportRows,

    listReportConnectionIds:
      overrides.listReportConnectionIds ??
      defaultListReportConnectionIds,

    getSafeConnection:
      overrides.getSafeConnection ??
      defaultGetSafeConnection,

    listActiveNaverJobs:
      overrides.listActiveNaverJobs ??
      defaultListActiveNaverJobs,

    listPartitionDates:
      overrides.listPartitionDates ??
      defaultListPartitionDates,

    loadExactJob:
      overrides.loadExactJob ??
      defaultLoadExactJob,
  };
}

export function createNaverDailyReportSchedulerDatabaseDependencies(
  overrides:
    Partial<
      NaverDailyReportSchedulerRepositoryGateway
    > = {},
): Pick<
  NaverDailyReportSchedulerDependencies,
  | "listActiveNaverJobs"
  | "listCandidates"
  | "loadPartitionCoverage"
  | "loadExactJob"
> {
  const gateway =
    buildGateway(
      overrides,
    );

  return {
    listActiveNaverJobs:
      async () =>
        gateway
          .listActiveNaverJobs(),

    listCandidates:
      async () => {
        const rows =
          await gateway
            .listReportRows();

        if (
          !Array.isArray(rows)
        ) {
          throw new NaverDailyReportSchedulerRepositoryError(
            "INVALID_RESULT",
            "Automatic Daily report gateway returned an invalid result.",
          );
        }

        const candidates:
          NaverDailyReportCandidate[] =
          [];

        for (
          const value of rows
        ) {
          if (
            !isPlainObject(
              value,
            )
          ) {
            throw new NaverDailyReportSchedulerRepositoryError(
              "INVALID_REPORT",
              "Automatic Daily report contains an invalid row.",
            );
          }

          assertReportScopedContract(
            value,
          );

          const reportId =
            requireString(
              value.id,
              "report.id",
            );

          const workspaceId =
            requireString(
              value.workspace_id,
              "report.workspace_id",
            );

          const advertiserId =
            requireString(
              value.advertiser_id,
              "report.advertiser_id",
            );

          const createdBy =
            requireString(
              value.created_by,
              "report.created_by",
            );

          const period =
            resolveReportPeriod(
              value,
            );

          const connectionIds =
            await gateway
              .listReportConnectionIds({
                reportId,
                workspaceId,
                advertiserId,
              });

          if (
            !Array.isArray(
              connectionIds,
            ) ||
            connectionIds.length !==
              1
          ) {
            throw new NaverDailyReportSchedulerRepositoryError(
              "INVALID_MAPPING",
              "Automatic Daily report must have exactly one media connection mapping.",
            );
          }

          const connectionId =
            requireString(
              connectionIds[0],
              "mapping.connection_id",
            );

          const connection =
            await gateway
              .getSafeConnection({
                connectionId,
                workspaceId,
                advertiserId,
              });

          if (!connection) {
            throw new NaverDailyReportSchedulerRepositoryError(
              "INVALID_CONNECTION",
              "The mapped Daily Naver connection was not found.",
            );
          }

          assertVerifiedNaverConnection({
            connection,
            expected: {
              connectionId,
              workspaceId,
              advertiserId,
            },
          });

          candidates.push({
            reportId,
            connectionId,
            workspaceId,
            advertiserId,
            createdBy,
            periodStart:
              period.start,
            periodEnd:
              period.end,
          });
        }

        return candidates;
      },

    loadPartitionCoverage:
      async (input) => {
        const connection =
          await gateway
            .getSafeConnection({
              connectionId:
                input.connectionId,
              workspaceId:
                input.workspaceId,
              advertiserId:
                input.advertiserId,
            });

        if (!connection) {
          throw new NaverDailyReportSchedulerRepositoryError(
            "INVALID_CONNECTION",
            "The Daily coverage connection was not found.",
          );
        }

        assertVerifiedNaverConnection({
          connection,
          expected: {
            connectionId:
              input.connectionId,
            workspaceId:
              input.workspaceId,
            advertiserId:
              input.advertiserId,
          },
        });

        return gateway
          .listPartitionDates({
            workspaceId:
              input.workspaceId,
            advertiserId:
              input.advertiserId,
            externalAccountId:
              connection
                .external_account_id,
            dateFrom:
              input.dateFrom,
            dateTo:
              input.dateTo,
          });
      },

    loadExactJob:
      async (jobId) =>
        gateway
          .loadExactJob(
            jobId,
          ),
  };
}
