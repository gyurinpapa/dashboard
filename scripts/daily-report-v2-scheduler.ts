const ENABLED_ENV =
  "DAILY_REPORT_V2_SCHEDULER_ENABLED";

const CONTRACT =
  "daily_report_v2" as const;

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
  ] =
    await Promise.all([
      import(
        "../src/lib/media-sync/daily-report-v2-scheduler"
      ),
      import(
        "../src/lib/media-sync/daily-report-v2-scheduler-repository"
      ),
    ]);

  const dependencies =
    repository
      .createDailyReportV2SchedulerDatabaseDependencies();

  const result =
    await scheduler
      .runDailyReportV2SchedulerOnce({
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
      provider:
        result.provider,
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
