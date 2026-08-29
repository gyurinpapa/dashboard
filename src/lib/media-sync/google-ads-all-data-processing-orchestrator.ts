import {
  advanceGoogleAdsAllDataProductRoutingState,
  GoogleAdsAllDataProductRoutingError,
  validateGoogleAdsAllDataProductRoutingState,
  type GoogleAdsAllDataProductRoutingState,
} from "./google-ads-all-data-product-routing";

import type {
  GoogleAdsDemandGenAdStatsCollectorDependencies,
  GoogleAdsDemandGenAdStatsCollectorOptions,
} from "./google-ads-demand-gen-ad-stats-collector";

import {
  runGoogleAdsAllDataDemandGenStagingOrchestrator,
  type GoogleAdsAllDataDemandGenStagingCursor,
  type GoogleAdsAllDataDemandGenStagingOrchestratorDependencies,
  type GoogleAdsAllDataDemandGenStagingOrchestratorResult,
} from "./google-ads-all-data-demand-gen-staging-orchestrator";

import {
  runGoogleAdsAllDataSearchStagingOrchestrator,
  type GoogleAdsAllDataSearchStagingOrchestratorDependencies,
  type GoogleAdsAllDataSearchStagingOrchestratorInput,
} from "./google-ads-all-data-search-staging-orchestrator";

import {
  saveGoogleAdsAllDataProcessingCheckpoint,
  type GoogleAdsAllDataCheckpointJobRecord,
  type GoogleAdsAllDataCheckpointStagingResult,
  type GoogleAdsAllDataProcessingCheckpointDependencies,
} from "./google-ads-all-data-processing-checkpoint-repository";

import type {
  MediaSyncJobRecord,
} from "./types";

export type GoogleAdsAllDataProcessingStagingResult =
  GoogleAdsAllDataCheckpointStagingResult;

export type GoogleAdsAllDataProcessingCheckpointSaver =
  (
    input: Readonly<{
      job:
        MediaSyncJobRecord;

      result:
        GoogleAdsAllDataProcessingStagingResult;

      routing?:
        GoogleAdsAllDataProductRoutingState;
    }>,
    dependencies?:
      GoogleAdsAllDataProcessingCheckpointDependencies,
  ) => Promise<
    GoogleAdsAllDataCheckpointJobRecord
  >;

export type GoogleAdsAllDataProcessingOrchestratorDependencies =
  Readonly<{
    runStaging?:
      typeof runGoogleAdsAllDataSearchStagingOrchestrator;

    runDemandGenStaging?:
      typeof runGoogleAdsAllDataDemandGenStagingOrchestrator;

    saveCheckpoint?:
      GoogleAdsAllDataProcessingCheckpointSaver;

    stagingDependencies?:
      GoogleAdsAllDataSearchStagingOrchestratorDependencies;

    demandGenStagingDependencies?:
      GoogleAdsAllDataDemandGenStagingOrchestratorDependencies;

    checkpointDependencies?:
      GoogleAdsAllDataProcessingCheckpointDependencies;
  }>;

export type GoogleAdsAllDataProcessingOrchestratorInput =
  GoogleAdsAllDataSearchStagingOrchestratorInput &
  Readonly<{
    routing?:
      GoogleAdsAllDataProductRoutingState;

    demandGenCollectorDependencies?:
      GoogleAdsDemandGenAdStatsCollectorDependencies;

    demandGenCollectorOptions?:
      GoogleAdsDemandGenAdStatsCollectorOptions;
  }>;

export type GoogleAdsAllDataProcessingOrchestratorResult =
  Readonly<{
    staging:
      GoogleAdsAllDataProcessingStagingResult;

    job:
      GoogleAdsAllDataCheckpointJobRecord;
  }>;

function isPlainObject(
  value:
    unknown,
): value is Record<string, unknown> {
  return (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  );
}

function resolveDemandGenPhaseCursor(
  value:
    unknown,
): unknown {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return undefined;
  }

  if (
    !isPlainObject(
      value,
    ) ||
    value.version !==
      1 ||
    value.phase !==
      "demand_gen_ad" ||
    !(
      "phaseCursor" in
        value
    )
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "ROUTING_CONFLICT",
      "Demand Gen processing requires a durable demand_gen_ad resume cursor.",
    );
  }

  return value.phaseCursor;
}

function wrapDemandGenCursor(
  cursor:
    GoogleAdsAllDataDemandGenStagingCursor,
) {
  return Object.freeze({
    version:
      1 as const,

    phase:
      "demand_gen_ad" as const,

    externalAccountId:
      cursor.externalAccountId,

    dateWindowIndex:
      cursor.dateWindowIndex,

    dateFrom:
      cursor.dateFrom,

    dateTo:
      cursor.dateTo,

    expectedRowStartIndex:
      cursor.expectedRowStartIndex,

    phaseCursor:
      cursor,
  });
}

