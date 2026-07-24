// scripts/verify-exact-naver-production-recovery-brand-overlap-repair-contract.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPAIR_SQL_PATH =
  "scripts/sql/repair-exact-naver-production-recovery-brand-overlap.sql";

const PREFLIGHT_SQL_PATH =
  "scripts/sql/preflight-exact-naver-production-recovery-brand-overlap-repair.sql";

const EXPECTED_IDS = [
  "4191baff-393f-4be8-bb38-31548d3ba051",
  "9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7",
  "ea413950-4068-41e8-9ced-8355020d7e7d",
  "27b1556f-9d42-496f-bd7e-5a59ebee71d4",
  "da51e71a-01ce-42fb-a937-7af0b5f47786",
  "aba7d28f-ec85-49db-941a-fa5babe2af61",
  "48401e55-55e5-4722-ba58-1ad2338eda04",
  "6d74227e-8d3b-4782-b041-6915d1cc3b89",
] as const;

const EXPECTED_OLD_TOKEN =
  "31132c30d7421e06f77586b3b19788954665449b26c408c7299f61ecc539b127";

const EXPECTED_OLD_UPDATED_AT =
  "2026-07-22 00:27:59.363+00";

type Check = {
  name: string;
  passed: boolean;
};

function loadText(path: string): string {
  return readFileSync(
    resolve(process.cwd(), path),
    "utf8",
  );
}

function includesAll(
  value: string,
  expected: readonly string[],
): boolean {
  return expected.every((item) =>
    value.includes(item),
  );
}

function countMatches(
  value: string,
  pattern: RegExp,
): number {
  return [...value.matchAll(pattern)].length;
}

