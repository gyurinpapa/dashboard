import {
  getUnexpectedMediaConnectionsRouteError,
  mapMediaConnectionAccessRouteError,
  mapMediaConnectionRequestRouteError,
  mapMediaConnectionsRepositoryRouteError,
  type MediaConnectionsRouteErrorResponse,
} from "../src/lib/media-sync/media-connections-route-policy";

type TestCase = {
  name: string;
  run: () => void;
};

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

function assertRouteError(
  actual: MediaConnectionsRouteErrorResponse,
  expectedStatus: number,
  expectedError: string,
  fixtureName: string,
): void {
  assertEqual(
    actual.status,
    expectedStatus,
    `${fixtureName}: HTTP status mismatch.`,
  );

  assertEqual(
    actual.error,
    expectedError,
    `${fixtureName}: error code mismatch.`,
  );
}

const accessErrorTests: readonly TestCase[] = [
  {
    name: "unauthenticated request maps to 401 UNAUTHORIZED",
    run: () => {
      const result =
        mapMediaConnectionAccessRouteError({
          status: 401,
          code: "UNAUTHORIZED",
        });

      assertRouteError(
        result,
        401,
        "UNAUTHORIZED",
        "Unauthenticated request",
      );
    },
  },
  {
    name: "client view denial maps to 403",
    run: () => {
      const result =
        mapMediaConnectionAccessRouteError({
          status: 403,
          code: "CONNECTION_VIEW_ACCESS_DENIED",
        });

      assertRouteError(
        result,
        403,
        "CONNECTION_VIEW_ACCESS_DENIED",
        "Client view denial",
      );
    },
  },
  {
    name: "staff other advertiser denial maps to 403",
    run: () => {
      const result =
        mapMediaConnectionAccessRouteError({
          status: 403,
          code: "WORKSPACE_ACCESS_DENIED",
        });

      assertRouteError(
        result,
        403,
        "WORKSPACE_ACCESS_DENIED",
        "Staff other advertiser denial",
      );
    },
  },
  {
    name: "advertiser not found maps to 404",
    run: () => {
      const result =
        mapMediaConnectionAccessRouteError({
          status: 404,
          code: "ADVERTISER_NOT_FOUND",
        });

      assertRouteError(
        result,
        404,
        "ADVERTISER_NOT_FOUND",
        "Advertiser not found",
      );
    },
  },
  {
    name: "invalid access error status is safely reduced to 500",
    run: () => {
      const result =
        mapMediaConnectionAccessRouteError({
          status: 200,
          code: "UNAUTHORIZED",
        });

      assertRouteError(
        result,
        500,
        "UNAUTHORIZED",
        "Invalid access error status",
      );
    },
  },
];

const repositoryErrorTests: readonly TestCase[] = [
  {
    name: "repository database error maps to safe 500 code",
    run: () => {
      const result =
        mapMediaConnectionsRepositoryRouteError(
          "DATABASE_ERROR",
        );

      assertRouteError(
        result,
        500,
        "MEDIA_CONNECTION_DATABASE_ERROR",
        "Repository database error",
      );
    },
  },
  {
    name: "invalid database record maps to 500",
    run: () => {
      const result =
        mapMediaConnectionsRepositoryRouteError(
          "INVALID_RECORD",
        );

      assertRouteError(
        result,
        500,
        "INVALID_RECORD",
        "Invalid database record",
      );
    },
  },
  {
    name: "connection not found maps to 404",
    run: () => {
      const result =
        mapMediaConnectionsRepositoryRouteError(
          "CONNECTION_NOT_FOUND",
        );

      assertRouteError(
        result,
        404,
        "CONNECTION_NOT_FOUND",
        "Connection not found",
      );
    },
  },
];

const requestErrorTests: readonly TestCase[] = [
  {
    name: "unsafe response maps to safe 500 code",
    run: () => {
      const result =
        mapMediaConnectionRequestRouteError(
          "UNSAFE_RESPONSE",
        );

      assertRouteError(
        result,
        500,
        "UNSAFE_MEDIA_CONNECTION_RESPONSE",
        "Unsafe response",
      );
    },
  },
  {
    name: "invalid request input maps to 400",
    run: () => {
      const result =
        mapMediaConnectionRequestRouteError(
          "INVALID_INPUT",
        );

      assertRouteError(
        result,
        400,
        "INVALID_INPUT",
        "Invalid request input",
      );
    },
  },
];

const unexpectedErrorTests: readonly TestCase[] = [
  {
    name: "unexpected error maps to 500 INTERNAL_ERROR",
    run: () => {
      const result =
        getUnexpectedMediaConnectionsRouteError();

      assertRouteError(
        result,
        500,
        "INTERNAL_ERROR",
        "Unexpected error",
      );
    },
  },
];

function runTests(
  section: string,
  tests: readonly TestCase[],
): number {
  console.log("");
  console.log(section);

  let passed = 0;

  for (const test of tests) {
    test.run();
    passed += 1;

    console.log(`PASS: ${test.name}`);
  }

  return passed;
}

function main(): void {
  console.log(
    "Starting media connections GET route fixture verification.",
  );

  let passed = 0;

  passed += runTests(
    "Access error mapping",
    accessErrorTests,
  );

  passed += runTests(
    "Repository error mapping",
    repositoryErrorTests,
  );

  passed += runTests(
    "Request and safe response error mapping",
    requestErrorTests,
  );

  passed += runTests(
    "Unexpected error mapping",
    unexpectedErrorTests,
  );

  const total =
    accessErrorTests.length +
    repositoryErrorTests.length +
    requestErrorTests.length +
    unexpectedErrorTests.length;

  assertEqual(
    passed,
    total,
    "Not all GET route fixtures were executed.",
  );

  console.log("");
  console.log(
    `Media connections GET route verification passed: ${passed}/${total} fixtures.`,
  );

  console.log(
    "No database, user account, login session, credential, token, or environment variable was used.",
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "Media connections GET route verification failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
}