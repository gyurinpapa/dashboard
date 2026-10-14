/* Synthetic HTTP -> actual route/service -> actual Supabase SDK -> embedded PostgreSQL.
   All fetches are intercepted; an unknown URL throws rather than accessing the network. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require(process.env.ETRYLUE_TEST_TYPESCRIPT||'typescript');
const {PGlite}=require(process.env.ETRYLUE_TEST_PGLITE||'@electric-sql/pglite');
const sdk=require(process.env.ETRYLUE_TEST_SUPABASE||'@supabase/supabase-js');
const root=path.join(__dirname,'..'),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const appUrl='https://lpwmxtnzpgyrhphwufsd.supabase.co',payUrl='https://kbqyszbuxojofugqfjbh.supabase.co',origin='https://unassigned-fixture.vercel.app';
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/unassigned-advertiser-20261014',UNASSIGNED_ADVERTISER_TEST:'assignment-start-20261014',UNASSIGNED_ADVERTISER_TEST_ORIGIN:origin,
 NEXT_PUBLIC_SUPABASE_URL:appUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-app-service',CUSTOMER_ONBOARDING_ENABLED:'true',CUSTOMER_ONBOARDING_DATABASE_URL:appUrl,
 CUSTOMER_ONBOARDING_ORIGIN:origin,BILLING_REVIEW_ORIGIN:origin,BILLING_REVIEW_ENABLED:'true',BILLING_REVIEW_SUPABASE_URL:payUrl,BILLING_REVIEW_SERVICE_ROLE_KEY:'synthetic-payment-service',
 BILLING_REVIEW_USER_IDS:[1,2,9].map(id).join(','),BILLING_REVIEW_STATE_SECRET:'S'.repeat(64),BILLING_REVIEW_TOSS_CLIENT_KEY:'test_ck_synthetic',BILLING_REVIEW_TOSS_SECRET_KEY:'test_sk_synthetic'};
const app=new PGlite(),pay=new PGlite(),payments=new Map(),modules=new Map();
let actorId=id(1),checks=0,providerReads=0,providerConfirms=0,providerCancels=0,recordFailures=0,registrationCalls=0;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
const identifier=s=>{assert.match(s,/^[a-z_][a-z0-9_]*$/i);return '"'+s+'"';};
function split(s){let depth=0,start=0,out=[];for(let i=0;i<s.length;i++){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(s[i]===','&&depth===0){out.push(s.slice(start,i));start=i+1;}}out.push(s.slice(start));return out;}
async function rest(db,url,init){
 const method=(init?.method||'GET').toUpperCase(),headers=new Headers(init?.headers),args=[];
 const param=v=>{args.push(v);return '$'+args.length;};
 function filter(value){
  for(const op of ['and','or'])if(value.startsWith(op+'(')&&value.endsWith(')'))return '('+split(value.slice(op.length+1,-1)).map(filter).join(op==='and'?' AND ':' OR ')+')';
  const [key,op,...rest]=value.split('.'),v=rest.join('.'),col=identifier(key);
  if(op==='is'){assert.equal(v,'null');return col+' IS NULL';}
  if(op==='in'){assert.ok(v.startsWith('(')&&v.endsWith(')'));const vals=split(v.slice(1,-1)).map(s=>s.replace(/^"|"$/g,''));return col+' IN ('+vals.map(param).join(',')+')';}
  const operators={eq:'=',neq:'<>',gt:'>',lt:'<',gte:'>=',lte:'<='};assert.ok(operators[op]);return col+operators[op]+param(v);
 }
 const suffix=url.pathname.replace('/rest/v1/','');
 if(suffix.startsWith('rpc/')){
  assert.equal(method,'POST');const name=suffix.slice(4);identifier(name);const input=JSON.parse(init.body);
  if(name.startsWith('etrylue_registration_'))registrationCalls++;
  if(name==='etrylue_registration_record'&&recordFailures){recordFailures--;return json({code:'P0001',message:'SYNTHETIC_REGISTRATION_FAILURE'},503);}
  const keys=Object.keys(input);const result=await db.query('select public.'+identifier(name)+'('+keys.map(k=>identifier(k)+' => '+param(typeof input[k]==='object'&&input[k]!==null&&!Array.isArray(input[k])?JSON.stringify(input[k]):input[k])).join(',')+') as value',args);
  return json(name.endsWith('_list')||name.endsWith('_many')?result.rows.map(r=>r.value):result.rows[0]?.value??null);
 }
 const table=identifier(suffix),where=[];
 for(const [key,value] of url.searchParams){if(['select','order','limit','offset'].includes(key))continue;where.push(key==='or'?filter('or'+value):filter(key+'.'+value));}
 const clause=where.length?' WHERE '+where.join(' AND '):'';
 const selected=(url.searchParams.get('select')||'*').split(',').map(s=>s==='*'?s:identifier(s)).join(',');
 let sql;
 if(method==='POST'){
  const obj=JSON.parse(init.body);assert.ok(!Array.isArray(obj));const keys=Object.keys(obj);
  sql='INSERT INTO public.'+table+' ('+keys.map(identifier).join(',')+') VALUES ('+keys.map(k=>param(obj[k])).join(',')+') RETURNING *';
 }else if(method==='PATCH'){
  const obj=JSON.parse(init.body),sets=Object.keys(obj).map(k=>identifier(k)+'='+param(obj[k]));sql='UPDATE public.'+table+' SET '+sets.join(',')+clause+' RETURNING '+selected;
 }else{assert.ok(['GET','HEAD'].includes(method));sql='SELECT '+selected+' FROM public.'+table+clause;
  if(url.searchParams.has('order'))sql+=' ORDER BY '+url.searchParams.get('order').split(',').map(v=>{const [key,dir]=v.split('.');assert.ok(['asc','desc'].includes(dir));return identifier(key)+' '+dir;}).join(',');
  if(url.searchParams.has('limit')){const limit=Number(url.searchParams.get('limit'));assert.ok(Number.isSafeInteger(limit)&&limit>=0);sql+=' LIMIT '+limit;}
 }
 const result=await db.query(sql,args),rows=result.rows;
 if(method==='HEAD')return new Response(null,{status:200,headers:{'Content-Range':`0-0/${rows.length}`}});
 if(headers.get('Accept')?.includes('vnd.pgrst.object'))return rows.length===1?json(rows[0]):json({code:'PGRST116',message:'Expected single row'},406);
 return json(rows,method==='POST'?201:200);
}
async function interceptedFetch(input,init={}){
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if([appUrl,payUrl].includes(url.origin)){
  try{return await rest(url.origin===appUrl?app:pay,url,init);}catch(error){return json({code:error.code||'P0001',message:error.message},error.code==='23505'?409:400);}
 }
 if(url.origin==='https://api.tosspayments.com'){
  const body=init.body?JSON.parse(init.body):null;
  if(url.pathname==='/v1/payments/confirm'){
   providerConfirms++;const p=payments.get(body.orderId);assert.ok(p);assert.equal(body.amount,p.totalAmount);assert.equal(body.paymentKey,p.paymentKey);return json(p);
  }
  if(url.pathname.startsWith('/v1/payments/orders/')){providerReads++;const p=payments.get(url.pathname.split('/').pop());assert.ok(p);return json(p);}
  if(url.pathname.endsWith('/cancel')){
   providerCancels++;const p=[...payments.values()].find(p=>url.pathname.includes(p.paymentKey));assert.ok(p);assert.ok(body.cancelAmount>0&&body.cancelAmount<=p.balanceAmount);
   p.balanceAmount-=body.cancelAmount;p.status=p.balanceAmount===0?'CANCELED':'PARTIAL_CANCELED';return json(p);
  }
 }
 throw new Error('UNINTERCEPTED_NETWORK_REQUEST: '+url.origin);
}
function load(file){
 file=path.resolve(root,file);if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 function required(name){
  if(name==='server-only')return {};
  if(name==='@supabase/supabase-js')return {createClient:(url,key,options={})=>sdk.createClient(url,key,{...options,global:{...options.global,fetch:options.global?.fetch||interceptedFetch}})};
  if(name==='@/lib/supabase/auth-server')return {sbAuth:async()=>({user:{id:actorId,email_confirmed_at:'2026-01-01',app_metadata:{}},error:null})};
  if(name==='@/lib/media-sync/media-connection-access-policy')return {resolveTrueMasterStatus:({email,hasMasterMembership})=>email==='gyurinpapakimdh@gmail.com'&&hasMasterMembership};
  if(name==='next/server')return {NextResponse:{json:(data,options={})=>json(data,options.status||200,options.headers)}};
  if(name.startsWith('node:'))return require(name);
  const target=name.startsWith('@/lib/')?path.join(root,'src/lib',name.slice(6)):name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name);
  return load(target+(path.extname(target)?'':'.ts'));
 }
 const c=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true});
 assert.equal(c.diagnostics.filter(d=>d.category===1).length,0);
 vm.runInNewContext(c.outputText,{module,exports:module.exports,require:required,process:{env},fetch:interceptedFetch,URL,Request,Response,Headers,AbortSignal,Date,Buffer,TextDecoder,TextEncoder,console},{filename:file});return module.exports;
}
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
function request(body,url='/api/billing/review/checkout'){return new Request(origin+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});}
async function main(){try{
 const roles="create role anon;create role authenticated;create role service_role bypassrls;";
 await app.exec(roles+`create schema auth;create table auth.users(id uuid primary key);
 create table companies(id uuid primary key);create table profiles(id uuid primary key,company_id uuid not null,email text);
 create table tenants(id uuid primary key,status text);create table tenant_members(tenant_id uuid,user_id uuid,role text,primary key(tenant_id,user_id));
 create table workspaces(id uuid primary key,name text,company_id uuid,tenant_id uuid,unique(tenant_id,id));
 create table workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
 create table advertisers(id uuid primary key,workspace_id uuid not null references workspaces(id),tenant_id uuid,created_by uuid references auth.users(id),name text not null,billing_review_managed boolean not null default false,foreign key(tenant_id,workspace_id) references workspaces(tenant_id,id));
 grant usage on schema public,auth to service_role;grant select,update on profiles,tenant_members,tenants,workspaces,workspace_members to service_role;grant select,insert on advertisers to service_role;`);
 await app.exec("set etrylue.registration_candidate='isolated-candidate-only';"+fs.readFileSync(path.join(root,'scripts/sql/unassigned-advertiser-storage-candidate.sql'),'utf8'));
 for(const n of [1,2,9]){await app.query('insert into auth.users values($1)',[id(n)]);await app.query('insert into profiles values($1,$2,$3)',[id(n),id(n===9?102:101),'fixture'+n+'@example.invalid']);}
 for(const c of [101,102])await app.query('insert into companies values($1)',[id(c)]);
 for(const t of [201,202])await app.query("insert into tenants values($1,'active')",[id(t)]);
 for(const [u,t,r] of [[1,201,'member'],[2,201,'owner'],[9,202,'owner']])await app.query('insert into tenant_members values($1,$2,$3)',[id(t),id(u),r]);
 for(const [w,c,t] of [[301,101,201],[302,101,201],[303,102,202]])await app.query('insert into workspaces values($1,$2,$3,$4)',[id(w),'Workspace '+w,id(c),id(t)]);
 for(const [w,u,r] of [[301,1,'staff'],[301,2,'admin'],[302,2,'admin'],[303,9,'admin']])await app.query('insert into workspace_members values($1,$2,$3)',[id(w),id(u),r]);
 await pay.exec(roles+"set etrylue.billing_test_install='isolated-tests-only';"+fs.readFileSync(path.join(root,'sql/billing/test-only.sql'),'utf8'));
 await pay.exec(fs.readFileSync(path.join(root,'scripts/sql/billing-test-refund-policy.sql'),'utf8'));
 await pay.exec(fs.readFileSync(path.join(root,'scripts/sql/billing-test-purchase-drafts.sql'),'utf8'));
 await pay.exec("set etrylue.registration_candidate='isolated-candidate-only';"+fs.readFileSync(path.join(root,'scripts/sql/unassigned-advertiser-payment-drafts-candidate.sql'),'utf8'));
 await app.exec('set role service_role');await pay.exec('set role service_role');
 const api=load('app/api/billing/review/checkout/route.ts'),manage=load('app/api/billing/review/manage/route.ts'),assignment=load('app/api/billing/registrations/route.ts');
 const server=load('src/lib/billing/review/server.ts'),gate=load('src/lib/billing/review/creation-gate.ts'),config=load('src/lib/billing/review/registration-config.ts');
 const input={id:id(601),scope:'advertiser',mode:'once',targetId:'new',newAdvertiserName:'신규 테스트',consent:true};
 await test('Production cannot enable the new flow',async()=>assert.equal(config.registrationEnabled({...env,VERCEL_ENV:'production'}),false));
 await test('other branch cannot enable the new flow',async()=>assert.equal(config.registrationEnabled({...env,VERCEL_GIT_COMMIT_REF:'main'}),false));
 await test('production DB cannot enable the new flow',async()=>assert.equal(config.registrationEnabled({...env,NEXT_PUBLIC_SUPABASE_URL:'https://rulcvpgvmmckacshkmfy.supabase.co'}),false));
 await test('spoofed price rejected',async()=>assert.equal((await api.POST(request({...input,amount:1}))).status,400));
 await test('client workspace rejected in new purchase',async()=>assert.equal((await api.POST(request({...input,workspaceId:id(301)}))).status,400));
 await test('invalid origin rejected',async()=>{const r=request(input);r.headers.set('Origin','https://evil.invalid');assert.equal((await api.POST(r)).status,403)});
 const response=await api.POST(request(input));assert.equal(response.status,200);const order=await response.json();
 await test('name-only checkout creates pending ledger without workspace',async()=>{const o=(await pay.query('select * from billing_test_orders where id=$1',[input.id])).rows[0];assert.equal(o.workspace_id,null);assert.equal(o.catalog_version,'assignment-start-20261014');assert.equal(o.status,'pending');assert.equal((await app.query('select count(*)::int n from advertisers')).rows[0].n,0)});
 await test('no approval means no registration',async()=>assert.equal((await app.query('select count(*)::int n from etrylue_registration_private.advertisers')).rows[0].n,0));
 await test('checkout retry reuses immutable draft',async()=>assert.equal((await api.POST(request(input))).status,200));
 await test('same order different name conflicts',async()=>assert.equal((await api.POST(request({...input,newAdvertiserName:'Changed'}))).status,409));
 payments.set(input.id,{mId:'tetryluei6e',paymentKey:'test_payment_601',orderId:input.id,totalAmount:39000,balanceAmount:39000,currency:'KRW',type:'NORMAL',status:'DONE',approvedAt:'2026-01-01T00:00:00Z'});
 const params=new URL(order.successUrl).searchParams;params.set('paymentKey','test_payment_601');params.set('orderId',input.id);params.set('amount','39000');
 recordFailures=1;
 await server.callback(id(1),params);
 const registered=(await app.query('select * from etrylue_registration_private.advertisers where order_id=$1',[input.id])).rows[0];
 await test('verified callback recovers registration after injected storage failure',async()=>{assert.equal(registered.payment_status,'verified');assert.equal(registered.workspace_id,null);assert.equal(registered.started_at,null);assert.equal(providerConfirms,1);assert.equal((await app.query('select count(*)::int n from advertisers')).rows[0].n,0)});
 await test('unassigned advertiser blocked by actual entitlement service',async()=>assert.equal((await gate.reportCreationAccess(registered.advertiser_id,id(301))).eligible,false));
 await test('buyer sees pending list without manager destinations',async()=>{const r=await assignment.GET(new Request(origin+'/api/billing/registrations'));assert.equal(r.status,200);const data=await r.json();assert.equal(data.registrations[0].destinations.length,0)});
 actorId=id(9);const oldReads=providerReads;
 await test('other company assignment rejected before provider work',async()=>{const r=await assignment.POST(request({orderId:input.id,workspaceId:id(303)},'/api/billing/registrations'));assert.equal(r.status,404);assert.equal(providerReads,oldReads)});
 actorId=id(2);
 await test('manager list exposes only buyer-accessible destinations',async()=>{const data=await (await assignment.GET(new Request(origin+'/api/billing/registrations'))).json();assert.deepEqual(data.registrations[0].destinations.map(w=>w.id),[id(301)])});
 await test('client actor spoof rejected',async()=>assert.equal((await assignment.POST(request({orderId:input.id,workspaceId:id(301),userId:id(9)},'/api/billing/registrations'))).status,400));
 const assignedResponse=await assignment.POST(request({orderId:input.id,workspaceId:id(301)},'/api/billing/registrations'));assert.equal(assignedResponse.status,200);const assigned=await assignedResponse.json();
 await test('manager assignment creates advertiser once and starts service',async()=>{assert.equal(assigned.workspaceId,id(301));assert.ok(Date.parse(assigned.startedAt)>Date.parse(registered.approved_at));assert.equal((await app.query('select count(*)::int n from advertisers where id=$1',[registered.advertiser_id])).rows[0].n,1)});
 await test('actual entitlement uses assignment period despite expired approval period',async()=>{assert.ok(Date.parse((await pay.query('select paid_until from billing_test_orders where id=$1',[input.id])).rows[0].paid_until)<Date.now());const access=await gate.reportCreationAccess(registered.advertiser_id,id(301));assert.equal(access.eligible,true);assert.equal(Date.parse(access.paidUntil),Date.parse(assigned.paidUntil))});
 await test('assignment retry preserves start and end',async()=>{const x=await (await assignment.POST(request({orderId:input.id,workspaceId:id(301)},'/api/billing/registrations'))).json();assert.equal(x.startedAt,assigned.startedAt);assert.equal(x.paidUntil,assigned.paidUntil)});
 await test('foreign workspace cannot use the new entitlement',async()=>assert.equal((await gate.reportCreationAccess(registered.advertiser_id,id(302))).eligible,false));
 // Synthetic clock fixture for a meaningful partial-refund scenario, never a hosted write.
 await app.exec("reset role;update etrylue_registration_private.advertisers set started_at=clock_timestamp()-interval '14 days',paid_until=clock_timestamp()+interval '14 days';set role service_role;");
 actorId=id(1);
 const refundedResponse=await manage.POST(request({orderId:input.id,action:'refund'},'/api/billing/review/manage'));assert.equal(refundedResponse.status,200);
 const refunded=(await app.query('select * from etrylue_registration_private.advertisers where order_id=$1',[input.id])).rows[0];
 await test('actual manage route reserves and confirms prorated provider refund',async()=>{assert.ok(refunded.refund_amount>0&&refunded.refund_amount<39000);assert.equal(refunded.payment_status,'refunded');assert.equal(providerCancels,1)});
 await test('refund blocks actual report creation access',async()=>assert.equal((await gate.reportCreationAccess(registered.advertiser_id,id(301))).eligible,false));
 await test('refund retains advertiser',async()=>assert.equal((await app.query('select count(*)::int n from advertisers where id=$1',[registered.advertiser_id])).rows[0].n,1));
 await test('refund retry does not cancel twice',async()=>{assert.equal((await manage.POST(request({orderId:input.id,action:'refund'},'/api/billing/review/manage'))).status,200);assert.equal(providerCancels,1)});
 await test('duplicate callback cannot resurrect refunded entitlement',async()=>{await server.callback(id(1),params);assert.equal((await gate.reportCreationAccess(registered.advertiser_id,id(301))).eligible,false)});
 const deniedInput={...input,id:id(603)};const deniedOrder=await (await api.POST(request(deniedInput))).json();
 const invalidParams=new URL(deniedOrder.successUrl).searchParams;invalidParams.set('state','invalid');const readsBefore=providerReads;
 await test('forged callback state rejected before provider access',async()=>{await assert.rejects(()=>server.callback(id(1),invalidParams),/INVALID_STATE/);assert.equal(providerReads,readsBefore)});
 const legacyOrigin='https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app';
 env.UNASSIGNED_ADVERTISER_TEST='';env.CUSTOMER_ONBOARDING_ORIGIN=legacyOrigin;env.BILLING_REVIEW_ORIGIN=legacyOrigin;
 const legacyRequest=(body)=>new Request(legacyOrigin+'/api/billing/review/checkout',{method:'POST',headers:{Origin:legacyOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const callsBefore=registrationCalls;
 const legacyInput={...input,id:id(604),workspaceId:id(301),newAdvertiserName:'Legacy flow'};
 const legacyResponse=await api.POST(legacyRequest(legacyInput));assert.equal(legacyResponse.status,200);const legacyOrder=await legacyResponse.json();
 await test('legacy checkout keeps explicit workspace and catalog',async()=>{const row=(await pay.query('select * from billing_test_orders where id=$1',[legacyInput.id])).rows[0];assert.equal(row.workspace_id,id(301));assert.equal(row.catalog_version,'etrylue-once-20261009')});
 payments.set(legacyInput.id,{mId:'tetryluei6e',paymentKey:'test_payment_604',orderId:legacyInput.id,totalAmount:39000,balanceAmount:39000,currency:'KRW',type:'NORMAL',status:'DONE',approvedAt:new Date().toISOString()});
 const legacyParams=new URL(legacyOrder.successUrl).searchParams;legacyParams.set('paymentKey','test_payment_604');legacyParams.set('orderId',legacyInput.id);legacyParams.set('amount','39000');
 await server.callback(id(1),legacyParams);await server.manage(id(1),legacyInput.id,'prepare');
 const legacyRow=(await pay.query('select * from billing_test_orders where id=$1',[legacyInput.id])).rows[0];
 await test('legacy prepare still creates its advertiser',async()=>assert.equal((await app.query('select count(*)::int n from advertisers where id=$1',[legacyRow.target_id])).rows[0].n,1));
 await test('legacy entitlement still uses payment approval period',async()=>{const access=await gate.reportCreationAccess(legacyRow.target_id,id(301));assert.equal(access.eligible,true);assert.equal(Date.parse(access.paidUntil),new Date(legacyRow.paid_until).getTime())});
 await test('disabled feature causes zero registration RPCs on legacy path',async()=>assert.equal(registrationCalls,callsBefore));
 await test('disabled feature never reclassifies a new managed advertiser as unrestricted',async()=>assert.equal((await gate.reportCreationAccess(registered.advertiser_id,id(301))).eligible,false));
 console.log(`UNASSIGNED_FLOW_PASS: ${checks} scenarios; actual routes/services/SDK and synthetic PostgreSQL; provider/network intercepted`);
 }finally{await app.close();await pay.close();}}
main().catch(error=>{console.error(error);process.exitCode=1});
