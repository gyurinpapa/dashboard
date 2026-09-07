import assert from "node:assert/strict";
import {
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  pathToFileURL,
} from "node:url";

import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const ORCHESTRATION_PATH =
  "src/lib/media-sync/media-sync-worker-orchestration-repository.ts";

const WORKER_PATH =
  "scripts/media-sync-worker.ts";

const TEMP_MODULE_PATH =
  "src/lib/media-sync/media-sync-worker-orchestration-repository.__fact_synthetic__.ts";

const PRIMARY_REPORT_ID =
  "11111111-1111-4111-8111-111111111111";

const SECONDARY_REPORT_ID =
  "22222222-2222-4222-8222-222222222222";

const PRIMARY_PREVIOUS_ID =
  "33333333-3333-4333-8333-333333333333";

const SECONDARY_PREVIOUS_ID =
  "44444444-4444-4444-8444-444444444444";

const PRIMARY_SNAPSHOT_ID =
  "55555555-5555-4555-8555-555555555555";

const SECONDARY_SNAPSHOT_ID =
  "66666666-6666-4666-8666-666666666666";

const WORKSPACE_ID =
  "77777777-7777-4777-8777-777777777777";

const ADVERTISER_ID =
  "88888888-8888-4888-8888-888888888888";

const CONNECTION_ID =
  "99999999-9999-4999-8999-999999999999";

const USER_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ZERO_ROW_DATE =
  "2026-08-10";

const FINALIZED_AT =
  "2026-09-07T12:00:00.000Z";

type ReportPeriod = {
  start: string;
  end: string;
  previousIngestionId: string;
  snapshotIngestionId: string;
};

type SyntheticResult =
  | {
      status: "fact_only_completed";
      snapshotIngestionId: null;
      expectedRows: number;
    }
  | {
      status: "fact_snapshot_completed";
      snapshotIngestionId: string;
      expectedRows: number;
    };

type SyntheticRunMode = {
  failActivation: boolean;
  retryMaterialization: boolean;
};

function dateRange(
  start: string,
  end: string,
): string[] {
  const startMs =
    Date.parse(
      `${start}T00:00:00.000Z`,
    );

  const endMs =
    Date.parse(
      `${end}T00:00:00.000Z`,
    );

  assert.ok(
    Number.isFinite(startMs),
  );

  assert.ok(
    Number.isFinite(endMs),
  );

  assert.ok(
    endMs >= startMs,
  );

  const values: string[] =
    [];

  for (
    let current = startMs;
    current <= endMs;
    current += 86_400_000
  ) {
    values.push(
      new Date(current)
        .toISOString()
        .slice(0, 10),
    );
  }

  return values;
}

function countRowsForDate(
  date: string,
): number {
  return date === ZERO_ROW_DATE
    ? 0
    : 2;
}

function cloneJob(
  job: MediaSyncJobRecord,
  patch:
    Partial<MediaSyncJobRecord>,
): MediaSyncJobRecord {
  return {
    ...job,
    ...patch,
  } as MediaSyncJobRecord;
}

function createProcessingJob(input: {
  id: string;
  dateFrom: string;
  dateTo: string;
}): MediaSyncJobRecord {
  return {
    id:
      input.id,
    workspace_id:
      WORKSPACE_ID,
    advertiser_id:
      ADVERTISER_ID,
    connection_id:
      CONNECTION_ID,
    report_id:
      PRIMARY_REPORT_ID,
    provider:
      "naver_searchad",
    external_account_id:
      "synthetic-account",
    date_from:
      input.dateFrom,
    date_to:
      input.dateTo,
    data_level:
      "keyword",
    mode:
      "snapshot_replace",
    status:
      "processing",
    progress:
      99,
    attempt_count:
      1,
    raw_rows:
      0,
    normalized_rows:
      0,
    inserted_rows:
      0,
    failed_rows:
      0,
    previous_ingestion_id:
      PRIMARY_PREVIOUS_ID,
    snapshot_ingestion_id:
      null,
    error:
      null,
    error_detail:
      null,
    created_by:
      USER_ID,
    created_at:
      "2026-09-07T10:00:00.000Z",
    started_at:
      "2026-09-07T10:00:01.000Z",
    finished_at:
      null,
    updated_at:
      "2026-09-07T10:00:01.000Z",
  } as MediaSyncJobRecord;
}