function normalizeDemandGenStagingResult(
  result:
    GoogleAdsAllDataDemandGenStagingOrchestratorResult,
): GoogleAdsAllDataProcessingStagingResult {
  const nextPhase =
    result.isComplete
      ? null
      : "demand_gen_ad" as const;

  const rawCursor =
    result.checkpoint.cursor;

  if (
    !result.isComplete &&
    rawCursor ===
      null
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "ROUTING_CONFLICT",
      "A partial Demand Gen staging result lost its durable cursor.",
    );
  }

  const cursor =
    rawCursor ===
      null
      ? null
      : wrapDemandGenCursor(
          rawCursor,
        );

  return Object.freeze({
    jobId:
      result.jobId,

    dateWindowIndex:
      result.dateWindowIndex,

    phaseRun:
      "demand_gen_ad" as const,

    nextPhase,

    rowStartIndex:
      result.rowStartIndex,

    nextRowIndex:
      result.nextRowIndex,

    runCanonicalRowCount:
      result.runCanonicalRowCount,

    status:
      result.status,

    isComplete:
      result.isComplete,

    apiPageExecutionCount:
      1 as const,

    stageResult:
      result,

    checkpoint:
      Object.freeze({
        version:
          1 as const,

        phaseRun:
          "demand_gen_ad" as const,

        nextPhase,

        nextRowIndex:
          result.checkpoint.nextRowIndex,

        totalRows:
          result.checkpoint.totalRows,

        failedRows:
          0 as const,

        complete:
          result.checkpoint.complete,

        cursor,
      }),
  });
}

export async function runGoogleAdsAllDataProcessingOrchestrator(
  input:
    GoogleAdsAllDataProcessingOrchestratorInput,
  dependencies:
    GoogleAdsAllDataProcessingOrchestratorDependencies = {},
): Promise<
  GoogleAdsAllDataProcessingOrchestratorResult
> {
  const saveCheckpoint =
    dependencies.saveCheckpoint ??
    saveGoogleAdsAllDataProcessingCheckpoint;

  const currentRouting =
    input.routing ===
      undefined
      ? null
      : validateGoogleAdsAllDataProductRoutingState(
          input.routing,
        );

  if (
    currentRouting !==
      null &&
    (
      currentRouting.complete ||
      (
        currentRouting.productFamily !==
          "search" &&
        currentRouting.productFamily !==
          "demand_gen"
      )
    )
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "ROUTING_CONFLICT",
      "Google Ads ALL-DATA processing requires an incomplete SEARCH or DEMAND_GEN durable product route.",
    );
  }

  const productFamily =
    currentRouting?.productFamily ??
    "search";

  let staging:
    GoogleAdsAllDataProcessingStagingResult;

  if (
    productFamily ===
      "search"
  ) {
    const runSearchStaging =
      dependencies.runStaging ??
      runGoogleAdsAllDataSearchStagingOrchestrator;

    staging =
      await runSearchStaging(
        input,
        dependencies.stagingDependencies,
      );
  } else {
    const runDemandGenStaging =
      dependencies.runDemandGenStaging ??
      runGoogleAdsAllDataDemandGenStagingOrchestrator;

    const demandGenResult =
      await runDemandGenStaging(
        {
          job:
            input.job,

          accessToken:
            input.accessToken,

          developerToken:
            input.developerToken,

          loginCustomerId:
            input.loginCustomerId,

          dateWindowIndex:
            input.dateWindowIndex,

          cursor:
            resolveDemandGenPhaseCursor(
              input.cursor,
            ),

          collectorDependencies:
            input.demandGenCollectorDependencies,

          collectorOptions:
            input.demandGenCollectorOptions,

          stagingRepositoryDependencies:
            input.stagingRepositoryDependencies,
        },
        dependencies.demandGenStagingDependencies,
      );

    staging =
      normalizeDemandGenStagingResult(
        demandGenResult,
      );
  }

  const nextRouting =
    currentRouting ===
      null
      ? null
      : staging.isComplete
        ? advanceGoogleAdsAllDataProductRoutingState({
            routing:
              currentRouting,

            completedProduct:
              productFamily,
          })
        : currentRouting;

  const job =
    await saveCheckpoint(
      {
        job:
          input.job,

        result:
          staging,

        ...(
          nextRouting ===
            null
            ? {}
            : {
                routing:
                  nextRouting,
              }
        ),
      },
      dependencies.checkpointDependencies,
    );

  return Object.freeze({
    staging,
    job,
  });
}
