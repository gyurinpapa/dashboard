import {
  getMediaConnectionActionDenialCode,
  getReportAdvertiserScopeMismatch,
  ONLY_TRUE_MASTER_EMAIL,
  resolveMediaConnectionPermissions,
  resolveTrueMasterStatus,
  type MediaConnectionAccessAction,
  type MediaConnectionActionDenialCode,
  type MediaConnectionPermissionFlags,
  type MediaConnectionWorkspaceRole,
} from "../src/lib/media-sync/media-connection-access-policy";

type PermissionExpectation = {
  view_connections: boolean;
  manage_connections: boolean;
  run_sync: boolean;
};

type PermissionFixture = {
  name: string;
  role: MediaConnectionWorkspaceRole;
  isTrueMaster: boolean;
  userId: string;
  advertiserCreatedBy: string | null;
  expected: PermissionExpectation;
  expectedScope:
    | "true_master"
    | "workspace"
    | "own_created";
};

type TestCase = {
  name: string;
  run: () => void;
};

const FIXTURE_USER_ID = "fixture-user";
const OTHER_FIXTURE_USER_ID = "fixture-other-user";

const ACTIONS: readonly MediaConnectionAccessAction[] = [
  "view_connections",
  "manage_connections",
  "run_sync",
];

function fail(message: string): never {
  throw new Error(message);
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    fail(
      [
        message,
        `Expected: ${String(expected)}`,
        `Actual: ${String(actual)}`,
      ].join("\n"),
    );
  }
}

function assertNull(
  actual: unknown,
  message: string,
): void {
  if (actual !== null) {
    fail(
      [
        message,
        "Expected: null",
        `Actual: ${String(actual)}`,
      ].join("\n"),
    );
  }
}

function assertPermissionFlags(
  actual: MediaConnectionPermissionFlags,
  expected: PermissionExpectation,
  expectedScope:
    | "true_master"
    | "workspace"
    | "own_created",
  fixtureName: string,
): void {
  assertEqual(
    actual.canViewConnections,
    expected.view_connections,
    `${fixtureName}: view_connections result mismatch.`,
  );

  assertEqual(
    actual.canManageConnections,
    expected.manage_connections,
    `${fixtureName}: manage_connections result mismatch.`,
  );

  assertEqual(
    actual.canRunSync,
    expected.run_sync,
    `${fixtureName}: run_sync result mismatch.`,
  );

  assertEqual(
    actual.accessScope,
    expectedScope,
    `${fixtureName}: accessScope result mismatch.`,
  );
}

function expectedDenialCode(
  action: MediaConnectionAccessAction,
  allowed: boolean,
): MediaConnectionActionDenialCode | null {
  if (allowed) {
    return null;
  }

  if (action === "view_connections") {
    return "CONNECTION_VIEW_ACCESS_DENIED";
  }

  if (action === "manage_connections") {
    return "CONNECTION_MANAGE_ACCESS_DENIED";
  }

  return "MEDIA_SYNC_ACCESS_DENIED";
}

function verifyActionMatrix(
  permissions: MediaConnectionPermissionFlags,
  expected: PermissionExpectation,
  fixtureName: string,
): void {
  const expectedByAction: Record<
    MediaConnectionAccessAction,
    boolean
  > = {
    view_connections: expected.view_connections,
    manage_connections: expected.manage_connections,
    run_sync: expected.run_sync,
  };

  for (const action of ACTIONS) {
    const denialCode =
      getMediaConnectionActionDenialCode(
        action,
        permissions,
      );

    assertEqual(
      denialCode,
      expectedDenialCode(
        action,
        expectedByAction[action],
      ),
      `${fixtureName}: ${action} denial code mismatch.`,
    );
  }
}

function runPermissionFixture(
  fixture: PermissionFixture,
): void {
  const isOwnAdvertiser =
    fixture.advertiserCreatedBy === fixture.userId;

  const permissions =
    resolveMediaConnectionPermissions({
      role: fixture.role,
      isTrueMaster: fixture.isTrueMaster,
      isOwnAdvertiser,
    });

  assertPermissionFlags(
    permissions,
    fixture.expected,
    fixture.expectedScope,
    fixture.name,
  );

  verifyActionMatrix(
    permissions,
    fixture.expected,
    fixture.name,
  );
}

