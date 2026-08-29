import {
  readGoogleAdsAllDataProductRoutingState,
  type GoogleAdsAllDataProductRoutingState,
} from "./google-ads-all-data-product-routing";
import type {
  GoogleAdsAllDataDemandGenStagingCursor,
} from "./google-ads-all-data-demand-gen-staging-orchestrator";

import type {
  GoogleAdsAllDataSearchStagingCursor,
} from "./google-ads-all-data-search-staging-orchestrator";
import type {
  MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

const PROCESSING_STATUS =
  "processing" as const;

const PROCESSING_CHECKPOINT_KEY =
  "processing_checkpoint" as const;

type UnknownRecord =
  Record<string, unknown>;

type MediaSyncJobWithExecutionContract =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract?: unknown;
  }>;

export type GoogleAdsAllDataProcessingCheckpointPhase =
  | "product_boundary"
  | "keyword"
  | "search_ad"
  | "demand_gen_ad"
  | "completed";

export type GoogleAdsAllDataDemandGenProcessingCursor =
  Readonly<{
    version: 1;

    phase:
      "demand_gen_ad";

    externalAccountId:
      string;

    dateWindowIndex:
      number;

    dateFrom:
      string;

    dateTo:
      string;

    expectedRowStartIndex:
      number;

    phaseCursor:
      GoogleAdsAllDataDemandGenStagingCursor;
  }>;

export type GoogleAdsAllDataProcessingCheckpointCursor =
  | GoogleAdsAllDataSearchStagingCursor
  | GoogleAdsAllDataDemandGenProcessingCursor;

export type GoogleAdsAllDataProcessingCheckpointErrorCode =
  | "INVALID_JOB"
  | "UNSUPPORTED_PROVIDER"
  | "JOB_NOT_PROCESSING"
  | "INVALID_CHECKPOINT"
  | "INVALID_COUNTS"
  | "CHECKPOINT_SCOPE_MISMATCH";

export class GoogleAdsAllDataProcessingCheckpointError
  extends Error {
  readonly code:
    GoogleAdsAllDataProcessingCheckpointErrorCode;

  constructor(
    code:
      GoogleAdsAllDataProcessingCheckpointErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataProcessingCheckpointError";

    this.code =
      code;
  }
}

export type GoogleAdsAllDataProcessingCheckpointState =
  Readonly<{
    hasCheckpoint: boolean;

    dateWindowIndex:
      number |
      null;

    phase:
      GoogleAdsAllDataProcessingCheckpointPhase |
      null;

    cursor:
      GoogleAdsAllDataProcessingCheckpointCursor |
      null;

    routing?:
      GoogleAdsAllDataProductRoutingState;

    nextRowIndex: number;

    complete: boolean;
  }>;

function isPlainObject(
  value: unknown,
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

function requireNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function requireExactString(
  value: unknown,
  expected: string,
  fieldName: string,
): void {
  if (
    value !==
      expected
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      `${fieldName} is invalid.`,
    );
  }
}

function validateJob(
  job:
    MediaSyncJobRecord,
): MediaSyncJobWithExecutionContract {
  if (
    !job ||
    typeof job !==
      "object"
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_JOB",
      "A Google Ads ALL-DATA processing job is required.",
    );
  }

  const typedJob =
    job as
      MediaSyncJobWithExecutionContract;

  if (
    typedJob.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "UNSUPPORTED_PROVIDER",
      "Only Google Ads ALL-DATA processing checkpoints are supported.",
    );
  }

  if (
    typedJob.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_JOB",
      "The Google Ads job does not use google_all_data_v1.",
    );
  }

  if (
    typedJob.status !==
      PROCESSING_STATUS
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "JOB_NOT_PROCESSING",
      "The Google Ads ALL-DATA job is not processing.",
    );
  }

  if (
    typeof typedJob.external_account_id !==
      "string" ||
    !typedJob.external_account_id.trim() ||
    typeof typedJob.date_from !==
      "string" ||
    !typedJob.date_from.trim() ||
    typeof typedJob.date_to !==
      "string" ||
    !typedJob.date_to.trim()
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA job scope is invalid.",
    );
  }

  if (
    !Number.isSafeInteger(
      typedJob.raw_rows,
    ) ||
    typedJob.raw_rows < 0 ||
    !Number.isSafeInteger(
      typedJob.normalized_rows,
    ) ||
    typedJob.normalized_rows < 0 ||
    !Number.isSafeInteger(
      typedJob.inserted_rows,
    ) ||
    typedJob.inserted_rows < 0 ||
    !Number.isSafeInteger(
      typedJob.failed_rows,
    ) ||
    typedJob.failed_rows < 0
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads ALL-DATA job row counts are invalid.",
    );
  }

  return typedJob;
}

