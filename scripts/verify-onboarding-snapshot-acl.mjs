// Synthetic in-memory PostgreSQL only. Never connects to a Supabase project.
// PGLITE_MODULE is a separately installed test tool, not an app dependency.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
if (!process.env.PGLITE_MODULE) throw new Error('PGLITE_MODULE required');
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const source = await readFile(new URL('./sql/restrict-daily-snapshot-prepare-execute.sql', import.meta.url), 'utf8');
const prep = 'public.prepare_daily_report_v2_combined_snapshot(jsonb)';
const activate = 'public.activate_daily_report_v2_combined_snapshot(jsonb)';
let count = 0;
async function test(name, run) { await run(); count++; console.log(`PASS ${name}`); }
async function state() {
  return (await db.query(`select proname, prosrc, proowner, prosecdef, proacl::text from pg_proc
    where oid in ('${prep}'::regprocedure,'${activate}'::regprocedure) order by proname`)).rows;
}
async function rejected(sql, pattern) {
  await assert.rejects(db.exec(sql), pattern);
  await db.exec('rollback; reset role;');
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.synthetic_runs(id integer generated always as identity);
    create function ${prep.replace('(jsonb)', '(payload jsonb)')} returns int language plpgsql security definer
    set search_path=pg_catalog,public as $$begin insert into public.synthetic_runs default values; return 1; end$$;
    create function ${activate.replace('(jsonb)', '(payload jsonb)')} returns int language sql security definer as $$select 2$$;
    revoke all on function ${prep},${activate} from public;
    grant execute on function ${prep} to anon,authenticated,service_role;
    grant execute on function ${activate} to service_role;`);
  const original = await state();
  await test('production hashes reject a different function without changing ACLs', async () => {
    await rejected(source, /SNAPSHOT_FUNCTION_BASELINE_CHANGED/);
    assert.deepEqual(await state(), original);
  });
  // Only the fixture hashes differ; all guards and REVOKE statements are tested unchanged.
  const hashes = (await db.query(`select proname,md5(prosrc) hash from pg_proc
    where oid in ('${prep}'::regprocedure,'${activate}'::regprocedure)`)).rows;
  const sql = source.replace('11fd8088ddb063dfa46be60b11a06a3c', hashes.find(r=>r.proname.startsWith('prepare')).hash)
    .replace('17df92c196f28727c6602ab920a48940', hashes.find(r=>r.proname.startsWith('activate')).hash);
  await test('missing server grant stops before mutation', async () => {
    await db.exec(`revoke execute on function ${prep} from service_role;`);
    const before = await state();
    await rejected(sql, /SNAPSHOT_EXECUTION_BASELINE_CHANGED/);
    assert.deepEqual(await state(), before);
    await db.exec(`grant execute on function ${prep} to service_role;`);
  });
  await test('existing activation exposure stops before mutation', async () => {
    await db.exec(`grant execute on function ${activate} to anon;`);
    const before = await state();
    await rejected(sql, /SNAPSHOT_EXECUTION_BASELINE_CHANGED/);
    assert.deepEqual(await state(), before);
    await db.exec(`revoke execute on function ${activate} from anon;`);
  });
  await test('permission change never invokes either function', async () => {
    await db.exec(sql);
    assert.equal((await db.query('select count(*)::int n from public.synthetic_runs')).rows[0].n, 0);
  });
  for (const role of ['anon', 'authenticated']) {
    await test(`${role} cannot execute preparation or activation`, async () => {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query(`select public.prepare_daily_report_v2_combined_snapshot('{}')`), /permission denied/);
      await assert.rejects(db.query(`select public.activate_daily_report_v2_combined_snapshot('{}')`), /permission denied/);
      await db.exec('reset role');
    });
  }
  await test('service role can still execute both synthetic functions', async () => {
    await db.exec('set role service_role');
    assert.equal((await db.query(`select public.prepare_daily_report_v2_combined_snapshot('{}') as n`)).rows[0].n, 1);
    assert.equal((await db.query(`select public.activate_daily_report_v2_combined_snapshot('{}') as n`)).rows[0].n, 2);
    await db.exec('reset role');
  });
  await test('function bodies owners and activation ACL are unchanged', async () => {
    const after = await state();
    assert.deepEqual(after[0], original[0]);
    assert.deepEqual(after.map(({proacl,...r})=>r), original.map(({proacl,...r})=>r));
  });
  await test('repeated application is idempotent', async () => {
    const before=await state(); await db.exec(sql); assert.deepEqual(await state(),before);
  });
  await test('inherited execute permission fails verification and rolls back', async () => {
    await db.exec(`create role inherited_rpc; grant inherited_rpc to authenticated;
      grant execute on function ${prep} to inherited_rpc;
      grant execute on function ${prep} to anon;`);
    const before=await state();
    await rejected(sql,/SNAPSHOT_EXECUTION_VERIFICATION_FAILED/);
    assert.deepEqual(await state(),before);
  });
  console.log(`PASS ${count} isolated SQL checks`);
} finally { await db.close(); }
