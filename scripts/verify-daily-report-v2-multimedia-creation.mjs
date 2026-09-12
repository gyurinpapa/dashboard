import {
  createHash,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";

function read(path) {
  return readFileSync(
    path,
    "utf8",
  );
}

function assert(
  condition,
  label,
) {
  if (!condition) {
    console.error(
      `${label}=FAIL`,
    );

    process.exit(1);
  }

  console.log(
    `${label}=PASS`,
  );
}

function sha256(path) {
  return createHash("sha256")
    .update(
      readFileSync(path),
    )
    .digest("hex");
}

const route =
  read(
    "app/api/reports/create/route.ts",
  );

const builder =
  read(
    "app/report-builder/ReportBuilderClient.tsx",
  );

const sql =
  read(
    "scripts/sql/create-api-report-with-media-connections-v2.sql",
  );

assert(
  route.includes(
    "create_api_report_with_media_connection_v1",
  ),
  "V1_RPC_PRESERVED",
);

assert(
  route.includes(
    "create_api_report_with_media_connections_v2",
  ),
  "V2_RPC_ROUTE_PRESENT",
);

assert(
  route.includes(
    "connection_ids?: string[] | null;",
  ),
  "V2_CONNECTION_IDS_INPUT_PRESENT",
);

assert(
  route.includes(
    "API_REPORT_CONNECTION_INPUT_CONFLICT",
  ),
  "AMBIGUOUS_INPUT_FAIL_CLOSED",
);

assert(
  route.includes(
    "wantsNaverDailyReportAutoSync &&\n      hasConnectionIdsInput",
  ),
  "V1_DAILY_MULTIMEDIA_BLOCKED",
);

assert(
  sql.includes(
    "create or replace function public.create_api_report_with_media_connections_v2",
  ),
  "V2_SQL_FUNCTION_PRESENT",
);

assert(
  sql.includes(
    "p_connection_ids uuid[]",
  ),
  "V2_SQL_CONNECTION_ARRAY_PRESENT",
);

assert(
  sql.includes(
    "insert into public.report_media_connections",
  ),
  "V2_SQL_MAPPING_INSERT_PRESENT",
);

assert(
  sql.includes(
    "connection.provider in (\n      'naver_searchad',\n      'google_ads',\n      'meta_ads'",
  ),
  "V2_KNOWN_PROVIDER_GATE_PRESENT",
);

assert(
  sql.includes(
    "grant execute",
  ) &&
  sql.includes(
    "to service_role;",
  ),
  "V2_SERVICE_ROLE_ONLY_EXECUTION_PRESENT",
);

assert(
  !builder.includes(
    "connection_ids",
  ),
  "BUILDER_V2_NOT_ACTIVATED",
);

assert(
  builder.includes(
    "selectedApiMediaConnectionId",
  ),
  "BUILDER_V1_SELECTION_PRESERVED",
);

assert(
  builder.includes(
    "selectedApiDailyAutoSync",
  ),
  "BUILDER_V1_DAILY_UI_PRESERVED",
);

const goldenScript =
  sha256(
    "scripts/naver-searchads-daily-scheduler.ts",
  );

const goldenLib =
  sha256(
    "src/lib/media-sync/naver-searchads-daily-scheduler.ts",
  );

assert(
  goldenScript ===
    "4b8b21a4ae8119f4fddfe2621ef1b6d8589a93f97f807e3e97c95dc2d0fa4bd7",
  "GLOBAL_EGIS_SCRIPT_GOLDEN",
);

assert(
  goldenLib ===
    "ce603616085201781b2361f1eea428a2fd9adee04e13d0df02c91b20ed82787d",
  "GLOBAL_EGIS_LIB_GOLDEN",
);

console.log(
  "V2_A_STATIC_VERIFICATION=PASS",
);
