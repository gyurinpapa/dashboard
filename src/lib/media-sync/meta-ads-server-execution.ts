import { decryptMetaAdsCredentials, normalizeMetaAdsCredentialContext } from "./meta-ads-credentials";
import { resolveMetaAdsAccountPolicy } from "./meta-ads-account-policy";
import { readMetaAdsAccountMetadata } from "./meta-ads-account-preflight";
import { collectMetaAdsAdDailyInsightsPage, type MetaAdsInsightsOptions } from "./meta-ads-ad-daily-insights-collector";
import { createMetaAdsPageCheckpointRepository, META_PAGE_RPC, type MetaPageRpc } from "./meta-ads-page-checkpoint-repository";
import { createMetaPageScope, freezeMetaPage } from "./meta-ads-page-checkpoint-contract";
import { runMetaAdsStagingOrchestrator } from "./meta-ads-staging-orchestrator";
import { createMetaMaterializationHandoffRepository, META_HANDOFF_RPC } from "./meta-ads-materialization-handoff-repository";
import { createMetaCompletionClaimRepository, META_COMPLETION_RPC } from "./meta-ads-completion-claim-repository";
import type { MetaCompletionTarget } from "./meta-ads-completion-claim-contract";
import type { MediaConnectionRecord, MediaSyncJobRecord } from "./types";