function inRange(
  date: string,
  start: string,
  end: string,
): boolean {
  return (
    date >= start &&
    date <= end
  );
}

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "fixture-service-role-key";

  const orchestrationSource =
    await readFile(
      ORCHESTRATION_PATH,
      "utf8",
    );

  const workerSource =
    await readFile(
      WORKER_PATH,
      "utf8",
    );

  const helperStartMarker =
    "async function processNaverFactProjectionAfterStaging(";

  const helperEndMarker =
    "export async function processClaimedNaverMediaSyncJob(";

  assert.equal(
    orchestrationSource
      .split(helperStartMarker)
      .length -
      1,
    1,
    "Fact orchestration helper authority must be unique.",
  );

  assert.equal(
    orchestrationSource
      .split(helperEndMarker)
      .length -
      1,
    1,
    "Claimed-job orchestration anchor must be unique.",
  );

  const helperStart =
    orchestrationSource.indexOf(
      helperStartMarker,
    );

  const helperEnd =
    orchestrationSource.indexOf(
      helperEndMarker,
      helperStart,
    );

  assert.ok(
    helperStart >= 0 &&
      helperEnd > helperStart,
    "Fact helper source range was not found.",
  );

  const helperSource =
    orchestrationSource.slice(
      helperStart,
      helperEnd,
    );

  const orderedMarkers = [
    ".replaceFactDate({",
    ".loadFanoutTargets(",
    ".loadFactProjectionCoverage({",
    '"fact_only_completed"',
    ".prepareFactSnapshot({",
    ".materializeFactSnapshotBatch({",
    ".completeFactSnapshot({",
    ".activateFactSnapshotFanout({",
    ".finalizeFactSnapshot({",
    '"fact_snapshot_completed"',
  ];

  let previousIndex =
    -1;

  for (
    const marker
    of orderedMarkers
  ) {
    const index =
      helperSource.indexOf(
        marker,
      );

    assert.ok(
      index > previousIndex,
      `Fact lifecycle marker is missing or out of order: ${marker}`,
    );

    previousIndex =
      index;
  }

  assert.ok(
    orchestrationSource.includes(
      "options.enableNaverFactProjection ===",
    ),
    "Option B orchestration is not guarded by explicit opt-in.",
  );

  assert.ok(
    workerSource.includes(
      "MEDIA_SYNC_WORKER_NAVER_FACT_PROJECTION_ENABLED",
    ),
    "Worker runtime gate is missing.",
  );

  assert.ok(
    workerSource.includes(
      "options.enableNaverFactProjection",
    ),
    "Worker runtime gate is not forwarded to Naver orchestration.",
  );

  const transformedSource =
    orchestrationSource.replace(
      helperStartMarker,
      "export async function __verifyProcessNaverFactProjectionAfterStaging(",
    );

  await writeFile(
    TEMP_MODULE_PATH,
    transformedSource,
    "utf8",
  );

  try {
    const moduleUrl =
      `${pathToFileURL(
        path.resolve(
          TEMP_MODULE_PATH,
        ),
      ).href}?synthetic=${Date.now()}`;

    const loaded =
      await import(
        moduleUrl
      ) as Record<string, unknown>;

    const candidate =
      loaded
        .__verifyProcessNaverFactProjectionAfterStaging;

    assert.equal(
      typeof candidate,
      "function",
      "Synthetic helper export was not created.",
    );

    const runFactProjection =
      candidate as (
        input: unknown,
      ) => Promise<SyntheticResult>;

    const periods =
      new Map<
        string,
        ReportPeriod
      >([
        [
          PRIMARY_REPORT_ID,
          {
            start:
              "2026-08-01",
            end:
              "2026-08-31",
            previousIngestionId:
              PRIMARY_PREVIOUS_ID,
            snapshotIngestionId:
              PRIMARY_SNAPSHOT_ID,
          },
        ],
        [
          SECONDARY_REPORT_ID,
          {
            start:
              "2026-08-08",
            end:
              "2026-08-31",
            previousIngestionId:
              SECONDARY_PREVIOUS_ID,
            snapshotIngestionId:
              SECONDARY_SNAPSHOT_ID,
          },
        ],
      ]);

    const partitions =
      new Map<
        string,
        number
      >();

    const currentPointers =
      new Map<
        string,
        string
      >([
        [
          PRIMARY_REPORT_ID,
          PRIMARY_PREVIOUS_ID,
        ],
        [
          SECONDARY_REPORT_ID,
          SECONDARY_PREVIOUS_ID,
        ],
      ]);

    const publishedPointers =
      new Map<
        string,
        string
      >([
        [
          PRIMARY_REPORT_ID,
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        ],
        [
          SECONDARY_REPORT_ID,
          "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        ],
      ]);

    const originalPublished =
      new Map(
        publishedPointers,
      );

    const replacementDates: string[] =
      [];

    let factOnlyCalls =
      0;

    let activationCalls =
      0;

    let finalizationCalls =
      0;

    let lastSyncAt:
      string | null =
        null;

    let runMode:
      SyntheticRunMode = {
        failActivation:
          false,
        retryMaterialization:
          false,
      };

    const batchStarts =
      new Map<
        string,
        number[]
      >();

    const stableTargets = [
      {
        reportId:
          PRIMARY_REPORT_ID,
        primary:
          true,
      },
      {
        reportId:
          SECONDARY_REPORT_ID,
        primary:
          false,
      },
    ];

    function coverageFor(
      reportId: string,
    ) {
      const period =
        periods.get(
          reportId,
        );

      assert.ok(
        period,
        `Unknown report period: ${reportId}`,
      );

      const expectedDates =
        dateRange(
          period.start,
          period.end,
        );

      const covered =
        expectedDates.filter(
          (date) =>
            partitions.has(
              date,
            ),
        );

      const factRows =
        covered.reduce(
          (
            total,
            date,
          ) =>
            total +
            (
              partitions.get(
                date,
              ) ??
              0
            ),
          0,
        );

      return {
        reportId,
        projectionStart:
          period.start,
        projectionEnd:
          period.end,
        expectedDates:
          expectedDates.length,
        coveredDates:
          covered.length,
        partitionRows:
          factRows,
        factRows,
        complete:
          covered.length ===
          expectedDates.length,
      };
    }

    function snapshotFor(
      reportId: string,
    ): string {
      const period =
        periods.get(
          reportId,
        );

      assert.ok(
        period,
      );

      return period.snapshotIngestionId;
    }

    function previousFor(
      reportId: string,
    ): string {
      const period =
        periods.get(
          reportId,
        );

      assert.ok(
        period,
      );

      return period.previousIngestionId;
    }

    const dependencies = {
      replaceFactDate:
        async (
          input: {
            job:
              MediaSyncJobRecord;
            date:
              string;
          },
        ) => {
          assert.ok(
            inRange(
              input.date,
              input.job.date_from,
              input.job.date_to,
            ),
            "Fact replacement escaped the claimed job date range.",
          );

          replacementDates.push(
            input.date,
          );

          const existed =
            partitions.has(
              input.date,
            );

          const rows =
            countRowsForDate(
              input.date,
            );

          partitions.set(
            input.date,
            rows,
          );

          return {
            job:
              input.job,
            scopeDate:
              input.date,
            sourceRows:
              rows,
            deletedRows:
              existed
                ? rows
                : 0,
            insertedRows:
              rows,
            factRows:
              rows,
            idempotent:
              existed,
          };
        },

      loadFanoutTargets:
        async (
          _job:
            MediaSyncJobRecord,
        ) =>
          stableTargets.map(
            (
              target,
            ) => ({
              ...target,
            }),
          ),

      loadFactProjectionCoverage:
        async (
          input: {
            job:
              MediaSyncJobRecord;
            reportId:
              string;
          },
        ) => {
          assert.equal(
            input.job.provider,
            "naver_searchad",
          );

          return coverageFor(
            input.reportId,
          );
        },

      completeFactOnly:
        async (
          input: {
            job:
              MediaSyncJobRecord;
          },
        ) => {
          factOnlyCalls +=
            1;

          assert.equal(
            input.job.snapshot_ingestion_id,
            null,
            "Fact-only completion must not have a snapshot mirror.",
          );

          const chunkDates =
            dateRange(
              input.job.date_from,
              input.job.date_to,
            );

          const partitionRows =
            chunkDates.reduce(
              (
                total,
                date,
              ) =>
                total +
                (
                  partitions.get(
                    date,
                  ) ??
                  0
                ),
              0,
            );

          return {
            job:
              cloneJob(
                input.job,
                {
                  status:
                    "done",
                  progress:
                    100,
                  finished_at:
                    FINALIZED_AT,
                },
              ),
            coveredDates:
              chunkDates.length,
            partitionRows,
            factRows:
              partitionRows,
            idempotent:
              false,
          };
        },

      prepareFactSnapshot:
        async (
          input: {
            job:
              MediaSyncJobRecord;
            reportId:
              string;
          },
        ) => {
          const coverage =
            coverageFor(
              input.reportId,
            );

          assert.equal(
            coverage.complete,
            true,
            "Snapshot preparation ran before full report coverage.",
          );

          const reportPeriod =
            periods.get(
              input.reportId,
            );

          assert.ok(
            reportPeriod,
          );

          const isPrimary =
            input.reportId ===
            PRIMARY_REPORT_ID;

          return {
            job:
              isPrimary
                ? cloneJob(
                    input.job,
                    {
                      previous_ingestion_id:
                        PRIMARY_PREVIOUS_ID,
                      snapshot_ingestion_id:
                        PRIMARY_SNAPSHOT_ID,
                    },
                  )
                : input.job,
            reportId:
              input.reportId,
            previousIngestionId:
              reportPeriod.previousIngestionId,
            snapshotIngestionId:
              reportPeriod.snapshotIngestionId,
            projectionStart:
              reportPeriod.start,
            projectionEnd:
              reportPeriod.end,
            expectedRows:
              coverage.factRows,
            nextRowIndex:
              runMode
                .retryMaterialization
                ? coverage.factRows
                : 0,
            idempotent:
              runMode
                .retryMaterialization,
          };
        },

      materializeFactSnapshotBatch:
        async (
          input: {
            job:
              MediaSyncJobRecord;
            reportId:
              string;
            snapshotIngestionId:
              string;
            projectionStart:
              string;
            projectionEnd:
              string;
            expectedRows:
              number;
            batchStart:
              number;
            batchSize:
              number;
          },
        ) => {
          assert.equal(
            input.snapshotIngestionId,
            snapshotFor(
              input.reportId,
            ),
          );

          const starts =
            batchStarts.get(
              input.reportId,
            ) ??
            [];

          starts.push(
            input.batchStart,
          );

          batchStarts.set(
            input.reportId,
            starts,
          );

          const nextRowIndex =
            Math.min(
              input.expectedRows,
              input.batchStart +
                input.batchSize,
            );

          const batchRows =
            nextRowIndex -
            input.batchStart;

          return {
            job:
              input.job,
            reportId:
              input.reportId,
            snapshotIngestionId:
              input.snapshotIngestionId,
            projectionStart:
              input.projectionStart,
            projectionEnd:
              input.projectionEnd,
            expectedRows:
              input.expectedRows,
            batchStart:
              input.batchStart,
            batchSize:
              input.batchSize,
            insertedRows:
              batchRows,
            materializedBatchRows:
              batchRows,
            nextRowIndex,
            complete:
              nextRowIndex ===
              input.expectedRows,
            idempotent:
              runMode
                .retryMaterialization,
          };
        },

      completeFactSnapshot:
        async (
          input: {
            job:
              MediaSyncJobRecord;
            reportId:
              string;
            snapshotIngestionId:
              string;
            projectionStart:
              string;
            projectionEnd:
              string;
            expectedRows:
              number;
          },
        ) => {
          const coverage =
            coverageFor(
              input.reportId,
            );

          assert.equal(
            input.expectedRows,
            coverage.factRows,
          );

          return {
            job:
              input.job,
            reportId:
              input.reportId,
            snapshotIngestionId:
              input.snapshotIngestionId,
            projectionStart:
              input.projectionStart,
            projectionEnd:
              input.projectionEnd,
            rowCount:
              input.expectedRows,
            completionFingerprint:
              "d".repeat(
                64,
              ),
            idempotent:
              runMode
                .retryMaterialization,
          };
        },

      activateFactSnapshotFanout:
        async (
          input: {
            job:
              MediaSyncJobRecord;
            projections:
              Array<{
                reportId:
                  string;
                previousIngestionId:
                  string | null;
                snapshotIngestionId:
                  string;
                projectionStart:
                  string;
                projectionEnd:
                  string;
                expectedRows:
                  number;
              }>;
          },
        ) => {
          activationCalls +=
            1;

          assert.equal(
            input.projections.length,
            2,
            "Atomic fanout activation must receive the entire projection set.",
          );

          for (
            const projection
            of input.projections
          ) {
            assert.equal(
              projection.previousIngestionId,
              previousFor(
                projection.reportId,
              ),
            );

            assert.equal(
              projection.snapshotIngestionId,
              snapshotFor(
                projection.reportId,
              ),
            );

            assert.equal(
              projection.expectedRows,
              coverageFor(
                projection.reportId,
              ).factRows,
            );
          }

          if (
            runMode
              .failActivation
          ) {
            throw new Error(
              "synthetic atomic activation failure",
            );
          }

          const pointerStates =
            input.projections.map(
              (
                projection,
              ) =>
                currentPointers.get(
                  projection.reportId,
                ),
            );

          const allPrevious =
            input.projections.every(
              (
                projection,
                index,
              ) =>
                pointerStates[
                  index
                ] ===
                projection
                  .previousIngestionId,
            );

          const allSnapshot =
            input.projections.every(
              (
                projection,
                index,
              ) =>
                pointerStates[
                  index
                ] ===
                projection
                  .snapshotIngestionId,
            );

          assert.ok(
            allPrevious ||
              allSnapshot,
            "Synthetic atomic activation detected a partial fanout pointer state.",
          );

          if (allPrevious) {
            for (
              const projection
              of input.projections
            ) {
              currentPointers.set(
                projection.reportId,
                projection.snapshotIngestionId,
              );
            }
          }

          return {
            job:
              input.job,
            projectionCount:
              input.projections.length,
            primaryReportId:
              PRIMARY_REPORT_ID,
            primaryPreviousIngestionId:
              PRIMARY_PREVIOUS_ID,
            primarySnapshotIngestionId:
              PRIMARY_SNAPSHOT_ID,
            primaryCurrentIngestionId:
              PRIMARY_SNAPSHOT_ID,
            primaryPublishedIngestionId:
              publishedPointers.get(
                PRIMARY_REPORT_ID,
              ) ??
              null,
            primaryRowCount:
              coverageFor(
                PRIMARY_REPORT_ID,
              ).factRows,
            idempotent:
              allSnapshot,
          };
        },

      finalizeFactSnapshot:
        async (
          input: {
            job:
              MediaSyncJobRecord;
            projections:
              Array<{
                reportId:
                  string;
                snapshotIngestionId:
                  string;
                projectionStart:
                  string;
                projectionEnd:
                  string;
                expectedRows:
                  number;
              }>;
          },
        ) => {
          finalizationCalls +=
            1;

          assert.equal(
            input.projections.length,
            2,
          );

          for (
            const projection
            of input.projections
          ) {
            assert.equal(
              currentPointers.get(
                projection.reportId,
              ),
              projection.snapshotIngestionId,
              "Finalization ran before every current pointer was activated.",
            );

            assert.equal(
              publishedPointers.get(
                projection.reportId,
              ),
              originalPublished.get(
                projection.reportId,
              ),
              "Published pointer changed during fact snapshot activation.",
            );
          }

          lastSyncAt =
            lastSyncAt ??
            FINALIZED_AT;

          return {
            job:
              cloneJob(
                input.job,
                {
                  status:
                    "done",
                  progress:
                    100,
                  finished_at:
                    FINALIZED_AT,
                },
              ),
            finishedAt:
              FINALIZED_AT,
            connectionId:
              CONNECTION_ID,
            connectionLastSyncAt:
              lastSyncAt,
            connectionUpdated:
              lastSyncAt ===
              FINALIZED_AT,
            projectionCount:
              input.projections.length,
            idempotent:
              false,
          };
        },
    };

    async function runChunk(input: {
      id: string;
      dateFrom: string;
      dateTo: string;
      mode?:
        Partial<SyntheticRunMode>;
    }): Promise<SyntheticResult> {
      runMode = {
        failActivation:
          input.mode
            ?.failActivation ??
          false,
        retryMaterialization:
          input.mode
            ?.retryMaterialization ??
          false,
      };

      return await runFactProjection({
        checkpointJob:
          createProcessingJob({
            id:
              input.id,
            dateFrom:
              input.dateFrom,
            dateTo:
              input.dateTo,
          }),
        staging:
          {},
        options:
          {
            materializationBatchSize:
              7,
            enableNaverFactProjection:
              true,
          },
        dependencies,
      });
    }

    const initialChunks = [
      [
        "10101010-1010-4010-8010-101010101010",
        "2026-08-01",
        "2026-08-07",
      ],
      [
        "20202020-2020-4020-8020-202020202020",
        "2026-08-08",
        "2026-08-14",
      ],
      [
        "30303030-3030-4030-8030-303030303030",
        "2026-08-15",
        "2026-08-21",
      ],
      [
        "40404040-4040-4040-8040-404040404040",
        "2026-08-22",
        "2026-08-28",
      ],
    ] as const;

    for (
      const [
        id,
        dateFrom,
        dateTo,
      ]
      of initialChunks
    ) {
      const result =
        await runChunk({
          id,
          dateFrom,
          dateTo,
        });

      assert.equal(
        result.status,
        "fact_only_completed",
        "An incomplete monthly projection must finish fact-only.",
      );

      assert.equal(
        result.snapshotIngestionId,
        null,
      );

      assert.equal(
        lastSyncAt,
        null,
        "Fact-only chunk completion must not advance connection last_sync.",
      );

      assert.equal(
        currentPointers.get(
          PRIMARY_REPORT_ID,
        ),
        PRIMARY_PREVIOUS_ID,
      );

      assert.equal(
        currentPointers.get(
          SECONDARY_REPORT_ID,
        ),
        SECONDARY_PREVIOUS_ID,
      );
    }

    assert.equal(
      factOnlyCalls,
      4,
      "Exactly four incomplete seven-day chunks must finish fact-only.",
    );

    console.log(
      "SYNTHETIC_INCOMPLETE_FACT_ONLY=PASS",
    );

    assert.equal(
      partitions.has(
        ZERO_ROW_DATE,
      ),
      true,
      "Zero-row date partition ownership is missing.",
    );

    assert.equal(
      partitions.get(
        ZERO_ROW_DATE,
      ),
      0,
      "Zero-row date must preserve an explicit zero count.",
    );

    console.log(
      "SYNTHETIC_ZERO_ROW_PARTITION=PASS",
    );

    const finalJobId =
      "50505050-5050-4050-8050-505050505050";

    let activationFailure:
      unknown =
        null;

    try {
      await runChunk({
        id:
          finalJobId,
        dateFrom:
          "2026-08-29",
        dateTo:
          "2026-08-31",
        mode:
          {
            failActivation:
              true,
          },
      });
    } catch (error) {
      activationFailure =
        error;
    }

    assert.ok(
      activationFailure instanceof
        Error,
      "Synthetic activation failure did not propagate.",
    );

    assert.equal(
      (
        activationFailure as Error & {
          code?: unknown;
        }
      ).code,
      "ACTIVATION_FAILED",
      "Activation failure was not wrapped with the correct orchestration code.",
    );

    assert.equal(
      finalizationCalls,
      0,
      "Finalization ran after failed atomic activation.",
    );

    assert.equal(
      currentPointers.get(
        PRIMARY_REPORT_ID,
      ),
      PRIMARY_PREVIOUS_ID,
      "Primary pointer changed despite failed atomic activation.",
    );

    assert.equal(
      currentPointers.get(
        SECONDARY_REPORT_ID,
      ),
      SECONDARY_PREVIOUS_ID,
      "Secondary pointer changed despite failed atomic activation.",
    );

    assert.equal(
      lastSyncAt,
      null,
      "Failed activation advanced last_sync.",
    );

    console.log(
      "SYNTHETIC_ATOMIC_ACTIVATION_FAILURE=PASS",
    );

    batchStarts.clear();

    const finalResult =
      await runChunk({
        id:
          finalJobId,
        dateFrom:
          "2026-08-29",
        dateTo:
          "2026-08-31",
        mode:
          {
            retryMaterialization:
              true,
          },
      });

    assert.equal(
      finalResult.status,
      "fact_snapshot_completed",
    );

    assert.equal(
      finalResult.snapshotIngestionId,
      PRIMARY_SNAPSHOT_ID,
    );

    const primaryCoverage =
      coverageFor(
        PRIMARY_REPORT_ID,
      );

    const secondaryCoverage =
      coverageFor(
        SECONDARY_REPORT_ID,
      );

    assert.equal(
      primaryCoverage.complete,
      true,
    );

    assert.equal(
      secondaryCoverage.complete,
      true,
    );

    assert.equal(
      primaryCoverage.expectedDates,
      31,
    );

    assert.equal(
      secondaryCoverage.expectedDates,
      24,
    );

    assert.equal(
      primaryCoverage.factRows,
      60,
    );

    assert.equal(
      secondaryCoverage.factRows,
      46,
    );

    assert.notEqual(
      primaryCoverage.factRows,
      secondaryCoverage.factRows,
      "Fanout reports with different periods must preserve different row counts.",
    );

    assert.equal(
      finalResult.expectedRows,
      primaryCoverage.factRows,
    );

    console.log(
      "SYNTHETIC_MULTI_FANOUT=PASS",
    );

    const primaryRetryStarts =
      batchStarts.get(
        PRIMARY_REPORT_ID,
      ) ??
      [];

    const secondaryRetryStarts =
      batchStarts.get(
        SECONDARY_REPORT_ID,
      ) ??
      [];

    assert.equal(
      primaryRetryStarts[0],
      0,
      "Idempotent primary retry must revalidate batches from row zero.",
    );

    assert.equal(
      secondaryRetryStarts[0],
      0,
      "Idempotent secondary retry must revalidate batches from row zero.",
    );

    assert.equal(
      primaryRetryStarts.length,
      Math.ceil(
        primaryCoverage.factRows /
          7,
      ),
    );

    assert.equal(
      secondaryRetryStarts.length,
      Math.ceil(
        secondaryCoverage.factRows /
          7,
      ),
    );

    console.log(
      "SYNTHETIC_IDEMPOTENT_RETRY=PASS",
    );

    assert.equal(
      currentPointers.get(
        PRIMARY_REPORT_ID,
      ),
      PRIMARY_SNAPSHOT_ID,
    );

    assert.equal(
      currentPointers.get(
        SECONDARY_REPORT_ID,
      ),
      SECONDARY_SNAPSHOT_ID,
    );

    for (
      const [
        reportId,
        publishedId,
      ]
      of originalPublished
    ) {
      assert.equal(
        publishedPointers.get(
          reportId,
        ),
        publishedId,
        "Published pointer changed during synthetic lifecycle.",
      );
    }

    console.log(
      "SYNTHETIC_POINTER_INVARIANTS=PASS",
    );

    assert.equal(
      lastSyncAt,
      FINALIZED_AT,
      "Connection last_sync was not advanced only after full snapshot finalization.",
    );

    assert.equal(
      finalizationCalls,
      1,
      "Finalization must run exactly once after the successful atomic activation.",
    );

    assert.equal(
      activationCalls,
      2,
      "Synthetic lifecycle must contain one failed and one successful atomic activation attempt.",
    );

    console.log(
      "SYNTHETIC_LAST_SYNC_INVARIANT=PASS",
    );

    const fullMonth =
      dateRange(
        "2026-08-01",
        "2026-08-31",
      );

    assert.deepEqual(
      replacementDates.slice(
        0,
        31,
      ),
      fullMonth,
      "Sequential chunk replacement did not cover the month in exact date order.",
    );

    assert.deepEqual(
      replacementDates.slice(
        31,
      ),
      [
        "2026-08-29",
        "2026-08-30",
        "2026-08-31",
      ],
      "Retry must be bounded to the final chunk dates.",
    );

    assert.equal(
      new Set(
        replacementDates,
      ).size,
      31,
      "Canonical date replacement must remain idempotent across the retry.",
    );

    console.log(
      "SYNTHETIC_SEQUENTIAL_CHUNKS=PASS",
    );

    console.log(
      "SYNTHETIC_OPTIONB_ORCHESTRATION=PASS",
    );
  } finally {
    await unlink(
      TEMP_MODULE_PATH,
    ).catch(
      () =>
        undefined,
    );
  }
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);

