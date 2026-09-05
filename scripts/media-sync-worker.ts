// scripts/media-sync-worker.ts

import { setTimeout as delay } from "node:timers/promises";

import {
  recoverStaleProcessingNaverMediaSyncJobs,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  MediaSyncWorkerOrchestrationError,
  processNextNaverMediaSyncJob,
} from "../src/lib/media-sync/media-sync-worker-orchestration-repository";
import {
  processNextGoogleAdsMediaSyncJob,
} from "../src/lib/media-sync/google-ads-media-sync-worker-orchestration-repository";

const WORKER_NAME =
  "media-sync-worker";

const ENABLED_ENV =
  "MEDIA_SYNC_WORKER_ENABLED";

const GOOGLE_ADS_ENABLED_ENV =
  "MEDIA_SYNC_WORKER_GOOGLE_ADS_ENABLED";

const LOOP_ENV =
  "MEDIA_SYNC_WORKER_LOOP";

const MAX_JOBS_ENV =
  "MEDIA_SYNC_WORKER_MAX_JOBS";

const POLL_INTERVAL_MS_ENV =
  "MEDIA_SYNC_WORKER_POLL_INTERVAL_MS";

const IDLE_EXIT_ENV =
  "MEDIA_SYNC_WORKER_EXIT_WHEN_IDLE";

const JOB_TIMEOUT_MS_ENV =
  "MEDIA_SYNC_WORKER_JOB_TIMEOUT_MS";

const CLAIM_WORK_BUDGET_MS_ENV =
  "MEDIA_SYNC_WORKER_CLAIM_WORK_BUDGET_MS";

const STALE_PROCESSING_MS_ENV =
  "MEDIA_SYNC_WORKER_STALE_PROCESSING_MS";

const REQUEST_INTERVAL_MS_ENV =
  "MEDIA_SYNC_WORKER_REQUEST_INTERVAL_MS";

const MAX_KEYWORD_STATS_PER_RUN_ENV =
  "MEDIA_SYNC_WORKER_MAX_KEYWORD_STATS_PER_RUN";

const MAX_STATS_REQUESTS_PER_RUN_ENV =
  "MEDIA_SYNC_WORKER_MAX_STATS_REQUESTS_PER_RUN";

const MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN_ENV =
  "MEDIA_SYNC_WORKER_MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN";

const MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN_ENV =
  "MEDIA_SYNC_WORKER_MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN";

const MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN_ENV =
  "MEDIA_SYNC_WORKER_MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN";

const MATERIALIZATION_BATCH_SIZE_ENV =
  "MEDIA_SYNC_WORKER_MATERIALIZATION_BATCH_SIZE";

const MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN_ENV =
  "MEDIA_SYNC_WORKER_MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN";

const DEFAULT_POLL_INTERVAL_MS =
  15_000;

const DEFAULT_JOB_TIMEOUT_MS =
  10 * 60 * 1_000;

const DEFAULT_MAX_KEYWORD_STATS_PER_RUN =
  500;

const DEFAULT_MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN =
  500;

const DEFAULT_STALE_PROCESSING_MS =
  60 * 60 * 1_000;

const DEFAULT_REQUEST_INTERVAL_MS =
  1_000;

const MIN_REQUEST_INTERVAL_MS =
  250;

const MAX_REQUEST_INTERVAL_MS =
  60_000;

const MIN_POLL_INTERVAL_MS =
  5_000;

const MAX_POLL_INTERVAL_MS =
  10 * 60 * 1_000;

const MIN_JOB_TIMEOUT_MS =
  30_000;

const MAX_JOB_TIMEOUT_MS =
  60 * 60 * 1_000;

const MIN_CLAIM_WORK_BUDGET_MS =
  5_000;

const CLAIM_WORK_BUDGET_DEFAULT_RATIO =
  2 / 3;

const CLAIM_WORK_BUDGET_MAX_RATIO =
  0.9;

const MIN_STALE_PROCESSING_MS =
  5 * 60 * 1_000;

const MAX_STALE_PROCESSING_MS =
  24 * 60 * 60 * 1_000;

const MAX_JOBS_UPPER_BOUND =
  1_000;

const MAX_KEYWORD_STATS_PER_RUN_UPPER_BOUND =
  10_000;

const MAX_STATS_REQUESTS_PER_RUN_UPPER_BOUND =
  10_000;

const MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN_UPPER_BOUND =
  10_000;

const MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN_UPPER_BOUND =
  10_000;

const MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN_UPPER_BOUND =
  100_000;

const MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN_UPPER_BOUND =
  100_000;

const MATERIALIZATION_BATCH_SIZE_UPPER_BOUND =
  5_000;

type WorkerRuntimeOptions = {
  enabled: boolean;
  loop: boolean;
  maxJobs?: number;
  pollIntervalMs: number;
  exitWhenIdle: boolean;
  jobTimeoutMs: number;
  claimWorkBudgetMs: number;
  staleProcessingMs: number;
  requestIntervalMs: number;
  maxKeywordStatsPerRun?: number;
  maxStatsRequestsPerRun?: number;
  maxKeywordDiscoveryPagesPerRun?: number;
  maxAuthoritativeEntityStatsPerRun?: number;
  maxAuthoritativeStatsRequestsPerRun?: number;
  maxAuthoritativeDiscoveryPagesPerRun?: number;

  /**
   * True only when no bounded-run environment variable was explicitly
   * supplied by the operator. Runtime fallback safety limits alone do
   * not disable authoritative overlap.
   */
  enableAuthoritativeOverlap: boolean;

  materializationBatchSize?: number;
};

type SafeErrorLog = {
  name: string;
  message: string;
  code: string | null;
  causeName: string | null;
  causeCode: string | null;
  causeMessage: string | null;
};

function readBooleanEnv(
  name: string,
): boolean {
  const value =
    String(process.env[name] ?? "")
      .trim()
      .toLowerCase();

  return (
    value === "1" ||
    value === "true" ||
    value === "yes" ||
    value === "on"
  );
}

function readPositiveIntegerEnv(input: {
  name: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const rawValue =
    String(process.env[input.name] ?? "")
      .trim();

  if (!rawValue) {
    return input.fallback;
  }

  const numericValue =
    Number(rawValue);

  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < input.min ||
    numericValue > input.max
  ) {
    throw new Error(
      `${input.name} must be an integer between ${input.min} and ${input.max}.`,
    );
  }

  return numericValue;
}

function readClaimWorkBudgetMs(
  jobTimeoutMs: number,
): number {
  const fallback =
    Math.max(
      MIN_CLAIM_WORK_BUDGET_MS,
      Math.floor(
        jobTimeoutMs *
        CLAIM_WORK_BUDGET_DEFAULT_RATIO,
      ),
    );

  const maximum =
    Math.max(
      MIN_CLAIM_WORK_BUDGET_MS,
      Math.floor(
        jobTimeoutMs *
        CLAIM_WORK_BUDGET_MAX_RATIO,
      ),
    );

  return readPositiveIntegerEnv({
    name:
      CLAIM_WORK_BUDGET_MS_ENV,
    fallback,
    min:
      MIN_CLAIM_WORK_BUDGET_MS,
    max:
      maximum,
  });
}

function hasExplicitNaverBoundedRunEnvironment(): boolean {
  const names = [
    MAX_KEYWORD_STATS_PER_RUN_ENV,
    MAX_STATS_REQUESTS_PER_RUN_ENV,
    MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN_ENV,
    MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN_ENV,
    MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN_ENV,
    MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN_ENV,
  ] as const;

  return names.some(
    (
      name,
    ) =>
      String(
        process.env[name] ??
        "",
      )
        .trim()
        .length >
      0,
  );
}

function readOptionalPositiveIntegerEnv(input: {
  name: string;
  max: number;
}): number | undefined {
  const rawValue =
    String(process.env[input.name] ?? "")
      .trim();

  if (!rawValue) {
    return undefined;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(
      `${input.name} must be a positive integer between 1 and ${input.max}. Received: ${rawValue}`,
    );
  }

  const numericValue =
    Number(rawValue);

  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < 1 ||
    numericValue > input.max
  ) {
    throw new Error(
      `${input.name} must be a positive integer between 1 and ${input.max}. Received: ${rawValue}`,
    );
  }

  return numericValue;
}

function formatOptionalLimit(
  value: number | undefined,
): string {
  return typeof value === "number"
    ? String(value)
    : "unset";
}

