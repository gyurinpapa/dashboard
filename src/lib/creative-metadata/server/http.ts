/** No default network dependency. Bind native server fetch only after integration review. */
import type {Problem} from '../collector';
import {META_CREATIVE_FIELDS,META_CREATIVE_DETAIL_QUERY} from '../meta';
export type ServerProblem=Problem|'ACCESS_DENIED'|'INVALID_CONTEXT'|'STALE_CONTEXT'|'INVALID_CREDENTIALS'|'DEPENDENCY_ERROR'|'CLOSED'|'TOKEN_EXPIRED'|'REQUEST_NOT_ALLOWED';
export class Failure extends Error{constructor(readonly code:ServerProblem){super(code);}}
export function fail(code:ServerProblem):never{throw new Failure(code);}
export type FetchPort=(url:string,init:RequestInit)=>Promise<Response>;
export type Counts=Readonly<{totalHttpRequests:number;oauthRequests:number;metadataRequests:number}>;

/** One invocation's monotonic deadline and quota, shared by OAuth and metadata. */
export class Session{
 private readonly root=new AbortController();
 private readonly deadline:number;
 private readonly onAbort:()=>void;
 private closed=false;
 private count={totalHttpRequests:0,oauthRequests:0,metadataRequests:0};
 constructor(readonly maxRequests:number,readonly requestMs:number,totalMs:number,private readonly external?:AbortSignal){
  if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>40||!Number.isInteger(requestMs)||requestMs<10||requestMs>5000||
   !Number.isInteger(totalMs)||totalMs<requestMs||totalMs>30000)fail('INVALID_INPUT');
  this.deadline=performance.now()+totalMs;
  this.onAbort=()=>this.root.abort();
  external?.addEventListener('abort',this.onAbort,{once:true});if(external?.aborted)this.root.abort();
 }
 get signal():AbortSignal{return this.root.signal;}
 counts():Counts{return Object.freeze({...this.count});}
 remaining():number{return Math.floor(this.deadline-performance.now());}
 assertLive():void{if(this.closed)fail('CLOSED');if(this.signal.aborted)fail('ABORTED');if(this.remaining()<=0)fail('TIMEOUT');}
 async run<T>(fn:(signal:AbortSignal)=>Promise<T>,maxMs=this.remaining(),extra?:AbortSignal):Promise<T>{
  this.assertLive();if(extra?.aborted)fail('ABORTED');
  const local=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  let cancel:()=>void=()=>{};
  const stopped=new Promise<never>((_,reject)=>{
   cancel=()=>{local.abort();reject(new Failure('ABORTED'));};
   this.signal.addEventListener('abort',cancel,{once:true});extra?.addEventListener('abort',cancel,{once:true});
   timer=setTimeout(()=>{local.abort();reject(new Failure('TIMEOUT'));},Math.max(1,Math.min(maxMs,this.remaining())));
  });
  try{
   const value=await Promise.race([Promise.resolve().then(()=>{if(local.signal.aborted)fail('ABORTED');return fn(local.signal);}),stopped]);
   this.assertLive();if(extra?.aborted)fail('ABORTED');return value;
  }finally{if(timer!==undefined)clearTimeout(timer);this.signal.removeEventListener('abort',cancel);extra?.removeEventListener('abort',cancel);}
 }
 spend(kind:'oauth'|'metadata'):void{
  this.assertLive();if(this.count.totalHttpRequests>=this.maxRequests)fail('BUDGET_EXHAUSTED');
  this.count.totalHttpRequests++;if(kind==='oauth')this.count.oauthRequests++;else this.count.metadataRequests++;
 }
 close():void{this.closed=true;this.root.abort();this.external?.removeEventListener('abort',this.onAbort);}
}
function cancelBody(response:Response):void{if(response.body)void response.body.cancel().catch(()=>{});}
async function boundedText(response:Response,cap:number,signal:AbortSignal):Promise<string>{
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>cap)){cancelBody(response);fail('RESPONSE_TOO_LARGE');}
 if(!response.body)fail('INVALID_RESPONSE');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{
  for(;;){
   if(signal.aborted)fail('ABORTED');
   const part=await reader.read();if(signal.aborted)fail('ABORTED');if(part.done)break;
   size+=part.value.byteLength;if(size>cap){abort();fail('RESPONSE_TOO_LARGE');}chunks.push(part.value);
  }
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('INVALID_RESPONSE');}
 }finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
