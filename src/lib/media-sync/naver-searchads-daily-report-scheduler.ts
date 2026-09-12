import {
  getPreviousCompletedSeoulCalendarDate,
} from "./naver-searchads-daily-scheduler";
import {
  isValidYmd,
  type SafeMediaSyncJob,
} from "./types";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const DAILY_DATA_LEVEL =
  "keyword" as const;

const DAILY_MODE =
  "snapshot_replace" as const;

const MILLISECONDS_PER_DAY =
  86_400_000;

const MAX_ID_LENGTH =
  200;

export type NaverDailyReportCandidate = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  periodStart: string;
  periodEnd: string;
};

export type NaverDailyReportSchedulerAction =
  | "noop_active_naver_job"
  | "noop_no_candidate"
  | "noop_all_covered"
  | "noop_existing_active"
  | "created_or_replayed";

export type NaverDailyReportSchedulerResult = {
  targetDate: string;
  action:
    NaverDailyReportSchedulerAction;
  candidateCount: number;
  reportId: string | null;
  connectionId: string | null;
  date: string | null;
  jobId: string | null;
  status:
    | "pending"
    | "processing"
    | "done"
    | null;
};

export type NaverDailyReportSchedulerErrorCode =
  | "INVALID_INPUT"
  | "INVALID_CANDIDATE"
  | "DUPLICATE_CANDIDATE"
  | "CONTINUITY_INVALID"
  | "EXACT_JOB_SCOPE_MISMATCH"
  | "EXACT_JOB_FAILED"
  | "CREATE_RESULT_SCOPE_MISMATCH"
  | "CREATE_RESULT_FAILED"
  | "INVALID_JOB_STATUS";

export class NaverDailyReportSchedulerError
  extends Error {
  readonly code:
    NaverDailyReportSchedulerErrorCode;

  constructor(
    code:
      NaverDailyReportSchedulerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverDailyReportSchedulerError";

    this.code =
      code;
  }
}

type PartitionCoverageInput = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  dateFrom: string;
  dateTo: string;
};

type DailyCreateInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  date: string;
  dataLevel: "keyword";
};

export type NaverDailyReportSchedulerDependencies = {
  listActiveNaverJobs: (
  ) => Promise<SafeMediaSyncJob[]>;

  listCandidates: (
    input: {
      targetDate: string;
    },
  ) => Promise<
    NaverDailyReportCandidate[]
  >;

  loadPartitionCoverage: (
    input:
      PartitionCoverageInput,
  ) => Promise<string[]>;

  buildJobId?: (
    input: {
      reportId: string;
      connectionId: string;
      date: string;
    },
  ) =>
    | string
    | Promise<string>;

  loadExactJob: (
    jobId: string,
  ) => Promise<
    SafeMediaSyncJob | null
  >;

  createJob?: (
    input:
      DailyCreateInput,
  ) => Promise<SafeMediaSyncJob>;
};

export type RunNaverDailyReportSchedulerOnceInput = {
  now?: Date;
  dependencies:
    NaverDailyReportSchedulerDependencies;
};

type NormalizedCandidate = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  periodStart: string;
  periodEnd: string;
};

type CandidatePlan = {
  candidate:
    NormalizedCandidate;
  date: string;
  jobId: string;
};

async function defaultBuildJobId(
  input: {
    reportId: string;
    connectionId: string;
    date: string;
  },
): Promise<string> {
  const daily =
    await import(
      "./naver-searchads-daily-incremental"
    );

  return daily
    .buildNaverDailyIncrementalJobId(
      input,
    );
}

async function defaultCreateJob(
  input:
    DailyCreateInput,
): Promise<SafeMediaSyncJob> {
  const daily =
    await import(
      "./naver-searchads-daily-incremental"
    );

  return daily
    .createNaverDailyIncrementalJob(
      input,
    );
}

