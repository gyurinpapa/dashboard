// scripts/verify-google-ads-all-data-staging-repository.ts

import assert from "node:assert/strict";

import {
  prepareGoogleAdsAllDataSearchStagingRows,
} from "../src/lib/media-sync/google-ads-all-data-staging-contract";
import {
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
  type MediaSyncStagingRepositoryRpcInvoker,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  buildMediaSyncStagingRowKey,
} from "../src/lib/media-sync/media-sync-staging-row-identity";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ALL_DATA =
  "google_all_data_v1" as const;

const DATE =
  "2026-05-01";

const ACCOUNT_ID =
  "1234567890";

const CAMPAIGN_ID =
  "1001";

const GROUP_ID =
  "2001";

const KEYWORD_ID =
  "3001";

const AD_ID =
  "4001";

const GOOGLE_JOB = {
  id:
    "11111111-1111-4111-8111-111111111111",
  report_id:
    "22222222-2222-4222-8222-222222222222",
  workspace_id:
    "33333333-3333-4333-8333-333333333333",
  advertiser_id:
    "44444444-4444-4444-8444-444444444444",
  connection_id:
    "55555555-5555-4555-8555-555555555555",
  provider:
    GOOGLE_ADS_PROVIDER,
  external_account_id:
    ACCOUNT_ID,
  status:
    "processing",
  date_from:
    DATE,
  date_to:
    DATE,
  started_at:
    "2026-08-27T00:00:00.000Z",
  attempt_count:
    1,
} as unknown as
  MediaSyncJobRecord;

function withExecutionContract(
  job:
    MediaSyncJobRecord,
  executionContract:
    unknown,
): MediaSyncJobRecord {
  return {
    ...job,
    execution_contract:
      executionContract,
  } as unknown as
    MediaSyncJobRecord;
}

const ALL_DATA_JOB =
  withExecutionContract(
    GOOGLE_JOB,
    GOOGLE_ALL_DATA,
  );

function createKeywordRow():
  EtrylueNormalizedMediaRow {
  return {
    date:
      DATE,
    report_date:
      DATE,
    day:
      DATE,
    ymd:
      DATE,

    channel:
      "검샣��괃�곃�",
    source:
      "Google Ads",
    platform:
      "Google",
    device:
      "",

    campaign:
      "Fixture Search Campaign",
    campaign_name:
      "Fixture Search Campaign",

    group:
      "Fixture Search Ad Group",
    group_name:
      "Fixture Search Ad Group",
    adgroup_name:
      "Fixture Search Ad Group",

    keyword:
      "fixture keyword",
    keyword_name:
      "fixture keyword",

    impressions:
      100,
    clicks:
      10,
    cost:
      1000,
    conversions:
      2,
    revenue:
      3000,

    row_level:
      "keyword",
    data_level:
      "keyword",
    row_level_reason:
      "google_ads_keyword_daily_stats",

    provider:
      GOOGLE_ADS_PROVIDER,
    ingestion_source:
      "api",

    external_account_id:
      ACCOUNT_ID,
    external_campaign_id:
      CAMPAIGN_ID,
    external_group_id:
      GROUP_ID,
    external_keyword_id:
      KEYWORD_ID,
  };
}

function createAdRow():
  EtrylueNormalizedMediaRow {
  return {
    date:
      DATE,
    report_date:
      DATE,
    day:
      DATE,
    ymd:
      DATE,

    channel:
      "검샣��괃�곃�",
    source:
      "Google Ads",
    platform:
      "Google",
    device:
      "",

    campaign:
      "Fixture Search Campaign",
    campaign_name:
      "Fixture Search Campaign",

    group:
      "Fixture Search Ad Group",
    group_name:
      "Fixture Search Ad Group",
    adgroup_name:
      "Fixture Search Ad Group",

    creative:
      AD_ID,
    creative_name:
      AD_ID,

    impressions:
      120,
    clicks:
      12,
    cost:
      1200,
    conversions:
      3,
    revenue:
      4000,

    row_level:
      "creative",
    data_level:
      "creative",
    row_level_reason:
      "google_ads_search_ad_daily_stats",

    provider:
      GOOGLE_ADS_PROVIDER,
    ingestion_source:
      "api",

    external_account_id:
      ACCOUNT_ID,
    external_campaign_id:
      CAMPAIGN_ID,
    external_group_id:
      GROUP_ID,
    external_creative_id:
      AD_ID,

    provider_meta: {
      provider:
        "google_ads",
      campaign_type:
        "SEARCH",
      product_family:
        "search",
      authoritative_grain:
        "ad",
      entity_type:
        "ad",
      entity_id:
        AD_ID,
    },
  };
}

type CapturedCall = {
  functionName:
    string;
  payload:
    Record<string, unknown>;
};

function requireRecord(
  value:
    unknown,
): Record<string, unknown> {
  assert.ok(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );

  return value as
    Record<string, unknown>;
}

