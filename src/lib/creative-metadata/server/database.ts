import {record} from '../contract';
import {fail} from './http';
import type {FetchPort} from './http';
import type {Access,Connection,Context,Ports,Stamp} from './service';
import type {Binding,Secrets} from './transport';

/** This module has no SDK, environment, default fetch, or writes. */
export type ReadQuery=Readonly<{
 table:'reports'|'report_ingestions'|'report_media_connections'|'media_connections'|'report_rows';
 columns:string;
 equals:Readonly<Record<string,string>>;
 limit:number;
 order?:string;
}>;
export type OAuthConfig=Readonly<{clientId:string;clientSecret:string;developerToken:string;redirectUri:string}>;
export type DatabaseDependencies=Readonly<{
 authorize:(input:{request:Request;reportId:string;action:'run_sync'})=>Promise<Access>;
 read:(query:ReadQuery,signal:AbortSignal)=>Promise<readonly unknown[]>;
 googleConfig:()=>OAuthConfig;
 decryptNaver:(ciphertext:string,binding:Binding)=>{customerId:string;accessLicense:string;secretKey:string};
 decryptGoogle:(ciphertext:string,binding:Binding & {provider:'google_ads'})=>{refresh_token:string;login_customer_id:string|null};
 fetch:FetchPort;
}>;

function live(signal:AbortSignal):void{if(signal.aborted)fail('ABORTED');}
function text(value:unknown):string{if(typeof value!=='string'||!value||value!==value.trim())fail('INVALID_CONTEXT');return value;}
function sameScope(row:Record<string,unknown>,access:Access):void{
 if(row.workspace_id!==access.workspaceId||row.advertiser_id!==access.advertiserId)fail('SCOPE_MISMATCH');
}
function one(rows:readonly unknown[]):Record<string,unknown>{if(rows.length!==1)fail('INVALID_CONTEXT');return record(rows[0]);}
function scope(access:Access):Record<string,string>{return {workspace_id:access.workspaceId,advertiser_id:access.advertiserId};}
function accessEqual(a:Access,b:Access):boolean{
 return a.reportId===b.reportId&&a.userId===b.userId&&a.workspaceId===b.workspaceId&&a.advertiserId===b.advertiserId&&
  a.advertiserCreatedBy===b.advertiserCreatedBy&&a.role===b.role&&a.isTrueMaster===b.isTrueMaster&&a.canRunSync===b.canRunSync&&b.canRunSync===true;
}
function connectionEqual(a:Connection,b:Connection):boolean{
 return a.id===b.id&&a.workspaceId===b.workspaceId&&a.advertiserId===b.advertiserId&&a.provider===b.provider&&
  a.externalAccountId===b.externalAccountId&&a.status===b.status&&a.credentialVersion===b.credentialVersion&&a.credentialRevision===b.credentialRevision;
}

