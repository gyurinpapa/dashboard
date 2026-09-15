const ENABLED_ENV =
  "DAILY_REPORT_V2_SCHEDULER_ENABLED";

const CONTRACT =
  "daily_report_v2" as const;

// Match the existing immediate-continuation bound: one initial call + 64 resumes.
const MAX_SNAPSHOT_CONTINUATION_STEPS = 64;

function isEnabled(
  value:
    unknown,
): boolean {
  return (
    String(
      value ??
      "",
    )
      .trim()
      .toLowerCase() ===
    "1"
  );
}

async function main(
): Promise<void> {
  if (
    !isEnabled(
      process.env[
        ENABLED_ENV
      ],
    )
  ) {
    console.log(
      JSON.stringify({
        scheduler:
          CONTRACT,
        enabled:
          false,
        action:
          "disabled_noop",
      }),
    );

    return;
  }

  const [
    scheduler,
    repository,
    calendar,
  ] =
    await Promise.all([
      import(
        "../src/lib/media-sync/daily-report-v2-scheduler"
      ),
      import(
        "../src/lib/media-sync/daily-report-v2-scheduler-repository"
      ),
      import(
        "../src/lib/media-sync/naver-searchads-daily-scheduler"
      ),
    ]);

  const dependencies =
    repository
      .createDailyReportV2SchedulerDatabaseDependencies();

  // Freeze the Seoul target once for the whole cron run; never hard-code a date.
  const targetDate = calendar.getPreviousCompletedSeoulCalendarDate(new Date());
  const candidates = await dependencies.listCandidates({ targetDate });

  if (!Array.isArray(candidates)) {
    throw new scheduler.DailyReportV2SchedulerError(
      "INVALID_INPUT",
      "Daily Report V2 candidate lookup returned an invalid result.",
    );
  }

  // Validate all discovery IDs before the first potentially mutating call.
  const reportIds = candidates.map((candidate) => {
    const reportId = typeof candidate?.reportId === "string"
      ? candidate.reportId.trim()
      : "";
    if (!reportId || reportId.length > 200) {
      throw new scheduler.DailyReportV2SchedulerError(
        "INVALID_CANDIDATE",
        "Daily Report V2 runner candidate reportId is invalid.",
      );
    }
    return reportId;
  }).sort((left, right) => left.localeCompare(right));

  if (new Set(reportIds).size !== reportIds.length) {
    throw new scheduler.DailyReportV2SchedulerError(
      "DUPLICATE_CANDIDATE",
      "Daily Report V2 candidate lookup returned the same report more than once.",
    );
  }

  if (reportIds.length === 0) {
    console.log(JSON.stringify({
      scheduler: CONTRACT,
      enabled: true,
      timezone: "Asia/Seoul",
      targetDate,
      candidateCount: 0,
      totalCandidateCount: 0,
      reportId: null,
      connectionId: null,
      provider: null,
      date: null,
      jobId: null,
      action: "noop_no_candidate",
      status: null,
    }));
    return;
  }

  const runForReport = async (reportId: string, snapshotStep: number) => {
    // Keep the real repository lookup: re-check eligibility on every scoped call.
    // Core active-job, deterministic-ID, coverage and provider guards are unchanged.
    const result = await scheduler.runDailyReportV2SchedulerOnce({
      targetDate,
      reportId,
      dependencies,
    });
    console.log(JSON.stringify({
      scheduler: CONTRACT,
      enabled: true,
      timezone: "Asia/Seoul",
      targetDate: result.targetDate,
      candidateCount: result.candidateCount,
      totalCandidateCount: reportIds.length,
      scopedReportId: reportId,
      snapshotStep,
      reportId: result.reportId,
      connectionId: result.connectionId,
      provider: result.provider,
      date: result.date,
      jobId: result.jobId,
      action: result.action,
      status: result.status,
    }));
    return result;
  };

  const snapshotReports: string[] = [];
  // Give every discovered report its first turn before draining any snapshot.
  // Never loop after job creation/replay: provider continuation remains worker-owned.
  for (const reportId of reportIds) {
    const result = await runForReport(reportId, 0);
    if (result.action === "snapshot_materialized") {
      snapshotReports.push(reportId);
    }
  }

  for (const reportId of snapshotReports) {
    for (let step = 1; step <= MAX_SNAPSHOT_CONTINUATION_STEPS; step += 1) {
      const result = await runForReport(reportId, step);
      if (result.action !== "snapshot_materialized") break;
      if (step === MAX_SNAPSHOT_CONTINUATION_STEPS) {
        console.error(JSON.stringify({
          scheduler: CONTRACT,
          ok: false,
          code: "SNAPSHOT_CONTINUATION_LIMIT",
          action: "snapshot_continuation_limit",
          targetDate,
          reportId,
          snapshotSteps: step,
        }));
        process.exitCode = 1;
      }
    }
  }
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    if (
      error instanceof
        Error
    ) {
      const code =
        (
          error as
            Error & {
              code?:
                unknown;
            }
        ).code;

      console.error(
        JSON.stringify({
          scheduler:
            CONTRACT,
          ok:
            false,
          name:
            error.name,
          code:
            typeof code ===
              "string"
              ? code
              : null,
          message:
            error.message,
        }),
      );
    } else {
      console.error(
        JSON.stringify({
          scheduler:
            CONTRACT,
          ok:
            false,
          name:
            "UnknownError",
          code:
            null,
          message:
            "Unknown scheduler error.",
        }),
      );
    }

    process.exitCode =
      1;
  },
);
