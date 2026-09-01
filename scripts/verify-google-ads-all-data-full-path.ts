import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { collectGoogleAdsAccountInventory } from "../src/lib/media-sync/google-ads-account-inventory";
import { readGoogleAdsAllDataProcessingCheckpoint } from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint";
import { runGoogleAdsAllDataProcessingOrchestrator } from "../src/lib/media-sync/google-ads-all-data-processing-orchestrator";
import { saveGoogleAdsAllDataProductRoutingBootstrap } from "../src/lib/media-sync/google-ads-all-data-product-routing-bootstrap-repository";
import { processClaimedGoogleAdsAllDataJob } from "../src/lib/media-sync/google-ads-all-data-runtime-adapter";
import { processGoogleAdsAllDataWorkerHandler, type GoogleAdsAllDataWorkerHandlerDependencies, type GoogleAdsAllDataWorkerJobRecord } from "../src/lib/media-sync/google-ads-all-data-worker-handler";
import { claimNextGoogleAdsMediaSyncJob } from "../src/lib/media-sync/google-ads-media-sync-worker-claim-repository";
import type { MediaConnectionRecord, MediaSyncJobRecord } from "../src/lib/media-sync/types";

/* Real TS state-machine / collector / canonical / append / checkpoint / release /
 * claim code. Only external I/O and completion-repository results are doubles.
 * This fixture is not a proof of deployed SQL or real materialization RPCs.
 * Run in a credential-free child process with a socket-level no-live guard.
 */
const DATE = "2026-08-25";
const ACCOUNT = "1234567890";
const CONTRACT = "google_all_data_v1" as const;
const FIXTURE_DB = "https://m4g-offline.invalid";
const SNAPSHOT = "77777777-7777-4777-8777-777777777777";
const NOW = "2026-08-31T00:00:00.000Z";
type Job = GoogleAdsAllDataWorkerJobRecord;
type ObjectRecord = Record<string, any>;
type Family = "search" | "demand_gen" | "display";

function jsonb<T>(value: T): T {
  function reorder(item: any): any {
    if (Array.isArray(item)) return item.map(reorder);
    if (item && typeof item === "object") return Object.fromEntries(Object.keys(item).sort().reverse().map(key => [key, reorder(item[key])]));
    return item;
  }
  return JSON.parse(JSON.stringify(reorder(value)));
}
function response(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
}
function freshJob(): Job {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    report_id: "22222222-2222-4222-8222-222222222222",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    advertiser_id: "44444444-4444-4444-8444-444444444444",
    connection_id: "55555555-5555-4555-8555-555555555555",
    provider: "google_ads", external_account_id: ACCOUNT,
    date_from: DATE, date_to: DATE, data_level: "keyword", mode: "snapshot_replace",
    status: "pending", progress: 0, raw_rows: 0, normalized_rows: 0, inserted_rows: 0, failed_rows: 0,
    previous_ingestion_id: "88888888-8888-4888-8888-888888888888", snapshot_ingestion_id: null,
    attempt_count: 0, error: null, error_detail: null,
    created_by: "66666666-6666-4666-8666-666666666666", created_at: NOW,
    started_at: null, finished_at: null, updated_at: NOW, execution_contract: CONTRACT,
  };
}
function causes(error: unknown): string[] {
  const result: string[] = [];
  for (let item: any = error, depth = 0; item && depth < 10; item = item.cause, depth += 1) result.push(`${item.name}:${item.code ?? ""}:${item.message}`);
  return result;
}

function boundaryJob(route: string[], productIndex: number, rows: number): Job {
  const collector = { google_version: 1, all_data_version: 1, product_route: route, product_index: productIndex,
    product_family: route[productIndex], phase: "product_boundary", date_window_index: 0,
    next_row_index: rows, complete: false, cursor: null };
  return { ...freshJob(), status: "processing", started_at: NOW, attempt_count: 1,
    raw_rows: rows, normalized_rows: rows, inserted_rows: rows,
    error_detail: { processing_checkpoint: { version: 1, saved_at: NOW, execution_contract: CONTRACT,
      date_window_index: 0, next_row_index: rows, raw_rows: rows, normalized_rows: rows, inserted_rows: rows,
      failed_rows: 0, complete: false, collector } } };
}

