// Actual review routes/services and local PostgreSQL; no real HTTP, accounts or payments.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external.js');
const { workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external.js');
const { reviewConfig, providerKeys, REVIEW_PROJECT } = await import('../src/lib/billing/review/config.ts');
const { checkout, callback, manage, loadOrder } = await import('../src/lib/billing/review/server.ts');
const { NextRequest } = await import('next/server.js');
const { POST: sessionRoute } = await import('../app/api/billing/review/session/route.ts');
const { POST } = await import('../app/api/billing/review/checkout/route.ts');
const { GET: callbackRoute } = await import('../app/api/billing/review/callback/route.ts');
const { REVIEW_COOKIE } = await import('../src/lib/billing/review/auth.ts');
const uid='11111111-1111-4111-8111-111111111111', outsider='22222222-2222-4222-8222-222222222222';
const env={VERCEL_ENV:'production', BILLING_REVIEW_ENABLED:'true', BILLING_REVIEW_SUPABASE_URL:`https://${REVIEW_PROJECT}.supabase.co`,
 BILLING_REVIEW_SERVICE_ROLE_KEY:'synthetic-service',BILLING_REVIEW_ANON_KEY:'synthetic-anon',BILLING_REVIEW_ORIGIN:'https://www.etrylue.com',
 BILLING_REVIEW_USER_IDS:uid,BILLING_REVIEW_STATE_SECRET:'synthetic-state-secret-longer-than-32-characters',
 BILLING_REVIEW_TOSS_CLIENT_KEY:'test_ck_synthetic',BILLING_REVIEW_TOSS_SECRET_KEY:'test_sk_synthetic',
 NEXT_PUBLIC_SUPABASE_URL:'https://rulcvpgvmmckacshkmfy.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'must-never-be-used'};
const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])); Object.assign(process.env,env);
const originalFetch=global.fetch;
if(!process.env.PGLITE_MODULE) throw new Error('PGLITE_MODULE required (external test-only dependency)');
const {PGlite}=await import(process.env.PGLITE_MODULE); const db=new PGlite();
let calls=[],unexpected=[],checks=0,outage=false,providerCalls=0,uncertain=false,payment,authUser=uid;
let ad,wid,tid,otherAd;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
let columns;
function identifier(name, table) {
  assert.ok(columns[table]?.has(name), `Unknown column ${table}.${name}`);
  return `"${name}"`;
}
async function storage(input, init) {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
  const method = init?.method || 'GET';
  calls.push({ path: url.pathname, method });
  try {
    if (url.origin === 'https://api.tosspayments.com') {
      providerCalls++;
      assert.equal(new Headers(init.headers).get('Authorization'), `Basic ${Buffer.from(env.BILLING_REVIEW_TOSS_SECRET_KEY+':').toString('base64')}`);
      if (url.pathname === '/v1/payments/confirm') {
        assert.equal(method,'POST'); assert.equal(JSON.parse(init.body).amount,payment.totalAmount);
        assert.equal(new Headers(init.headers).get('Idempotency-Key'),`confirm-${payment.orderId}`);
        if (uncertain) return json({},503);
      } else if(url.pathname.endsWith('/cancel')) { assert.equal(method,'POST'); payment={...payment,status:'CANCELED',balanceAmount:0}; }
      else { assert.equal(method,'GET'); assert.equal(url.pathname,`/v1/payments/orders/${payment.orderId}`); }
      return json(payment);
    }
    assert.equal(url.origin, env.BILLING_REVIEW_SUPABASE_URL, 'External network forbidden');
    if(url.pathname === '/auth/v1/token') {
      assert.equal(method,'POST');assert.equal(url.searchParams.get('grant_type'),'password');
      const payload=Buffer.from(JSON.stringify({sub:authUser,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
      return json({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`,refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer',user:{id:authUser,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}});
    }
    if(url.pathname === '/auth/v1/logout') { assert.equal(method,'POST');return json({}); }
    if (url.pathname === '/auth/v1/user') {
      assert.equal(method, 'GET');
      return json({ id: authUser, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
    }
    if(url.pathname.startsWith('/rest/v1/rpc/')) {
      const name=url.pathname.split('/').at(-1), args=JSON.parse(init.body);
      assert.equal(method,'POST'); assert.ok(['billing_test_create','billing_test_settle','billing_test_cancel'].includes(name));
      if(outage) return json({message:'Synthetic outage'},503);
      try { const r=await db.query(`select ${name}($1) as value`,[name==='billing_test_cancel'?args.p_order:JSON.stringify(args.p)]); return json(r.rows[0].value); }
      catch(e) { return json({message:e.message,code:e.code},400); }
    }
    const table = url.pathname.replace('/rest/v1/', '');
    assert.ok(Object.hasOwn(columns, table), 'Unknown endpoint forbidden');
    if (outage && table === 'billing_test_orders') return json({ message: 'Synthetic outage' }, 503);
    const selection = url.searchParams.get('select');
    const selected = !selection || selection === '*' ? '*' : selection.split(',').map(s => identifier(s.trim(), table)).join(',');
    const result = await db.transaction(async tx => {
      await tx.exec('set local role service_role');
      assert.ok(['GET', 'HEAD', 'PATCH'].includes(method));
      const params = [], where = [];
      const bind = value => { params.push(value); return `$${params.length}`; };
      function predicate(key, filter) {
        const col = identifier(key, table);
        if (filter.startsWith('eq.')) return `${col} = ${bind(filter.slice(3))}`;
        if (filter === 'is.null') return `${col} is null`;
        if (filter.startsWith('gt.')) return `${col} > ${bind(filter.slice(3))}`;
        if (filter.startsWith('in.(')) return `${col} in (${filter.slice(4,-1).split(',').map(bind).join(',')})`;
        throw new Error('Unsupported SQL adapter filter');
      }
      for (const [key, value] of url.searchParams) {
        if (['select', 'limit', 'order'].includes(key)) continue;
        if (key === 'or') where.push('(' + value.slice(1,-1).split(',').map(term => {
          const dot = term.indexOf('.'); return predicate(term.slice(0,dot), term.slice(dot+1));
        }).join(' or ') + ')');
        else where.push(predicate(key, value));
      }
      const condition = where.length ? ` where ${where.join(' and ')}` : '';
      if(method === 'PATCH') {
        assert.equal(table,'billing_test_charges'); const body=JSON.parse(init.body); assert.deepEqual(Object.keys(body),['payment_key']);
        const key=bind(body.payment_key);
        return tx.query(`with changed as (update "${table}" set payment_key=${key}${condition} returning ${selected}) select row_to_json(changed) as row from changed`,params);
      }
      if (method === 'HEAD') return tx.query(`select count(*)::int as count from "${table}"${condition}`, params);
      const limit = url.searchParams.get('limit');
      if (limit) assert.match(limit, /^\d+$/);
      const order=url.searchParams.get('order');
      if(order) assert.equal(order,'cycle.desc');
      return tx.query(`select row_to_json(r) as row from (select ${selected} from "${table}"${condition}${order ? ' order by cycle desc' : ''}${limit ? ' limit '+limit : ''}) r`, params);
    });
    if (method === 'HEAD') return new Response(null, { headers: { 'Content-Range': `*/${result.rows[0].count}` } });
    const rows = result.rows.map(r => r.row);
    return json(new Headers(init?.headers).get('accept')?.includes('application/vnd.pgrst.object+json') ? rows[0] : rows, method === 'POST' ? 201 : 200);
  } catch (e) { unexpected.push(e.message); throw e; }
}

function cookies(name=REVIEW_COOKIE) {
 const payload=Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 const session={access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`,refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:uid}};
 return {getAll:()=>[{name,value:`base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`}]};
}
async function route(input,cookieName=REVIEW_COOKIE,origin=env.BILLING_REVIEW_ORIGIN) {
 const response=await workAsyncStorage.run({route:'/api/billing/review/checkout'},()=>workUnitAsyncStorage.run({type:'request',phase:'render',cookies:cookies(cookieName)},()=>POST(new Request(`${env.BILLING_REVIEW_ORIGIN}/api/billing/review/checkout`,{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(input)}))));
 assert.deepEqual(unexpected,[]); return {status:response.status,body:await response.json()};
}
async function order(scope='advertiser',target=ad) {
 const o=await checkout(uid,randomUUID(),scope,'once',target);
 payment={mId:'tetryluei6e',orderId:o.orderId,paymentKey:'synthetic-payment-'+o.orderId,totalAmount:o.amount,balanceAmount:o.amount,currency:'KRW',status:'DONE',approvedAt:new Date().toISOString(),type:'NORMAL'};
 const p=new URL(o.successUrl).searchParams; p.set('paymentKey',payment.paymentKey);p.set('orderId',o.orderId);p.set('amount',String(o.amount));
 return {o,p};
}
async function snapshot() { return JSON.stringify((await db.query('select row_to_json(o) as row from billing_test_orders o order by id')).rows); }
async function check(name,fn) {
 await db.exec('truncate billing_test_charges,billing_test_orders');calls=[];unexpected=[];outage=false;providerCalls=0;uncertain=false;authUser=uid;
 await fn();assert.deepEqual(unexpected,[]);checks++;console.log(`PASS ${name}`);
}
try {
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;create schema auth;create table auth.users(id uuid primary key);set etrylue.billing_test_install='isolated-tests-only';");
 await db.exec(await readFile(new URL('../sql/billing/test-only.sql',import.meta.url),'utf8'));
 await db.exec("set etrylue.billing_test_project='kbqyszbuxojofugqfjbh';");
 await db.exec(await readFile(new URL('../sql/billing/test-target-fixtures.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1)',[uid]);
 const rows=(await db.query('select a.id as ad,a.workspace_id as wid,w.tenant_id as tid from advertisers a join workspaces w on w.id=a.workspace_id order by a.name')).rows;
 ({ad,wid,tid}=rows[0]);otherAd=rows[1].ad;
 await db.query("insert into workspace_members values($1,$2,'admin')",[uid,wid]);
 await db.query("insert into tenant_members values($1,$2,'owner')",[uid,tid]);
 columns={};for(const r of (await db.query("select table_name,column_name from information_schema.columns where table_schema='public'")).rows)(columns[r.table_name]??=new Set()).add(r.column_name);
 global.fetch=storage;
 await check('review configuration never falls back to production app database',async()=>{
  assert.equal(reviewConfig().dbUrl,env.BILLING_REVIEW_SUPABASE_URL);
  for(const patch of [{BILLING_REVIEW_ENABLED:'false'},{BILLING_REVIEW_SUPABASE_URL:env.NEXT_PUBLIC_SUPABASE_URL},{BILLING_REVIEW_SERVICE_ROLE_KEY:''},{BILLING_REVIEW_ANON_KEY:''},{BILLING_REVIEW_ORIGIN:'https://evil.example'},{BILLING_REVIEW_ORIGIN:'https://app.etrylue.com'},{BILLING_REVIEW_USER_IDS:''}])assert.throws(()=>reviewConfig({...env,...patch}));
  assert.throws(()=>providerKeys('monthly',env));assert.throws(()=>providerKeys('once',{...env,BILLING_REVIEW_TOSS_SECRET_KEY:'live_sk_no'}));assert.throws(()=>providerKeys('once',{...env,BILLING_REVIEW_TOSS_CLIENT_KEY:'live_ck_no'}));assert.equal(calls.length,0);
 });
 await check('ordinary app auth cookies cannot log into review checkout',async()=>{
  const r=await route({id:randomUUID(),scope:'advertiser',mode:'once',targetId:ad,consent:true},'sb-production-auth-token');assert.equal(r.status,401);assert.equal(calls.length,0);
 });
 await check('review auth, allowlist, CSRF and server quote enforced',async()=>{
  const input={id:randomUUID(),scope:'advertiser',mode:'once',targetId:ad,consent:true};
  assert.equal((await route({...input,amount:1})).status,400);assert.equal((await route({...input,mode:'monthly'})).status,400);
  assert.equal((await route(input,REVIEW_COOKIE,'https://evil.example')).status,403);
  authUser=outsider;assert.equal((await route(input)).status,403);authUser=uid;
  const r=await route(input);assert.equal(r.status,200);assert.equal(r.body.amount,39000);assert.equal(r.body.mode,'once');
 });
 await check('review password login sets only its own secure HttpOnly cookies',async()=>{
  const req=()=>new NextRequest(`${env.BILLING_REVIEW_ORIGIN}/api/billing/review/session`,{method:'POST',headers:{'Content-Type':'application/json',origin:env.BILLING_REVIEW_ORIGIN},body:JSON.stringify({email:'synthetic@example.invalid',password:'synthetic-password'})});
  const r=await sessionRoute(req());assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');
  assert.ok(cookie.startsWith(REVIEW_COOKIE));assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=lax/i);assert.ok(!cookie.includes('sb-production'));
  authUser=outsider;const denied=await sessionRoute(req());assert.equal(denied.status,401);assert.equal(denied.headers.get('set-cookie'),null);
 });
 await check('review logout never clears ordinary app session cookie',async()=>{
  const c=cookies().getAll()[0];const req=new NextRequest(`${env.BILLING_REVIEW_ORIGIN}/api/billing/review/session`,{method:'POST',headers:{'Content-Type':'application/json',origin:env.BILLING_REVIEW_ORIGIN,cookie:`${c.name}=${c.value}; sb-production-auth-token=protected`},body:JSON.stringify({action:'logout'})});
  const r=await sessionRoute(req);assert.equal(r.status,200);assert.ok(r.headers.get('set-cookie').startsWith(REVIEW_COOKIE));assert.ok(!r.headers.get('set-cookie').includes('sb-production'));
 });
 await check('other workspace target rejected without order or provider call',async()=>{
  const before=await snapshot();await assert.rejects(checkout(uid,randomUUID(),'advertiser','once',otherAd));assert.equal(await snapshot(),before);assert.equal(providerCalls,0);
 });
 await check('all approved scopes preserve price and create one order on duplicate retry',async()=>{
  for(const [scope,target,amount] of [['advertiser',ad,39000],['workspace',wid,129000],['company',tid,349000]]) {
   await db.exec('truncate billing_test_charges,billing_test_orders'); const {o}=await order(scope,target);assert.equal(o.amount,amount);
   const duplicate=await checkout(uid,o.orderId,scope,'once',target);assert.equal(duplicate.orderId,o.orderId);
   assert.equal((await db.query('select count(*)::int n from billing_test_orders')).rows[0].n,1);
  }
 });
 await check('tampered callback amount, state or order ID never reaches provider',async()=>{
  const {o,p}=await order();for(const [key,value] of [['amount','1'],['state','bad'],['orderId',randomUUID()]]) {const bad=new URLSearchParams(p);bad.set(key,value);await assert.rejects(callback(uid,bad));}
  assert.equal((await loadOrder(o.orderId,uid)).status,'pending');assert.equal(providerCalls,0);
 });
 await check('verified approval persists once; duplicate callback does not extend expiry',async()=>{
  const {o,p}=await order();await callback(uid,p);assert.equal((await loadOrder(o.orderId,uid)).status,'active');const before=await snapshot();await callback(uid,p);assert.equal(await snapshot(),before);assert.equal(providerCalls,1);
 });
 await check('wrong merchant cannot settle a review order',async()=>{
  const {o,p}=await order();payment.mId='wrong';await assert.rejects(callback(uid,p));assert.equal((await loadOrder(o.orderId,uid)).status,'pending');
 });
 await check('uncertain approval reconciles authoritative provider result',async()=>{
  const {o,p}=await order();uncertain=true;await callback(uid,p);assert.equal((await loadOrder(o.orderId,uid)).status,'active');assert.equal(providerCalls,2);
 });
 await check('cancelled checkout is not marked as paid',async()=>{
  const {o,p}=await order();p.set('failed','1');await callback(uid,p);assert.equal((await loadOrder(o.orderId,uid)).status,'pending');assert.equal(providerCalls,0);
 });
 await check('full test refund persists; stale success cannot reactivate order',async()=>{
  const {o,p}=await order();await callback(uid,p);await manage(uid,o.orderId,'refund');assert.equal((await loadOrder(o.orderId,uid)).status,'refunded');const before=await snapshot();payment={...payment,status:'DONE',balanceAmount:payment.totalAmount};await manage(uid,o.orderId,'reconcile');assert.equal(await snapshot(),before);
 });
 await check('another purchaser cannot read or refund order',async()=>{
  const {o}=await order();await assert.rejects(loadOrder(o.orderId,outsider));await assert.rejects(manage(outsider,o.orderId,'refund'));assert.equal(providerCalls,0);
 });
 await check('callback redirects contain no provider key/state and are not cacheable',async()=>{
  const {p}=await order();const r=await workAsyncStorage.run({route:'/api/billing/review/callback'},()=>workUnitAsyncStorage.run({type:'request',phase:'render',cookies:cookies()},()=>callbackRoute(new Request(`${env.BILLING_REVIEW_ORIGIN}/api/billing/review/callback?${p}`))));
  assert.equal(r.status,303);const u=new URL(r.headers.get('location'));assert.equal(u.pathname,'/billing/review/result');assert.deepEqual([...u.searchParams.keys()].sort(),['order','result']);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 });
 console.log(`PUBLIC_REVIEW_SQL_CHECKS_PASSED=${checks}`);
}finally{global.fetch=originalFetch;for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await db.close();}
