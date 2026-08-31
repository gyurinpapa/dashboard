import {
  GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON,
} from "./google-ads-canonical-row";
import {
  buildGoogleAdsAuthorityProviderMeta,
} from "./google-ads-authoritative-grain";
import {
  GOOGLE_ADS_SEARCH_AD_ROW_LEVEL_REASON,
} from "./google-ads-search-ad-canonical-row";
import {
  GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL_REASON,
} from "./google-ads-demand-gen-ad-canonical-row";
import {
  isValidYmd,
  type EtrylueNormalizedMediaRow,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const API_INGESTION_SOURCE =
  "api" as const;

// Preserve the existing Search-named exports and Search byte-level row keys.
// The only additional executable contract is Demand Gen/ad; no other product
// or grain is inferred from metadata or silently retagged as Search.

const SEARCH_PRODUCT_FAMILY =
  "search" as const;

const SEARCH_AUTHORITATIVE_GRAIN =
  "ad" as const;

export type GoogleAdsAllDataSearchEntityType =
  | "keyword"
  | "ad";

export type GoogleAdsAllDataStagingContractErrorCode =
  | "INVALID_INPUT"
  | "SCOPE_MISMATCH"
  | "UNSUPPORTED_ROW_CONTRACT"
  | "INVALID_AUTHORITY_METADATA"
  | "DUPLICATE_ROW_KEY";

export class GoogleAdsAllDataStagingContractError
  extends Error {
  readonly code:
    GoogleAdsAllDataStagingContractErrorCode;

  constructor(
    code:
      GoogleAdsAllDataStagingContractErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataStagingContractError";

    this.code =
      code;
  }
}

export type GoogleAdsAllDataPreparedStagingRow =
  Readonly<{
    row_index: number;
    row_key: string;
    date: string;
    channel: string | null;
    device: string | null;
    source: string | null;
    row: EtrylueNormalizedMediaRow;
  }>;

export type PrepareGoogleAdsAllDataSearchStagingRowsInput =
  Readonly<{
    externalAccountId: string;
    rowStartIndex: number;
    rows:
      readonly EtrylueNormalizedMediaRow[];
  }>;

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(
      value,
    );

  return (
    prototype ===
      Object.prototype ||
    prototype === null
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength =
    2_000,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > maxLength
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeNullableString(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      "A staging presentation field is invalid.",
    );
  }

  const normalized =
    value.trim();

  return normalized
    ? normalized
    : null;
}

function normalizeRowStartIndex(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      "rowStartIndex must be a non-negative safe integer.",
    );
  }

  return value;
}

function requireProviderMeta(
  row:
    EtrylueNormalizedMediaRow,
  required: boolean,
): UnknownRecord | null {
  const raw =
    (
      row as unknown as
        UnknownRecord
    ).provider_meta;

  if (
    raw === undefined ||
    raw === null
  ) {
    if (required) {
      throw new GoogleAdsAllDataStagingContractError(
        "INVALID_AUTHORITY_METADATA",
        "The Google Ads ALL-DATA row is missing provider_meta authority metadata.",
      );
    }

    return null;
  }

  if (!isPlainObject(raw)) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_AUTHORITY_METADATA",
      "The Google Ads ALL-DATA row provider_meta is invalid.",
    );
  }

  return raw;
}

function buildExpectedAuthorityMeta(
  entityType:
    GoogleAdsAllDataSearchEntityType,
  entityId: string,
  campaignType: "SEARCH" | "DEMAND_GEN" = "SEARCH",
) {
  return buildGoogleAdsAuthorityProviderMeta({
    campaignType:
      campaignType,

    entityType,

    entityId,
  });
}

function assertAuthorityMetaMatches(
  existing:
    UnknownRecord,
  expected:
    ReturnType<
      typeof buildExpectedAuthorityMeta
    >,
): void {
  const expectedRecord =
    expected as unknown as
      UnknownRecord;

  for (
    const key
    of [
      "provider",
      "campaign_type",
      "product_family",
      "authoritative_grain",
      "entity_type",
      "entity_id",
    ] as const
  ) {
    if (
      existing[key] !==
      expectedRecord[key]
    ) {
      throw new GoogleAdsAllDataStagingContractError(
        "INVALID_AUTHORITY_METADATA",
        `The Google Ads ALL-DATA authority metadata field ${key} is invalid.`,
      );
    }
  }
}

function withAuthorityMeta(
  row:
    EtrylueNormalizedMediaRow,
  entityType:
    GoogleAdsAllDataSearchEntityType,
  entityId: string,
  requireExisting:
    boolean,
  campaignType: "SEARCH" | "DEMAND_GEN" = "SEARCH",
): EtrylueNormalizedMediaRow {
  const existing =
    requireProviderMeta(
      row,
      requireExisting,
    );

  const expected =
    buildExpectedAuthorityMeta(
      entityType,
      entityId,
      campaignType,
    );

  if (existing) {
    assertAuthorityMetaMatches(
      existing,
      expected,
    );
  }

  const providerMeta =
    Object.freeze({
      ...(existing ?? {}),
      ...expected,
    });

  return Object.freeze({
    ...row,

    provider_meta:
      providerMeta,
  }) as EtrylueNormalizedMediaRow;
}