async function mustRejectBeforeIo(job: Job, label: string) {
  let ioCalls = 0;
  await assert.rejects(() => processClaimedGoogleAdsAllDataJob({ job, executionContract: CONTRACT }, {
    loadConnection: async () => { ioCalls += 1; throw new Error("unexpected connection I/O"); },
    runProcessing: async () => { ioCalls += 1; throw new Error("unexpected processing I/O"); },
  }));
  assert.equal(ioCalls, 0, label);
}

async function verifyInvalidBoundaries() {
  await mustRejectBeforeIo(boundaryJob(["search", "demand_gen"], 0, 7), "initial Search must start at zero");
  await mustRejectBeforeIo(boundaryJob(["demand_gen"], 0, 7), "initial Demand Gen must start at zero");
  for (const rows of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) await mustRejectBeforeIo(boundaryJob(["search", "demand_gen"], 1, rows), "invalid global row index");
  const valid = boundaryJob(["search", "demand_gen"], 1, 7);
  for (const mutate of [
    (job: any) => { job.error_detail.processing_checkpoint.next_row_index = 6; job.error_detail.processing_checkpoint.collector.next_row_index = 6; },
    (job: any) => { job.inserted_rows = 6; },
    (job: any) => { job.error_detail.processing_checkpoint.raw_rows = 6; },
    (job: any) => { job.error_detail.processing_checkpoint.collector.cursor = {}; },
    (job: any) => { job.error_detail.processing_checkpoint.date_window_index = 1; job.error_detail.processing_checkpoint.collector.date_window_index = 1; },
    (job: any) => { delete job.error_detail.processing_checkpoint.collector.product_route; },
    (job: any) => { job.error_detail.processing_checkpoint.collector.product_index = 0; },
    (job: any) => { job.error_detail.processing_checkpoint.collector.phase = "demand_gen_ad"; },
  ]) { const job = jsonb(valid); mutate(job); await mustRejectBeforeIo(job, "malformed subsequent boundary"); }
  const future = ["search", "demand_gen", "display", "performance_max"];
  await mustRejectBeforeIo(
    boundaryJob(["display"], 0, 7),
    "initial Display must start at zero",
  );
  await mustRejectBeforeIo(boundaryJob(future, 3, 7), "Performance Max blocked");
  await mustRejectBeforeIo(boundaryJob(["shopping"], 0, 0), "Shopping excluded");
  console.log("INITIAL_AND_SUBSEQUENT_BOUNDARY_NEGATIVE_CASES_BEFORE_IO=PASS");
}

export class OfflineScenario {
  job = freshJob();
  rows: ObjectRecord[] = [];
  saved: Job[] = [];
  releases: Job[] = [];
  requests: string[] = [];
  completion: string[] = [];
  runtimeCalls = 0;
  connectionCalls = 0;
  bootstrapCalls = 0;
  inventoryCalls = 0;
  currentPointer = this.job.previous_ingestion_id;
  publishedPointer = this.job.previous_ingestion_id;
  completedCheckpoint: Job | null = null;

  constructor(
    readonly route: Family[],
    readonly pages: Record<
      "keyword" |
      "search_ad" |
      "demand_gen_ad" |
      "display_ad",
      number[]
    >,
  ) {}

  async claim(): Promise<Job> {
    const previous = jsonb(this.job.error_detail);
    const result = await claimNextGoogleAdsMediaSyncJob({
      invokeRpc: async name => {
        assert.equal(name, "claim_next_google_ads_media_sync_job");
        assert.equal(this.job.status, "pending");
        this.job = jsonb({ ...this.job, status: "processing", started_at: NOW, attempt_count: this.job.attempt_count + 1 });
        return { data: [this.job], error: null };
      },
    });
    assert.ok(result);
    assert.deepEqual(result.error_detail, previous, "claim must retain exact durable checkpoint");
    assert.equal(result.execution_contract, CONTRACT);
    return result as Job;
  }

