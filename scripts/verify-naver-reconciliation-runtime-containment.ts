// scripts/verify-naver-reconciliation-runtime-containment.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot =
  resolve(
    process.argv[2] ??
      process.cwd(),
  );

function readProjectFile(
  relativePath: string,
): string {
  return readFileSync(
    resolve(
      projectRoot,
      relativePath,
    ),
    "utf8",
  );
}

const repositoryPath =
  "src/lib/media-sync/naver-searchads-brand-search-cross-grain-reconciliation-repository.ts";

const orchestrationPath =
  "src/lib/media-sync/media-sync-worker-orchestration-repository.ts";

const reconciliationSqlPath =
  "scripts/sql/create-reconcile-naver-searchads-brand-search-cross-grain-staging.sql";

const repository =
  readProjectFile(
    repositoryPath,
  );

const orchestration =
  readProjectFile(
    orchestrationPath,
  );

const reconciliationSql =
  readProjectFile(
    reconciliationSqlPath,
  );

const repositoryPayload =
  repository.match(
    /const\s+payload\s*=\s*\{([\s\S]*?)\n\s*\};\n\n\s*const\s+invokeRpc/,
  );

assert.ok(
  repositoryPayload,
  "The reconciliation repository payload could not be located.",
);

assert.doesNotMatch(
  repositoryPayload[1],
  /\breport_id\s*:/,
  "The worker payload must omit report_id; the locked job is report authority.",
);

assert.doesNotMatch(
  reconciliationSql,
  /p_payload\s*->>\s*'report_id'/i,
  "The SQL function must not require report_id from the worker payload.",
);

assert.doesNotMatch(
  reconciliationSql,
  /v_report_id\s+is\s+null/i,
  "The SQL input gate still treats payload report_id as required.",
);

assert.match(
  reconciliationSql,
  /where\s+media_job\.id\s*=\s*v_job_id[\s\S]*?for\s+update\s*;[\s\S]*?v_report_id\s*:=\s*v_job\.report_id\s*;/i,
  "The SQL function must derive report authority from the locked job row.",
);

assert.match(
  repository,
  /const\s+DEFAULT_RECONCILIATION_BATCH_SIZE\s*=\s*500\s*;/,
  "The TypeScript reconciliation default batch must be 500 rows.",
);

assert.doesNotMatch(
  repository,
  /const\s+DEFAULT_RECONCILIATION_BATCH_SIZE\s*=\s*5_000\s*;/,
  "The old 5,000-row TypeScript default batch is still present.",
);

assert.match(
  reconciliationSql,
  /set\s+statement_timeout\s+to\s+'60s'/i,
  "The reconciliation SQL statement timeout must be 60 seconds.",
);

assert.doesNotMatch(
  reconciliationSql,
  /set\s+statement_timeout\s+to\s+'10min'/i,
  "The old 10-minute reconciliation statement timeout is still present.",
);

assert.match(
  reconciliationSql,
  /v_default_batch_size\s+constant\s+integer\s*:=\s*500\s*;/i,
  "The SQL reconciliation default batch must be 500 rows.",
);

assert.equal(
  (
    reconciliationSql.match(
      /count\s*\(\s*distinct\s+staging\.row_index\s*\)/gi,
    ) ?? []
  ).length,
  1,
  "In-progress reconciliation phase transitions must not recount every staging row.",
);

assert.match(
  reconciliationSql,
  /from\s*\([\s\S]*?where\s+staging\.job_id\s*=\s*v_job_id[\s\S]*?limit\s+v_batch_size[\s\S]*?\)\s+as\s+retained_batch[\s\S]*?jsonb_array_elements_text\s*\(\s*v_mixed_campaign_ids\s*\)/i,
  "Retained BRAND_SEARCH overlap validation must remain batch-bounded.",
);

assert.match(
  reconciliationSql,
  /Finalization therefore commits only that completed proof instead of[\s\S]*?v_remaining_overlap_rows\s*:=\s*0\s*;/i,
  "Finalization must not repeat the multi-million-row reconciliation scan.",
);

assert.match(
  reconciliationSql,
  /set\s+search_path\s+to\s+'pg_catalog',\s*'public',\s*'extensions'/i,
  "The protected reconciliation search_path changed.",
);

assert.match(
  reconciliationSql,
  /owner\s+to\s+postgres/i,
  "The reconciliation function owner contract changed.",
);

assert.match(
  reconciliationSql,
  /grant\s+execute[\s\S]*to\s+service_role/i,
  "The service-role execution grant is missing.",
);

assert.doesNotMatch(
  reconciliationSql,
  /\b(?:materialize_media_sync_snapshot|activate_media_sync_snapshot|finalize_media_sync_job|publish_report|publish_media_sync_snapshot)\s*\(/i,
  "The reconciliation SQL must not call a lifecycle or publish function.",
);

assert.match(
  orchestration,
  /label:\s*"processing_failure"/,
  "The original processing failure is not logged before mark-failed.",
);

assert.match(
  orchestration,
  /catch\s*\(markFailedError\)/,
  "A mark-failed error can still replace the original processing error.",
);

assert.match(
  orchestration,
  /label:\s*"mark_failed_failure"/,
  "The mark-failed failure is not logged separately.",
);

assert.match(
  orchestration,
  /JSON\.stringify\(detail\)/,
  "The sanitized nested PostgreSQL cause detail is not emitted to Railway logs.",
);

const catchBoundary =
  orchestration.match(
    /catch\s*\(error\)\s*\{[\s\S]*?label:\s*"processing_failure"[\s\S]*?catch\s*\(markFailedError\)[\s\S]*?label:\s*"mark_failed_failure"[\s\S]*?throw\s+error\s*;/,
  );

assert.ok(
  catchBoundary,
  "The original processing error is not preserved after a mark-failed error.",
);

console.log(
  "PASS: Naver reconciliation runtime containment contract",
);
