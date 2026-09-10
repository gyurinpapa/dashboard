import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";

import {
  parseMediaSyncSegmentProgress,
  type MediaSyncSegmentProgress,
} from "./media-sync-segment-progress";

import {
  createNaverSearchAdsSegmentTransition,
  type NaverSearchAdsSegmentTransitionResult,
} from "./naver-searchads-segment-transition";

import type {
  NaverSearchAdsCombinedProcessingCheckpoint,
} from "./media-sync-combined-processing-checkpoint-repository";

import type {
  MediaSyncJobRecord,
} from "./types";

const TRANSITION_NAVER_MEDIA_SYNC_SEGMENT_RPC =
  "transition_naver_media_sync_segment" as const;

export type NaverSearchAdsSegmentTransitionRepositoryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "INVALID_PROGRESS"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_PROCESSING"
  | "SCOPE_MISMATCH"
  | "UNSUPPORTED_PROVIDER"
  | "PROGRESS_MISMATCH"
  | "CHECKPOINT_MISSING"
  | "CHECKPOINT_INVALID"
  | "CHECKPOINT_NOT_COMPLETED"
  | "INVALID_TRANSITION"
  | "REPLAY_MISMATCH"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class NaverSearchAdsSegmentTransitionRepositoryError
  extends Error {
  readonly code:
    NaverSearchAdsSegmentTransitionRepositoryErrorCode;

  constructor(
    code:
      NaverSearchAdsSegmentTransitionRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverSearchAdsSegmentTransitionRepositoryError";

    this.code =
      code;
  }
}

export type NaverSearchAdsSegmentTransitionRpcResult =
  Readonly<{
    data: unknown;
    error: unknown;
  }>;

export type NaverSearchAdsSegmentTransitionRpcInvoker =
  (
    functionName: string,
    args: Readonly<{
      p_payload: unknown;
    }>,
  ) =>
    Promise<
      NaverSearchAdsSegmentTransitionRpcResult
    >;

export type NaverSearchAdsSegmentTransitionRepositoryDependencies =
  Readonly<{
    invokeRpc?:
      NaverSearchAdsSegmentTransitionRpcInvoker;
  }>;

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  );
}

function mapRpcError(
  error: unknown,
): NaverSearchAdsSegmentTransitionRepositoryError {
  const message =
    isPlainObject(error) &&
    typeof error.message ===
      "string"
      ? error.message
      : "";

  const mappings:
    readonly [
      string,
      NaverSearchAdsSegmentTransitionRepositoryErrorCode,
    ][] = [
      [
        "MNST_JOB_NOT_FOUND",
        "JOB_NOT_FOUND",
      ],
      [
        "MNST_JOB_NOT_PROCESSING",
        "JOB_NOT_PROCESSING",
      ],
      [
        "MNST_SCOPE_MISMATCH",
        "SCOPE_MISMATCH",
      ],
      [
        "MNST_UNSUPPORTED_PROVIDER",
        "UNSUPPORTED_PROVIDER",
      ],
      [
        "MNST_PROGRESS_MISMATCH",
        "PROGRESS_MISMATCH",
      ],
      [
        "MNST_CHECKPOINT_MISSING",
        "CHECKPOINT_MISSING",
      ],
      [
        "MNST_CHECKPOINT_INVALID",
        "CHECKPOINT_INVALID",
      ],
      [
        "MNST_CHECKPOINT_NOT_COMPLETED",
        "CHECKPOINT_NOT_COMPLETED",
      ],
      [
        "MNST_INVALID_TRANSITION",
        "INVALID_TRANSITION",
      ],
      [
        "MNST_REPLAY_MISMATCH",
        "REPLAY_MISMATCH",
      ],
      [
        "MNST_INVALID_PROGRESS",
        "INVALID_PROGRESS",
      ],
      [
        "MNST_INVALID_INPUT",
        "INVALID_INPUT",
      ],
    ];

  for (
    const [
      marker,
      code,
    ]
    of mappings
  ) {
    if (
      message.includes(
        marker,
      )
    ) {
      return new NaverSearchAdsSegmentTransitionRepositoryError(
        code,
        "Naver media sync segment transition failed.",
        {
          cause:
            error,
        },
      );
    }
  }

  return new NaverSearchAdsSegmentTransitionRepositoryError(
    "DATABASE_ERROR",
    "Naver media sync segment transition persistence failed.",
    {
      cause:
        error,
    },
  );
}

async function invokeDefaultRpc(
  functionName: string,
  args: Readonly<{
    p_payload: unknown;
  }>,
): Promise<
  NaverSearchAdsSegmentTransitionRpcResult
> {
  const {
    getSupabaseAdmin,
  } =
    await import(
      "../supabase/admin"
    );

  const supabase =
    getSupabaseAdmin();

  const result =
    await supabase.rpc(
      functionName,
      args,
    );

  return {
    data:
      result.data,

    error:
      result.error,
  };
}

