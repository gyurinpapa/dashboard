import {
  getSupabaseAdmin,
} from "../supabase/admin";

const PREPARE_RPC =
  "prepare_daily_report_v2_combined_snapshot" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const PROVIDERS =
  new Set([
    "naver_searchad",
    "google_ads",
  ] as const);

export type DailyReportV2CombinedSnapshotProvider =
  | "naver_searchad"
  | "google_ads";

export type DailyReportV2CombinedSnapshotStatus =
  | "prepared"
  | "materializing"
  | "ready"
  | "activated";

export type DailyReportV2CombinedSnapshotParticipant =
  Readonly<{
    connectionId:
      string;
    provider:
      DailyReportV2CombinedSnapshotProvider;
    externalAccountId:
      string;
    expectedRows:
      number;
  }>;

export type DailyReportV2CombinedSnapshotRun =
  Readonly<{
    runId:
      string;
    reportId:
      string;
    previousIngestionId:
      string | null;
    snapshotIngestionId:
      string;
    startDate:
      string;
    throughDate:
      string;
    participants:
      readonly DailyReportV2CombinedSnapshotParticipant[];
    participantCount:
      number;
    expectedRows:
      number;
    status:
      DailyReportV2CombinedSnapshotStatus;
    idempotent:
      boolean;
  }>;

export type PrepareDailyReportV2CombinedSnapshotInput =
  Readonly<{
    reportId:
      string;
    workspaceId:
      string;
    advertiserId:
      string;
    createdBy:
      string;
    startDate:
      string;
    throughDate:
      string;
  }>;

export type DailyReportV2CombinedSnapshotRepositoryErrorCode =
  | "INVALID_INPUT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class DailyReportV2CombinedSnapshotRepositoryError
  extends Error {
  readonly code:
    DailyReportV2CombinedSnapshotRepositoryErrorCode;

  constructor(
    code:
      DailyReportV2CombinedSnapshotRepositoryErrorCode,
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
      "DailyReportV2CombinedSnapshotRepositoryError";

    this.code =
      code;
  }
}

function requireString(
  value:
    unknown,
  label:
    string,
): string {
  if (
    typeof value !==
      "string" ||
    value.trim() ===
      ""
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      `${label} is invalid.`,
    );
  }

  return value.trim();
}

function requireUuid(
  value:
    unknown,
  label:
    string,
): string {
  const result =
    requireString(
      value,
      label,
    );

  if (
    !UUID_PATTERN.test(
      result,
    )
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      `${label} is not a UUID.`,
    );
  }

  return result;
}

function requireNullableUuid(
  value:
    unknown,
  label:
    string,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return requireUuid(
    value,
    label,
  );
}

function requireYmd(
  value:
    unknown,
  label:
    string,
): string {
  const result =
    requireString(
      value,
      label,
    );

  if (
    !YMD_PATTERN.test(
      result,
    )
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      `${label} is not YYYY-MM-DD.`,
    );
  }

  return result;
}

function requireInteger(
  value:
    unknown,
  label:
    string,
  minimum:
    number,
): number {
  const parsed =
    typeof value ===
      "number"
      ? value
      : typeof value ===
          "string" &&
        value.trim() !==
          ""
        ? Number(
            value,
          )
        : Number.NaN;

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed <
      minimum
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      `${label} is invalid.`,
    );
  }

  return parsed;
}

function requireBoolean(
  value:
    unknown,
  label:
    string,
): boolean {
  if (
    typeof value !==
      "boolean"
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      `${label} is invalid.`,
    );
  }

  return value;
}

function parseParticipant(
  value:
    unknown,
): DailyReportV2CombinedSnapshotParticipant {
  if (
    value === null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      "participant_contract entry is invalid.",
    );
  }

  const record =
    value as
      Record<
        string,
        unknown
      >;

  const provider =
    requireString(
      record.provider,
      "participant.provider",
    );

  if (
    !PROVIDERS.has(
      provider as
        DailyReportV2CombinedSnapshotProvider,
    )
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      "participant.provider is unsupported.",
    );
  }

  return Object.freeze({
    connectionId:
      requireUuid(
        record.connection_id,
        "participant.connection_id",
      ),
    provider:
      provider as
        DailyReportV2CombinedSnapshotProvider,
    externalAccountId:
      requireString(
        record.external_account_id,
        "participant.external_account_id",
      ),
    expectedRows:
      requireInteger(
        record.expected_rows,
        "participant.expected_rows",
        0,
      ),
  });
}