  readonly releaseTransport: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, FIXTURE_DB, "unexpected external transport");
    assert.equal(url.pathname, "/rest/v1/media_sync_jobs");
    assert.equal(init?.method, "PATCH");
    assert.equal(url.searchParams.get("id"), `eq.${this.job.id}`);
    assert.equal(url.searchParams.get("provider"), "eq.google_ads");
    assert.equal(url.searchParams.get("status"), "eq.processing");
    assert.equal(this.job.status, "processing");
    const update = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(update).sort(), ["error", "started_at", "status", "updated_at"]);
    assert.equal(update.status, "pending");
    assert.equal(update.started_at, null);
    assert.equal(update.error, null);
    const checkpoint = jsonb(this.job.error_detail);
    this.job = jsonb({ ...this.job, ...update });
    assert.deepEqual(this.job.error_detail, checkpoint);
    this.releases.push(jsonb(this.job));
    return response(this.job);
  };

  readonly checkpointRpc = async (name: string, args: { p_payload: unknown }) => {
    assert.equal(name, "save_google_ads_all_data_processing_checkpoint");
    const payload = args.p_payload as ObjectRecord;
    assert.equal(payload.job_id, this.job.id);
    for (const key of ["report_id", "workspace_id", "advertiser_id", "connection_id", "provider", "execution_contract", "external_account_id", "date_from", "date_to"] as const) assert.equal(payload[key], this.job[key]);
    assert.equal(this.job.status, "processing");
    assert.equal(payload.failed_rows, 0);
    assert.equal(payload.inserted_rows, this.rows.length, "checkpoint must cover exact staged prefix");
    assert.equal(payload.raw_rows, payload.inserted_rows);
    assert.equal(payload.normalized_rows, payload.inserted_rows);
    assert.equal(payload.collector.next_row_index, payload.inserted_rows);
    assert.ok(payload.inserted_rows >= this.job.inserted_rows);
    this.job = jsonb({
      ...this.job, raw_rows: payload.raw_rows, normalized_rows: payload.normalized_rows,
      inserted_rows: payload.inserted_rows, failed_rows: 0, error: null,
      error_detail: { processing_checkpoint: {
        version: 1, saved_at: NOW, execution_contract: CONTRACT,
        date_window_index: payload.collector.date_window_index, next_row_index: payload.inserted_rows,
        raw_rows: payload.raw_rows, normalized_rows: payload.normalized_rows, inserted_rows: payload.inserted_rows,
        failed_rows: 0, complete: payload.collector.complete, collector: payload.collector,
      } },
    });
    const checkpoint = readGoogleAdsAllDataProcessingCheckpoint(this.job);
    assert.equal(checkpoint.nextRowIndex, this.rows.length);
    assert.equal(checkpoint.dateWindowIndex, 0);
    this.saved.push(jsonb(this.job));
    if (checkpoint.complete) this.completedCheckpoint = jsonb(this.job);
    return { data: [this.job], error: null };
  };

  readonly stagingRpc = async (name: string, args: { p_payload: unknown }) => {
    assert.equal(name, "append_media_sync_staging_batch");
    const payload = args.p_payload as ObjectRecord;
    assert.equal(payload.job_id, this.job.id);
    assert.equal(payload.date_window_index, 0);
    const rows = payload.rows as ObjectRecord[];
    const first = this.rows.length;
    for (const [index, row] of rows.entries()) {
      assert.equal(row.row_index, first + index);
      assert.ok(row.row_key);
      assert.equal(this.rows.some(existing => existing.row_key === row.row_key), false);
      assert.equal(row.row.external_account_id, ACCOUNT);
      assert.equal(row.row.provider_meta.authoritative_grain, "ad");
      assert.ok(
        ["search", "demand_gen", "display"].includes(
          row.row.provider_meta.product_family,
        ),
      );
      assert.deepEqual(JSON.parse(row.row_key).slice(0, 3), ["google_ads", row.row.provider_meta.product_family, row.row.provider_meta.entity_type]);
      assert.equal(JSON.stringify(row).includes("fixture-access"), false);
    }
    this.rows.push(...jsonb(rows));
    return { data: [{ submitted_rows: rows.length, inserted_rows: rows.length, duplicate_rows: 0, first_row_index: first, last_row_index: this.rows.length - 1 }], error: null };
  };

  readonly googleTransport: typeof fetch = async (input, init) => {
    assert.match(String(input), /\/v25\/customers\/1234567890\/googleAds:search$/);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    const query = String(body.query);
    assert.doesNotMatch(query, /\b(mutate|INSERT|UPDATE|DELETE)\b/i);
    assert.equal(body.pageSize, undefined);
    if (/FROM campaign\b/.test(query)) {
      this.inventoryCalls += 1;
      return response({ results: [...this.route, "performance_max", "shopping"].map((family, index) => ({ campaign: {
        id: String(1000 + index), name: family, advertisingChannelType: family.toUpperCase(), status: "ENABLED",
      } })) });
    }
    const phase =
      /FROM keyword_view\b/.test(query)
        ? "keyword"
        : /'DEMAND_GEN'/.test(query)
          ? "demand_gen_ad"
          : /'DISPLAY'/.test(query)
            ? "display_ad"
            : "search_ad";

    if (phase === "search_ad") {
      assert.match(
        query,
        /campaign\.advertising_channel_type = 'SEARCH'/,
      );
    }

    if (phase === "display_ad") {
      assert.match(
        query,
        /campaign\.advertising_channel_type = 'DISPLAY'/,
      );
    }
    const pageIndex = body.pageToken === undefined ? 0 : Number(String(body.pageToken).split(":")[1]);
    assert.equal(body.pageToken, pageIndex === 0 ? undefined : `${phase}:${pageIndex}`);
    assert.ok(pageIndex < this.pages[phase].length);
    const requestKey = `${phase}:${pageIndex}`;
    assert.equal(this.requests.includes(requestKey), false, "page refetch across reclaim");
    this.requests.push(requestKey);
    const rows = Array.from({ length: this.pages[phase][pageIndex] }, (_, index) => {
      const id = String(3000 + pageIndex * 100 + index);
      return {
        campaign: {
          id:
            phase === "demand_gen_ad"
              ? "1002"
              : phase === "display_ad"
                ? "1003"
                : "1001",

          name:
            phase === "demand_gen_ad"
              ? "Demand Gen"
              : phase === "display_ad"
                ? "Display"
                : "Search",
        },
        adGroup: { id: "2001", name: "Ad group" },
        ...(phase === "keyword" ? { adGroupCriterion: { criterionId: id, keyword: { text: `keyword ${id}` } } } : { adGroupAd: { ad: { id } } }),
        segments: { date: DATE },
        metrics: { impressions: "100", clicks: "10", costMicros: "1000000", conversions: "2", conversionsValue: "3000" },
      };
    });
    return response({ results: rows, ...(pageIndex + 1 < this.pages[phase].length ? { nextPageToken: `${phase}:${pageIndex + 1}` } : {}) });
  };

  readonly runtime = async (input: { job: Job; executionContract: typeof CONTRACT }) => {
    this.runtimeCalls += 1;
    return processClaimedGoogleAdsAllDataJob(input, {
      loadConnection: async () => {
        this.connectionCalls += 1;
        return { id: this.job.connection_id, workspace_id: this.job.workspace_id, advertiser_id: this.job.advertiser_id,
          provider: "google_ads", external_account_id: ACCOUNT, status: "active", credential_version: 1,
          credential_ciphertext: "fixture-ciphertext" } as MediaConnectionRecord;
      },
      decryptCredentials: async () => ({ refreshToken: "fixture-refresh", loginCustomerId: null }),
      readOAuthConfig: async () => ({ developerToken: "fixture-developer", clientId: "fixture-client", clientSecret: "fixture-secret" }),
      refreshAccessToken: async () => ({ accessToken: "fixture-access" }),
      collectAccountInventory: input => collectGoogleAdsAccountInventory(input, { fetchImpl: this.googleTransport }),
      saveProductRoutingBootstrap: input => {
        this.bootstrapCalls += 1;
        assert.deepEqual(input.routing.route, this.route, "blocked products must not enter executable route");
        return saveGoogleAdsAllDataProductRoutingBootstrap(input, { invokeRpc: this.checkpointRpc });
      },
      runProcessing: input => {
        const checkpoint = readGoogleAdsAllDataProcessingCheckpoint(input.job);
        assert.equal(input.dateWindowIndex, checkpoint.dateWindowIndex);
        assert.deepEqual(input.routing, checkpoint.routing);
        assert.deepEqual(input.cursor ?? null, checkpoint.cursor);
        const collectorDependencies = { fetchImpl: this.googleTransport, sleepImpl: async () => assert.fail("unexpected retry"), randomImpl: () => 0 };
        return runGoogleAdsAllDataProcessingOrchestrator({
          ...input,
          keywordCollectorDependencies: collectorDependencies,
          searchAdCollectorDependencies: collectorDependencies,
          demandGenCollectorDependencies: collectorDependencies,
          displayCollectorDependencies: collectorDependencies,
          stagingRepositoryDependencies: {
            invokeRpc: this.stagingRpc,
          },
          keywordCollectorOptions: {
            maxRetries: 0,
          },
          searchAdCollectorOptions: {
            maxRetries: 0,
          },
          demandGenCollectorOptions: {
            maxRetries: 0,
          },
          displayCollectorOptions: {
            maxRetries: 0,
          },
        }, { checkpointDependencies: { invokeRpc: this.checkpointRpc } });
      },
    });
  };

  readonly completionDependencies: GoogleAdsAllDataWorkerHandlerDependencies = {
    processRuntime: input => this.runtime(input),
    // releaseForResume intentionally not replaced: exercise actual release + SDK parsing.
    summarize: async ({ job, expectedRows }) => {
      this.completion.push("summary");
      assert.equal(readGoogleAdsAllDataProcessingCheckpoint(job).complete, true);
      assert.equal(expectedRows, this.rows.length);
      assert.deepEqual(this.rows.map(row => row.row_index), Array.from({ length: expectedRows }, (_, index) => index));
      return { jobId: job.id, expectedRows, totalRows: expectedRows, minRowIndex: expectedRows ? 0 : null,
        maxRowIndex: expectedRows ? expectedRows - 1 : null, distinctRowIndexes: expectedRows, rowsInExpectedRange: expectedRows,
        missingExpectedRows: 0, outOfRangeRows: 0, scopeMismatchRows: 0, blankRowKeyRows: 0, missingFingerprintRows: 0,
        canonicalMismatchRows: 0, dateWindowCount: expectedRows ? 1 : 0,
        dateWindowSummaries: expectedRows ? [{ dateWindowIndex: 0, rowCount: expectedRows, minRowIndex: 0, maxRowIndex: expectedRows - 1, minDate: DATE, maxDate: DATE }] : [], isComplete: true };
    },
    materialize: async ({ job, summary }) => {
      this.completion.push("materialize");
      assert.equal(this.currentPointer, this.job.previous_ingestion_id);
      return { job: { ...job, snapshot_ingestion_id: SNAPSHOT }, snapshotIngestionId: SNAPSHOT, rowCount: summary.totalRows } as any;
    },
    activate: async ({ job, expectedRows }) => {
      this.completion.push("activate");
      assert.equal(job.snapshot_ingestion_id, SNAPSHOT);
      this.currentPointer = SNAPSHOT;
      return { job, snapshotIngestionId: SNAPSHOT, currentIngestionId: SNAPSHOT, rowCount: expectedRows } as any;
    },
    finalize: async ({ job, expectedRows }) => {
      this.completion.push("finalize");
      assert.equal(this.currentPointer, SNAPSHOT);
      assert.equal(this.publishedPointer, this.job.previous_ingestion_id);
      this.job = { ...job, execution_contract: CONTRACT, status: "done", progress: 100, finished_at: NOW, error: null };
      return { job: this.job, snapshotIngestionId: SNAPSHOT, currentIngestionId: SNAPSHOT, rowCount: expectedRows } as any;
    },
  };

  async run() {
    globalThis.fetch = this.releaseTransport;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const job = await this.claim();
      const before = readGoogleAdsAllDataProcessingCheckpoint(job);
      const result = await processGoogleAdsAllDataWorkerHandler({ job, executionContract: CONTRACT }, this.completionDependencies);
      if (result.status === "completed") {
        assert.equal(result.expectedRows, this.rows.length);
        assert.deepEqual(this.completion, ["summary", "materialize", "activate", "finalize"]);
        assert.equal(this.bootstrapCalls, 1);
        assert.equal(this.inventoryCalls, 1);
        assert.equal(this.job.failed_rows, 0);
        assert.equal(this.job.progress, 100);
        assert.ok(this.completedCheckpoint);
        const runtimeBefore = this.runtimeCalls;
        const connectionBefore = this.connectionCalls;
        await assert.rejects(() => this.runtime({ job: this.completedCheckpoint!, executionContract: CONTRACT }), error => causes(error).some(value => value.includes("COMPLETED_CHECKPOINT")));
        assert.equal(this.connectionCalls, connectionBefore);
        this.runtimeCalls = runtimeBefore;
        // Simulate a crash after completion checkpoint but before any completion repository.
        this.currentPointer = this.job.previous_ingestion_id;
        this.job = jsonb(this.completedCheckpoint);
        this.completion = [];
        await processGoogleAdsAllDataWorkerHandler({ job: this.job, executionContract: CONTRACT }, this.completionDependencies);
        assert.equal(this.runtimeCalls, runtimeBefore);
        assert.equal(this.connectionCalls, connectionBefore);
        assert.deepEqual(this.completion, ["summary", "materialize", "activate", "finalize"]);
        return result;
      }
      assert.equal(result.releasedJob.status, "pending");
      assert.ok(result.checkpointRows >= before.nextRowIndex);
      assert.equal(this.completion.length, 0);
      assert.equal(this.job.snapshot_ingestion_id, null);
      assert.equal(this.currentPointer, this.job.previous_ingestion_id);
      assert.deepEqual(result.releasedJob.error_detail, result.checkpointJob.error_detail);
    }
    assert.fail("state-machine exceeded bounded claim count");
  }
}