function protectedStateSnapshot(
  job:
    MediaSyncJobRecord,
) {
  return {
    status:
      job.status,

    progress:
      job.progress,

    raw_rows:
      job.raw_rows,

    normalized_rows:
      job.normalized_rows,

    inserted_rows:
      job.inserted_rows,

    failed_rows:
      job.failed_rows,

    previous_ingestion_id:
      job.previous_ingestion_id,

    snapshot_ingestion_id:
      job.snapshot_ingestion_id,

    started_at:
      job.started_at,

    finished_at:
      job.finished_at,

    attempt_count:
      job.attempt_count,
  };
}

export async function transitionNaverSearchAdsSegment(
  input: Readonly<{
    job:
      MediaSyncJobRecord;

    progress:
      MediaSyncSegmentProgress;

    checkpoint:
      NaverSearchAdsCombinedProcessingCheckpoint;
  }>,
  dependencies:
    NaverSearchAdsSegmentTransitionRepositoryDependencies =
      {},
): Promise<
  Readonly<{
    job:
      MediaSyncJobRecord;

    transition:
      NaverSearchAdsSegmentTransitionResult;
  }>
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_INPUT",
      "Naver segment transition input is required.",
    );
  }

  if (
    input.job.provider !==
      "naver_searchad" ||
    input.job.status !==
      "processing"
  ) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_JOB",
      "A processing Naver media sync job is required.",
    );
  }

  let progress:
    MediaSyncSegmentProgress;

  try {
    progress =
      parseMediaSyncSegmentProgress(
        input.progress,
        {
          dateFrom:
            input.job.date_from,

          dateTo:
            input.job.date_to,
        },
      );
  } catch (error) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_PROGRESS",
      "Naver segment progress does not match the job.",
      {
        cause:
          error,
      },
    );
  }

  let transition:
    NaverSearchAdsSegmentTransitionResult;

  try {
    transition =
      createNaverSearchAdsSegmentTransition({
        jobDateFrom:
          input.job.date_from,

        jobDateTo:
          input.job.date_to,

        progress,

        checkpoint:
          input.checkpoint,
      });
  } catch (error) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_TRANSITION",
      "Naver segment transition could not be constructed.",
      {
        cause:
          error,
      },
    );
  }

  const payload = {
    job_id:
      input.job.id,

    workspace_id:
      input.job.workspace_id,

    advertiser_id:
      input.job.advertiser_id,

    connection_id:
      input.job.connection_id,

    provider:
      input.job.provider,

    external_account_id:
      input.job.external_account_id,

    date_from:
      input.job.date_from,

    date_to:
      input.job.date_to,

    expected_progress:
      progress,

    next_progress:
      transition.progress,
  };

  const invokeRpc =
    dependencies.invokeRpc ??
    invokeDefaultRpc;

  let result:
    NaverSearchAdsSegmentTransitionRpcResult;

  try {
    result =
      await invokeRpc(
        TRANSITION_NAVER_MEDIA_SYNC_SEGMENT_RPC,
        {
          p_payload:
            payload,
        },
      );
  } catch (error) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "DATABASE_ERROR",
      "Naver segment transition repository could not access the database.",
      {
        cause:
          error,
      },
    );
  }

  if (
    result.error
  ) {
    throw mapRpcError(
      result.error,
    );
  }

  if (
    !Array.isArray(
      result.data,
    ) ||
    result.data.length !==
      1
  ) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Naver segment transition RPC returned an invalid result.",
    );
  }

  let updatedJob:
    MediaSyncJobRecord;

  try {
    updatedJob =
      parseMediaSyncJobRecord(
        result.data[0],
      );
  } catch (error) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Naver segment transition RPC returned an invalid media sync job.",
      {
        cause:
          error,
      },
    );
  }

  if (
    updatedJob.id !==
      input.job.id ||
    updatedJob.workspace_id !==
      input.job.workspace_id ||
    updatedJob.advertiser_id !==
      input.job.advertiser_id ||
    updatedJob.connection_id !==
      input.job.connection_id ||
    updatedJob.provider !==
      input.job.provider ||
    updatedJob.external_account_id !==
      input.job.external_account_id ||
    updatedJob.date_from !==
      input.job.date_from ||
    updatedJob.date_to !==
      input.job.date_to
  ) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Naver segment transition RPC returned a scope-mismatched job.",
    );
  }

  if (
    JSON.stringify(
      protectedStateSnapshot(
        updatedJob,
      ),
    ) !==
    JSON.stringify(
      protectedStateSnapshot(
        input.job,
      ),
    )
  ) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Naver segment transition changed protected job state.",
    );
  }

  let savedProgress:
    MediaSyncSegmentProgress;

  try {
    savedProgress =
      parseMediaSyncSegmentProgress(
        updatedJob
          .sync_segment_progress,
        {
          dateFrom:
            updatedJob.date_from,

          dateTo:
            updatedJob.date_to,
        },
      );
  } catch (error) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Naver segment transition returned invalid segment progress.",
      {
        cause:
          error,
      },
    );
  }

  if (
    JSON.stringify(
      savedProgress,
    ) !==
    JSON.stringify(
      transition.progress,
    )
  ) {
    throw new NaverSearchAdsSegmentTransitionRepositoryError(
      "INVALID_DATABASE_RESULT",
      "Naver segment transition progress does not match the requested transition.",
    );
  }

  return Object.freeze({
    job:
      updatedJob,

    transition,
  });
}
