// scripts/verify-naver-searchads-staging-write-profiler-live.ts

import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  decryptNaverSearchAdsConnection,
} from "../src/lib/media-sync/media-connections-repository";
import {
  createPendingMediaSyncJob,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  claimNextNaverMediaSyncJob,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  runNaverSearchAdsStagingOrchestrator,
} from "../src/lib/media-sync/naver-searchads-staging-orchestrator";
import {
  runNaverSearchAdsAuthoritativeEntityStagingOrchestrator,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-staging-orchestrator";
import {
  fetchNaverSearchAdsAdPage,
  fetchNaverSearchAdsAdgroupPage,
  fetchNaverSearchAdsCampaignPage,
  fetchNaverSearchAdsEntityDailyStats,
  fetchNaverSearchAdsKeywordDailyStats,
  fetchNaverSearchAdsKeywordPage,
} from "../src/lib/media-sync/naver-searchads-api";
import type {
  MediaSyncStagingRepositoryRpcInvoker,
} from "../src/lib/media-sync/media-sync-staging-repository";

const MEDIA_SYNC_JOBS_TABLE = "media_sync_jobs";
const MEDIA_SYNC_STAGING_ROWS_TABLE = "media_sync_staging_rows";
const REPORTS_TABLE = "reports";

const NAVER_PROVIDER = "naver_searchad" as const;
const PENDING_STATUS = "pending" as const;
const PROCESSING_STATUS = "processing" as const;

const DEFAULT_REQUEST_INTERVAL_MS = 1_000;
const MIN_REQUEST_INTERVAL_MS = 250;
const MAX_REQUEST_INTERVAL_MS = 60_000;
const KEYWORD_CHUNK_SIZE = 100;
const CHUNK_PAUSE_MS = 10_000;
const MAX_RETRY_COUNT = 3;
const STAGING_BATCH_SIZE = 100;

const MAX_KEYWORD_STATS_PER_RUN = 50;
const MAX_KEYWORD_STATS_REQUESTS_PER_RUN = 50;
const MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN = 20;

const MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN = 50;
const MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN = 50;
const MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN = 20;

type VerificationInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
  requestIntervalMs: number;
};

type ReportPointers = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
};

type Timing = {
  calls: number;
  totalMs: number;
  maxMs: number;
};

type PhaseProfile = {
  totalMs: number;
  apiMs: number;
  sleepMs: number;
  rpcMs: number;
  derivedCpuBufferMs: number;
  apiCalls: number;
  sleepCalls: number;
  rpcCalls: number;
  rpcRows: number;
};