function getRpcRows(
  call:
    CapturedCall,
): Record<string, unknown>[] {
  const rows =
    call.payload.rows;

  assert.ok(
    Array.isArray(rows),
  );

  return rows.map(
    requireRecord,
  );
}

function successfulRpc(
  captured:
    CapturedCall[],
): MediaSyncStagingRepositoryRpcInvoker {
  return async (
    functionName,
    args,
  ) => {
    const payload =
      requireRecord(
        args.p_payload,
      );

    const rows =
      payload.rows;

    assert.ok(
      Array.isArray(rows),
    );

    const typedRows =
      rows.map(
        requireRecord,
      );

    captured.push({
      functionName,
      payload,
    });

    return {
      data: [
        {
          submitted_rows:
            typedRows.length,
          inserted_rows:
            typedRows.length,
          duplicate_rows:
            0,
          first_row_index:
            typedRows.length
              ? typedRows[0]
                  .row_index
              : null,
          last_row_index:
            typedRows.length
              ? typedRows[
                  typedRows.length -
                    1
                ].row_index
              : null,
        },
      ],
      error:
        null,
    };
  };
}

async function expectBeforeRpcError(
  input: {
    job:
      MediaSyncJobRecord;
    rows:
      readonly EtrylueNormalizedMediaRow[];
    code:
      MediaSyncStagingRepositoryError["code"];
  },
): Promise<void> {
  let rpcCalls =
    0;

  await assert.rejects(
    () =>
      appendMediaSyncStagingBatch(
        {
          job:
            input.job,
          rows:
            input.rows,
          rowStartIndex:
            0,
          dateWindowIndex:
            0,
        },
        {
          invokeRpc:
            async () => {
              rpcCalls +=
                1;

              return {
                data:
                  null,
                error:
                  null,
              };
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        MediaSyncStagingRepositoryError &&
      error.code ===
        input.code,
  );

  assert.equal(
    rpcCalls,
    0,
  );
}

async function verifyAllDataHappyPath():
  Promise<void> {
  const keyword =
    createKeywordRow();

  const ad =
    createAdRow();

  assert.equal(
    "provider_meta" in keyword,
    false,
  );

  const rows = [
    keyword,
    ad,
  ];

  const expected =
    prepareGoogleAdsAllDataSearchStagingRows({
      externalAccountId:
        ACCOUNT_ID,
      rowStartIndex:
        20,
      rows,
    });

  const captured:
    CapturedCall[] = [];

  const result =
    await appendMediaSyncStagingBatch(
      {
        job:
          ALL_DATA_JOB,
        rows,
        rowStartIndex:
          20,
        dateWindowIndex:
          0,
      },
      {
        invokeRpc:
          successfulRpc(
            captured,
          ),
      },
    );

  assert.equal(
    result.submittedRows,
    2,
  );

  assert.equal(
    captured.length,
    1,
  );

  const actualRows =
    getRpcRows(
      captured[0],
    );

  assert.deepEqual(
    actualRows,
    expected,
  );

  assert.notEqual(
    actualRows[0]
      .row_key,
    actualRows[1]
      .row_key,
  );

  const stagedKeyword =
    requireRecord(
      actualRows[0]
        .row,
    );

  const keywordMeta =
    requireRecord(
      stagedKeyword
        .provider_meta,
    );

  assert.equal(
    keywordMeta.entity_type,
    "keyword",
  );

  assert.equal(
    keywordMeta.authoritative_grain,
    "ad",
  );

  assert.equal(
    "provider_meta" in keyword,
    false,
  );

  console.log(
    "ALL_DATA_SEARCH_KEYWORD_AD_ACCEPTED=PASS",
  );

  console.log(
    "ALL_DATA_E1_RPC_ROWS_EXACT=PASS",
  );

  console.log(
    "ALL_DATA_CROSS_GRAIN_ROW_KEY_COLLISION=0",
  );

  console.log(
    "ALL_DATA_KEYWORD_TAGGING_STAGING_ONLY=PASS",
  );
}

async function verifyLegacyGoogleHeld():
  Promise<void> {
  const row =
    createKeywordRow();

  const expectedKey =
    buildMediaSyncStagingRowKey(
      row,
    );

  const missingCalls:
    CapturedCall[] = [];

  await appendMediaSyncStagingBatch(
    {
      job:
        GOOGLE_JOB,
      rows: [
        row,
      ],
      rowStartIndex:
        0,
      dateWindowIndex:
        0,
    },
    {
      invokeRpc:
        successfulRpc(
          missingCalls,
        ),
    },
  );

  assert.equal(
    getRpcRows(
      missingCalls[0],
    )[0].row_key,
    expectedKey,
  );

  const nullCalls:
    CapturedCall[] = [];

  await appendMediaSyncStagingBatch(
    {
      job:
        withExecutionContract(
          GOOGLE_JOB,
          null,
        ),
      rows: [
        createKeywordRow(),
      ],
      rowStartIndex:
        0,
      dateWindowIndex:
        0,
    },
    {
      invokeRpc:
        successfulRpc(
          nullCalls,
        ),
    },
  );

  assert.equal(
    getRpcRows(
      nullCalls[0],
    )[0].row_key,
    expectedKey,
  );

  await expectBeforeRpcError({
    job:
      GOOGLE_JOB,
    rows: [
      createAdRow(),
    ],
    code:
      "INVALID_INPUT",
  });

  await expectBeforeRpcError({
    job:
      withExecutionContract(
        GOOGLE_JOB,
        null,
      ),
    rows: [
      createAdRow(),
    ],
    code:
      "INVALID_INPUT",
  });

  console.log(
    "LEGACY_GOOGLE_KEYWORD_ROW_KEY_EXACT=PASS",
  );

  console.log(
    "LEGACY_GOOGLE_MISSING_MARKER_PATH=PASS",
  );

  console.log(
    "LEGACY_GOOGLE_NULL_MARKER_PATH=PASS",
  );

  console.log(
    "LEGACY_GOOGLE_SEARCH_AD_REJECTED=PASS",
  );
}

async function verifyAllDataFailsClosed():
  Promise<void> {
  const missingMeta =
    createAdRow();

  delete missingMeta
    .provider_meta;

  await expectBeforeRpcError({
    job:
      ALL_DATA_JOB,
    rows: [
      missingMeta,
    ],
    code:
      "INVALID_INPUT",
  });

  const wrongMeta =
    createAdRow();

  (
    wrongMeta.provider_meta as
      Record<string, unknown>
  ).entity_type =
    "keyword";

  await expectBeforeRpcError({
    job:
      ALL_DATA_JOB,
    rows: [
      wrongMeta,
    ],
    code:
      "INVALID_INPUT",
  });

  await expectBeforeRpcError({
    job:
      withExecutionContract(
        GOOGLE_JOB,
        "google_all_data_v2",
      ),
    rows: [
      createKeywordRow(),
    ],
    code:
      "INVALID_JOB",
  });

  const naverJob = {
    ...GOOGLE_JOB,
    provider:
      "naver_searchad",
    external_account_id:
      "naver-account",
    execution_contract:
      GOOGLE_ALL_DATA,
  } as unknown as
    MediaSyncJobRecord;

  await expectBeforeRpcError({
    job:
      naverJob,
    rows: [],
    code:
      "INVALID_JOB",
  });

  console.log(
    "ALL_DATA_MISSING_METADATA_FAILS_BEFORE_RPC=PASS",
  );

  console.log(
    "ALL_DATA_AUTHORITY_MISMATCH_FAILS_BEFORE_RPC=PASS",
  );

  console.log(
    "UNKNOWN_EXECUTION_CONTRACT_FAILS_CLOSED=PASS",
  );

  console.log(
    "NAVER_ALL_DATA_MARKER_FAILS_CLOSED=PASS",
  );
}

async function verifyCommonValidationHeld():
  Promise<void> {
  const secretRow =
    createKeywordRow();

  secretRow.provider_meta = {
    refresh_token:
      "forbidden-fixture",
  };

  await expectBeforeRpcError({
    job:
      ALL_DATA_JOB,
    rows: [
      secretRow,
    ],
    code:
      "INVALID_INPUT",
  });

  const scopeRow =
    createKeywordRow();

  scopeRow.external_account_id =
    "9876543210";

  await expectBeforeRpcError({
    job:
      ALL_DATA_JOB,
    rows: [
      scopeRow,
    ],
    code:
      "SCOPE_MISMATCH",
  });

  const dateRow =
    createKeywordRow();

  dateRow.date =
    "2026-05-02";
  dateRow.report_date =
    "2026-05-02";
  dateRow.day =
    "2026-05-02";
  dateRow.ymd =
    "2026-05-02";

  await expectBeforeRpcError({
    job:
      ALL_DATA_JOB,
    rows: [
      dateRow,
    ],
    code:
      "SCOPE_MISMATCH",
  });

  const metricRow =
    createKeywordRow();

  metricRow.cost =
    -1;

  await expectBeforeRpcError({
    job:
      ALL_DATA_JOB,
    rows: [
      metricRow,
    ],
    code:
      "INVALID_INPUT",
  });

  console.log(
    "COMMON_SECRET_GUARD_HELD=PASS",
  );

  console.log(
    "COMMON_ACCOUNT_SCOPE_GUARD_HELD=PASS",
  );

  console.log(
    "COMMON_DATE_SCOPE_GUARD_HELD=PASS",
  );

  console.log(
    "COMMON_METRIC_GUARD_HELD=PASS",
  );
}

async function main():
  Promise<void> {
  await verifyAllDataHappyPath();
  await verifyLegacyGoogleHeld();
  await verifyAllDataFailsClosed();
  await verifyCommonValidationHeld();

  console.log(
    "GOOGLE_ADS_ALL_DATA_STAGING_REPOSITORY_FIXTURE=PASS",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );

  console.log(
    "NEW_JOB_CREATION=0",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
