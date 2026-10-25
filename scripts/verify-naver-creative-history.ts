import assert from 'node:assert/strict';
import {parseNaverAdMaster,readNaverHistory} from '../src/lib/creative-metadata/server/naver-history';
import {hydrateViewMetadata} from '../src/lib/creative-metadata/server/view-hydration';
import {Session,requestNaverMasterText} from '../src/lib/creative-metadata/server/http';
import {createHmac} from 'node:crypto';

const identity={workspaceId:'workspace',advertiserId:'advertiser',provider:'naver_searchad' as const,externalAccountId:'123456',entityType:'ad' as const,entityId:'nad-deleted'};
const targets=[{identity,campaignType:'WEB_SITE',historySince:'2026-09-01'}];
const secret={provider:'naver_searchad' as const,customerId:'123456',accessLicense:'fixture-license',secretKey:'fixture-secret'};
const row=(account='123456',id='nad-deleted')=>[account,'grp-fixture',id,'20','과거 소재 제목','기업 행사 케이터링 안내','','','1','2026-01-01T00:00:00Z','2026-10-20T00:00:00Z'].join('\t');
const url='https://api.searchad.naver.com/report-download?authtoken=fixture&fileVersion=v2';
const job={id:'abc123',item:'Ad',fromTime:'2026-08-31T00:00:00.000Z',updateTime:new Date().toISOString(),status:'BUILT',downloadUrl:url};
let cases=0;
async function main(){
 const restored=parseNaverAdMaster(row(),targets);assert.equal(restored[0].displayName,'과거 소재 제목');assert.equal(restored[0].identity.entityId,'nad-deleted');cases++;
 assert.deepEqual(parseNaverAdMaster(row('123456','nad-other'),targets),[]);cases++;
 assert.throws(()=>parseNaverAdMaster(row('999999'),targets));assert.throws(()=>parseNaverAdMaster(row()+'\n'+row(),targets));cases++;
 let calls:string[]=[],pending=false,limited=false,none=false,foreign=false,created=false;
 const fetcher=async(u:string,init:RequestInit)=>{
  calls.push(u);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
  const h=init.headers as Record<string,string>,path=new URL(u).pathname;
  assert.equal(h['X-Signature'],createHmac('sha256','fixture-secret').update(`${h['X-Timestamp']}.${init.method}.${path}`).digest('base64'));
  if(path==='/ncc/ads'){
   const ids=new URL(u).searchParams.get('ids')!.split(',');assert.ok(ids.length<=20);
   return Response.json(ids.includes('nad-live')?[{customerId:'123456',nccAdId:'nad-live',type:'TEXT_45',ad:{headline:'현재 소재',description:'현재 안내'}}]:[]);
  }
  if(limited)return new Response('',{status:429});
  if(path==='/master-reports'&&init.method==='GET')return Response.json(created?[]:[job]);
  if(path==='/master-reports'&&init.method==='POST'){
   assert.deepEqual(JSON.parse(init.body as string),{item:'Ad',fromTime:job.fromTime});return Response.json({...job,status:'REGIST'},{status:201});
  }
  if(path==='/master-reports/abc123')return Response.json({...job,status:pending?'RUNNING':'BUILT'});
  if(path==='/report-download')return new Response(none?'':row(foreign?'999999':'123456'));
  throw Error('unexpected endpoint');
 };
 async function history(){const session=new Session(4,4000,20000);try{return await readNaverHistory(session,fetcher,secret,targets,()=>{});}finally{session.close();}}
 assert.equal((await history()).entries.length,1);assert.equal(calls.length,2);cases++;
 calls=[];created=true;assert.equal((await history()).entries.length,1);assert.equal(calls.length,4);cases++;
 calls=[];pending=true;assert.equal((await history()).status,'pending');assert.equal(calls.length,3);cases++;
 pending=false;limited=true;assert.equal((await history()).status,'rate_limited');limited=false;created=false;cases++;
 foreign=true;await assert.rejects(history);foreign=false;cases++;
 const session=new Session(2,4000,10000);let downloads=0;
 for(const bad of ['https://evil.test/report-download?authtoken=x','https://api.searchad.naver.com/ncc/ads/nad-x?authtoken=x',url+'&extra=1'])await assert.rejects(()=>requestNaverMasterText(session,async()=>{downloads++;return new Response('');},bad,{}));
 assert.equal(downloads,0);session.close();cases++;
 const two=[...targets,{...targets[0],identity:{...identity,entityId:'nad-live'}}];
 const state={binding:{...identity,connectionId:'connection',credentialRevision:'revision'},ingestionId:'published',stamp:'same'};
 let stored:any[]=[];let outcome='',reserve=0,stale=false,snapshots=0;
 const ports={snapshot:async()=>({...state,stamp:stale&&++snapshots>=4?'changed':'same'}),targets:async()=>two,identities:async()=>two.map(x=>x.identity),read:async()=>[]};
 const deps={fetch:fetcher,secrets:async()=>secret,cache:{claim:async(x:any)=>{reserve=x.maxRequests;return {status:'leader' as const,token:'00000000-0000-4000-8000-000000000001',leaseUntil:Date.now()+60000,now:Date.now(),retryAt:0,entries:[]};},finish:async(x:any)=>{stored=x.entries;outcome=x.outcome;return true;}}};
 const input={provider:'naver_searchad' as const,externalAccountId:'123456',entityIds:two.map(t=>t.identity.entityId)};
 calls=[];const result=await hydrateViewMetadata(input,ports,deps);assert.equal(stored.length,2);assert.equal(outcome,'success');assert.equal(result.retryAt,null);assert.ok(calls.length<=reserve);cases++;
 none=true;const absent=await hydrateViewMetadata(input,ports,deps);assert.equal(stored.length,1);assert.equal(outcome,'success');assert.deepEqual(absent.unavailableEntityIds,['nad-deleted']);assert.equal(absent.retryAt,null);none=false;cases++;
 created=true;pending=true;const queued=await hydrateViewMetadata(input,ports,deps);assert.equal(stored.length,1);assert.equal(outcome,'success');assert.ok(queued.retryAt!<Date.now()+65000);created=false;pending=false;cases++;
 stored=[];stale=true;await assert.rejects(()=>hydrateViewMetadata(input,ports,deps));assert.equal(stored.length,0);cases++;
 console.log(`PASS ${cases} NAVER historical creative checks`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
