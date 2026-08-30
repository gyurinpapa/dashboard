import {
  buildPendingMediaSyncJobExecutionContractFields,
} from "../src/lib/media-sync/media-sync-jobs-repository";

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

function hasOwn(
  value: object,
  key: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    value,
    key,
  );
}

function readExecutionContract(
  value: object,
): unknown {
  return (
    value as Readonly<{
      execution_contract?: unknown;
    }>
  ).execution_contract;
}

function requireCondition(
  condition: boolean,
  marker: string,
): void {
  if (!condition) {
    console.error(`${marker}=FAIL`);
    process.exitCode = 1;
    return;
  }

  console.log(`${marker}=PASS`);
}

const googleFields =
  buildPendingMediaSyncJobExecutionContractFields(
    "google_ads",
  );

const naverFields =
  buildPendingMediaSyncJobExecutionContractFields(
    "naver_searchad",
  );

const metaFields =
  buildPendingMediaSyncJobExecutionContractFields(
    "meta_ads",
  );

requireCondition(
  hasOwn(
    googleFields,
    "execution_contract",
  ),
  "GOOGLE_EXECUTION_CONTRACT_KEY",
);

requireCondition(
  readExecutionContract(
    googleFields,
  ) ===
    GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT,
  "GOOGLE_EXECUTION_CONTRACT_VALUE",
);

requireCondition(
  Object.keys(googleFields).length === 1,
  "GOOGLE_CONTRACT_FRAGMENT_EXACT_ONE_FIELD",
);

requireCondition(
  !hasOwn(
    naverFields,
    "execution_contract",
  ),
  "NAVER_EXECUTION_CONTRACT_KEY_ABSENT",
);

requireCondition(
  Object.keys(naverFields).length === 0,
  "NAVER_CONTRACT_FRAGMENT_EMPTY",
);

requireCondition(
  !hasOwn(
    metaFields,
    "execution_contract",
  ),
  "META_EXECUTION_CONTRACT_KEY_ABSENT",
);

requireCondition(
  Object.keys(metaFields).length === 0,
  "META_CONTRACT_FRAGMENT_EMPTY",
);

if (process.exitCode) {
  throw new Error(
    "GOOGLE_ADS_PENDING_JOB_EXECUTION_CONTRACT_FIXTURE_FAILED",
  );
}

console.log("");
console.log(
  "GOOGLE_ADS_PENDING_JOB_EXECUTION_CONTRACT_FIXTURE=PASS",
);
console.log(
  "DB_QUERY_BY_FIXTURE=NO",
);
console.log(
  "GOOGLE_API_CALL_BY_FIXTURE=NO",
);
