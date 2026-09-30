import type { DelegationCommand, DelegationResult } from './google-refresh-delegation-adapter';

type Manage = (input: {
  request: Request; action: 'issue' | 'revoke'; command: DelegationCommand;
}) => Promise<DelegationResult>;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const reply = (status: number, body: unknown) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

/** Bounded HTTP boundary only. The server adapter authenticates the original Request. */
export async function handleGoogleRefreshDelegationHttp(input: {
  request: Request; reportId: string; enabled: boolean; manage: Manage;
}): Promise<Response> {
  if (!input.enabled) return reply(404, { ok: false, code: 'GOOGLE_REFRESH_DISABLED' });
  const { request } = input;
  if (request.method !== 'POST') return reply(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  // Require an exact same-origin request even for Bearer requests. Do not trust forwarded hosts.
  if (request.headers.get('origin') !== new URL(request.url).origin ||
      ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? ''))
    return reply(403, { ok: false, code: 'ORIGIN_REJECTED' });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return reply(415, { ok: false, code: 'JSON_REQUIRED' });
  if (!uuid(input.reportId)) return reply(400, { ok: false, code: 'INVALID_COMMAND' });
  let body: unknown;
  const reader = request.body?.getReader();
  if (!reader) return reply(400, { ok: false, code: 'INVALID_COMMAND' });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2048) { await reader.cancel(); return reply(413, { ok: false, code: 'BODY_TOO_LARGE' }); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return reply(400, { ok: false, code: 'INVALID_COMMAND' }); }
  finally { reader.releaseLock(); }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return reply(400, { ok: false, code: 'INVALID_COMMAND' });
  const b = body as Record<string, unknown>;
  if (Object.keys(b).sort().join(',') !== 'action,generation,jobId,requestId' ||
      (b.action !== 'issue' && b.action !== 'revoke') || !uuid(b.jobId) || !uuid(b.requestId) || !uuid(b.generation))
    return reply(400, { ok: false, code: 'INVALID_COMMAND' });
  try {
    const result = await input.manage({ request, action: b.action,
      command: { requestId: b.requestId, generation: b.generation, job: { jobId: b.jobId, reportId: input.reportId } } });
    if (result.action === 'disabled') return reply(404, { ok: false, code: 'GOOGLE_REFRESH_DISABLED' });
    if (result.action === 'issued' || result.action === 'revocation_checked')
      return reply(200, { ok: true, result });
    // Authentication failures and uncertain writes are not success or automatic retry instructions.
    return reply(409, { ok: false, code: 'REVIEW_REQUIRED' });
  } catch { return reply(409, { ok: false, code: 'REVIEW_REQUIRED' }); }
}
