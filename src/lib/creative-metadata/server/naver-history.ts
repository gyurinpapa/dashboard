import Papa from 'papaparse';
import {record} from '../contract';
import type {Metadata,Identity} from '../contract';
import {normalizeNaver} from '../naver';
import {readyMetadata} from '../cache/contract';
import {Session,fail,requestJson,requestNaverMasterText} from './http';
import type {FetchPort} from './http';
import {signNaver} from './transport';

type Secret={customerId:string;accessLicense:string;secretKey:string};
type HistoryTarget={identity:Identity;historySince?:string};
export const NAVER_HISTORY_REQUESTS=4;

/** Powerlink Single Ad Master: customer, group, ad, inspect, title, description, ...
 * Deleted ads retain their own IDs; never borrow text from another ad/group.
 * https://gist.github.com/naver-searchad/186ca42e1e8596b0e3dcf74e3a86c04f
 */
export function parseNaverAdMaster(body:string,targets:readonly HistoryTarget[]):Metadata[]{
 const parsed=Papa.parse<string[]>(body,{delimiter:'\t',skipEmptyLines:true});
 if(parsed.errors.length||parsed.data.length>100000)fail('INVALID_RESPONSE');
 const wanted=new Map(targets.map(t=>[t.identity.entityId,t.identity]));
 const seen=new Set<string>(),result:Metadata[]=[];
 for(const row of parsed.data){
  const identity=wanted.get(row[2]);if(!identity)continue;
  if(row.length<11||row[0]!==identity.externalAccountId||seen.has(row[2]))fail('SCOPE_MISMATCH');
  seen.add(row[2]);
  const normalized=normalizeNaver({identity,campaignType:'WEB_SITE',observation:{revision:crypto.randomUUID(),fetchedAt:new Date().toISOString()},
   ad:{customerId:row[0],nccAdId:row[2],type:'TEXT_45',ad:{headline:row[4],description:row[5]}}});
  const metadata=normalized.ok?readyMetadata(normalized.metadata,identity,Date.now()):null;
  if(metadata)result.push(metadata);
 }
 return result;
}

/** Four requests at most, under the existing account lease and reserved quota.
 * List/reuse a recent delta export; create only an Ad master when absent.
 * No ad mutation, performance endpoint, scheduler, or arbitrary download URL.
 */
export async function readNaverHistory(session:Session,fetchPort:FetchPort,secrets:Secret,targets:readonly HistoryTarget[],count:(key:string)=>void){
 const dates=targets.map(t=>t.historySince).filter((v):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&Date.parse(v)<Date.now());
 if(dates.length!==targets.length)return {status:'unavailable' as const,entries:[]};
 const fromTime=new Date(Math.min(...dates.map(d=>Date.parse(d)))-86400000).toISOString();
 async function headers(path:string,method:'GET'|'POST'='GET'){
  const now=String(Date.now());return {Accept:'application/json','Content-Type':'application/json','X-Timestamp':now,
   'X-API-KEY':secrets.accessLicense,'X-Customer':secrets.customerId,'X-Signature':await signNaver(now,path,secrets.secretKey,method)};
 }
 async function request(path:string,method:'GET'|'POST'='GET',body?:string){
  const response=await requestJson(session,fetchPort,'metadata',`https://api.searchad.naver.com${path}`,{method,headers:await headers(path,method),...(body?{body}:{})});
  count(`history_http_${response.status}`);if(response.status===429)return {limited:true,body:null};
  if(response.status!==200&&!(method==='POST'&&response.status===201))fail('INVALID_RESPONSE');return {limited:false,body:response.body};
 }
 const list=await request('/master-reports');if(list.limited)return {status:'rate_limited' as const,entries:[]};
 if(!Array.isArray(list.body)||list.body.length>1000)fail('INVALID_RESPONSE');
 const candidates=list.body.map(record).filter(j=>j.item==='Ad'&&typeof j.fromTime==='string'&&Date.parse(j.fromTime)<=Date.parse(fromTime)&&
  (['REGIST','RUNNING'].includes(String(j.status))||j.status==='BUILT'&&typeof j.updateTime==='string'&&Date.parse(j.updateTime)>Date.now()-21600000));
 let job=candidates.sort((a,b)=>Number(b.status==='BUILT')-Number(a.status==='BUILT')||Date.parse(String(b.updateTime))-Date.parse(String(a.updateTime)))[0];
 if(!job){const created=await request('/master-reports','POST',JSON.stringify({item:'Ad',fromTime}));if(created.limited)return {status:'rate_limited' as const,entries:[]};job=record(created.body);}
 if(typeof job.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(job.id)||job.item!=='Ad')fail('INVALID_RESPONSE');
 if(job.status!=='BUILT'&&job.status!=='NONE'){
  const checked=await request(`/master-reports/${job.id}`);if(checked.limited)return {status:'rate_limited' as const,entries:[]};
  const next=record(checked.body);if(next.id!==job.id||next.item!=='Ad')fail('INVALID_RESPONSE');job=next;
 }
 if(job.status==='REGIST'||job.status==='RUNNING'){count('history_pending');return {status:'pending' as const,entries:[]};}
 if(job.status==='NONE'){count('history_none');return {status:'ready' as const,entries:[]};}
 if(job.status!=='BUILT'||typeof job.downloadUrl!=='string')fail('INVALID_RESPONSE');
 const downloaded=await requestNaverMasterText(session,fetchPort,job.downloadUrl,await headers('/report-download'));
 count(`history_download_${downloaded.status}`);
 if(downloaded.status===429)return {status:'rate_limited' as const,entries:[]};
 if(downloaded.status!==200)fail('INVALID_RESPONSE');
 const entries=parseNaverAdMaster(downloaded.body,targets);for(const _ of entries)count('history_recovered');
 return {status:'ready' as const,entries};
}