function parseRun(
  value:
    unknown,
): DailyReportV2CombinedSnapshotRun {
  if (
    value === null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Combined snapshot RPC row is invalid.",
    );
  }

  const record =
    value as
      Record<
        string,
        unknown
      >;

  if (
    !Array.isArray(
      record.participant_contract,
    )
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      "participant_contract is invalid.",
    );
  }

  const participants =
    Object.freeze(
      record.participant_contract.map(
        parseParticipant,
      ),
    );

  const participantCount =
    requireInteger(
      record.participant_count,
      "participant_count",
      1,
    );

  if (
    participants.length !==
      participantCount
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      "participant_contract cardinality does not match participant_count.",
    );
  }

  const status =
    requireString(
      record.status,
      "status",
    );

  if (
    status !==
      "prepared" &&
    status !==
      "materializing" &&
    status !==
      "ready" &&
    status !==
      "activated"
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Combined snapshot status is invalid.",
    );
  }

  return Object.freeze({
    runId:
      requireUuid(
        record.run_id,
        "run_id",
      ),
    reportId:
      requireUuid(
        record.report_id,
        "report_id",
      ),
    previousIngestionId:
      requireNullableUuid(
        record.previous_ingestion_id,
        "previous_ingestion_id",
      ),
    snapshotIngestionId:
      requireUuid(
        record.snapshot_ingestion_id,
        "snapshot_ingestion_id",
      ),
    startDate:
      requireYmd(
        record.start_date,
        "start_date",
      ),
    throughDate:
      requireYmd(
        record.through_date,
        "through_date",
      ),
    participants,
    participantCount,
    expectedRows:
      requireInteger(
        record.expected_rows,
        "expected_rows",
        0,
      ),
    status:
      status as
        DailyReportV2CombinedSnapshotStatus,
    idempotent:
      requireBoolean(
        record.idempotent,
        "idempotent",
      ),
  });
}

function validateInput(
  input:
    PrepareDailyReportV2CombinedSnapshotInput,
) {
  for (
    const [
      label,
      value,
    ]
    of [
      [
        "reportId",
        input.reportId,
      ],
      [
        "workspaceId",
        input.workspaceId,
      ],
      [
        "advertiserId",
        input.advertiserId,
      ],
      [
        "createdBy",
        input.createdBy,
      ],
    ] as const
  ) {
    if (
      !UUID_PATTERN.test(
        value,
      )
    ) {
      throw new DailyReportV2CombinedSnapshotRepositoryError(
        "INVALID_INPUT",
        `${label} must be a UUID.`,
      );
    }
  }

  if (
    !YMD_PATTERN.test(
      input.startDate,
    ) ||
    !YMD_PATTERN.test(
      input.throughDate,
    ) ||
    input.startDate >
      input.throughDate
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_INPUT",
      "Combined snapshot date range is invalid.",
    );
  }
}

export async function prepareDailyReportV2CombinedSnapshot(
  input:
    PrepareDailyReportV2CombinedSnapshotInput,
): Promise<DailyReportV2CombinedSnapshotRun> {
  validateInput(
    input,
  );

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase.rpc(
      PREPARE_RPC,
      {
        p_payload: {
          report_id:
            input.reportId,
          workspace_id:
            input.workspaceId,
          advertiser_id:
            input.advertiserId,
          created_by:
            input.createdBy,
          start_date:
            input.startDate,
          through_date:
            input.throughDate,
        },
      },
    );

  if (error) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "DATABASE_ERROR",
      "Could not prepare Daily Report V2 combined snapshot.",
      {
        cause:
          error,
      },
    );
  }

  if (
    !Array.isArray(
      data,
    ) ||
    data.length !==
      1
  ) {
    throw new DailyReportV2CombinedSnapshotRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Combined snapshot prepare RPC returned an invalid row count.",
    );
  }

  return parseRun(
    data[0],
  );
}
