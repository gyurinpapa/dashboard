import {identityForRow,identityKey,id,record} from '../contract';
import type {Scope} from '../contract';
import {collectCreativeMetadata} from '../collector';
import type {Target,Collection} from '../collector';
import {Session,Failure,fail} from './http';
import type {ServerProblem,FetchPort,Counts} from './http';
import {createBoundTransport,validateSecrets} from './transport';
import type {Binding,Secrets,BoundTransport} from './transport';

export type Access=Readonly<{reportId:string;userId:string;workspaceId:string;advertiserId:string;
 advertiserCreatedBy:string|null;role:string;isTrueMaster:boolean;canRunSync:boolean}>;
export type Connection=Readonly<{id:string;workspaceId:string;advertiserId:string;provider:Scope['provider'];externalAccountId:string;
 status:string;credentialVersion:number;credentialRevision:string}>;
export type Context=Readonly<{
 report:Readonly<{id:string;workspaceId:string;advertiserId:string;sourceKind:string;currentIngestionId:string}>;
 connection:Connection;
 mappings:readonly Readonly<{reportId:string;workspaceId:string;advertiserId:string;connectionId:string}>[];
 rows:readonly Readonly<{reportId:string;workspaceId:string;ingestionId:string;row:unknown}>[];
 hasMore:boolean;
}>;
export type Stamp=Readonly<{access:Access;connection:Connection;ingestionId:string}>;
/** Server-only dependency ports, NOT JSON from a client.
 * authorize wraps resolveReportMediaConnectionAccess({request,reportId,action:'run_sync'}).
 * loadContext uses scoped READ ONLY queries and at most 200 selected canonical rows.
 * credentialRevision is an opaque digest of ciphertext/config generation, not a new DB column.
 * revalidate must reauthorize and compare report pointer, mapping, active connection AND credential generation.
 * decrypt must use the existing authenticated encryption codec and return exactly the same Binding.
 * Every port must honor signal and perform no performance writes or provider calls. */
export type Ports=Readonly<{
 authorize:(reportId:string,signal:AbortSignal)=>Promise<Access>;
 loadContext:(access:Access,connectionId:string,signal:AbortSignal)=>Promise<Context>;
 revalidate:(stamp:Stamp,signal:AbortSignal)=>Promise<boolean>;
 decrypt:(binding:Binding,signal:AbortSignal)=>Promise<Secrets>;
 fetch:FetchPort;
}>;
export type ServerInput=Readonly<{enabled:boolean;reportId:string;connectionId:string;maxHttpRequests:number;
 requestTimeoutMs:number;totalTimeoutMs:number;signal?:AbortSignal}>;
export type ServerResult=Readonly<{status:'disabled'|'no_targets'|'completed'|'stopped'|'rejected';problem:ServerProblem|null;
 counts:Counts;selectedTargets:number;hasMore:boolean;collection:Collection|null}>;
