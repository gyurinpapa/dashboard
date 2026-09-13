import type {
  ActivateDailyReportV2CombinedSnapshotInput,
  CompleteDailyReportV2CombinedSnapshotInput,
  DailyReportV2CombinedSnapshotActivation,
  DailyReportV2CombinedSnapshotBatch,
  DailyReportV2CombinedSnapshotCheckpoint,
  DailyReportV2CombinedSnapshotCompletion,
  DailyReportV2CombinedSnapshotRun,
  LoadDailyReportV2CombinedSnapshotCheckpointInput,
  MaterializeDailyReportV2CombinedSnapshotBatchInput,
  PrepareDailyReportV2CombinedSnapshotInput,
} from "./daily-report-v2-combined-snapshot-repository";

export const DAILY_REPORT_V2_COMBINED_SNAPSHOT_BATCH_SIZE =
  5000 as const;

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

export type DailyReportV2CombinedSnapshotOrchestratorErrorCode =
  | "INVALID_INPUT"
  | "INVALID_RESULT";

export class DailyReportV2CombinedSnapshotOrchestratorError
  extends Error {
  readonly code:
    DailyReportV2CombinedSnapshotOrchestratorErrorCode;

  constructor(
    code:
      DailyReportV2CombinedSnapshotOrchestratorErrorCode,
    message:
      string,
    options?:
      ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "DailyReportV2CombinedSnapshotOrchestratorError";

    this.code =
      code;
  }
}

export type DailyReportV2CombinedSnapshotOrchestratorInput =
  Readonly<{
    reportId:
      string;
    workspaceId:
      string;
    advertiserId:
      string;
    createdBy:
      string;
    startDate:
      string;
    throughDate:
      string;
  }>;

export type DailyReportV2CombinedSnapshotOrchestrationAction =
  | "materialized_batch"
  | "activated"
  | "already_activated";

export type DailyReportV2CombinedSnapshotOrchestrationResult =
  Readonly<{
    action:
      DailyReportV2CombinedSnapshotOrchestrationAction;
    reportId:
      string;
    runId:
      string;
    snapshotIngestionId:
      string;
    expectedRows:
      number;
    nextRowIndex:
      number;
    status:
      "materializing" | "activated";
  }>;

export type DailyReportV2CombinedSnapshotOrchestratorDependencies =
  Readonly<{
    prepare: (
      input:
        PrepareDailyReportV2CombinedSnapshotInput,
    ) => Promise<
      DailyReportV2CombinedSnapshotRun
    >;

    loadCheckpoint: (
      input:
        LoadDailyReportV2CombinedSnapshotCheckpointInput,
    ) => Promise<
      DailyReportV2CombinedSnapshotCheckpoint
    >;

    materializeBatch: (
      input:
        MaterializeDailyReportV2CombinedSnapshotBatchInput,
    ) => Promise<
      DailyReportV2CombinedSnapshotBatch
    >;

    complete: (
      input:
        CompleteDailyReportV2CombinedSnapshotInput,
    ) => Promise<
      DailyReportV2CombinedSnapshotCompletion
    >;

    activate: (
      input:
        ActivateDailyReportV2CombinedSnapshotInput,
    ) => Promise<
      DailyReportV2CombinedSnapshotActivation
    >;
  }>;

async function resolveDependencies(
  dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies |
    undefined,
): Promise<
  DailyReportV2CombinedSnapshotOrchestratorDependencies
> {
  if (
    dependencies
  ) {
    return dependencies;
  }

  const repository =
    await import(
      "./daily-report-v2-combined-snapshot-repository"
    );

  return Object.freeze({
    prepare:
      repository
        .prepareDailyReportV2CombinedSnapshot,
    loadCheckpoint:
      repository
        .loadDailyReportV2CombinedSnapshotCheckpoint,
    materializeBatch:
      repository
        .materializeDailyReportV2CombinedSnapshotBatch,
    complete:
      repository
        .completeDailyReportV2CombinedSnapshot,
    activate:
      repository
        .activateDailyReportV2CombinedSnapshot,
  });
}

