import {
  createPendingMediaSyncJob,
  type CreatePendingMediaSyncJobInput,
} from "./media-sync-jobs-repository";
import {
  isValidMediaSyncDateRange,
  type SafeMediaSyncJob,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const NAVER_BACKFILL_DATA_LEVEL =
  "keyword" as const;

const NAVER_BACKFILL_MODE =
  "snapshot_replace" as const;

const REQUIRED_ID_MAX_LENGTH = 200;
const MILLISECONDS_PER_DAY = 86_400_000;

export const NAVER_BACKFILL_MAX_DAYS = 7;

export type CreateNaverSearchAdsBackfillJobInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
};

export type NaverSearchAdsBackfillDependencies = {
  createPendingJob?: (
    input: CreatePendingMediaSyncJobInput,
  ) => Promise<SafeMediaSyncJob>;
};

function requireIdentity(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > REQUIRED_ID_MAX_LENGTH
  ) {
    throw new Error(
      `${fieldName} is invalid.`,
    );
  }

  return value.trim();
}

function requireBackfillRange(
  dateFromValue: unknown,
  dateToValue: unknown,
): {
  dateFrom: string;
  dateTo: string;
} {
  if (
    typeof dateFromValue !== "string" ||
    typeof dateToValue !== "string"
  ) {
    throw new Error(
      "Backfill dates must be YYYY-MM-DD strings.",
    );
  }

  const dateFrom = dateFromValue.trim();
  const dateTo = dateToValue.trim();

  if (
    !isValidMediaSyncDateRange(
      dateFrom,
      dateTo,
    )
  ) {
    throw new Error(
      "Backfill dates must form a valid YYYY-MM-DD range.",
    );
  }

  const startMs = Date.parse(
    `${dateFrom}T00:00:00.000Z`,
  );
  const endMs = Date.parse(
    `${dateTo}T00:00:00.000Z`,
  );

  const dayCount =
    Math.floor(
      (endMs - startMs) /
        MILLISECONDS_PER_DAY,
    ) + 1;

  if (
    !Number.isSafeInteger(dayCount) ||
    dayCount < 1 ||
    dayCount > NAVER_BACKFILL_MAX_DAYS
  ) {
    throw new Error(
      `Naver backfill must contain between 1 and ${NAVER_BACKFILL_MAX_DAYS} calendar days.`,
    );
  }

  return {
    dateFrom,
    dateTo,
  };
}

export function buildNaverSearchAdsBackfillRequest(
  input: CreateNaverSearchAdsBackfillJobInput,
): CreatePendingMediaSyncJobInput {
  const {
    dateFrom,
    dateTo,
  } = requireBackfillRange(
    input.dateFrom,
    input.dateTo,
  );

  return {
    reportId: requireIdentity(
      input.reportId,
      "reportId",
    ),
    connectionId: requireIdentity(
      input.connectionId,
      "connectionId",
    ),
    workspaceId: requireIdentity(
      input.workspaceId,
      "workspaceId",
    ),
    advertiserId: requireIdentity(
      input.advertiserId,
      "advertiserId",
    ),
    createdBy: requireIdentity(
      input.createdBy,
      "createdBy",
    ),
    dateFrom,
    dateTo,
    dataLevel: NAVER_BACKFILL_DATA_LEVEL,
    mode: NAVER_BACKFILL_MODE,
  };
}

function assertBackfillResult(
  job: SafeMediaSyncJob,
  request: CreatePendingMediaSyncJobInput,
): void {
  const matches =
    job.report_id === request.reportId &&
    job.connection_id === request.connectionId &&
    job.workspace_id === request.workspaceId &&
    job.advertiser_id === request.advertiserId &&
    job.provider === NAVER_SEARCH_ADS_PROVIDER &&
    job.date_from === request.dateFrom &&
    job.date_to === request.dateTo &&
    job.data_level === NAVER_BACKFILL_DATA_LEVEL &&
    job.mode === NAVER_BACKFILL_MODE &&
    job.created_by === request.createdBy;

  if (!matches) {
    throw new Error(
      "Created Naver backfill job does not match the requested scope.",
    );
  }

  if (job.status !== "pending") {
    throw new Error(
      "Created Naver backfill job must be pending.",
    );
  }
}

/**
 * Internal-only bounded Naver backfill creator.
 *
 * Historical remediation deliberately stays separate from the deterministic
 * daily scheduler. The repository remains authoritative for report-to-
 * connection mapping, provider capability, active-job collision protection,
 * and the database-generated job identity used by manual/remediation work.
 */
export async function createNaverSearchAdsBackfillJob(
  input: CreateNaverSearchAdsBackfillJobInput,
  dependencies: NaverSearchAdsBackfillDependencies = {},
): Promise<SafeMediaSyncJob> {
  const request =
    buildNaverSearchAdsBackfillRequest(
      input,
    );

  const createPendingJob =
    dependencies.createPendingJob ??
    createPendingMediaSyncJob;

  const job = await createPendingJob(
    request,
  );

  assertBackfillResult(
    job,
    request,
  );

  return job;
}
