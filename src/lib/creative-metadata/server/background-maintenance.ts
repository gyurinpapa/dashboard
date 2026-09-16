import { getSupabaseAdmin } from '../../supabase/admin';
import {
  ONLY_TRUE_MASTER_EMAIL,
  isMediaConnectionWorkspaceRole,
  resolveMediaConnectionPermissions,
  resolveTrueMasterStatus,
  type MediaConnectionWorkspaceRole,
} from '../../media-sync/media-connection-access-policy';
import { decryptNaverSearchAdsCredentials } from '../../media-sync/connection-credentials';
import { decryptGoogleAdsCredentials } from '../../media-sync/google-ads-credentials';
import { readGoogleAdsOAuthConfig } from '../../media-sync/google-ads-oauth-config';
import { GOOGLE_ADS_API_VERSION } from '../../media-sync/google-ads-account-verification';
import { identityForRow, record } from '../contract';
import { runCachedServerMetadata } from '../cache/coordinator';
import type { CachedResult } from '../cache/coordinator';
import type { Scope } from '../contract';
import type { Access, Ports } from './service';
import { createReadOnlyDatabasePorts } from './database';
import type { DatabaseDependencies, ReadQuery } from './database';
import { createSupabaseDueCacheStore } from './background-cache-store';
import { fail } from './http';

const MAX_DISCOVERY_ROWS = 200;
const MAX_TARGETS = 20;

type SupportedProvider = Scope['provider'];

type MaintenancePageInput = Readonly<{
  reportId: string;
  connectionId: string;
  sourceJobId?: string;
  afterRowIndex?: number;
  refreshAheadMs: number;
  signal?: AbortSignal;
}>;

export type CreativeMetadataMaintenancePageResult = Readonly<{
  status: 'no_targets' | 'completed';
  reportId: string;
  connectionId: string;
  provider: SupportedProvider;
  ingestionId: string;
  actorUserId: string;
  selectedTargets: number;
  lastRowIndex: number;
  hasMoreRows: boolean;
  cacheResult: CachedResult | null;
}>;