const permissionFixtures: readonly PermissionFixture[] = [
  {
    name: "true master allows all actions",
    role: "master",
    isTrueMaster: true,
    userId: FIXTURE_USER_ID,
    advertiserCreatedBy: OTHER_FIXTURE_USER_ID,
    expected: {
      view_connections: true,
      manage_connections: true,
      run_sync: true,
    },
    expectedScope: "true_master",
  },
  {
    name: "director allows all actions",
    role: "director",
    isTrueMaster: false,
    userId: FIXTURE_USER_ID,
    advertiserCreatedBy: OTHER_FIXTURE_USER_ID,
    expected: {
      view_connections: true,
      manage_connections: true,
      run_sync: true,
    },
    expectedScope: "workspace",
  },
  {
    name: "admin allows all actions",
    role: "admin",
    isTrueMaster: false,
    userId: FIXTURE_USER_ID,
    advertiserCreatedBy: OTHER_FIXTURE_USER_ID,
    expected: {
      view_connections: true,
      manage_connections: true,
      run_sync: true,
    },
    expectedScope: "workspace",
  },
  {
    name: "staff with exactly matching creator can view and sync",
    role: "staff",
    isTrueMaster: false,
    userId: FIXTURE_USER_ID,
    advertiserCreatedBy: FIXTURE_USER_ID,
    expected: {
      view_connections: true,
      manage_connections: false,
      run_sync: true,
    },
    expectedScope: "own_created",
  },
  {
    name: "staff with different creator is denied all actions",
    role: "staff",
    isTrueMaster: false,
    userId: FIXTURE_USER_ID,
    advertiserCreatedBy: OTHER_FIXTURE_USER_ID,
    expected: {
      view_connections: false,
      manage_connections: false,
      run_sync: false,
    },
    expectedScope: "workspace",
  },
  {
    name: "staff with null creator is denied all actions",
    role: "staff",
    isTrueMaster: false,
    userId: FIXTURE_USER_ID,
    advertiserCreatedBy: null,
    expected: {
      view_connections: false,
      manage_connections: false,
      run_sync: false,
    },
    expectedScope: "workspace",
  },
  {
    name: "staff creator comparison is case-sensitive and exact",
    role: "staff",
    isTrueMaster: false,
    userId: "fixture-user",
    advertiserCreatedBy: "Fixture-User",
    expected: {
      view_connections: false,
      manage_connections: false,
      run_sync: false,
    },
    expectedScope: "workspace",
  },
  {
    name: "client is denied all actions",
    role: "client",
    isTrueMaster: false,
    userId: FIXTURE_USER_ID,
    advertiserCreatedBy: FIXTURE_USER_ID,
    expected: {
      view_connections: false,
      manage_connections: false,
      run_sync: false,
    },
    expectedScope: "workspace",
  },
  {
    name: "non-true-master master role is denied all actions",
    role: "master",
    isTrueMaster: false,
    userId: FIXTURE_USER_ID,
    advertiserCreatedBy: FIXTURE_USER_ID,
    expected: {
      view_connections: false,
      manage_connections: false,
      run_sync: false,
    },
    expectedScope: "workspace",
  },
];

const identityTests: readonly TestCase[] = [
  {
    name: "designated email plus master membership is true master",
    run: () => {
      const result = resolveTrueMasterStatus({
        email: ONLY_TRUE_MASTER_EMAIL,
        hasMasterMembership: true,
        isPlatformOwner: false,
      });

      assertEqual(
        result,
        true,
        "Designated email with master membership must be true master.",
      );
    },
  },
  {
    name: "true master email comparison normalizes case and whitespace",
    run: () => {
      const result = resolveTrueMasterStatus({
        email: `  ${ONLY_TRUE_MASTER_EMAIL.toUpperCase()}  `,
        hasMasterMembership: true,
        isPlatformOwner: false,
      });

      assertEqual(
        result,
        true,
        "Normalized designated email with membership must be true master.",
      );
    },
  },
  {
    name: "master role identity with another email is not true master",
    run: () => {
      const result = resolveTrueMasterStatus({
        email: "fixture-master@example.invalid",
        hasMasterMembership: true,
        isPlatformOwner: false,
      });

      assertEqual(
        result,
        false,
        "Non-designated email must not be true master.",
      );
    },
  },
  {
    name: "designated email without master membership is not true master",
    run: () => {
      const result = resolveTrueMasterStatus({
        email: ONLY_TRUE_MASTER_EMAIL,
        hasMasterMembership: false,
        isPlatformOwner: false,
      });

      assertEqual(
        result,
        false,
        "Designated email without master membership must not be true master.",
      );
    },
  },
  {
    name: "platform owner alone is not true master",
    run: () => {
      const result = resolveTrueMasterStatus({
        email: "fixture-owner@example.invalid",
        hasMasterMembership: false,
        isPlatformOwner: true,
      });

      assertEqual(
        result,
        false,
        "Platform owner alone must not be true master.",
      );
    },
  },
  {
    name: "platform owner with designated email but no membership is not true master",
    run: () => {
      const result = resolveTrueMasterStatus({
        email: ONLY_TRUE_MASTER_EMAIL,
        hasMasterMembership: false,
        isPlatformOwner: true,
      });

      assertEqual(
        result,
        false,
        "Platform owner must not replace master membership.",
      );
    },
  },
  {
    name: "platform owner with master membership but another email is not true master",
    run: () => {
      const result = resolveTrueMasterStatus({
        email: "fixture-owner@example.invalid",
        hasMasterMembership: true,
        isPlatformOwner: true,
      });

      assertEqual(
        result,
        false,
        "Platform owner must not replace the designated email requirement.",
      );
    },
  },
];

