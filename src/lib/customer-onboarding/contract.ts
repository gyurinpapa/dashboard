export class CustomerError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function onboardingOrigin(env: Record<string,string|undefined> = process.env) {
  if (env.CUSTOMER_ONBOARDING_ENABLED !== 'true') throw new CustomerError('DIRECT_SIGNUP_DISABLED', 410);
  const raw = env.CUSTOMER_ONBOARDING_ORIGIN || '';
  let url: URL;
  try { url = new URL(raw); } catch { throw new CustomerError('ONBOARDING_UNAVAILABLE', 503); }
  const production = raw === 'https://app.etrylue.com';
  const preview = env.VERCEL_ENV !== 'production' && url.protocol === 'https:' && url.hostname.endsWith('.vercel.app');
  const local = env.VERCEL_ENV !== 'production' && raw === 'http://localhost:3000';
  if (url.origin !== raw || !(production || preview || local)) throw new CustomerError('ONBOARDING_UNAVAILABLE', 503);
  return raw;
}
export function registrationInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CustomerError('INVALID_INPUT');
  const v = value as Record<string,unknown>;
  const fields = new Set(['email','password','contactName','companyName','tenantType']);
  if (Object.keys(v).some(k=>!fields.has(k))) throw new CustomerError('INVALID_INPUT');
  function bounded(key: string, max: number) {
    const text = typeof v[key] === 'string' ? v[key].trim() : '';
    if (!text || text.length > max || /[\u0000-\u001f\u007f]/u.test(text)) throw new CustomerError('INVALID_INPUT');
    return text;
  }
  const email = bounded('email',254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new CustomerError('INVALID_EMAIL');
  const password = typeof v.password === 'string' ? v.password : '';
  if (password.length < 12 || password.length > 128 || password.includes('\u0000')) throw new CustomerError('INVALID_PASSWORD');
  if (v.tenantType !== 'agency' && v.tenantType !== 'advertiser') throw new CustomerError('INVALID_INPUT');
  return { email, password, contactName: bounded('contactName',80), companyName: bounded('companyName',100), tenantType:v.tenantType };
}
export function registrationAttributes(input: ReturnType<typeof registrationInput>) {
  return {email:input.email,password:input.password,email_confirm:false,
    app_metadata:{etrylue_customer_version:'1',company_name:input.companyName,contact_name:input.contactName,tenant_type:input.tenantType}};
}