const zero:Counts=Object.freeze({totalHttpRequests:0,oauthRequests:0,metadataRequests:0});
function validId(value:unknown):value is string{return typeof value==='string'&&id(value)===value;}
export function accessSnapshot(raw:Access,reportId:string):Access{
 if(!raw||raw.reportId!==reportId||![raw.userId,raw.workspaceId,raw.advertiserId].every(validId)||raw.canRunSync!==true)fail('ACCESS_DENIED');
 const allowed=raw.isTrueMaster===true&&raw.role==='master'||raw.isTrueMaster===false&&(
  raw.role==='director'||raw.role==='admin'||raw.role==='staff'&&raw.advertiserCreatedBy===raw.userId);
 if(!allowed)fail('ACCESS_DENIED');
 return Object.freeze({reportId,userId:raw.userId,workspaceId:raw.workspaceId,advertiserId:raw.advertiserId,
  advertiserCreatedBy:raw.advertiserCreatedBy,role:raw.role,isTrueMaster:raw.isTrueMaster,canRunSync:true});
}
export function select(access:Access,connectionId:string,ctx:Context):{stamp:Stamp;binding:Binding;targets:readonly Target[];hasMore:boolean}{
 if(!ctx||!ctx.report||!ctx.connection||!Array.isArray(ctx.mappings)||ctx.mappings.length>100||!Array.isArray(ctx.rows)||ctx.rows.length>200||typeof ctx.hasMore!=='boolean')fail('INVALID_CONTEXT');
 const r=ctx.report,c=ctx.connection;
 if(r.id!==access.reportId||r.workspaceId!==access.workspaceId||r.advertiserId!==access.advertiserId||r.sourceKind!=='api'||!validId(r.currentIngestionId))fail('INVALID_CONTEXT');
 if(c.id!==connectionId||c.workspaceId!==access.workspaceId||c.advertiserId!==access.advertiserId||c.status!=='active'||c.credentialVersion!==1||!validId(c.credentialRevision)||
  !['naver_searchad','google_ads'].includes(c.provider)||typeof c.externalAccountId!=='string'||!(c.provider==='google_ads'?/^\d{10}$/:/^\d{1,20}$/).test(c.externalAccountId))fail('INVALID_CONTEXT');
 const seenMappings=new Set<string>();
 for(const m of ctx.mappings){
  if(!m||m.reportId!==access.reportId||m.workspaceId!==access.workspaceId||m.advertiserId!==access.advertiserId||!validId(m.connectionId)||seenMappings.has(m.connectionId))fail('INVALID_CONTEXT');
  seenMappings.add(m.connectionId);
 }
 if(!seenMappings.has(connectionId))fail('ACCESS_DENIED');
 const connection:Connection=Object.freeze({id:c.id,workspaceId:c.workspaceId,advertiserId:c.advertiserId,provider:c.provider,externalAccountId:c.externalAccountId,
  status:c.status,credentialVersion:c.credentialVersion,credentialRevision:c.credentialRevision});
 const stamp:Stamp=Object.freeze({access,connection,ingestionId:r.currentIngestionId});
 const binding:Binding=Object.freeze({workspaceId:c.workspaceId,advertiserId:c.advertiserId,provider:c.provider,externalAccountId:c.externalAccountId,
  connectionId,credentialRevision:c.credentialRevision});
 const unique=new Map<string,Target>();
 for(const entry of ctx.rows){
  if(!entry||entry.reportId!==access.reportId||entry.workspaceId!==access.workspaceId||entry.ingestionId!==r.currentIngestionId)fail('INVALID_CONTEXT');
  const row=record(entry.row);
  if(row.provider!==binding.provider||row.external_account_id!==binding.externalAccountId)fail('SCOPE_MISMATCH');
  const identity=identityForRow(binding,row);if(!identity)continue;
  if(binding.provider==='naver_searchad'?!/^nad-[a-zA-Z0-9-]{1,100}$/.test(identity.entityId):!/^\d{1,20}$/.test(identity.entityId))fail('INVALID_CONTEXT');
  if(binding.provider==='naver_searchad'){
   const campaignType=String(record(row.provider_meta).campaign_type??'').trim();
   if(campaignType!=='WEB_SITE'&&campaignType!=='SHOPPING')continue;
   unique.set(identityKey(identity),Object.freeze({identity,campaignType}));
  }else unique.set(identityKey(identity),Object.freeze({identity}));
 }
 return {stamp,binding,targets:Object.freeze([...unique.values()].slice(0,20)),hasMore:ctx.hasMore||unique.size>20};
}
/** No real DB, fetch, environment, or route is wired in this isolated package. */
export async function runServerMetadata(input:ServerInput,ports:Ports):Promise<ServerResult>{
 let session:Session|undefined,transport:BoundTransport|undefined,selectedTargets=0,hasMore=false;
 const finish=(status:ServerResult['status'],problem:ServerProblem|null=null,collection:Collection|null=null):ServerResult=>Object.freeze({
  status,problem,counts:session?.counts()??zero,selectedTargets,hasMore,collection});
 if(input.enabled!==true)return finish('disabled');
 try{
  if(typeof window!=='undefined'||!validId(input.reportId)||!validId(input.connectionId))fail('INVALID_INPUT');
  const reportId=input.reportId,connectionId=input.connectionId;
  session=new Session(input.maxHttpRequests,input.requestTimeoutMs,input.totalTimeoutMs,input.signal);
  const access=accessSnapshot(await session.run(s=>ports.authorize(reportId,s)),reportId);
  const selected=select(access,connectionId,await session.run(s=>ports.loadContext(access,connectionId,s)));
  selectedTargets=selected.targets.length;hasMore=selected.hasMore;
  if(!selectedTargets)return finish('no_targets');
  if(selected.binding.provider==='google_ads'&&session.maxRequests<2)fail('BUDGET_EXHAUSTED');
  const secrets=validateSecrets(await session.run(s=>ports.decrypt(selected.binding,s)),selected.binding);
  if(await session.run(s=>ports.revalidate(selected.stamp,s))!==true)fail('STALE_CONTEXT');
  const observation=Object.freeze({revision:crypto.randomUUID(),fetchedAt:new Date().toISOString()});
  transport=await createBoundTransport({binding:selected.binding,secrets,targets:selected.targets,observation,session,fetchPort:ports.fetch});
  session.assertLive();const remaining=session.remaining();if(remaining<10)fail('TIMEOUT');
  const collection=await collectCreativeMetadata({enabled:true,authorizedScope:selected.binding,targets:selected.targets,observation,
   maxRequests:session.maxRequests-session.counts().totalHttpRequests,requestTimeoutMs:Math.min(session.requestMs,remaining),totalTimeoutMs:remaining,signal:session.signal},transport.read);
  // A stale/revoked result is never offered for publication, even if provider calls succeeded.
  if(await session.run(s=>ports.revalidate(selected.stamp,s))!==true)fail('STALE_CONTEXT');
  if(collection.status==='completed')return finish('completed',null,collection);
  const problem=collection.problem==='TIMEOUT'? 'TIMEOUT':transport.problem()??collection.problem??'INVALID_RESPONSE';
  return finish('stopped',problem,collection);
 }catch(e){return finish(session?.counts().totalHttpRequests?'stopped':'rejected',e instanceof Failure?e.code:'DEPENDENCY_ERROR');}
 finally{transport?.dispose();session?.close();}
}
