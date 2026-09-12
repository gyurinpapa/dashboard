import {
  getPreviousCompletedSeoulCalendarDate,
} from "./naver-searchads-daily-scheduler";
import type {
  SafeMediaConnection,
} from "./types";

export const NAVER_DAILY_AUTO_SYNC_CONTRACT =
  "naver_daily_v1" as const;

export const NAVER_DAILY_REPORT_AUTO_SYNC_CONTRACT =
  "naver_daily_report_v1" as const;

export type MediaSyncAutomaticAuthority = {
  enabled: boolean;
  provider: "naver_searchad" | null;
  contract:
    | typeof NAVER_DAILY_AUTO_SYNC_CONTRACT
    | typeof NAVER_DAILY_REPORT_AUTO_SYNC_CONTRACT
    | null;
};

export type MediaSyncAutomaticReportPeriod = {
  draft_period_start?: string | null;
  draft_period_end?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  meta?: unknown;
};

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function normalizeYmd(
  value: unknown,
): string | null {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalized,
    )
  ) {
    return null;
  }

  const date =
    new Date(
      `${normalized}T00:00:00.000Z`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    ) ||
    date.toISOString().slice(0, 10) !==
      normalized
  ) {
    return null;
  }

  return normalized;
}

function resolveAutomaticReportPeriod(
  report:
    MediaSyncAutomaticReportPeriod,
): {
  start: string;
  end: string;
} | null {
  const meta =
    isPlainObject(report.meta)
      ? report.meta
      : {};

  const mediaSync =
    isPlainObject(meta.media_sync)
      ? meta.media_sync
      : {};

  const start =
    normalizeYmd(
      report.draft_period_start,
    ) ??
    normalizeYmd(
      report.period_start,
    ) ??
    normalizeYmd(
      mediaSync.date_from,
    );

  const end =
    normalizeYmd(
      report.draft_period_end,
    ) ??
    normalizeYmd(
      report.period_end,
    ) ??
    normalizeYmd(
      mediaSync.date_to,
    );

  if (
    !start ||
    !end ||
    start > end
  ) {
    return null;
  }

  return {
    start,
    end,
  };
}

export function isAutomaticMediaSyncConnection(
  connection:
    Pick<
      SafeMediaConnection,
      "provider" | "meta"
    >,
): boolean {
  if (
    connection.provider !==
    "naver_searchad"
  ) {
    return false;
  }

  const meta =
    isPlainObject(connection.meta)
      ? connection.meta
      : {};

  const autoSync =
    isPlainObject(meta.autoSync)
      ? meta.autoSync
      : null;

  return (
    autoSync?.enabled === true &&
    autoSync?.contract ===
      NAVER_DAILY_AUTO_SYNC_CONTRACT
  );
}

type ReportScopedAutomaticState = {
  declared: boolean;
  enabled: boolean;
};

function getReportScopedAutomaticState(
  report:
    MediaSyncAutomaticReportPeriod,
): ReportScopedAutomaticState {
  const meta =
    isPlainObject(report.meta)
      ? report.meta
      : {};

  const mediaSync =
    isPlainObject(meta.media_sync)
      ? meta.media_sync
      : {};

  const declared =
    Object.prototype.hasOwnProperty.call(
      mediaSync,
      "auto_sync",
    );

  if (!declared) {
    return {
      declared: false,
      enabled: false,
    };
  }

  const autoSync =
    isPlainObject(
      mediaSync.auto_sync,
    )
      ? mediaSync.auto_sync
      : null;

  return {
    declared: true,
    enabled:
      autoSync?.enabled === true &&
      autoSync?.contract ===
        NAVER_DAILY_REPORT_AUTO_SYNC_CONTRACT,
  };
}

export function isAutomaticReportScopedMediaSync(
  report:
    MediaSyncAutomaticReportPeriod,
): boolean {
  return getReportScopedAutomaticState(
    report,
  ).enabled;
}

function isVerifiedReportScopedNaverConnection(
  connection:
    SafeMediaConnection,
): boolean {
  return (
    connection.provider ===
      "naver_searchad" &&
    connection.status ===
      "active" &&
    connection.has_credentials ===
      true &&
    Boolean(
      connection.last_verified_at ||
      connection.last_sync_at,
    )
  );
}

export function isAutomaticReportPeriodActive(
  report:
    MediaSyncAutomaticReportPeriod,
  targetDate =
    getPreviousCompletedSeoulCalendarDate(),
): boolean {
  const period =
    resolveAutomaticReportPeriod(
      report,
    );

  if (!period) {
    return false;
  }

  return (
    period.start <= targetDate &&
    targetDate <= period.end
  );
}

export function getMediaSyncAutomaticAuthority(
  input: {
    connections:
      readonly SafeMediaConnection[];
    report:
      MediaSyncAutomaticReportPeriod;
    targetDate?: string;
  },
): MediaSyncAutomaticAuthority {
  const periodActive =
    isAutomaticReportPeriodActive(
      input.report,
      input.targetDate,
    );

  const reportScoped =
    getReportScopedAutomaticState(
      input.report,
    );

  if (reportScoped.declared) {
    const reportConnection =
      input.connections.length === 1
        ? input.connections[0]
        : null;

    if (
      !reportScoped.enabled ||
      !periodActive ||
      !reportConnection ||
      !isVerifiedReportScopedNaverConnection(
        reportConnection,
      )
    ) {
      return {
        enabled: false,
        provider: null,
        contract: null,
      };
    }

    return {
      enabled: true,
      provider: "naver_searchad",
      contract:
        NAVER_DAILY_REPORT_AUTO_SYNC_CONTRACT,
    };
  }

  const automaticConnection =
    input.connections.find(
      isAutomaticMediaSyncConnection,
    );

  if (
    !automaticConnection ||
    !periodActive
  ) {
    return {
      enabled: false,
      provider: null,
      contract: null,
    };
  }

  return {
    enabled: true,
    provider: "naver_searchad",
    contract:
      NAVER_DAILY_AUTO_SYNC_CONTRACT,
  };
}