async function boundedJson(response:Response,cap:number,signal:AbortSignal):Promise<unknown>{
 const type=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
 if(type!=='application/json'&&!(type?.startsWith('application/')&&type.endsWith('+json'))){cancelBody(response);fail('INVALID_RESPONSE');}
 const body=await boundedText(response,cap,signal);
 try{return JSON.parse(body) as unknown;}catch{fail('INVALID_RESPONSE');}
}
/** The only downloadable document is NAVER's authenticated, same-host master TSV. */
export async function requestNaverMasterText(session:Session,fetchPort:FetchPort,url:string,headers:Readonly<Record<string,string>>){
 let u:URL;try{u=new URL(url);}catch{fail('REQUEST_NOT_ALLOWED');}
 if(typeof window!=='undefined'||u.origin!=='https://api.searchad.naver.com'||u.username||u.password||u.hash||u.pathname!=='/report-download'||
  !u.searchParams.get('authtoken')||u.searchParams.getAll('authtoken').length!==1||url.length>4096||
  [...u.searchParams.keys()].some(k=>!['authtoken','fileVersion'].includes(k)))fail('REQUEST_NOT_ALLOWED');
 return session.run(async signal=>{
  session.spend('metadata');
  const response=await fetchPort(url,{method:'GET',headers:{...headers},redirect:'error',cache:'no-store',credentials:'omit',signal});
  if(response.redirected||(response.url&&response.url!==url)||response.status>=300&&response.status<400){cancelBody(response);fail('REQUEST_NOT_ALLOWED');}
  if(response.status!==200){cancelBody(response);return {status:response.status,body:''};}
  return {status:200,body:await boundedText(response,8*1024*1024,signal)};
 },session.requestMs);
}
/** Called only with internally constructed, provider-specific URLs and headers. */
export async function requestJson(session:Session,fetchPort:FetchPort,kind:'oauth'|'metadata',url:string,
 init:Readonly<{method:'GET'|'POST';headers:Readonly<Record<string,string>>;body?:string}>,extra?:AbortSignal):Promise<Readonly<{status:number;body:unknown}>>{
 const metaUrl=/^https:\/\/graph\.facebook\.com\/v26\.0\/[0-9]{1,20}\?fields=/.test(url)&&
  (url===`${url.split('?')[0]}?fields=${encodeURIComponent(META_CREATIVE_FIELDS)}`||url===`${url.split('?')[0]}?${META_CREATIVE_DETAIL_QUERY}`);
 const masterUrl=(init.method==='GET'&&/^https:\/\/api\.searchad\.naver\.com\/master-reports(?:\/[a-zA-Z0-9-]{1,100})?$/.test(url))||
  (init.method==='POST'&&url==='https://api.searchad.naver.com/master-reports'&&/^\{"item":"Ad","fromTime":"\d{4}-\d{2}-\d{2}T00:00:00\.000Z"\}$/.test(init.body??''));
 const allowed=kind==='oauth'
  ? url==='https://oauth2.googleapis.com/token'&&init.method==='POST'
  : /^https:\/\/api\.searchad\.naver\.com\/ncc\/ads\/nad-[a-zA-Z0-9-]{1,100}$/.test(url)&&init.method==='GET'||
    /^https:\/\/googleads\.googleapis\.com\/v25\/customers\/[0-9]{10}\/googleAds:search$/.test(url)&&init.method==='POST'||
    metaUrl&&init.method==='GET'||masterUrl;
 if(typeof window!=='undefined'||!allowed)fail('REQUEST_NOT_ALLOWED');
 return session.run(async signal=>{
  if(signal.aborted)fail('ABORTED');session.spend(kind);
  let response:Response;
  try{response=await fetchPort(url,{...init,headers:{...init.headers},redirect:'error',cache:'no-store',credentials:'omit',signal});}
  catch{if(signal.aborted)fail('ABORTED');fail('TRANSPORT_ERROR');}
  if(signal.aborted){cancelBody(response);fail('ABORTED');}
  if(response.redirected||(response.url&&response.url!==url)||response.status>=300&&response.status<400){cancelBody(response);fail('REQUEST_NOT_ALLOWED');}
  if(response.status!==200){cancelBody(response);return Object.freeze({status:response.status,body:null});}
  const body=await boundedJson(response,kind==='oauth'?65536:1048576,signal);
  return Object.freeze({status:response.status,body});
 },session.requestMs,extra);
}