const reportScopeTests: readonly TestCase[] = [
  {
    name: "matching report and advertiser scope is accepted",
    run: () => {
      const result =
        getReportAdvertiserScopeMismatch({
          reportAdvertiserId: "fixture-advertiser",
          reportWorkspaceId: "fixture-workspace",
          advertiserId: "fixture-advertiser",
          advertiserWorkspaceId: "fixture-workspace",
        });

      assertNull(
        result,
        "Matching report and advertiser scope must be accepted.",
      );
    },
  },
  {
    name: "report and advertiser id mismatch is blocked",
    run: () => {
      const result =
        getReportAdvertiserScopeMismatch({
          reportAdvertiserId:
            "fixture-report-advertiser",
          reportWorkspaceId: "fixture-workspace",
          advertiserId:
            "fixture-loaded-advertiser",
          advertiserWorkspaceId:
            "fixture-workspace",
        });

      assertEqual(
        result,
        "REPORT_ADVERTISER_MISMATCH",
        "Advertiser mismatch must be blocked.",
      );
    },
  },
  {
    name: "report and advertiser workspace mismatch is blocked",
    run: () => {
      const result =
        getReportAdvertiserScopeMismatch({
          reportAdvertiserId: "fixture-advertiser",
          reportWorkspaceId:
            "fixture-report-workspace",
          advertiserId: "fixture-advertiser",
          advertiserWorkspaceId:
            "fixture-advertiser-workspace",
        });

      assertEqual(
        result,
        "REPORT_WORKSPACE_MISMATCH",
        "Workspace mismatch must be blocked.",
      );
    },
  },
  {
    name: "advertiser mismatch takes precedence when both values mismatch",
    run: () => {
      const result =
        getReportAdvertiserScopeMismatch({
          reportAdvertiserId:
            "fixture-report-advertiser",
          reportWorkspaceId:
            "fixture-report-workspace",
          advertiserId:
            "fixture-loaded-advertiser",
          advertiserWorkspaceId:
            "fixture-loaded-workspace",
        });

      assertEqual(
        result,
        "REPORT_ADVERTISER_MISMATCH",
        "Advertiser mismatch must be detected before workspace mismatch.",
      );
    },
  },
];

function runNamedTests(
  tests: readonly TestCase[],
): number {
  let passed = 0;

  for (const test of tests) {
    test.run();
    passed += 1;

    console.log(`PASS: ${test.name}`);
  }

  return passed;
}

function main(): void {
  let passed = 0;

  console.log(
    "Starting media connection access fixture verification.",
  );

  console.log("");
  console.log("Permission matrix");

  for (const fixture of permissionFixtures) {
    runPermissionFixture(fixture);
    passed += 1;

    console.log(`PASS: ${fixture.name}`);
  }

  console.log("");
  console.log("True master identity policy");

  passed += runNamedTests(identityTests);

  console.log("");
  console.log("Report and advertiser scope policy");

  passed += runNamedTests(reportScopeTests);

  const total =
    permissionFixtures.length +
    identityTests.length +
    reportScopeTests.length;

  assertEqual(
    passed,
    total,
    "Not all fixture tests were executed.",
  );

  console.log("");
  console.log(
    `Media connection access verification passed: ${passed}/${total} fixtures.`,
  );
  console.log(
    "No database, login session, credential, token, or environment variable was used.",
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "Media connection access verification failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
}