function validateInput(
  input:
    DailyReportV2CombinedSnapshotOrchestratorInput,
): void {
  const identities =
    [
      input?.reportId,
      input?.workspaceId,
      input?.advertiserId,
      input?.createdBy,
    ];

  if (
    !input ||
    identities.some(
      value =>
        typeof value !==
          "string" ||
        value.trim() ===
          "",
    ) ||
    !YMD_PATTERN.test(
      input.startDate,
    ) ||
    !YMD_PATTERN.test(
      input.throughDate,
    ) ||
    input.startDate >
      input.throughDate
  ) {
    throw new DailyReportV2CombinedSnapshotOrchestratorError(
      "INVALID_INPUT",
      "Daily Report V2 combined snapshot orchestration input is invalid.",
    );
  }
}

function assertRunScope(
  input:
    DailyReportV2CombinedSnapshotOrchestratorInput,
  run:
    DailyReportV2CombinedSnapshotRun,
): void {
  if (
    run.reportId !==
      input.reportId ||
    run.startDate !==
      input.startDate ||
    run.throughDate !==
      input.throughDate
  ) {
    throw new DailyReportV2CombinedSnapshotOrchestratorError(
      "INVALID_RESULT",
      "Combined snapshot run does not match orchestration scope.",
    );
  }
}

function assertCheckpointScope(
  run:
    DailyReportV2CombinedSnapshotRun,
  checkpoint:
    DailyReportV2CombinedSnapshotCheckpoint,
): void {
  if (
    checkpoint.reportId !==
      run.reportId ||
    checkpoint.snapshotIngestionId !==
      run.snapshotIngestionId ||
    checkpoint.expectedRows !==
      run.expectedRows ||
    checkpoint.nextRowIndex >
      run.expectedRows
  ) {
    throw new DailyReportV2CombinedSnapshotOrchestratorError(
      "INVALID_RESULT",
      "Combined snapshot durable checkpoint does not match the run.",
    );
  }
}

function assertBatchScope(
  run:
    DailyReportV2CombinedSnapshotRun,
  checkpoint:
    DailyReportV2CombinedSnapshotCheckpoint,
  batch:
    DailyReportV2CombinedSnapshotBatch,
): void {
  if (
    batch.runId !==
      run.runId ||
    batch.reportId !==
      run.reportId ||
    batch.snapshotIngestionId !==
      run.snapshotIngestionId ||
    batch.expectedRows !==
      run.expectedRows ||
    batch.batchStart !==
      checkpoint.nextRowIndex ||
    batch.nextRowIndex <=
      checkpoint.nextRowIndex ||
    batch.nextRowIndex >
      run.expectedRows
  ) {
    throw new DailyReportV2CombinedSnapshotOrchestratorError(
      "INVALID_RESULT",
      "Combined snapshot materialization result violates checkpoint scope.",
    );
  }
}

function assertCompletionScope(
  run:
    DailyReportV2CombinedSnapshotRun,
  completion:
    DailyReportV2CombinedSnapshotCompletion,
): void {
  if (
    completion.runId !==
      run.runId ||
    completion.reportId !==
      run.reportId ||
    completion.snapshotIngestionId !==
      run.snapshotIngestionId ||
    completion.rowCount !==
      run.expectedRows ||
    completion.status !==
      "ready"
  ) {
    throw new DailyReportV2CombinedSnapshotOrchestratorError(
      "INVALID_RESULT",
      "Combined snapshot completion result does not match the run.",
    );
  }
}

function assertActivationScope(
  run:
    DailyReportV2CombinedSnapshotRun,
  activation:
    DailyReportV2CombinedSnapshotActivation,
): void {
  if (
    activation.runId !==
      run.runId ||
    activation.reportId !==
      run.reportId ||
    activation.snapshotIngestionId !==
      run.snapshotIngestionId ||
    activation.currentIngestionId !==
      run.snapshotIngestionId ||
    activation.rowCount !==
      run.expectedRows ||
    activation.status !==
      "activated"
  ) {
    throw new DailyReportV2CombinedSnapshotOrchestratorError(
      "INVALID_RESULT",
      "Combined snapshot activation result does not match the run.",
    );
  }
}

function activatedResult(
  run:
    DailyReportV2CombinedSnapshotRun,
  action:
    "activated" |
    "already_activated",
): DailyReportV2CombinedSnapshotOrchestrationResult {
  return Object.freeze({
    action,
    reportId:
      run.reportId,
    runId:
      run.runId,
    snapshotIngestionId:
      run.snapshotIngestionId,
    expectedRows:
      run.expectedRows,
    nextRowIndex:
      run.expectedRows,
    status:
      "activated" as const,
  });
}

