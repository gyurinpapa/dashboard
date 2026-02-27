// src/lib/uploads/signedUrlClient.ts

type SignedUrlOk = { ok: true; url?: string; signedUrl?: string };
type SignedUrlFail = { ok: false; error?: string };
type SignedUrlRes = SignedUrlOk | SignedUrlFail;

async function safeReadJson(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * ✅ shareToken이 있으면 공개 접근 (공유페이지)
 * ✅ shareToken이 없으면 Authorization으로 접근 (로그인 페이지)
 *
 * - bucket/reportId 같은 건 클라에서 보내지 않음 (서버 정책에 맡김)
 */
export async function fetchSignedUrl(params: {
  path: string;
  shareToken?: string;
  accessToken?: string;
}) {
  const { path, shareToken, accessToken } = params;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const body: any = { path };
  if (shareToken) body.shareToken = shareToken;

  const res = await fetch("/api/uploads/signed-url", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await safeReadJson(res)) as SignedUrlRes | null;

  if (!res.ok || !json?.ok) {
    console.warn("signed-url FAIL", res.status, json);
    return null;
  }

  return (json.url as string) || (json.signedUrl as string) || null;
}