import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {normalizeMetaCreative} from '../src/lib/creative-metadata/meta';
import {normalizeNaver} from '../src/lib/creative-metadata/naver';
import {identityForRow,safeImageUrl} from '../src/lib/creative-metadata/contract';
import {cacheKeys,readyMetadata} from '../src/lib/creative-metadata/cache/contract';
import {refForRow,refKey,validateViewEntry,publicEntry} from '../src/lib/creative-metadata/view';
import {hydrateViewMetadata} from '../src/lib/creative-metadata/server/view-hydration';
import {readViewMetadata} from '../src/lib/creative-metadata/server/view-service';
import * as contract from '../src/lib/creative-metadata/contract';
import * as viewContract from '../src/lib/creative-metadata/view';
import * as http from '../src/lib/creative-metadata/server/http';
import {digest} from '../src/lib/creative-metadata/cache/contract';
import {collectCreativeMetadata} from '../src/lib/creative-metadata/collector';
let cases=0;
const identity={workspaceId:'workspace',advertiserId:'advertiser',provider:'meta_ads' as const,externalAccountId:'123456',entityType:'ad' as const,entityId:'98765'};
const observation={revision:'fixture',fetchedAt:new Date().toISOString()};
const ad={id:'98765',account_id:'123456',name:'케이터링',creative:{id:'65432',account_id:'123456',title:'행사 케이터링',body:'상담하세요',image_url:'https://scontent.xx.fbcdn.net/image.jpg'}};
const canonical={provider:'meta_ads',external_account_id:'123456',external_creative_id:'98765',external_ad_id:'98765',row_level:'creative',row_level_reason:'meta_ads_ad_daily_insights',provider_meta:{contract:'meta_contact_snapshot_v1',level:'ad'}};
async function main(){
 const normalized=normalizeMetaCreative({identity,observation,ad});assert.ok(normalized.ok);assert.equal(normalized.metadata.assets.length,1);assert.ok(readyMetadata(normalized.metadata,identity,Date.now()));cases++;
 assert.deepEqual(identityForRow(identity,canonical),identity);assert.ok(refForRow(canonical));cases++;
 for(const patch of [{external_ad_id:'other'},{external_account_id:'654321'},{row_level:'campaign'},{provider_meta:{entity_type:'ad'}}]){assert.equal(identityForRow(identity,{...canonical,...patch}),null);cases++;}
 for(const patch of [{id:'other'},{account_id:'other'},{creative:{...ad.creative,account_id:'other'}}]){assert.equal(normalizeMetaCreative({identity,observation,ad:{...ad,...patch}}).ok,false);cases++;}
 for(const url of ['https://evil.test/image.jpg','https://fbcdn.net.evil.test/x','https://user:pass@scontent.xx.fbcdn.net/x','http://scontent.xx.fbcdn.net/x']){assert.equal(safeImageUrl(url,'meta_ads'),null);cases++;}
 const expiry=Math.floor(Date.now()/1000+900).toString(16);
 const video=normalizeMetaCreative({identity,observation,ad:{...ad,creative:{id:'65432',thumbnail_url:`https://scontent.xx.fbcdn.net/video.jpg?oe=${expiry}`,object_story_spec:{video_data:{message:'영상 문구',title:'영상 제목'}}}}});
 assert.ok(video.ok);assert.equal(video.metadata.assets.length,1);assert.equal(video.metadata.assets[0].expiresAt,new Date(parseInt(expiry,16)*1000).toISOString());cases++;
 const naverIdentity={...identity,provider:'naver_searchad' as const,entityId:'nad-fixture'};
 const naver=normalizeNaver({identity:naverIdentity,observation,campaignType:'WEB_SITE',ad:{nccAdId:'nad-fixture',customerId:'123456',type:'TEXT_45',ad:{headline:'네이버 제목',description:'네이버 문구'}}});
 assert.ok(naver.ok);assert.equal(naver.metadata.displayName,'네이버 제목');assert.equal(naver.metadata.assets.length,0);cases++;
 const input={provider:'meta_ads' as const,externalAccountId:'123456',entityIds:['98765']};
 const state={binding:{...identity,connectionId:'connection',credentialRevision:'revision'},ingestionId:'published',stamp:'same'};
 let calls=0,secrets=0,finish=0,claims=0,snapshots=0,stored:any[]=[],status='leader',staleAt=Infinity,foreign=false,providerStatus=200;
 const keys=await cacheKeys(state.binding,[identity]);
 const ports={snapshot:async()=>{snapshots++;return {...state,stamp:snapshots>=staleAt?'changed':'same'};},targets:async()=>foreign?[]:[{identity}],identities:async()=>[identity],read:async()=>stored};
 const deps={secrets:async()=>{secrets++;return {provider:'meta_ads' as const,accessToken:'synthetic-token'};},cache:{claim:async()=>{claims++;return {status:status as any,token:'00000000-0000-4000-8000-000000000001',leaseUntil:Date.now()+60000,now:Date.now(),retryAt:Date.now()+60000,entries:stored};},finish:async(x:any)=>{finish++;stored=x.entries.map((e:any)=>({...e,expiresAt:Date.now()+60000}));return true;}},fetch:async(url:string,init:RequestInit)=>{calls++;assert.ok(url.startsWith('https://graph.facebook.com/v26.0/98765?fields='));assert.ok(!url.includes('synthetic-token'));assert.equal(init.redirect,'error');assert.equal(init.method,'GET');return providerStatus===200?Response.json(ad):new Response('',{status:providerStatus});}};
 const reset=()=>{calls=secrets=finish=claims=snapshots=0;stored=[];status='leader';staleAt=Infinity;foreign=false;providerStatus=200;};
 await hydrateViewMetadata(input,ports,deps);assert.equal(calls,1);assert.equal(finish,1);assert.equal(stored[0].key,keys.keys[0]);assert.ok(!JSON.stringify(stored).includes('synthetic-token'));cases++;
 const before=JSON.stringify(canonical);const view=await readViewMetadata(input,ports);assert.equal(view.entries.length,1);assert.equal(calls,1);assert.equal(JSON.stringify(canonical),before);cases++;
 for(const gate of ['busy','cooldown','budget']){reset();status=gate;assert.ok((await hydrateViewMetadata(input,ports,deps)).retryAt);assert.equal(secrets,0);assert.equal(calls,0);cases++;}
 reset();stored=[{key:keys.keys[0],metadata:normalized.metadata,expiresAt:Date.now()+60000}];status='hit';await hydrateViewMetadata(input,ports,deps);assert.equal(calls,0);assert.equal(secrets,0);cases++;
 reset();foreign=true;await assert.rejects(()=>hydrateViewMetadata(input,ports,deps));assert.equal(claims,0);assert.equal(calls,0);cases++;
 reset();staleAt=4;await assert.rejects(()=>hydrateViewMetadata(input,ports,deps));assert.equal(calls,1);assert.equal(finish,0);cases++;
 reset();providerStatus=429;assert.ok((await hydrateViewMetadata(input,ports,deps)).retryAt!>Date.now()+800000);assert.equal(stored.length,0);cases++;
 reset();await hydrateViewMetadata({...input,provider:'google_ads'},ports,deps);assert.equal(snapshots,0);assert.equal(calls,0);cases++;
 const old=await collectCreativeMetadata({enabled:true,authorizedScope:identity,targets:[{identity}],observation,maxRequests:1,requestTimeoutMs:100,totalTimeoutMs:1000},async()=>{throw Error('must not call Google');});assert.equal(old.status,'rejected');cases++;
 // Real gateway scope resolution: published share + supplemental Meta mapping, and editor projection.
 const gatewayCode=ts.transpileModule(readFileSync('src/lib/creative-metadata/server/view-gateway.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const modules:any={'server-only':{},'../contract':contract,'../view':viewContract,'./view-service':{readViewMetadata},'./http':http,'../cache/contract':{digest},'./view-hydration':{},'./cached-server':{},'../refresh-response':{},'./refresh-diagnostics':{}};
 const gatewayContext:any={exports:{},require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},Request,Response,URL,Date,console};
 vm.runInNewContext(gatewayCode,gatewayContext);
 const queries:any[]=[];
 const client:any={from:(table:string)=>{
  const filters:any[]=[];let selected='';
  const q:any={select:(fields:string)=>{selected=fields;return q;},eq:(key:string,value:any)=>{filters.push([key,value]);return q;},in:(key:string,value:any)=>{filters.push([key,value]);return q;},order:()=>q,limit:()=>q,abortSignal:()=>q,then:(resolve:any)=>{
   queries.push({table,filters,selected});
   const values:any={reports:[{id:'report',workspace_id:'workspace',advertiser_id:'advertiser',status:'ready',current_ingestion_id:'source',published_ingestion_id:'published',meta:{data_source:{kind:'api'},daily_meta_attachment:{contract:'daily_meta_attachment_v1'}}}],advertisers:[{id:'advertiser'}],report_ingestions:[{id:'published'}],report_media_connections:[{connection_id:'naver'}],daily_report_meta_connections:[{connection_id:'meta'}],daily_report_meta_snapshots:[{snapshot_ingestion_id:'projection'}],media_connections:[{id:'meta',credential_version:1,credential_ciphertext:'synthetic-encrypted'}],report_rows:filters.some(([k,v])=>k==='row->>external_creative_id'&&v!=='98765')?[]:[{row:canonical}]};
   assert.ok(table in values,table);return Promise.resolve({data:values[table],error:null}).then(resolve);
  }};return q;
 }};
 const gatewayDeps={client,authorize:async()=>({workspaceId:'workspace',advertiserId:'advertiser',userId:'user',role:'master',canRunSync:true}),googleConfig:()=>{throw Error('Google must not be touched');}};
 const gateway=gatewayContext.exports.createViewPorts(new Request('https://fixture.invalid'),{kind:'share',token:'fixture'},input,gatewayDeps);
 const signal=new AbortController().signal;const shared=await gateway.snapshot(signal);assert.equal(shared.ingestionId,'published');assert.equal(shared.binding.connectionId,'meta');cases++;
 assert.equal((await gateway.targets(shared,input,signal)).length,1);assert.ok(queries.filter(q=>q.table==='report_rows').every(q=>q.filters.some(([k,v]:any)=>k==='ingestion_id'&&v==='published')));cases++;
 assert.equal((await gateway.targets(shared,{...input,entityIds:['other']},signal)).length,0);cases++;
 const editor=gatewayContext.exports.createViewPorts(new Request('https://fixture.invalid'),{kind:'report',id:'report'},input,gatewayDeps);assert.equal((await editor.snapshot(signal)).ingestionId,'projection');cases++;
 // Execute the real browser queue class with controlled fetch; no React rendering required.
 const source=readFileSync('app/components/creative-metadata/CachedCreativePreview.tsx','utf8');
 const ast=ts.createSourceFile('reader.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='PreviewCacheReader')!;
 const output=ts.transpileModule(cls.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const sandbox:any={exports:{},refKey,validateViewEntry,view_1:{refKey,validateViewEntry},Date,Map,Set,AbortController,setTimeout,clearTimeout,MAX_REFS:400,PAGE_SIZE:20};
 vm.runInNewContext(output,sandbox);const Reader=sandbox.exports.PreviewCacheReader;
 const ref={provider:'meta_ads',externalAccountId:'123456',entityId:'98765'};
 const entry=publicEntry(normalized.metadata,Date.now()+60000);let urls:string[]=[];
 const reader=new Reader({kind:'report',reportId:'fixture',fetcher:async(url:string)=>{urls.push(url);return Response.json({status:'ready',entries:url.endsWith('/ensure')?[entry]:[]});}});
 reader.request([ref]);await new Promise(r=>setTimeout(r,150));assert.equal(urls.length,2);assert.ok(urls[1].endsWith('/ensure'));assert.equal(reader.entries.size,1);assert.equal(reader.states.get(refKey(ref as any)),'ready');reader.dispose();cases++;
 urls=[];const hit=new Reader({kind:'report',reportId:'fixture',fetcher:async(url:string)=>{urls.push(url);return Response.json({status:'ready',entries:[entry]});}});hit.request([ref]);await new Promise(r=>setTimeout(r,150));assert.equal(urls.length,1);hit.dispose();cases++;
 console.log(`PASS ${cases} creative preview checks`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
