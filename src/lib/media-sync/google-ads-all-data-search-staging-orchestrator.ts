import type {
  GoogleAdsKeywordStatsCollectorDependencies,
  GoogleAdsKeywordStatsCollectorOptions,
} from "./google-ads-keyword-stats-collector";
import {
  runGoogleAdsKeywordStagingOrchestrator,
  type GoogleAdsKeywordStagingCursor,
  type GoogleAdsKeywordStagingOrchestratorInput,
  type GoogleAdsKeywordStagingOrchestratorResult,
} from "./google-ads-keyword-staging-orchestrator";
import type {
  GoogleAdsSearchAdStatsCollectorDependencies,
  GoogleAdsSearchAdStatsCollectorOptions,
} from "./google-ads-search-ad-stats-collector";
import {
  runGoogleAdsSearchAdStagingOrchestrator,
  type GoogleAdsSearchAdStagingCursor,
  type GoogleAdsSearchAdStagingOrchestratorInput,
  type GoogleAdsSearchAdStagingOrchestratorResult,
} from "./google-ads-search-ad-staging-orchestrator";
import type {
  MediaSyncStagingRepositoryDependencies,
} from "./media-sync-staging-repository";
import {
  isValidMediaSyncDateRange,
  type MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

const PROCESSING_STATUS =
  "processing" as const;

type UnknownRecord =
  Record<string, unknown>;

type MediaSyncJobWithExecutionContract =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract?: unknown;
  }>;

export type GoogleAdsAllDataSearchStagingPhase =
  | "keyword"
  | "search_ad";

export type GoogleAdsAllDataSearchStagingOrchestratorErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "INVALID_CURSOR"
  | "INVALID_STAGE_RESULT";

export class GoogleAdsAllDataSearchStagingOrchestratorError
  extends Error {
  readonly code:
    GoogleAdsAllDataSearchStagingOrchestratorErrorCode;

  constructor(
    code:
      GoogleAdsAllDataSearchStagingOrchestratorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataSearchStagingOrchestratorError";

    this.code =
      code;
  }
}

export type GoogleAdsAllDataSearchStagingCursor =
  Readonly<{
    version: 1;

    phase:
      GoogleAdsAllDataSearchStagingPhase;

    externalAccountId: string;

    dateWindowIndex: number;

    dateFrom: string;

    dateTo: string;

    expectedRowStartIndex: number;

    phaseCursor:
      | GoogleAdsKeywordStagingCursor
      | GoogleAdsSearchAdStagingCursor
      | null;
  }>;

export type GoogleAdsAllDataSearchStagingCheckpoint =
  Readonly<{
    version: 1;

    phaseRun:
      GoogleAdsAllDataSearchStagingPhase;

    nextPhase:
      GoogleAdsAllDataSearchStagingPhase |
      null;

    nextRowIndex: number;

    totalRows: number;

    failedRows: 0;

    complete: boolean;

    cursor:
      GoogleAdsAllDataSearchStagingCursor |
      null;
  }>;

export type GoogleAdsAllDataSearchStagingOrchestratorInput =
  Readonly<{
    job:
      MediaSyncJobRecord;

    accessToken:
      string;

    developerToken:
      string;

    loginCustomerId?:
      unknown;

    dateWindowIndex:
      number;

    cursor?:
      unknown;

    keywordCollectorDependencies?:
      GoogleAdsKeywordStatsCollectorDependencies;

    keywordCollectorOptions?:
      GoogleAdsKeywordStatsCollectorOptions;

    searchAdCollectorDependencies?:
      GoogleAdsSearchAdStatsCollectorDependencies;

    searchAdCollectorOptions?:
      GoogleAdsSearchAdStatsCollectorOptions;

    stagingRepositoryDependencies?:
      MediaSyncStagingRepositoryDependencies;
  }>;

type RunKeywordStage =
  (
    input:
      GoogleAdsKeywordStagingOrchestratorInput,
  ) => Promise<
    GoogleAdsKeywordStagingOrchestratorResult
  >;

type RunSearchAdStage =
  (
    input:
      GoogleAdsSearchAdStagingOrchestratorInput,
  ) => Promise<
    GoogleAdsSearchAdStagingOrchestratorResult
  >;

