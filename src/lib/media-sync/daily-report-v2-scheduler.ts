import {
  createHash,
} from "node:crypto";

import type {
  DailyReportV2ContiguousCoverage,
  DailyReportV2ParticipantCoverage,
} from "./daily-report-v2-contiguous-coverage-repository";
import {
  getPreviousCompletedSeoulCalendarDate,
} from "./naver-searchads-daily-scheduler";
import {
  isValidYmd,
  type SafeMediaSyncJob,
} from "./types";

const DAILY_REPORT_V2_AUTOMATION_CONTRACT =
  "daily_report_v2" as const;

const DAILY_DATA_LEVEL =
  "keyword" as const;

const DAILY_MODE =
  "snapshot_replace" as const;

const FACT_PROVIDER_ORDER =
  [
    "naver_searchad",
    "google_ads",
  ] as const;

type DailyReportV2FactProvider =
  (typeof FACT_PROVIDER_ORDER)[number];

const MAX_ID_LENGTH =
  200;

export type DailyReportV2SchedulerCandidate =
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
  }>;

type ScopedReportInput =
  Readonly<{
    reportId:
      string;
    workspaceId:
      string;
    advertiserId:
      string;
  }>;

type DailyReportV2CreateInput =
  Readonly<{
    reportId:
      string;
    jobId:
      string;
    connectionId:
      string;
    workspaceId:
      string;
    advertiserId:
      string;
    createdBy:
      string;
    dateFrom:
      string;
    dateTo:
      string;
    dataLevel:
      "keyword";
    mode:
      "snapshot_replace";
  }>;

export type DailyReportV2SchedulerDependencies =
  Readonly<{
    listCandidates: (
      input: Readonly<{
        targetDate:
          string;
      }>,
    ) => Promise<
      DailyReportV2SchedulerCandidate[]
    >;

    loadCoverage: (
      input:
        ScopedReportInput &
        Readonly<{
          throughDate:
            string;
        }>,
    ) => Promise<
      DailyReportV2ContiguousCoverage
    >;

    listActiveJobsForReport: (
      input:
        ScopedReportInput,
    ) => Promise<
      SafeMediaSyncJob[]
    >;

    loadExactJob: (
      jobId:
        string,
    ) => Promise<
      SafeMediaSyncJob | null
    >;

    createJob: (
      input:
        DailyReportV2CreateInput,
    ) => Promise<
      SafeMediaSyncJob
    >;
  }>;

export type DailyReportV2SchedulerAction =
  | "noop_no_candidate"
  | "noop_all_covered"
  | "noop_active_report_job"
  | "noop_existing_active"
  | "created_or_replayed";

export type DailyReportV2SchedulerResult =
  Readonly<{
    targetDate:
      string;
    action:
      DailyReportV2SchedulerAction;
    candidateCount:
      number;
    reportId:
      string | null;
    connectionId:
      string | null;
    provider:
      DailyReportV2FactProvider | null;
    date:
      string | null;
    jobId:
      string | null;
    status:
      "pending" |
      "processing" |
      "done" |
      null;
  }>;

export type DailyReportV2SchedulerErrorCode =
  | "INVALID_INPUT"
  | "INVALID_CANDIDATE"
  | "DUPLICATE_CANDIDATE"
  | "INVALID_COVERAGE"
  | "INVALID_ACTIVE_JOB_RESULT"
  | "MULTIPLE_ACTIVE_JOBS"
  | "EXACT_JOB_SCOPE_MISMATCH"
  | "EXACT_JOB_FAILED"
  | "CONTINUITY_INVALID"
  | "INVALID_JOB_STATUS"
  | "CREATE_RESULT_SCOPE_MISMATCH"
  | "CREATE_RESULT_FAILED";

export class DailyReportV2SchedulerError
  extends Error {
  readonly code:
    DailyReportV2SchedulerErrorCode;

  constructor(
    code:
      DailyReportV2SchedulerErrorCode,
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
      "DailyReportV2SchedulerError";

    this.code =
      code;
  }
}

