const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let cases = 0;
function load(file, modules) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: id => {
    assert.ok(id in modules, `Unexpected dependency ${id}`); return modules[id];
  }, Request, Response, URL, console, Date });
  return exports;
}
async function main() {
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const access = {reportId:uuid(1),workspaceId:uuid(2),advertiserId:uuid(3),userId:uuid(4)};
  let calls=0, deny=false, dbError=null;
  class AccessError extends Error { constructor() { super(); this.code='FORBIDDEN'; this.status=403; } }
  const db={ rpc:async()=>{ calls++;return { data:{status:'attached'},error:dbError }; },
    from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:uuid(1),current_ingestion_id:uuid(8),meta:{}}})}) };
  const route=load('app/api/reports/[id]/media-connections/route.ts',{
    'next/server':{NextResponse:Response}, '@/src/lib/supabase/admin':{getSupabaseAdmin:()=>db},
    '@/src/lib/media-sync/media-connection-access':{MediaConnectionAccessError:AccessError,
      resolveReportMediaConnectionAccess:async()=>{if(deny)throw new AccessError();return access;}},
    '@/src/lib/media-sync/daily-report-meta-attachment':{resolveDailyMetaSnapshot:async()=>uuid(9),dailyMetaAttachmentErrorMessage:c=>c},
  });
  const body={workspace_id:uuid(2),advertiser_id:uuid(3),connection_ids:[uuid(5),uuid(6)]};
  const send=(b=body,origin='https://fixture.invalid')=>route.POST(new Request('https://fixture.invalid/api/reports/id/media-connections',{
    method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(b)}),{params:Promise.resolve({id:uuid(1)})});
  for(const [b,origin] of [[body,'https://evil.invalid'],[{...body,workspace_id:uuid(99)},undefined],
    [{...body,advertiser_id:uuid(99)},undefined],[{...body,connection_ids:[uuid(5),uuid(5)]},undefined],
    [{...body,connection_ids:[]},undefined]]) {
    calls=0;assert.ok((await send(b,origin)).status>=400);assert.equal(calls,0);cases++;
  }
  deny=true;assert.equal((await send()).status,403);assert.equal(calls,0);cases++;deny=false;
  const res=await send();assert.equal(res.status,200);assert.equal((await res.json()).snapshot_ingestion_id,uuid(9));cases++;
  dbError={message:'SECRET_PROVIDER_ERROR secret-body'};
  const err=await send();assert.equal(err.status,409);assert.ok(!(await err.text()).includes('secret-body'));cases++;

  // Execute the actual click handler extracted from the builder, with only I/O mocked.
  const builder=fs.readFileSync('app/report-builder/ReportBuilderClient.tsx','utf8');
  const ast=ts.createSourceFile('builder.tsx',builder,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler;
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='openExistingReport')handler=n.getText(ast);ts.forEachChild(n,visit);}
  visit(ast);assert.ok(handler);
  const js=ts.transpileModule(handler,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  let navigation=[],posted=[],messages=[];
  const scope={creating:false,selectedReportDataSourceKind:'api',selectedAdvertiserId:uuid(3),workspaceId:uuid(2),
    selectedApiMediaConnectionIds:[uuid(5),uuid(6)],selectedApiReportConnections:[{},{}],
    loadingSelectedAdvertiserMediaConnections:false,hasCurrentAdvertiserMediaConnectionSnapshot:true,
    selectedAdvertiserMediaConnectionsError:null,router:{push:x=>navigation.push(x)},setCreating:()=>{},setLocalMsg:x=>messages.push(x),
    getAccessToken:async()=>'synthetic',safeReadJson:r=>r.json(),
    fetch:async(url,args)=>{posted.push(JSON.parse(args.body));return Response.json({ok:true});}};
  vm.createContext(scope);vm.runInContext(js,scope);
  const report={id:uuid(1),advertiser_id:uuid(3),workspace_id:uuid(2),data_source_kind:'api'};
  await scope.openExistingReport(report);assert.equal(posted.length,1);assert.equal(navigation.length,1);
  assert.deepEqual(posted[0].connection_ids,[uuid(5),uuid(6)]);cases++;
  navigation=[];posted=[];scope.fetch=async()=>Response.json({message:'Save failed'},{status:409});
  await scope.openExistingReport(report);assert.equal(navigation.length,0);assert.equal(messages.at(-1),'Save failed');cases++;
  scope.selectedApiMediaConnectionIds=[];await scope.openExistingReport(report);assert.equal(navigation.length,1);cases++;
  navigation=[];scope.selectedApiMediaConnectionIds=[uuid(5),uuid(6)];scope.loadingSelectedAdvertiserMediaConnections=true;
  await scope.openExistingReport(report);assert.equal(navigation.length,0);cases++;
  scope.loadingSelectedAdvertiserMediaConnections=false;
  await scope.openExistingReport({...report,advertiser_id:uuid(99)});assert.equal(navigation.length,1);cases++;

  // Publishing uses the combined immutable snapshot, while CAS protects the Naver source.
  const identity={source_type:'api',report_type:'db_acquisition',period_type:'daily_sync',period_key:'2020-09-01'};
  let patch,filters=[],conflict=false;
  const publishDb={from:table=>{
    let isUpdate=false;
    const result=()=>isUpdate?{data:conflict?null:{id:uuid(1)}}:{data:table==='advertisers'?{id:uuid(3),public_slug:'fixture'}:
      table==='report_types'?{key:'db'}:{id:uuid(1),advertiser_id:uuid(3),report_type_id:uuid(7),current_ingestion_id:uuid(8),
        meta:{url_contract_version:2,public_identity:identity,data_source:{kind:'api'},daily_meta_attachment:{contract:'daily_meta_attachment_v1'}}}};
    return {select(){return this;},update(p){patch=p;isUpdate=true;return this;},eq(k,v){if(isUpdate)filters.push([k,v]);return this;},
      is(){return this;},contains(){return this;},maybeSingle:async()=>result(),single:async()=>result()};
  }};
  const publish=load('src/lib/report/publish-snapshot.ts',{
    '../supabase/admin':{getSupabaseAdmin:()=>publishDb},
    '../media-sync/daily-report-meta-attachment':{resolveDailyMetaSnapshot:async()=>uuid(9)},
  });
  const input={snapshot:{reportId:uuid(1),sourceShareToken:'existing_token',currentIngestionId:uuid(8),
    currentCreativesBatchId:null,draftPeriodStart:null,draftPeriodEnd:null,periodStart:null,periodEnd:null},includePublishedAt:true};
  const published=await publish.commitReportPublishSnapshot(input);
  assert.equal(patch.published_ingestion_id,uuid(9));assert.equal(patch.current_ingestion_id,undefined);
  assert.ok(filters.some(([k,v])=>k==='current_ingestion_id'&&v===uuid(8)));assert.equal(published.publishedIngestionId,uuid(9));cases++;
  conflict=true;await assert.rejects(publish.commitReportPublishSnapshot(input),e=>e.code==='PUBLISH_CONFLICT');cases++;
  console.log(`PASS: ${cases} actual route, builder handler and publishing checks; authorization, CSRF, scope, selection persistence, failure handling and source CAS. No live requests.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
