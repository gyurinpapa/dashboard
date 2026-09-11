export const CANONICAL_MEDIA_SYNC_RANGE_AUTHORITY =
  "canonical_period_v1" as const;

export type CanonicalPeriodRangeType =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "cumulative";

export type CanonicalPeriodDateRange = {
  dateFrom: string;
  dateTo: string;
};

const DAY_MS = 86_400_000;

function makeUtcDate(
  year: number,
  monthIndex: number,
  day: number,
) {
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(
    year,
    monthIndex,
    day,
  );

  return date;
}

function toYmd(
  date: Date,
) {
  return date
    .toISOString()
    .slice(0, 10);
}

function addUtcDays(
  date: Date,
  days: number,
) {
  return new Date(
    date.getTime() +
      days * DAY_MS,
  );
}

function getIsoWeekOneMonday(
  year: number,
) {
  const januaryFourth =
    makeUtcDate(
      year,
      0,
      4,
    );

  const isoDay =
    januaryFourth.getUTCDay() ||
    7;

  return addUtcDays(
    januaryFourth,
    -(isoDay - 1),
  );
}

function deriveIsoWeekRange(
  periodKey: string,
): CanonicalPeriodDateRange | null {
  const match =
    /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/.exec(
      periodKey,
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const week =
    Number(match[2]);

  const weekOneMonday =
    getIsoWeekOneMonday(
      year,
    );

  const nextYearWeekOneMonday =
    getIsoWeekOneMonday(
      year + 1,
    );

  const monday =
    addUtcDays(
      weekOneMonday,
      (week - 1) * 7,
    );

  if (
    monday.getTime() >=
    nextYearWeekOneMonday.getTime()
  ) {
    return null;
  }

  return {
    dateFrom:
      toYmd(
        monday,
      ),

    dateTo:
      toYmd(
        addUtcDays(
          monday,
          6,
        ),
      ),
  };
}

function deriveDailyRange(
  periodKey: string,
): CanonicalPeriodDateRange | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      periodKey,
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date =
    makeUtcDate(
      year,
      month - 1,
      day,
    );

  if (
    toYmd(date) !==
    periodKey
  ) {
    return null;
  }

  return {
    dateFrom:
      periodKey,

    dateTo:
      periodKey,
  };
}

function deriveMonthlyRange(
  periodKey: string,
): CanonicalPeriodDateRange | null {
  const match =
    /^(\d{4})-(0[1-9]|1[0-2])$/.exec(
      periodKey,
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  return {
    dateFrom:
      `${match[1]}-${match[2]}-01`,

    dateTo:
      toYmd(
        makeUtcDate(
          year,
          month,
          0,
        ),
      ),
  };
}

function deriveQuarterlyRange(
  periodKey: string,
): CanonicalPeriodDateRange | null {
  const match =
    /^(\d{4})-Q([1-4])$/.exec(
      periodKey,
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const quarter =
    Number(match[2]);

  const startMonthIndex =
    (quarter - 1) * 3;

  return {
    dateFrom:
      toYmd(
        makeUtcDate(
          year,
          startMonthIndex,
          1,
        ),
      ),

    dateTo:
      toYmd(
        makeUtcDate(
          year,
          startMonthIndex + 3,
          0,
        ),
      ),
  };
}

function deriveYearlyRange(
  periodKey: string,
): CanonicalPeriodDateRange | null {
  const match =
    /^(\d{4})$/.exec(
      periodKey,
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  return {
    dateFrom:
      toYmd(
        makeUtcDate(
          year,
          0,
          1,
        ),
      ),

    dateTo:
      toYmd(
        makeUtcDate(
          year,
          12,
          0,
        ),
      ),
  };
}

export function deriveCanonicalPeriodDateRange(
  periodType: CanonicalPeriodRangeType,
  periodKey: string,
): CanonicalPeriodDateRange | null {
  switch (periodType) {
    case "daily":
      return deriveDailyRange(
        periodKey,
      );

    case "weekly":
      return deriveIsoWeekRange(
        periodKey,
      );

    case "monthly":
      return deriveMonthlyRange(
        periodKey,
      );

    case "quarterly":
      return deriveQuarterlyRange(
        periodKey,
      );

    case "yearly":
      return deriveYearlyRange(
        periodKey,
      );

    case "cumulative":
      return null;

    default:
      return null;
  }
}
