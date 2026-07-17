import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
  type MediaSyncStagingRepositoryRpcInvoker,
} from "../src/lib/media-sync/media-sync-staging-repository";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const EXTERNAL_ACCOUNT_ID =
  "customer-001";

const JOB_FIXTURE:
  MediaSyncJobRecord = {
    id:
      "job-001",
    workspace_id:
      "workspace-001",
    advertiser_id:
      "advertiser-001",
    report_id:
      "report-001",
    connection_id:
      "connection-001",
    provider:
      NAVER_PROVIDER,
    external_account_id:
      EXTERNAL_ACCOUNT_ID,
    date_from:
      "2026-05-01",
    date_to:
      "2026-05-02",
    data_level:
      "mixed",
    mode:
      "snapshot_replace",
    status:
      "processing",
    progress:
      0,
    raw_rows:
      0,
    normalized_rows:
      0,
    inserted_rows:
      0,
    failed_rows:
      0,
    previous_ingestion_id:
      null,
    snapshot_ingestion_id:
      null,
    attempt_count:
      1,
    error:
      null,
    error_detail:
      null,
    created_by:
      "user-001",
    created_at:
      "2026-07-14T00:00:00.000Z",
    started_at:
      "2026-07-14T00:01:00.000Z",
    finished_at:
      null,
    updated_at:
      "2026-07-14T00:01:00.000Z",
  };

type UnknownRecord =
  Record<string, unknown>;

type CapturedRpcCall = {
  functionName: string;
  args: {
    p_payload: unknown;
  };
};

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
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
    prototype ===
      null
  );
}

function requireRecord(
  value: unknown,
  message: string,
): UnknownRecord {
  assert.ok(
    isPlainObject(
      value,
    ),
    message,
  );

  return value;
}

function hash(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
    )
    .digest(
      "hex",
    );
}

function cloneFixture<T>(
  value: T,
): T {
  return structuredClone(
    value,
  );
}

function createCommonRow(input: {
  date: string;
  campaignId: string;
  campaignName: string;
  groupId: string;
  groupName: string;
}) {
  return {
    date:
      input.date,
    report_date:
      input.date,
    day:
      input.date,
    ymd:
      input.date,

    channel:
      "검색광고",
    source:
      "네이버 검색광고",
    platform:
      "네이버",
    device:
      "",

    campaign:
      input.campaignName,
    campaign_name:
      input.campaignName,

    group:
      input.groupName,
    group_name:
      input.groupName,
    adgroup_name:
      input.groupName,

    impressions:
      100,
    clicks:
      10,
    cost:
      1_000,
    conversions:
      1,
    revenue:
      2_000,

    provider:
      NAVER_PROVIDER,
    ingestion_source:
      "api" as const,

    external_account_id:
      EXTERNAL_ACCOUNT_ID,
    external_campaign_id:
      input.campaignId,
    external_group_id:
      input.groupId,
  };
}

function createKeywordRow():
  EtrylueNormalizedMediaRow {
  return {
    ...createCommonRow({
      date:
        "2026-05-01",
      campaignId:
        "cmp-keyword",
      campaignName:
        "Keyword Campaign",
      groupId:
        "grp-keyword",
      groupName:
        "Keyword Group",
    }),

    keyword:
      "키워드",
    keyword_name:
      "키워드",

    rank:
      1.5,

    row_level:
      "keyword",
    data_level:
      "keyword",
    row_level_reason:
      "naver_searchad_registered_keyword_daily_stats",

    external_keyword_id:
      "kwd-001",

    provider_meta: {
      fixture:
        true,
    },
  };
}

function createCreativeRow():
  EtrylueNormalizedMediaRow {
  return {
    ...createCommonRow({
      date:
        "2026-05-01",
      campaignId:
        "cmp-shopping",
      campaignName:
        "Shopping Campaign",
      groupId:
        "grp-shopping",
      groupName:
        "Shopping Group",
    }),

    keyword:
      "",
    keyword_name:
      "",

    creative:
      "product-001",
    creative_name:
      "product-001",

    row_level:
      "creative",
    data_level:
      "creative",
    row_level_reason:
      "naver_searchad_shopping_ad_daily_stats",

    external_creative_id:
      "ad-001",

    provider_meta: {
      authoritative_grain:
        "ad",
      entity_type:
        "ad",
      entity_id:
        "ad-001",
    },
  };
}

