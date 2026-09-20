import type { SafeMediaConnection } from "./types";

// Client-safe display contract. Registration and sync readiness are independent.
export type MetaAdsConnectionSummary = Pick<SafeMediaConnection,
  "id" | "workspace_id" | "advertiser_id" | "provider" | "external_account_id" |
  "external_account_name" | "status" | "has_credentials" | "last_verified_at">;

export function getMetaAdsConnectionView(input: {
  workspaceId: string;
  advertiserId: string;
  loading: boolean;
  resolved: boolean;
  error: string;
  connections: readonly MetaAdsConnectionSummary[];
}) {
  if (input.loading || !input.resolved) {
    return { label: "조회 중", description: "Meta Ads 연결 상태를 확인하고 있습니다.", ready: false };
  }
  if (input.error || input.connections.some(c => c.provider !== "meta_ads" ||
    c.workspace_id !== input.workspaceId || c.advertiser_id !== input.advertiserId)) {
    return { label: "확인 불가", description: "연결 상태를 불러오지 못했습니다. 다시 확인해 주세요.", ready: false };
  }
  const active = input.connections.filter(c => c.status === "active");
  if (active.length > 1) {
    return { label: "확인 필요", description: `등록된 계정이 ${active.length}개입니다. 사용할 계정을 확인해 주세요.`, ready: true };
  }
  if (active.length === 1) {
    const connection = active[0];
    if (!connection.has_credentials) {
      return { label: "자격증명 필요", description: "등록된 계정의 인증 정보가 없습니다.", ready: true };
    }
    if (!connection.last_verified_at || !Number.isFinite(Date.parse(connection.last_verified_at))) {
      return { label: "인증 확인 필요", description: "계정이 등록되었습니다. Meta 계정 접근 권한은 아직 확인하지 않았습니다.", ready: true };
    }
    return { label: "● 연결됨", description: "인증이 확인된 Meta Ads 계정이 있습니다.", ready: true };
  }
  if (input.connections.some(c => c.status === "error")) {
    return { label: "오류", description: "Meta Ads 연결에 오류가 있습니다. 인증 정보를 확인해 주세요.", ready: true };
  }
  return { label: "○ 미연결", description: "등록된 활성 Meta Ads 연결이 없습니다.", ready: true };
}

export function metaAdsConnectionErrorMessage(code: unknown): string {
  switch (code) {
    case "UNAUTHORIZED": return "로그인 세션을 확인한 뒤 다시 시도해 주세요.";
    case "FORBIDDEN": return "이 광고주의 매체 연결을 관리할 권한이 없습니다.";
    case "SCOPE_MISMATCH": return "광고주 또는 워크스페이스가 변경되었습니다. 연결 상태를 다시 확인해 주세요.";
    case "INVALID_INPUT": return "광고계정 ID와 액세스 토큰 입력값을 확인해 주세요.";
    case "ALREADY_EXISTS": return "이미 등록된 계정입니다. 페이지를 새로고침해 주세요.";
    case "ENCRYPTION_FAILED": return "인증 정보를 안전하게 암호화하지 못해 저장하지 않았습니다.";
    default: return "등록 결과를 확인하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
  }
}
