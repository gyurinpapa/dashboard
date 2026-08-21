// src/lib/media-sync/google-ads-media-sync-processing-checkpoint.ts

import type {
  GoogleAdsKeywordStagingCursor,
} from "./google-ads-keyword-staging-orchestrator";
import type {
  MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const PROCESSING_STATUS =
  "processing" as const;

const PROCESSING_CHECKPOINT_KEY =
  "processing_checkpoint" as const;

export type GoogleAdsMediaSyncProcessingCheckpointErrorCode =
  | "INVALID_JOB"
  | "UNSUPPORTED_PROVIDER"
  | "JOB_NOT_PROCESSING"
  | "INVALID_CHECKPOINT"
  | "INVALID_COUNTS"
  | "CHECKPOINT_SCOPE_MISMATCH";

export class GoogleAdsMediaSyncProcessingCheckpointError
  extends Error {
  readonly code:
    GoogleAdsMediaSyncProcessingCheckpointErrorCode;

  constructor(
    code:
      GoogleAdsMediaSyncProcessingCheckpointErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsMediaSyncProcessingCheckpointError";

    this.code =
      code;
  }
}

export type GoogleAdsMediaSyncProcessingCheckpointState =
  Readonly<{
    hasCheckpoint: boolean;
    dateWindowIndex: number | null;
    cursor: GoogleAdsKeywordStagingCursor | null;
    nextRowIndex: number;
    completedPageCount: number;
    complete: boolean;
  }>;

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
    prototype === Object.prototype ||
    prototype === null
  );
}

function requireNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function requirePositiveInteger(
  value: unknown,
  fieldName: string,
): number {
  const normalized =
    requireNonNegativeInteger(
      value,
      fieldName,
    );

  if (normalized < 1) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      `${fieldName} must be at least 1.`,
    );
  }

  return normalized;
}

function validateJob(
  job: MediaSyncJobRecord,
): void {
  if (
    !job ||
    typeof job !== "object"
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_JOB",
      "A media sync job record is required.",
    );
  }

  if (
    job.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "UNSUPPORTED_PROVIDER",
      "Only Google Ads media sync checkpoints are supported.",
    );
  }

  if (
    job.status !==
      PROCESSING_STATUS
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "JOB_NOT_PROCESSING",
      "The Google Ads media sync job must be processing.",
    );
  }

  if (
    typeof job.started_at !== "string" ||
    !job.started_at.trim() ||
    !Number.isSafeInteger(job.attempt_count) ||
    job.attempt_count < 1 ||
    job.error !== null
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_JOB",
      "The Google Ads media sync job has an invalid processing claim state.",
    );
  }
}

function requireFreshCounts(
  job: MediaSyncJobRecord,
): void {
  if (
    job.raw_rows !== 0 ||
    job.normalized_rows !== 0 ||
    job.inserted_rows !== 0 ||
    job.failed_rows !== 0
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_COUNTS",
      "A fresh Google Ads job cannot contain persisted row counts.",
    );
  }
}

function readCheckpointObject(
  value: unknown,
): UnknownRecord | null {
  if (value === null) {
    return null;
  }

  if (!isPlainObject(value)) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "Google Ads error_detail must be an object or null.",
    );
  }

  const keys =
    Object.keys(value);

  if (keys.length === 0) {
    return null;
  }

  if (
    keys.length !== 1 ||
    keys[0] !==
      PROCESSING_CHECKPOINT_KEY ||
    !isPlainObject(
      value[
        PROCESSING_CHECKPOINT_KEY
      ],
    )
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "Google Ads error_detail must contain only processing_checkpoint.",
    );
  }

  return value[
    PROCESSING_CHECKPOINT_KEY
  ] as UnknownRecord;
}

function readCursor(
  value: unknown,
  input: Readonly<{
    job: MediaSyncJobRecord;
    dateWindowIndex: number;
  }>,
): GoogleAdsKeywordStagingCursor {
  if (!isPlainObject(value)) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "A partial Google Ads checkpoint must contain a resume cursor.",
    );
  }

  if (
    value.version !== 1 ||
    value.externalAccountId !==
      input.job.external_account_id ||
    value.dateWindowIndex !==
      input.dateWindowIndex ||
    value.dateFrom !==
      input.job.date_from ||
    value.dateTo !==
      input.job.date_to ||
    !isPlainObject(value.page) ||
    value.page.version !== 1 ||
    typeof value.page.page !== "string" ||
    !value.page.page.trim() ||
    typeof value.page.pageIndex !== "number" ||
    !Number.isSafeInteger(value.page.pageIndex) ||
    value.page.pageIndex < 1
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "CHECKPOINT_SCOPE_MISMATCH",
      "The Google Ads resume cursor does not match the claimed job scope.",
    );
  }

  return value as unknown as
    GoogleAdsKeywordStagingCursor;
}

export function readGoogleAdsMediaSyncProcessingCheckpoint(
  job: MediaSyncJobRecord,
): GoogleAdsMediaSyncProcessingCheckpointState {
  validateJob(job);

  const checkpoint =
    readCheckpointObject(
      job.error_detail,
    );

  if (!checkpoint) {
    requireFreshCounts(job);

    return Object.freeze({
      hasCheckpoint: false,
      dateWindowIndex: null,
      cursor: null,
      nextRowIndex: 0,
      completedPageCount: 0,
      complete: false,
    });
  }

  if (checkpoint.version !== 1) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Google Ads processing checkpoint version is invalid.",
    );
  }

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

  if (typeof checkpoint.complete !== "boolean") {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "processing_checkpoint.complete must be boolean.",
    );
  }

  if (!isPlainObject(checkpoint.collector)) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Google Ads collector checkpoint is invalid.",
    );
  }

  const collector =
    checkpoint.collector;

  if (
    collector.google_version !== 1 ||
    collector.phase !== "keyword"
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_CHECKPOINT",
      "The Google Ads collector checkpoint identity is invalid.",
    );
  }

  const completedPageCount =
    requirePositiveInteger(
      collector.completed_page_count,
      "processing_checkpoint.collector.completed_page_count",
    );

  if (
    rawRows !== normalizedRows ||
    rawRows !== insertedRows ||
    rawRows !== nextRowIndex ||
    failedRows !== 0 ||
    rawRows !== job.raw_rows ||
    normalizedRows !== job.normalized_rows ||
    insertedRows !== job.inserted_rows ||
    failedRows !== job.failed_rows
  ) {
    throw new GoogleAdsMediaSyncProcessingCheckpointError(
      "INVALID_COUNTS",
      "The persisted Google Ads checkpoint counts do not match the claimed job.",
    );
  }

  const complete =
    checkpoint.complete;

  if (complete) {
    if (collector.cursor !== null) {
      throw new GoogleAdsMediaSyncProcessingCheckpointError(
        "INVALID_CHECKPOINT",
        "A completed Google Ads checkpoint must not contain a resume cursor.",
      );
    }

    return Object.freeze({
      hasCheckpoint: true,
      dateWindowIndex,
      cursor: null,
      nextRowIndex,
      completedPageCount,
      complete: true,
    });
  }

  const cursor =
    readCursor(
      collector.cursor,
      {
        job,
        dateWindowIndex,
      },
    );

  return Object.freeze({
    hasCheckpoint: true,
    dateWindowIndex,
    cursor,
    nextRowIndex,
    completedPageCount,
    complete: false,
  });
}