export function createReadOnlyDatabasePorts(request:Request,deps:DatabaseDependencies):Ports{
 // Per invocation only; ciphertext and plaintext are never stored in a global cache.
 let authorized:Access|undefined;
 async function read(query:ReadQuery,signal:AbortSignal):Promise<readonly unknown[]>{
  live(signal);const rows=await deps.read(query,signal);live(signal);
  if(!Array.isArray(rows)||rows.length>query.limit)fail('INVALID_CONTEXT');return rows;
 }
 async function authorize(reportId:string,signal:AbortSignal):Promise<Access>{
  live(signal);
  // Existing auth helper cannot cancel its internal requests. Never continue after cancellation.
  const a=await deps.authorize({request,reportId,action:'run_sync'});live(signal);
  if(a.reportId!==reportId||!a.canRunSync)fail('ACCESS_DENIED');
  authorized=Object.freeze({...a});return authorized;
 }
 async function reportState(a:Access,signal:AbortSignal):Promise<Context['report']>{
  const r=one(await read({table:'reports',columns:'id, workspace_id, advertiser_id, current_ingestion_id, meta',
   equals:{id:a.reportId,...scope(a)},limit:2},signal));
  sameScope(r,a);if(r.id!==a.reportId)fail('SCOPE_MISMATCH');
  const kind=String(record(record(r.meta).data_source).kind??'csv').trim().toLowerCase();
  if(kind!=='api')fail('INVALID_CONTEXT');
  const ingestionId=text(r.current_ingestion_id);
  const i=one(await read({table:'report_ingestions',columns:'id, workspace_id, report_id, kind, status',
   equals:{id:ingestionId,report_id:a.reportId,workspace_id:a.workspaceId},limit:2},signal));
  if(i.id!==ingestionId||i.report_id!==a.reportId||i.workspace_id!==a.workspaceId||i.kind!=='api'||i.status!=='success')fail('INVALID_CONTEXT');
  return {id:a.reportId,workspaceId:a.workspaceId,advertiserId:a.advertiserId,sourceKind:kind,currentIngestionId:ingestionId};
 }
 async function mappings(a:Access,connectionId:string,signal:AbortSignal):Promise<Context['mappings']>{
  const rows=await read({table:'report_media_connections',columns:'report_id, workspace_id, advertiser_id, connection_id',
   equals:{report_id:a.reportId,...scope(a)},limit:101,order:'connection_id'},signal);
  if(rows.length>100)fail('INVALID_CONTEXT');const seen=new Set<string>();
  const result=rows.map(raw=>{const r=record(raw);sameScope(r,a);
   if(r.report_id!==a.reportId)fail('SCOPE_MISMATCH');const id=text(r.connection_id);
   if(seen.has(id))fail('INVALID_CONTEXT');seen.add(id);
   return {reportId:a.reportId,workspaceId:a.workspaceId,advertiserId:a.advertiserId,connectionId:id};});
  if(!seen.has(connectionId))fail('ACCESS_DENIED');return result;
 }
 async function connection(a:Access,id:string,signal:AbortSignal){
  const r=one(await read({table:'media_connections',columns:'id, workspace_id, advertiser_id, provider, external_account_id, status, credential_version, credential_ciphertext',
   equals:{id,...scope(a)},limit:2},signal));
  sameScope(r,a);
  if(r.id!==id||r.status!=='active'||r.credential_version!==1||(r.provider!=='naver_searchad'&&r.provider!=='google_ads'))fail('INVALID_CONTEXT');
  const account=text(r.external_account_id),ciphertext=text(r.credential_ciphertext);
  if(!(r.provider==='google_ads'?/^\d{10}$/:/^\d{1,20}$/).test(account))fail('INVALID_CONTEXT');
  const config=r.provider==='google_ads'?Object.freeze({...deps.googleConfig()}):null;
  // Opaque internal stamp binds all credential/config inputs, including manager ID inside ciphertext.
  const bytes=new TextEncoder().encode(JSON.stringify([id,a.workspaceId,a.advertiserId,r.provider,account,r.credential_version,ciphertext,
   config&&[config.clientId,config.clientSecret,config.developerToken,config.redirectUri]]));
  const digest=await crypto.subtle.digest('SHA-256',bytes);live(signal);
  const revision=new Uint8Array(digest).reduce((hex,v)=>hex+v.toString(16).padStart(2,'0'),'');
  const c:Connection={id,workspaceId:a.workspaceId,advertiserId:a.advertiserId,provider:r.provider,externalAccountId:account,
   status:'active',credentialVersion:1,credentialRevision:revision};
  return {c,ciphertext,config};
 }
 async function loadContext(a:Access,connectionId:string,signal:AbortSignal):Promise<Context>{
  if(!authorized||!accessEqual(authorized,a))fail('ACCESS_DENIED');
  const r=await reportState(a,signal);const m=await mappings(a,connectionId,signal);const {c}=await connection(a,connectionId,signal);
  const raw=await read({table:'report_rows',columns:'report_id, workspace_id, advertiser_id, ingestion_id, row_index, row',
   equals:{report_id:a.reportId,...scope(a),ingestion_id:r.currentIngestionId,'row->>provider':c.provider,
    'row->>external_account_id':c.externalAccountId,'row->>row_level':'creative','row->provider_meta->>entity_type':'ad'},
   limit:201,order:'row_index'},signal);
  let last=-1;
  const rows=raw.map(value=>{const e=record(value);sameScope(e,a);
   if(e.report_id!==a.reportId||e.ingestion_id!==r.currentIngestionId||typeof e.row_index!=='number'||!Number.isSafeInteger(e.row_index)||e.row_index<=last)fail('INVALID_CONTEXT');
   last=e.row_index;const row=record(e.row);
   if(row.provider!==c.provider||row.external_account_id!==c.externalAccountId||row.row_level!=='creative'||record(row.provider_meta).entity_type!=='ad')fail('SCOPE_MISMATCH');
   return {reportId:a.reportId,workspaceId:a.workspaceId,ingestionId:r.currentIngestionId,row};});
  return {report:r,connection:c,mappings:m,rows:rows.slice(0,200),hasMore:rows.length>200};
 }
 async function revalidate(stamp:Stamp,signal:AbortSignal):Promise<boolean>{
  const a=await authorize(stamp.access.reportId,signal);if(!accessEqual(stamp.access,a))return false;
  const r=await reportState(a,signal);if(r.currentIngestionId!==stamp.ingestionId)return false;
  await mappings(a,stamp.connection.id,signal);const {c}=await connection(a,stamp.connection.id,signal);
  return connectionEqual(stamp.connection,c);
 }
 async function decrypt(binding:Binding,signal:AbortSignal):Promise<Secrets>{
  const a=authorized;if(!a||a.workspaceId!==binding.workspaceId||a.advertiserId!==binding.advertiserId)fail('ACCESS_DENIED');
  await mappings(a,binding.connectionId,signal);const current=await connection(a,binding.connectionId,signal);
  const c=current.c;
  if(c.provider!==binding.provider||c.externalAccountId!==binding.externalAccountId||c.credentialRevision!==binding.credentialRevision)fail('STALE_CONTEXT');
  live(signal);
  if(c.provider==='naver_searchad'){
   const secret=deps.decryptNaver(current.ciphertext,binding);live(signal);
   return {binding,provider:'naver_searchad',customerId:secret.customerId,accessLicense:secret.accessLicense,secretKey:secret.secretKey};
  }
  const config=current.config;if(!config)fail('INVALID_CREDENTIALS');
  const secret=deps.decryptGoogle(current.ciphertext,{...binding,provider:'google_ads'});live(signal);
  return {binding,provider:'google_ads',refreshToken:secret.refresh_token,loginCustomerId:secret.login_customer_id,
   clientId:config.clientId,clientSecret:config.clientSecret,developerToken:config.developerToken};
 }
 return {authorize,loadContext,revalidate,decrypt,fetch:deps.fetch};
}