function requireIdentity(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    !normalized ||
    normalized.length >
      MAX_ID_LENGTH
  ) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_CANDIDATE",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function requireDate(
  value: unknown,
  fieldName: string,
): string {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    !isValidYmd(
      normalized,
    )
  ) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_CANDIDATE",
      `${fieldName} must be YYYY-MM-DD.`,
    );
  }

  return normalized;
}

function normalizeCandidate(
  value:
    NaverDailyReportCandidate,
): NormalizedCandidate {
  const periodStart =
    requireDate(
      value.periodStart,
      "periodStart",
    );

  const periodEnd =
    requireDate(
      value.periodEnd,
      "periodEnd",
    );

  if (
    periodStart >
    periodEnd
  ) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_CANDIDATE",
      "periodStart must not be after periodEnd.",
    );
  }

  return {
    reportId:
      requireIdentity(
        value.reportId,
        "reportId",
      ),

    connectionId:
      requireIdentity(
        value.connectionId,
        "connectionId",
      ),

    workspaceId:
      requireIdentity(
        value.workspaceId,
        "workspaceId",
      ),

    advertiserId:
      requireIdentity(
        value.advertiserId,
        "advertiserId",
      ),

    createdBy:
      requireIdentity(
        value.createdBy,
        "createdBy",
      ),

    periodStart,
    periodEnd,
  };
}

function parseYmdUtc(
  value: string,
): number {
  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  return Date.UTC(
    year,
    month - 1,
    day,
  );
}

function toYmdUtc(
  value: number,
): string {
  return new Date(value)
    .toISOString()
    .slice(0, 10);
}

function normalizeCoveredDates(
  input: {
    dates: string[];
    dateFrom: string;
    dateTo: string;
  },
): Set<string> {
  if (
    !Array.isArray(
      input.dates,
    )
  ) {
    throw new NaverDailyReportSchedulerError(
      "CONTINUITY_INVALID",
      "Fact partition coverage must be an array.",
    );
  }

  const covered =
    new Set<string>();

  for (
    const value of input.dates
  ) {
    if (
      typeof value !== "string" ||
      !isValidYmd(value) ||
      value < input.dateFrom ||
      value > input.dateTo ||
      covered.has(value)
    ) {
      throw new NaverDailyReportSchedulerError(
        "CONTINUITY_INVALID",
        "Fact partition coverage contains an invalid, duplicate, or out-of-range date.",
      );
    }

    covered.add(value);
  }

  return covered;
}

function findEarliestMissingDate(
  input: {
    dateFrom: string;
    dateTo: string;
    covered:
      ReadonlySet<string>;
  },
): string | null {
  const fromMs =
    parseYmdUtc(
      input.dateFrom,
    );

  const toMs =
    parseYmdUtc(
      input.dateTo,
    );

  for (
    let cursor = fromMs;
    cursor <= toMs;
    cursor += MILLISECONDS_PER_DAY
  ) {
    const date =
      toYmdUtc(
        cursor,
      );

    if (
      !input.covered.has(
        date,
      )
    ) {
      return date;
    }
  }

  return null;
}

function assertJobScope(
  input: {
    job:
      SafeMediaSyncJob;
    candidate:
      NormalizedCandidate;
    jobId: string;
    date: string;
    errorCode:
      | "EXACT_JOB_SCOPE_MISMATCH"
      | "CREATE_RESULT_SCOPE_MISMATCH";
  },
): void {
  const {
    job,
    candidate,
    jobId,
    date,
    errorCode,
  } = input;

  const matches =
    job.id === jobId &&
    job.report_id ===
      candidate.reportId &&
    job.connection_id ===
      candidate.connectionId &&
    job.workspace_id ===
      candidate.workspaceId &&
    job.advertiser_id ===
      candidate.advertiserId &&
    job.provider ===
      NAVER_PROVIDER &&
    job.date_from ===
      date &&
    job.date_to ===
      date &&
    job.data_level ===
      DAILY_DATA_LEVEL &&
    job.mode ===
      DAILY_MODE &&
    job.created_by ===
      candidate.createdBy;

  if (!matches) {
    throw new NaverDailyReportSchedulerError(
      errorCode,
      "The deterministic Daily job scope does not match the report-scoped scheduler candidate.",
    );
  }
}