type SchedulerPlan =
  Readonly<{
    candidate:
      DailyReportV2SchedulerCandidate;
    participant:
      DailyReportV2ParticipantCoverage & {
        provider:
          DailyReportV2FactProvider;
      };
    date:
      string;
    jobId:
      string;
  }>;

function requireIdentity(
  value:
    unknown,
  field:
    string,
): string {
  const normalized =
    typeof value ===
      "string"
      ? value.trim()
      : "";

  if (
    !normalized ||
    normalized.length >
      MAX_ID_LENGTH
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_CANDIDATE",
      `${field} is invalid.`,
    );
  }

  return normalized;
}

function requireYmd(
  value:
    unknown,
  field:
    string,
): string {
  const normalized =
    requireIdentity(
      value,
      field,
    );

  if (
    !isValidYmd(
      normalized,
    )
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_CANDIDATE",
      `${field} must be YYYY-MM-DD.`,
    );
  }

  return normalized;
}

function normalizeCandidate(
  value:
    DailyReportV2SchedulerCandidate,
): DailyReportV2SchedulerCandidate {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_CANDIDATE",
      "Daily Report V2 scheduler candidate is invalid.",
    );
  }

  return Object.freeze({
    reportId:
      requireIdentity(
        value.reportId,
        "reportId",
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
    startDate:
      requireYmd(
        value.startDate,
        "startDate",
      ),
  });
}

function isDailyReportV2FactProvider(
  value:
    unknown,
): value is DailyReportV2FactProvider {
  return (
    value ===
      "naver_searchad" ||
    value ===
      "google_ads"
  );
}

function providerOrder(
  provider:
    DailyReportV2FactProvider,
): number {
  const index =
    FACT_PROVIDER_ORDER
      .indexOf(
        provider,
      );

  return index < 0
    ? Number.MAX_SAFE_INTEGER
    : index;
}

function emptyResult(
  input:
    Readonly<{
      targetDate:
        string;
      action:
        DailyReportV2SchedulerAction;
      candidateCount:
        number;
    }>,
): DailyReportV2SchedulerResult {
  return Object.freeze({
    targetDate:
      input.targetDate,
    action:
      input.action,
    candidateCount:
      input.candidateCount,
    reportId:
      null,
    connectionId:
      null,
    provider:
      null,
    date:
      null,
    jobId:
      null,
    status:
      null,
  });
}

function validateCoverageScope(
  input:
    Readonly<{
      coverage:
        DailyReportV2ContiguousCoverage;
      candidate:
        DailyReportV2SchedulerCandidate;
      targetDate:
        string;
    }>,
): void {
  const {
    coverage,
    candidate,
    targetDate,
  } =
    input;

  if (
    coverage.reportId !==
      candidate.reportId ||
    coverage.workspaceId !==
      candidate.workspaceId ||
    coverage.advertiserId !==
      candidate.advertiserId ||
    coverage.startDate !==
      candidate.startDate ||
    coverage.throughDate !==
      targetDate ||
    !Array.isArray(
      coverage.participants,
    ) ||
    coverage.participants.length ===
      0
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_COVERAGE",
      "Daily Report V2 contiguous coverage does not match the scheduler candidate scope.",
    );
  }
}

function selectMissingParticipant(
  coverage:
    DailyReportV2ContiguousCoverage,
): Readonly<{
  participant:
    DailyReportV2ParticipantCoverage & {
      provider:
        DailyReportV2FactProvider;
    };
  date:
    string;
}> | null {
  if (
    coverage.targetCovered
  ) {
    if (
      coverage.firstMissingDate !==
        null ||
      coverage.completedThrough !==
        coverage.throughDate
    ) {
      throw new DailyReportV2SchedulerError(
        "INVALID_COVERAGE",
        "A fully covered Daily Report V2 result has inconsistent completion authority.",
      );
    }

    return null;
  }

  const date =
    coverage.firstMissingDate;

  if (
    typeof date !==
      "string" ||
    !isValidYmd(
      date,
    ) ||
    date <
      coverage.startDate ||
    date >
      coverage.throughDate
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_COVERAGE",
      "Daily Report V2 coverage is missing a valid first gap date.",
    );
  }

  const participants =
    coverage.participants
      .filter(
        (
          participant,
        ): participant is
          DailyReportV2ParticipantCoverage & {
            provider:
              DailyReportV2FactProvider;
          } =>
          isDailyReportV2FactProvider(
            participant.provider,
          ) &&
          participant.firstMissingDate ===
            date,
      )
      .sort(
        (
          left,
          right,
        ) =>
          providerOrder(
            left.provider,
          ) -
            providerOrder(
              right.provider,
            ) ||
          left.connectionId
            .localeCompare(
              right.connectionId,
            ),
      );

  const participant =
    participants[0];

  if (
    !participant
  ) {
    throw new DailyReportV2SchedulerError(
      "CONTINUITY_INVALID",
      "No Daily Report V2 participant owns the report's first missing fact date.",
    );
  }

  if (
    participant.connectionStatus !==
      "active"
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_COVERAGE",
      "The selected Daily Report V2 participant connection is not active.",
    );
  }

  return Object.freeze({
    participant,
    date,
  });
}

