import { BillingError } from './config';
import { registrationEnabled } from './registration-config';

type Env = Record<string, string | undefined>;
export const PRODUCTION_APP_PROJECT = 'rulcvpgvmmckacshkmfy';
export const TEST_APP_PROJECT = 'lpwmxtnzpgyrhphwufsd';
const testOrigin = 'https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app';

// Separate opt-in: deploying the candidate must not enable production entitlements.
export function productionReviewRequested(env: Env = process.env) {
  return env.VERCEL_ENV === 'production' && env.BILLING_REVIEW_APP_ROLLOUT === 'production-test-v1';
}
export function isolatedReviewEnabled(env: Env = process.env) {
  return registrationEnabled(env) || env.VERCEL_ENV === 'preview' &&
    env.NEXT_PUBLIC_SUPABASE_URL === `https://${TEST_APP_PROJECT}.supabase.co` &&
    env.CUSTOMER_ONBOARDING_DATABASE_URL === env.NEXT_PUBLIC_SUPABASE_URL &&
    env.CUSTOMER_ONBOARDING_ENABLED === 'true' &&
    env.CUSTOMER_ONBOARDING_ORIGIN === testOrigin && env.BILLING_REVIEW_ORIGIN === testOrigin;
}
export function reviewAppContext(env: Env = process.env) {
  if (isolatedReviewEnabled(env)) return { project: TEST_APP_PROJECT, production: false };
  if (productionReviewRequested(env) &&
      env.NEXT_PUBLIC_SUPABASE_URL === `https://${PRODUCTION_APP_PROJECT}.supabase.co` &&
      env.CUSTOMER_ONBOARDING_DATABASE_URL === env.NEXT_PUBLIC_SUPABASE_URL &&
      env.CUSTOMER_ONBOARDING_ORIGIN === 'https://app.etrylue.com' &&
      env.BILLING_REVIEW_ORIGIN === 'https://app.etrylue.com' && env.BILLING_REVIEW_ENABLED === 'true') {
    return { project: PRODUCTION_APP_PROJECT, production: true };
  }
  throw new BillingError('APP_ROLLOUT_UNAVAILABLE', 503);
}