function main(): void {
  const repairSql =
    loadText(REPAIR_SQL_PATH);

  const preflightSql =
    loadText(PREFLIGHT_SQL_PATH);

  const lowerRepairSql =
    repairSql.toLowerCase();

  const lowerPreflightSql =
    preflightSql.toLowerCase();

  const checks: Check[] = [
    {
      name: "exact IDs present in both files",
      passed:
        includesAll(
          repairSql,
          EXPECTED_IDS,
        ) &&
        includesAll(
          preflightSql,
          EXPECTED_IDS,
        ),
    },
    {
      name: "exact stale-state guards present",
      passed:
        repairSql.includes(
          EXPECTED_OLD_TOKEN,
        ) &&
        repairSql.includes(
          EXPECTED_OLD_UPDATED_AT,
        ) &&
        preflightSql.includes(
          EXPECTED_OLD_TOKEN,
        ) &&
        preflightSql.includes(
          EXPECTED_OLD_UPDATED_AT,
        ),
    },
    {
      name: "repair transaction is atomic",
      passed:
        /\bbegin\s*;/i.test(repairSql) &&
        /\bcommit\s*;/i.test(repairSql) &&
        /do\s+\$repair\$/i.test(repairSql) &&
        /raise exception/i.test(repairSql),
    },
    {
      name: "preflight is SELECT only",
      passed:
        lowerPreflightSql.includes(
          "safe_to_execute_exact_brand_overlap_repair",
        ) &&
        !/\b(insert|update|delete|call)\b/i.test(
          preflightSql.replace(
            /\/\*[\s\S]*?\*\//g,
            "",
          ),
        ),
    },
    {
      name: "repair never calls materialization activation or finalization RPC",
      passed:
        !/prepare_media_sync_snapshot_materialization\s*\(/i.test(
          repairSql,
        ) &&
        !/materialize_media_sync_snapshot_batch\s*\(/i.test(
          repairSql,
        ) &&
        !/complete_media_sync_snapshot_materialization\s*\(/i.test(
          repairSql,
        ) &&
        !/activate_media_sync_snapshot/i.test(
          repairSql,
        ) &&
        !/finalize_media_sync_job/i.test(
          repairSql,
        ),
    },
    {
      name: "repair does not mutate reports report_rows report_ingestions",
      passed:
        !/\b(update|insert\s+into|delete\s+from)\s+public\.reports\b/i.test(
          repairSql,
        ) &&
        !/\b(update|insert\s+into|delete\s+from)\s+public\.report_rows\b/i.test(
          repairSql,
        ) &&
        !/\b(update|insert\s+into|delete\s+from)\s+public\.report_ingestions\b/i.test(
          repairSql,
        ),
    },
    {
      name: "repair mutates only exact candidate staging and job",
      passed:
        /where\s+s\.job_id\s*=\s*v_candidate_job_id/i.test(
          repairSql,
        ) &&
        /where\s+job\.id\s*=\s*v_candidate_job_id/i.test(
          repairSql,
        ) &&
        !/\bupdate\s+public\.media_sync_jobs[\s\S]*v_source_job_id/i.test(
          repairSql,
        ),
    },
    {
      name: "Brand Search overlap predicate is exact",
      passed:
        repairSql.includes(
          "naver_searchad_registered_keyword_daily_stats",
        ) &&
        repairSql.includes(
          "naver_searchad_brand_search_adgroup_daily_stats",
        ) &&
        repairSql.includes(
          "{provider_meta,campaign_type}",
        ) &&
        repairSql.includes(
          "BRAND_SEARCH",
        ) &&
        repairSql.includes(
          "external_campaign_id",
        ),
    },
    {
      name: "exact row-count contract is present",
      passed:
        includesAll(
          repairSql,
          [
            "45808",
            "1204",
            "44604",
            "43310",
            "1244",
            "50",
          ],
        ),
    },
    {
      name: "exact approved metric contract is present",
      passed:
        includesAll(
          repairSql,
          [
            "9707",
            "2275",
            "20368600",
            "2632",
            "1092",
            "7639300",
            "7075",
            "1183",
            "113850",
            "67",
            "12729300",
          ],
        ),
    },
    {
      name: "row indexes are moved to disjoint range before compaction",
      passed:
        /set\s+row_index\s*=\s*s\.row_index\s*\+\s*v_reindex_offset/i.test(
          repairSql,
        ) &&
        /set\s+row_index\s*=\s*m\.new_row_index/i.test(
          repairSql,
        ),
    },
    {
      name: "only excluded mapped rows are deleted",
      passed:
        /delete\s+from\s+public\.media_sync_staging_rows[\s\S]*m\.excluded/i.test(
          repairSql,
        ) &&
        countMatches(
          repairSql,
          /\bdelete\s+from\s+public\.media_sync_staging_rows\b/gi,
        ) === 1,
    },
    {
      name: "checkpoint remains completed and authoritative complete",
      passed:
        repairSql.includes(
          "{collector,phase}",
        ) &&
        repairSql.includes(
          "'completed'::text",
        ) &&
        repairSql.includes(
          "{collector,authoritative,complete}",
        ) &&
        repairSql.includes(
          "to_jsonb(true)",
        ),
    },
    {
      name: "repair contract v2 and dynamic token are generated",
      passed:
        repairSql.includes(
          "'contract_version', 2",
        ) &&
        repairSql.includes(
          "brand_search_cross_grain_dedup_v1",
        ) &&
        repairSql.includes(
          "'version=2'",
        ) &&
        repairSql.includes(
          "v_repaired_confirmation_token",
        ) &&
        repairSql.includes(
          "v_repaired_fingerprint",
        ),
    },
    {
      name: "fingerprints use bounded 10,000-row blocks",
      passed:
        repairSql.includes(
          "chunked_sha256_v1:block_size=10000",
        ) &&
        repairSql.includes(
          "v_fingerprint_block_size constant bigint := 10000",
        ) &&
        repairSql.includes(
          "exact_repair_pre_fingerprint_blocks",
        ) &&
        repairSql.includes(
          "exact_repair_post_fingerprint_blocks",
        ),
    },
    {
      name: "current published pointers and active report sentinels are guarded",
      passed:
        includesAll(
          repairSql,
          [
            "117f1dd891f3e2612aebbbb7862e2b37d0be3a022d4151c762fe72c032e38776",
            "05c683f8660bb241efede9f5a80a95aef2e3407e2936636309d45f48aea972f7",
            "1e374775c65849a63a105ea25ebdd169ed060e96365c69f451a2e1ab586f0ca0",
            "359716",
            "118",
            "44514",
          ],
        ),
    },
    {
      name: "active report sentinels hash canonical row JSON only",
      passed:
        countMatches(
          repairSql,
          /string_agg\(\s*r\.row::text\s*\|\|\s*E'\\n'/gi,
        ) === 2 &&
        countMatches(
          preflightSql,
          /string_agg\(\s*r\.row::text\s*\|\|\s*E'\\n'/gi,
        ) === 2 &&
        !/to_jsonb\(r\)::text\s*\|\|\s*E'\\n'/i.test(
          repairSql,
        ) &&
        !/to_jsonb\(r\)::text\s*\|\|\s*E'\\n'/i.test(
          preflightSql,
        ),
    },
    {
      name: "generic pending claim is absent",
      passed:
        !/claim_next_naver_media_sync_job/i.test(
          repairSql,
        ) &&
        !/status\s*=\s*'pending'/i.test(
          repairSql,
        ),
    },
    {
      name: "result explicitly reports no MAF calls",
      passed:
        repairSql.includes(
          "materialization_called",
        ) &&
        repairSql.includes(
          "activation_called",
        ) &&
        repairSql.includes(
          "finalization_called",
        ) &&
        countMatches(
          repairSql,
          /\bfalse\b/gi,
        ) >= 3,
    },
  ];

  const failedChecks =
    checks.filter((check) =>
      !check.passed
    );

  console.log(
    "exact Brand Search overlap repair contract verification passed:",
    failedChecks.length === 0,
  );

  for (const check of checks) {
    console.log(
      `${check.passed ? "PASS" : "FAIL"}: ${check.name}`,
    );
  }

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
}

main();