// Run with PGLITE_MODULE pointing to an independently installed @electric-sql/pglite module.
// This test never connects to a network or a Supabase project.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
if (!process.env.PGLITE_MODULE) throw new Error('PGLITE_MODULE is required (isolated test dependency)');
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const sql = await readFile(new URL('../sql/billing/test-only.sql', import.meta.url), 'utf8');
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const call = (name, p) => db.query(`select public.${name}($1::jsonb)`, [JSON.stringify(p)]);
const get = async (id) => (await db.query('select * from public.billing_test_orders where id=$1', [id])).rows[0];
const create = (extra = {}) => ({ id: randomUUID(), user_id: randomUUID(), scope: 'workspace', target_id: randomUUID(),
  workspace_id: randomUUID(), tenant_id: randomUUID(), mode: 'monthly', catalog_version: 'synthetic', amount: 99000,
  name: 'Synthetic fixture', customer_key: randomUUID(), nonce_hash: 'fixture-hash', ...extra });
const clear = () => db.exec('truncate public.billing_test_charges,public.billing_test_orders cascade');
const settle = (o, extra = {}) => ({ charge_id: o.id, amount: o.amount, payment_key: `key-${o.id}`, status: 'DONE',
  approved_at: new Date().toISOString(), paid_until: new Date(Date.now()+86400000*20).toISOString(), ...extra });
try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await check('installation requires explicit test guard', async () => {
    await assert.rejects(db.exec(sql), /Explicit isolated test/); await db.exec('rollback');
  });
  await db.exec("set etrylue.billing_test_install='isolated-tests-only'; create table public.reports(id uuid); insert into public.reports values(gen_random_uuid());");
  await check('installation refuses a database containing reports', async () => {
    await assert.rejects(db.exec(sql), /containing reports/); await db.exec('rollback; drop table public.reports');
  });
  await db.exec(sql);
  console.log((await db.query('select version()')).rows[0].version);
  await check('RLS enabled; anon cannot read or execute billing functions', async () => {
    assert.equal((await db.query("select count(*)::int n from pg_class where relname in ('billing_test_orders','billing_test_charges') and relrowsecurity")).rows[0].n, 2);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.billing_test_orders'), /permission denied/);
    await assert.rejects(call('billing_test_create', create()), /permission denied/);
    await db.exec('reset role');
  });
  await check('same checkout retries create only one order and charge', async () => {
    const o=create(); await call('billing_test_create',o); await call('billing_test_create',o);
    assert.equal((await db.query('select count(*)::int n from public.billing_test_orders')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from public.billing_test_charges')).rows[0].n,1);
    await assert.rejects(call('billing_test_create',{...o,user_id:randomUUID()}),/ORDER_CONFLICT/);
  });
  await clear();
  await check('overlapping parent and child purchases are rejected', async () => {
    const o=create(); await call('billing_test_create',o);
    await assert.rejects(call('billing_test_create',create({scope:'company',tenant_id:o.tenant_id,target_id:o.tenant_id})),/OVERLAPPING/);
    await assert.rejects(call('billing_test_create',create({scope:'advertiser',tenant_id:o.tenant_id,workspace_id:o.workspace_id})),/OVERLAPPING/);
    await call('billing_test_create',create());
  });
  await clear();
  await check('mismatched amount cannot grant an entitlement', async () => {
    const o=create(); await call('billing_test_create',o);
    await assert.rejects(call('billing_test_settle',settle(o,{amount:1})),/PAYMENT_MISMATCH/);
    assert.equal((await get(o.id)).paid_until,null);
  });
  await clear();
  await check('duplicate settlement does not extend period or cycle', async () => {
    const o=create(); await call('billing_test_create',o); const p=settle(o);
    await call('billing_test_settle',p); const before=await get(o.id);
    await call('billing_test_settle',{...p,paid_until:new Date(Date.now()+86400000*100).toISOString()});
    const after=await get(o.id); assert.equal(after.last_cycle,1); assert.deepEqual(after.paid_until,before.paid_until);
  });
  await clear();
  await check('refund then stale DONE does not resurrect access', async () => {
    const o=create(); await call('billing_test_create',o); const p=settle(o);
    await call('billing_test_settle',p); await call('billing_test_settle',{...p,status:'CANCELED'});
    await call('billing_test_settle',p); assert.equal((await get(o.id)).status,'refunded');
    assert.equal((await get(o.id)).cancel_at_period_end,true);
  });
  await clear();
  await check('partial refund fails closed for manual review', async () => {
    const o=create(); await call('billing_test_create',o); const p=settle(o);
    await call('billing_test_settle',p); await call('billing_test_settle',{...p,status:'PARTIAL_CANCELED'});
    await call('billing_test_settle',p); assert.equal((await get(o.id)).status,'review');
  });
  await clear();
  await check('refund can reconcile before initial success arrives', async () => {
    const o=create(); await call('billing_test_create',o); const p=settle(o);
    await call('billing_test_settle',{...p,status:'CANCELED'}); await call('billing_test_settle',p);
    assert.equal((await get(o.id)).status,'refunded'); assert.equal((await get(o.id)).paid_until,null);
  });
  await clear();
  await check('renewal cannot run early or after cancellation', async () => {
    const o=create(); await call('billing_test_create',o); await call('billing_test_settle',settle(o));
    const renew=()=>db.query('select public.billing_test_next_charge($1,$2)',[o.id,randomUUID()]);
    await assert.rejects(renew(),/RENEWAL_NOT_DUE/);
    await db.query('select public.billing_test_cancel($1)',[o.id]);
    await db.query("update public.billing_test_orders set paid_until=now()-interval '1 minute',billing_key_cipher='fixture' where id=$1",[o.id]);
    await assert.rejects(renew(),/RENEWAL_NOT_DUE/);
  });
  await clear();
  await check('repeat renewal reservation returns same charge; in-flight cancellation blocks', async () => {
    const o=create(); await call('billing_test_create',o); await call('billing_test_settle',settle(o));
    await db.query("update public.billing_test_orders set paid_until=now()-interval '1 minute',billing_key_cipher='fixture' where id=$1",[o.id]);
    const renew=()=>db.query('select public.billing_test_next_charge($1,$2) id',[o.id,randomUUID()]);
    assert.equal((await renew()).rows[0].id,(await renew()).rows[0].id);
    await assert.rejects(db.query('select public.billing_test_cancel($1)',[o.id]),/RECONCILIATION/);
  });
  await clear();
  await check('missed renewal cannot charge historical months automatically', async () => {
    const o=create(); await call('billing_test_create',o); await call('billing_test_settle',settle(o));
    await db.query("update public.billing_test_orders set paid_until=now()-interval '2 days',billing_key_cipher='fixture' where id=$1",[o.id]);
    await assert.rejects(db.query('select public.billing_test_next_charge($1,$2)',[o.id,randomUUID()]),/REQUIRES_REVIEW/);
  });
  console.log(`BILLING_SQL_CHECKS_PASSED=${checks}`);
} finally { await db.close(); }
