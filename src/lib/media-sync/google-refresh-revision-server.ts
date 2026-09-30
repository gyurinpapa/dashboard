import { runApprovedGoogleRefreshRequest, type GoogleRefreshRequestApproval } from "./google-refresh-approved-request";
import { GOOGLE_REFRESH_REVISION_REQUEST_RPC, GOOGLE_REFRESH_REVISION_STEP_RPC, runGoogleRefreshRevisionStep } from "./google-refresh-revision";

// Offline only. No environment variable or request body can enable these gates.
// The request route imports this module but stays disabled before auth or DB IO.
export const GOOGLE_REFRESH_APPROVED_REQUEST: GoogleRefreshRequestApproval | null = null;
export const GOOGLE_REFRESH_REVISION_ENABLED = false;
export const GOOGLE_REFRESH_REVISION_EXECUTION_APPROVED = false;
export const GOOGLE_REFRESH_REVISION_ACTIVATION_APPROVED = false;
async function resolveAccess(request: Request, reportId: string) {
  const { resolveReportMediaConnectionAccess } = await import("./media-connection-access");
  return resolveReportMediaConnectionAccess({ request, reportId, action: "run_sync" });
}
async function callRpc(name: typeof GOOGLE_REFRESH_REVISION_REQUEST_RPC | typeof GOOGLE_REFRESH_REVISION_STEP_RPC, payload: unknown) {
  const { getSupabaseAdmin } = await import("../supabase/admin");
  const { data, error } = await getSupabaseAdmin().rpc(name, { p_payload: payload });
  if (error) throw new Error("GOOGLE_REVISION_REJECTED");
  return data;
}
export async function requestGoogleRefreshRevision(input: Readonly<{ request: Request; reportId: string; body: unknown }>) {
  return runApprovedGoogleRefreshRequest({
    enabled: GOOGLE_REFRESH_REVISION_ENABLED,
    executionApproved: GOOGLE_REFRESH_REVISION_EXECUTION_APPROVED,
    approval: GOOGLE_REFRESH_APPROVED_REQUEST,
    request: input.request, reportId: input.reportId, body: input.body,
    dependencies: { resolveAccess, requestAtomically: p => callRpc(GOOGLE_REFRESH_REVISION_REQUEST_RPC, p) },
  });
}
export async function stepGoogleRefreshRevision(input: Readonly<{ request: Request; reportId: string; body: unknown }>) {
  return runGoogleRefreshRevisionStep({
    enabled: GOOGLE_REFRESH_REVISION_ENABLED, executionApproved: GOOGLE_REFRESH_REVISION_EXECUTION_APPROVED,
    activationApproved: GOOGLE_REFRESH_REVISION_ACTIVATION_APPROVED,
    httpRequest: input.request, reportId: input.reportId, body: input.body,
    dependencies: { resolveAccess, stepAtomically: p => callRpc(GOOGLE_REFRESH_REVISION_STEP_RPC, p) },
  });
}