function readRuntimeOptions():
  WorkerRuntimeOptions {
  const enabled =
    readBooleanEnv(ENABLED_ENV);

  const loop =
    readBooleanEnv(LOOP_ENV);

  const maxJobs =
    readOptionalPositiveIntegerEnv({
      name:
        MAX_JOBS_ENV,

      max:
        MAX_JOBS_UPPER_BOUND,
    });

  const pollIntervalMs =
    readPositiveIntegerEnv({
      name:
        POLL_INTERVAL_MS_ENV,

      fallback:
        DEFAULT_POLL_INTERVAL_MS,

      min:
        MIN_POLL_INTERVAL_MS,

      max:
        MAX_POLL_INTERVAL_MS,
    });

  const jobTimeoutMs =
    readPositiveIntegerEnv({
      name:
        JOB_TIMEOUT_MS_ENV,

      fallback:
        DEFAULT_JOB_TIMEOUT_MS,

      min:
        MIN_JOB_TIMEOUT_MS,

      max:
        MAX_JOB_TIMEOUT_MS,
    });

  const claimWorkBudgetMs =
    readClaimWorkBudgetMs(
      jobTimeoutMs,
    );

  const staleProcessingMs =
    readPositiveIntegerEnv({
      name:
        STALE_PROCESSING_MS_ENV,

      fallback:
        DEFAULT_STALE_PROCESSING_MS,

      min:
        MIN_STALE_PROCESSING_MS,

      max:
        MAX_STALE_PROCESSING_MS,
    });

  const requestIntervalMs =
    readPositiveIntegerEnv({
      name:
        REQUEST_INTERVAL_MS_ENV,

      fallback:
        DEFAULT_REQUEST_INTERVAL_MS,

      min:
        MIN_REQUEST_INTERVAL_MS,

      max:
        MAX_REQUEST_INTERVAL_MS,
    });

  const maxKeywordStatsPerRun =
    readOptionalPositiveIntegerEnv({
      name:
        MAX_KEYWORD_STATS_PER_RUN_ENV,

      max:
        MAX_KEYWORD_STATS_PER_RUN_UPPER_BOUND,
    }) ??
    DEFAULT_MAX_KEYWORD_STATS_PER_RUN;

  const maxStatsRequestsPerRun =
    readOptionalPositiveIntegerEnv({
      name:
        MAX_STATS_REQUESTS_PER_RUN_ENV,

      max:
        MAX_STATS_REQUESTS_PER_RUN_UPPER_BOUND,
    });

  const maxKeywordDiscoveryPagesPerRun =
    readOptionalPositiveIntegerEnv({
      name:
        MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN_ENV,

      max:
        MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN_UPPER_BOUND,
    });

  const maxAuthoritativeEntityStatsPerRun =
    readOptionalPositiveIntegerEnv({
      name:
        MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN_ENV,

      max:
        MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN_UPPER_BOUND,
    }) ??
    DEFAULT_MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN;

  const maxAuthoritativeStatsRequestsPerRun =
    readOptionalPositiveIntegerEnv({
      name:
        MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN_ENV,

      max:
        MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN_UPPER_BOUND,
    });

  const maxAuthoritativeDiscoveryPagesPerRun =
    readOptionalPositiveIntegerEnv({
      name:
        MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN_ENV,

      max:
        MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN_UPPER_BOUND,
    });

  const enableAuthoritativeOverlap =
    !hasExplicitNaverBoundedRunEnvironment();

  const materializationBatchSize =
    readOptionalPositiveIntegerEnv({
      name:
        MATERIALIZATION_BATCH_SIZE_ENV,

      max:
        MATERIALIZATION_BATCH_SIZE_UPPER_BOUND,
    });

  const exitWhenIdle =
    readBooleanEnv(IDLE_EXIT_ENV);

  return {
    enabled,
    loop,
    maxJobs,
    pollIntervalMs,
    exitWhenIdle,
    jobTimeoutMs,
    claimWorkBudgetMs,
    staleProcessingMs,
    requestIntervalMs,
    maxKeywordStatsPerRun,
    maxStatsRequestsPerRun,
    maxKeywordDiscoveryPagesPerRun,
    maxAuthoritativeEntityStatsPerRun,
    maxAuthoritativeStatsRequestsPerRun,
    maxAuthoritativeDiscoveryPagesPerRun,
    enableAuthoritativeOverlap,
    materializationBatchSize,
  };
}

