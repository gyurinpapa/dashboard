import { runGoogleExactDateRefresh, type GoogleExactDateRefreshDependencies,
  type GoogleExactDateRefreshRequest } from './google-ads-exact-date-refresh';

/** Server-owned one-request approval. Never read it from HTTP or environment input. */
export type GoogleRefreshRequestApproval = Readonly<{
  reportId: string; workspaceId: string; advertiserId: string; actorId: string;
  expiresAt: string; request: GoogleExactDateRefreshRequest;
}>;
const fields: readonly (keyof GoogleExactDateRefreshRequest)[] = ['requestId','connectionId','externalAccountId','date',
  'expectedSourceJobId','expectedFactUpdatedAt','expectedCurrentIngestionId','expectedPublishedIngestionId'];
const rejected = () => { throw new Error('GOOGLE_REFRESH_APPROVAL_REJECTED'); };

export async function runApprovedGoogleRefreshRequest(input: {
  enabled: boolean; executionApproved: boolean; approval: GoogleRefreshRequestApproval | null;
  request: Request; reportId: string; body: unknown;
  dependencies: GoogleExactDateRefreshDependencies; now?: Date;
}) {
  if (!input.enabled || !input.executionApproved) return {action:'disabled'} as const;
  const a=input.approval,now=input.now ?? new Date();
  if (!a || !Number.isFinite(now.getTime()) || !Number.isFinite(Date.parse(a.expiresAt)) ||
      now.getTime() >= Date.parse(a.expiresAt) || a.reportId!==input.reportId ||
      !input.body || typeof input.body!=='object' || Array.isArray(input.body)) return rejected();
  const b=input.body as Record<string,unknown>;
  if (Object.keys(b).length!==fields.length || fields.some(k=>b[k]!==a.request[k])) return rejected();
  return runGoogleExactDateRefresh({enabled:true,liveApprovalConfirmed:true,httpRequest:input.request,
    reportId:input.reportId,request:input.body,now,dependencies:{
      requestAtomically:async payload=>{
        // Authentication may take time; recheck expiry immediately before the write RPC.
        if ((input.now ?? new Date()).getTime() >= Date.parse(a.expiresAt)) return rejected();
        return input.dependencies.requestAtomically(payload);
      },
      resolveAccess:async(request,reportId)=>{
        const access=await input.dependencies.resolveAccess(request,reportId);
        if(access.userId!==a.actorId || access.workspaceId!==a.workspaceId || access.advertiserId!==a.advertiserId || access.reportId!==a.reportId) return rejected();
        return access;
      },
    }});
}
