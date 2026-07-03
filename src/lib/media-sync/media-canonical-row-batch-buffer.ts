import type {
  EtrylueNormalizedMediaRow,
} from "./types";

export type MediaCanonicalRowBatchBufferErrorCode =
  | "INVALID_INPUT"
  | "BUFFER_BUSY"
  | "CONSUMER_FAILED";

export class MediaCanonicalRowBatchBufferError extends Error {
  readonly code: MediaCanonicalRowBatchBufferErrorCode;
  readonly pendingRowCount: number;
  readonly flushedBatchCount: number;
  readonly flushedRowCount: number;

  constructor(
    code: MediaCanonicalRowBatchBufferErrorCode,
    message: string,
    options: ErrorOptions & {
      pendingRowCount: number;
      flushedBatchCount: number;
      flushedRowCount: number;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "MediaCanonicalRowBatchBufferError";
    this.code = code;
    this.pendingRowCount = options.pendingRowCount;
    this.flushedBatchCount = options.flushedBatchCount;
    this.flushedRowCount = options.flushedRowCount;
  }
}

export type MediaCanonicalRowBatchFlushReason =
  | "full"
  | "final";

export type MediaCanonicalRowBatchFlushContext = {
  batchIndex: number;
  rowStartIndex: number;
  rowEndIndex: number;
  reason: MediaCanonicalRowBatchFlushReason;
};

export type MediaCanonicalRowBatchConsumer = (
  rows: readonly EtrylueNormalizedMediaRow[],
  context: MediaCanonicalRowBatchFlushContext,
) => void | Promise<void>;

export type CreateMediaCanonicalRowBatchBufferInput = {
  maxBatchSize: number;
  onFlush: MediaCanonicalRowBatchConsumer;
};

export type MediaCanonicalRowBatchBufferState = {
  maxBatchSize: number;
  pendingRowCount: number;
  acceptedRowCount: number;
  flushedBatchCount: number;
  flushedRowCount: number;
  busy: boolean;
};

export type MediaCanonicalRowBatchBuffer = {
  push(row: EtrylueNormalizedMediaRow): Promise<void>;
  pushMany(
    rows: readonly EtrylueNormalizedMediaRow[],
  ): Promise<void>;
  flushRemaining(): Promise<void>;
  getState(): MediaCanonicalRowBatchBufferState;
  getPendingRowsForVerification():
    readonly EtrylueNormalizedMediaRow[];
};

function createError(
  code: MediaCanonicalRowBatchBufferErrorCode,
  message: string,
  state: Pick<
    MediaCanonicalRowBatchBufferState,
    | "pendingRowCount"
    | "flushedBatchCount"
    | "flushedRowCount"
  >,
  cause?: unknown,
): MediaCanonicalRowBatchBufferError {
  return new MediaCanonicalRowBatchBufferError(
    code,
    message,
    {
      pendingRowCount: state.pendingRowCount,
      flushedBatchCount: state.flushedBatchCount,
      flushedRowCount: state.flushedRowCount,
      cause,
    },
  );
}

function normalizeMaxBatchSize(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 10_000
  ) {
    throw createError(
      "INVALID_INPUT",
      "maxBatchSize must be an integer between 1 and 10000.",
      {
        pendingRowCount: 0,
        flushedBatchCount: 0,
        flushedRowCount: 0,
      },
    );
  }

  return value;
}

function assertRow(
  row: unknown,
  state: MediaCanonicalRowBatchBufferState,
): asserts row is EtrylueNormalizedMediaRow {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    throw createError(
      "INVALID_INPUT",
      "A canonical row object is required.",
      state,
    );
  }
}

export function createMediaCanonicalRowBatchBuffer(
  input: CreateMediaCanonicalRowBatchBufferInput,
): MediaCanonicalRowBatchBuffer {
  const maxBatchSize =
    normalizeMaxBatchSize(input?.maxBatchSize);

  if (
    !input ||
    typeof input.onFlush !== "function"
  ) {
    throw createError(
      "INVALID_INPUT",
      "onFlush must be a function.",
      {
        pendingRowCount: 0,
        flushedBatchCount: 0,
        flushedRowCount: 0,
      },
    );
  }

  const pendingRows:
    EtrylueNormalizedMediaRow[] = [];

  let acceptedRowCount = 0;
  let flushedBatchCount = 0;
  let flushedRowCount = 0;
  let busy = false;

  function getState(): MediaCanonicalRowBatchBufferState {
    return {
      maxBatchSize,
      pendingRowCount: pendingRows.length,
      acceptedRowCount,
      flushedBatchCount,
      flushedRowCount,
      busy,
    };
  }

  function assertNotBusy(): void {
    if (!busy) return;

    throw createError(
      "BUFFER_BUSY",
      "The canonical row batch buffer is already processing another operation.",
      getState(),
    );
  }

  async function flushBatch(
    reason: MediaCanonicalRowBatchFlushReason,
  ): Promise<void> {
    if (pendingRows.length === 0) return;

    const flushSize =
      reason === "full"
        ? maxBatchSize
        : pendingRows.length;

    if (
      reason === "full" &&
      pendingRows.length < maxBatchSize
    ) {
      return;
    }

    const batch =
      pendingRows.slice(0, flushSize);

    const rowStartIndex =
      flushedRowCount;

    const context:
      MediaCanonicalRowBatchFlushContext = {
        batchIndex: flushedBatchCount,
        rowStartIndex,
        rowEndIndex:
          rowStartIndex + batch.length - 1,
        reason,
      };

    try {
      await input.onFlush(batch, context);
    } catch (error) {
      throw createError(
        "CONSUMER_FAILED",
        "The canonical row batch consumer failed. The unconfirmed rows remain buffered.",
        getState(),
        error,
      );
    }

    pendingRows.splice(0, batch.length);
    flushedBatchCount += 1;
    flushedRowCount += batch.length;
  }

  async function runExclusive(
    operation: () => Promise<void>,
  ): Promise<void> {
    assertNotBusy();
    busy = true;

    try {
      await operation();
    } finally {
      busy = false;
    }
  }

  async function push(
    row: EtrylueNormalizedMediaRow,
  ): Promise<void> {
    await runExclusive(async () => {
      assertRow(row, getState());
      pendingRows.push(row);
      acceptedRowCount += 1;

      if (
        pendingRows.length >= maxBatchSize
      ) {
        await flushBatch("full");
      }
    });
  }

  async function pushMany(
    rows: readonly EtrylueNormalizedMediaRow[],
  ): Promise<void> {
    await runExclusive(async () => {
      if (!Array.isArray(rows)) {
        throw createError(
          "INVALID_INPUT",
          "rows must be an array.",
          getState(),
        );
      }

      for (const row of rows) {
        assertRow(row, getState());
        pendingRows.push(row);
        acceptedRowCount += 1;

        while (
          pendingRows.length >= maxBatchSize
        ) {
          await flushBatch("full");
        }
      }
    });
  }

  async function flushRemaining(): Promise<void> {
    await runExclusive(async () => {
      await flushBatch("final");
    });
  }

  return {
    push,
    pushMany,
    flushRemaining,
    getState,
    getPendingRowsForVerification: () =>
      pendingRows.slice(),
  };
}
