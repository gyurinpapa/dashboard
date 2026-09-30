import type {ReplaceGoogleAdsDailyV2FactDateInput,GoogleAdsDailyV2FactReplacementResult} from './google-ads-daily-v2-fact-authority-repository';
import {replaceGoogleRefreshFactWithAccess,manageGoogleRefreshRecoveryRequest} from './google-refresh-recovery-adapter';
export const GOOGLE_REFRESH_RECOVERY_ENABLED=false;
export const GOOGLE_REFRESH_RECOVERY_EXECUTION_APPROVED=false;
export async function routeDisabledGoogleRefreshFactReplacement(replacement:ReplaceGoogleAdsDailyV2FactDateInput,daily:()=>Promise<GoogleAdsDailyV2FactReplacementResult>){
 if(!GOOGLE_REFRESH_RECOVERY_ENABLED)return daily();
 const {getSupabaseAdmin}=await import('../supabase/admin');
 return replaceGoogleRefreshFactWithAccess({enabled:GOOGLE_REFRESH_RECOVERY_ENABLED,executionApproved:GOOGLE_REFRESH_RECOVERY_EXECUTION_APPROVED,replacement,daily,createClient:getSupabaseAdmin});
}
export async function recoverGoogleRefreshForRequest(input:Readonly<{request:Request;reportId:string;jobId:string;requestId:string;action:'restore'|'release'}>){
 if(!GOOGLE_REFRESH_RECOVERY_ENABLED||!GOOGLE_REFRESH_RECOVERY_EXECUTION_APPROVED)return {action:'disabled'} as const;
 const {getSupabaseAdmin}=await import('../supabase/admin');
 const {resolveReportMediaConnectionAccess}=await import('./media-connection-access');
 return manageGoogleRefreshRecoveryRequest({...input,enabled:true,executionApproved:true,createClient:getSupabaseAdmin,
 resolveAccess:(request,reportId)=>resolveReportMediaConnectionAccess({request,reportId,action:'run_sync'})});
}
