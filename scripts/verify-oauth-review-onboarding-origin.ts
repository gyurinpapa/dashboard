import assert from 'node:assert/strict';
import { onboardingOrigin } from '../src/lib/customer-onboarding/contract';

const origin = 'https://oauth-review.etrylue.com';
const database = 'https://nzudapumgzscfklgvsxw.supabase.co';
const review = {
  CUSTOMER_ONBOARDING_ENABLED: 'true',
  CUSTOMER_ONBOARDING_ORIGIN: origin,
  CUSTOMER_ONBOARDING_DATABASE_URL: database,
  NEXT_PUBLIC_SUPABASE_URL: database,
  VERCEL_ENV: 'production',
};
let checks = 0;
function test(name: string, run: () => void) {
  run(); checks++; console.log(`PASS ${name}`);
}
function denied(env: Record<string, string | undefined>) {
  assert.throws(() => onboardingOrigin(env), /DIRECT_SIGNUP_DISABLED|ONBOARDING_UNAVAILABLE/);
}

test('review signup requires its exact isolated database configuration', () => {
  assert.equal(onboardingOrigin(review), origin);
  for (const key of ['CUSTOMER_ONBOARDING_DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
    denied({ ...review, [key]: undefined });
    denied({ ...review, [key]: 'https://other-project.supabase.co' });
  }
  denied({ ...review, CUSTOMER_ONBOARDING_DATABASE_URL: 'https://rulcvpgvmmckacshkmfy.supabase.co',
    NEXT_PUBLIC_SUPABASE_URL: 'https://rulcvpgvmmckacshkmfy.supabase.co' });
});
test('signup remains explicitly opt in', () => {
  for (const enabled of [undefined, '', 'false', 'TRUE', '1'])
    denied({ ...review, CUSTOMER_ONBOARDING_ENABLED: enabled });
});
test('review origin rejects other hosts and non-canonical URLs', () => {
  for (const candidate of [
    'https://oauth-review.etrylue.com.evil.example', 'https://other.etrylue.com',
    'http://oauth-review.etrylue.com', `${origin}/`, `${origin}/signup`,
    `${origin}?x=1`, `${origin}#fragment`, 'https://user@oauth-review.etrylue.com',
    'https://oauth-review.etrylue.com:443', 'not-a-url', '',
  ]) denied({ ...review, CUSTOMER_ONBOARDING_ORIGIN: candidate });
});
test('existing production origin remains supported', () => {
  assert.equal(onboardingOrigin({ CUSTOMER_ONBOARDING_ENABLED: 'true',
    CUSTOMER_ONBOARDING_ORIGIN: 'https://app.etrylue.com', VERCEL_ENV: 'production' }),
    'https://app.etrylue.com');
});
test('preview and local origins remain unavailable in production', () => {
  for (const candidate of ['https://example.vercel.app', 'http://localhost:3000']) {
    const env = { CUSTOMER_ONBOARDING_ENABLED: 'true', CUSTOMER_ONBOARDING_ORIGIN: candidate };
    assert.equal(onboardingOrigin({ ...env, VERCEL_ENV: 'preview' }), candidate);
    denied({ ...env, VERCEL_ENV: 'production' });
  }
});
console.log(`PASS ${checks} onboarding origin boundary checks`);
