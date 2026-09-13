import { getSupabaseAdmin } from "../supabase/admin";
import {
  getSafeMediaConnection,
} from "./media-connections-repository";
import {
  getMediaProviderSyncCapability,
} from "./media-provider-sync-capabilities";
import {
  listReportMediaConnectionIds,
} from "./media-sync-jobs-repository";
import {
  isMediaProvider,
  isValidYmd,
  type MediaProvider,
  type SafeMediaConnection,
} from "./types";

const REPORTS_TABLE =
  "reports" as const;

const FACT_PARTITIONS_TABLE =
  "media_sync_fact_partitions" as const;

const DAILY_REPORT_V2_AUTOMATION_CONTRACT =
  "daily_report_v2" as const;

const DAILY_REPORT_V2_SCOPE =
  "all_mapped_supported_media" as const;

const DAILY_SYNC_PERIOD_TYPE =
  "daily_sync" as const;

const API_SOURCE_TYPE =
  "api" as const;

const PARTITION_PAGE_SIZE =
  1_000;

const DAILY_REPORT_V2_FACT_PROVIDERS =
  new Set<MediaProvider>([
    "naver_searchad",
    "google_ads",
  ]);

type UnknownRecord =
  Record<string, unknown>;

type ReportRecord = {
  id: unknown;
  workspace_id: unknown;
  advertiser_id: unknown;
  meta: unknown;
};

type PartitionRecord = {
  date: unknown;
  row_count: unknown;
};

export type DailyReportV2CoverageErrorCode =
  | "INVALID_INPUT"
  | "DATE_RANGE_INVALID"
  | "REPORT_NOT_FOUND"
  | "REPORT_SCOPE_MISMATCH"
  | "CONTRACT_INVALID"
  | "MAPPING_INVALID"
  | "CONNECTION_NOT_FOUND"
  | "NO_PARTICIPANTS"
  | "PARTITION_QUERY_FAILED"
  | "INVALID_DATABASE_RESULT";

export class DailyReportV2CoverageRepositoryError
  extends Error {
  readonly code:
    DailyReportV2CoverageErrorCode;

  constructor(
    code:
      DailyReportV2CoverageErrorCode,
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
      "DailyReportV2CoverageRepositoryError";

    this.code =
      code;
  }
}

export type DailyReportV2ParticipantCoverage =
  Readonly<{
    connectionId:
      string;
    provider:
      MediaProvider;
    externalAccountId:
      string;
    connectionStatus:
      string;
    startDate:
      string;
    throughDate:
      string;
    completedThrough:
      string | null;
    firstMissingDate:
      string | null;
    contiguousDates:
      number;
    contiguousRows:
      number;
    targetCovered:
      boolean;
  }>;

export type DailyReportV2ContiguousCoverage =
  Readonly<{
    reportId:
      string;
    workspaceId:
      string;
    advertiserId:
      string;
    startDate:
      string;
    throughDate:
      string;
    participants:
      readonly DailyReportV2ParticipantCoverage[];
    completedThrough:
      string | null;
    firstMissingDate:
      string | null;
    targetCovered:
      boolean;
  }>;

export type LoadDailyReportV2ContiguousCoverageInput =
  Readonly<{
    reportId:
      string;
    workspaceId:
      string;
    advertiserId:
      string;
    throughDate:
      string;
    dependencies?:
      DailyReportV2CoverageDependencies;
  }>;