function toSafeErrorLog(
  error: unknown,
): SafeErrorLog {
  if (
    error instanceof
    MediaSyncWorkerOrchestrationError
  ) {
    const cause =
      error.cause;

    const causeError =
      cause instanceof Error
        ? cause
        : null;

    const causeCode =
      causeError
        ? (causeError as { code?: unknown })
            .code
        : null;

    return {
      name:
        error.name,

      message:
        error.message,

      code:
        error.code,

      causeName:
        causeError?.name ?? null,

      causeCode:
        typeof causeCode === "string"
          ? causeCode
          : null,

      causeMessage:
        causeError?.message ?? null,
    };
  }

  if (error instanceof Error) {
    const maybeCode =
      (error as { code?: unknown }).code;

    return {
      name:
        error.name,

      message:
        error.message,

      code:
        typeof maybeCode === "string"
          ? maybeCode
          : null,

      causeName:
        null,

      causeCode:
        null,

      causeMessage:
        null,
    };
  }

  return {
    name:
      "UnknownError",

    message:
      String(error),

    code:
      null,

    causeName:
      null,

    causeCode:
      null,

    causeMessage:
      null,
  };
}

function logWorkerStart(
  options: WorkerRuntimeOptions,
): void {
  console.log(
    `[${WORKER_NAME}] started`,
  );

  console.log(
    `[${WORKER_NAME}] mode: ${
      options.loop ? "loop" : "single"
    }`,
  );

  console.log(
    `[${WORKER_NAME}] max jobs: ${
      typeof options.maxJobs === "number"
        ? options.maxJobs
        : "unbounded"
    }`,
  );

  console.log(
    `[${WORKER_NAME}] poll interval ms: ${options.pollIntervalMs}`,
  );

  console.log(
    `[${WORKER_NAME}] job timeout ms: ${options.jobTimeoutMs}`,
  );

  console.log(
    `[${WORKER_NAME}] claim work budget ms: ${options.claimWorkBudgetMs}`,
  );

  console.log(
    `[${WORKER_NAME}] stale processing ms: ${options.staleProcessingMs}`,
  );

  console.log(
    `[${WORKER_NAME}] request interval ms: ${options.requestIntervalMs}`,
  );

  console.log(
    `[${WORKER_NAME}] max keyword stats per run: ${
      formatOptionalLimit(options.maxKeywordStatsPerRun)
    }`,
  );

  console.log(
    `[${WORKER_NAME}] max stats requests per run: ${
      formatOptionalLimit(options.maxStatsRequestsPerRun)
    }`,
  );

  console.log(
    `[${WORKER_NAME}] max keyword discovery pages per run: ${
      formatOptionalLimit(options.maxKeywordDiscoveryPagesPerRun)
    }`,
  );

  console.log(
    `[${WORKER_NAME}] max authoritative entity stats per run: ${
      formatOptionalLimit(options.maxAuthoritativeEntityStatsPerRun)
    }`,
  );

  console.log(
    `[${WORKER_NAME}] max authoritative stats requests per run: ${
      formatOptionalLimit(options.maxAuthoritativeStatsRequestsPerRun)
    }`,
  );

  console.log(
    `[${WORKER_NAME}] max authoritative discovery pages per run: ${
      formatOptionalLimit(options.maxAuthoritativeDiscoveryPagesPerRun)
    }`,
  );

  console.log(
    `[${WORKER_NAME}] authoritative overlap enabled: ${
      options.enableAuthoritativeOverlap
    }`,
  );

  console.log(
    `[${WORKER_NAME}] materialization batch size: ${
      formatOptionalLimit(options.materializationBatchSize)
    }`,
  );

  console.log(
    `[${WORKER_NAME}] exit when idle: ${options.exitWhenIdle}`,
  );
}

function logWorkerDisabled(): void {
  console.log(
    `[${WORKER_NAME}] disabled`,
  );

  console.log(
    `[${WORKER_NAME}] set ${ENABLED_ENV}=1 to process media sync jobs`,
  );
}

function logNoJob(): void {
  console.log(
    `[${WORKER_NAME}] no pending Naver media sync job`,
  );
}

function logRecoveredStaleJobs(count: number): void {
  if (count <= 0) {
    return;
  }

  console.warn(
    `[${WORKER_NAME}] recovered stale processing Naver media sync jobs: ${count}`,
  );
}

