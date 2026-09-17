import { getSupabaseAdmin } from '../../supabase/admin';
import {
  runCreativeMetadataMaintenancePage,
  type CreativeMetadataMaintenancePageResult,
} from './background-maintenance';

const MAX_REPORTS = 20;
const MAX_MAPPINGS = 40;
const MAX_PAGES_PER_SCOPE = 10;

type PeriodicCandidate = Readonly<{
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  connectionId: string;
}>;

export type CreativeMetadataPeriodicMaintenanceSummary = Readonly<{
  scopes: number;
  pagesVisited: number;
  cacheOnlyPages: number;
  providerBatches: number;
  providerHttpRequests: number;
  readyScopes: number;
  stoppedScopes: number;
}>;

type PeriodicMaintenanceDependencies = Readonly<{
  listCandidates?: () => Promise<readonly PeriodicCandidate[]>;
  runPage?: (
    input: Readonly<{
      reportId: string;
      connectionId: string;
      afterRowIndex?: number;
      refreshAheadMs: number;
      signal?: AbortSignal;
    }>,
  ) => Promise<CreativeMetadataMaintenancePageResult>;
}>;

function requiredText(
  value: unknown,
  field: string,
): string {
  const normalized =
    typeof value === 'string'
      ? value.trim()
      : '';

  if (!normalized) {
    throw new Error(
      `Creative metadata periodic maintenance ${field} is invalid.`,
    );
  }

  return normalized;
}

async function defaultListCandidates():
  Promise<readonly PeriodicCandidate[]> {
  const sb =
    getSupabaseAdmin();

  const {
    data: reports,
    error: reportsError,
  } = await sb
    .from('reports')
    .select(
      'id,workspace_id,advertiser_id,current_ingestion_id,meta',
    )
    .in(
      'status',
      [
        'draft',
        'ready',
      ],
    )
    .contains(
      'meta',
      {
        data_source: {
          kind: 'api',
        },
      },
    )
    .not(
      'current_ingestion_id',
      'is',
      null,
    )
    .order(
      'id',
      {
        ascending: true,
      },
    )
    .limit(
      MAX_REPORTS + 1,
    );

  if (
    reportsError ||
    !Array.isArray(
      reports,
    )
  ) {
    throw new Error(
      'Creative metadata periodic report discovery failed.',
    );
  }

  if (
    reports.length >
      MAX_REPORTS
  ) {
    throw new Error(
      'Creative metadata periodic report scope exceeded the bounded limit.',
    );
  }

  if (
    reports.length ===
      0
  ) {
    return Object.freeze([]);
  }

  const reportScopes =
    new Map<
      string,
      Readonly<{
        workspaceId: string;
        advertiserId: string;
      }>
    >();

  for (
    const report
    of reports
  ) {
    const reportId =
      requiredText(
        report.id,
        'report.id',
      );

    if (
      reportScopes.has(
        reportId,
      )
    ) {
      throw new Error(
        'Creative metadata periodic report identity is duplicated.',
      );
    }

    reportScopes.set(
      reportId,
      Object.freeze({
        workspaceId:
          requiredText(
            report.workspace_id,
            'report.workspace_id',
          ),
        advertiserId:
          requiredText(
            report.advertiser_id,
            'report.advertiser_id',
          ),
      }),
    );
  }

  const {
    data: mappings,
    error: mappingsError,
  } = await sb
    .from(
      'report_media_connections',
    )
    .select(
      'report_id,workspace_id,advertiser_id,connection_id',
    )
    .in(
      'report_id',
      [
        ...reportScopes.keys(),
      ],
    )
    .order(
      'report_id',
      {
        ascending:
          true,
      },
    )
    .order(
      'connection_id',
      {
        ascending:
          true,
      },
    )
    .limit(
      MAX_MAPPINGS + 1,
    );

  if (
    mappingsError ||
    !Array.isArray(
      mappings,
    )
  ) {
    throw new Error(
      'Creative metadata periodic mapping discovery failed.',
    );
  }

  if (
    mappings.length >
      MAX_MAPPINGS
  ) {
    throw new Error(
      'Creative metadata periodic mapping scope exceeded the bounded limit.',
    );
  }

  const candidates:
    PeriodicCandidate[] =
      [];

  const seen =
    new Set<string>();

  for (
    const mapping
    of mappings
  ) {
    const reportId =
      requiredText(
        mapping.report_id,
        'mapping.report_id',
      );

    const scope =
      reportScopes.get(
        reportId,
      );

    if (
      !scope
    ) {
      throw new Error(
        'Creative metadata periodic mapping escaped the report scope.',
      );
    }

    const workspaceId =
      requiredText(
        mapping.workspace_id,
        'mapping.workspace_id',
      );

    const advertiserId =
      requiredText(
        mapping.advertiser_id,
        'mapping.advertiser_id',
      );

    if (
      workspaceId !==
        scope.workspaceId ||
      advertiserId !==
        scope.advertiserId
    ) {
      throw new Error(
        'Creative metadata periodic mapping scope mismatch.',
      );
    }

    const connectionId =
      requiredText(
        mapping.connection_id,
        'mapping.connection_id',
      );

    const key =
      `${reportId}:${connectionId}`;

    if (
      seen.has(
        key,
      )
    ) {
      throw new Error(
        'Creative metadata periodic candidate is duplicated.',
      );
    }

    seen.add(
      key,
    );

    candidates.push(
      Object.freeze({
        reportId,
        workspaceId,
        advertiserId,
        connectionId,
      }),
    );
  }

  return Object.freeze(
    candidates,
  );
}

