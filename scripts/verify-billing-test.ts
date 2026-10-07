import assert from "node:assert/strict";
import { test } from "node:test";
import { testConfig, providerKeys } from "../src/lib/billing/config";
import { isScope, periodEnd, quote } from "../src/lib/billing/catalog";
import { verifiedPayment } from "../src/lib/billing/toss";
import { POST as checkout } from "../app/api/billing/checkout/route";
import { POST as webhook } from "../app/api/billing/webhook/route";

const fixture = {
  BILLING_TEST_ENABLED: "true", VERCEL_ENV: "preview",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  BILLING_TEST_PROJECT_REF: "abcdefghijklmnopqrst", SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-placeholder",
  BILLING_TEST_ORIGIN: "http://localhost:3000", BILLING_TEST_USER_IDS: "synthetic-user",
  TOSS_TEST_CLIENT_KEY: "test_ck_synthetic", TOSS_TEST_SECRET_KEY: "test_sk_synthetic",
};
test("billing remains closed by default and on production", () => {
  assert.throws(() => testConfig({}));
  assert.throws(() => testConfig({ ...fixture, VERCEL_ENV: "production" }));
  assert.throws(() => testConfig({ ...fixture, BILLING_TEST_ENABLED: "false" }));
});
test("production database and origins rejected even when manually enabled", () => {
  assert.throws(() => testConfig({ ...fixture, BILLING_TEST_PROJECT_REF: "rulcvpgvmmckacshkmfy", NEXT_PUBLIC_SUPABASE_URL: "https://rulcvpgvmmckacshkmfy.supabase.co" }));
  for (const origin of ["https://etrylue.com", "https://www.etrylue.com", "https://app.etrylue.com", "http://remote.example", "https://user:pass@example.com", "https://example.com/path"])
    assert.throws(() => testConfig({ ...fixture, BILLING_TEST_ORIGIN: origin }));
  assert.throws(() => testConfig({ ...fixture, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }));
});
test("live keys rejected; recurring merchant keys are independent", () => {
  assert.equal(providerKeys("once", fixture).client, "test_ck_synthetic");
  assert.throws(() => providerKeys("once", { ...fixture, TOSS_TEST_SECRET_KEY: "live_sk_synthetic" }));
  assert.throws(() => providerKeys("monthly", fixture));
});
test("scope names cannot traverse the catalog prototype; prices are fixed server quotes", () => {
  assert.equal(isScope("__proto__"), false); assert.equal(isScope("toString"), false);
  assert.equal(quote("advertiser", "once").amount, 39000);
  assert.equal(quote("company", "monthly").amount, 279000);
});
test("calendar-month periods preserve Korean end-of-month anchors", () => {
  const anchor = "2026-01-31T23:30:00+09:00";
  assert.equal(periodEnd(anchor, 1), "2026-02-28T14:30:00.000Z");
  assert.equal(periodEnd(anchor, 2), "2026-03-31T14:30:00.000Z");
  assert.equal(periodEnd("2028-01-31T01:00:00+09:00", 1), "2028-02-28T16:00:00.000Z");
  assert.throws(() => periodEnd(anchor, 0));
});
const order = { id: "synthetic-order", amount: 39000 };
const payment = { paymentKey: "synthetic-key", orderId: order.id, totalAmount: order.amount, balanceAmount: order.amount,
  currency: "KRW", status: "DONE", approvedAt: "2026-10-06T00:00:00+09:00", type: "NORMAL" };
test("provider payment must match order, amount, currency, status, key and approval time", () => {
  assert.equal(verifiedPayment(payment, order).status, "DONE");
  for (const change of [{ orderId: "another-order" }, { totalAmount: 1 }, { currency: "USD" }, { status: "READY" }, { approvedAt: "bad" }, { balanceAmount: 0 }, { paymentKey: "" }])
    assert.throws(() => verifiedPayment({ ...payment, ...change }, order));
  assert.throws(() => verifiedPayment(payment, order, "another-key"));
  assert.equal(verifiedPayment({ ...payment, status: "CANCELED", balanceAmount: 0 }, order).status, "CANCELED");
});
test("disabled routes reject before auth, database or provider network access", async () => {
  const originalFetch = global.fetch;
  const enabled = process.env.BILLING_TEST_ENABLED;
  process.env.BILLING_TEST_ENABLED = "false";
  global.fetch = async () => { throw new Error("UNEXPECTED_NETWORK_CALL"); };
  try {
    const request = () => new Request("http://localhost:3000/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal((await checkout(request())).status, 503);
    assert.equal((await webhook(request())).status, 503);
  } finally {
    global.fetch = originalFetch;
    if (enabled === undefined) delete process.env.BILLING_TEST_ENABLED; else process.env.BILLING_TEST_ENABLED = enabled;
  }
});
