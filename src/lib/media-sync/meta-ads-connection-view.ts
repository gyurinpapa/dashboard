import type { SafeMediaConnection } from "./types";

// Client-safe display contract. Registration and sync readiness are independent.
export type MetaAdsConnectionSummary = Pick<SafeMediaConnection,
  "id" | "workspace_id" | "advertiser_id" | "provider" | "external_account_id" |
  "external_account_name" | "status" | "has_credentials" | "last_verified_at"> & { meta?: Record<string, unknown> };

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
    return { label: "● 연결됨", description: "Meta 광고 계정 접근을 확인했습니다.", ready: true, connected: true };
  }
  if (input.connections.some(c => c.status === "error")) {
    return { label: "오류", description: "Meta Ads 연결에 오류가 있습니다. 인증 정보를 확인해 주세요.", ready: true };
  }
  return { label: "○ 미연결", description: "등록된 활성 Meta Ads 연결이 없습니다.", ready: true };
}

export function metaAdsConnectionErrorMessage(code: unknown): string {
  switch (code) {
    case "META_SETUP_INVALID_INPUT": return "계정 정보와 웹사이트 문의 집계 동의 항목을 확인해 주세요.";
    case "META_SETUP_CONFIRM_CONVERSION": return "이 계정에서 웹사이트 문의를 문의·상담 신청으로 집계하는지 확인해 주세요.";
    case "META_SETUP_INVALID_RANGE": return "수집 시작일은 어제까지, 최근 1년 범위에서 선택해 주세요.";
    case "META_SETUP_UNSUPPORTED_ACCOUNT": return "현재 자동 수집은 통화 KRW, 시간대 Asia/Seoul인 Meta 광고계정을 지원합니다.";
    case "META_SETUP_VERIFICATION_FAILED": return "계정 권한 또는 성과 조회를 확인하지 못했습니다. 토큰과 광고계정 권한을 확인한 뒤 다시 시도해 주세요.";
    case "META_SETUP_SAVE_FAILED": return "자동 수집 설정을 저장하지 못했습니다. 연결 상태를 새로고침해 주세요.";
    case "META_CONTACT_CHANGED": return "확인 중 계정 설정이 변경됐습니다. 새로고침 후 다시 시도해 주세요.";
    case "META_CONTACT_RECONCILIATION_FAILED": return "계정 합계와 광고별 성과가 일치하지 않아 자동 수집을 시작하지 않았습니다. 잠시 후 다시 확인해 주세요.";
    case "UNAUTHORIZED": return "로그인 세션을 확인한 뒤 다시 시도해 주세요.";
    case "FORBIDDEN": return "이 광고주의 매체 연결을 관리할 권한이 없습니다.";
    case "SCOPE_MISMATCH": return "광고주 또는 워크스페이스가 변경되었습니다. 연결 상태를 다시 확인해 주세요.";
    case "INVALID_INPUT": return "광고계정 ID와 액세스 토큰 입력값을 확인해 주세요.";
    case "ALREADY_EXISTS": return "이미 등록된 계정입니다. 페이지를 새로고침해 주세요.";
    case "ENCRYPTION_FAILED": return "인증 정보를 안전하게 암호화하지 못해 저장하지 않았습니다.";
    case "META_CONNECTION_NOT_FOUND": return "등록된 Meta 계정을 찾지 못했습니다. 페이지를 새로고침해 주세요.";
    case "META_CONNECTION_INACTIVE": return "활성 상태인 Meta 계정만 인증을 확인할 수 있습니다.";
    case "META_CONNECTION_CHANGED": return "확인 중 연결 정보가 변경되었습니다. 새로고침 후 다시 확인해 주세요.";
    case "META_CREDENTIALS_REQUIRED": return "등록된 액세스 토큰이 없습니다.";
    case "META_CREDENTIALS_UNREADABLE": return "저장된 인증 정보를 읽지 못했습니다. 관리자에게 문의해 주세요.";
    case "META_VERIFICATION_TIMEOUT": return "Meta 응답 시간이 초과되었습니다. 잠시 후 다시 확인해 주세요.";
    case "META_VERIFICATION_FAILED": return "Meta 계정 접근 확인에 실패했습니다. 토큰의 만료 여부와 광고 계정 권한을 확인해 주세요.";
    case "META_VERIFICATION_SAVE_FAILED": return "인증 확인 결과를 저장하지 못했습니다. 잠시 후 다시 확인해 주세요.";
    case "META_PREVIEW_VERIFY_FIRST": return "먼저 Meta 계정의 인증 확인을 완료해 주세요.";
    case "META_PREVIEW_INVALID_RANGE": return "오늘 이전 날짜로 최대 31일의 시작일과 종료일을 선택해 주세요.";
    case "META_DAILY_CHECK_FAILED": return "소재·일별 데이터를 끝까지 검증하지 못했습니다. 기간을 줄여 다시 시도해 주세요. 부분 합계는 사용하지 않습니다.";
    case "META_PREVIEW_FAILED": return "Meta 성과를 조회하지 못했습니다. 기간을 줄여 다시 시도해 주세요. 계속 실패하면 토큰 권한을 확인해 주세요.";
    default: return "등록 결과를 확인하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
  }
}
