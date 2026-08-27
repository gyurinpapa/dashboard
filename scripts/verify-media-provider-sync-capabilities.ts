import {
  getMediaProviderSyncCapability,
} from "../src/lib/media-sync/media-provider-sync-capabilities";
import type {
  MediaProvider,
  MediaSyncDataLevel,
} from "../src/lib/media-sync/types";

type FixtureResult = {
  name: string;
  passed: boolean;
};

function assertTrue(value: unknown): void {
  if (value !== true) {
    throw new Error(
      "Fixture assertion failed.",
    );
  }
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

function assertCapability(input: {
  provider: MediaProvider;
  enabled: boolean;
  allowedDataLevels: readonly MediaSyncDataLevel[];
}): void {
  const capability =
    getMediaProviderSyncCapability(
      input.provider,
    );

  assertTrue(
    capability.syncRuntimeEnabled ===
      input.enabled,
  );

  assertTrue(
    JSON.stringify(
      capability.allowedDataLevels,
    ) ===
      JSON.stringify(
        input.allowedDataLevels,
      ),
  );
}

function main(): void {
  const results: FixtureResult[] = [];

  results.push(
    runFixture(
      "Naver runtime remains enabled for every existing data level",
      () => {
        assertCapability({
          provider: "naver_searchad",
          enabled: true,
          allowedDataLevels: [
            "keyword",
            "creative",
            "mixed",
            "unknown",
          ],
        });
      },
    ),
  );

  results.push(
    runFixture(
      "Google runtime is enabled with keyword-only production contract",
      () => {
        assertCapability({
          provider: "google_ads",
          enabled: true,
          allowedDataLevels: [
            "keyword",
          ],
        });
      },
    ),
  );

  results.push(
    runFixture(
      "Meta runtime stays disabled with no enabled data level",
      () => {
        assertCapability({
          provider: "meta_ads",
          enabled: false,
          allowedDataLevels: [],
        });
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
