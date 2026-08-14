import { getSupabaseAdmin } from "../supabase/admin";
import type {
  MediaSyncJobRecord,
} from "./types";

const REPORT_MEDIA_CONNECTIONS_TABLE =
  "report_media_connections" as const;

const MEDIA_SYNC_REPORT_PROJECTIONS_TABLE =
  "media_sync_report_projections" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MediaSyncReportFanoutErrorCode =
  | "INVALID_INPUT"
  | "TARGETS_NOT_FOUND"
  | "PRIMARY_TARGET_MISSING"
  | "SCOPE_MISMATCH"
  | "PROJECTION_NOT_FOUND"
  | "PROJECTION_MISMATCH"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class MediaSyncReportFanoutError
  extends Error {
  readonly code:
    MediaSyncReportFanoutErrorCode;

  constructor(
    code:
      MediaSyncReportFanoutErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "MediaSyncReportFanoutError";

    this.code =
      code;
  }
}

export type MediaSyncReportFanoutTarget = {
  reportId: string;
  primary: boolean;
};

export type MediaSyncReportProjectionAuthority = {
  reportId: string;
  previousIngestionId: string | null;
  snapshotIngestionId: string;
};

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype ===
      Object.prototype ||
    prototype ===
      null
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  code:
    "INVALID_INPUT" |
    "INVALID_DATABASE_RESULT",
  maxLength = 2_000,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new MediaSyncReportFanoutError(
      code,
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new MediaSyncReportFanoutError(
      code,
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new MediaSyncReportFanoutError(
      code,
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeUuid(
  value: unknown,
  fieldName: string,
  code:
    "INVALID_INPUT" |
    "INVALID_DATABASE_RESULT",
): string {
  const normalizedValue =
    normalizeRequiredString(
      value,
      fieldName,
      code,
      36,
    );

  if (
    !UUID_PATTERN.test(
      normalizedValue,
    )
  ) {
    throw new MediaSyncReportFanoutError(
      code,
      `${fieldName} must be a UUID.`,
    );
  }

  return normalizedValue;
}

function normalizeNullableUuid(
  value: unknown,
  fieldName: string,
  code:
    "INVALID_INPUT" |
    "INVALID_DATABASE_RESULT",
): string | null {
  if (
    value === null
  ) {
    return null;
  }

  return normalizeUuid(
    value,
    fieldName,
    code,
  );
}

function validateJobScope(
  job: MediaSyncJobRecord,
): void {
  if (
    !isPlainObject(job)
  ) {
    throw new MediaSyncReportFanoutError(
      "INVALID_INPUT",
      "A media sync job record is required.",
    );
  }

  normalizeUuid(
    job.id,
    "job.id",
    "INVALID_INPUT",
  );

  normalizeUuid(
    job.report_id,
    "job.report_id",
    "INVALID_INPUT",
  );

  normalizeUuid(
    job.workspace_id,
    "job.workspace_id",
    "INVALID_INPUT",
  );

  normalizeUuid(
    job.advertiser_id,
    "job.advertiser_id",
    "INVALID_INPUT",
  );

  normalizeUuid(
    job.connection_id,
    "job.connection_id",
    "INVALID_INPUT",
  );

  const jobRecord =
    job as unknown as
      Record<string, unknown>;

  normalizeNullableUuid(
    jobRecord.created_by,
    "job.created_by",
    "INVALID_INPUT",
  );
}

function parseMappingRow(
  value: unknown,
): {
  workspaceId: string;
  advertiserId: string;
  reportId: string;
  connectionId: string;
} {
  if (
    !isPlainObject(value)
  ) {
    throw new MediaSyncReportFanoutError(
      "INVALID_DATABASE_RESULT",
      "A report media connection mapping row is invalid.",
    );
  }

  return {
    workspaceId:
      normalizeUuid(
        value.workspace_id,
        "mapping.workspace_id",
        "INVALID_DATABASE_RESULT",
      ),

    advertiserId:
      normalizeUuid(
        value.advertiser_id,
        "mapping.advertiser_id",
        "INVALID_DATABASE_RESULT",
      ),

    reportId:
      normalizeUuid(
        value.report_id,
        "mapping.report_id",
        "INVALID_DATABASE_RESULT",
      ),

    connectionId:
      normalizeUuid(
        value.connection_id,
        "mapping.connection_id",
        "INVALID_DATABASE_RESULT",
      ),
  };
}

function parseProjectionRow(
  value: unknown,
): {
  mediaSyncJobId: string;
  workspaceId: string;
  advertiserId: string;
  reportId: string;
  previousIngestionId: string | null;
  snapshotIngestionId: string;
  createdBy: string | null;
} {
  if (
    !isPlainObject(value)
  ) {
    throw new MediaSyncReportFanoutError(
      "INVALID_DATABASE_RESULT",
      "A media sync report projection row is invalid.",
    );
  }

  return {
    mediaSyncJobId:
      normalizeUuid(
        value.media_sync_job_id,
        "projection.media_sync_job_id",
        "INVALID_DATABASE_RESULT",
      ),

    workspaceId:
      normalizeUuid(
        value.workspace_id,
        "projection.workspace_id",
        "INVALID_DATABASE_RESULT",
      ),

    advertiserId:
      normalizeUuid(
        value.advertiser_id,
        "projection.advertiser_id",
        "INVALID_DATABASE_RESULT",
      ),

    reportId:
      normalizeUuid(
        value.report_id,
        "projection.report_id",
        "INVALID_DATABASE_RESULT",
      ),

    previousIngestionId:
      normalizeNullableUuid(
        value.previous_ingestion_id,
        "projection.previous_ingestion_id",
        "INVALID_DATABASE_RESULT",
      ),

    snapshotIngestionId:
      normalizeUuid(
        value.snapshot_ingestion_id,
        "projection.snapshot_ingestion_id",
        "INVALID_DATABASE_RESULT",
      ),

    createdBy:
      normalizeNullableUuid(
        value.created_by,
        "projection.created_by",
        "INVALID_DATABASE_RESULT",
      ),
  };
}

function normalizeJobCreatedBy(
  job: MediaSyncJobRecord,
): string | null {
  const jobRecord =
    job as unknown as
      Record<string, unknown>;

  return normalizeNullableUuid(
    jobRecord.created_by,
    "job.created_by",
    "INVALID_INPUT",
  );
}

export async function loadMediaSyncReportFanoutTargets(
  job: MediaSyncJobRecord,
): Promise<
  MediaSyncReportFanoutTarget[]
> {
  validateJobScope(
    job,
  );

  const supabase =
    getSupabaseAdmin();

  let result;

  try {
    result =
      await supabase
        .from(
          REPORT_MEDIA_CONNECTIONS_TABLE,
        )
        .select(
          "workspace_id, advertiser_id, report_id, connection_id",
        )
        .eq(
          "connection_id",
          job.connection_id,
        )
        .order(
          "report_id",
          {
            ascending:
              true,
          },
        );
  } catch (error) {
    throw new MediaSyncReportFanoutError(
      "DATABASE_ERROR",
      "The report fanout target repository could not access the database.",
      {
        cause:
          error,
      },
    );
  }

  const {
    data,
    error,
  } = result;

  if (error) {
    throw new MediaSyncReportFanoutError(
      "DATABASE_ERROR",
      "The report fanout targets could not be loaded.",
      {
        cause:
          error,
      },
    );
  }

  if (
    !Array.isArray(
      data,
    )
  ) {
    throw new MediaSyncReportFanoutError(
      "INVALID_DATABASE_RESULT",
      "The report fanout target query returned an invalid result.",
    );
  }

  const reportIds =
    new Set<string>();

  for (
    const rawRow
    of data
  ) {
    const row =
      parseMappingRow(
        rawRow,
      );

    if (
      row.workspaceId !==
        job.workspace_id ||
      row.advertiserId !==
        job.advertiser_id ||
      row.connectionId !==
        job.connection_id
    ) {
      throw new MediaSyncReportFanoutError(
        "SCOPE_MISMATCH",
        "A report fanout target does not match the media sync execution scope.",
      );
    }

    if (
      reportIds.has(
        row.reportId,
      )
    ) {
      throw new MediaSyncReportFanoutError(
        "INVALID_DATABASE_RESULT",
        "The report fanout target query returned a duplicate report.",
      );
    }

    reportIds.add(
      row.reportId,
    );
  }

  if (
    reportIds.size ===
    0
  ) {
    throw new MediaSyncReportFanoutError(
      "TARGETS_NOT_FOUND",
      "No report fanout target is mapped to this media connection.",
    );
  }

  if (
    !reportIds.has(
      job.report_id,
    )
  ) {
    throw new MediaSyncReportFanoutError(
      "PRIMARY_TARGET_MISSING",
      "The primary media sync report is not mapped to the execution connection.",
    );
  }

  const secondaryReportIds =
    Array.from(
      reportIds,
    )
      .filter(
        (
          reportId,
        ) =>
          reportId !==
          job.report_id,
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      );

  return [
    {
      reportId:
        job.report_id,
      primary:
        true,
    },

    ...secondaryReportIds.map(
      (
        reportId,
      ): MediaSyncReportFanoutTarget => ({
        reportId,
        primary:
          false,
      }),
    ),
  ];
}

export async function loadMediaSyncReportProjectionAuthority(
  input: {
    job:
      MediaSyncJobRecord;

    reportId:
      string;

    snapshotIngestionId:
      string;
  },
): Promise<
  MediaSyncReportProjectionAuthority
> {
  validateJobScope(
    input.job,
  );

  const reportId =
    normalizeUuid(
      input.reportId,
      "reportId",
      "INVALID_INPUT",
    );

  const expectedSnapshotIngestionId =
    normalizeUuid(
      input.snapshotIngestionId,
      "snapshotIngestionId",
      "INVALID_INPUT",
    );

  const expectedCreatedBy =
    normalizeJobCreatedBy(
      input.job,
    );

  const supabase =
    getSupabaseAdmin();

  let result;

  try {
    result =
      await supabase
        .from(
          MEDIA_SYNC_REPORT_PROJECTIONS_TABLE,
        )
        .select(
          "media_sync_job_id, workspace_id, advertiser_id, report_id, previous_ingestion_id, snapshot_ingestion_id, created_by",
        )
        .eq(
          "media_sync_job_id",
          input.job.id,
        )
        .eq(
          "report_id",
          reportId,
        )
        .limit(
          2,
        );
  } catch (error) {
    throw new MediaSyncReportFanoutError(
      "DATABASE_ERROR",
      "The report projection authority repository could not access the database.",
      {
        cause:
          error,
      },
    );
  }

  const {
    data,
    error,
  } = result;

  if (error) {
    throw new MediaSyncReportFanoutError(
      "DATABASE_ERROR",
      "The report projection authority could not be loaded.",
      {
        cause:
          error,
      },
    );
  }

  if (
    !Array.isArray(
      data,
    )
  ) {
    throw new MediaSyncReportFanoutError(
      "INVALID_DATABASE_RESULT",
      "The report projection authority query returned an invalid result.",
    );
  }

  if (
    data.length ===
    0
  ) {
    throw new MediaSyncReportFanoutError(
      "PROJECTION_NOT_FOUND",
      "The exact media sync report projection was not found.",
    );
  }

  if (
    data.length !==
    1
  ) {
    throw new MediaSyncReportFanoutError(
      "INVALID_DATABASE_RESULT",
      "The exact media sync report projection query returned multiple rows.",
    );
  }

  const projection =
    parseProjectionRow(
      data[0],
    );

  if (
    projection.mediaSyncJobId !==
      input.job.id ||
    projection.workspaceId !==
      input.job.workspace_id ||
    projection.advertiserId !==
      input.job.advertiser_id ||
    projection.reportId !==
      reportId ||
    projection.createdBy !==
      expectedCreatedBy ||
    projection.snapshotIngestionId !==
      expectedSnapshotIngestionId
  ) {
    throw new MediaSyncReportFanoutError(
      "PROJECTION_MISMATCH",
      "The report projection authority does not match the materialized execution scope.",
    );
  }

  if (
    reportId ===
      input.job.report_id &&
    (
      projection.previousIngestionId !==
        input.job.previous_ingestion_id ||
      projection.snapshotIngestionId !==
        input.job.snapshot_ingestion_id
    )
  ) {
    throw new MediaSyncReportFanoutError(
      "PROJECTION_MISMATCH",
      "The primary projection authority does not match the media sync job compatibility mirrors.",
    );
  }

  return {
    reportId:
      projection.reportId,

    previousIngestionId:
      projection.previousIngestionId,

    snapshotIngestionId:
      projection.snapshotIngestionId,
  };
}
