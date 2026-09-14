import {
  getSupabaseAdmin,
} from "../supabase/admin";
import {
  createDailyReportV2SchedulerDatabaseDependencies,
} from "./daily-report-v2-scheduler-repository";
import {
  runDailyReportV2SchedulerOnce,
  type DailyReportV2SchedulerResult,
} from "./daily-report-v2-scheduler";
import {
  isValidYmd,
} from "./types";

const REPORTS_TABLE =
  "reports" as const;

const DAILY_REPORT_V2_AUTOMATION_CONTRACT =
  "daily_report_v2" as const;

const DAILY_REPORT_V2_SCOPE =
  "all_mapped_supported_media" as const;

const MAX_SNAPSHOT_CONTINUATION_STEPS =
  64;

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value:
    unknown,
): value is UnknownRecord {
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

async function loadContinuationTarget(
  input:
    Readonly<{
      reportId:
        string;
      fallbackDate:
        string;
    }>,
): Promise<
  string | null
> {
  if (
    !isValidYmd(
      input.fallbackDate,
    )
  ) {
    throw new Error(
      "Daily Report V2 continuation fallback date is invalid.",
    );
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        REPORTS_TABLE,
      )
      .select(
        "id,meta",
      )
      .eq(
        "id",
        input.reportId,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      "Daily Report V2 continuation report could not be loaded.",
      {
        cause:
          error,
      },
    );
  }

  if (
    !data ||
    !isPlainObject(
      data.meta,
    )
  ) {
    return null;
  }

  const mediaSync =
    isPlainObject(
      data.meta
        .media_sync,
    )
      ? data.meta
          .media_sync
      : null;

  const autoSync =
    mediaSync &&
    isPlainObject(
      mediaSync.auto_sync,
    )
      ? mediaSync.auto_sync
      : null;

  if (
    !autoSync ||
    autoSync.enabled !==
      true ||
    autoSync.contract !==
      DAILY_REPORT_V2_AUTOMATION_CONTRACT ||
    autoSync.scope !==
      DAILY_REPORT_V2_SCOPE
  ) {
    return null;
  }

  const configuredStart =
    typeof autoSync.start_date ===
      "string"
      ? autoSync.start_date
          .trim()
      : "";

  if (
    !isValidYmd(
      configuredStart,
    )
  ) {
    return null;
  }

  const immediateThrough =
    typeof autoSync.immediate_through_date ===
      "string"
      ? autoSync.immediate_through_date
          .trim()
      : "";

  const safeImmediateThrough =
    isValidYmd(
      immediateThrough,
    ) &&
    immediateThrough >=
      configuredStart
      ? immediateThrough
      : null;

  return (
    safeImmediateThrough !==
      null &&
    safeImmediateThrough >
      input.fallbackDate
      ? safeImmediateThrough
      : input.fallbackDate
  );
}

export async function continueDailyReportV2AfterMediaJob(
  input:
    Readonly<{
      reportId:
        string;
      jobId:
        string;
    }>,
): Promise<
  DailyReportV2SchedulerResult | null
> {
  const dependencies =
    createDailyReportV2SchedulerDatabaseDependencies();

  const completedJob =
    await dependencies
      .loadExactJob(
        input.jobId,
      );

  if (
    !completedJob ||
    completedJob.report_id !==
      input.reportId ||
    completedJob.status !==
      "done" ||
    (
      completedJob
        .automation_contract ??
      null
    ) !==
      DAILY_REPORT_V2_AUTOMATION_CONTRACT
  ) {
    return null;
  }

  const targetDate =
    await loadContinuationTarget({
      reportId:
        completedJob.report_id,
      fallbackDate:
        completedJob.date_to,
    });

  if (
    targetDate ===
      null
  ) {
    return null;
  }

  let result =
    await runDailyReportV2SchedulerOnce({
      targetDate,
      reportId:
        completedJob.report_id,
      dependencies,
    });

  let snapshotSteps =
    0;

  while (
    result.action ===
      "snapshot_materialized" &&
    snapshotSteps <
      MAX_SNAPSHOT_CONTINUATION_STEPS
  ) {
    snapshotSteps +=
      1;

    result =
      await runDailyReportV2SchedulerOnce({
        targetDate,
        reportId:
          completedJob.report_id,
        dependencies,
      });
  }

  return result;
}
