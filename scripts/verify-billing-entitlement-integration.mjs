// Actual Next request-cookie context, Supabase auth/client, and route; all HTTP is synthetic.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external.js');
const { workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external.js');
const { GET } = await import('../app/api/billing/entitlement/route.ts');
const ref = 'abcdefghijklmnopqrst';
const uid = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
const wid = '33333333-3333-4333-8333-333333333333';
const otherWid = '44444444-4444-4444-8444-444444444444';
const tid = '55555555-5555-4555-8555-555555555555';
const ad = '66666666-6666-4666-8666-666666666666';
const otherAd = '77777777-7777-4777-8777-777777777777';
const env = { BILLING_TEST_ENABLED: 'true', VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon',
  BILLING_TEST_PROJECT_REF: ref, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
  BILLING_TEST_ORIGIN: 'http://localhost:3000', BILLING_TEST_USER_IDS: uid };
const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
Object.assign(process.env, env);
const originalFetch = global.fetch;
let tables, authUser, authDenied, outage, calls, unexpected, checks = 0;
const expires = new Date(Date.now() + 86400000).toISOString();
function reset() {
  authUser = uid; authDenied = false; outage = ''; calls = []; unexpected = [];
  tables = {
    workspace_members: [{ user_id: uid, workspace_id: wid, role: 'admin' }],
    tenant_members: [], tenants: [{ id: tid, name: 'Synthetic company', status: 'active' }],
    workspaces: [{ id: wid, tenant_id: tid, name: 'A' }, { id: otherWid, tenant_id: tid, name: 'B' }],
    advertisers: [{ id: ad, workspace_id: wid, name: 'A' }, { id: otherAd, workspace_id: otherWid, name: 'B' }],
    billing_test_orders: [{ scope: 'advertiser', target_id: ad, workspace_id: wid, tenant_id: tid,
      status: 'active', paid_until: expires, user_id: outsider, id: 'private-order', payment_key: 'private-key' }],
  };
}
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});
function matches(row, key, filter) {
  if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
  if (filter.startsWith('gt.')) return row[key] > filter.slice(3);
  if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[key]));
  throw new Error('Unexpected synthetic filter');
}
global.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
  const method = init?.method || 'GET';
  calls.push({ path: url.pathname, method });
  try {
    assert.equal(url.origin, env.NEXT_PUBLIC_SUPABASE_URL, 'external network blocked');
    assert.ok(['GET', 'HEAD'].includes(method), 'mutations forbidden');
    if (url.pathname === '/auth/v1/user') {
      return authDenied ? json({ message: 'Invalid JWT', code: 'bad_jwt' }, 401)
        : json({ id: authUser, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
    }
    const name = url.pathname.replace('/rest/v1/', '');
    assert.ok(Object.hasOwn(tables, name), 'unknown endpoint blocked');
    if (outage === name || (outage === 'capacity' && method === 'HEAD')) return json({ message: 'Synthetic outage', code: 'SYNTHETIC' }, 503);
    let rows = tables[name];
    for (const [key, value] of url.searchParams) {
      if (key === 'select') continue;
      if (key === 'or') {
        rows = rows.filter(row => value.slice(1, -1).split(',').some(term => {
          const dot = term.indexOf('.'); return matches(row, term.slice(0, dot), term.slice(dot + 1));
        }));
      } else rows = rows.filter(row => matches(row, key, value));
    }
    const count = rows.length;
    const selection = url.searchParams.get('select');
    if (selection && selection !== '*') rows = rows.map(row => Object.fromEntries(selection.split(',').map(key => [key, row[key]])));
    return method === 'HEAD' ? new Response(null, { headers: { 'Content-Range': `0-${Math.max(0, count - 1)}/${count}` } }) : json(rows);
  } catch (error) { unexpected.push(error.message); throw error; }
};
function cookies(loggedIn) {
  if (!loggedIn) return { getAll: () => [] };
  const payload = Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`, refresh_token: 'synthetic-refresh',
    token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: { id: uid } };
  return { getAll: () => [{ name: `sb-${ref}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}` }] };
}
async function request(id = ad, loggedIn = true) {
  const response = await workAsyncStorage.run({ route: '/api/billing/entitlement' }, () =>
    workUnitAsyncStorage.run({ type: 'request', phase: 'render', cookies: cookies(loggedIn) }, () =>
      GET(new Request(`http://localhost:3000/api/billing/entitlement?advertiser=${id}`))));
  assert.deepEqual(unexpected, []);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return { status: response.status, body: await response.json() };
}
async function check(name, fn) { reset(); await fn(); checks++; console.log(`PASS ${name}`); }
try {
  await check('signed-out session rejected without database queries', async () => {
    assert.equal((await request(ad, false)).status, 401); assert.equal(calls.length, 0);
  });
  await check('invalid session rejected before target lookup', async () => {
    authDenied = true; assert.equal((await request()).status, 401);
    assert.ok(calls.every(c => c.path === '/auth/v1/user'));
  });
  await check('non-allowlisted authenticated user rejected', async () => {
    authUser = outsider; assert.equal((await request()).status, 403);
    assert.ok(calls.every(c => c.path === '/auth/v1/user'));
  });
  await check('member can assess target bought by another purchaser without exposing order data', async () => {
    const r = await request(); assert.equal(r.status, 200);
    assert.deepEqual(r.body, { assessmentOnly: true, enforced: false, eligible: true, paidUntil: expires });
    assert.ok(calls.some(c => c.path === '/auth/v1/user'));
  });
  await check('same-company different workspace denied before reading billing orders', async () => {
    assert.equal((await request(otherAd)).status, 403);
    assert.ok(!calls.some(c => c.path.includes('billing_test_orders')));
  });
  await check('revoked membership and provisional staff/client roles cannot assess', async () => {
    for (const role of ['staff', 'client', 'removed']) {
      tables.workspace_members[0].role = role;
      assert.equal((await request()).status, 403);
    }
    assert.ok(!calls.some(c => c.path.includes('billing_test_orders')));
  });
  await check('company owner alone does not grant workspace access', async () => {
    tables.workspace_members = []; tables.tenant_members = [{ user_id: uid, tenant_id: tid, role: 'owner' }];
    assert.equal((await request()).status, 403);
  });
  await check('invalid target input rejected before database queries', async () => {
    assert.equal((await request('bad-target')).status, 400);
    assert.ok(calls.every(c => c.path === '/auth/v1/user'));
  });
  await check('refund and expiry return ineligible with no enforcement', async () => {
    tables.billing_test_orders[0].status = 'refunded';
    assert.equal((await request()).body.eligible, false);
    tables.billing_test_orders[0].status = 'active'; tables.billing_test_orders[0].paid_until = '2020-01-01T00:00:00Z';
    assert.equal((await request()).body.eligible, false);
  });
  await check('workspace and company grants cover only authenticated targets', async () => {
    Object.assign(tables.billing_test_orders[0], { scope: 'workspace', target_id: wid });
    assert.equal((await request()).body.eligible, true);
    Object.assign(tables.billing_test_orders[0], { scope: 'company', target_id: tid, workspace_id: null });
    assert.equal((await request()).body.eligible, true);
    assert.equal((await request(otherAd)).status, 403);
  });
  await check('membership, grant and count storage failures return errors, not eligibility', async () => {
    for (const table of ['workspace_members', 'billing_test_orders', 'advertisers', 'capacity']) {
      outage = table; const r = await request(); assert.equal(r.status, 503); assert.equal(r.body.eligible, undefined);
    }
  });
  console.log(`ENTITLEMENT_AUTH_INTEGRATION_CHECKS_PASSED=${checks}`);
} finally {
  global.fetch = originalFetch;
  for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}
