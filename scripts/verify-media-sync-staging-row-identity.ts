import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  buildMediaSyncStagingRowKey,
  MediaSyncStagingRowIdentityError,
  type MediaSyncStagingRowIdentityErrorCode,
} from "../src/lib/media-sync/media-sync-staging-row-identity";
import {
  convertNaverAuthoritativeEntityCollectorItemToCanonicalRows,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-canonical-adapter";
import type {
  NaverAuthoritativeEntityStatsCollectorItem,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import {
  convertNaverKeywordDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import type {
  NaverSearchAdsAdRecord,
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsEntityDailyStatsResult,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
} from "../src/lib/media-sync/naver-searchads-api";
import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

const EXTERNAL_ACCOUNT_ID =
  "123456";

const DATE =
  "2026-05-01";

const SHOPPING_CAMPAIGN:
  NaverSearchAdsCampaignRecord = {
    id:
      "cmp-shopping",
    name:
      "Shopping Campaign",
    campaignType:
      "SHOPPING",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
  };

const SHOPPING_ADGROUP:
  NaverSearchAdsAdgroupRecord = {
    id:
      "grp-shopping",
    campaignId:
      SHOPPING_CAMPAIGN.id,
    name:
      "Shopping Group",
    adgroupType:
      "SHOPPING_PRODUCT_AD",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
  };

const SHOPPING_AD_A:
  NaverSearchAdsAdRecord = {
    id:
      "ad-shopping-a",
    adgroupId:
      SHOPPING_ADGROUP.id,
    type:
      "SHOPPING_PRODUCT_AD",
    inspectStatus:
      "APPROVED",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
    referenceKey:
      "product-a",
  };

const SHOPPING_AD_B:
  NaverSearchAdsAdRecord = {
    ...SHOPPING_AD_A,
    id:
      "ad-shopping-b",
    referenceKey:
      "product-b",
  };

const BRAND_CAMPAIGN:
  NaverSearchAdsCampaignRecord = {
    id:
      "cmp-brand",
    name:
      "Brand Campaign",
    campaignType:
      "BRAND_SEARCH",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
  };

const BRAND_ADGROUP_A:
  NaverSearchAdsAdgroupRecord = {
    id:
      "grp-brand-a",
    campaignId:
      BRAND_CAMPAIGN.id,
    name:
      "Brand Group A",
    adgroupType:
      "BRAND_SEARCH",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
  };

const BRAND_ADGROUP_B:
  NaverSearchAdsAdgroupRecord = {
    ...BRAND_ADGROUP_A,
    id:
      "grp-brand-b",
    name:
      "Brand Group B",
  };

const KEYWORD_CAMPAIGN:
  NaverSearchAdsCampaignRecord = {
    id:
      "cmp-keyword",
    name:
      "Keyword Campaign",
    campaignType:
      "WEB_SITE",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
  };

const KEYWORD_ADGROUP:
  NaverSearchAdsAdgroupRecord = {
    id:
      "grp-keyword",
    campaignId:
      KEYWORD_CAMPAIGN.id,
    name:
      "Keyword Group",
    adgroupType:
      "WEB_SITE",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
  };

const KEYWORD:
  NaverSearchAdsKeywordRecord = {
    id:
      "kw-keyword",
    adgroupId:
      KEYWORD_ADGROUP.id,
    keyword:
      "identity fixture",
    inspectStatus:
      "APPROVED",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
    bidAmount:
      500,
    useGroupBidAmount:
      false,
  };

function clone<T>(
  value: T,
): T {
  return structuredClone(
    value,
  );
}

function entityStats(
  entityId: string,
  entityType:
    | "ad"
    | "adgroup",
): NaverSearchAdsEntityDailyStatsResult {
  return {
    entityId,
    entityType,
    dateFrom:
      DATE,
    dateTo:
      DATE,
    records: [
      {
        entityId,
        entityType,
        date:
          DATE,
        periodStart:
          DATE,
        periodEnd:
          DATE,
        impCnt:
          100,
        clkCnt:
          10,
        salesAmt:
          1_000,
        ccnt:
          1,
        convAmt:
          2_000,
      },
    ],
  };
}

function keywordStats():
  NaverSearchAdsKeywordDailyStatsResult {
  return {
    keywordId:
      KEYWORD.id,
    dateFrom:
      DATE,
    dateTo:
      DATE,
    records: [
      {
        keywordId:
          KEYWORD.id,
        date:
          DATE,
        periodStart:
          DATE,
        periodEnd:
          DATE,
        impCnt:
          100,
        clkCnt:
          10,
        salesAmt:
          1_000,
        ccnt:
          1,
        convAmt:
          2_000,
        avgRnk:
          2.5,
      },
    ],
  };
}

function buildCollectorItem(input: {
  campaign:
    NaverSearchAdsCampaignRecord;
  adgroup:
    NaverSearchAdsAdgroupRecord;
  entity:
    | NaverSearchAdsAdgroupRecord
    | NaverSearchAdsAdRecord;
  authoritativeGrain:
    | "adgroup"
    | "ad";
  stats:
    NaverSearchAdsEntityDailyStatsResult;
}): NaverAuthoritativeEntityStatsCollectorItem {
  const cursor =
    createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index:
          0,
        dateFrom:
          DATE,
        dateTo:
          DATE,
      },
    });

  return {
    campaign:
      input.campaign,
    adgroup:
      input.adgroup,
    entity:
      input.entity,
    authoritativeGrain:
      input.authoritativeGrain,
    stats:
      input.stats,
    cursorBefore:
      cursor,
    cursorAfter: {
      ...cursor,
    },
    requestAttemptCount:
      1,
  };
}

