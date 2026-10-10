/** Only local navigation; never accept protocol-relative or encoded redirect escapes. */
export function safeNext(value: unknown, fallback = '/account'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/u.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u0020\u007f]/u.test(decoded)) return fallback;
    const url = new URL(value, 'https://etrylue.invalid');
    if (url.origin !== 'https://etrylue.invalid' || url.pathname.startsWith('/api/')) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}
export function purchaseNext(value: unknown): string {
  const path = safeNext(value);
  const url = new URL(path, 'https://etrylue.invalid');
  if (url.pathname !== '/billing/checkout') return '/account';
  const scope = url.searchParams.get('scope');
  if (!['advertiser','workspace','company'].includes(scope || '')) return '/account';
  return `/billing/checkout?scope=${scope}&mode=once`;
}