function normalizeRequiredArgument(
  value: unknown,
  name: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new Error(`${name} argument is required.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${name} argument must not be empty.`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${name} argument is too long.`);
  }

  return normalized;
}

function readInput(): VerificationInput {
  const [
    reportId,
    connectionId,
    workspaceId,
    advertiserId,
    createdBy,
    dateFrom,
    dateTo,
    requestIntervalMsText,
  ] = process.argv.slice(2);

  const requestIntervalMs =
    requestIntervalMsText === undefined
      ? DEFAULT_REQUEST_INTERVAL_MS
      : Number(requestIntervalMsText);

  if (
    !Number.isSafeInteger(requestIntervalMs) ||
    requestIntervalMs < MIN_REQUEST_INTERVAL_MS ||
    requestIntervalMs > MAX_REQUEST_INTERVAL_MS
  ) {
    throw new Error(
      `requestIntervalMs must be an integer between ${MIN_REQUEST_INTERVAL_MS} and ${MAX_REQUEST_INTERVAL_MS}.`,
    );
  }

  return {
    reportId: normalizeRequiredArgument(reportId, "reportId"),
    connectionId: normalizeRequiredArgument(connectionId, "connectionId"),
    workspaceId: normalizeRequiredArgument(workspaceId, "workspaceId"),
    advertiserId: normalizeRequiredArgument(advertiserId, "advertiserId"),
    createdBy: normalizeRequiredArgument(createdBy, "createdBy"),
    dateFrom: normalizeRequiredArgument(dateFrom, "dateFrom", 10),
    dateTo: normalizeRequiredArgument(dateTo, "dateTo", 10),
    requestIntervalMs,
  };
}

function createTiming(): Timing {
  return {
    calls: 0,
    totalMs: 0,
    maxMs: 0,
  };
}

async function measure<T>(
  timing: Timing,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  timing.calls += 1;

  try {
    return await operation();
  } finally {
    const elapsedMs = performance.now() - startedAt;
    timing.totalMs += elapsedMs;
    timing.maxMs = Math.max(timing.maxMs, elapsedMs);
  }
}

async function readReportPointers(
  reportId: string,
): Promise<ReportPointers> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select("current_ingestion_id, published_ingestion_id")
    .eq("id", reportId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("WRITE_PROFILER_REPORT_POINTER_READ_FAILED");
  }

  return {
    currentIngestionId: data.current_ingestion_id ?? null,
    publishedIngestionId: data.published_ingestion_id ?? null,
  };
}

function pointersMatch(
  before: ReportPointers,
  after: ReportPointers,
): boolean {
  return (
    before.currentIngestionId === after.currentIngestionId &&
    before.publishedIngestionId === after.publishedIngestionId
  );
}

async function assertQueueSafe(
  reportId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const pendingResult = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("provider", NAVER_PROVIDER)
    .eq("status", PENDING_STATUS)
    .limit(1);

  if (pendingResult.error) {
    throw new Error("WRITE_PROFILER_PENDING_QUEUE_CHECK_FAILED");
  }

  if (Array.isArray(pendingResult.data) && pendingResult.data.length > 0) {
    throw new Error("WRITE_PROFILER_PENDING_NAVER_JOB_EXISTS");
  }

  const activeResult = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("report_id", reportId)
    .in("status", [PENDING_STATUS, PROCESSING_STATUS])
    .limit(1);

  if (activeResult.error) {
    throw new Error("WRITE_PROFILER_ACTIVE_JOB_CHECK_FAILED");
  }

  if (Array.isArray(activeResult.data) && activeResult.data.length > 0) {
    throw new Error("WRITE_PROFILER_REPORT_ACTIVE_JOB_EXISTS");
  }
}

function createProfile(
  totalMs: number,
  apiTiming: Timing,
  sleepTiming: Timing,
  rpcTiming: Timing,
  rpcRows: number,
): PhaseProfile {
  const derivedCpuBufferMs = Math.max(
    0,
    totalMs -
      apiTiming.totalMs -
      sleepTiming.totalMs -
      rpcTiming.totalMs,
  );

  return {
    totalMs,
    apiMs: apiTiming.totalMs,
    sleepMs: sleepTiming.totalMs,
    rpcMs: rpcTiming.totalMs,
    derivedCpuBufferMs,
    apiCalls: apiTiming.calls,
    sleepCalls: sleepTiming.calls,
    rpcCalls: rpcTiming.calls,
    rpcRows,
  };
}

function printProfile(
  label: string,
  profile: PhaseProfile,
  rpcTiming: Timing,
): void {
  const percent = (value: number) =>
    profile.totalMs > 0
      ? Math.round((value / profile.totalMs) * 10_000) / 100
      : 0;

  console.log(
    `${label} write profile:`,
    JSON.stringify({
      totalMs: Math.round(profile.totalMs),
      apiMs: Math.round(profile.apiMs),
      apiPercent: percent(profile.apiMs),
      sleepMs: Math.round(profile.sleepMs),
      sleepPercent: percent(profile.sleepMs),
      stagingRpcMs: Math.round(profile.rpcMs),
      stagingRpcPercent: percent(profile.rpcMs),
      derivedCanonicalBufferMs: Math.round(profile.derivedCpuBufferMs),
      derivedCanonicalBufferPercent: percent(profile.derivedCpuBufferMs),
      apiCalls: profile.apiCalls,
      sleepCalls: profile.sleepCalls,
      stagingRpcCalls: profile.rpcCalls,
      stagingRpcRows: profile.rpcRows,
      stagingRpcAverageMs:
        rpcTiming.calls > 0
          ? Math.round(rpcTiming.totalMs / rpcTiming.calls)
          : 0,
      stagingRpcMaxMs: Math.round(rpcTiming.maxMs),
    }),
  );
}

async function cleanupFixture(
  jobId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const stagingDelete = await supabase
    .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
    .delete()
    .eq("job_id", jobId);

  if (stagingDelete.error) {
    throw new Error("WRITE_PROFILER_STAGING_CLEANUP_FAILED");
  }

  const jobDelete = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq("id", jobId)
    .is("snapshot_ingestion_id", null);

  if (jobDelete.error) {
    throw new Error("WRITE_PROFILER_JOB_CLEANUP_FAILED");
  }

  const stagingCheck = await supabase
    .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  const jobCheck = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("id", jobId)
    .maybeSingle();

  if (stagingCheck.error || jobCheck.error) {
    throw new Error("WRITE_PROFILER_CLEANUP_CHECK_FAILED");
  }

  return (stagingCheck.count ?? 0) === 0 && jobCheck.data === null;
}

async function main(): Promise<void> {
  const input = readInput();

  console.log("NAVER SEARCH ADS STAGING WRITE PROFILER LIVE");
  console.log("temporary DB writes only:", true);
  console.log("Railway worker must be disabled:", true);

  let fixtureJobId: string | null = null;
  let cleanupCompleted = false;
  let profilingPassed = false;

  const pointersBefore = await readReportPointers(input.reportId);

  try {
    await assertQueueSafe(input.reportId);

    const decrypted = await decryptNaverSearchAdsConnection({
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
      advertiserId: input.advertiserId,
    });

    const pendingJob = await createPendingMediaSyncJob({
      reportId: input.reportId,
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
      advertiserId: input.advertiserId,
      createdBy: input.createdBy,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      dataLevel: "mixed",
      mode: "snapshot_replace",
    });

    fixtureJobId = pendingJob.id;

    const claimedJob = await claimNextNaverMediaSyncJob();

    if (
      !claimedJob ||
      claimedJob.id !== pendingJob.id ||
      claimedJob.status !== PROCESSING_STATUS
    ) {
      throw new Error("WRITE_PROFILER_JOB_CLAIM_MISMATCH");
    }

    const keywordApi = createTiming();
    const keywordSleep = createTiming();
    const keywordRpc = createTiming();
    let keywordRpcRows = 0;

    const keywordInvoker: MediaSyncStagingRepositoryRpcInvoker =
      async (functionName, args) => {
        const payload = args.p_payload as {
          rows?: unknown[];
        };

        keywordRpcRows += Array.isArray(payload?.rows)
          ? payload.rows.length
          : 0;

        return measure(keywordRpc, async () => {
          const result = await getSupabaseAdmin().rpc(
            functionName,
            args,
          );

          return {
            data: result.data,
            error: result.error,
          };
        });
      };

    const keywordStartedAt = performance.now();

    const keywordResult = await runNaverSearchAdsStagingOrchestrator({
      job: claimedJob,
      credentials: decrypted.credentials,
      dateWindowIndex: 0,
      stagingBatchSize: STAGING_BATCH_SIZE,
      requestIntervalMs: input.requestIntervalMs,
      keywordChunkSize: KEYWORD_CHUNK_SIZE,
      chunkPauseMs: CHUNK_PAUSE_MS,
      maxRetryCount: MAX_RETRY_COUNT,
      maxKeywordStatsPerRun: MAX_KEYWORD_STATS_PER_RUN,
      maxStatsRequestsPerRun: MAX_KEYWORD_STATS_REQUESTS_PER_RUN,
      maxKeywordDiscoveryPagesPerRun:
        MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN,
      dependencies: {
        fetchCampaignPage: (apiInput) =>
          measure(keywordApi, () =>
            fetchNaverSearchAdsCampaignPage(apiInput),
          ),
        fetchAdgroupPage: (apiInput) =>
          measure(keywordApi, () =>
            fetchNaverSearchAdsAdgroupPage(apiInput),
          ),
        fetchKeywordPage: (apiInput) =>
          measure(keywordApi, () =>
            fetchNaverSearchAdsKeywordPage(apiInput),
          ),
        fetchKeywordDailyStats: (apiInput) =>
          measure(keywordApi, () =>
            fetchNaverSearchAdsKeywordDailyStats(apiInput),
          ),
        sleep: (milliseconds, signal) =>
          measure(keywordSleep, () =>
            delay(milliseconds, undefined, { signal }),
          ),
      },
      stagingRepositoryDependencies: {
        invokeRpc: keywordInvoker,
      },
    });

    const keywordTotalMs = performance.now() - keywordStartedAt;

    const authoritativeApi = createTiming();
    const authoritativeSleep = createTiming();
    const authoritativeRpc = createTiming();
    let authoritativeRpcRows = 0;

    const authoritativeInvoker: MediaSyncStagingRepositoryRpcInvoker =
      async (functionName, args) => {
        const payload = args.p_payload as {
          rows?: unknown[];
        };

        authoritativeRpcRows += Array.isArray(payload?.rows)
          ? payload.rows.length
          : 0;

        return measure(authoritativeRpc, async () => {
          const result = await getSupabaseAdmin().rpc(
            functionName,
            args,
          );

          return {
            data: result.data,
            error: result.error,
          };
        });
      };

    const authoritativeStartedAt = performance.now();

    const authoritativeResult =
      await runNaverSearchAdsAuthoritativeEntityStagingOrchestrator({
        job: claimedJob,
        credentials: decrypted.credentials,
        rowStartIndex: keywordResult.canonicalRowCount,
        dateWindowIndex: 0,
        stagingBatchSize: STAGING_BATCH_SIZE,
        requestIntervalMs: input.requestIntervalMs,
        maxRetryCount: MAX_RETRY_COUNT,
        maxEntityStatsPerRun:
          MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN,
        maxStatsRequestsPerRun:
          MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN,
        maxDiscoveryPagesPerRun:
          MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN,
        collectorDependencies: {
          fetchCampaignPage: (apiInput) =>
            measure(authoritativeApi, () =>
              fetchNaverSearchAdsCampaignPage(apiInput),
            ),
          fetchAdgroupPage: (apiInput) =>
            measure(authoritativeApi, () =>
              fetchNaverSearchAdsAdgroupPage(apiInput),
            ),
          fetchAdPage: (apiInput) =>
            measure(authoritativeApi, () =>
              fetchNaverSearchAdsAdPage(apiInput),
            ),
          fetchEntityDailyStats: (apiInput) =>
            measure(authoritativeApi, () =>
              fetchNaverSearchAdsEntityDailyStats(apiInput),
            ),
          sleep: (milliseconds, signal) =>
            measure(authoritativeSleep, () =>
              delay(milliseconds, undefined, { signal }),
            ),
        },
        stagingRepositoryDependencies: {
          invokeRpc: authoritativeInvoker,
        },
      });

    const authoritativeTotalMs =
      performance.now() - authoritativeStartedAt;

    const keywordProfile = createProfile(
      keywordTotalMs,
      keywordApi,
      keywordSleep,
      keywordRpc,
      keywordRpcRows,
    );

    const authoritativeProfile = createProfile(
      authoritativeTotalMs,
      authoritativeApi,
      authoritativeSleep,
      authoritativeRpc,
      authoritativeRpcRows,
    );

    printProfile("keyword", keywordProfile, keywordRpc);
    printProfile(
      "authoritative",
      authoritativeProfile,
      authoritativeRpc,
    );

    console.log(
      "keyword orchestrator result:",
      JSON.stringify({
        status: keywordResult.status,
        canonicalRows: keywordResult.runCanonicalRowCount,
        flushCount: keywordResult.append.flushCount,
        insertedRows: keywordResult.append.insertedRows,
      }),
    );

    console.log(
      "authoritative orchestrator result:",
      JSON.stringify({
        status: authoritativeResult.status,
        canonicalRows:
          authoritativeResult.runCanonicalRowCount,
        flushCount: authoritativeResult.append.flushCount,
        insertedRows: authoritativeResult.append.insertedRows,
      }),
    );

    const dominant = [
      { phase: "keyword:sleep", ms: keywordProfile.sleepMs },
      { phase: "keyword:api", ms: keywordProfile.apiMs },
      { phase: "keyword:staging_rpc", ms: keywordProfile.rpcMs },
      {
        phase: "keyword:canonical_buffer",
        ms: keywordProfile.derivedCpuBufferMs,
      },
      {
        phase: "authoritative:sleep",
        ms: authoritativeProfile.sleepMs,
      },
      {
        phase: "authoritative:api",
        ms: authoritativeProfile.apiMs,
      },
      {
        phase: "authoritative:staging_rpc",
        ms: authoritativeProfile.rpcMs,
      },
      {
        phase: "authoritative:canonical_buffer",
        ms: authoritativeProfile.derivedCpuBufferMs,
      },
    ].sort((left, right) => right.ms - left.ms)[0];

    console.log(
      "dominant measured phase:",
      JSON.stringify({
        phase: dominant.phase,
        totalMs: Math.round(dominant.ms),
      }),
    );

    const pointersDuring = await readReportPointers(input.reportId);
    const pointersUnchanged = pointersMatch(
      pointersBefore,
      pointersDuring,
    );

    console.log("report pointers unchanged:", pointersUnchanged);

    profilingPassed =
      keywordResult.append.insertedRows > 0 &&
      authoritativeResult.append.insertedRows > 0 &&
      keywordRpc.calls > 0 &&
      authoritativeRpc.calls > 0 &&
      pointersUnchanged;
  } catch (error) {
    console.error(
      "staging write profiler failed:",
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            cause:
              error.cause instanceof Error
                ? {
                    name: error.cause.name,
                    message: error.cause.message,
                  }
                : error.cause ?? null,
          }
        : { value: String(error) },
    );
  } finally {
    if (fixtureJobId) {
      try {
        cleanupCompleted = await cleanupFixture(fixtureJobId);
      } catch (error) {
        console.error(
          "staging write profiler cleanup failed:",
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : { value: String(error) },
        );
      }
    }

    let pointersUnchangedAfterCleanup = false;

    try {
      const pointersAfter = await readReportPointers(input.reportId);
      pointersUnchangedAfterCleanup = pointersMatch(
        pointersBefore,
        pointersAfter,
      );
    } catch {
      pointersUnchangedAfterCleanup = false;
    }

    const passed =
      profilingPassed &&
      cleanupCompleted &&
      pointersUnchangedAfterCleanup;

    console.log("fixture cleanup completed:", cleanupCompleted);
    console.log(
      "final report pointers unchanged:",
      pointersUnchangedAfterCleanup,
    );
    console.log("staging write profiler passed:", passed);

    if (!passed) {
      process.exitCode = 1;
    }
  }
}

void main();