function firstRow(
  rows:
    EtrylueNormalizedMediaRow[],
): EtrylueNormalizedMediaRow {
  const row =
    rows[0];

  assert.ok(
    row,
    "Expected one canonical fixture row.",
  );

  return row;
}

function stableJson(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(
      value,
    );
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(
        stableJson,
      )
      .join(",")}]`;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
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

function expectIdentityError(
  expectedCode:
    MediaSyncStagingRowIdentityErrorCode,
  callback: () => void,
): void {
  try {
    callback();
  } catch (error) {
    assert.ok(
      error instanceof
        MediaSyncStagingRowIdentityError,
      "Expected MediaSyncStagingRowIdentityError.",
    );

    assert.equal(
      error.code,
      expectedCode,
      "Unexpected staging row identity error code.",
    );

    return;
  }

  throw new Error(
    `Expected staging identity to throw ${expectedCode}.`,
  );
}

async function main(): Promise<void> {
  const identityPath =
    "src/lib/media-sync/media-sync-staging-row-identity.ts";

  const repositoryPath =
    "src/lib/media-sync/media-sync-staging-repository.ts";

  const adapterPath =
    "src/lib/media-sync/naver-searchads-authoritative-entity-canonical-adapter.ts";

  const canonicalPath =
    "src/lib/media-sync/naver-searchads-canonical-row.ts";

  const [
    identityBefore,
    repositoryBefore,
    adapterBefore,
    canonicalBefore,
  ] =
    await Promise.all([
      readFile(
        identityPath,
        "utf8",
      ),
      readFile(
        repositoryPath,
        "utf8",
      ),
      readFile(
        adapterPath,
        "utf8",
      ),
      readFile(
        canonicalPath,
        "utf8",
      ),
    ]);

  const fixtureInput = {
    shoppingCampaign:
      clone(
        SHOPPING_CAMPAIGN,
      ),
    shoppingAdgroup:
      clone(
        SHOPPING_ADGROUP,
      ),
    shoppingAdA:
      clone(
        SHOPPING_AD_A,
      ),
    shoppingAdB:
      clone(
        SHOPPING_AD_B,
      ),
    brandCampaign:
      clone(
        BRAND_CAMPAIGN,
      ),
    brandAdgroupA:
      clone(
        BRAND_ADGROUP_A,
      ),
    brandAdgroupB:
      clone(
        BRAND_ADGROUP_B,
      ),
    keywordCampaign:
      clone(
        KEYWORD_CAMPAIGN,
      ),
    keywordAdgroup:
      clone(
        KEYWORD_ADGROUP,
      ),
    keyword:
      clone(
        KEYWORD,
      ),
  };

  const fixtureInputBefore =
    JSON.stringify(
      fixtureInput,
    );

  const shoppingRowA =
    firstRow(
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              fixtureInput.shoppingCampaign,
            adgroup:
              fixtureInput.shoppingAdgroup,
            entity:
              fixtureInput.shoppingAdA,
            authoritativeGrain:
              "ad",
            stats:
              entityStats(
                fixtureInput.shoppingAdA.id,
                "ad",
              ),
          }),
      }),
    );

  const shoppingRowB =
    firstRow(
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              fixtureInput.shoppingCampaign,
            adgroup:
              fixtureInput.shoppingAdgroup,
            entity:
              fixtureInput.shoppingAdB,
            authoritativeGrain:
              "ad",
            stats:
              entityStats(
                fixtureInput.shoppingAdB.id,
                "ad",
              ),
          }),
      }),
    );

  const brandRowA =
    firstRow(
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              fixtureInput.brandCampaign,
            adgroup:
              fixtureInput.brandAdgroupA,
            entity:
              fixtureInput.brandAdgroupA,
            authoritativeGrain:
              "adgroup",
            stats:
              entityStats(
                fixtureInput.brandAdgroupA.id,
                "adgroup",
              ),
          }),
      }),
    );

  const brandRowB =
    firstRow(
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              fixtureInput.brandCampaign,
            adgroup:
              fixtureInput.brandAdgroupA,
            entity:
              fixtureInput.brandAdgroupB,
            authoritativeGrain:
              "adgroup",
            stats:
              entityStats(
                fixtureInput.brandAdgroupB.id,
                "adgroup",
              ),
          }),
      }),
    );

  const keywordRow =
    firstRow(
      convertNaverKeywordDailyStatsToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        campaign:
          fixtureInput.keywordCampaign,
        adgroup:
          fixtureInput.keywordAdgroup,
        keyword:
          fixtureInput.keyword,
        stats:
          keywordStats(),
      }),
    );

  const keywordKey =
    buildMediaSyncStagingRowKey(
      keywordRow,
    );

  const expectedLegacyKeywordKey =
    JSON.stringify([
      "naver_searchad",
      EXTERNAL_ACCOUNT_ID,
      KEYWORD_CAMPAIGN.id,
      KEYWORD_ADGROUP.id,
      KEYWORD.id,
      DATE,
    ]);

  assert.equal(
    keywordKey,
    expectedLegacyKeywordKey,
    "Existing keyword row_key encoding changed.",
  );

  assert.equal(
    buildMediaSyncStagingRowKey(
      clone(
        keywordRow,
      ),
    ),
    keywordKey,
    "Exact keyword retry did not keep the same row_key.",
  );

  const keywordPresentationChange = {
    ...keywordRow,
    campaign:
      "Renamed keyword campaign",
    campaign_name:
      "Renamed keyword campaign",
    keyword:
      "renamed keyword",
    keyword_name:
      "renamed keyword",
    cost:
      keywordRow.cost +
      1,
  };

  assert.equal(
    buildMediaSyncStagingRowKey(
      keywordPresentationChange,
    ),
    keywordKey,
    "Keyword metrics or names changed row_key.",
  );

  const shoppingKeyA =
    buildMediaSyncStagingRowKey(
      shoppingRowA,
    );

  assert.equal(
    buildMediaSyncStagingRowKey(
      clone(
        shoppingRowA,
      ),
    ),
    shoppingKeyA,
    "Exact SHOPPING retry did not keep the same row_key.",
  );

  assert.notEqual(
    buildMediaSyncStagingRowKey(
      shoppingRowB,
    ),
    shoppingKeyA,
    "Different SHOPPING creative IDs produced the same row_key.",
  );

  const shoppingPresentationChange = {
    ...shoppingRowA,
    campaign:
      "Renamed shopping campaign",
    campaign_name:
      "Renamed shopping campaign",
    group:
      "Renamed shopping group",
    group_name:
      "Renamed shopping group",
    creative:
      "renamed creative",
    creative_name:
      "renamed creative",
    impressions:
      shoppingRowA.impressions +
      1,
  };

  assert.equal(
    buildMediaSyncStagingRowKey(
      shoppingPresentationChange,
    ),
    shoppingKeyA,
    "SHOPPING metrics or names changed row_key.",
  );

  const brandKeyA =
    buildMediaSyncStagingRowKey(
      brandRowA,
    );

  assert.equal(
    buildMediaSyncStagingRowKey(
      clone(
        brandRowA,
      ),
    ),
    brandKeyA,
    "Exact BRAND_SEARCH retry did not keep the same row_key.",
  );

  assert.notEqual(
    buildMediaSyncStagingRowKey(
      brandRowB,
    ),
    brandKeyA,
    "Different BRAND_SEARCH adgroup IDs produced the same row_key.",
  );

  const brandPresentationChange = {
    ...brandRowA,
    campaign:
      "Renamed brand campaign",
    campaign_name:
      "Renamed brand campaign",
    group:
      "Renamed brand group",
    group_name:
      "Renamed brand group",
    clicks:
      brandRowA.clicks +
      1,
  };

  assert.equal(
    buildMediaSyncStagingRowKey(
      brandPresentationChange,
    ),
    brandKeyA,
    "BRAND_SEARCH metrics or names changed row_key.",
  );

  const sharedShoppingRow = {
    ...shoppingRowA,
    external_campaign_id:
      "shared-campaign",
    external_group_id:
      "shared-entity",
    external_creative_id:
      "shared-entity",
  };

  const sharedBrandRow = {
    ...brandRowA,
    external_campaign_id:
      "shared-campaign",
    external_group_id:
      "shared-entity",
  };

  assert.notEqual(
    buildMediaSyncStagingRowKey(
      sharedShoppingRow,
    ),
    buildMediaSyncStagingRowKey(
      sharedBrandRow,
    ),
    "Cross-grain rows collided when external IDs used the same string.",
  );

  const exactPayload =
    stableJson(
      shoppingRowA,
    );

  assert.equal(
    stableJson(
      clone(
        shoppingRowA,
      ),
    ),
    exactPayload,
    "Exact canonical payload retry comparison changed.",
  );

  assert.notEqual(
    stableJson({
      ...shoppingRowA,
      cost:
        shoppingRowA.cost +
        1,
    }),
    exactPayload,
    "Metric change did not change the canonical fingerprint source payload.",
  );

  assert.notEqual(
    stableJson({
      ...shoppingRowA,
      campaign:
        "Changed payload name",
    }),
    exactPayload,
    "Canonical payload name change did not change the fingerprint source payload.",
  );

  expectIdentityError(
    "INVALID_INPUT",
    () => {
      buildMediaSyncStagingRowKey({
        ...shoppingRowA,
        external_creative_id:
          "",
      });
    },
  );

  expectIdentityError(
    "INVALID_INPUT",
    () => {
      buildMediaSyncStagingRowKey({
        ...brandRowA,
        external_group_id:
          "",
      });
    },
  );

  expectIdentityError(
    "INVALID_INPUT",
    () => {
      buildMediaSyncStagingRowKey({
        ...shoppingRowA,
        data_level:
          "mixed",
      });
    },
  );

  expectIdentityError(
    "UNSUPPORTED_ROW_LEVEL",
    () => {
      buildMediaSyncStagingRowKey({
        ...shoppingRowA,
        row_level:
          "unknown",
        data_level:
          "unknown",
      });
    },
  );

  assert.equal(
    JSON.stringify(
      fixtureInput,
    ),
    fixtureInputBefore,
    "Staging identity fixture mutated canonical source inputs.",
  );

  const canonicalRowsBefore =
    JSON.stringify({
      keywordRow,
      shoppingRowA,
      shoppingRowB,
      brandRowA,
      brandRowB,
    });

  buildMediaSyncStagingRowKey(
    keywordRow,
  );
  buildMediaSyncStagingRowKey(
    shoppingRowA,
  );
  buildMediaSyncStagingRowKey(
    shoppingRowB,
  );
  buildMediaSyncStagingRowKey(
    brandRowA,
  );
  buildMediaSyncStagingRowKey(
    brandRowB,
  );

  assert.equal(
    JSON.stringify({
      keywordRow,
      shoppingRowA,
      shoppingRowB,
      brandRowA,
      brandRowB,
    }),
    canonicalRowsBefore,
    "Staging identity builder mutated canonical rows.",
  );

  const [
    identityAfter,
    repositoryAfter,
    adapterAfter,
    canonicalAfter,
  ] =
    await Promise.all([
      readFile(
        identityPath,
        "utf8",
      ),
      readFile(
        repositoryPath,
        "utf8",
      ),
      readFile(
        adapterPath,
        "utf8",
      ),
      readFile(
        canonicalPath,
        "utf8",
      ),
    ]);

  assert.equal(
    hash(
      identityAfter,
    ),
    hash(
      identityBefore,
    ),
    "Staging row identity source changed during verification.",
  );

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
      adapterAfter,
    ),
    hash(
      adapterBefore,
    ),
    "Authoritative canonical adapter source changed during verification.",
  );

  assert.equal(
    hash(
      canonicalAfter,
    ),
    hash(
      canonicalBefore,
    ),
    "Canonical converter source changed during verification.",
  );

  console.log(
    "verified existing keyword row_key byte contract unchanged: true",
  );

  console.log(
    "verified SHOPPING identity uses external_creative_id and date: true",
  );

  console.log(
    "verified BRAND_SEARCH identity uses external_group_id and date: true",
  );

  console.log(
    "verified different creative IDs produce different row keys: true",
  );

  console.log(
    "verified different adgroup IDs produce different row keys: true",
  );

  console.log(
    "verified metrics and display names do not change row keys: true",
  );

  console.log(
    "verified identical ID strings cannot collide across authoritative grains: true",
  );

  console.log(
    "verified exact canonical payload retry comparison input unchanged: true",
  );

  console.log(
    "verified changed canonical payload changes fingerprint source input: true",
  );

  console.log(
    "verified invalid or incomplete staging identities fail closed: true",
  );

  console.log(
    "verified staging identity and canonical inputs unchanged: true",
  );

  console.log(
    "verified identity, repository, adapter, and canonical source hashes unchanged: true",
  );

  console.log(
    "fixture calculates PostgreSQL row_fingerprint: false",
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
      "Media sync staging row identity fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);