function readCheckpointObject(
  errorDetail: unknown,
): UnknownRecord | null {
  if (
    errorDetail ===
      null
  ) {
    return null;
  }

  if (
    !isPlainObject(
      errorDetail,
    )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "Google Ads ALL-DATA error_detail must be an object or null.",
    );
  }

  const keys =
    Object.keys(
      errorDetail,
    );

  if (
    keys.length !==
      1 ||
    keys[0] !==
      PROCESSING_CHECKPOINT_KEY
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "Google Ads ALL-DATA error_detail must contain only processing_checkpoint.",
    );
  }

  const checkpoint =
    errorDetail[
      PROCESSING_CHECKPOINT_KEY
    ];

  if (
    !isPlainObject(
      checkpoint,
    )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "Google Ads ALL-DATA processing_checkpoint must be an object.",
    );
  }

  return checkpoint;
}

function validateCursor(
  input: Readonly<{
    value: unknown;

    phase:
      Exclude<
        GoogleAdsAllDataProcessingCheckpointPhase,
        | "completed"
        | "product_boundary"
      >;

    job:
      MediaSyncJobWithExecutionContract;

    dateWindowIndex:
      number;

    nextRowIndex:
      number;
  }>,
): GoogleAdsAllDataProcessingCheckpointCursor {
  if (
    !isPlainObject(
      input.value,
    )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "A partial Google Ads ALL-DATA checkpoint requires a combined cursor.",
    );
  }

  const cursor =
    input.value;

  if (
    cursor.version !==
      1 ||
    cursor.phase !==
      input.phase ||
    cursor.externalAccountId !==
      input.job.external_account_id ||
    cursor.dateWindowIndex !==
      input.dateWindowIndex ||
    cursor.dateFrom !==
      input.job.date_from ||
    cursor.dateTo !==
      input.job.date_to ||
    cursor.expectedRowStartIndex !==
      input.nextRowIndex
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "CHECKPOINT_SCOPE_MISMATCH",
      "The Google Ads ALL-DATA resume cursor does not match the claimed job boundary.",
    );
  }

  if (
    input.phase ===
      "keyword"
  ) {
    if (
      !isPlainObject(
        cursor.phaseCursor,
      )
    ) {
      throw new GoogleAdsAllDataProcessingCheckpointError(
        "INVALID_CHECKPOINT",
        "The keyword ALL-DATA phase requires a nested keyword cursor.",
      );
    }

    return cursor as unknown as
      GoogleAdsAllDataSearchStagingCursor;
  }

  if (
    input.phase ===
      "search_ad"
  ) {
    if (
      cursor.phaseCursor !==
        null &&
      !isPlainObject(
        cursor.phaseCursor,
      )
    ) {
      throw new GoogleAdsAllDataProcessingCheckpointError(
        "INVALID_CHECKPOINT",
        "The Search-ad ALL-DATA nested cursor is invalid.",
      );
    }

    return cursor as unknown as
      GoogleAdsAllDataSearchStagingCursor;
  }

  if (
    !isPlainObject(
      cursor.phaseCursor,
    )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Demand Gen ALL-DATA phase requires a nested ad cursor.",
    );
  }

  const demandCursor =
    cursor.phaseCursor;

  if (
    demandCursor.version !==
      1 ||
    demandCursor.externalAccountId !==
      input.job.external_account_id ||
    demandCursor.dateWindowIndex !==
      input.dateWindowIndex ||
    demandCursor.dateFrom !==
      input.job.date_from ||
    demandCursor.dateTo !==
      input.job.date_to ||
    demandCursor.expectedRowStartIndex !==
      input.nextRowIndex ||
    !isPlainObject(
      demandCursor.page,
    ) ||
    demandCursor.page.version !==
      1 ||
    typeof demandCursor.page.pageIndex !==
      "number" ||
    !Number.isSafeInteger(
      demandCursor.page.pageIndex,
    ) ||
    demandCursor.page.pageIndex <
      1 ||
    typeof demandCursor.page.page !==
      "string" ||
    !demandCursor.page.page.trim()
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "CHECKPOINT_SCOPE_MISMATCH",
      "The Demand Gen ALL-DATA nested ad cursor does not match the durable job boundary.",
    );
  }

  return cursor as unknown as
    GoogleAdsAllDataDemandGenProcessingCursor;
}