function requiredText(value: unknown): string {
  if (typeof value !== 'string') fail('INVALID_CONTEXT');
  const text = value.trim();
  if (!text) fail('INVALID_CONTEXT');
  return text;
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function validAfterRowIndex(value: unknown): number {
  if (value === undefined) return -1;
  if (!Number.isSafeInteger(value) || Number(value) < -1 || Number(value) > 2147483647) {
    fail('INVALID_INPUT');
  }
  return Number(value);
}

async function resolveBackgroundAccess(input: {
  reportId: string;
  actorUserId: string;
  workspaceId: string;
  advertiserId: string;
}): Promise<Access> {
  const sb = getSupabaseAdmin();

  const [{ data: profile, error: profileError }, { data: advertiser, error: advertiserError }] =
    await Promise.all([
      sb.from('profiles').select('id,email').eq('id', input.actorUserId).maybeSingle(),
      sb
        .from('advertisers')
        .select('id,workspace_id,created_by')
        .eq('id', input.advertiserId)
        .eq('workspace_id', input.workspaceId)
        .maybeSingle(),
    ]);

  if (profileError || advertiserError || !advertiser) fail('ACCESS_DENIED');
  if (profile && requiredText(profile.id) !== input.actorUserId) fail('ACCESS_DENIED');

  const advertiserId = requiredText(advertiser.id);
  const workspaceId = requiredText(advertiser.workspace_id);
  if (advertiserId !== input.advertiserId || workspaceId !== input.workspaceId) fail('SCOPE_MISMATCH');

  const advertiserCreatedBy =
    advertiser.created_by === null ? null : requiredText(advertiser.created_by);
  const email = normalizeEmail(profile?.email);

  const { data: masterMemberships, error: masterMembershipError } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', input.actorUserId)
    .eq('role', 'master')
    .limit(1);

  if (masterMembershipError) fail('ACCESS_DENIED');

  const isTrueMaster = resolveTrueMasterStatus({
    email,
    hasMasterMembership:
      email === ONLY_TRUE_MASTER_EMAIL &&
      Array.isArray(masterMemberships) &&
      masterMemberships.length > 0,
  });

  let role: MediaConnectionWorkspaceRole = 'master';

  if (!isTrueMaster) {
    const { data: membership, error: membershipError } = await sb
      .from('workspace_members')
      .select('workspace_id,user_id,role')
      .eq('workspace_id', input.workspaceId)
      .eq('user_id', input.actorUserId)
      .maybeSingle();

    if (membershipError || !membership) fail('ACCESS_DENIED');
    if (
      requiredText(membership.workspace_id) !== input.workspaceId ||
      requiredText(membership.user_id) !== input.actorUserId ||
      !isMediaConnectionWorkspaceRole(membership.role)
    ) {
      fail('ACCESS_DENIED');
    }

    role = membership.role;
  }

  const permissions = resolveMediaConnectionPermissions({
    role,
    isTrueMaster,
    isOwnAdvertiser: advertiserCreatedBy === input.actorUserId,
  });

  if (!permissions.canRunSync) fail('ACCESS_DENIED');

  return Object.freeze({
    reportId: input.reportId,
    userId: input.actorUserId,
    workspaceId: input.workspaceId,
    advertiserId: input.advertiserId,
    advertiserCreatedBy,
    role,
    isTrueMaster,
    canRunSync: true,
  });
}

async function loadMaintenanceScope(input: MaintenancePageInput) {
  const sb = getSupabaseAdmin();
  const afterRowIndex = validAfterRowIndex(input.afterRowIndex);

  const { data: report, error: reportError } = await sb
    .from('reports')
    .select('id,workspace_id,advertiser_id,created_by,current_ingestion_id,meta')
    .eq('id', input.reportId)
    .maybeSingle();

  if (reportError || !report) fail('INVALID_CONTEXT');

  const reportId = requiredText(report.id);
  const workspaceId = requiredText(report.workspace_id);
  const advertiserId = requiredText(report.advertiser_id);
  const ingestionId = requiredText(report.current_ingestion_id);
  const dataSource = record(record(report.meta).data_source);
  if (
    reportId !== input.reportId ||
    String(dataSource.kind ?? '').trim().toLowerCase() !== 'api'
  ) {
    fail('INVALID_CONTEXT');
  }

  const { data: ingestion, error: ingestionError } = await sb
    .from('report_ingestions')
    .select('id')
    .eq('id', ingestionId)
    .eq('workspace_id', workspaceId)
    .eq('report_id', reportId)
    .eq('kind', 'api')
    .eq('status', 'success')
    .maybeSingle();

  if (ingestionError || !ingestion || requiredText(ingestion.id) !== ingestionId) {
    fail('STALE_CONTEXT');
  }

  let actorUserId = requiredText(report.created_by);

  if (input.sourceJobId !== undefined) {
    const { data: job, error: jobError } = await sb
      .from('media_sync_jobs')
      .select('id,report_id,workspace_id,advertiser_id,connection_id,status,created_by')
      .eq('id', input.sourceJobId)
      .maybeSingle();

    if (
      jobError ||
      !job ||
      requiredText(job.id) !== input.sourceJobId ||
      requiredText(job.report_id) !== reportId ||
      requiredText(job.workspace_id) !== workspaceId ||
      requiredText(job.advertiser_id) !== advertiserId ||
      requiredText(job.connection_id) !== input.connectionId ||
      job.status !== 'done'
    ) {
      fail('STALE_CONTEXT');
    }

    actorUserId = requiredText(job.created_by);
  }

  const { data: mapping, error: mappingError } = await sb
    .from('report_media_connections')
    .select('connection_id')
    .eq('report_id', reportId)
    .eq('workspace_id', workspaceId)
    .eq('advertiser_id', advertiserId)
    .eq('connection_id', input.connectionId)
    .maybeSingle();

  if (
    mappingError ||
    !mapping ||
    requiredText(mapping.connection_id) !== input.connectionId
  ) {
    fail('ACCESS_DENIED');
  }

  const { data: connection, error: connectionError } = await sb
    .from('media_connections')
    .select('id,workspace_id,advertiser_id,provider,external_account_id,status,credential_version')
    .eq('id', input.connectionId)
    .eq('workspace_id', workspaceId)
    .eq('advertiser_id', advertiserId)
    .maybeSingle();

  if (
    connectionError ||
    !connection ||
    connection.status !== 'active' ||
    connection.credential_version !== 1
  ) {
    fail('INVALID_CONTEXT');
  }

  const provider = connection.provider;
  if (provider !== 'naver_searchad' && provider !== 'google_ads') {
    fail('INVALID_CONTEXT');
  }

  const externalAccountId = requiredText(connection.external_account_id);
  if (
    !(provider === 'google_ads'
      ? /^\d{10}$/.test(externalAccountId)
      : /^\d{1,20}$/.test(externalAccountId))
  ) {
    fail('INVALID_CONTEXT');
  }

  const access = await resolveBackgroundAccess({
    reportId,
    actorUserId,
    workspaceId,
    advertiserId,
  });

  return {
    sb,
    reportId,
    workspaceId,
    advertiserId,
    ingestionId,
    actorUserId,
    connectionId: input.connectionId,
    provider,
    externalAccountId,
    access,
    afterRowIndex,
  } as const;
}

async function discoverTargets(
  scope: Awaited<ReturnType<typeof loadMaintenanceScope>>,
  signal?: AbortSignal,
) {
  if (signal?.aborted) fail('ABORTED');

  let query = scope.sb
    .from('report_rows')
    .select('row_index,row')
    .eq('report_id', scope.reportId)
    .eq('workspace_id', scope.workspaceId)
    .eq('advertiser_id', scope.advertiserId)
    .eq('ingestion_id', scope.ingestionId)
    .eq('row->>provider', scope.provider)
    .eq('row->>external_account_id', scope.externalAccountId)
    .eq('row->>row_level', 'creative')
    .eq('row->provider_meta->>entity_type', 'ad')
    .gt('row_index', scope.afterRowIndex)
    .order('row_index', { ascending: true })
    .limit(MAX_DISCOVERY_ROWS + 1);

  if (scope.provider === 'naver_searchad') {
    query = query.eq('row->provider_meta->>campaign_type', 'WEB_SITE');
  }

  const response = signal ? await query.abortSignal(signal) : await query;
  if (signal?.aborted) fail('ABORTED');
  if (response.error || !Array.isArray(response.data)) fail('DEPENDENCY_ERROR');

  const rows = response.data.slice(0, MAX_DISCOVERY_ROWS);
  const identities = new Map<string, string>();
  let lastRowIndex = scope.afterRowIndex;

  for (const item of rows) {
    const rowIndex = Number(item.row_index);
    if (!Number.isSafeInteger(rowIndex) || rowIndex <= lastRowIndex) {
      fail('INVALID_CONTEXT');
    }
    lastRowIndex = rowIndex;

    const identity = identityForRow(
      {
        workspaceId: scope.workspaceId,
        advertiserId: scope.advertiserId,
        provider: scope.provider,
        externalAccountId: scope.externalAccountId,
      },
      item.row,
    );

    if (!identity || identity.entityType !== 'ad') continue;
    identities.set(identity.entityId, identity.entityId);
    if (identities.size >= MAX_TARGETS) break;
  }

  return {
    entityIds: Object.freeze([...identities.values()]),
    lastRowIndex,
    hasMoreRows:
      response.data.length > MAX_DISCOVERY_ROWS ||
      rows.some((item) => Number(item.row_index) > lastRowIndex),
  } as const;
}

function createBackgroundReader(
  client: ReturnType<typeof getSupabaseAdmin>,
  entityIds: readonly string[],
): DatabaseDependencies['read'] {
  if (
    !entityIds.length ||
    entityIds.length > MAX_TARGETS ||
    new Set(entityIds).size !== entityIds.length
  ) {
    fail('INVALID_INPUT');
  }

  return async (
    query: ReadQuery,
    signal: AbortSignal,
  ) => {
    if (signal.aborted) fail('ABORTED');

    if (query.table === 'report_rows') {
      const rows: Record<string, unknown>[] = [];

      for (const id of entityIds) {
        let builder = client
          .from(query.table)
          .select(query.columns);

        for (const [key, value] of Object.entries(query.equals)) {
          builder = builder.eq(key, value);
        }

        builder = builder.eq(
          'row->>external_creative_id',
          id,
        );

        if (query.order) {
          builder = builder.order(
            query.order,
            { ascending: true },
          );
        }

        const { data, error } = await builder
          .limit(1)
          .abortSignal(signal);

        if (signal.aborted) fail('ABORTED');
        if (error || !Array.isArray(data)) {
          fail('DEPENDENCY_ERROR');
        }

        rows.push(
          ...(data as unknown as Record<string, unknown>[]),
        );
      }

      return rows.sort(
        (a, b) =>
          Number(a.row_index) -
          Number(b.row_index),
      );
    }

    let builder = client
      .from(query.table)
      .select(query.columns);

    for (const [key, value] of Object.entries(query.equals)) {
      builder = builder.eq(key, value);
    }

    if (query.order) {
      builder = builder.order(
        query.order,
        { ascending: true },
      );
    }

    const { data, error } = await builder
      .limit(query.limit)
      .abortSignal(signal);

    if (signal.aborted) fail('ABORTED');
    if (error || !Array.isArray(data)) {
      fail('DEPENDENCY_ERROR');
    }

    return data;
  };
}

function createBackgroundPorts(
  scope: Awaited<ReturnType<typeof loadMaintenanceScope>>,
  entityIds: readonly string[],
): Ports {
  const request = new Request('http://creative-metadata-maintenance.invalid/');

  return createReadOnlyDatabasePorts(request, {
    authorize: async ({ reportId, action }) => {
      if (reportId !== scope.reportId || action !== 'run_sync') {
        fail('ACCESS_DENIED');
      }
      return scope.access;
    },
    read: createBackgroundReader(scope.sb, entityIds),
    googleConfig: () => readGoogleAdsOAuthConfig(),
    decryptNaver: decryptNaverSearchAdsCredentials,
    decryptGoogle: decryptGoogleAdsCredentials,
    fetch: (url, init) => fetch(url, init),
  });
}

export async function runCreativeMetadataMaintenancePage(
  input: MaintenancePageInput,
): Promise<CreativeMetadataMaintenancePageResult> {
  if (GOOGLE_ADS_API_VERSION !== 'v25') fail('INVALID_CONTEXT');

  const scope = await loadMaintenanceScope(input);
  const discovered = await discoverTargets(scope, input.signal);

  if (!discovered.entityIds.length) {
    return Object.freeze({
      status: 'no_targets',
      reportId: scope.reportId,
      connectionId: scope.connectionId,
      provider: scope.provider,
      ingestionId: scope.ingestionId,
      actorUserId: scope.actorUserId,
      selectedTargets: 0,
      lastRowIndex: discovered.lastRowIndex,
      hasMoreRows: discovered.hasMoreRows,
      cacheResult: null,
    });
  }

  const maxHttpRequests = Math.min(
    40,
    scope.provider === 'naver_searchad'
      ? discovered.entityIds.length
      : 1 + 2 * discovered.entityIds.length,
  );

  const result = await runCachedServerMetadata(
    {
      enabled: true,
      reportId: scope.reportId,
      connectionId: scope.connectionId,
      maxHttpRequests,
      requestTimeoutMs: 3000,
      totalTimeoutMs: 30000,
      signal: input.signal,
    },
    createBackgroundPorts(scope, discovered.entityIds),
    createSupabaseDueCacheStore(scope.sb, input.refreshAheadMs),
  );

  return Object.freeze({
    status: 'completed',
    reportId: scope.reportId,
    connectionId: scope.connectionId,
    provider: scope.provider,
    ingestionId: scope.ingestionId,
    actorUserId: scope.actorUserId,
    selectedTargets: discovered.entityIds.length,
    lastRowIndex: discovered.lastRowIndex,
    hasMoreRows: discovered.hasMoreRows,
    cacheResult: result,
  });
}