async function main() {
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", "", "fixture must not inherit database configuration");
  assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", "", "fixture must not inherit database credentials");
  process.env.NEXT_PUBLIC_SUPABASE_URL = FIXTURE_DB;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-fixture-key-not-a-real-credential";
  const originalFetch = globalThis.fetch;
  const exact = new OfflineScenario(
    [
      "search",
      "demand_gen",
      "display",
    ],
    {
      keyword: [4],
      search_ad: [3],
      demand_gen_ad: [1, 1],
      display_ad: [1, 1],
    },
  );

  try {
    await verifyInvalidBoundaries();
    await exact.run();
    const states = exact.saved.map(job => readGoogleAdsAllDataProcessingCheckpoint(job));
    assert.deepEqual(
      states.map(
        state => [
          state.routing?.productIndex,
          state.routing?.productFamily,
          state.phase,
          state.nextRowIndex,
        ],
      ),
      [
        [0, "search", "product_boundary", 0],
        [0, "search", "search_ad", 4],
        [1, "demand_gen", "product_boundary", 7],
        [1, "demand_gen", "demand_gen_ad", 8],
        [2, "display", "product_boundary", 9],
        [2, "display", "display_ad", 10],
        [3, null, "completed", 11],
      ],
    );
    for (const state of states) {
      assert.deepEqual(
        state.routing?.route,
        [
          "search",
          "demand_gen",
          "display",
        ],
      );
      assert.equal(state.cursor === null, ["product_boundary", "completed"].includes(state.phase!));
    }
    const demandPartial = exact.saved.find(job => readGoogleAdsAllDataProcessingCheckpoint(job).phase === "demand_gen_ad");
    assert.ok(demandPartial);
    for (const mutate of [
      (cursor: any) => { cursor.expectedRowStartIndex = 7; },
      (cursor: any) => { cursor.phaseCursor = null; },
      (cursor: any) => { cursor.phaseCursor.expectedRowStartIndex = 7; },
      (cursor: any) => { cursor.phaseCursor.page.pageIndex = 0; },
      (cursor: any) => { cursor.externalAccountId = "0000000000"; },
    ]) {
      const invalid = jsonb(demandPartial);
      mutate((invalid.error_detail as any).processing_checkpoint.collector.cursor);
      await mustRejectBeforeIo(invalid, "Demand Gen partial cursor mismatch");
    }
    console.log("DEMAND_GEN_PARTIAL_CURSOR_NEGATIVE_CASES_BEFORE_IO=PASS");

    const displayPartial =
      exact.saved.find(
        job =>
          readGoogleAdsAllDataProcessingCheckpoint(
            job,
          ).phase ===
            "display_ad",
      );

    assert.ok(
      displayPartial,
    );

    const displayState =
      readGoogleAdsAllDataProcessingCheckpoint(
        displayPartial,
      );

    const staleDisplayRowIndex =
      displayState.nextRowIndex - 1;

    for (
      const mutate
      of [
        (cursor: any) => {
          cursor.expectedRowStartIndex =
            staleDisplayRowIndex;
        },
        (cursor: any) => {
          cursor.phaseCursor =
            null;
        },
        (cursor: any) => {
          cursor.phaseCursor.expectedRowStartIndex =
            staleDisplayRowIndex;
        },
        (cursor: any) => {
          cursor.phaseCursor.page.pageIndex =
            0;
        },
        (cursor: any) => {
          cursor.externalAccountId =
            "0000000000";
        },
      ]
    ) {
      const invalid =
        jsonb(
          displayPartial,
        );

      mutate(
        (invalid.error_detail as any)
          .processing_checkpoint
          .collector
          .cursor,
      );

      await mustRejectBeforeIo(
        invalid,
        "Display partial cursor mismatch",
      );
    }

    console.log(
      "DISPLAY_PARTIAL_CURSOR_NEGATIVE_CASES_BEFORE_IO=PASS",
    );
    const additional = [
      new OfflineScenario(
        [
          "search",
          "demand_gen",
          "display",
        ],
        {
          keyword: [2,          2],
          search_ad: [1, 2],
          demand_gen_ad: [1, 1],
          display_ad: [1, 1],
        },
      ),

      new OfflineScenario(
        [
          "search",
          "demand_gen",
          "display",
        ],
        {
          keyword: [0],
          search_ad: [0],
          demand_gen_ad: [1],
          display_ad: [1],
        },
      ),

      new OfflineScenario(
        [
          "demand_gen",
          "display",
        ],
        {
          keyword: [0],
          search_ad: [0],
          demand_gen_ad: [1, 1],
          display_ad: [1],
        },
      ),

      new OfflineScenario(
        ["display"],
        {
          keyword: [0],
          search_ad: [0],
          demand_gen_ad: [0],
          display_ad: [1, 1],
        },
      ),

      new OfflineScenario(
        ["search"],
        {
          keyword: [0],
          search_ad: [0],
          demand_gen_ad: [0],
          display_ad: [0],
        },
      ),
    ];
    for (const scenario of additional) await scenario.run();
    const tracePath = process.argv.find(arg => arg.startsWith("--trace="))?.slice("--trace=".length);
    if (tracePath) writeFileSync(tracePath, JSON.stringify([exact, ...additional].map(scenario => ({
      route: scenario.route, saved: scenario.saved, rows: scenario.rows, requests: scenario.requests,
    })), null, 2));
    console.log("DISPLAY_ALL_DATA_FULL_NO_LIVE_PATH=PASS");
    console.log("ALL_DATA_REAL_TYPESCRIPT_FULL_PATH=PASS");
    console.log("COMPLETION_REPOSITORY_RESULTS=SIMULATED_NOT_DEPLOYED_SQL_PROOF");
    console.log("LIVE_DB_CALLS=0");
    console.log("LIVE_GOOGLE_API_CALLS=0");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ fixtureFailure: causes(error) }, null, 2));
    process.exitCode = 1;
  });
}