export function readGoogleAdsAllDataProcessingCheckpoint(
  job:
    MediaSyncJobRecord,
): GoogleAdsAllDataProcessingCheckpointState {
  const typedJob =
    validateJob(
      job,
    );

  const checkpoint =
    readCheckpointObject(
      typedJob.error_detail,
    );

  if (!checkpoint) {
    if (
      typedJob.raw_rows !==
        0 ||
      typedJob.normalized_rows !==
        0 ||
      typedJob.inserted_rows !==
        0 ||
      typedJob.failed_rows !==
        0
    ) {
      throw new GoogleAdsAllDataProcessingCheckpointError(
        "INVALID_COUNTS",
        "A Google Ads ALL-DATA job with saved rows must contain a processing checkpoint.",
      );
    }

    return Object.freeze({
      hasCheckpoint:
        false,

      dateWindowIndex:
        null,

      phase:
        null,

      cursor:
        null,

      nextRowIndex:
        0,

      complete:
        false,
    });
  }

  if (
    checkpoint.version !==
      1
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Google Ads ALL-DATA processing checkpoint version is invalid.",
    );
  }

  requireExactString(
    checkpoint.execution_contract,
    GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT,
    "processing_checkpoint.execution_contract",
  );

  const dateWindowIndex =
    requireNonNegativeInteger(
      checkpoint.date_window_index,
      "processing_checkpoint.date_window_index",
    );

  const nextRowIndex =
    requireNonNegativeInteger(
      checkpoint.next_row_index,
      "processing_checkpoint.next_row_index",
    );

  const rawRows =
    requireNonNegativeInteger(
      checkpoint.raw_rows,
      "processing_checkpoint.raw_rows",
    );

  const normalizedRows =
    requireNonNegativeInteger(
      checkpoint.normalized_rows,
      "processing_checkpoint.normalized_rows",
    );

  const insertedRows =
    requireNonNegativeInteger(
      checkpoint.inserted_rows,
      "processing_checkpoint.inserted_rows",
    );

  const failedRows =
    requireNonNegativeInteger(
      checkpoint.failed_rows,
      "processing_checkpoint.failed_rows",
    );

  if (
    typeof checkpoint.complete !==
      "boolean"
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "processing_checkpoint.complete must be boolean.",
    );
  }

  if (
    rawRows !==
      normalizedRows ||
    normalizedRows !==
      insertedRows ||
    insertedRows !==
      nextRowIndex ||
    failedRows !==
      0
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads ALL-DATA checkpoint row counts are inconsistent.",
    );
  }

  if (
    rawRows !==
      typedJob.raw_rows ||
    normalizedRows !==
      typedJob.normalized_rows ||
    insertedRows !==
      typedJob.inserted_rows ||
    failedRows !==
      typedJob.failed_rows
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_COUNTS",
      "The persisted Google Ads ALL-DATA checkpoint counts do not match the claimed job.",
    );
  }

  if (
    !isPlainObject(
      checkpoint.collector,
    )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Google Ads ALL-DATA collector checkpoint is invalid.",
    );
  }

  const collector =
    checkpoint.collector;

  if (
    collector.google_version !==
      1 ||
    collector.all_data_version !==
      1 ||
    collector.date_window_index !==
      dateWindowIndex ||
    collector.next_row_index !==
      nextRowIndex ||
    collector.complete !==
      checkpoint.complete
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Google Ads ALL-DATA collector checkpoint identity is invalid.",
    );
  }

  let routing:
    GoogleAdsAllDataProductRoutingState |
    null;

  try {
    routing =
      readGoogleAdsAllDataProductRoutingState({
        collector,
        complete:
          checkpoint.complete,
      });
  } catch (error) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Google Ads ALL-DATA product routing checkpoint is invalid.",
      {
        cause:
          error,
      },
    );
  }

  const phase =
    collector.phase;

  if (
    phase !==
      "product_boundary" &&
    phase !==
      "keyword" &&
    phase !==
      "search_ad" &&
    phase !==
      "demand_gen_ad" &&
    phase !==
      "completed"
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Google Ads ALL-DATA checkpoint phase is invalid.",
    );
  }

  if (
    checkpoint.complete
  ) {
    if (
      phase !==
        "completed" ||
      collector.cursor !==
        null
    ) {
      throw new GoogleAdsAllDataProcessingCheckpointError(
        "INVALID_CHECKPOINT",
        "A completed Google Ads ALL-DATA checkpoint must be completed with no resume cursor.",
      );
    }

    return Object.freeze({
      hasCheckpoint:
        true,

      dateWindowIndex,

      phase:
        "completed" as const,

      cursor:
        null,

      ...(
        routing ===
        null
          ? {}
          : {
              routing,
            }
      ),

      nextRowIndex,

      complete:
        true,
    });
  }

  if (
    phase ===
      "completed"
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "A partial Google Ads ALL-DATA checkpoint cannot use the completed phase.",
    );
  }

  if (
    phase ===
      "product_boundary"
  ) {
    if (
      collector.cursor !==
        null ||
      routing ===
        null ||
      routing.complete
    ) {
      throw new GoogleAdsAllDataProcessingCheckpointError(
        "INVALID_CHECKPOINT",
        "A Google Ads ALL-DATA product boundary requires durable incomplete routing state with no page cursor.",
      );
    }

    return Object.freeze({
      hasCheckpoint:
        true,

      dateWindowIndex,

      phase,

      cursor:
        null,

      routing,

      nextRowIndex,

      complete:
        false,
    });
  }

  const cursor =
    validateCursor({
      value:
        collector.cursor,

      phase,

      job:
        typedJob,

      dateWindowIndex,

      nextRowIndex,
    });

  return Object.freeze({
    hasCheckpoint:
      true,

    dateWindowIndex,

    phase,

    cursor,

    ...(
      routing ===
      null
        ? {}
        : {
            routing,
          }
    ),

    nextRowIndex,

    complete:
      false,
  });
}