export type DailyReportV2CoverageDependencies =
  Readonly<{
    loadReport?: (
      input: Readonly<{
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

    listConnectionIds?: (
      input: Readonly<{
        reportId:
          string;
        workspaceId:
          string;
        advertiserId:
          string;
      }>,
    ) => Promise<string[]>;

    getConnection?: (
      input: Readonly<{
        connectionId:
          string;
        workspaceId:
          string;
        advertiserId:
          string;
      }>,
    ) => Promise<
      SafeMediaConnection | null
    >;

    loadPartitionPage?: (
      input: Readonly<{
        workspaceId:
          string;
        advertiserId:
          string;
        provider:
          MediaProvider;
        externalAccountId:
          string;
        startDate:
          string;
        throughDate:
          string;
        offset:
          number;
        limit:
          number;
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

function requiredString(
  value:
    unknown,
  field:
    string,
  code:
    DailyReportV2CoverageErrorCode =
      "INVALID_INPUT",
): string {
  const normalized =
    String(
      value ?? "",
    ).trim();

  if (!normalized) {
    throw new DailyReportV2CoverageRepositoryError(
      code,
      `${field} is required.`,
    );
  }

  return normalized;
}

function requiredYmd(
  value:
    unknown,
  field:
    string,
): string {
  const normalized =
    requiredString(
      value,
      field,
    );

  if (
    !isValidYmd(
      normalized,
    )
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "DATE_RANGE_INVALID",
      `${field} must be YYYY-MM-DD.`,
    );
  }

  return normalized;
}

function nonNegativeSafeInteger(
  value:
    unknown,
  field:
    string,
): number {
  const numeric =
    typeof value ===
      "number"
      ? value
      : Number(
          value,
        );

  if (
    !Number.isSafeInteger(
      numeric,
    ) ||
    numeric < 0
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "INVALID_DATABASE_RESULT",
      `${field} must be a non-negative safe integer.`,
    );
  }

  return numeric;
}

function nextUtcDate(
  ymd:
    string,
): string {
  const ms =
    Date.parse(
      `${ymd}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(
      ms,
    )
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "DATE_RANGE_INVALID",
      "Date arithmetic received an invalid date.",
    );
  }

  return new Date(
    ms +
      86_400_000,
  )
    .toISOString()
    .slice(
      0,
      10,
    );
}

function parseReportStartDate(
  report:
    ReportRecord,
  input:
    LoadDailyReportV2ContiguousCoverageInput,
): string {
  const reportId =
    requiredString(
      report.id,
      "report.id",
      "INVALID_DATABASE_RESULT",
    );

  const workspaceId =
    requiredString(
      report.workspace_id,
      "report.workspace_id",
      "INVALID_DATABASE_RESULT",
    );

  const advertiserId =
    requiredString(
      report.advertiser_id,
      "report.advertiser_id",
      "INVALID_DATABASE_RESULT",
    );

  if (
    reportId !==
      input.reportId ||
    workspaceId !==
      input.workspaceId ||
    advertiserId !==
      input.advertiserId
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "REPORT_SCOPE_MISMATCH",
      "The Daily Report V2 report scope does not match the requested authority.",
    );
  }

  if (
    !isPlainObject(
      report.meta,
    )
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "CONTRACT_INVALID",
      "The Daily Report V2 report meta is missing.",
    );
  }

  const publicIdentity =
    isPlainObject(
      report.meta
        .public_identity,
    )
      ? report.meta
          .public_identity
      : null;

  const mediaSync =
    isPlainObject(
      report.meta
        .media_sync,
    )
      ? report.meta
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
    !publicIdentity ||
    publicIdentity
      .source_type !==
      API_SOURCE_TYPE ||
    publicIdentity
      .period_type !==
      DAILY_SYNC_PERIOD_TYPE
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "CONTRACT_INVALID",
      "The report canonical identity is not API daily_sync.",
    );
  }

  if (
    !autoSync ||
    autoSync.enabled !==
      true ||
    autoSync.contract !==
      DAILY_REPORT_V2_AUTOMATION_CONTRACT ||
    autoSync.scope !==
      DAILY_REPORT_V2_SCOPE
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "CONTRACT_INVALID",
      "The report Daily Report V2 automation contract is invalid.",
    );
  }

  const identityStart =
    requiredYmd(
      publicIdentity
        .period_key,
      "meta.public_identity.period_key",
    );

  const automationStart =
    requiredYmd(
      autoSync
        .start_date,
      "meta.media_sync.auto_sync.start_date",
    );

  if (
    identityStart !==
      automationStart
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "CONTRACT_INVALID",
      "Daily Report V2 canonical start-date authorities disagree.",
    );
  }

  return identityStart;
}

async function defaultLoadReport(
  input:
    Readonly<{
      reportId:
        string;
      workspaceId:
        string;
      advertiserId:
        string;
    }>,
): Promise<
  Readonly<{
    data:
      unknown;
    error:
      unknown;
  }>
> {
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
        "meta",
      ].join(","),
    )
    .eq(
      "id",
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
    .maybeSingle();
}

async function defaultLoadPartitionPage(
  input:
    Readonly<{
      workspaceId:
        string;
      advertiserId:
        string;
      provider:
        MediaProvider;
      externalAccountId:
        string;
      startDate:
        string;
      throughDate:
        string;
      offset:
        number;
      limit:
        number;
    }>,
): Promise<
  Readonly<{
    data:
      unknown;
    error:
      unknown;
  }>
> {
  const supabase =
    getSupabaseAdmin();

  return await supabase
    .from(
      FACT_PARTITIONS_TABLE,
    )
    .select(
      "date,row_count",
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
      input.provider,
    )
    .eq(
      "external_account_id",
      input.externalAccountId,
    )
    .gte(
      "date",
      input.startDate,
    )
    .lte(
      "date",
      input.throughDate,
    )
    .order(
      "date",
      {
        ascending:
          true,
      },
    )
    .range(
      input.offset,
      input.offset +
        input.limit -
        1,
    );
}

function resolveDependencies(
  input:
    LoadDailyReportV2ContiguousCoverageInput,
) {
  return {
    loadReport:
      input.dependencies
        ?.loadReport ??
      defaultLoadReport,

    listConnectionIds:
      input.dependencies
        ?.listConnectionIds ??
      listReportMediaConnectionIds,

    getConnection:
      input.dependencies
        ?.getConnection ??
      getSafeMediaConnection,

    loadPartitionPage:
      input.dependencies
        ?.loadPartitionPage ??
      defaultLoadPartitionPage,
  };
}

async function loadParticipantPartitions(
  input:
    Readonly<{
      workspaceId:
        string;
      advertiserId:
        string;
      provider:
        MediaProvider;
      externalAccountId:
        string;
      startDate:
        string;
      throughDate:
        string;
      loadPartitionPage:
        NonNullable<
          DailyReportV2CoverageDependencies[
            "loadPartitionPage"
          ]
        >;
    }>,
): Promise<
  Map<
    string,
    number
  >
> {
  const rows =
    new Map<
      string,
      number
    >();

  let offset =
    0;

  for (;;) {
    const response =
      await input
        .loadPartitionPage({
          workspaceId:
            input.workspaceId,
          advertiserId:
            input.advertiserId,
          provider:
            input.provider,
          externalAccountId:
            input.externalAccountId,
          startDate:
            input.startDate,
          throughDate:
            input.throughDate,
          offset,
          limit:
            PARTITION_PAGE_SIZE,
        });

    if (
      response.error
    ) {
      throw new DailyReportV2CoverageRepositoryError(
        "PARTITION_QUERY_FAILED",
        "Canonical fact partition coverage query failed.",
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
      throw new DailyReportV2CoverageRepositoryError(
        "INVALID_DATABASE_RESULT",
        "Canonical fact partition coverage returned an invalid result.",
      );
    }

    const page =
      response.data as
        PartitionRecord[];

    for (
      const record
      of page
    ) {
      if (
        !record ||
        typeof record !==
          "object"
      ) {
        throw new DailyReportV2CoverageRepositoryError(
          "INVALID_DATABASE_RESULT",
          "Canonical fact partition row is invalid.",
        );
      }

      const date =
        requiredYmd(
          record.date,
          "partition.date",
        );

      if (
        date <
          input.startDate ||
        date >
          input.throughDate
      ) {
        throw new DailyReportV2CoverageRepositoryError(
          "INVALID_DATABASE_RESULT",
          "Canonical fact partition row is outside the requested date range.",
        );
      }

      if (
        rows.has(
          date,
        )
      ) {
        throw new DailyReportV2CoverageRepositoryError(
          "INVALID_DATABASE_RESULT",
          "Canonical fact partition date is duplicated.",
        );
      }

      rows.set(
        date,
        nonNegativeSafeInteger(
          record.row_count,
          "partition.row_count",
        ),
      );
    }

    if (
      page.length <
        PARTITION_PAGE_SIZE
    ) {
      break;
    }

    offset +=
      page.length;
  }

  return rows;
}

function computeParticipantCoverage(
  input:
    Readonly<{
      connection:
        SafeMediaConnection;
      provider:
        MediaProvider;
      startDate:
        string;
      throughDate:
        string;
      partitionRows:
        Map<
          string,
          number
        >;
    }>,
): DailyReportV2ParticipantCoverage {
  const connectionId =
    requiredString(
      input.connection.id,
      "connection.id",
      "MAPPING_INVALID",
    );

  const externalAccountId =
    requiredString(
      input.connection
        .external_account_id,
      "connection.external_account_id",
      "MAPPING_INVALID",
    );

  const connectionStatus =
    requiredString(
      input.connection.status,
      "connection.status",
      "MAPPING_INVALID",
    );

  let cursor =
    input.startDate;

  let completedThrough:
    string | null =
      null;

  let firstMissingDate:
    string | null =
      null;

  let contiguousDates =
    0;

  let contiguousRows =
    0;

  while (
    cursor <=
      input.throughDate
  ) {
    const rowCount =
      input.partitionRows
        .get(
          cursor,
        );

    if (
      rowCount ===
        undefined
    ) {
      firstMissingDate =
        cursor;
      break;
    }

    contiguousDates +=
      1;

    contiguousRows +=
      rowCount;

    if (
      !Number.isSafeInteger(
        contiguousRows,
      )
    ) {
      throw new DailyReportV2CoverageRepositoryError(
        "INVALID_DATABASE_RESULT",
        "Contiguous fact partition row total exceeds the safe integer range.",
      );
    }

    completedThrough =
      cursor;

    cursor =
      nextUtcDate(
        cursor,
      );
  }

  return Object.freeze({
    connectionId,
    provider:
      input.provider,
    externalAccountId,
    connectionStatus,
    startDate:
      input.startDate,
    throughDate:
      input.throughDate,
    completedThrough,
    firstMissingDate,
    contiguousDates,
    contiguousRows,
    targetCovered:
      completedThrough ===
        input.throughDate,
  });
}

export async function loadDailyReportV2ContiguousCoverage(
  input:
    LoadDailyReportV2ContiguousCoverageInput,
): Promise<
  DailyReportV2ContiguousCoverage
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "INVALID_INPUT",
      "Daily Report V2 coverage input is required.",
    );
  }

  const reportId =
    requiredString(
      input.reportId,
      "reportId",
    );

  const workspaceId =
    requiredString(
      input.workspaceId,
      "workspaceId",
    );

  const advertiserId =
    requiredString(
      input.advertiserId,
      "advertiserId",
    );

  const throughDate =
    requiredYmd(
      input.throughDate,
      "throughDate",
    );

  const dependencies =
    resolveDependencies(
      input,
    );

  const reportResponse =
    await dependencies
      .loadReport({
        reportId,
        workspaceId,
        advertiserId,
      });

  if (
    reportResponse.error
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Daily Report V2 report lookup failed.",
      {
        cause:
          reportResponse.error,
      },
    );
  }

  if (
    !reportResponse.data
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "REPORT_NOT_FOUND",
      "Daily Report V2 report was not found.",
    );
  }

  if (
    !isPlainObject(
      reportResponse.data,
    )
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Daily Report V2 report lookup returned an invalid result.",
    );
  }

  const startDate =
    parseReportStartDate(
      reportResponse.data as
        ReportRecord,
      {
        ...input,
        reportId,
        workspaceId,
        advertiserId,
        throughDate,
      },
    );

  if (
    throughDate <
      startDate
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "DATE_RANGE_INVALID",
      "Daily Report V2 throughDate cannot precede startDate.",
    );
  }

  const connectionIds =
    await dependencies
      .listConnectionIds({
        reportId,
        workspaceId,
        advertiserId,
      });

  if (
    !Array.isArray(
      connectionIds,
    )
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "MAPPING_INVALID",
      "Daily Report V2 media connection mapping result is invalid.",
    );
  }

  const normalizedConnectionIds =
    connectionIds.map(
      (
        value,
      ) =>
        requiredString(
          value,
          "connectionId",
          "MAPPING_INVALID",
        ),
    );

  if (
    new Set(
      normalizedConnectionIds,
    ).size !==
      normalizedConnectionIds.length
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "MAPPING_INVALID",
      "Daily Report V2 media connection mapping contains duplicate connection ids.",
    );
  }

  const participants:
    DailyReportV2ParticipantCoverage[] =
      [];

  for (
    const connectionId
    of normalizedConnectionIds
  ) {
    const connection =
      await dependencies
        .getConnection({
          connectionId,
          workspaceId,
          advertiserId,
        });

    if (
      !connection
    ) {
      throw new DailyReportV2CoverageRepositoryError(
        "CONNECTION_NOT_FOUND",
        `Mapped media connection ${connectionId} was not found.`,
      );
    }

    if (
      !isMediaProvider(
        connection.provider,
      )
    ) {
      throw new DailyReportV2CoverageRepositoryError(
        "MAPPING_INVALID",
        `Mapped media connection ${connectionId} has an invalid provider.`,
      );
    }

    const provider =
      connection.provider;

    const capability =
      getMediaProviderSyncCapability(
        provider,
      );

    if (
      !capability
        .syncRuntimeEnabled ||
      !DAILY_REPORT_V2_FACT_PROVIDERS
        .has(
          provider,
        )
    ) {
      continue;
    }

    const externalAccountId =
      requiredString(
        connection
          .external_account_id,
        "connection.external_account_id",
        "MAPPING_INVALID",
      );

    const partitionRows =
      await loadParticipantPartitions({
        workspaceId,
        advertiserId,
        provider,
        externalAccountId,
        startDate,
        throughDate,
        loadPartitionPage:
          dependencies
            .loadPartitionPage,
      });

    participants.push(
      computeParticipantCoverage({
        connection,
        provider,
        startDate,
        throughDate,
        partitionRows,
      }),
    );
  }

  if (
    participants.length ===
      0
  ) {
    throw new DailyReportV2CoverageRepositoryError(
      "NO_PARTICIPANTS",
      "Daily Report V2 has no mapped runtime-enabled fact-capable media participants.",
    );
  }

  participants.sort(
    (
      left,
      right,
    ) =>
      left.provider
        .localeCompare(
          right.provider,
        ) ||
      left.externalAccountId
        .localeCompare(
          right.externalAccountId,
        ) ||
      left.connectionId
        .localeCompare(
          right.connectionId,
        ),
  );

  const firstMissingDates =
    participants
      .map(
        (
          participant,
        ) =>
          participant
            .firstMissingDate,
      )
      .filter(
        (
          value,
        ): value is string =>
          value !== null,
      )
      .sort();

  const completedDates =
    participants
      .map(
        (
          participant,
        ) =>
          participant
            .completedThrough,
      );

  const completedThrough =
    completedDates.some(
      (
        value,
      ) =>
        value ===
          null,
    )
      ? null
      : (
          completedDates as
            string[]
        )
          .slice()
          .sort()[0] ??
        null;

  const targetCovered =
    participants.every(
      (
        participant,
      ) =>
        participant
          .targetCovered,
    );

  return Object.freeze({
    reportId,
    workspaceId,
    advertiserId,
    startDate,
    throughDate,
    participants:
      Object.freeze(
        [
          ...participants,
        ],
      ),
    completedThrough,
    firstMissingDate:
      targetCovered
        ? null
        : firstMissingDates[0] ??
          startDate,
    targetCovered,
  });
}
