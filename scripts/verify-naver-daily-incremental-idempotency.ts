import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";


const ROOT =
  resolve(
    process.cwd(),
  );

const REPORT_ID =
  "abde01b5-b6cf-4a10-871f-a6654b604b82";

const CONNECTION_ID =
  "2a7018f7-1a83-4450-bdb9-e5326f7e38e6";

const EXPECTED_2026_09_01 =
  "04753914-8198-5173-97db-000c15080efd";

/*
 * Local verifier authority only.
 *
 * media-sync-jobs-repository imports the Supabase admin module, whose module
 * initialization validates environment variables. These harmless local dummy
 * values allow source loading only; this verifier never invokes the database.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??=
  "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  "local-verifier-service-role-key";

async function main(): Promise<void> {
  const {
    buildNaverDailyIncrementalJobId,
    NAVER_DAILY_INCREMENTAL_CONTRACT,
  } =
    await import(
      "../src/lib/media-sync/naver-searchads-daily-incremental"
    );

const repository =
  readFileSync(
    resolve(
      ROOT,
      "src/lib/media-sync/media-sync-jobs-repository.ts",
    ),
    "utf8",
  );

const publicRoute =
  readFileSync(
    resolve(
      ROOT,
      "app/api/reports/[id]/media-sync-jobs/route.ts",
    ),
    "utf8",
  );

const dailySource =
  readFileSync(
    resolve(
      ROOT,
      "src/lib/media-sync/naver-searchads-daily-incremental.ts",
    ),
    "utf8",
  );

const first =
  buildNaverDailyIncrementalJobId({
    reportId:
      REPORT_ID,
    connectionId:
      CONNECTION_ID,
    date:
      "2026-09-01",
  });

const firstRepeat =
  buildNaverDailyIncrementalJobId({
    reportId:
      REPORT_ID,
    connectionId:
      CONNECTION_ID,
    date:
      "2026-09-01",
  });

const second =
  buildNaverDailyIncrementalJobId({
    reportId:
      REPORT_ID,
    connectionId:
      CONNECTION_ID,
    date:
      "2026-09-02",
  });

assert.equal(
  NAVER_DAILY_INCREMENTAL_CONTRACT,
  "naver_daily_v1",
);

assert.equal(
  first,
  EXPECTED_2026_09_01,
);

assert.equal(
  firstRepeat,
  first,
);

assert.notEqual(
  second,
  first,
);

assert.match(
  first,
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

assert.throws(
  () =>
    buildNaverDailyIncrementalJobId({
      reportId:
        REPORT_ID,
      connectionId:
        CONNECTION_ID,
      date:
        "2026-02-30",
    }),
);

assert.match(
  repository,
  /jobId\?:\s*string/,
  "Internal repository input must expose optional jobId.",
);

assert.match(
  repository,
  /\{\s*id:\s*requestedJobId\s*\}/,
  "Requested deterministic id must be inserted explicitly.",
);

assert.match(
  repository,
  /\.eq\("id",\s*requestedJobId\)[\s\S]*?maybeSingle\(\)/,
  "Unique violation handling must read the requested deterministic id.",
);

assert.match(
  repository,
  /const\s+exactReplay\s*=[\s\S]*?existingRecord\.date_from\s*===\s*dateFrom[\s\S]*?existingRecord\.date_to\s*===\s*dateTo[\s\S]*?existingRecord\.created_by\s*===\s*createdBy/,
  "Exact deterministic replay must validate immutable job scope.",
);

assert.match(
  repository,
  /if\s*\(!exactReplay\)[\s\S]*?"INVALID_RECORD"/,
  "Deterministic id scope conflict must fail closed.",
);

assert.match(
  repository,
  /return\s+toSafeMediaSyncJob\(\s*existingRecord,\s*\)/,
  "Exact deterministic replay must return the existing job.",
);

assert.doesNotMatch(
  publicRoute,
  /\bjobId\b|\bjob_id\b/,
  "Public media sync POST route must not expose internal deterministic job ids.",
);

assert.match(
  dailySource,
  /dateFrom:\s*date[\s\S]*?dateTo:\s*date/,
  "Daily creator must create a one-day window.",
);

assert.match(
  dailySource,
  /mode:\s*"snapshot_replace"/,
  "Daily creator must preserve snapshot_replace mode.",
);

assert.doesNotMatch(
  dailySource,
  /reports[\s\S]*?update|meta[\s\S]*?update/,
  "Daily creator must not mutate stored report period metadata.",
);

console.log(
  "deterministic id 2026-09-01:",
  first,
);
console.log(
  "deterministic repeat stable:",
  firstRepeat === first,
);
console.log(
  "different date gets different id:",
  second !== first,
);
console.log(
  "public route exposes job id:",
  false,
);
console.log(
  "global date unique index required:",
  false,
);
console.log(
  "database calls:",
  0,
);
console.log(
  "naver api calls:",
  0,
);
console.log(
  "verification=PASS",
);

}

void main().catch(
  (error: unknown) => {
    console.error(
      "daily incremental idempotency verification failed",
      error,
    );
    process.exitCode = 1;
  },
);
