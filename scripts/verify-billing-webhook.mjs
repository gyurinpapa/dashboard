// Synthetic route-to-SQL verification. Every HTTP request is intercepted; no live APIs or DB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { POST } from '../app/api/billing/webhook/route.ts';
if (!process.env.PGLITE_MODULE) throw new Error('PGLITE_MODULE required');
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const token = 'synthetic-webhook-token-not-a-real-secret';
const originalFetch = global.fetch;
const fixture = {
  BILLING_TEST_ENABLED:'true', VERCEL_ENV:'preview',
  NEXT_PUBLIC_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  BILLING_TEST_PROJECT_REF:'abcdefghijklmnopqrst', SUPABASE_SERVICE_ROLE_KEY:'synthetic',
  BILLING_TEST_ORIGIN:'http://localhost:3000', BILLING_TEST_USER_IDS:'synthetic',
  BILLING_TEST_WEBHOOK_TOKEN:token, TOSS_TEST_CLIENT_KEY:'test_ck_synthetic', TOSS_TEST_SECRET_KEY:'test_sk_synthetic',
};
const previous = Object.fromEntries(Object.keys(fixture).map(k=>[k,process.env[k]]));
Object.assign(process.env,fixture);
let dbUnavailable=false, providerUnavailable=false, calls=0, writes=0, checks=0;
const id=randomUUID(), key='synthetic-provider-key';
const order={id,user_id:randomUUID(),scope:'advertiser',target_id:randomUUID(),workspace_id:randomUUID(),tenant_id:randomUUID(),
  mode:'once',catalog_version:'synthetic',amount:39000,name:'Synthetic webhook test',customer_key:'synthetic',nonce_hash:'synthetic'};
let payment={orderId:id,paymentKey:key,totalAmount:39000,balanceAmount:39000,currency:'KRW',status:'DONE',approvedAt:'2026-10-07T00:00:00Z',type:'NORMAL'};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const send=(data={},secret=token)=>POST(new Request(`http://localhost:3000/api/billing/webhook?token=${secret}`,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventType:'PAYMENT_STATUS_CHANGED',data:{orderId:id,...data}})}));
const state=async()=>JSON.stringify((await db.query('select row_to_json(o) o,row_to_json(c) c from billing_test_orders o join billing_test_charges c on c.order_id=o.id')).rows);
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
global.fetch=async(input,init)=>{
  calls++; const url=new URL(typeof input==='string'?input:input.url ?? input.toString());
  if(url.origin==='https://api.tosspayments.com'){
    assert.equal(url.pathname,`/v1/payments/orders/${id}`); assert.equal(init?.method,'GET');
    return providerUnavailable?response({},503):response(payment);
  }
  assert.equal(url.origin,fixture.NEXT_PUBLIC_SUPABASE_URL,'unrecognized network destination blocked');
  if(dbUnavailable) return response({code:'SYNTHETIC_FAILURE',message:'synthetic'},503);
  if(url.pathname==='/rest/v1/rpc/billing_test_settle'){
    const {p}=JSON.parse(init.body);
    await db.query('select billing_test_settle($1::jsonb)',[JSON.stringify(p)]);writes++;
    return response(null);
  }
  const table=url.pathname.slice('/rest/v1/'.length);
  assert.ok(['billing_test_charges','billing_test_orders'].includes(table));
  const requested=url.searchParams.get('id').replace(/^eq\./,'');
  const result=await db.query(`select * from ${table} where id=$1`,[requested]);
  return response(result.rows);
};
try{
  await db.exec("create role anon;create role authenticated;create role service_role;set etrylue.billing_test_install='isolated-tests-only';");
  await db.exec(await readFile(new URL('../sql/billing/test-only.sql',import.meta.url),'utf8'));
  await db.query('select billing_test_create($1::jsonb)',[JSON.stringify(order)]);
  await check('missing or incorrect token rejected before network',async()=>{
    for(const value of ['', 'incorrect']) assert.equal((await send({},value)).status,403);
    assert.equal(calls,0);
  });
  await check('unknown order safely ignored without creating a charge',async()=>{
    assert.equal((await send({orderId:randomUUID()})).status,200);assert.equal(writes,0);
  });
  await check('provider mismatch cannot settle',async()=>{
    payment.totalAmount=1;assert.equal((await send()).status,409);assert.equal(writes,0);payment.totalAmount=39000;
  });
  await check('provider outage is retryable without settlement',async()=>{
    providerUnavailable=true;assert.equal((await send()).status,502);assert.equal(writes,0);providerUnavailable=false;
  });
  await check('database outage is retryable, never acknowledged as an unknown order',async()=>{
    dbUnavailable=true;try{assert.equal((await send()).status,503);}finally{dbUnavailable=false;}
  });
  await check('forged notification fields ignored; verified provider response used',async()=>{
    assert.equal((await send({status:'CANCELED',totalAmount:1,paymentKey:'forged'})).status,200);
    assert.equal((await db.query('select status from billing_test_orders')).rows[0].status,'active');
  });
  await check('three duplicate success notifications preserve all stored fields',async()=>{
    const before=await state();for(let i=0;i<3;i++)assert.equal((await send()).status,200);assert.equal(await state(),before);
  });
  await check('duplicate refund and stale success cannot extend or restore access',async()=>{
    payment={...payment,status:'CANCELED',balanceAmount:0};assert.equal((await send()).status,200);
    const before=await state();for(let i=0;i<3;i++)assert.equal((await send()).status,200);assert.equal(await state(),before);
    payment={...payment,status:'DONE',balanceAmount:39000};assert.equal((await send()).status,200);assert.equal(await state(),before);
  });
  console.log(`BILLING_WEBHOOK_CHECKS_PASSED=${checks}`);
}finally{
  global.fetch=originalFetch;for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  await db.close();
}