function validateJobStatus(
  job:
    SafeMediaSyncJob,
  errorCode:
    | "EXACT_JOB_FAILED"
    | "CREATE_RESULT_FAILED",
): "pending" | "processing" | "done" {
  if (
    job.status ===
    "failed"
  ) {
    throw new NaverDailyReportSchedulerError(
      errorCode,
      "A failed deterministic Daily job cannot be retried automatically.",
    );
  }

  if (
    job.status !== "pending" &&
    job.status !== "processing" &&
    job.status !== "done"
  ) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_JOB_STATUS",
      "The deterministic Daily job has an unsupported status.",
    );
  }

  return job.status;
}

function emptyResult(
  input: {
    targetDate: string;
    action:
      NaverDailyReportSchedulerAction;
    candidateCount: number;
  },
): NaverDailyReportSchedulerResult {
  return {
    targetDate:
      input.targetDate,
    action:
      input.action,
    candidateCount:
      input.candidateCount,
    reportId: null,
    connectionId: null,
    date: null,
    jobId: null,
    status: null,
  };
}

export async function runNaverDailyReportSchedulerOnce(
  input:
    RunNaverDailyReportSchedulerOnceInput,
): Promise<
  NaverDailyReportSchedulerResult
> {
  if (
    !input ||
    !input.dependencies
  ) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_INPUT",
      "dependencies are required.",
    );
  }

  const targetDate =
    getPreviousCompletedSeoulCalendarDate(
      input.now ??
      new Date(),
    );

  const dependencies =
    input.dependencies;

  const initialActiveJobs =
    await dependencies
      .listActiveNaverJobs();

  if (
    !Array.isArray(
      initialActiveJobs,
    )
  ) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_INPUT",
      "listActiveNaverJobs returned an invalid result.",
    );
  }

  if (
    initialActiveJobs.length >
    0
  ) {
    return emptyResult({
      targetDate,
      action:
        "noop_active_naver_job",
      candidateCount: 0,
    });
  }

  const rawCandidates =
    await dependencies
      .listCandidates({
        targetDate,
      });

  if (
    !Array.isArray(
      rawCandidates,
    )
  ) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_INPUT",
      "listCandidates returned an invalid result.",
    );
  }

  if (
    rawCandidates.length ===
    0
  ) {
    return emptyResult({
      targetDate,
      action:
        "noop_no_candidate",
      candidateCount: 0,
    });
  }

  const candidates =
    rawCandidates.map(
      normalizeCandidate,
    );

  const candidateKeys =
    new Set<string>();

  for (
    const candidate of
    candidates
  ) {
    const key =
      candidate.reportId;

    if (
      candidateKeys.has(
        key,
      )
    ) {
      throw new NaverDailyReportSchedulerError(
        "DUPLICATE_CANDIDATE",
        "The report-scoped Daily candidate query returned the same report more than once.",
      );
    }

    candidateKeys.add(key);
  }

  const buildJobId =
    dependencies.buildJobId ??
    defaultBuildJobId;

  const plans:
    CandidatePlan[] = [];

  for (
    const candidate of
    candidates
  ) {
    if (
      candidate.periodStart >
      targetDate
    ) {
      continue;
    }

    const effectiveEnd =
      candidate.periodEnd <
      targetDate
        ? candidate.periodEnd
        : targetDate;

    if (
      candidate.periodStart >
      effectiveEnd
    ) {
      continue;
    }

    const covered =
      normalizeCoveredDates({
        dates:
          await dependencies
            .loadPartitionCoverage({
              connectionId:
                candidate.connectionId,
              workspaceId:
                candidate.workspaceId,
              advertiserId:
                candidate.advertiserId,
              dateFrom:
                candidate.periodStart,
              dateTo:
                effectiveEnd,
            }),

        dateFrom:
          candidate.periodStart,

        dateTo:
          effectiveEnd,
      });

    const missingDate =
      findEarliestMissingDate({
        dateFrom:
          candidate.periodStart,
        dateTo:
          effectiveEnd,
        covered,
      });

    if (!missingDate) {
      continue;
    }

    const jobId =
      String(
        await buildJobId({
          reportId:
            candidate.reportId,
          connectionId:
            candidate.connectionId,
          date:
            missingDate,
        }),
      ).trim();

    if (!jobId) {
      throw new NaverDailyReportSchedulerError(
        "INVALID_INPUT",
        "buildJobId returned an invalid value.",
      );
    }

    const exactJob =
      await dependencies
        .loadExactJob(
          jobId,
        );

    if (exactJob) {
      assertJobScope({
        job:
          exactJob,
        candidate,
        jobId,
        date:
          missingDate,
        errorCode:
          "EXACT_JOB_SCOPE_MISMATCH",
      });

      validateJobStatus(
        exactJob,
        "EXACT_JOB_FAILED",
      );

      if (
        exactJob.status ===
          "pending" ||
        exactJob.status ===
          "processing"
      ) {
        return {
          targetDate,
          action:
            "noop_existing_active",
          candidateCount:
            candidates.length,
          reportId:
            candidate.reportId,
          connectionId:
            candidate.connectionId,
          date:
            missingDate,
          jobId,
          status:
            exactJob.status,
        };
      }

      throw new NaverDailyReportSchedulerError(
        "CONTINUITY_INVALID",
        "The deterministic Daily job is done but its fact partition is still missing.",
      );
    }

    plans.push({
      candidate,
      date:
        missingDate,
      jobId,
    });
  }

  if (
    plans.length === 0
  ) {
    return emptyResult({
      targetDate,
      action:
        "noop_all_covered",
      candidateCount:
        candidates.length,
    });
  }

  plans.sort(
    (
      left,
      right,
    ) =>
      left.date.localeCompare(
        right.date,
      ) ||
      left.candidate.reportId.localeCompare(
        right.candidate.reportId,
      ) ||
      left.candidate.connectionId.localeCompare(
        right.candidate.connectionId,
      ),
  );

  const selected =
    plans[0];

  if (!selected) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_INPUT",
      "A selected Daily candidate could not be resolved.",
    );
  }

  const justInTimeActiveJobs =
    await dependencies
      .listActiveNaverJobs();

  if (
    !Array.isArray(
      justInTimeActiveJobs,
    )
  ) {
    throw new NaverDailyReportSchedulerError(
      "INVALID_INPUT",
      "The final active Naver job gate returned an invalid result.",
    );
  }

  if (
    justInTimeActiveJobs.length >
    0
  ) {
    return emptyResult({
      targetDate,
      action:
        "noop_active_naver_job",
      candidateCount:
        candidates.length,
    });
  }

  const createJob =
    dependencies.createJob ??
    defaultCreateJob;

  const createdJob =
    await createJob({
      reportId:
        selected.candidate.reportId,

      connectionId:
        selected.candidate.connectionId,

      workspaceId:
        selected.candidate.workspaceId,

      advertiserId:
        selected.candidate.advertiserId,

      createdBy:
        selected.candidate.createdBy,

      date:
        selected.date,

      dataLevel:
        DAILY_DATA_LEVEL,
    });

  assertJobScope({
    job:
      createdJob,
    candidate:
      selected.candidate,
    jobId:
      selected.jobId,
    date:
      selected.date,
    errorCode:
      "CREATE_RESULT_SCOPE_MISMATCH",
  });

  const createdStatus =
    validateJobStatus(
      createdJob,
      "CREATE_RESULT_FAILED",
    );

  return {
    targetDate,
    action:
      "created_or_replayed",
    candidateCount:
      candidates.length,
    reportId:
      selected.candidate.reportId,
    connectionId:
      selected.candidate.connectionId,
    date:
      selected.date,
    jobId:
      selected.jobId,
    status:
      createdStatus,
  };
}