function validateActiveJobs(
  jobs:
    SafeMediaSyncJob[],
): SafeMediaSyncJob[] {
  if (
    !Array.isArray(
      jobs,
    )
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_ACTIVE_JOB_RESULT",
      "Daily Report V2 active job lookup returned an invalid result.",
    );
  }

  if (
    jobs.length >
      1
  ) {
    throw new DailyReportV2SchedulerError(
      "MULTIPLE_ACTIVE_JOBS",
      "More than one active media sync job exists for the same report.",
    );
  }

  for (
    const job
    of jobs
  ) {
    if (
      job.status !==
        "pending" &&
      job.status !==
        "processing"
    ) {
      throw new DailyReportV2SchedulerError(
        "INVALID_ACTIVE_JOB_RESULT",
        "Daily Report V2 active job lookup returned a non-active job.",
      );
    }
  }

  return jobs;
}

export function buildDailyReportV2DeterministicJobId(
  input:
    Readonly<{
      reportId:
        string;
      connectionId:
        string;
      provider:
        DailyReportV2FactProvider;
      date:
        string;
    }>,
): string {
  const reportId =
    requireIdentity(
      input.reportId,
      "reportId",
    );

  const connectionId =
    requireIdentity(
      input.connectionId,
      "connectionId",
    );

  if (
    !isDailyReportV2FactProvider(
      input.provider,
    )
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_INPUT",
      "Daily Report V2 deterministic job identity requires a fact-capable provider.",
    );
  }

  const date =
    requireYmd(
      input.date,
      "date",
    );

  const seed =
    [
      DAILY_REPORT_V2_AUTOMATION_CONTRACT,
      reportId,
      connectionId,
      input.provider,
      date,
    ].join(
      "\u001f",
    );

  const bytes =
    Buffer.from(
      createHash(
        "sha256",
      )
        .update(
          seed,
          "utf8",
        )
        .digest()
        .subarray(
          0,
          16,
        ),
    );

  bytes[6] =
    (
      bytes[6] &
      0x0f
    ) |
    0x50;

  bytes[8] =
    (
      bytes[8] &
      0x3f
    ) |
    0x80;

  const hex =
    bytes.toString(
      "hex",
    );

  return [
    hex.slice(
      0,
      8,
    ),
    hex.slice(
      8,
      12,
    ),
    hex.slice(
      12,
      16,
    ),
    hex.slice(
      16,
      20,
    ),
    hex.slice(
      20,
      32,
    ),
  ].join("-");
}