async function activateReady(
  run:
    DailyReportV2CombinedSnapshotRun,
  dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies,
): Promise<
  DailyReportV2CombinedSnapshotOrchestrationResult
> {
  const activation =
    await dependencies.activate({
      runId:
        run.runId,
    });

  assertActivationScope(
    run,
    activation,
  );

  return activatedResult(
    run,
    "activated",
  );
}

async function completeAndActivate(
  run:
    DailyReportV2CombinedSnapshotRun,
  dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies,
): Promise<
  DailyReportV2CombinedSnapshotOrchestrationResult
> {
  const completion =
    await dependencies.complete({
      runId:
        run.runId,
    });

  assertCompletionScope(
    run,
    completion,
  );

  return activateReady(
    run,
    dependencies,
  );
}

export async function runDailyReportV2CombinedSnapshotOrchestratorOnce(
  input:
    DailyReportV2CombinedSnapshotOrchestratorInput,
  dependencies?:
    DailyReportV2CombinedSnapshotOrchestratorDependencies,
): Promise<
  DailyReportV2CombinedSnapshotOrchestrationResult
> {
  validateInput(
    input,
  );

  dependencies =
    await resolveDependencies(
      dependencies,
    );

  let run =
    await dependencies.prepare({
      reportId:
        input.reportId,
      workspaceId:
        input.workspaceId,
      advertiserId:
        input.advertiserId,
      createdBy:
        input.createdBy,
      startDate:
        input.startDate,
      throughDate:
        input.throughDate,
    });

  assertRunScope(
    input,
    run,
  );

  if (
    run.status ===
      "activated"
  ) {
    return activatedResult(
      run,
      "already_activated",
    );
  }

  if (
    run.status ===
      "ready"
  ) {
    return activateReady(
      run,
      dependencies,
    );
  }

  if (
    run.expectedRows ===
      0
  ) {
    return completeAndActivate(
      run,
      dependencies,
    );
  }

  const checkpoint =
    await dependencies
      .loadCheckpoint({
        snapshotIngestionId:
          run.snapshotIngestionId,
        reportId:
          run.reportId,
        expectedRows:
          run.expectedRows,
      });

  assertCheckpointScope(
    run,
    checkpoint,
  );

  /*
   * If another invocation completed the ingestion between prepare and this
   * checkpoint read, refresh the authoritative run state once.
   */
  if (
    checkpoint.ingestionStatus ===
      "success"
  ) {
    run =
      await dependencies.prepare({
        reportId:
          input.reportId,
        workspaceId:
          input.workspaceId,
        advertiserId:
          input.advertiserId,
        createdBy:
          input.createdBy,
        startDate:
          input.startDate,
        throughDate:
          input.throughDate,
      });

    assertRunScope(
      input,
      run,
    );

    if (
      run.status ===
        "activated"
    ) {
      return activatedResult(
        run,
        "already_activated",
      );
    }

    if (
      run.status ===
        "ready"
    ) {
      return activateReady(
        run,
        dependencies,
      );
    }

    throw new DailyReportV2CombinedSnapshotOrchestratorError(
      "INVALID_RESULT",
      "Successful snapshot ingestion is not represented by a ready or activated run.",
    );
  }

  /*
   * Durable crash resume:
   * final materialization committed row_count, but completion did not run.
   */
  if (
    checkpoint.nextRowIndex ===
      run.expectedRows
  ) {
    return completeAndActivate(
      run,
      dependencies,
    );
  }

  /*
   * Exactly one advancing batch per scheduler invocation.
   * No unbounded materialization loop.
   */
  const batch =
    await dependencies
      .materializeBatch({
        runId:
          run.runId,
        batchStart:
          checkpoint.nextRowIndex,
        batchSize:
          DAILY_REPORT_V2_COMBINED_SNAPSHOT_BATCH_SIZE,
      });

  assertBatchScope(
    run,
    checkpoint,
    batch,
  );

  if (
    !batch.complete
  ) {
    return Object.freeze({
      action:
        "materialized_batch" as const,
      reportId:
        run.reportId,
      runId:
        run.runId,
      snapshotIngestionId:
        run.snapshotIngestionId,
      expectedRows:
        run.expectedRows,
      nextRowIndex:
        batch.nextRowIndex,
      status:
        "materializing" as const,
    });
  }

  return completeAndActivate(
    run,
    dependencies,
  );
}
