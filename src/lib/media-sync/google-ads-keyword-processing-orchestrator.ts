import {
  runGoogleAdsKeywordStagingOrchestrator,
  type GoogleAdsKeywordStagingOrchestratorInput,
  type GoogleAdsKeywordStagingOrchestratorResult,
} from "./google-ads-keyword-staging-orchestrator";
import {
  saveGoogleAdsKeywordProcessingCheckpoint,
  type GoogleAdsKeywordProcessingCheckpointDependencies,
} from "./google-ads-keyword-processing-checkpoint-repository";
import type {
  MediaSyncJobRecord,
} from "./types";

export type GoogleAdsKeywordProcessingCheckpointSaver =
  (
    input: Readonly<{
      job: MediaSyncJobRecord;
      result:
        GoogleAdsKeywordStagingOrchestratorResult;
    }>,
    dependencies?:
      GoogleAdsKeywordProcessingCheckpointDependencies,
  ) => Promise<MediaSyncJobRecord>;

export type GoogleAdsKeywordProcessingOrchestratorDependencies =
  Readonly<{
    runStaging?:
      typeof runGoogleAdsKeywordStagingOrchestrator;
    saveCheckpoint?:
      GoogleAdsKeywordProcessingCheckpointSaver;
    checkpointDependencies?:
      GoogleAdsKeywordProcessingCheckpointDependencies;
  }>;

export type GoogleAdsKeywordProcessingOrchestratorInput =
  GoogleAdsKeywordStagingOrchestratorInput;

export type GoogleAdsKeywordProcessingOrchestratorResult =
  Readonly<{
    staging:
      GoogleAdsKeywordStagingOrchestratorResult;
    job:
      MediaSyncJobRecord;
  }>;

export async function runGoogleAdsKeywordProcessingOrchestrator(
  input:
    GoogleAdsKeywordProcessingOrchestratorInput,
  dependencies:
    GoogleAdsKeywordProcessingOrchestratorDependencies = {},
): Promise<
  GoogleAdsKeywordProcessingOrchestratorResult
> {
  const runStaging =
    dependencies.runStaging ??
    runGoogleAdsKeywordStagingOrchestrator;

  const saveCheckpoint =
    dependencies.saveCheckpoint ??
    saveGoogleAdsKeywordProcessingCheckpoint;

  const staging =
    await runStaging(
      input,
    );

  const job =
    await saveCheckpoint(
      {
        job:
          input.job,
        result:
          staging,
      },
      dependencies.checkpointDependencies,
    );

  return Object.freeze({
    staging,
    job,
  });
}
