import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {record,identityForRow} from '../contract';
import type {Identity} from '../contract';
import {parseViewRequest} from '../view';
import type {ViewRequest} from '../view';
import {readViewMetadata} from './view-service';
import type {ViewPorts,ViewState} from './view-service';
import {Session,fail} from './http';
import {digest} from '../cache/contract';
import {runExistingCachedMetadata} from './cached-server';

type Source={kind:'share';token:string}|{kind:'report';id:string};
type Dependencies={client:SupabaseClient;authorize:(request:Request,id:string)=>Promise<{workspaceId:string;advertiserId:string;userId:string;role:string;canRunSync:boolean}>;googleConfig:()=>{clientId:string;clientSecret:string;developerToken:string;redirectUri:string}};
const text=(v:unknown):string=>{if(typeof v!=='string'||!v||v!==v.trim())fail('INVALID_CONTEXT');return v;};
/** Only scoped SELECTs plus read RPC. Does not import credential decryptors. */
export function createViewPorts(request:Request,source:Source,input:ViewRequest,deps:Dependencies):ViewPorts{
 const sb=deps.client;
 async function one(query:any,signal:AbortSignal):Promise<Record<string,unknown>>{
  if(signal.aborted)fail('ABORTED');const {data,error}=await query.limit(2).abortSignal(signal);if(signal.aborted)fail('ABORTED');
  if(error||!Array.isArray(data)||data.length!==1)fail('ACCESS_DENIED');return record(data[0]);
 }
 async function snapshot(signal:AbortSignal):Promise<ViewState>{
  const access=source.kind==='report'?await deps.authorize(request,source.id):null;if(signal.aborted)fail('ABORTED');
  let rq=sb.from('reports').select('id,workspace_id,advertiser_id,status,current_ingestion_id,published_ingestion_id,meta');
  rq=source.kind==='share'?rq.eq('share_token',source.token):rq.eq('id',source.id).eq('workspace_id',access!.workspaceId).eq('advertiser_id',access!.advertiserId);
  const r=await one(rq,signal),reportId=text(r.id),workspaceId=text(r.workspace_id),advertiserId=text(r.advertiser_id);
  if(source.kind==='share'&&r.status!=='ready'||source.kind==='report'&&(!access?.canRunSync||reportId!==source.id))fail('ACCESS_DENIED');
  if(String(record(record(r.meta).data_source).kind??'').trim().toLowerCase()!=='api')fail('INVALID_CONTEXT');
  const ingestionId=text(source.kind==='share'?r.published_ingestion_id:r.current_ingestion_id);
  await one(sb.from('advertisers').select('id').eq('id',advertiserId).eq('workspace_id',workspaceId),signal);
  await one(sb.from('report_ingestions').select('id').eq('id',ingestionId).eq('report_id',reportId).eq('workspace_id',workspaceId).eq('kind','api').eq('status','success'),signal);
  const {data:m,error:me}=await sb.from('report_media_connections').select('connection_id').eq('report_id',reportId).eq('workspace_id',workspaceId).eq('advertiser_id',advertiserId).order('connection_id').limit(101).abortSignal(signal);
  if(me||!m?.length||m.length>100||new Set(m.map(x=>x.connection_id)).size!==m.length)fail('INVALID_CONTEXT');
  const c=await one(sb.from('media_connections').select('id,workspace_id,advertiser_id,provider,external_account_id,status,credential_version,credential_ciphertext')
   .in('id',m.map(x=>text(x.connection_id))).eq('workspace_id',workspaceId).eq('advertiser_id',advertiserId).eq('provider',input.provider).eq('external_account_id',input.externalAccountId).eq('status','active'),signal);
  if(c.credential_version!==1)fail('INVALID_CONTEXT');const connectionId=text(c.id),ciphertext=text(c.credential_ciphertext);
  const config=input.provider==='google_ads'?deps.googleConfig():null;
  // Exactly the same credential-generation input as database.ts; opaque and server-only.
  const credentialRevision=await digest([connectionId,workspaceId,advertiserId,input.provider,input.externalAccountId,1,ciphertext,config&&[config.clientId,config.clientSecret,config.developerToken,config.redirectUri]]);
  const binding={workspaceId,advertiserId,provider:input.provider,externalAccountId:input.externalAccountId,connectionId,credentialRevision};
  return {binding,ingestionId,stamp:JSON.stringify([reportId,workspaceId,advertiserId,ingestionId,connectionId,credentialRevision,source.kind,access&&[access.userId,access.role,access.canRunSync],m.map(x=>x.connection_id)])};
 }
 async function identities(state:ViewState,input:ViewRequest,signal:AbortSignal):Promise<readonly Identity[]>{
  const b=state.binding,result:Identity[]=[];const reportId=JSON.parse(state.stamp)[0] as string;
  // One representative canonical row per requested ID; bounded 20 IDs, no history scan loop.
  for(const id of input.entityIds){
   if(signal.aborted)fail('ABORTED');
   const {data,error}=await sb.from('report_rows').select('row').eq('report_id',reportId).eq('workspace_id',b.workspaceId).eq('advertiser_id',b.advertiserId).eq('ingestion_id',state.ingestionId)
    .eq('row->>provider',b.provider).eq('row->>external_account_id',b.externalAccountId).eq('row->>external_creative_id',id).eq('row->>row_level','creative').eq('row->provider_meta->>entity_type','ad').order('row_index').limit(1).abortSignal(signal);
   if(error||!Array.isArray(data))fail('DEPENDENCY_ERROR');
   const identity=data[0]&&identityForRow(b,data[0].row);if(identity&&identity.entityId===id)result.push(identity);
  }
  return result;
 }
 return {snapshot,identities,read:async(account,keys,signal)=>{
  const {data,error}=await sb.rpc('read_creative_metadata_cache_v1',{p_account_key:account,p_keys:[...keys]}).abortSignal(signal);
  if(error)fail('DEPENDENCY_ERROR');return data;
 }};
}
async function dependencies():Promise<Dependencies>{
 const [db,auth,config]=await Promise.all([import('../../supabase/admin'),import('../../media-sync/media-connection-access'),import('../../media-sync/google-ads-oauth-config')]);
 return {client:db.supabaseAdmin,authorize:(request,id)=>auth.resolveReportMediaConnectionAccess({request,reportId:id,action:'run_sync'}),googleConfig:config.readGoogleAdsOAuthConfig};
}
async function body(request:Request,signal:AbortSignal):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)fail('INVALID_INPUT');let size=0;const chunks:Uint8Array[]=[];
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{while(true){if(signal.aborted)fail('ABORTED');const p=await reader.read();if(signal.aborted)fail('ABORTED');if(p.done)break;size+=p.value.length;if(size>8192)fail('INVALID_INPUT');chunks.push(p.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
 }finally{signal.removeEventListener('abort',cancel);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export async function handleMetadataRequest(request:Request,source:Source,refresh=false):Promise<Response>{
 if(process.env.CREATIVE_METADATA_VIEW_ENABLED!=='1'||process.env.CREATIVE_METADATA_CACHE_ENABLED!=='1'||process.env.CREATIVE_METADATA_READ_ENABLED!=='1')return json({status:'disabled',entries:[]});
 if(refresh&&(source.kind!=='report'||process.env.CREATIVE_METADATA_REFRESH_ENABLED!=='1'))return json({status:'disabled'},403);
 if(refresh&&request.headers.get('origin')!==new URL(request.url).origin)return json({status:'rejected'},403);
 const session=new Session(1,5000,30000,request.signal);
 try{
  const input=parseViewRequest(await session.run(s=>body(request,s))),deps=await session.run(()=>dependencies()),ports=createViewPorts(request,source,input,deps);
  if(!refresh)return json({status:'ready',...await session.run(s=>readViewMetadata(input,ports,s),15000)});
  const state=await session.run(s=>ports.snapshot(s));
  const identities=await session.run(s=>ports.identities(state,input,s));if(identities.length!==input.entityIds.length)fail('ACCESS_DENIED');
  if((await session.run(s=>ports.snapshot(s))).stamp!==state.stamp)fail('STALE_CONTEXT');
  if(source.kind!=='report')fail('ACCESS_DENIED');
  const maxHttpRequests=Math.min(40,input.provider==='naver_searchad'?input.entityIds.length:1+2*input.entityIds.length);
  const result=await runExistingCachedMetadata(request,{enabled:true,reportId:source.id,connectionId:state.binding.connectionId,maxHttpRequests,requestTimeoutMs:3000,totalTimeoutMs:Math.min(25000,session.remaining()),signal:session.signal},input.entityIds);
  return json({status:result.status,hasMore:result.hasMore,retryAt:result.retryAt},result.status==='rejected'?403:200);
 }catch{return json({status:'unavailable',entries:[]},403);}finally{session.close();}
}

/** Authenticated editor discovery. Reads at most 201 current snapshot rows; never calls a provider. */
export async function handleMetadataTargets(request:Request,reportId:string):Promise<Response>{
 if(process.env.CREATIVE_METADATA_VIEW_ENABLED!=='1'||process.env.CREATIVE_METADATA_CACHE_ENABLED!=='1'||process.env.CREATIVE_METADATA_READ_ENABLED!=='1')return json({status:'disabled',rows:[]});
 const session=new Session(1,5000,15000,request.signal);
 try{
  const raw=record(await session.run(s=>body(request,s))),after=raw.afterRowIndex??-1;
  if(Object.keys(raw).some(k=>!['afterRowIndex','ingestionId'].includes(k))||!Number.isSafeInteger(after)||Number(after)<-1||Number(after)>2147483647||raw.ingestionId!==undefined&&typeof raw.ingestionId!=='string')fail('INVALID_INPUT');
  const deps=await session.run(()=>dependencies()),sb=deps.client;
  async function scope(signal:AbortSignal){
   const a=await deps.authorize(request,reportId);if(!a.canRunSync||signal.aborted)fail('ACCESS_DENIED');
   const {data:r,error}=await sb.from('reports').select('id,workspace_id,advertiser_id,current_ingestion_id,meta').eq('id',reportId).eq('workspace_id',a.workspaceId).eq('advertiser_id',a.advertiserId).limit(2).abortSignal(signal);
   if(error||r?.length!==1||String(record(record(r[0].meta).data_source).kind).toLowerCase()!=='api')fail('INVALID_CONTEXT');
   const ingestionId=text(r[0].current_ingestion_id);
   const {data:i,error:ie}=await sb.from('report_ingestions').select('id').eq('id',ingestionId).eq('workspace_id',a.workspaceId).eq('report_id',reportId).eq('kind','api').eq('status','success').limit(2).abortSignal(signal);
   if(ie||i?.length!==1)fail('INVALID_CONTEXT');return {...a,ingestionId};
  }
  const a=await session.run(scope);if(after!==-1&&raw.ingestionId!==a.ingestionId)fail('STALE_CONTEXT');
  const {data:items,error}=await session.run(signal=>Promise.resolve(sb.from('report_rows').select('row_index,row').eq('report_id',reportId).eq('workspace_id',a.workspaceId).eq('advertiser_id',a.advertiserId).eq('ingestion_id',a.ingestionId).eq('row->>row_level','creative').eq('row->provider_meta->>entity_type','ad').gt('row_index',after).order('row_index').limit(201).abortSignal(signal)));
  if(error||!Array.isArray(items))fail('DEPENDENCY_ERROR');
  const rows:Record<string,unknown>[]=[],seen=new Set<string>();let last=Number(after),more=items.length>200;
  for(const item of items.slice(0,200)){
   const row=record(item.row);if(!Number.isSafeInteger(item.row_index)||item.row_index<=last)fail('INVALID_CONTEXT');
   const provider=row.provider,account=row.external_account_id;
   const identity=(provider==='naver_searchad'||provider==='google_ads')&&typeof account==='string'?identityForRow({workspaceId:a.workspaceId,advertiserId:a.advertiserId,provider,externalAccountId:account},row):null;
   const key=identity&&JSON.stringify([identity.provider,identity.externalAccountId,identity.entityId]);
   if(key&&!seen.has(key)&&rows.length===20){more=true;break;}
   last=item.row_index;
   if(identity&&key&&!seen.has(key)){seen.add(key);const meta=record(row.provider_meta);
    rows.push({creative:typeof row.creative==='string'?row.creative:identity.entityId,provider:identity.provider,external_account_id:identity.externalAccountId,external_creative_id:identity.entityId,row_level:'creative',row_level_reason:row.row_level_reason,
     provider_meta:{entity_type:meta.entity_type,campaign_type:meta.campaign_type,authoritative_grain:meta.authoritative_grain,detail_only:meta.detail_only,product_family:meta.product_family}});
   }
  }
  const b=await session.run(scope);if(JSON.stringify(a)!==JSON.stringify(b))fail('STALE_CONTEXT');
  return json({status:'ready',rows,nextRowIndex:more?last:null,ingestionId:a.ingestionId});
 }catch{return json({status:'unavailable',rows:[]},403);}finally{session.close();}
}