function createMixedRow():
  EtrylueNormalizedMediaRow {
  return {
    ...createCommonRow({
      date:
        "2026-05-02",
      campaignId:
        "cmp-brand",
      campaignName:
        "Brand Campaign",
      groupId:
        "grp-brand",
      groupName:
        "Brand Group",
    }),

    keyword:
      "",
    keyword_name:
      "",

    creative:
      "",
    creative_name:
      "",

    row_level:
      "mixed",
    data_level:
      "mixed",
    row_level_reason:
      "naver_searchad_brand_search_adgroup_daily_stats",

    provider_meta: {
      authoritative_grain:
        "adgroup",
      entity_type:
        "adgroup",
      entity_id:
        "grp-brand",
    },
  };
}

async function expectRepositoryError(input: {
  rows: readonly EtrylueNormalizedMediaRow[];
  expectedCode:
    MediaSyncStagingRepositoryError["code"];
  invokeRpc:
    MediaSyncStagingRepositoryRpcInvoker;
}): Promise<void> {
  try {
    await appendMediaSyncStagingBatch(
      {
        job:
          cloneFixture(
            JOB_FIXTURE,
          ),
        rows:
          input.rows,
        rowStartIndex:
          0,
        dateWindowIndex:
          0,
      },
      {
        invokeRpc:
          input.invokeRpc,
      },
    );
  } catch (error) {
    assert.ok(
      error instanceof
        MediaSyncStagingRepositoryError,
      "Expected MediaSyncStagingRepositoryError.",
    );

    assert.equal(
      error.code,
      input.expectedCode,
      "Unexpected staging repository error code.",
    );

    return;
  }

  throw new Error(
    `Expected staging repository to throw ${input.expectedCode}.`,
  );
}

