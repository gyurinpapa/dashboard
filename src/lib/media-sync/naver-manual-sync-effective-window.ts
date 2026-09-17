import type {
  MediaProvider,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

type UnknownRecord =
  Record<string, unknown>;

export type NaverManualSyncExecutionWindow =
  Readonly<{
    dateFrom: string;
    dateTo: string;
    clampedToCompletedDate: boolean;
  }>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeYmd(
  value: string,
  fieldName: string,
): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      `${fieldName} must use YYYY-MM-DD format.`,
    );
  }

  const timestamp =
    Date.parse(
      `${value}T00:00:00.000Z`,
    );

  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp)
      .toISOString()
      .slice(0, 10) !==
      value
  ) {
    throw new Error(
      `${fieldName} must be a valid calendar date.`,
    );
  }

  return value;
}

function getSeoulYmd(
  now: Date,
): string {
  if (
    !(now instanceof Date) ||
    !Number.isFinite(
      now.getTime(),
    )
  ) {
    throw new Error(
      "now must be a valid Date.",
    );
  }

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Seoul",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
      },
    ).formatToParts(
      now,
    );

  const year =
    parts.find(
      part =>
        part.type ===
        "year",
    )?.value;

  const month =
    parts.find(
      part =>
        part.type ===
        "month",
    )?.value;

  const day =
    parts.find(
      part =>
        part.type ===
        "day",
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new Error(
      "The current Seoul date could not be resolved.",
    );
  }

  return `${year}-${month}-${day}`;
}

function addUtcDays(
  date: string,
  days: number,
): string {
  const normalized =
    normalizeYmd(
      date,
      "date",
    );

  if (
    !Number.isSafeInteger(
      days,
    )
  ) {
    throw new Error(
      "days must be a safe integer.",
    );
  }

  return new Date(
    Date.parse(
      `${normalized}T00:00:00.000Z`,
    ) +
      days *
        86_400_000,
  )
    .toISOString()
    .slice(0, 10);
}

function isCanonicalV2NaverApiReport(
  input: Readonly<{
    provider:
      MediaProvider |
      null;
    reportMeta:
      unknown;
  }>,
): boolean {
  if (
    input.provider !==
      NAVER_SEARCH_ADS_PROVIDER ||
    !isPlainObject(
      input.reportMeta,
    ) ||
    input.reportMeta
      .url_contract_version !==
      2
  ) {
    return false;
  }

  const identity =
    input.reportMeta
      .public_identity;

  return (
    isPlainObject(
      identity,
    ) &&
    identity.source_type ===
      "api"
  );
}

/**
 * Canonical Naver manual syncs collect only completed Seoul dates.
 *
 * The report period remains unchanged (for example 2026-09-01..2026-09-30),
 * but an execution started on 2026-09-18 is bounded to 2026-09-17.
 *
 * This keeps current/future dates out of the Naver StatReport execution
 * window so the historical bulk fast path remains eligible.
 */
export function resolveNaverManualSyncExecutionWindow(
  input: Readonly<{
    provider:
      MediaProvider |
      null;
    reportMeta:
      unknown;
    dateFrom:
      string;
    dateTo:
      string;
    now?:
      Date;
  }>,
): NaverManualSyncExecutionWindow |
  null {
  const dateFrom =
    normalizeYmd(
      input.dateFrom,
      "dateFrom",
    );

  const dateTo =
    normalizeYmd(
      input.dateTo,
      "dateTo",
    );

  if (
    dateTo <
    dateFrom
  ) {
    throw new Error(
      "dateTo must not be before dateFrom.",
    );
  }

  if (
    !isCanonicalV2NaverApiReport({
      provider:
        input.provider,
      reportMeta:
        input.reportMeta,
    })
  ) {
    return Object.freeze({
      dateFrom,
      dateTo,
      clampedToCompletedDate:
        false,
    });
  }

  const currentSeoulDate =
    getSeoulYmd(
      input.now ??
        new Date(),
    );

  const lastCompletedDate =
    addUtcDays(
      currentSeoulDate,
      -1,
    );

  if (
    dateFrom >
    lastCompletedDate
  ) {
    return null;
  }

  const effectiveDateTo =
    dateTo >
    lastCompletedDate
      ? lastCompletedDate
      : dateTo;

  return Object.freeze({
    dateFrom,
    dateTo:
      effectiveDateTo,
    clampedToCompletedDate:
      effectiveDateTo !==
      dateTo,
  });
}
