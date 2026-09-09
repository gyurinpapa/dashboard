import {
  NaverDailySchedulerError,
  runNaverDailySchedulerOnce,
  type NaverDailySchedulerConfig,
} from "../src/lib/media-sync/naver-searchads-daily-scheduler";

const ENABLED_ENV =
  "NAVER_DAILY_SCHEDULER_ENABLED";

const REPORT_ID_ENV =
  "NAVER_DAILY_SCHEDULER_REPORT_ID";

const CONNECTION_ID_ENV =
  "NAVER_DAILY_SCHEDULER_CONNECTION_ID";

const WORKSPACE_ID_ENV =
  "NAVER_DAILY_SCHEDULER_WORKSPACE_ID";

const ADVERTISER_ID_ENV =
  "NAVER_DAILY_SCHEDULER_ADVERTISER_ID";

const CREATED_BY_ENV =
  "NAVER_DAILY_SCHEDULER_CREATED_BY";

const CONTINUITY_START_DATE_ENV =
  "NAVER_DAILY_SCHEDULER_CONTINUITY_START_DATE";

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

function requireEnv(
  name: string,
): string {
  const value =
    String(
      process.env[name] ??
      "",
    ).trim();

  if (!value) {
    throw new Error(
      `Missing env: ${name}`,
    );
  }

  return value;
}

function readConfig(
): NaverDailySchedulerConfig {
  return {
    reportId:
      requireEnv(
        REPORT_ID_ENV,
      ),

    connectionId:
      requireEnv(
        CONNECTION_ID_ENV,
      ),

    workspaceId:
      requireEnv(
        WORKSPACE_ID_ENV,
      ),

    advertiserId:
      requireEnv(
        ADVERTISER_ID_ENV,
      ),

    createdBy:
      requireEnv(
        CREATED_BY_ENV,
      ),

    continuityStartDate:
      requireEnv(
        CONTINUITY_START_DATE_ENV,
      ),
  };
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
          "naver_daily_v1",
        enabled:
          false,
        action:
          "disabled_noop",
      }),
    );

    return;
  }

  const result =
    await runNaverDailySchedulerOnce({
      config:
        readConfig(),
    });

  console.log(
    JSON.stringify({
      scheduler:
        "naver_daily_v1",
      enabled:
        true,
      timezone:
        "Asia/Seoul",
      targetDate:
        result.targetDate,
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
      NaverDailySchedulerError
    ) {
      console.error(
        JSON.stringify({
          scheduler:
            "naver_daily_v1",
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
            "naver_daily_v1",
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
            "naver_daily_v1",
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