function validateCanonicalBase(
  input: Readonly<{
    row:
      EtrylueNormalizedMediaRow;
    rowIndexInBatch: number;
    externalAccountId: string;
  }>,
): Readonly<{
  accountId: string;
  campaignId: string;
  groupId: string;
  date: string;
  reason: string;
}> {
  const {
    row,
    rowIndexInBatch,
    externalAccountId,
  } = input;

  const path =
    `rows[${rowIndexInBatch}]`;

  if (
    !row ||
    typeof row !== "object"
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      `${path} must be a canonical row.`,
    );
  }

  if (
    row.provider !==
    GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "SCOPE_MISMATCH",
      `${path} is not a Google Ads row.`,
    );
  }

  if (
    row.ingestion_source !==
    API_INGESTION_SOURCE
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      `${path} must use API ingestion_source.`,
    );
  }

  if (
    row.row_level !==
    row.data_level
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      `${path} row_level and data_level must match.`,
    );
  }

  const accountId =
    normalizeRequiredString(
      row.external_account_id,
      `${path}.external_account_id`,
      500,
    );

  if (
    accountId !==
    externalAccountId
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "SCOPE_MISMATCH",
      `${path} account does not match the ALL-DATA staging scope.`,
    );
  }

  const campaignId =
    normalizeRequiredString(
      row.external_campaign_id,
      `${path}.external_campaign_id`,
    );

  const groupId =
    normalizeRequiredString(
      row.external_group_id,
      `${path}.external_group_id`,
    );

  const date =
    normalizeRequiredString(
      row.date,
      `${path}.date`,
      10,
    );

  if (!isValidYmd(date)) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      `${path}.date is invalid.`,
    );
  }

  if (
    row.report_date !== date ||
    row.day !== date ||
    row.ymd !== date
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      `${path} canonical date fields do not match.`,
    );
  }

  const reason =
    normalizeRequiredString(
      row.row_level_reason,
      `${path}.row_level_reason`,
      500,
    );

  return {
    accountId,
    campaignId,
    groupId,
    date,
    reason,
  };
}

function prepareSearchRow(
  input: Readonly<{
    row:
      EtrylueNormalizedMediaRow;
    rowIndexInBatch: number;
    externalAccountId: string;
  }>,
): EtrylueNormalizedMediaRow {
  const base =
    validateCanonicalBase(
      input,
    );

  const {
    row,
    rowIndexInBatch,
  } = input;

  const path =
    `rows[${rowIndexInBatch}]`;

  if (
    row.row_level ===
      "keyword" &&
    base.reason ===
      GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON
  ) {
    const keywordId =
      normalizeRequiredString(
        row.external_keyword_id,
        `${path}.external_keyword_id`,
      );

    const rawCreativeId =
      (
        row as unknown as
          UnknownRecord
      ).external_creative_id;

    if (
      rawCreativeId !==
        undefined &&
      rawCreativeId !==
        null &&
      String(rawCreativeId).trim()
    ) {
      throw new GoogleAdsAllDataStagingContractError(
        "UNSUPPORTED_ROW_CONTRACT",
        `${path} keyword row unexpectedly contains a creative identity.`,
      );
    }

    /*
     * Legacy Google keyword canonical rows intentionally remain
     * untagged at the producer.
     *
     * Only the ALL-DATA staging lane adds authority metadata so the
     * report consumer can retain the keyword detail row while excluding
     * it from representative KPI totals.
     */
    return withAuthorityMeta(
      row,
      "keyword",
      keywordId,
      false,
    );
  }

  if (
    row.row_level ===
      "creative" &&
    (
      base.reason === GOOGLE_ADS_SEARCH_AD_ROW_LEVEL_REASON ||
      base.reason === GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL_REASON
    )
  ) {
    const creativeId =
      normalizeRequiredString(
        row.external_creative_id,
        `${path}.external_creative_id`,
      );

    const rawKeywordId =
      (
        row as unknown as
          UnknownRecord
      ).external_keyword_id;

    if (
      rawKeywordId !==
        undefined &&
      rawKeywordId !==
        null &&
      String(rawKeywordId).trim()
    ) {
      throw new GoogleAdsAllDataStagingContractError(
        "UNSUPPORTED_ROW_CONTRACT",
        `${path} Search ad row unexpectedly contains a keyword identity.`,
      );
    }

    /*
     * Search ad producer already owns authoritative metadata.
     * Require it rather than silently repairing a malformed authority row.
     */
    return withAuthorityMeta(
      row,
      "ad",
      creativeId,
      true,
      base.reason === GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL_REASON
        ? "DEMAND_GEN"
        : "SEARCH",
    );
  }

  throw new GoogleAdsAllDataStagingContractError(
    "UNSUPPORTED_ROW_CONTRACT",
    `${path} is not a supported Google Ads Search ALL-DATA staging row.`,
  );
}

