import {
  createMediaCanonicalRowBatchBuffer,
  MediaCanonicalRowBatchBufferError,
  type MediaCanonicalRowBatchFlushContext,
} from "../src/lib/media-sync/media-canonical-row-batch-buffer";
import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

type VerificationCase = {
  name: string;
  run: () => Promise<void>;
};

type CapturedBatch = {
  ids: string[];
  context: MediaCanonicalRowBatchFlushContext;
};

function assertTrue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function assertJsonEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}: expected=${expectedJson} actual=${actualJson}`,
    );
  }
}

function createRow(
  id: number,
): EtrylueNormalizedMediaRow {
  const day = Math.max(1, Math.min(28, id));
  const date =
    `2026-06-${String(day).padStart(2, "0")}`;

  return {
    date,
    report_date: date,
    day: date,
    ymd: date,
    channel: "검색광고",
    source: "네이버 검색광고",
    platform: "네이버",
    device: "",
    campaign: "campaign",
    campaign_name: "campaign",
    group: "group",
    group_name: "group",
    keyword: `keyword-${id}`,
    keyword_name: `keyword-${id}`,
    impressions: id,
    clicks: id,
    cost: id,
    conversions: id,
    revenue: id,
    row_level: "keyword",
    data_level: "keyword",
    row_level_reason: "verification",
    provider: "naver_searchad",
    ingestion_source: "api",
    external_account_id: "account-001",
    external_campaign_id: "campaign-001",
    external_group_id: "group-001",
    external_keyword_id: `keyword-${id}`,
    verification_id: String(id),
  };
}

function getVerificationIds(
  rows: readonly EtrylueNormalizedMediaRow[],
): string[] {
  return rows.map((row) =>
    String(row.verification_id),
  );
}

async function expectBufferError(
  expectedCode:
    MediaCanonicalRowBatchBufferError["code"],
  callback: () => Promise<void>,
): Promise<MediaCanonicalRowBatchBufferError> {
  try {
    await callback();
  } catch (error) {
    assertTrue(
      error instanceof
        MediaCanonicalRowBatchBufferError,
      "Expected MediaCanonicalRowBatchBufferError.",
    );

    assertEqual(
      error.code,
      expectedCode,
      "Unexpected buffer error code",
    );

    return error;
  }

  throw new Error(
    `Expected buffer operation to throw ${expectedCode}.`,
  );
}

const verificationCases:
  VerificationCase[] = [
    {
      name:
        "flushes exactly at the configured maximum batch size",
      run: async () => {
        const captured:
          CapturedBatch[] = [];

        const buffer =
          createMediaCanonicalRowBatchBuffer({
            maxBatchSize: 3,
            onFlush: async (
              rows,
              context,
            ) => {
              captured.push({
                ids:
                  getVerificationIds(rows),
                context: { ...context },
              });
            },
          });

        await buffer.pushMany([
          createRow(1),
          createRow(2),
          createRow(3),
        ]);

        assertEqual(
          captured.length,
          1,
          "Full batch flush count mismatch",
        );

        assertJsonEqual(
          captured[0]?.ids,
          ["1", "2", "3"],
          "Full batch content mismatch",
        );

        assertEqual(
          captured[0]?.context.reason,
          "full",
          "Full batch reason mismatch",
        );

        const state =
          buffer.getState();

        assertEqual(
          state.pendingRowCount,
          0,
          "Pending count after full flush mismatch",
        );

        assertEqual(
          state.flushedRowCount,
          3,
          "Flushed row count mismatch",
        );
      },
    },
    {
      name:
        "preserves global row order across multiple batches",
      run: async () => {
        const order: string[] = [];

        const buffer =
          createMediaCanonicalRowBatchBuffer({
            maxBatchSize: 2,
            onFlush: async (rows) => {
              order.push(
                ...getVerificationIds(rows),
              );
            },
          });

        await buffer.pushMany([
          createRow(1),
          createRow(2),
          createRow(3),
          createRow(4),
          createRow(5),
        ]);

        await buffer.flushRemaining();

        assertJsonEqual(
          order,
          ["1", "2", "3", "4", "5"],
          "Global flush order mismatch",
        );

        const state =
          buffer.getState();

        assertEqual(
          state.flushedBatchCount,
          3,
          "Batch count mismatch",
        );

        assertEqual(
          state.flushedRowCount,
          5,
          "Row count mismatch",
        );
      },
    },
    {
      name:
        "flushes the final partial batch only when requested",
      run: async () => {
        const captured:
          CapturedBatch[] = [];

        const buffer =
          createMediaCanonicalRowBatchBuffer({
            maxBatchSize: 4,
            onFlush: async (
              rows,
              context,
            ) => {
              captured.push({
                ids:
                  getVerificationIds(rows),
                context: { ...context },
              });
            },
          });

        await buffer.pushMany([
          createRow(1),
          createRow(2),
          createRow(3),
        ]);

        assertEqual(
          captured.length,
          0,
          "Partial batch flushed too early",
        );

        await buffer.flushRemaining();

        assertEqual(
          captured.length,
          1,
          "Final partial batch flush count mismatch",
        );

        assertEqual(
          captured[0]?.context.reason,
          "final",
          "Final batch reason mismatch",
        );

        assertJsonEqual(
          captured[0]?.ids,
          ["1", "2", "3"],
          "Final partial batch content mismatch",
        );
      },
    },
    {
      name:
        "preserves the unconfirmed full batch when the consumer fails",
      run: async () => {
        let shouldFail = true;
        const successfulIds:
          string[] = [];

        const buffer =
          createMediaCanonicalRowBatchBuffer({
            maxBatchSize: 3,
            onFlush: async (rows) => {
              if (shouldFail) {
                throw new Error(
                  "fixture consumer failure",
                );
              }

              successfulIds.push(
                ...getVerificationIds(rows),
              );
            },
          });

        const error =
          await expectBufferError(
            "CONSUMER_FAILED",
            async () => {
              await buffer.pushMany([
                createRow(1),
                createRow(2),
                createRow(3),
              ]);
            },
          );

        assertEqual(
          error.pendingRowCount,
          3,
          "Failure pending count mismatch",
        );

        assertJsonEqual(
          getVerificationIds(
            buffer.getPendingRowsForVerification(),
          ),
          ["1", "2", "3"],
          "Failed batch was not preserved",
        );

        const failedState =
          buffer.getState();

        assertEqual(
          failedState.flushedRowCount,
          0,
          "Failed rows must not be confirmed",
        );

        shouldFail = false;
        await buffer.flushRemaining();

        assertJsonEqual(
          successfulIds,
          ["1", "2", "3"],
          "Retry flush content mismatch",
        );

        const successState =
          buffer.getState();

        assertEqual(
          successState.pendingRowCount,
          0,
          "Pending rows remain after retry",
        );

        assertEqual(
          successState.flushedRowCount,
          3,
          "Retry confirmed row count mismatch",
        );
      },
    },
    {
      name:
        "preserves a failed final partial batch",
      run: async () => {
        const buffer =
          createMediaCanonicalRowBatchBuffer({
            maxBatchSize: 5,
            onFlush: async () => {
              throw new Error(
                "final fixture failure",
              );
            },
          });

        await buffer.pushMany([
          createRow(1),
          createRow(2),
        ]);

        await expectBufferError(
          "CONSUMER_FAILED",
          async () => {
            await buffer.flushRemaining();
          },
        );

        assertJsonEqual(
          getVerificationIds(
            buffer.getPendingRowsForVerification(),
          ),
          ["1", "2"],
          "Failed final batch was not preserved",
        );

        const state =
          buffer.getState();

        assertEqual(
          state.flushedBatchCount,
          0,
          "Failed final batch must not be counted",
        );
      },
    },
    {
      name:
        "reports deterministic batch and row indexes",
      run: async () => {
        const contexts:
          MediaCanonicalRowBatchFlushContext[] = [];

        const buffer =
          createMediaCanonicalRowBatchBuffer({
            maxBatchSize: 2,
            onFlush: async (
              _rows,
              context,
            ) => {
              contexts.push({ ...context });
            },
          });

        await buffer.pushMany([
          createRow(1),
          createRow(2),
          createRow(3),
          createRow(4),
          createRow(5),
        ]);

        await buffer.flushRemaining();

        assertJsonEqual(
          contexts,
          [
            {
              batchIndex: 0,
              rowStartIndex: 0,
              rowEndIndex: 1,
              reason: "full",
            },
            {
              batchIndex: 1,
              rowStartIndex: 2,
              rowEndIndex: 3,
              reason: "full",
            },
            {
              batchIndex: 2,
              rowStartIndex: 4,
              rowEndIndex: 4,
              reason: "final",
            },
          ],
          "Flush contexts mismatch",
        );
      },
    },
    {
      name:
        "keeps accepted and confirmed counts separate",
      run: async () => {
        const buffer =
          createMediaCanonicalRowBatchBuffer({
            maxBatchSize: 3,
            onFlush: async () => {},
          });

        await buffer.pushMany([
          createRow(1),
          createRow(2),
        ]);

        const pendingState =
          buffer.getState();

        assertEqual(
          pendingState.acceptedRowCount,
          2,
          "Accepted count mismatch",
        );

        assertEqual(
          pendingState.flushedRowCount,
          0,
          "Rows were confirmed before flush",
        );

        await buffer.flushRemaining();

        const flushedState =
          buffer.getState();

        assertEqual(
          flushedState.acceptedRowCount,
          2,
          "Accepted count changed after flush",
        );

        assertEqual(
          flushedState.flushedRowCount,
          2,
          "Confirmed count mismatch",
        );
      },
    },
    {
      name:
        "rejects invalid configuration without touching external systems",
      run: async () => {
        await expectBufferError(
          "INVALID_INPUT",
          async () => {
            createMediaCanonicalRowBatchBuffer({
              maxBatchSize: 0,
              onFlush: async () => {},
            });
          },
        );
      },
    },
  ];

async function main(): Promise<void> {
  let passedCount = 0;
  let failedCount = 0;

  for (
    const verificationCase
    of verificationCases
  ) {
    try {
      await verificationCase.run();
      passedCount += 1;

      console.log(
        `verification case passed: ${verificationCase.name}`,
      );
    } catch (error) {
      failedCount += 1;

      console.error(
        `verification case failed: ${verificationCase.name}`,
      );

      console.error(
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : {
              value: String(error),
            },
      );
    }
  }

  const verificationPassed =
    failedCount === 0 &&
    passedCount ===
      verificationCases.length;

  console.log(
    `verification tests attempted: ${verificationCases.length}`,
  );
  console.log(
    `verification tests passed: ${passedCount}`,
  );
  console.log(
    `verification tests failed: ${failedCount}`,
  );
  console.log(
    "verification uses real Naver API: false",
  );
  console.log(
    "verification uses database: false",
  );
  console.log(
    "verification writes report_rows: false",
  );
  console.log(
    "verification creates snapshot: false",
  );
  console.log(
    "verification modifies collector: false",
  );
  console.log(
    "verification modifies CSV worker: false",
  );
  console.log(
    `verification passed: ${verificationPassed}`,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

void main();