export type MetaAdsServerExecutionInput = Readonly<{
  originalJob: MediaSyncJobRecord; connection: MediaConnectionRecord; policy: unknown;
  targetReportIds: readonly string[]; collectorOptions?: MetaAdsInsightsOptions;
}>;
export type MetaAdsServerExecutionDependencies = Readonly<{ invokeRpc: MetaPageRpc; fetchImpl: typeof fetch }>;
export class MetaAdsServerExecutionError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "MISSING_DEPENDENCY" | "INVALID_CONNECTION" | "INVALID_POLICY" |
    "INVALID_CREDENTIAL" | "INVALID_TARGETS" | "ACCOUNT_UNCONFIRMED" | "COLLECTION_UNCONFIRMED" | "MATERIALIZATION_UNCONFIRMED" | "COMPLETION_UNCONFIRMED") {
    super(`Meta server execution ${code}.`); this.name = "MetaAdsServerExecutionError";
  }
}
const RPCS = new Set<string>([...Object.values(META_PAGE_RPC), ...Object.values(META_HANDOFF_RPC), ...Object.values(META_COMPLETION_RPC)]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function check(ok: unknown, code: MetaAdsServerExecutionError["code"]): asserts ok {
  if (!ok) throw new MetaAdsServerExecutionError(code);
}

/** Server composition only; NOT registered with a route, worker or runtime gate.
 * Input must be loaded by a trusted authenticated server, never a client body.
 * Original claim and collected checkpoint are durable caller-owned receipts.
 * Each call processes one page, one materialization batch, or one fenced transition.
 * Both transports are mandatory: no live network/admin-client fallback exists.
 * Collection requires account metadata parity before any Insights or checkpoint IO.
 * The successful check is shared only within this instance; fresh instances recheck.
 * Later database-only phases continue from durable receipts without a Meta request.
 */
export function createMetaAdsServerExecution(input: MetaAdsServerExecutionInput, deps: MetaAdsServerExecutionDependencies) {
  let failure: MetaAdsServerExecutionError["code"] = "INVALID_INPUT";
  try {
    check(typeof window === "undefined" && input && typeof input === "object", failure);
    check(deps && typeof deps.invokeRpc === "function" && typeof deps.fetchImpl === "function", "MISSING_DEPENDENCY");
    const invokeRpc = deps.invokeRpc, fetchImpl = deps.fetchImpl;
    const originalJob = structuredClone(input.originalJob), c = input.connection;
    failure = "INVALID_CONNECTION";
    const credentialContext = normalizeMetaAdsCredentialContext({ connectionId: originalJob.connection_id,
      workspaceId: originalJob.workspace_id, advertiserId: originalJob.advertiser_id,
      provider: originalJob.provider as "meta_ads", externalAccountId: originalJob.external_account_id });
    check(c && c.id === credentialContext.connectionId && c.workspace_id === credentialContext.workspaceId &&
      c.advertiser_id === credentialContext.advertiserId && c.provider === "meta_ads" &&
      c.external_account_id === credentialContext.externalAccountId && c.status === "active" &&
      c.credential_version === 1 && typeof c.credential_ciphertext === "string", failure);
    failure = "INVALID_POLICY";
    const { context } = resolveMetaAdsAccountPolicy(input.policy, credentialContext,
      { dateFrom: originalJob.date_from, dateTo: originalJob.date_to });
    check(c.meta?.currency === context.currency && c.meta?.timezone === context.timeZone, failure);
    failure = "INVALID_INPUT";
    const scope = createMetaPageScope(originalJob, context, input.collectorOptions);
    failure = "INVALID_TARGETS";
    check(Array.isArray(input.targetReportIds) && input.targetReportIds.length >= 1 && input.targetReportIds.length <= 100 &&
      input.targetReportIds.every(id => typeof id === "string" && UUID.test(id)) &&
      new Set(input.targetReportIds).size === input.targetReportIds.length && input.targetReportIds.includes(originalJob.report_id), failure);
    const targetReportIds = Object.freeze([...input.targetReportIds].sort());
    failure = "INVALID_CREDENTIAL";
    const credentials = decryptMetaAdsCredentials(c.credential_ciphertext, credentialContext);
    const base = { job: scope.job, context: scope.context, collectorOptions: scope.options };
    const rpc: MetaPageRpc = async (name, args) => {
      check(RPCS.has(name), "INVALID_INPUT");
      return invokeRpc(name, args);
    };
    let accountCheck: Promise<void> | null = null;
    function verifyAccount(): Promise<void> {
      if (!accountCheck) {
        accountCheck = (async () => {
          // Identity is checked by the reader against the immutable credential scope.
          // No fallback currency/time zone, checkpoint rewrite or policy inference.
          const metadata = await readMetaAdsAccountMetadata({ externalAccountId: credentialContext.externalAccountId,
            accessToken: credentials.access_token }, { fetchImpl });
          check(metadata.currency === context.currency && metadata.timeZone === context.timeZone, "ACCOUNT_UNCONFIRMED");
        })().catch(() => {
          // Failed checks do not poison retries or release any waiting collection.
          accountCheck = null;
          throw new MetaAdsServerExecutionError("ACCOUNT_UNCONFIRMED");
        });
      }
      return accountCheck;
    }
    async function collectPage() {
      await verifyAccount();
      try {
        const ports = createMetaAdsPageCheckpointRepository(base, rpc);
        return await runMetaAdsStagingOrchestrator({ ...base, accessToken: credentials.access_token }, {
          ...ports, collectPage: (request, options) => collectMetaAdsAdDailyInsightsPage(request, { fetchImpl }, options),
        });
      } catch { throw new MetaAdsServerExecutionError("COLLECTION_UNCONFIRMED"); }
    }
    async function materialize(checkpoint: unknown, targetReportId: string) {
      try {
        check(targetReportIds.includes(targetReportId), "INVALID_TARGETS");
        const repo = createMetaMaterializationHandoffRepository({ ...base, checkpoint, targetReportIds }, rpc);
        const prepared = await repo.prepare(targetReportId);
        let next = prepared.nextRowIndex;
        if (next < prepared.expectedRows) next = (await repo.materializeBatch({ targetReportId,
          snapshotIngestionId: prepared.snapshotIngestionId, batchStart: next })).nextRowIndex;
        const completed = next === prepared.expectedRows ? await repo.complete({ targetReportId,
          snapshotIngestionId: prepared.snapshotIngestionId }) : null;
        const baseline = prepared.targets.find(t => t.reportId === targetReportId)!;
        const target: MetaCompletionTarget | null = completed ? { ...baseline,
          snapshotIngestionId: completed.snapshotIngestionId, completionToken: completed.completionToken } : null;
        return freezeMetaPage({ targetReportId, nextRowIndex: next, expectedRows: prepared.expectedRows,
          materializationComplete: completed !== null, target });
      } catch { throw new MetaAdsServerExecutionError("MATERIALIZATION_UNCONFIRMED"); }
    }
    async function complete(final: boolean, checkpoint: unknown, targets: readonly MetaCompletionTarget[]) {
      try {
        check(Array.isArray(targets) && targets.length === targetReportIds.length &&
          [...targets].map(t => t.reportId).sort().every((id, i) => id === targetReportIds[i]), "INVALID_TARGETS");
        const repo = createMetaCompletionClaimRepository({ originalJob: scope.job, context: scope.context,
          collectorOptions: scope.options, checkpoint, targets }, rpc);
        return await (final ? repo.finalize() : repo.activate());
      } catch { throw new MetaAdsServerExecutionError("COMPLETION_UNCONFIRMED"); }
    }
    return Object.freeze({ collectPage, materialize,
      activate: (checkpoint: unknown, targets: readonly MetaCompletionTarget[]) => complete(false, checkpoint, targets),
      finalize: (checkpoint: unknown, targets: readonly MetaCompletionTarget[]) => complete(true, checkpoint, targets) });
  } catch (error) {
    if (error instanceof MetaAdsServerExecutionError) throw error;
    throw new MetaAdsServerExecutionError(failure);
  }
}
