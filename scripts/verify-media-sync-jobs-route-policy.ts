import {
  parseCreateMediaSyncJobRequest,
  MediaSyncJobRequestError,
} from "../src/lib/media-sync/media-sync-job-request";
import {
  buildCreateMediaSyncJobSuccessResponse,
  buildCreatePendingMediaSyncJobRepositoryInput,
  mapMediaSyncJobRequestRouteError,
  mapMediaSyncJobsRepositoryRouteError,
  mapMediaSyncJobsRoutePolicyError,
  MediaSyncJobsRoutePolicyError,
} from "../src/lib/media-sync/media-sync-jobs-route-policy";
import type {
  MediaSyncJobRecord,
  SafeMediaSyncJob,
} from "../src/lib/media-sync/types";

type FixtureResult = {
  name: string;
  passed: boolean;
};

const REPORT_ID =
  "11111111-1111-4111-8111-111111111111";

const CONNECTION_ID =
  "22222222-2222-4222-8222-222222222222";

const WORKSPACE_ID =
  "33333333-3333-4333-8333-333333333333";

const ADVERTISER_ID =
  "44444444-4444-4444-8444-444444444444";

const USER_ID =
  "55555555-5555-4555-8555-555555555555";

const JOB_ID =
  "66666666-6666-4666-8666-666666666666";

const CURRENT_INGESTION_ID =
  "77777777-7777-4777-8777-777777777777";

function createSafeJob(
  overrides?: Partial<MediaSyncJobRecord>,
): SafeMediaSyncJob {
  return {
    id: JOB_ID,

    workspace_id: WORKSPACE_ID,
    advertiser_id: ADVERTISER_ID,
    report_id: REPORT_ID,
    connection_id: CONNECTION_ID,

    provider: "naver_searchad",
    external_account_id:
      "external-account",

    date_from: "2026-06-01",
    date_to: "2026-06-24",

    data_level: "keyword",
    mode: "snapshot_replace",

    status: "pending",
    progress: 0,

    raw_rows: 0,
    normalized_rows: 0,
    inserted_rows: 0,
    failed_rows: 0,

    previous_ingestion_id:
      CURRENT_INGESTION_ID,
    snapshot_ingestion_id: null,

    attempt_count: 0,
    error: null,
    error_detail: null,

    created_by: USER_ID,
    created_at:
      "2026-06-25T00:00:00.000Z",
    started_at: null,
    finished_at: null,
    updated_at:
      "2026-06-25T00:00:00.000Z",

    ...(overrides ?? {}),
  };
}

function getAccessContext() {
  return {
    userId: USER_ID,
    reportId: REPORT_ID,
    workspaceId: WORKSPACE_ID,
    advertiserId: ADVERTISER_ID,
    accessScope:
      "true_master" as const,
    canRunSync: true,
  };
}

function runFixture(
  name: string,
  fixture: () => void,
): FixtureResult {
  try {
    fixture();

    return {
      name,
      passed: true,
    };
  } catch {
    return {
      name,
      passed: false,
    };
  }
}

function assertTrue(
  value: unknown,
): void {
  if (value !== true) {
    throw new Error(
      "Fixture assertion failed.",
    );
  }
}

function assertThrowsCode(
  fixture: () => void,
  expectedCode: string,
): void {
  try {
    fixture();
  } catch (error) {
    if (
      error instanceof
        MediaSyncJobRequestError ||
      error instanceof
        MediaSyncJobsRoutePolicyError
    ) {
      assertTrue(
        error.code === expectedCode,
      );

      return;
    }

    throw error;
  }

  throw new Error(
    "Expected fixture to throw.",
  );
}