function assertJobScope(
  input:
    Readonly<{
      job:
        SafeMediaSyncJob;
      plan:
        SchedulerPlan;
      errorCode:
        | "EXACT_JOB_SCOPE_MISMATCH"
        | "CREATE_RESULT_SCOPE_MISMATCH";
    }>,
): void {
  const {
    job,
    plan,
    errorCode,
  } =
    input;

  const matches =
    job.id ===
      plan.jobId &&
    job.report_id ===
      plan.candidate.reportId &&
    job.connection_id ===
      plan.participant.connectionId &&
    job.workspace_id ===
      plan.candidate.workspaceId &&
    job.advertiser_id ===
      plan.candidate.advertiserId &&
    job.provider ===
      plan.participant.provider &&
    job.external_account_id ===
      plan.participant.externalAccountId &&
    job.date_from ===
      plan.date &&
    job.date_to ===
      plan.date &&
    job.data_level ===
      DAILY_DATA_LEVEL &&
    job.mode ===
      DAILY_MODE &&
    job.created_by ===
      plan.candidate.createdBy &&
    (
      job.automation_contract ??
      null
    ) ===
      DAILY_REPORT_V2_AUTOMATION_CONTRACT;

  if (
    !matches
  ) {
    throw new DailyReportV2SchedulerError(
      errorCode,
      "The deterministic Daily Report V2 job scope does not match the scheduler plan.",
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
    throw new DailyReportV2SchedulerError(
      errorCode,
      "A failed deterministic Daily Report V2 job cannot be retried automatically.",
    );
  }

  if (
    job.status !==
      "pending" &&
    job.status !==
      "processing" &&
    job.status !==
      "done"
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_JOB_STATUS",
      "The deterministic Daily Report V2 job has an unsupported status.",
    );
  }

  return job.status;
}

export async function runDailyReportV2SchedulerOnce(
  input:
    Readonly<{
      now?:
        Date;
      dependencies:
        DailyReportV2SchedulerDependencies;
    }>,
): Promise<
  DailyReportV2SchedulerResult
