import {
  equal,
} from "node:assert/strict";

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "fixture-service-role-key";

  const {
    classifyMediaSyncFactProjectionSecondaryEligibility,
  } =
    await import(
      "../src/lib/media-sync/media-sync-report-fanout-repository"
    );

  const monthlyReady = {
    status:
      "ready",

    draft_period_start:
      null,

    draft_period_end:
      null,

    period_start:
      null,

    period_end:
      null,

    current_ingestion_id:
      "11111111-1111-4111-8111-111111111111",

    published_ingestion_id:
      "11111111-1111-4111-8111-111111111111",

    meta: {
      data_source: {
        kind:
          "api",
      },

      public_identity: {
        source_type:
          "api",
        period_type:
          "monthly",
        period_key:
          "2026-08",
      },

      media_sync: {
        date_from:
          "2026-08-01",
        date_to:
          "2026-08-31",
      },
    },
  };

  equal(
    classifyMediaSyncFactProjectionSecondaryEligibility(
      monthlyReady,
    ),
    "eligible",
    "A valid generic monthly report must remain eligible.",
  );

  const dailyV2Ready = {
    ...monthlyReady,

    current_ingestion_id:
      "22222222-2222-4222-8222-222222222222",

    published_ingestion_id:
      "22222222-2222-4222-8222-222222222222",

    meta: {
      data_source: {
        kind:
          "api",
      },

      public_identity: {
        source_type:
          "api",
        period_type:
          "daily_sync",
        period_key:
          "2026-09-01",
      },

      media_sync: {
        auto_sync: {
          enabled:
            true,
          contract:
            "daily_report_v2",
          scope:
            "all_mapped_supported_media",
          start_date:
            "2026-09-01",
        },
      },
    },
  };

  equal(
    classifyMediaSyncFactProjectionSecondaryEligibility(
      dailyV2Ready,
    ),
    "exclude_daily_report_v2",
    "Canonical Daily Report V2 secondary must use its dedicated pipeline.",
  );

  equal(
    classifyMediaSyncFactProjectionSecondaryEligibility({
      ...dailyV2Ready,

      meta: {
        ...dailyV2Ready.meta,

        media_sync: {
          auto_sync: {
            ...dailyV2Ready
              .meta
              .media_sync
              .auto_sync,

            start_date:
              "2026-09-02",
          },
        },
      },
    }),
    "eligible",
    "Malformed Daily V2 authority must remain fail-closed eligible.",
  );

  const pristineDraft = {
    status:
      "draft",

    draft_period_start:
      null,

    draft_period_end:
      null,

    period_start:
      null,

    period_end:
      null,

    current_ingestion_id:
      null,

    published_ingestion_id:
      null,

    meta: {
      data_source: {
        kind:
          "api",
        mode:
          "snapshot_replace",
        provider:
          "naver_searchad",
        data_level:
          "keyword",
      },
    },
  };

  equal(
    classifyMediaSyncFactProjectionSecondaryEligibility(
      pristineDraft,
    ),
    "exclude_pristine_draft",
    "A pristine Builder API draft must not enter fact projection.",
  );

  equal(
    classifyMediaSyncFactProjectionSecondaryEligibility({
      ...pristineDraft,

      status:
        "ready",
    }),
    "eligible",
    "A ready report without projection authority must remain fail-closed eligible.",
  );

  equal(
    classifyMediaSyncFactProjectionSecondaryEligibility({
      ...pristineDraft,

      current_ingestion_id:
        "33333333-3333-4333-8333-333333333333",
    }),
    "eligible",
    "A draft with an ingestion pointer is not pristine.",
  );

  equal(
    classifyMediaSyncFactProjectionSecondaryEligibility({
      ...pristineDraft,

      meta: {
        ...pristineDraft.meta,

        public_identity: {
          source_type:
            "api",
          period_type:
            "monthly",
          period_key:
            "2026-09",
        },
      },
    }),
    "eligible",
    "A draft with public identity is not pristine.",
  );

  equal(
    classifyMediaSyncFactProjectionSecondaryEligibility({
      ...pristineDraft,

      meta: {
        ...pristineDraft.meta,

        media_sync: {},
      },
    }),
    "eligible",
    "A draft with media_sync state is not pristine.",
  );

  console.log(
    JSON.stringify({
      verification:
        "PASS",

      monthly_generic_preserved:
        true,

      daily_v2_secondary_excluded:
        true,

      pristine_api_draft_excluded:
        true,

      malformed_daily_v2_fail_closed:
        true,

      ready_missing_period_fail_closed:
        true,

      database_calls:
        0,

      naver_api_calls:
        0,

      production_mutations:
        0,
    }),
  );
}

void main().catch(
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
