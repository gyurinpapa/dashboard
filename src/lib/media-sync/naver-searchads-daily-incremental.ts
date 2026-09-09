import {
  createHash,
} from "node:crypto";

import {
  createPendingMediaSyncJob,
} from "./media-sync-jobs-repository";
import {
  isValidMediaSyncDateRange,
  type MediaSyncDataLevel,
  type SafeMediaSyncJob,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

export const NAVER_DAILY_INCREMENTAL_CONTRACT =
  "naver_daily_v1" as const;

const REQUIRED_ID_MAX_LENGTH = 200;

type RequiredIdentityInput = {
  reportId: string;
  connectionId: string;
};

export type BuildNaverDailyIncrementalJobIdInput =
  RequiredIdentityInput & {
    date: string;
  };

export type CreateNaverDailyIncrementalJobInput =
  RequiredIdentityInput & {
    workspaceId: string;
    advertiserId: string;
    createdBy: string;
    date: string;
    dataLevel: MediaSyncDataLevel;
  };

function requireIdentity(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length >
      REQUIRED_ID_MAX_LENGTH
  ) {
    throw new Error(
      `${fieldName} is invalid.`,
    );
  }

  return value.trim();
}

function requireDate(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !isValidMediaSyncDateRange(
      value,
      value,
    )
  ) {
    throw new Error(
      "date must be a valid YYYY-MM-DD value.",
    );
  }

  return value;
}

function toDeterministicUuid(
  hexInput: string,
): string {
  const chars =
    hexInput
      .slice(0, 32)
      .toLowerCase()
      .split("");

  if (
    chars.length !== 32 ||
    chars.some(
      (char) =>
        !/^[0-9a-f]$/.test(char),
    )
  ) {
    throw new Error(
      "Deterministic UUID hash is invalid.",
    );
  }

  chars[12] = "5";

  const variantByte =
    Number.parseInt(
      `${chars[16] ?? "0"}${chars[17] ?? "0"}`,
      16,
    );

  const normalizedVariantByte =
    (
      variantByte &
      0x3f
    ) |
    0x80;

  const normalizedVariantHex =
    normalizedVariantByte
      .toString(16)
      .padStart(2, "0");

  chars[16] =
    normalizedVariantHex[0] ?? "8";
  chars[17] =
    normalizedVariantHex[1] ?? "0";

  const hex = chars.join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function buildNaverDailyIncrementalJobId(
  input:
    BuildNaverDailyIncrementalJobIdInput,
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

  const date =
    requireDate(
      input.date,
    );

  const seed = [
    "etrylue",
    NAVER_DAILY_INCREMENTAL_CONTRACT,
    reportId,
    connectionId,
    NAVER_SEARCH_ADS_PROVIDER,
    date,
  ].join(":");

  const hex =
    createHash("sha256")
      .update(
        seed,
        "utf8",
      )
      .digest("hex");

  return toDeterministicUuid(
    hex,
  );
}

/**
 * Internal-only daily creator.
 *
 * This intentionally bypasses the public POST route because that route is
 * authoritative for the report's stored UI period. A daily automation run
 * must not rewrite or reinterpret that stored report period.
 *
 * Repeated calls for the same report/connection/date resolve to the same
 * deterministic job id. The repository treats an exact persisted id/scope
 * match as idempotent and returns the existing job; conflicting ids fail
 * closed. Manual/remediation callers remain random-id based.
 */
export async function createNaverDailyIncrementalJob(
  input:
    CreateNaverDailyIncrementalJobInput,
): Promise<SafeMediaSyncJob> {
  const date =
    requireDate(
      input.date,
    );

  return createPendingMediaSyncJob({
    jobId:
      buildNaverDailyIncrementalJobId({
        reportId:
          input.reportId,
        connectionId:
          input.connectionId,
        date,
      }),

    reportId:
      input.reportId,

    connectionId:
      input.connectionId,

    workspaceId:
      input.workspaceId,

    advertiserId:
      input.advertiserId,

    createdBy:
      input.createdBy,

    dateFrom:
      date,

    dateTo:
      date,

    dataLevel:
      input.dataLevel,

    mode:
      "snapshot_replace",
  });
}
