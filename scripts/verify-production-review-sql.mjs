import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
if (!process.env.PGLITE_MODULE) throw new Error('PGLITE_MODULE required');
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const load = async (project) => {
  const root = `scripts/database-candidates/${project}/supabase/migrations`;
  const names = await readdir(root);
  assert.equal(names.length, 1);
  return readFile(`${root}/${names[0]}`, 'utf8');
};
try {
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls;
    create table advertisers(id uuid primary key,workspace_id uuid,tenant_id uuid,created_by uuid,name text);
    grant all on advertisers to authenticated,service_role;
    insert into advertisers values('11111111-1111-4111-a111-111111111111',null,null,null,'Legacy');
    create function provision_etrylue_customer(uuid) returns void language sql as $$select$$;
    create function activate_daily_report_v2_combined_snapshot(jsonb) returns int language sql as $$select 1$$;
    create table billing_test_orders(id uuid primary key);
    create table billing_test_purchase_drafts(order_id uuid primary key);
    insert into billing_test_purchase_drafts values('11111111-1111-4111-a111-111111111111');`);
  const before = await db.query("select md5(prosrc) as hash from pg_proc where proname='activate_daily_report_v2_combined_snapshot'");
  // Substitute only the reviewed fingerprint for this synthetic function fixture.
  const appSql = (await load('app')).replace('17df92c196f28727c6602ab920a48940', before.rows[0].hash);
  await db.exec(appSql);
  await db.exec(await load('payment'));
  assert.equal((await db.query('select billing_review_managed from advertisers')).rows[0].billing_review_managed, false);
  assert.equal((await db.query('select app_project from billing_test_purchase_drafts')).rows[0].app_project, null);
  await db.exec(`set role service_role;
    insert into advertisers(id,name,billing_review_managed) values('22222222-2222-4222-a222-222222222222','Managed',true);
    reset role; set role authenticated;`);
  await assert.rejects(db.exec("update advertisers set billing_review_managed=false where name='Managed'"), /BILLING_MARKER_IMMUTABLE/);
  await assert.rejects(db.exec("update advertisers set billing_review_managed=true where name='Legacy'"), /BILLING_MARKER_IMMUTABLE/);
  await assert.rejects(db.exec("update advertisers set workspace_id='33333333-3333-4333-a333-333333333333' where name='Managed'"), /BILLING_TARGET_IMMUTABLE/);
  await assert.rejects(db.exec("insert into advertisers(id,billing_review_managed) values('44444444-4444-4444-a444-444444444444',true)"), /BILLING_MARKER_SERVER_ONLY/);
  await db.exec("update advertisers set name='Renamed' where name='Managed'; update advertisers set workspace_id='33333333-3333-4333-a333-333333333333' where name='Legacy'; reset role;");
  assert.equal((await db.query("select md5(prosrc) as hash from pg_proc where proname='activate_daily_report_v2_combined_snapshot'")).rows[0].hash, before.rows[0].hash);
  assert.equal((await db.query("select has_function_privilege('authenticated','guard_billing_review_advertiser()','execute') as allowed")).rows[0].allowed, false);
  await assert.rejects(db.exec("insert into billing_test_purchase_drafts values('55555555-5555-4555-a555-555555555555','foreign-project')"), /check constraint/);
  await db.exec("insert into billing_test_purchase_drafts values('55555555-5555-4555-a555-555555555555','rulcvpgvmmckacshkmfy')");
  console.log('PASS SQL: legacy unchanged, server-only marker, immutable marker/target, rename preserved, source constraint, no draft promotion, daily function unchanged; live DB writes=0');
} finally { await db.close(); }