function main(): void {
  const results: FixtureResult[] = [];

  results.push(
    runFixture(
      "valid request parses",
      () => {
        const parsed =
          parseCreateMediaSyncJobRequest({
            reportId: REPORT_ID,
            body: {
              dateFrom:
                "2026-06-01",
              dateTo:
                "2026-06-24",
              dataLevel: "keyword",
              mode:
                "snapshot_replace",
            },
          });

        assertTrue(
          parsed.reportId ===
            REPORT_ID &&
            !("connectionId" in parsed) &&
            parsed.dateFrom ===
              "2026-06-01" &&
            parsed.dateTo ===
              "2026-06-24" &&
            parsed.dataLevel ===
              "keyword" &&
            parsed.mode ===
              "snapshot_replace",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "body scope and legacy connectionId fields are ignored",
      () => {
        const parsed =
          parseCreateMediaSyncJobRequest({
            reportId: REPORT_ID,
            body: {
              connectionId:
                "attacker-connection",
              dateFrom:
                "2026-06-01",
              dateTo:
                "2026-06-24",
              dataLevel: "keyword",
              mode:
                "snapshot_replace",

              reportId:
                "attacker-report",
              workspaceId:
                "attacker-workspace",
              advertiserId:
                "attacker-advertiser",
              createdBy:
                "attacker-user",
              provider: "meta_ads",
              status: "done",
            },
          });

        assertTrue(
          parsed.reportId ===
            REPORT_ID &&
            !("connectionId" in parsed) &&
            !(
              "workspaceId" in
              parsed
            ) &&
            !(
              "advertiserId" in
              parsed
            ) &&
            !(
              "createdBy" in
              parsed
            ) &&
            !(
              "provider" in
              parsed
            ) &&
            !("status" in parsed),
        );
      },
    ),
  );

  results.push(
    runFixture(
      "invalid date range rejected",
      () => {
        assertThrowsCode(
          () => {
            parseCreateMediaSyncJobRequest({
              reportId: REPORT_ID,
              body: {
                connectionId:
                  CONNECTION_ID,
                dateFrom:
                  "2026-06-24",
                dateTo:
                  "2026-06-01",
                dataLevel:
                  "keyword",
                mode:
                  "snapshot_replace",
              },
            });
          },
          "INVALID_INPUT",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "invalid calendar date rejected",
      () => {
        assertThrowsCode(
          () => {
            parseCreateMediaSyncJobRequest({
              reportId: REPORT_ID,
              body: {
                connectionId:
                  CONNECTION_ID,
                dateFrom:
                  "2026-02-31",
                dateTo:
                  "2026-03-01",
                dataLevel:
                  "keyword",
                mode:
                  "snapshot_replace",
              },
            });
          },
          "INVALID_INPUT",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "unsupported mode rejected",
      () => {
        assertThrowsCode(
          () => {
            parseCreateMediaSyncJobRequest({
              reportId: REPORT_ID,
              body: {
                connectionId:
                  CONNECTION_ID,
                dateFrom:
                  "2026-06-01",
                dateTo:
                  "2026-06-24",
                dataLevel:
                  "keyword",
                mode: "append",
              },
            });
          },
          "UNSUPPORTED_MODE",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "repository input uses access scope",
      () => {
        const parsed =
          parseCreateMediaSyncJobRequest({
            reportId: REPORT_ID,
            body: {
              dateFrom:
                "2026-06-01",
              dateTo:
                "2026-06-24",
              dataLevel: "keyword",
              mode:
                "snapshot_replace",
            },
          });

        const repositoryInput =
          buildCreatePendingMediaSyncJobRepositoryInput(
            getAccessContext(),
            parsed,
          );

        assertTrue(
          repositoryInput.reportId ===
            REPORT_ID &&
            repositoryInput.workspaceId ===
              WORKSPACE_ID &&
            repositoryInput.advertiserId ===
              ADVERTISER_ID &&
            repositoryInput.createdBy ===
              USER_ID &&
            !("connectionId" in repositoryInput),
        );
      },
    ),
  );

  results.push(
    runFixture(
      "report scope mismatch rejected",
      () => {
        const parsed =
          parseCreateMediaSyncJobRequest({
            reportId: REPORT_ID,
            body: {
              dateFrom:
                "2026-06-01",
              dateTo:
                "2026-06-24",
              dataLevel: "keyword",
              mode:
                "snapshot_replace",
            },
          });

        assertThrowsCode(
          () => {
            buildCreatePendingMediaSyncJobRepositoryInput(
              {
                ...getAccessContext(),
                reportId:
                  "different-report",
              },
              parsed,
            );
          },
          "REPORT_SCOPE_MISMATCH",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "run sync denial rejected",
      () => {
        const parsed =
          parseCreateMediaSyncJobRequest({
            reportId: REPORT_ID,
            body: {
              dateFrom:
                "2026-06-01",
              dateTo:
                "2026-06-24",
              dataLevel: "keyword",
              mode:
                "snapshot_replace",
            },
          });

        assertThrowsCode(
          () => {
            buildCreatePendingMediaSyncJobRepositoryInput(
              {
                ...getAccessContext(),
                canRunSync: false,
              },
              parsed,
            );
          },
          "MEDIA_SYNC_ACCESS_DENIED",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "safe success response built",
      () => {
        const parsed =
          parseCreateMediaSyncJobRequest({
            reportId: REPORT_ID,
            body: {
              dateFrom:
                "2026-06-01",
              dateTo:
                "2026-06-24",
              dataLevel: "keyword",
              mode:
                "snapshot_replace",
            },
          });

        const result =
          buildCreateMediaSyncJobSuccessResponse(
            getAccessContext(),
            parsed,
            createSafeJob({
              connection_id:
                "server-resolved-connection",
            }),
          );

        assertTrue(
          result.status === 201 &&
            result.body.ok === true &&
            result.body.job.status ===
              "pending" &&
            result.body.report_id ===
              REPORT_ID &&
            result.body.workspace_id ===
              WORKSPACE_ID &&
            result.body.advertiser_id ===
              ADVERTISER_ID,
        );
      },
    ),
  );

  results.push(
    runFixture(
      "unsafe response rejected",
      () => {
        const parsed =
          parseCreateMediaSyncJobRequest({
            reportId: REPORT_ID,
            body: {
              dateFrom:
                "2026-06-01",
              dateTo:
                "2026-06-24",
              dataLevel: "keyword",
              mode:
                "snapshot_replace",
            },
          });

        assertThrowsCode(
          () => {
            buildCreateMediaSyncJobSuccessResponse(
              getAccessContext(),
              parsed,
              {
                ...createSafeJob(),
                error_detail: {
                  secretKey:
                    "must-not-leak",
                },
              },
            );
          },
          "UNSAFE_RESPONSE",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "request errors map safely",
      () => {
        const invalidInput =
          mapMediaSyncJobRequestRouteError(
            "INVALID_INPUT",
          );

        const unsupportedMode =
          mapMediaSyncJobRequestRouteError(
            "UNSUPPORTED_MODE",
          );

        assertTrue(
          invalidInput.status === 400 &&
            invalidInput.error ===
              "INVALID_INPUT" &&
            unsupportedMode.status ===
              400 &&
            unsupportedMode.error ===
              "UNSUPPORTED_MODE",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "repository errors map safely",
      () => {
        const duplicate =
          mapMediaSyncJobsRepositoryRouteError(
            "ACTIVE_JOB_ALREADY_EXISTS",
          );

        const inactive =
          mapMediaSyncJobsRepositoryRouteError(
            "CONNECTION_NOT_ACTIVE",
          );

        const syncDisabled =
          mapMediaSyncJobsRepositoryRouteError(
            "PROVIDER_SYNC_NOT_ENABLED",
          );

        const dataLevelUnsupported =
          mapMediaSyncJobsRepositoryRouteError(
            "PROVIDER_DATA_LEVEL_NOT_SUPPORTED",
          );

        const database =
          mapMediaSyncJobsRepositoryRouteError(
            "DATABASE_ERROR",
          );

        assertTrue(
          duplicate.status === 409 &&
            duplicate.error ===
              "ACTIVE_JOB_ALREADY_EXISTS" &&
            inactive.status === 409 &&
            inactive.error ===
              "CONNECTION_NOT_ACTIVE" &&
            syncDisabled.status === 409 &&
            syncDisabled.error ===
              "PROVIDER_SYNC_NOT_ENABLED" &&
            dataLevelUnsupported.status ===
              409 &&
            dataLevelUnsupported.error ===
              "PROVIDER_DATA_LEVEL_NOT_SUPPORTED" &&
            database.status === 500 &&
            database.error ===
              "MEDIA_SYNC_JOB_DATABASE_ERROR",
        );
      },
    ),
  );

  results.push(
    runFixture(
      "policy errors map safely",
      () => {
        const denied =
          mapMediaSyncJobsRoutePolicyError(
            "MEDIA_SYNC_ACCESS_DENIED",
          );

        const unsafe =
          mapMediaSyncJobsRoutePolicyError(
            "UNSAFE_RESPONSE",
          );

        assertTrue(
          denied.status === 403 &&
            denied.error ===
              "MEDIA_SYNC_ACCESS_DENIED" &&
            unsafe.status === 500 &&
            unsafe.error ===
              "UNSAFE_MEDIA_SYNC_JOB_RESPONSE",
        );
      },
    ),
  );

  const passedCount =
    results.filter(
      (result) => result.passed,
    ).length;

  results.forEach((result) => {
    console.log(
      `${result.passed ? "PASS" : "FAIL"}:`,
      result.name,
    );
  });

  console.log(
    "fixture result:",
    `${passedCount}/${results.length}`,
  );

  if (passedCount !== results.length) {
    process.exitCode = 1;
  }
}

main();
