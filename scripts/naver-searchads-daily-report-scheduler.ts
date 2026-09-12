import {
  NaverDailyReportSchedulerError,
  runNaverDailyReportSchedulerOnce,
} from "../src/lib/media-sync/naver-searchads-daily-report-scheduler";
import {
  NaverDailyReportSchedulerRepositoryError,
  createNaverDailyReportSchedulerDatabaseDependencies,
} from "../src/lib/media-sync/naver-searchads-daily-report-scheduler-repository";

const ENABLED_ENV =
  "NAVER_DAILY_REPORT_SCHEDULER_ENABLED";

const CONTRACT =
  "naver_daily_report_v1" as const;

function isEnabled(
  value: unknown,
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

  const dependencies =
    createNaverDailyReportSchedulerDatabaseDependencies();

  const result =
    await runNaverDailyReportSchedulerOnce({
      dependencies,
    });

  console.log(
    JSON.stringify({
      scheduler:
        CONTRACT,
      enabled:
        true,
      timezone:
        "Asia/Seoul",
      targetDate:
        result.targetDate,
      candidateCount:
        result.candidateCount,
      reportId:
        result.reportId,
      connectionId:
        result.connectionId,
      date:
        result.date,
      jobId:
        result.jobId,
      action:
        result.action,
      status:
        result.status,
    }),
  );
}

void main().catch(
  (
    error: unknown,
  ) => {
    if (
      error instanceof
        NaverDailyReportSchedulerError ||
      error instanceof
        NaverDailyReportSchedulerRepositoryError
    ) {
      console.error(
        JSON.stringify({
          scheduler:
            CONTRACT,
          ok:
            false,
          name:
            error.name,
          code:
            error.code,
          message:
            error.message,
        }),
      );
    } else if (
      error instanceof
        Error
    ) {
      console.error(
        JSON.stringify({
          scheduler:
            CONTRACT,
          ok:
            false,
          name:
            error.name,
          code:
            null,
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
