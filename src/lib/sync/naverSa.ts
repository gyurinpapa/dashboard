// lib/sync/naverSa.ts
import crypto from "crypto";

export const NAVER_SA_BASE_URL = "https://api.searchad.naver.com";

export function makeSignature(params: {
  timestamp: string;
  method: string;
  resource: string;
  secretKey: string;
}) {
  const { timestamp, method, resource, secretKey } = params;
  const message = `${timestamp}.${method}.${resource}`;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

export async function naverSaFetch<T>(params: {
  method: "GET" | "POST";
  resource: string;            // 실제 요청 URI (path+query 가능)
  signatureResource?: string;  // ✅ 서명에만 사용할 URI (기본=resource)
  apiKey: string;
  secretKey: string;
  customerId: string;
  body?: any;
}) {
  const { method, resource, signatureResource, apiKey, secretKey, customerId, body } = params;

  const timestamp = Date.now().toString();
  const sigTarget = signatureResource ?? resource;
  const signature = makeSignature({ timestamp, method, resource: sigTarget, secretKey });

  const res = await fetch(`${NAVER_SA_BASE_URL}${resource}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Timestamp": timestamp,
      "X-API-KEY": apiKey,
      "X-Customer": customerId,
      "X-Signature": signature,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    throw new Error(`NAVER_SA ${method} ${resource} failed: ${res.status} ${res.statusText} :: ${text}`);
  }

  return (json ?? (text as any)) as T;
}