export type GoogleAdsAllDataSearchStagingOrchestratorDependencies =
  Readonly<{
    runKeywordStage?:
      RunKeywordStage;

    runSearchAdStage?:
      RunSearchAdStage;
  }>;

export type GoogleAdsAllDataSearchStagingOrchestratorResult =
  Readonly<{
    jobId: string;

    dateWindowIndex: number;

    phaseRun:
      GoogleAdsAllDataSearchStagingPhase;

    nextPhase:
      GoogleAdsAllDataSearchStagingPhase |
      null;

    rowStartIndex: number;

    nextRowIndex: number;

    runCanonicalRowCount: number;

    status:
      | "partial"
      | "completed";

    isComplete: boolean;

    apiPageExecutionCount: 1;

    stageResult:
      | GoogleAdsKeywordStagingOrchestratorResult
      | GoogleAdsSearchAdStagingOrchestratorResult;

    checkpoint:
      GoogleAdsAllDataSearchStagingCheckpoint;
  }>;

type ValidatedJob =
  Readonly<{
    jobId: string;
    externalAccountId: string;
    dateFrom: string;
    dateTo: string;
    rowStartIndex: number;
  }>;

type ResolvedPhase =
  Readonly<{
    phase:
      GoogleAdsAllDataSearchStagingPhase;

    phaseCursor:
      | GoogleAdsKeywordStagingCursor
      | GoogleAdsSearchAdStagingCursor
      | null
      | undefined;
  }>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength =
    2_000,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_JOB",
      `${fieldName} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_JOB",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
  code:
    GoogleAdsAllDataSearchStagingOrchestratorErrorCode =
      "INVALID_INPUT",
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      code,
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function validateJob(
  job:
    MediaSyncJobRecord,
): ValidatedJob {
  if (
    !job ||
    typeof job !== "object"
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA Search staging job is required.",
    );
  }

  const typedJob =
    job as
      MediaSyncJobWithExecutionContract;

  const jobId =
    normalizeRequiredString(
      typedJob.id,
      "job.id",
      500,
    );

  normalizeRequiredString(
    typedJob.report_id,
    "job.report_id",
    500,
  );

  normalizeRequiredString(
    typedJob.workspace_id,
    "job.workspace_id",
    500,
  );

  normalizeRequiredString(
    typedJob.connection_id,
    "job.connection_id",
    500,
  );

  const externalAccountId =
    normalizeRequiredString(
      typedJob.external_account_id,
      "job.external_account_id",
      500,
    );

  if (
    typedJob.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_JOB",
      "Google Ads ALL-DATA Search staging requires a Google Ads job.",
    );
  }

  if (
    typedJob.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_JOB",
      "Google Ads ALL-DATA Search staging requires google_all_data_v1.",
    );
  }

  if (
    typedJob.status !==
      PROCESSING_STATUS
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_JOB",
      "Google Ads ALL-DATA Search staging requires a processing job.",
    );
  }

  const dateFrom =
    normalizeRequiredString(
      typedJob.date_from,
      "job.date_from",
      10,
    );

  const dateTo =
    normalizeRequiredString(
      typedJob.date_to,
      "job.date_to",
      10,
    );

  if (
    !isValidMediaSyncDateRange(
      dateFrom,
      dateTo,
    )
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_JOB",
      "Google Ads ALL-DATA Search staging date range is invalid.",
    );
  }

  if (
    typeof typedJob.started_at !==
      "string" ||
    !typedJob.started_at.trim() ||
    typeof typedJob.attempt_count !==
      "number" ||
    !Number.isInteger(
      typedJob.attempt_count,
    ) ||
    typedJob.attempt_count < 1
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_JOB",
      "Google Ads ALL-DATA Search staging claim state is invalid.",
    );
  }

  const rowStartIndex =
    normalizeNonNegativeInteger(
      typedJob.inserted_rows,
      "job.inserted_rows",
      "INVALID_JOB",
    );

  return Object.freeze({
    jobId,
    externalAccountId,
    dateFrom,
    dateTo,
    rowStartIndex,
  });
}

function resolvePhase(
  input: Readonly<{
    cursor: unknown;
    job: ValidatedJob;
    dateWindowIndex: number;
  }>,
): ResolvedPhase {
  if (
    input.cursor === undefined ||
    input.cursor === null
  ) {
    return Object.freeze({
      phase:
        "keyword" as const,

      phaseCursor:
        undefined,
    });
  }

  if (
    !isPlainObject(
      input.cursor,
    )
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_CURSOR",
      "Google Ads ALL-DATA Search staging cursor must be an object.",
    );
  }

  const cursor =
    input.cursor;

  if (
    cursor.version !== 1 ||
    (
      cursor.phase !==
        "keyword" &&
      cursor.phase !==
        "search_ad"
    ) ||
    cursor.externalAccountId !==
      input.job.externalAccountId ||
    cursor.dateWindowIndex !==
      input.dateWindowIndex ||
    cursor.dateFrom !==
      input.job.dateFrom ||
    cursor.dateTo !==
      input.job.dateTo
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_CURSOR",
      "Google Ads ALL-DATA Search staging cursor scope is invalid.",
    );
  }

  if (
    cursor.expectedRowStartIndex !==
      input.job.rowStartIndex
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_CURSOR",
      "Google Ads ALL-DATA Search staging cursor row boundary does not match job.inserted_rows.",
    );
  }

  if (
    cursor.phase ===
      "keyword"
  ) {
    if (
      !isPlainObject(
        cursor.phaseCursor,
      )
    ) {
      throw new GoogleAdsAllDataSearchStagingOrchestratorError(
        "INVALID_CURSOR",
        "Keyword phase requires a keyword staging cursor.",
      );
    }
  } else if (
    cursor.phaseCursor !==
      null &&
    !isPlainObject(
      cursor.phaseCursor,
    )
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_CURSOR",
      "Search ad phase cursor is invalid.",
    );
  }

  return Object.freeze({
    phase:
      cursor.phase as
        GoogleAdsAllDataSearchStagingPhase,

    phaseCursor:
      cursor.phaseCursor as
        | GoogleAdsKeywordStagingCursor
        | GoogleAdsSearchAdStagingCursor
        | null,
  });
}

function buildCursor(
  input: Readonly<{
    phase:
      GoogleAdsAllDataSearchStagingPhase;
    phaseCursor:
      | GoogleAdsKeywordStagingCursor
      | GoogleAdsSearchAdStagingCursor
      | null;
    job:
      ValidatedJob;
    dateWindowIndex: number;
    expectedRowStartIndex: number;
  }>,
): GoogleAdsAllDataSearchStagingCursor {
  return Object.freeze({
    version:
      1 as const,

    phase:
      input.phase,

    externalAccountId:
      input.job.externalAccountId,

    dateWindowIndex:
      input.dateWindowIndex,

    dateFrom:
      input.job.dateFrom,

    dateTo:
      input.job.dateTo,

    expectedRowStartIndex:
      input.expectedRowStartIndex,

    phaseCursor:
      input.phaseCursor,
  });
}

function validateStageBoundary(
  input: Readonly<{
    phase:
      GoogleAdsAllDataSearchStagingPhase;

    job:
      ValidatedJob;

    dateWindowIndex:
      number;

    result:
      | GoogleAdsKeywordStagingOrchestratorResult
      | GoogleAdsSearchAdStagingOrchestratorResult;
  }>,
): void {
  const {
    result,
    job,
    dateWindowIndex,
  } = input;

  if (
    result.jobId !==
      job.jobId ||
    result.dateWindowIndex !==
      dateWindowIndex ||
    result.rowStartIndex !==
      job.rowStartIndex
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_STAGE_RESULT",
      `${input.phase} staging result scope is invalid.`,
    );
  }

  if (
    !Number.isSafeInteger(
      result.runCanonicalRowCount,
    ) ||
    result.runCanonicalRowCount < 0
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_STAGE_RESULT",
      `${input.phase} staging row count is invalid.`,
    );
  }

  const expectedNextRowIndex =
    job.rowStartIndex +
    result.runCanonicalRowCount;

  if (
    result.nextRowIndex !==
      expectedNextRowIndex ||
    result.checkpoint.nextRowIndex !==
      expectedNextRowIndex ||
    result.checkpoint.complete !==
      result.isComplete
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_STAGE_RESULT",
      `${input.phase} staging boundary is invalid.`,
    );
  }

  if (
    result.status !==
      (
        result.isComplete
          ? "completed"
          : "partial"
      )
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_STAGE_RESULT",
      `${input.phase} staging status is invalid.`,
    );
  }

  if (
    result.isComplete &&
    result.checkpoint.cursor !==
      null
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_STAGE_RESULT",
      `${input.phase} completed staging result retained a cursor.`,
    );
  }

  if (
    !result.isComplete &&
    result.checkpoint.cursor ===
      null
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_STAGE_RESULT",
      `${input.phase} partial staging result lost its cursor.`,
    );
  }
}

function buildCheckpoint(
  input: Readonly<{
    phaseRun:
      GoogleAdsAllDataSearchStagingPhase;

    nextPhase:
      GoogleAdsAllDataSearchStagingPhase |
      null;

    nextRowIndex: number;

    complete: boolean;

    cursor:
      GoogleAdsAllDataSearchStagingCursor |
      null;
  }>,
): GoogleAdsAllDataSearchStagingCheckpoint {
  return Object.freeze({
    version:
      1 as const,

    phaseRun:
      input.phaseRun,

    nextPhase:
      input.nextPhase,

    nextRowIndex:
      input.nextRowIndex,

    totalRows:
      input.nextRowIndex,

    failedRows:
      0 as const,

    complete:
      input.complete,

    cursor:
      input.cursor,
  });
}

export async function runGoogleAdsAllDataSearchStagingOrchestrator(
  input:
    GoogleAdsAllDataSearchStagingOrchestratorInput,
  dependencies:
    GoogleAdsAllDataSearchStagingOrchestratorDependencies = {},
): Promise<
  GoogleAdsAllDataSearchStagingOrchestratorResult
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new GoogleAdsAllDataSearchStagingOrchestratorError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA Search staging orchestration input is required.",
    );
  }

  const job =
    validateJob(
      input.job,
    );

  const dateWindowIndex =
    normalizeNonNegativeInteger(
      input.dateWindowIndex,
      "dateWindowIndex",
    );

  const resolved =
    resolvePhase({
      cursor:
        input.cursor,
      job,
      dateWindowIndex,
    });

  if (
    resolved.phase ===
      "keyword"
  ) {
    const runKeywordStage =
      dependencies.runKeywordStage ??
      runGoogleAdsKeywordStagingOrchestrator;

    const stageResult =
      await runKeywordStage({
        job:
          input.job,

        accessToken:
          input.accessToken,

        developerToken:
          input.developerToken,

        loginCustomerId:
          input.loginCustomerId,

        dateWindowIndex,

        cursor:
          resolved.phaseCursor,

        collectorDependencies:
          input.keywordCollectorDependencies,

        collectorOptions:
          input.keywordCollectorOptions,

        stagingRepositoryDependencies:
          input.stagingRepositoryDependencies,
      });

    validateStageBoundary({
      phase:
        "keyword",
      job,
      dateWindowIndex,
      result:
        stageResult,
    });

    const nextRowIndex =
      stageResult.nextRowIndex;

    if (
      !stageResult.isComplete
    ) {
      const keywordCursor =
        stageResult.checkpoint.cursor;

      if (!keywordCursor) {
        throw new GoogleAdsAllDataSearchStagingOrchestratorError(
          "INVALID_STAGE_RESULT",
          "Keyword partial result lost its staging cursor.",
        );
      }

      const cursor =
        buildCursor({
          phase:
            "keyword",

          phaseCursor:
            keywordCursor,

          job,

          dateWindowIndex,

          expectedRowStartIndex:
            nextRowIndex,
        });

      return Object.freeze({
        jobId:
          job.jobId,

        dateWindowIndex,

        phaseRun:
          "keyword" as const,

        nextPhase:
          "keyword" as const,

        rowStartIndex:
          job.rowStartIndex,

        nextRowIndex,

        runCanonicalRowCount:
          stageResult.runCanonicalRowCount,

        status:
          "partial" as const,

        isComplete:
          false,

        apiPageExecutionCount:
          1 as const,

        stageResult,

        checkpoint:
          buildCheckpoint({
            phaseRun:
              "keyword",

            nextPhase:
              "keyword",

            nextRowIndex,

            complete:
              false,

            cursor,
          }),
      });
    }

    const transitionCursor =
      buildCursor({
        phase:
          "search_ad",

        phaseCursor:
          null,

        job,

        dateWindowIndex,

        expectedRowStartIndex:
          nextRowIndex,
      });

    return Object.freeze({
      jobId:
        job.jobId,

      dateWindowIndex,

      phaseRun:
        "keyword" as const,

      nextPhase:
        "search_ad" as const,

      rowStartIndex:
        job.rowStartIndex,

      nextRowIndex,

      runCanonicalRowCount:
        stageResult.runCanonicalRowCount,

      status:
        "partial" as const,

      isComplete:
        false,

      apiPageExecutionCount:
        1 as const,

      stageResult,

      checkpoint:
        buildCheckpoint({
          phaseRun:
            "keyword",

          nextPhase:
            "search_ad",

          nextRowIndex,

          complete:
            false,

          cursor:
            transitionCursor,
        }),
    });
  }

  const runSearchAdStage =
    dependencies.runSearchAdStage ??
    (
      (
        stageInput:
          GoogleAdsSearchAdStagingOrchestratorInput,
      ) =>
        runGoogleAdsSearchAdStagingOrchestrator(
          stageInput,
        )
    );

  const stageResult =
    await runSearchAdStage({
      job:
        input.job,

      accessToken:
        input.accessToken,

      developerToken:
        input.developerToken,

      loginCustomerId:
        input.loginCustomerId,

      dateWindowIndex,

      cursor:
        resolved.phaseCursor,

      collectorDependencies:
        input.searchAdCollectorDependencies,

      collectorOptions:
        input.searchAdCollectorOptions,

      stagingRepositoryDependencies:
        input.stagingRepositoryDependencies,
    });

  validateStageBoundary({
    phase:
      "search_ad",
    job,
    dateWindowIndex,
    result:
      stageResult,
  });

  const nextRowIndex =
    stageResult.nextRowIndex;

  if (
    !stageResult.isComplete
  ) {
    const searchAdCursor =
      stageResult.checkpoint.cursor;

    if (!searchAdCursor) {
      throw new GoogleAdsAllDataSearchStagingOrchestratorError(
        "INVALID_STAGE_RESULT",
        "Search ad partial result lost its staging cursor.",
      );
    }

    const cursor =
      buildCursor({
        phase:
          "search_ad",

        phaseCursor:
          searchAdCursor,

        job,

        dateWindowIndex,

        expectedRowStartIndex:
          nextRowIndex,
      });

    return Object.freeze({
      jobId:
        job.jobId,

      dateWindowIndex,

      phaseRun:
        "search_ad" as const,

      nextPhase:
        "search_ad" as const,

      rowStartIndex:
        job.rowStartIndex,

      nextRowIndex,

      runCanonicalRowCount:
        stageResult.runCanonicalRowCount,

      status:
        "partial" as const,

      isComplete:
        false,

      apiPageExecutionCount:
        1 as const,

      stageResult,

      checkpoint:
        buildCheckpoint({
          phaseRun:
            "search_ad",

          nextPhase:
            "search_ad",

          nextRowIndex,

          complete:
            false,

          cursor,
        }),
    });
  }

  return Object.freeze({
    jobId:
      job.jobId,

    dateWindowIndex,

    phaseRun:
      "search_ad" as const,

    nextPhase:
      null,

    rowStartIndex:
      job.rowStartIndex,

    nextRowIndex,

    runCanonicalRowCount:
      stageResult.runCanonicalRowCount,

    status:
      "completed" as const,

    isComplete:
      true,

    apiPageExecutionCount:
      1 as const,

    stageResult,

    checkpoint:
      buildCheckpoint({
        phaseRun:
          "search_ad",

        nextPhase:
          null,

        nextRowIndex,

        complete:
          true,

        cursor:
          null,
      }),
  });
}