export function buildGoogleAdsAllDataSearchStagingRowKey(
  row:
    EtrylueNormalizedMediaRow,
): string {
  if (
    row.provider !==
    GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "SCOPE_MISMATCH",
      "The ALL-DATA staging row is not a Google Ads row.",
    );
  }

  const accountId =
    normalizeRequiredString(
      row.external_account_id,
      "row.external_account_id",
      500,
    );

  const campaignId =
    normalizeRequiredString(
      row.external_campaign_id,
      "row.external_campaign_id",
    );

  const groupId =
    normalizeRequiredString(
      row.external_group_id,
      "row.external_group_id",
    );

  const date =
    normalizeRequiredString(
      row.date,
      "row.date",
      10,
    );

  if (!isValidYmd(date)) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      "row.date is invalid.",
    );
  }

  const providerMeta =
    requireProviderMeta(
      row,
      true,
    );

  if (!providerMeta) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_AUTHORITY_METADATA",
      "The ALL-DATA row has no provider_meta.",
    );
  }

  if (
    (
      providerMeta.product_family !== SEARCH_PRODUCT_FAMILY &&
      providerMeta.product_family !== "demand_gen"
    ) ||
    providerMeta.authoritative_grain !==
      SEARCH_AUTHORITATIVE_GRAIN
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_AUTHORITY_METADATA",
      "The ALL-DATA row does not use the Search/ad authority contract.",
    );
  }

  const entityType =
    providerMeta.entity_type;

  let entityId: string;

  if (
    entityType ===
      "keyword" &&
    providerMeta.product_family === SEARCH_PRODUCT_FAMILY &&
    row.row_level ===
      "keyword" &&
    row.row_level_reason ===
      GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON
  ) {
    entityId =
      normalizeRequiredString(
        row.external_keyword_id,
        "row.external_keyword_id",
      );
  } else if (
    entityType ===
      "ad" &&
    row.row_level ===
      "creative" &&
    (
      (
        providerMeta.product_family === SEARCH_PRODUCT_FAMILY &&
        row.row_level_reason === GOOGLE_ADS_SEARCH_AD_ROW_LEVEL_REASON
      ) ||
      (
        providerMeta.product_family === "demand_gen" &&
        row.row_level_reason === GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL_REASON
      )
    )
  ) {
    entityId =
      normalizeRequiredString(
        row.external_creative_id,
        "row.external_creative_id",
      );
  } else {
    throw new GoogleAdsAllDataStagingContractError(
      "UNSUPPORTED_ROW_CONTRACT",
      "The ALL-DATA row grain does not match its canonical row contract.",
    );
  }

  if (
    providerMeta.entity_id !==
    entityId
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_AUTHORITY_METADATA",
      "The ALL-DATA provider_meta entity_id does not match the canonical external entity id.",
    );
  }

  return JSON.stringify([
    GOOGLE_ADS_PROVIDER,
    providerMeta.product_family,
    entityType,
    accountId,
    campaignId,
    groupId,
    entityId,
    date,
  ]);
}

export function prepareGoogleAdsAllDataSearchStagingRows(
  input:
    PrepareGoogleAdsAllDataSearchStagingRowsInput,
): readonly GoogleAdsAllDataPreparedStagingRow[] {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA staging preparation input is required.",
    );
  }

  const externalAccountId =
    normalizeRequiredString(
      input.externalAccountId,
      "externalAccountId",
      500,
    );

  const rowStartIndex =
    normalizeRowStartIndex(
      input.rowStartIndex,
    );

  if (!Array.isArray(input.rows)) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      "rows must be an array.",
    );
  }

  if (
    input.rows.length > 0 &&
    rowStartIndex >
      Number.MAX_SAFE_INTEGER -
        input.rows.length
  ) {
    throw new GoogleAdsAllDataStagingContractError(
      "INVALID_INPUT",
      "The ALL-DATA staging row index range exceeds the safe integer limit.",
    );
  }

  const seenKeys =
    new Set<string>();

  const prepared =
    input.rows.map(
      (
        row,
        rowIndexInBatch,
      ) => {
        const taggedRow =
          prepareSearchRow({
            row,
            rowIndexInBatch,
            externalAccountId,
          });

        const rowKey =
          buildGoogleAdsAllDataSearchStagingRowKey(
            taggedRow,
          );

        if (
          seenKeys.has(
            rowKey,
          )
        ) {
          throw new GoogleAdsAllDataStagingContractError(
            "DUPLICATE_ROW_KEY",
            "The Google Ads ALL-DATA staging batch contains a duplicate logical row identity.",
          );
        }

        seenKeys.add(
          rowKey,
        );

        return Object.freeze({
          row_index:
            rowStartIndex +
            rowIndexInBatch,

          row_key:
            rowKey,

          date:
            taggedRow.date,

          channel:
            normalizeNullableString(
              taggedRow.channel,
            ),

          device:
            normalizeNullableString(
              taggedRow.device,
            ),

          source:
            normalizeNullableString(
              taggedRow.source,
            ),

          row:
            taggedRow,
        });
      },
    );

  return Object.freeze(
    prepared,
  );
}
