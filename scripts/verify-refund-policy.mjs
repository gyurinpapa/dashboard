import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE);
const db=new PGlite();
const user='11111111-1111-4111-a111-111111111111', other='22222222-2222-4222-a222-222222222222';
let checks=0;
const q=async(sql,params)=> (await db.query(sql,params)).rows;
const check=(v,w)=>{assert.deepEqual(v,w);checks++;};
try{
 await db.exec("create role anon; create role authenticated; create role service_role bypassrls; set etrylue.billing_test_install='isolated-tests-only';");
 await db.exec(await readFile('sql/billing/test-only.sql','utf8'));
 await db.exec('create table reports(id uuid primary key);');
 await assert.rejects(db.exec(await readFile('scripts/sql/billing-test-refund-policy.sql','utf8')),/ISOLATED_PAYMENT_DATABASE_REQUIRED/);checks++;
 await db.exec("rollback; comment on table reports is 'Billing sandbox synthetic CSV fixture. Not a production report schema.';");
 await db.exec(await readFile('scripts/sql/billing-test-refund-policy.sql','utf8'));
 const id=i=>`00000000-0000-4000-a000-${String(i).padStart(12,'0')}`;
 async function fixture(i,age='2 days',duration='31 days',status='active',mode='once'){
  const oid=id(i);
  await q(`insert into billing_test_orders(id,user_id,scope,target_id,mode,catalog_version,amount,name,customer_key,nonce_hash,status,anchor_at,paid_until,last_cycle)
   values($1::uuid,$2::uuid,'advertiser',$1::uuid,$3,'test',39000,'Synthetic',$1::uuid::text,'nonce',$4,now()-$5::interval,now()-$5::interval+$6::interval,1)`,[oid,user,mode,status,age,duration]);
  await q(`insert into billing_test_charges(id,order_id,cycle,amount,status,payment_key,approved_at) values($1::uuid,$1::uuid,1,39000,'done',$1::uuid::text,(select anchor_at from billing_test_orders where id=$1::uuid))`,[oid]);return oid;
 }
 const reserve=(oid,u=user)=>q('select billing_test_request_refund($1,$2) as r',[oid,u]).then(a=>a[0].r);
 const settle=(oid,status,balance,wrapper=true)=>q(`select ${wrapper?'billing_test_settle_refund':'billing_test_settle'}($1::jsonb)`,[JSON.stringify({charge_id:oid,amount:39000,payment_key:oid,status,balance_amount:balance,approved_at:new Date().toISOString(),paid_until:new Date(Date.now()+86400000).toISOString()})]);
 const a=await fixture(1);const r=await reserve(a);check(r.amount,39000);check(r.policy_version,'2026-10-11');
 check((await reserve(a)).requested_at,r.requested_at);
 await assert.rejects(reserve(a,other),/ORDER_NOT_FOUND/);checks++;
 await settle(a,'DONE',39000);check((await q('select status from billing_test_orders where id=$1',[a]))[0].status,'active');
 await settle(a,'CANCELED',0);check((await reserve(a)).status,'completed');
 await settle(a,'DONE',39000);check((await q('select status from billing_test_orders where id=$1',[a]))[0].status,'refunded');
 const b=await fixture(2,'10 days','31 days');const br=await reserve(b);
 check(br.amount,Math.ceil(39000*(Date.parse(br.period_end)-Date.parse(br.requested_at))/(Date.parse(br.period_end)-Date.parse(br.period_start))));
 assert.ok(br.amount>0&&br.amount<39000);checks++;
 await settle(b,'PARTIAL_CANCELED',39000-br.amount);
 check((await reserve(b)).status,'completed');check((await q('select status from billing_test_orders where id=$1',[b]))[0].status,'refunded');
 await settle(b,'PARTIAL_CANCELED',39000-br.amount,false);check((await q('select status from billing_test_orders where id=$1',[b]))[0].status,'refunded');
 await settle(b,'DONE',39000);check((await q('select status from billing_test_orders where id=$1',[b]))[0].status,'refunded');
 const c=await fixture(3,'29 days','30 days');const cr=await reserve(c);assert.ok(cr.amount>0&&cr.amount<2000);checks++;
 await settle(c,'PARTIAL_CANCELED',39000-cr.amount+1);
 check((await reserve(c)).status,'pending');check((await q('select status from billing_test_orders where id=$1',[c]))[0].status,'review');
 await settle(c,'PARTIAL_CANCELED',39000-cr.amount);check((await reserve(c)).status,'completed');
 const d=await fixture(4);await assert.rejects(settle(d,'PARTIAL_CANCELED',39000),/PAYMENT_MISMATCH/);checks++;
 await assert.rejects(settle(d,'DONE',0),/PAYMENT_MISMATCH/);checks++;
 await settle(d,'PARTIAL_CANCELED',10000);check((await q('select status from billing_test_orders where id=$1',[d]))[0].status,'review');
 const e=await fixture(5,'32 days');await assert.rejects(reserve(e),/REFUND_REQUIRES_REVIEW/);checks++;
 const f=await fixture(6,'2 days','31 days','active','monthly');await assert.rejects(reserve(f),/MONTHLY_NOT_AVAILABLE/);checks++;
 const g=await fixture(7,'1 day','28 days');const gr=await reserve(g);await db.exec(`update billing_test_orders set paid_until=now()-interval '1 day' where id='${g}'`);check((await reserve(g)).requested_at,gr.requested_at);
 check((await q("select has_function_privilege('anon','billing_test_request_refund(uuid,uuid)','execute') as ok"))[0].ok,false);
 check((await q("select has_function_privilege('authenticated','billing_test_settle_refund(jsonb)','execute') as ok"))[0].ok,false);
 check((await q("select has_table_privilege('authenticated','billing_test_refund_requests','select') as ok"))[0].ok,false);
 check((await q("select has_table_privilege('service_role','billing_test_refund_requests','update') as ok"))[0].ok,false);
 check((await q("select has_function_privilege('service_role','billing_test_request_refund(uuid,uuid)','execute') as ok"))[0].ok,true);
 console.log(`REFUND_SQL_VERIFIED ${checks} assertions: full/prorated, frozen retries, foreign-user denial, stale webhook, mismatch review, expiry, monthly disabled, least privilege. Live calls=0`);
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.close();}
