export const MEDIA_SYNC_SEGMENT_MAX_DAYS =
  7 as const;

export const MEDIA_SYNC_SEGMENT_ELIGIBLE_PERIOD_TYPES =
  [
    "monthly",
    "quarterly",
    "yearly",
    "cumulative",
  ] as const;

export type MediaSyncSegmentEligiblePeriodType =
  (typeof MEDIA_SYNC_SEGMENT_ELIGIBLE_PERIOD_TYPES)[number];

export type MediaSyncSegment =
  Readonly<{
    index: number;
    dateFrom: string;
    dateTo: string;
    dayCount: number;
  }>;

export type MediaSyncSegmentContractErrorCode =
  | "INVALID_DATE"
  | "INVALID_RANGE"
  | "INVALID_SEGMENT_INDEX";

export class MediaSyncSegmentContractError
  extends Error {
  readonly code:
    MediaSyncSegmentContractErrorCode;

  constructor(
    code:
      MediaSyncSegmentContractErrorCode,
    message: string,
  ) {
    super(message);

    this.name =
      "MediaSyncSegmentContractError";

    this.code =
      code;
  }
}

const DAY_MS =
  86_400_000;

const MAX_SEGMENT_SPAN_MS =
  (
    MEDIA_SYNC_SEGMENT_MAX_DAYS -
    1
  ) *
  DAY_MS;

const YMD_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmdToUtcMs(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "string"
  ) {
    throw new MediaSyncSegmentContractError(
      "INVALID_DATE",
      `${fieldName} must be a YYYY-MM-DD string.`,
    );
  }

  const normalizedValue =
    value.trim();

  const match =
    YMD_PATTERN.exec(
      normalizedValue,
    );

  if (!match) {
    throw new MediaSyncSegmentContractError(
      "INVALID_DATE",
      `${fieldName} must be a valid YYYY-MM-DD date.`,
    );
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(0);

  date.setUTCHours(
    0,
    0,
    0,
    0,
  );

  date.setUTCFullYear(
    year,
    month - 1,
    day,
  );

  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    throw new MediaSyncSegmentContractError(
      "INVALID_DATE",
      `${fieldName} must be a valid calendar date.`,
    );
  }

  return date.getTime();
}

function formatUtcMsToYmd(
  value: number,
): string {
  const date =
    new Date(value);

  const year =
    String(
      date.getUTCFullYear(),
    ).padStart(
      4,
      "0",
    );

  const month =
    String(
      date.getUTCMonth() +
        1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      date.getUTCDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function getInclusiveDayCount(
  dateFromMs: number,
  dateToMs: number,
): number {
  return (
    Math.floor(
      (
        dateToMs -
        dateFromMs
      ) /
        DAY_MS,
    ) +
    1
  );
}

export function isMediaSyncSegmentEligiblePeriodType(
  value: unknown,
): value is MediaSyncSegmentEligiblePeriodType {
  return (
    typeof value ===
      "string" &&
    (
      MEDIA_SYNC_SEGMENT_ELIGIBLE_PERIOD_TYPES as
        readonly string[]
    ).includes(
      value,
    )
  );
}

export function getMediaSyncSegmentDisplayNumber(
  index: unknown,
): number {
  if (
    typeof index !==
      "number" ||
    !Number.isSafeInteger(
      index,
    ) ||
    index < 0
  ) {
    throw new MediaSyncSegmentContractError(
      "INVALID_SEGMENT_INDEX",
      "segment index must be a non-negative safe integer.",
    );
  }

  return index + 1;
}

export function buildMediaSyncSegments(
  input: Readonly<{
    dateFrom: string;
    dateTo: string;
  }>,
): readonly MediaSyncSegment[] {
  const dateFromMs =
    parseYmdToUtcMs(
      input.dateFrom,
      "dateFrom",
    );

  const dateToMs =
    parseYmdToUtcMs(
      input.dateTo,
      "dateTo",
    );

  if (
    dateToMs <
    dateFromMs
  ) {
    throw new MediaSyncSegmentContractError(
      "INVALID_RANGE",
      "dateTo must be on or after dateFrom.",
    );
  }

  const segments:
    MediaSyncSegment[] =
      [];

  let currentDateFromMs =
    dateFromMs;

  let index =
    0;

  while (
    currentDateFromMs <=
    dateToMs
  ) {
    const currentDateToMs =
      Math.min(
        currentDateFromMs +
          MAX_SEGMENT_SPAN_MS,
        dateToMs,
      );

    segments.push(
      Object.freeze({
        index,
        dateFrom:
          formatUtcMsToYmd(
            currentDateFromMs,
          ),
        dateTo:
          formatUtcMsToYmd(
            currentDateToMs,
          ),
        dayCount:
          getInclusiveDayCount(
            currentDateFromMs,
            currentDateToMs,
          ),
      }),
    );

    currentDateFromMs =
      currentDateToMs +
      DAY_MS;

    index +=
      1;
  }

  return Object.freeze(
    segments,
  );
}