async function main(): Promise<void> {
  const repositoryPath =
    "src/lib/media-sync/media-sync-staging-repository.ts";

  const identityPath =
    "src/lib/media-sync/media-sync-staging-row-identity.ts";

  const [
    repositoryBefore,
    identityBefore,
  ] =
    await Promise.all([
      readFile(
        repositoryPath,
        "utf8",
      ),
      readFile(
        identityPath,
        "utf8",
      ),
    ]);

  const keywordRow =
    createKeywordRow();

  const creativeRow =
    createCreativeRow();

  const mixedRow =
    createMixedRow();

  const sourceBefore =
    JSON.stringify({
      job:
        JOB_FIXTURE,
      rows: [
        keywordRow,
        creativeRow,
        mixedRow,
      ],
    });

  const capturedCalls:
    CapturedRpcCall[] = [];

  const invokeRpc:
    MediaSyncStagingRepositoryRpcInvoker =
    async (
      functionName,
      args,
    ) => {
      capturedCalls.push({
        functionName,
        args,
      });

      return {
        data: [
          {
            submitted_rows:
              3,
            inserted_rows:
              3,
            duplicate_rows:
              0,
            first_row_index:
              40,
            last_row_index:
              42,
          },
        ],
        error:
          null,
      };
    };

  const result =
    await appendMediaSyncStagingBatch(
      {
        job:
          cloneFixture(
            JOB_FIXTURE,
          ),
        rows: [
          keywordRow,
          creativeRow,
          mixedRow,
        ],
        rowStartIndex:
          40,
        dateWindowIndex:
          7,
      },
      {
        invokeRpc,
      },
    );

  assert.deepEqual(
    result,
    {
      submittedRows:
        3,
      insertedRows:
        3,
      duplicateRows:
        0,
      firstRowIndex:
        40,
      lastRowIndex:
        42,
    },
  );

  assert.equal(
    capturedCalls.length,
    1,
    "RPC mock must be called exactly once.",
  );

  const call =
    capturedCalls[0];

  assert.ok(
    call,
    "Captured RPC call is missing.",
  );

  assert.equal(
    call.functionName,
    "append_media_sync_staging_batch",
  );

  const payload =
    requireRecord(
      call.args.p_payload,
      "RPC p_payload must be an object.",
    );

  assert.deepEqual(
    {
      job_id:
        payload.job_id,
      report_id:
        payload.report_id,
      workspace_id:
        payload.workspace_id,
      advertiser_id:
        payload.advertiser_id,
      connection_id:
        payload.connection_id,
      provider:
        payload.provider,
      external_account_id:
        payload.external_account_id,
      date_from:
        payload.date_from,
      date_to:
        payload.date_to,
      date_window_index:
        payload.date_window_index,
    },
    {
      job_id:
        JOB_FIXTURE.id,
      report_id:
        JOB_FIXTURE.report_id,
      workspace_id:
        JOB_FIXTURE.workspace_id,
      advertiser_id:
        JOB_FIXTURE.advertiser_id,
      connection_id:
        JOB_FIXTURE.connection_id,
      provider:
        JOB_FIXTURE.provider,
      external_account_id:
        JOB_FIXTURE.external_account_id,
      date_from:
        JOB_FIXTURE.date_from,
      date_to:
        JOB_FIXTURE.date_to,
      date_window_index:
        7,
    },
    "RPC scope payload mismatch.",
  );

  assert.ok(
    Array.isArray(
      payload.rows,
    ),
    "RPC payload rows must be an array.",
  );

  const rpcRows =
    payload.rows.map(
      (
        row,
      ) =>
        requireRecord(
          row,
          "RPC row must be an object.",
        ),
    );

  assert.deepEqual(
    rpcRows.map(
      (
        row,
      ) =>
        row.row_index,
    ),
    [
      40,
      41,
      42,
    ],
  );

  assert.deepEqual(
    rpcRows.map(
      (
        row,
      ) =>
        row.row_key,
    ),
    [
      JSON.stringify([
        NAVER_PROVIDER,
        EXTERNAL_ACCOUNT_ID,
        "cmp-keyword",
        "grp-keyword",
        "kwd-001",
        "2026-05-01",
      ]),
      JSON.stringify([
        "naver_searchad_authoritative_v1",
        "creative",
        NAVER_PROVIDER,
        EXTERNAL_ACCOUNT_ID,
        "cmp-shopping",
        "grp-shopping",
        "ad-001",
        "2026-05-01",
      ]),
      JSON.stringify([
        "naver_searchad_authoritative_v1",
        "mixed",
        NAVER_PROVIDER,
        EXTERNAL_ACCOUNT_ID,
        "cmp-brand",
        "grp-brand",
        "2026-05-02",
      ]),
    ],
    "RPC row_key payload mismatch.",
  );

  assert.deepEqual(
    rpcRows.map(
      (
        row,
      ) => ({
        date:
          row.date,
        channel:
          row.channel,
        device:
          row.device,
        source:
          row.source,
      }),
    ),
    [
      keywordRow,
      creativeRow,
      mixedRow,
    ].map(
      (
        row,
      ) => ({
        date:
          row.date,
        channel:
          row.channel,
        device:
          row.device,
        source:
          row.source,
      }),
    ),
  );

  assert.deepEqual(
    rpcRows.map(
      (
        row,
      ) =>
        row.row,
    ),
    [
      keywordRow,
      creativeRow,
      mixedRow,
    ],
    "RPC canonical row payload mismatch.",
  );

  assert.equal(
    JSON.stringify({
      job:
        JOB_FIXTURE,
      rows: [
        keywordRow,
        creativeRow,
        mixedRow,
      ],
    }),
    sourceBefore,
    "Staging repository mutated its job or canonical rows.",
  );

  let invalidRpcCallCount =
    0;

  const invalidInvokeRpc:
    MediaSyncStagingRepositoryRpcInvoker =
    async () => {
      invalidRpcCallCount +=
        1;

      return {
        data:
          [],
        error:
          null,
      };
    };

  await expectRepositoryError({
    rows: [
      {
        ...cloneFixture(
          creativeRow,
        ),
        data_level:
          "mixed",
      },
    ],
    expectedCode:
      "INVALID_INPUT",
    invokeRpc:
      invalidInvokeRpc,
  });

  const creativeWithoutId =
    cloneFixture(
      creativeRow,
    );

  delete creativeWithoutId[
    "external_creative_id"
  ];

  await expectRepositoryError({
    rows: [
      creativeWithoutId,
    ],
    expectedCode:
      "INVALID_INPUT",
    invokeRpc:
      invalidInvokeRpc,
  });

  await expectRepositoryError({
    rows: [
      {
        ...cloneFixture(
          creativeRow,
        ),
        external_keyword_id:
          "kwd-cross-grain",
      },
    ],
    expectedCode:
      "INVALID_INPUT",
    invokeRpc:
      invalidInvokeRpc,
  });

  await expectRepositoryError({
    rows: [
      {
        ...cloneFixture(
          mixedRow,
        ),
        external_creative_id:
          "ad-cross-grain",
      },
    ],
    expectedCode:
      "INVALID_INPUT",
    invokeRpc:
      invalidInvokeRpc,
  });

  await expectRepositoryError({
    rows: [
      {
        ...cloneFixture(
          mixedRow,
        ),
        keyword:
          "cross-grain-keyword",
      },
    ],
    expectedCode:
      "INVALID_INPUT",
    invokeRpc:
      invalidInvokeRpc,
  });

  await expectRepositoryError({
    rows: [
      {
        ...cloneFixture(
          creativeRow,
        ),
        row_level_reason:
          "wrong-reason",
      },
    ],
    expectedCode:
      "INVALID_INPUT",
    invokeRpc:
      invalidInvokeRpc,
  });

  assert.equal(
    invalidRpcCallCount,
    0,
    "Invalid canonical rows must fail before any RPC call.",
  );

  const [
    repositoryAfter,
    identityAfter,
  ] =
    await Promise.all([
      readFile(
        repositoryPath,
        "utf8",
      ),
      readFile(
        identityPath,
        "utf8",
      ),
    ]);

  assert.equal(
    hash(
      repositoryAfter,
    ),
    hash(
      repositoryBefore,
    ),
    "Staging repository source changed during verification.",
  );

  assert.equal(
    hash(
      identityAfter,
    ),
    hash(
      identityBefore,
    ),
    "Staging identity source changed during verification.",
  );

  console.log(
    "verified existing keyword validation and row_key RPC payload unchanged: true",
  );

  console.log(
    "verified SHOPPING creative validation and RPC row_key payload: true",
  );

  console.log(
    "verified BRAND_SEARCH mixed validation and RPC row_key payload: true",
  );

  console.log(
    "verified RPC scope, date window, and row indexes: true",
  );

  console.log(
    "verified canonical rows are forwarded without mutation: true",
  );

  console.log(
    "verified row_level and data_level mismatches fail before RPC: true",
  );

  console.log(
    "verified creative rows reject missing creative identity and keyword identity pollution: true",
  );

  console.log(
    "verified mixed rows reject keyword and creative identity pollution: true",
  );

  console.log(
    "verified authoritative row_level_reason mismatches fail before RPC: true",
  );

  console.log(
    "verified repository and identity source hashes unchanged: true",
  );

  console.log(
    "fixture uses injected Supabase RPC mock: true",
  );

  console.log(
    "fixture uses real Naver API: false",
  );

  console.log(
    "fixture uses database: false",
  );

  console.log(
    "fixture writes staging: false",
  );

  console.log(
    "fixture writes report_rows: false",
  );

  console.log(
    "fixture changes report pointers: false",
  );

  console.log(
    "verification passed: true",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "Media sync staging repository authoritative payload fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);