> {
  if (
    !input ||
    !input.dependencies
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_INPUT",
      "Daily Report V2 scheduler dependencies are required.",
    );
  }

  const targetDate =
    getPreviousCompletedSeoulCalendarDate(
      input.now ??
      new Date(),
    );

  const rawCandidates =
    await input.dependencies
      .listCandidates({
        targetDate,
      });

  if (
    !Array.isArray(
      rawCandidates,
    )
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_INPUT",
      "Daily Report V2 candidate lookup returned an invalid result.",
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
      candidateCount:
        0,
    });
  }

  const candidates =
    rawCandidates
      .map(
        normalizeCandidate,
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.reportId
            .localeCompare(
              right.reportId,
            ),
      );

  const seenReports =
    new Set<string>();

  for (
    const candidate
    of candidates
  ) {
    if (
      seenReports.has(
        candidate.reportId,
      )
    ) {
      throw new DailyReportV2SchedulerError(
        "DUPLICATE_CANDIDATE",
        "Daily Report V2 candidate lookup returned the same report more than once.",
      );
    }

    seenReports.add(
      candidate.reportId,
    );
  }

  const plans:
    SchedulerPlan[] =
      [];

  let activeReportCount =
    0;

  for (
    const candidate
    of candidates
  ) {
    if (
      candidate.startDate >
        targetDate
    ) {
      continue;
    }

    const initialActiveJobs =
      validateActiveJobs(
        await input.dependencies
          .listActiveJobsForReport({
            reportId:
              candidate.reportId,
            workspaceId:
              candidate.workspaceId,
            advertiserId:
              candidate.advertiserId,
          }),
      );

    if (
      initialActiveJobs.length >
        0
    ) {
      activeReportCount +=
        1;

      continue;
    }

    const coverage =
      await input.dependencies
        .loadCoverage({
          reportId:
            candidate.reportId,
          workspaceId:
            candidate.workspaceId,
          advertiserId:
            candidate.advertiserId,
          throughDate:
            targetDate,
        });

    validateCoverageScope({
      coverage,
      candidate,
      targetDate,
    });

    const missing =
      selectMissingParticipant(
        coverage,
      );

    if (
      !missing
    ) {
      continue;
    }

    const jobId =
      buildDailyReportV2DeterministicJobId({
        reportId:
          candidate.reportId,
        connectionId:
          missing.participant
            .connectionId,
        provider:
          missing.participant
            .provider,
        date:
          missing.date,
      });

    plans.push(
      Object.freeze({
        candidate,
        participant:
          missing.participant,
        date:
          missing.date,
        jobId,
      }),
    );
  }

  if (
    plans.length ===
      0
  ) {
    return emptyResult({
      targetDate,
      action:
        activeReportCount >
          0
          ? "noop_active_report_job"
          : "noop_all_covered",
      candidateCount:
        candidates.length,
    });
  }

  plans.sort(
    (
      left,
      right,
    ) =>
      left.date
        .localeCompare(
          right.date,
        ) ||
      left.candidate.reportId
        .localeCompare(
          right.candidate.reportId,
        ) ||
      providerOrder(
        left.participant.provider,
      ) -
        providerOrder(
          right.participant.provider,
        ) ||
      left.participant.connectionId
        .localeCompare(
          right.participant.connectionId,
        ),
  );

  const selected =
    plans[0];

  if (
    !selected
  ) {
    throw new DailyReportV2SchedulerError(
      "INVALID_INPUT",
      "Daily Report V2 scheduler could not resolve a selected plan.",
    );
  }

  const exactJob =
    await input.dependencies
      .loadExactJob(
        selected.jobId,
      );

  if (
    exactJob
  ) {
    assertJobScope({
      job:
        exactJob,
      plan:
        selected,
      errorCode:
        "EXACT_JOB_SCOPE_MISMATCH",
    });

    const status =
      validateJobStatus(
        exactJob,
        "EXACT_JOB_FAILED",
      );

    if (
      status ===
        "pending" ||
      status ===
        "processing"
    ) {
      return Object.freeze({
        targetDate,
        action:
          "noop_existing_active" as const,
        candidateCount:
          candidates.length,
        reportId:
          selected.candidate
            .reportId,
        connectionId:
          selected.participant
            .connectionId,
        provider:
          selected.participant
            .provider,
        date:
          selected.date,
        jobId:
          selected.jobId,
        status,
      });
    }

    throw new DailyReportV2SchedulerError(
      "CONTINUITY_INVALID",
      "The deterministic Daily Report V2 job is done but its canonical fact partition is still missing.",
    );
  }

  const justInTimeActiveJobs =
    validateActiveJobs(
      await input.dependencies
        .listActiveJobsForReport({
          reportId:
            selected.candidate
              .reportId,
          workspaceId:
            selected.candidate
              .workspaceId,
          advertiserId:
            selected.candidate
              .advertiserId,
        }),
    );

  if (
    justInTimeActiveJobs.length >
      0
  ) {
    return Object.freeze({
      targetDate,
      action:
        "noop_active_report_job" as const,
      candidateCount:
        candidates.length,
      reportId:
        selected.candidate
          .reportId,
      connectionId:
        selected.participant
          .connectionId,
      provider:
        selected.participant
          .provider,
      date:
        selected.date,
      jobId:
        selected.jobId,
      status:
        justInTimeActiveJobs[0]
          ?.status ===
          "processing"
          ? "processing"
          : "pending",
    });
  }

  const createdJob =
    await input.dependencies
      .createJob({
        reportId:
          selected.candidate
            .reportId,
        jobId:
          selected.jobId,
        connectionId:
          selected.participant
            .connectionId,
        workspaceId:
          selected.candidate
            .workspaceId,
        advertiserId:
          selected.candidate
            .advertiserId,
        createdBy:
          selected.candidate
            .createdBy,
        dateFrom:
          selected.date,
        dateTo:
          selected.date,
        dataLevel:
          DAILY_DATA_LEVEL,
        mode:
          DAILY_MODE,
      });

  assertJobScope({
    job:
      createdJob,
    plan:
      selected,
    errorCode:
      "CREATE_RESULT_SCOPE_MISMATCH",
  });

  const createdStatus =
    validateJobStatus(
      createdJob,
      "CREATE_RESULT_FAILED",
    );

  if (
    createdStatus ===
      "done"
  ) {
    throw new DailyReportV2SchedulerError(
      "CONTINUITY_INVALID",
      "A replayed done Daily Report V2 job cannot be accepted while its canonical fact date remains missing.",
    );
  }

  return Object.freeze({
    targetDate,
    action:
      "created_or_replayed" as const,
    candidateCount:
      candidates.length,
    reportId:
      selected.candidate
        .reportId,
    connectionId:
      selected.participant
        .connectionId,
    provider:
      selected.participant
        .provider,
    date:
      selected.date,
    jobId:
      selected.jobId,
    status:
      createdStatus,
  });
}