function logCompletedJob(input: {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  connectionId: string;
  snapshotIngestionId: string;
  expectedRows: number;
}): void {
  console.log(
    `[${WORKER_NAME}] completed job: ${input.jobId}`,
  );

  console.log(
    `[${WORKER_NAME}] report: ${input.reportId}`,
  );

  console.log(
    `[${WORKER_NAME}] workspace: ${input.workspaceId}`,
  );

  console.log(
    `[${WORKER_NAME}] advertiser: ${input.advertiserId}`,
  );

  console.log(
    `[${WORKER_NAME}] connection: ${input.connectionId}`,
  );

  console.log(
    `[${WORKER_NAME}] snapshot ingestion: ${input.snapshotIngestionId}`,
  );

  console.log(
    `[${WORKER_NAME}] rows: ${input.expectedRows}`,
  );
}

function logPartialJob(input: {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  connectionId: string;
  checkpointRows: number;
  phase: string | null;
  partialReason: string | null;
  stagingCanonicalRowCount: number | null;
  stagingRunCanonicalRowCount: number | null;
}): void {
  console.log(
    `[${WORKER_NAME}] partial job released for resume: ${input.jobId}`,
  );

  console.log(
    `[${WORKER_NAME}] report: ${input.reportId}`,
  );

  console.log(
    `[${WORKER_NAME}] workspace: ${input.workspaceId}`,
  );

  console.log(
    `[${WORKER_NAME}] advertiser: ${input.advertiserId}`,
  );

  console.log(
    `[${WORKER_NAME}] connection: ${input.connectionId}`,
  );

  console.log(
    `[${WORKER_NAME}] checkpoint rows: ${input.checkpointRows}`,
  );

  console.log(
    `[${WORKER_NAME}] staging phase: ${input.phase ?? "unknown"}`,
  );

  console.log(
    `[${WORKER_NAME}] partial reason: ${input.partialReason ?? "unknown"}`,
  );

  console.log(
    `[${WORKER_NAME}] staging canonical rows: ${
      input.stagingCanonicalRowCount ?? "unknown"
    }`,
  );

  console.log(
    `[${WORKER_NAME}] staging run canonical rows: ${
      input.stagingRunCanonicalRowCount ?? "unknown"
    }`,
  );
}

function readOptionalString(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value
    : null;
}

