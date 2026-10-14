import { BillingError } from './config';
export const REGISTRATION_CATALOG = 'assignment-start-20261014';
export const REGISTRATION_APP_PROJECT = 'lpwmxtnzpgyrhphwufsd';
type Env = Record<string,string|undefined>;
/** Deliberately impossible to enable on Production. Hosted rollout requires separate review. */
export function registrationEnabled(env: Env = process.env) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== 'feat/unassigned-advertiser-20261014' ||
    env.UNASSIGNED_ADVERTISER_TEST !== REGISTRATION_CATALOG ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${REGISTRATION_APP_PROJECT}.supabase.co` ||
    env.CUSTOMER_ONBOARDING_DATABASE_URL !== env.NEXT_PUBLIC_SUPABASE_URL ||
    env.CUSTOMER_ONBOARDING_ENABLED !== 'true' || env.BILLING_REVIEW_ENABLED !== 'true' ||
    env.CUSTOMER_ONBOARDING_ORIGIN !== env.UNASSIGNED_ADVERTISER_TEST_ORIGIN ||
    env.BILLING_REVIEW_ORIGIN !== env.UNASSIGNED_ADVERTISER_TEST_ORIGIN) return false;
  try { const u=new URL(env.UNASSIGNED_ADVERTISER_TEST_ORIGIN || '');
    return u.origin===env.UNASSIGNED_ADVERTISER_TEST_ORIGIN && u.protocol==='https:' && u.hostname.endsWith('.vercel.app') && !u.username && !u.password;
  } catch { return false; }
}
export function assertRegistration() {
  if (!registrationEnabled()) throw new BillingError('REGISTRATION_TEST_ONLY',503);
}