function canAdvanceCacheOnlyPage(
  page: CreativeMetadataMaintenancePageResult,
  previousRowIndex: number,
): boolean {
  return (
    page.status ===
      'completed' &&
    page.cacheResult !==
      null &&
    page.cacheResult.status ===
      'ready' &&
    page.cacheResult.counts
      .totalHttpRequests ===
      0 &&
    page.hasMoreRows ===
      true &&
    page.lastRowIndex >
      previousRowIndex
  );
}

export async function runCreativeMetadataPeriodicMaintenance(
  input: Readonly<{
    refreshAheadMs: number;
    signal?: AbortSignal;
    dependencies?: PeriodicMaintenanceDependencies;
  }>,
): Promise<CreativeMetadataPeriodicMaintenanceSummary> {
  if (
    !Number.isSafeInteger(
      input.refreshAheadMs,
    ) ||
    input.refreshAheadMs <
      5 * 60 * 1000 ||
    input.refreshAheadMs >
      21_300_000
  ) {
    throw new Error(
      'Creative metadata periodic refreshAheadMs is invalid.',
    );
  }

  const listCandidates =
    input.dependencies
      ?.listCandidates ??
    defaultListCandidates;

  const runPage =
    input.dependencies
      ?.runPage ??
    runCreativeMetadataMaintenancePage;

  const candidates =
    await listCandidates();

  let pagesVisited =
    0;

  let cacheOnlyPages =
    0;

  let providerBatches =
    0;

  let providerHttpRequests =
    0;

  let readyScopes =
    0;

  let stoppedScopes =
    0;

  for (
    const candidate
    of candidates
  ) {
    if (
      input.signal
        ?.aborted
    ) {
      throw new Error(
        'Creative metadata periodic maintenance was aborted.',
      );
    }

    let afterRowIndex =
      -1;

    let scopeReady =
      false;

    for (
      let pageNumber =
        0;
      pageNumber <
        MAX_PAGES_PER_SCOPE;
      pageNumber +=
        1
    ) {
      const page =
        await runPage({
          reportId:
            candidate.reportId,
          connectionId:
            candidate.connectionId,
          afterRowIndex,
          refreshAheadMs:
            input.refreshAheadMs,
          signal:
            input.signal,
        });

      pagesVisited +=
        1;

      if (
        page.status ===
          'no_targets'
      ) {
        scopeReady =
          true;
        break;
      }

      const cacheResult =
        page.cacheResult;

      if (
        cacheResult ===
          null
      ) {
        stoppedScopes +=
          1;
        break;
      }

      const httpRequests =
        cacheResult.counts
          .totalHttpRequests;

      if (
        !Number.isSafeInteger(
          httpRequests,
        ) ||
        httpRequests <
          0
      ) {
        throw new Error(
          'Creative metadata periodic provider request count is invalid.',
        );
      }

      providerHttpRequests +=
        httpRequests;

      if (
        httpRequests >
          0
      ) {
        providerBatches +=
          1;

        if (
          cacheResult.status ===
            'ready' &&
          page.hasMoreRows ===
            false
        ) {
          scopeReady =
            true;
        } else {
          stoppedScopes +=
            1;
        }

        break;
      }

      if (
        page.hasMoreRows ===
          false &&
        cacheResult.status ===
          'ready'
      ) {
        cacheOnlyPages +=
          1;
        scopeReady =
          true;
        break;
      }

      if (
        canAdvanceCacheOnlyPage(
          page,
          afterRowIndex,
        )
      ) {
        cacheOnlyPages +=
          1;
        afterRowIndex =
          page.lastRowIndex;
        continue;
      }

      stoppedScopes +=
        1;
      break;
    }

    if (
      scopeReady
    ) {
      readyScopes +=
        1;
    }
  }

  return Object.freeze({
    scopes:
      candidates.length,
    pagesVisited,
    cacheOnlyPages,
    providerBatches,
    providerHttpRequests,
    readyScopes,
    stoppedScopes,
  });
}
