// src/lib/sync/naverSa.ts
import crypto from "crypto";

export const NAVER_SA_BASE_URL = "https://api.searchad.naver.com";

export type NaverSaMethod = "GET" | "POST";

export type NaverSaFetchParams = {
  method: NaverSaMethod;

  /**
   * 요청 리소스 (반드시 "/"로 시작)
   * 예) "/stat-reports", "/stat-reports/{jobId}"
   */
  resource: string;

  /**
   * 서명용 리소스가 resource와 다를 때만 지정
   * - downloadUrl이 "https://api.searchad.naver.com/xxx?yyy" 같은 full url일 때
   *   서명은 pathname("/xxx")만 들어가야 하는 케이스 대응
   */
  signatureResource?: string;

  apiKey: string;
  secretKey: string;
  customerId: string;

  body?: any;

  /**
   * 기본 JSON으로 파싱 시도. 실패하면 text 그대로 반환.
   * (너 route.ts에서는 downloadText에 string이 필요해서 text가 리턴되어도 OK)
   */
};

export function makeSignature(params: {
  timestamp: string;
  method: NaverSaMethod;
  resource: string; // 서명 대상 resource (query 제외한 path 권장)
  secretKey: string;
}) {
  const { timestamp, method, resource, secretKey } = params;
  const msg = `${timestamp}.${method}.${resource}`;
  return crypto
    .createHmac("sha256", secretKey.trim())
    .update(msg)
    .digest("base64");
}

/**
 * ✅ 네이버 검색광고 API 공통 fetch
 * - 성공: JSON이면 object로, 아니면 text로 반환
 * - 실패: status + raw body 포함한 Error throw
 */
export async function naverSaFetch<T = any>(params: NaverSaFetchParams): Promise<T> {
  const { method, resource, signatureResource, apiKey, secretKey, customerId, body } = params;

  if (!resource?.startsWith("/")) {
    throw new Error(`naverSaFetch: resource must start with "/". got: ${resource}`);
  }

  const cleanApiKey = String(apiKey ?? "").trim();
  const cleanSecretKey = String(secretKey ?? "").trim();
  const cleanCustomerId = String(customerId ?? "").trim();

  if (!cleanApiKey || !cleanSecretKey || !cleanCustomerId) {
    throw new Error("naverSaFetch: missing apiKey/secretKey/customerId");
  }

  const timestamp = Date.now().toString();

  // ✅ 서명 리소스는 기본적으로 resource를 그대로 쓰되,
  // signatureResource가 있으면 그걸 사용(보통 pathname만 넣기 위함)
  const sigTarget = (signatureResource ?? resource).trim();

  // ⚠️ 네이버 서명 resource는 query를 포함하면 실패하는 케이스가 많아서,
  // signatureResource는 가능하면 pathname만 넘기는 걸 권장.
  const signature = makeSignature({
    timestamp,
    method,
    resource: sigTarget,
    secretKey: cleanSecretKey,
  });

  const url = `${NAVER_SA_BASE_URL}${resource}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Timestamp": timestamp,
      "X-API-KEY": cleanApiKey,
      "X-Customer": cleanCustomerId,
      "X-Signature": signature,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");

  // ✅ 실패면 raw를 그대로 포함해서 throw (디버깅 최강)
  if (!res.ok) {
    throw new Error(`NAVER_SA ${method} ${resource} failed: ${res.status} :: ${text}`);
  }

  // ✅ 성공이면 JSON 파싱 시도, 실패하면 text 반환
  try {
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    return text as unknown as T;
  }
}