function readOptionalNumber(
  value: unknown,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function logSafeError(
  error: unknown,
): void {
  const safeError =
    toSafeErrorLog(error);

  console.error(
    `[${WORKER_NAME}] error name: ${safeError.name}`,
  );

  console.error(
    `[${WORKER_NAME}] error code: ${safeError.code ?? ""}`,
  );

  console.error(
    `[${WORKER_NAME}] error message: ${safeError.message}`,
  );

  const rootErrorRecord =
    error !== null &&
    typeof error === "object"
      ? (
          error as
            Record<
              string,
              unknown
            >
        )
      : null;

  let causeValue:
    unknown =
      rootErrorRecord === null
        ? undefined
        : rootErrorRecord[
            "cause"
          ];

  let causeDepth =
    0;

  while (
    causeValue !==
      null &&
    typeof causeValue ===
      "object" &&
    causeDepth <
      8
  ) {
    causeDepth +=
      1;

    const causeRecord =
      causeValue as
        Record<
          string,
          unknown
        >;

    const causeName =
      typeof causeRecord[
        "name"
      ] === "string"
        ? causeRecord[
            "name"
          ]
        : "Error";

    const causeCode =
      typeof causeRecord[
        "code"
      ] === "string"
        ? causeRecord[
            "code"
          ]
        : "";

    const causeMessage =
      typeof causeRecord[
        "message"
      ] === "string"
        ? causeRecord[
            "message"
          ].slice(
            0,
            1000,
          )
        : "";

    console.error(
      `[${WORKER_NAME}] error cause ${causeDepth} name: ${causeName}`,
    );

    console.error(
      `[${WORKER_NAME}] error cause ${causeDepth} code: ${causeCode}`,
    );

    console.error(
      `[${WORKER_NAME}] error cause ${causeDepth} message: ${causeMessage}`,
    );

    causeValue =
      causeRecord[
        "cause"
      ];
  }

  if (safeError.causeName) {
    console.error(
      `[${WORKER_NAME}] cause name: ${safeError.causeName}`,
    );
  }

  if (safeError.causeCode) {
    console.error(
      `[${WORKER_NAME}] cause code: ${safeError.causeCode}`,
    );
  }

  if (safeError.causeMessage) {
    console.error(
      `[${WORKER_NAME}] cause message: ${safeError.causeMessage}`,
    );
  }
}

async function recoverStaleProcessingJobs(
  options: WorkerRuntimeOptions,
): Promise<void> {
  const recoveredJobs =
    await recoverStaleProcessingNaverMediaSyncJobs({
      staleMs:
        options.staleProcessingMs,
      limit:
        20,
    });

  logRecoveredStaleJobs(
    recoveredJobs.length,
  );
}

async function processSingleJob(
  options: WorkerRuntimeOptions,
): Promise<boolean> {
  await recoverStaleProcessingJobs(options);

  const naverResult =
    await processNextNaverMediaSyncJob({
      jobTimeoutMs:
        options.jobTimeoutMs,

      claimWorkBudgetMs:
        options.claimWorkBudgetMs,

      requestIntervalMs:
        options.requestIntervalMs,

      maxKeywordStatsPerRun:
        options.maxKeywordStatsPerRun,

      maxStatsRequestsPerRun:
        options.maxStatsRequestsPerRun,

      maxKeywordDiscoveryPagesPerRun:
        options.maxKeywordDiscoveryPagesPerRun,

      maxAuthoritativeEntityStatsPerRun:
        options.maxAuthoritativeEntityStatsPerRun,

      maxAuthoritativeStatsRequestsPerRun:
        options.maxAuthoritativeStatsRequestsPerRun,

      maxAuthoritativeDiscoveryPagesPerRun:
        options.maxAuthoritativeDiscoveryPagesPerRun,

      enableAuthoritativeOverlap:
        options.enableAuthoritativeOverlap,

      materializationBatchSize:
        options.materializationBatchSize,
    });

  const result =
    naverResult ??
    (
      readBooleanEnv(
        GOOGLE_ADS_ENABLED_ENV,
      )
        ? await processNextGoogleAdsMediaSyncJob({
            materializationBatchSize:
              options.materializationBatchSize,
          })
        : null
    );

  if (!result) {
    logNoJob();
    return false;
  }

  if (result.status === "partial") {
    const partialResult =
      result as typeof result & {
        checkpointRows?: unknown;
        reason?: unknown;
        partialReason?: unknown;
        phase?: unknown;
        staging?: {
          canonicalRowCount?: unknown;
          runCanonicalRowCount?: unknown;
        };
      };

    logPartialJob({
      jobId:
        result.jobId,

      reportId:
        result.reportId,

      workspaceId:
        result.workspaceId,

      advertiserId:
        result.advertiserId,

      connectionId:
        result.connectionId,

      checkpointRows:
        readOptionalNumber(
          partialResult.checkpointRows,
        ) ?? result.expectedRows,

      phase:
        readOptionalString(
          partialResult.phase,
        ),

      partialReason:
        readOptionalString(
          partialResult.partialReason,
        ) ??
        readOptionalString(
          partialResult.reason,
        ),

      stagingCanonicalRowCount:
        readOptionalNumber(
          partialResult.staging?.canonicalRowCount,
        ),

      stagingRunCanonicalRowCount:
        readOptionalNumber(
          partialResult.staging?.runCanonicalRowCount,
        ),
    });

    return true;
  }

  logCompletedJob({
    jobId:
      result.jobId,

    reportId:
      result.reportId,

    workspaceId:
      result.workspaceId,

    advertiserId:
      result.advertiserId,

    connectionId:
      result.connectionId,

    snapshotIngestionId:
      result.snapshotIngestionId,

    expectedRows:
      result.expectedRows,
  });

  return true;
}

async function runSingleMode(
  options: WorkerRuntimeOptions,
): Promise<void> {
  await processSingleJob(options);
}

async function runLoopMode(
  options: WorkerRuntimeOptions,
): Promise<void> {
  let processedJobs =
    0;

  while (
    options.maxJobs === undefined ||
    processedJobs < options.maxJobs
  ) {
    const processed =
      await processSingleJob(options);

    if (processed) {
      processedJobs += 1;
      continue;
    }

    if (options.exitWhenIdle) {
      break;
    }

    await delay(
      options.pollIntervalMs,
    );
  }

  console.log(
    `[${WORKER_NAME}] loop finished`,
  );

  console.log(
    `[${WORKER_NAME}] processed jobs: ${processedJobs}`,
  );
}

async function main():
  Promise<void> {
  const options =
    readRuntimeOptions();

  if (!options.enabled) {
    logWorkerDisabled();
    return;
  }

  logWorkerStart(options);

  if (options.loop) {
    await runLoopMode(options);
    return;
  }

  await runSingleMode(options);
}

main().catch(
  (error) => {
    logSafeError(error);
    process.exitCode = 1;
  },
);
