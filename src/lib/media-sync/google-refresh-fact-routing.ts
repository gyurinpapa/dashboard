/** Offline candidate: no runtime caller, environment toggle or automatic retry. */
export const GOOGLE_REFRESH_FACT_ROUTING_ENABLED = false;
export type FactScope = Readonly<{jobId:string;reportId:string;workspaceId:string;advertiserId:string;connectionId:string;accountId:string;date:string}>;
export type FactReservation = FactScope & Readonly<{requestId:string;state:'reserved'|'collected'|'ready'|'activated'|'abandoned'}>;
export class GoogleRefreshFactRoutingError extends Error {
 constructor(readonly code:string){super(code);this.name='GoogleRefreshFactRoutingError';}
}
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
/** The caller supplies the existing daily callback unchanged. Missing lookup is not confirmed absence. */
export async function routeGoogleRefreshFactReplacement<T>(input:Readonly<{
 enabled?:boolean;executionApproved?:boolean;scope:FactScope;
 daily:()=>Promise<T>;
 recovery?:Readonly<{find:(scope:FactScope)=>Promise<FactReservation|null>;replaceWithBackup:(reservation:FactReservation)=>Promise<T>}>;
}>):Promise<T>{
 if(input.enabled!==true)return input.daily();
 function fail(code:string):never {throw new GoogleRefreshFactRoutingError(code);}
 if(input.executionApproved!==true)fail('EXECUTION_NOT_APPROVED');
 const s=input.scope;
 if(!s||![s.jobId,s.reportId,s.workspaceId,s.advertiserId,s.connectionId].every(uuid)||!/^\d{10}$/.test(s.accountId)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date))fail('INVALID_SCOPE');
 const d=input.recovery;if(!d)fail('RECOVERY_ADAPTER_MISSING');
 let q:FactReservation|null;
 try{q=await d.find(s);}catch{fail('RESERVATION_LOOKUP_UNCONFIRMED');}
 if(q===null)return input.daily();
 if(!q||!uuid(q.requestId)||Object.keys(s).some(k=>q![k as keyof FactScope]!==s[k as keyof FactScope]))fail('RESERVATION_SCOPE_CONFLICT');
 if(q.state!=='reserved')fail('RESERVATION_NOT_COLLECTING');
 // A thrown/lost backup RPC response propagates; never switch to unprotected replacement.
 return d.replaceWithBackup(q);
}
