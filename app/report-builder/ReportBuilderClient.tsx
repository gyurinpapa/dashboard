"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { normalizeReportTheme, type ReportTheme } from "@/src/lib/report/theme";

type ReportType = {
  id: string;
  key: string;
  name: string;
};

type ReportDataSourceKind = "csv" | "api";

type ReportRow = {
  id: string;
  title: string;
  status: "draft" | "ready" | "archived";

  created_at?: string | null;
  created_by?: string | null;

  advertiser_id?: string | null;
  advertiser_name?: string | null;
  share_token?: string | null;

  workspace_id?: string | null;
  workspace_name?: string | null;

  period_start?: string | null;
  period_end?: string | null;
  period_preset?: string | null;
  period_label?: string | null;

  draft_period_start?: string | null;
  draft_period_end?: string | null;
  draft_period_preset?: string | null;
  draft_period_label?: string | null;

  published_period_start?: string | null;
  published_period_end?: string | null;
  published_period_preset?: string | null;
  published_period_label?: string | null;
  published_at?: string | null;

  report_theme?: ReportTheme;
  data_source_kind?: ReportDataSourceKind;
  media_sync_date_from?: string | null;
  media_sync_date_to?: string | null;
  media_sync_data_level?: MediaSyncDataLevel | null;
  media_sync_mode?: MediaSyncMode | null;
};

type AdvertiserRow = {
  id: string;
  name: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
  public_slug?: string | null;
  created_by?: string | null;
};

type ReportFilterKey = "all" | "published" | "draft";
type MemberRole = "master" | "director" | "admin" | "staff" | "client" | null;

type WorkspaceMemberRow = {
  workspace_id: string;
  role: MemberRole;
  division: string | null;
  department: string | null;
  team: string | null;
  workspace_name?: string | null;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_type?: "agency" | "advertiser" | null;
  tenant_status?: string | null;
  workspace_type?: string | null;
  workspace_kind?: string | null;
  agency_branding_enabled?: boolean;
  branding_workspace_id?: string | null;
  branding_workspace_name?: string | null;
  workspace_logo_url?: string | null;
  logo_storage_bucket?: string | null;
  logo_storage_path?: string | null;
  logo_updated_at?: string | null;
};

type MediaProvider = "naver_searchad" | "google_ads" | "meta_ads";
type MediaConnectionStatus = "active" | "disconnected" | "error";
type MediaConnectionAccessScope = "true_master" | "workspace" | "own_created";
type NaverMediaConnectionFormMode = "create" | "replace";
type MediaSyncJobStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "cancelled";
type MediaSyncDataLevel = "keyword" | "creative" | "mixed" | "unknown";
type MediaSyncMode = "snapshot_replace";

type SafeMediaConnection = {
  id: string;
  workspace_id: string;
  advertiser_id: string;
  provider: MediaProvider;
  external_account_id: string;
  external_account_name: string | null;
  status: MediaConnectionStatus;
  has_credentials: boolean;
  connected_at: string | null;
  last_verified_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  meta: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ReportMediaSyncJob = {
  id: string;
  workspace_id: string;
  advertiser_id: string;
  report_id: string;
  connection_id: string;
  provider: MediaProvider;
  external_account_id: string;
  date_from: string;
  date_to: string;
  data_level: MediaSyncDataLevel;
  mode: MediaSyncMode;
  status: MediaSyncJobStatus;
  progress: number;
  raw_rows: number;
  normalized_rows: number;
  inserted_rows: number;
  failed_rows: number;
  previous_ingestion_id: string | null;
  snapshot_ingestion_id: string | null;
  attempt_count: number;
  error: string | null;
  error_detail: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

const ROLE_RANK: Record<Exclude<MemberRole, null>, number> = {
  client: 1,
  staff: 2,
  admin: 3,
  director: 4,
  master: 5,
};

async function safeReadJson(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return { __nonjson: true, status: res.status, text: "" };

  try {
    return JSON.parse(text);
  } catch {
    return { __nonjson: true, status: res.status, text };
  }
}

function norm(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";
const ALL_WORKSPACES = "__all__";
const PUBLIC_CLIENT_URL_PREFIX = "https://www.etrylue.com/client/";
const MAX_MEDIA_SYNC_DATE_WINDOW_DAYS = 31;

function isOnlyMasterEmail(email?: string | null) {
  return norm(email) === ONLY_MASTER_EMAIL;
}

function canManageMembersPage(
  role: MemberRole,
  email?: string | null
) {
  if (role === "director") {
    return true;
  }

  if (role === "master") {
    return isOnlyMasterEmail(email);
  }

  return false;
}

function canUseTrueMasterPower(
  role: MemberRole,
  email?: string | null
) {
  return role === "master" && isOnlyMasterEmail(email);
}

function canDeleteReportsByRole(
  role: MemberRole,
  email?: string | null
) {
  if (role === "director" || role === "admin" || role === "staff") {
    return true;
  }

  return canUseTrueMasterPower(role, email);
}

function canDeleteAdvertisersByRole(
  role: MemberRole,
  email?: string | null
) {
  if (role === "director" || role === "admin" || role === "staff") {
    return true;
  }

  return canUseTrueMasterPower(role, email);
}

function canUpdatePublicSlugByRole(
  role: MemberRole,
  email?: string | null
) {
  if (role === "director" || role === "admin" || role === "staff") {
    return true;
  }

  return canUseTrueMasterPower(role, email);
}

function canManageWorkspaceLogoByRole(
  role: MemberRole,
  email?: string | null
) {
  if (role === "director") {
    return true;
  }

  return canUseTrueMasterPower(role, email);
}

function normalizeRole(v: any): MemberRole {
  const s = norm(v);
  if (
    s === "master" ||
    s === "director" ||
    s === "admin" ||
    s === "staff" ||
    s === "client"
  ) {
    return s;
  }
  return null;
}

function hasMinRole(role: MemberRole, minRole: Exclude<MemberRole, null>) {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

function isPublishedReport(r: ReportRow) {
  const status = norm(r.status);
  return status === "ready" || !!String(r.share_token ?? "").trim();
}

function isDraftReport(r: ReportRow) {
  return norm(r.status) === "draft";
}

function isArchivedReport(r: ReportRow) {
  return norm(r.status) === "archived";
}

function formatAdvertiserLabel(a: AdvertiserRow) {
  const name = a.name || "(광고주)";
  if (a.workspace_name) return `${name} · ${a.workspace_name}`;
  return name;
}

function normalizeReportDataSourceKind(value: any): ReportDataSourceKind {
  const kind = norm(value);

  if (kind === "api") return "api";
  return "csv";
}

function getReportDataSourceKindFromPayload(value: any): ReportDataSourceKind {
  const direct = normalizeReportDataSourceKind(value?.data_source_kind);

  if (direct === "api") return "api";

  const meta = value?.meta && typeof value.meta === "object" ? value.meta : {};
  const dataSource =
    meta?.data_source && typeof meta.data_source === "object"
      ? meta.data_source
      : {};

  return normalizeReportDataSourceKind(dataSource?.kind);
}

function normalizeMediaSyncDataLevelOrDefault(
  value: any,
): MediaSyncDataLevel {
  const normalized = norm(value);

  if (
    normalized === "keyword" ||
    normalized === "creative" ||
    normalized === "mixed" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  return "keyword";
}

function normalizeMediaSyncModeOrDefault(value: any): MediaSyncMode {
  return norm(value) === "snapshot_replace" ? "snapshot_replace" : "snapshot_replace";
}

function getReportDataSourceLabel(kind?: ReportDataSourceKind | null) {
  return kind === "api" ? "API 연동" : "CSV 업로드";
}

function getReportDataSourceBadgeStyle(kind?: ReportDataSourceKind | null): React.CSSProperties {
  if (kind === "api") {
    return {
      border: "1px solid rgba(33, 223, 243, 0.30)",
      background: "rgba(33, 223, 243, 0.10)",
      color: "#78f0ff",
    };
  }

  return {
    border: "1px solid rgba(124, 92, 255, 0.28)",
    background: "rgba(124, 92, 255, 0.10)",
    color: "#c5bbff",
  };
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function isActiveMediaSyncJobStatus(status?: string | null) {
  return status === "pending" || status === "processing";
}

function normalizeYmdOrNull(value?: string | null) {
  const normalized = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (date.toISOString().slice(0, 10) !== normalized) {
    return null;
  }

  return normalized;
}

function getInclusiveDateWindowDays(dateFrom: string, dateTo: string) {
  const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00.000Z`);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return 0;
  }

  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

function isMediaSyncDateWindowAllowed(dateFrom: string, dateTo: string) {
  const days = getInclusiveDateWindowDays(dateFrom, dateTo);

  return days >= 1 && days <= MAX_MEDIA_SYNC_DATE_WINDOW_DAYS;
}

function pickReportSyncDateRange(report: ReportRow) {
  const dataSourceKind = normalizeReportDataSourceKind(report.data_source_kind);

  if (dataSourceKind === "api") {
    const dateFrom = normalizeYmdOrNull(report.media_sync_date_from);
    const dateTo = normalizeYmdOrNull(report.media_sync_date_to);

    if (
      dateFrom &&
      dateTo &&
      dateFrom <= dateTo &&
      isMediaSyncDateWindowAllowed(dateFrom, dateTo)
    ) {
      return { dateFrom, dateTo };
    }

    return null;
  }

  const candidates = [
    {
      from: report.draft_period_start,
      to: report.draft_period_end,
    },
    {
      from: report.period_start,
      to: report.period_end,
    },
    {
      from: report.published_period_start,
      to: report.published_period_end,
    },
  ];

  for (const candidate of candidates) {
    const dateFrom = normalizeYmdOrNull(candidate.from);
    const dateTo = normalizeYmdOrNull(candidate.to);

    if (dateFrom && dateTo && dateFrom <= dateTo) {
      return { dateFrom, dateTo };
    }
  }

  return null;
}

function getMediaSyncJobStatusText(job?: ReportMediaSyncJob | null) {
  if (!job) return "동기화 요청";

  if (job.status === "pending") return "대기 중";
  if (job.status === "processing") return `처리 중 ${job.progress}%`;
  if (job.status === "done") return "완료";
  if (job.status === "failed") return "실패";
  if (job.status === "cancelled") return "취소됨";

  return "상태 확인";
}

function pickCurrentMembership(
  rows: WorkspaceMemberRow[],
  workspaceIdFromQuery: string
): WorkspaceMemberRow | null {
  if (!rows.length) return null;

  if (workspaceIdFromQuery) {
    const matched = rows.find((r) => r.workspace_id === workspaceIdFromQuery);
    if (matched) return matched;
  }

  const einvention = rows.find((r) => String(r.workspace_name ?? "") === "Einvention");
  if (einvention) return einvention;

  return rows[0] ?? null;
}

export default function ReportBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const workspaceIdFromQuery = searchParams.get("workspace_id")?.trim() || "";

  const [email, setEmail] = useState("test@test.com");
  const [password, setPassword] = useState("12345678");

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceMemberships, setWorkspaceMemberships] = useState<WorkspaceMemberRow[]>([]);
  const [canViewAllWorkspaces, setCanViewAllWorkspaces] = useState(false);

  const [memberRole, setMemberRole] = useState<MemberRole>(null);
  const [memberDivision, setMemberDivision] = useState<string | null>(null);
  const [memberDepartment, setMemberDepartment] = useState<string | null>(null);
  const [memberTeam, setMemberTeam] = useState<string | null>(null);

  const [types, setTypes] = useState<ReportType[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);

  const [creating, setCreating] = useState(false);
  const [savingReportThemeId, setSavingReportThemeId] = useState<string | null>(
    null
  );
  const [selectedReportDataSourceKind, setSelectedReportDataSourceKind] =
    useState<ReportDataSourceKind>("csv");
  const [selectedReportTheme, setSelectedReportTheme] =
    useState<ReportTheme>("light");
  const [selectedApiMediaConnectionId, setSelectedApiMediaConnectionId] =
    useState("");

  const [googleAdsConnectionFormOpen, setGoogleAdsConnectionFormOpen] =
    useState(false);
  const [googleAdsTargetCustomerIdInput, setGoogleAdsTargetCustomerIdInput] =
    useState("");
  const [googleAdsLoginCustomerIdInput, setGoogleAdsLoginCustomerIdInput] =
    useState("");
  const [startingGoogleAdsOAuth, setStartingGoogleAdsOAuth] = useState(false);
  const [googleAdsOAuthStartError, setGoogleAdsOAuthStartError] = useState("");
  const [googleAdsOAuthReturnNotice, setGoogleAdsOAuthReturnNotice] =
    useState<{
      kind: "pending" | "success" | "error";
      message: string;
    } | null>(null);
  const [pendingGoogleAdsOAuthReturn, setPendingGoogleAdsOAuthReturn] =
    useState<{
      workspaceId: string;
      advertiserId: string;
      connectionId: string;
    } | null>(null);

  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [search, setSearch] = useState("");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    __none__: true,
  });

  const [reportFilter, setReportFilter] = useState<ReportFilterKey>("all");

  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<string>("");
  const [newAdvertiserName, setNewAdvertiserName] = useState("");
  const [creatingAdvertiser, setCreatingAdvertiser] = useState(false);
  const [publicSlugInput, setPublicSlugInput] = useState("");
  const [savingPublicSlug, setSavingPublicSlug] = useState(false);
  const [localMsg, setLocalMsg] = useState("");

  const [selectedAdvertiserMediaConnections, setSelectedAdvertiserMediaConnections] =
    useState<SafeMediaConnection[]>([]);
  const [selectedAdvertiserMediaAccessScope, setSelectedAdvertiserMediaAccessScope] =
    useState<MediaConnectionAccessScope | null>(null);
  const [loadingSelectedAdvertiserMediaConnections, setLoadingSelectedAdvertiserMediaConnections] =
    useState(false);
  const [selectedAdvertiserMediaConnectionsError, setSelectedAdvertiserMediaConnectionsError] =
    useState("");
  const [resolvedAdvertiserMediaConnectionScopeKey, setResolvedAdvertiserMediaConnectionScopeKey] =
    useState("");
  const [mediaConnectionsRefreshVersion, setMediaConnectionsRefreshVersion] =
    useState(0);

  const [naverMediaConnectionFormMode, setNaverMediaConnectionFormMode] =
    useState<NaverMediaConnectionFormMode | null>(null);
  const [naverMediaConnectionTargetId, setNaverMediaConnectionTargetId] =
    useState("");
  const [naverExternalAccountIdInput, setNaverExternalAccountIdInput] =
    useState("");
  const [naverExternalAccountNameInput, setNaverExternalAccountNameInput] =
    useState("");
  const [naverCustomerIdInput, setNaverCustomerIdInput] = useState("");
  const [naverAccessLicenseInput, setNaverAccessLicenseInput] = useState("");
  const [naverSecretKeyInput, setNaverSecretKeyInput] = useState("");
  const [naverCustomerIdUnlocked, setNaverCustomerIdUnlocked] =
    useState(false);
  const [naverAccessLicenseUnlocked, setNaverAccessLicenseUnlocked] =
    useState(false);
  const [naverSecretKeyUnlocked, setNaverSecretKeyUnlocked] =
    useState(false);
  const [savingNaverMediaConnection, setSavingNaverMediaConnection] =
    useState(false);
  const [naverMediaConnectionFormError, setNaverMediaConnectionFormError] =
    useState("");

  const [selectedAdvertiserIds, setSelectedAdvertiserIds] = useState<string[]>([]);
  const [deletingAdvertisers, setDeletingAdvertisers] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [deletingReports, setDeletingReports] = useState(false);

  const [mediaSyncJobsByReportId, setMediaSyncJobsByReportId] =
    useState<Record<string, ReportMediaSyncJob | null>>({});
  const [loadingMediaSyncReportIds, setLoadingMediaSyncReportIds] =
    useState<Record<string, boolean>>({});
  const [requestingMediaSyncReportId, setRequestingMediaSyncReportId] =
    useState<string | null>(null);

  const FOLDER_ROW_HEIGHT = 58;
  const REPORT_ROW_HEIGHT = 68;
  const OVERSCAN = 8;
  const LIST_VIEWPORT_HEIGHT = 520;
  const REPORTS_PAGE_SIZE = 100;
  const LOAD_MORE_THRESHOLD = 240;

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(LIST_VIEWPORT_HEIGHT);

  const reportsRequestSeqRef = useRef(0);
  const mediaConnectionsRequestSeqRef = useRef(0);
  const mediaConnectionScopeKeyRef = useRef("");
  const googleAdsOAuthReturnHandledRef = useRef("");
  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingReportsRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const isAllWorkspaceMode = workspaceId === ALL_WORKSPACES;

  const canCreateReport = hasMinRole(memberRole, "staff") && !isAllWorkspaceMode;
  const canManageAdvertisers = hasMinRole(memberRole, "staff") && !isAllWorkspaceMode;
  const canDeleteReports = canDeleteReportsByRole(memberRole, userEmail);
  const canManageMembers = canManageMembersPage(memberRole, userEmail);
  const canDeleteAdvertisers =
    canDeleteAdvertisersByRole(memberRole, userEmail) && !isAllWorkspaceMode;
  const canUpdatePublicSlug =
    canUpdatePublicSlugByRole(memberRole, userEmail) && !isAllWorkspaceMode;
  const canManageAgencyBranding =
    canManageWorkspaceLogoByRole(memberRole, userEmail) && !isAllWorkspaceMode;

  const currentWorkspaceMembership = useMemo(() => {
    if (!workspaceId || isAllWorkspaceMode) return null;

    return (
      workspaceMemberships.find(
        (row) => row.workspace_id === workspaceId
      ) ?? null
    );
  }, [workspaceId, workspaceMemberships, isAllWorkspaceMode]);

  const isAgencyWorkspace =
    currentWorkspaceMembership?.tenant_type === "agency" &&
    currentWorkspaceMembership?.tenant_status === "active";

  const agencyBrandingAvailable =
    isAgencyWorkspace &&
    currentWorkspaceMembership?.agency_branding_enabled === true;

  const workspaceLogoUrl = agencyBrandingAvailable
    ? currentWorkspaceMembership?.workspace_logo_url ?? null
    : null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setUserEmail(data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  const resetReportsState = useCallback(() => {
    reportsRequestSeqRef.current += 1;

    nextOffsetRef.current = 0;
    hasMoreRef.current = false;
    loadingReportsRef.current = false;
    loadingMoreRef.current = false;

    setReports([]);
    setHasMore(false);
    setNextOffset(0);
    setLoadingReports(false);
    setLoadingMore(false);
    setMediaSyncJobsByReportId({});
    setLoadingMediaSyncReportIds({});
    setRequestingMediaSyncReportId(null);
  }, []);

  const normalizeReportList = useCallback((list: any[]): ReportRow[] => {
    return (list ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      status: String(r.status ?? ""),
      created_at: r.created_at ? String(r.created_at) : undefined,
      created_by: r.created_by ? String(r.created_by) : null,

      workspace_id: r.workspace_id ? String(r.workspace_id) : null,
      workspace_name: r.workspace_name ? String(r.workspace_name) : null,
      report_theme: normalizeReportTheme(r.report_theme),

      advertiser_id: r.advertiser_id ? String(r.advertiser_id) : null,
      advertiser_name: r.advertiser_name ? String(r.advertiser_name) : null,
      share_token: r.share_token ? String(r.share_token) : null,
      period_start: r.period_start ? String(r.period_start) : null,
      period_end: r.period_end ? String(r.period_end) : null,
      period_preset: r.period_preset ? String(r.period_preset) : null,
      period_label: r.period_label ? String(r.period_label) : null,
      draft_period_start: r.draft_period_start ? String(r.draft_period_start) : null,
      draft_period_end: r.draft_period_end ? String(r.draft_period_end) : null,
      draft_period_preset: r.draft_period_preset ? String(r.draft_period_preset) : null,
      draft_period_label: r.draft_period_label ? String(r.draft_period_label) : null,
      published_period_start: r.published_period_start
        ? String(r.published_period_start)
        : null,
      published_period_end: r.published_period_end
        ? String(r.published_period_end)
        : null,
      published_period_preset: r.published_period_preset
        ? String(r.published_period_preset)
        : null,
      published_period_label: r.published_period_label
        ? String(r.published_period_label)
        : null,
      published_at: r.published_at ? String(r.published_at) : null,
      data_source_kind: getReportDataSourceKindFromPayload(r),
      media_sync_date_from: normalizeYmdOrNull(r.media_sync_date_from),
      media_sync_date_to: normalizeYmdOrNull(r.media_sync_date_to),
      media_sync_data_level: r.media_sync_data_level
        ? normalizeMediaSyncDataLevelOrDefault(r.media_sync_data_level)
        : null,
      media_sync_mode: r.media_sync_mode
        ? normalizeMediaSyncModeOrDefault(r.media_sync_mode)
        : null,
    })) as ReportRow[];
  }, []);

  const mergeUniqueReports = useCallback((prev: ReportRow[], incoming: ReportRow[]) => {
    if (!incoming.length) return prev;

    const map = new Map<string, ReportRow>();
    for (const row of prev) map.set(row.id, row);
    for (const row of incoming) map.set(row.id, row);

    return Array.from(map.values());
  }, []);

  const fetchReportsPage = useCallback(
    async ({
      reset = false,
      forceOffset,
    }: {
      reset?: boolean;
      forceOffset?: number;
    } = {}) => {
      if (!workspaceId) return;

      const currentOffset =
        typeof forceOffset === "number"
          ? forceOffset
          : reset
          ? 0
          : nextOffsetRef.current;

      if (reset) {
        if (loadingReportsRef.current) return;
      } else {
        if (loadingMoreRef.current) return;
        if (!hasMoreRef.current && currentOffset !== 0) return;
      }

      const requestSeq = ++reportsRequestSeqRef.current;

      if (reset) {
        loadingReportsRef.current = true;
        hasMoreRef.current = false;
        nextOffsetRef.current = 0;

        setLoadingReports(true);
        setHasMore(false);
        setNextOffset(0);
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      try {
        const token = await getAccessToken();
        if (!token) return;

        const qs = new URLSearchParams();
        qs.set("workspace_id", workspaceId);
        qs.set("limit", String(REPORTS_PAGE_SIZE));
        qs.set("offset", String(currentOffset));

        const res = await fetch(`/api/reports/list?${qs.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await safeReadJson(res);

        if (requestSeq !== reportsRequestSeqRef.current) return;

        if (!res.ok || !(json as any)?.ok) {
          console.warn("[reports/list] failed", res.status, json);
          return;
        }

        const list = ((json as any)?.reports ?? []) as any[];
        const normalized = normalizeReportList(list);

        if (requestSeq !== reportsRequestSeqRef.current) return;

        const parsedNextOffset = Number((json as any)?.next_offset);
        const safeNextOffset = Number.isFinite(parsedNextOffset)
          ? parsedNextOffset
          : currentOffset + normalized.length;

        const safeHasMore =
          typeof (json as any)?.has_more === "boolean"
            ? Boolean((json as any)?.has_more)
            : normalized.length >= REPORTS_PAGE_SIZE;

        setReports((prev) => {
          return reset ? normalized : mergeUniqueReports(prev, normalized);
        });

        nextOffsetRef.current = safeNextOffset;
        hasMoreRef.current = safeHasMore;

        setNextOffset(safeNextOffset);
        setHasMore(safeHasMore);
      } catch (e) {
        console.warn("[reports/list] exception", e);
      } finally {
        if (requestSeq === reportsRequestSeqRef.current) {
          loadingReportsRef.current = false;
          loadingMoreRef.current = false;

          setLoadingReports(false);
          setLoadingMore(false);
        }
      }
    },
    [
      workspaceId,
      REPORTS_PAGE_SIZE,
      normalizeReportList,
      mergeUniqueReports,
    ]
  );

  const fetchReports = useCallback(async () => {
    await fetchReportsPage({ reset: true, forceOffset: 0 });
  }, [fetchReportsPage]);

  const loadMoreReports = useCallback(async () => {
    await fetchReportsPage({ reset: false });
  }, [fetchReportsPage]);

  useEffect(() => {
    if (!userId) {
      setWorkspaceId(null);
      setWorkspaceName(null);
      setWorkspaceMemberships([]);
      setMemberRole(null);
      setMemberDivision(null);
      setMemberDepartment(null);
      setMemberTeam(null);
      resetReportsState();
      return;
    }

    (async () => {
      const token = await getAccessToken();

      if (!token) {
        setWorkspaceId(null);
        setWorkspaceName(null);
        setWorkspaceMemberships([]);
        setMemberRole(null);
        setMemberDivision(null);
        setMemberDepartment(null);
        setMemberTeam(null);
        resetReportsState();
        return;
      }

      const res = await fetch("/api/workspaces/list", {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[workspaces/list] failed", res.status, json);
        setWorkspaceId(null);
        setWorkspaceName(null);
        setWorkspaceMemberships([]);
        setMemberRole(null);
        setMemberDivision(null);
        setMemberDepartment(null);
        setMemberTeam(null);
        resetReportsState();
        return;
      }

      const canViewAll = Boolean((json as any)?.can_view_all_workspaces);
      setCanViewAllWorkspaces(canViewAll);

      const rows =
        (((json as any)?.workspaces ?? []) as any[]).map((row: any) => ({
          workspace_id: String(row.workspace_id ?? ""),
          role: normalizeRole(row.role),
          division: row.division ?? null,
          department: row.department ?? null,
          team: row.team ?? null,
          workspace_name: row.workspace_name ? String(row.workspace_name) : null,
          tenant_id: row.tenant_id ? String(row.tenant_id) : null,
          tenant_name: row.tenant_name ? String(row.tenant_name) : null,
          tenant_type:
            row.tenant_type === "agency" || row.tenant_type === "advertiser"
              ? row.tenant_type
              : null,
          tenant_status: row.tenant_status ? String(row.tenant_status) : null,
          workspace_type: row.workspace_type ? String(row.workspace_type) : null,
          workspace_kind: row.workspace_kind ? String(row.workspace_kind) : null,
          agency_branding_enabled: Boolean(row.agency_branding_enabled),
          branding_workspace_id: row.branding_workspace_id
            ? String(row.branding_workspace_id)
            : null,
          branding_workspace_name: row.branding_workspace_name
            ? String(row.branding_workspace_name)
            : null,
          workspace_logo_url: row.workspace_logo_url
            ? String(row.workspace_logo_url)
            : null,
          logo_storage_bucket: row.logo_storage_bucket
            ? String(row.logo_storage_bucket)
            : null,
          logo_storage_path: row.logo_storage_path
            ? String(row.logo_storage_path)
            : null,
          logo_updated_at: row.logo_updated_at
            ? String(row.logo_updated_at)
            : null,
        })) ?? [];

      const validRows = rows.filter((row) => row.workspace_id);

      if (!validRows.length) {
        setWorkspaceId(null);
        setWorkspaceName(null);
        setWorkspaceMemberships([]);
        setMemberRole(null);
        setMemberDivision(null);
        setMemberDepartment(null);
        setMemberTeam(null);
        resetReportsState();
        return;
      }

      const current = pickCurrentMembership(validRows, workspaceIdFromQuery);

      const shouldUseAllWorkspace =
        canViewAll && workspaceIdFromQuery === ALL_WORKSPACES;

      setWorkspaceMemberships(validRows);

      if (shouldUseAllWorkspace) {
        setWorkspaceId(ALL_WORKSPACES);
        setWorkspaceName("전체 workspace");
        setMemberRole("master");
        setMemberDivision(null);
        setMemberDepartment(null);
        setMemberTeam(null);
        return;
      }

      setWorkspaceId(current?.workspace_id ?? null);
      setWorkspaceName(current?.workspace_name ?? null);
      setMemberRole(current?.role ?? null);
      setMemberDivision(current?.division ?? null);
      setMemberDepartment(current?.department ?? null);
      setMemberTeam(current?.team ?? null);

      if (current?.workspace_id && current.workspace_id !== workspaceIdFromQuery) {
        router.replace(`/report-builder?workspace_id=${encodeURIComponent(current.workspace_id)}`);
      }
    })();
  }, [userId, workspaceIdFromQuery, router, resetReportsState]);

  useEffect(() => {
    if (!userId) {
      setTypes([]);
      return;
    }

    (async () => {
      const token = await getAccessToken();

      if (!token) {
        setTypes([]);
        return;
      }

      const res = await fetch("/api/report-types/list", {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[report-types/list] failed", res.status, json);
        setTypes([]);
        return;
      }

      setTypes(
        (((json as any)?.report_types ?? []) as ReportType[])
      );
    })();
  }, [userId]);

  useEffect(() => {
    if (!workspaceId) {
      setAdvertisers([]);
      setSelectedAdvertiserId("");
      return;
    }

    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setAdvertisers([]);
        setSelectedAdvertiserId("");
        return;
      }

      const res = await fetch(
        `/api/advertisers/list?workspace_id=${encodeURIComponent(workspaceId)}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[advertisers/list] failed", res.status, json);
        setAdvertisers([]);
        return;
      }

      const rows =
      (((json as any)?.advertisers ?? []) as any[]).map((x: any) => ({
        id: String(x.id),
        name: String(x.name ?? ""),
        workspace_id: x.workspace_id ? String(x.workspace_id) : null,
        workspace_name: x.workspace_name ? String(x.workspace_name) : null,
        public_slug: x.public_slug ? String(x.public_slug) : null,
        created_by: x.created_by ? String(x.created_by) : null,
      })) || [];

      setAdvertisers(rows);

      setOpenMap((prev) => {
        const next = { ...prev };
        next.__none__ = prev.__none__ ?? true;
        for (const a of rows) {
          if (next[a.id] == null) next[a.id] = true;
        }
        return next;
      });

      setSelectedAdvertiserId((prev) => {
        if (!prev) return "";
        return rows.some((x) => x.id === prev) ? prev : "";
      });
    })();
  }, [workspaceId]);

  useEffect(() => {
    const selectedAdvertiser = advertisers.find(
      (a) => a.id === selectedAdvertiserId
    );

    setPublicSlugInput(selectedAdvertiser?.public_slug ?? "");
  }, [advertisers, selectedAdvertiserId]);

  useEffect(() => {
    setGoogleAdsConnectionFormOpen(false);
    setGoogleAdsTargetCustomerIdInput("");
    setGoogleAdsLoginCustomerIdInput("");
    setGoogleAdsOAuthStartError("");
    setStartingGoogleAdsOAuth(false);
  }, [workspaceId, selectedAdvertiserId]);

  useEffect(() => {
    // Google OAuth return notice belongs only to the
    // workspace / advertiser scope in which it was resolved.
    //
    // Intentionally keyed only to scope changes. During a valid
    // callback return, selectedAdvertiserId and the pending return
    // are updated together, so that transition must not clear the
    // in-flight verification notice.
    const pending = pendingGoogleAdsOAuthReturn;

    if (pending) {
      const workspaceChanged =
        Boolean(workspaceId) &&
        workspaceId !== pending.workspaceId;

      const advertiserChanged =
        Boolean(selectedAdvertiserId) &&
        selectedAdvertiserId !== pending.advertiserId;

      if (workspaceChanged || advertiserChanged) {
        setPendingGoogleAdsOAuthReturn(null);
        setGoogleAdsOAuthReturnNotice(null);
      }

      return;
    }

    setGoogleAdsOAuthReturnNotice(null);
    // pendingGoogleAdsOAuthReturn is intentionally excluded:
    // completing verification must not erase the success notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, selectedAdvertiserId]);

  useEffect(() => {
    const advertiserId = selectedAdvertiserId.trim();
    const currentWorkspaceId = String(workspaceId ?? "").trim();
    const scopeKey =
      advertiserId && currentWorkspaceId && currentWorkspaceId !== ALL_WORKSPACES
        ? `${currentWorkspaceId}:${advertiserId}`
        : "";
    const requestSeq = ++mediaConnectionsRequestSeqRef.current;
    let cancelled = false;

    mediaConnectionScopeKeyRef.current = scopeKey;

    setSelectedAdvertiserMediaConnections([]);
    setSelectedApiMediaConnectionId("");
    setSelectedAdvertiserMediaAccessScope(null);
    setSelectedAdvertiserMediaConnectionsError("");
    setResolvedAdvertiserMediaConnectionScopeKey("");
    setGoogleAdsConnectionFormOpen(false);
    setNaverMediaConnectionFormMode(null);
    setNaverMediaConnectionTargetId("");
    setNaverExternalAccountIdInput("");
    setNaverExternalAccountNameInput("");
    setNaverCustomerIdInput("");
    setNaverAccessLicenseInput("");
    setNaverSecretKeyInput("");
    setNaverCustomerIdUnlocked(false);
    setNaverAccessLicenseUnlocked(false);
    setNaverSecretKeyUnlocked(false);
    setNaverMediaConnectionFormError("");

    if (!userId || !scopeKey) {
      setLoadingSelectedAdvertiserMediaConnections(false);
      return () => {
        cancelled = true;
      };
    }

    setLoadingSelectedAdvertiserMediaConnections(true);

    (async () => {
      try {
        const token = await getAccessToken();

        if (
          cancelled ||
          requestSeq !== mediaConnectionsRequestSeqRef.current
        ) {
          return;
        }

        if (!token) {
          setSelectedAdvertiserMediaConnectionsError(
            "로그인 세션이 없어 매체 연결 상태를 확인할 수 없습니다."
          );
          setResolvedAdvertiserMediaConnectionScopeKey(scopeKey);
          return;
        }

        const res = await fetch(
          `/api/advertisers/${encodeURIComponent(advertiserId)}/media-connections`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const json = await safeReadJson(res);

        if (
          cancelled ||
          requestSeq !== mediaConnectionsRequestSeqRef.current
        ) {
          return;
        }

        if (!res.ok || !(json as any)?.ok) {
          console.warn(
            "[advertiser-media-connections:get] failed",
            res.status,
            json
          );

          setSelectedAdvertiserMediaConnectionsError(
            res.status === 403
              ? "이 광고주의 매체 연결 조회 권한이 없습니다."
              : "매체 연결 상태를 불러오지 못했습니다."
          );
          setResolvedAdvertiserMediaConnectionScopeKey(scopeKey);
          return;
        }

        const responseAdvertiserId = String(
          (json as any)?.advertiser_id ?? ""
        ).trim();
        const responseWorkspaceId = String(
          (json as any)?.workspace_id ?? ""
        ).trim();

        if (
          responseAdvertiserId !== advertiserId ||
          responseWorkspaceId !== currentWorkspaceId
        ) {
          console.warn(
            "[advertiser-media-connections:get] scope mismatch",
            {
              requestedAdvertiserId: advertiserId,
              responseAdvertiserId,
              requestedWorkspaceId: currentWorkspaceId,
              responseWorkspaceId,
            }
          );
          setSelectedAdvertiserMediaConnectionsError(
            "매체 연결 범위를 안전하게 확인할 수 없습니다."
          );
          setResolvedAdvertiserMediaConnectionScopeKey(scopeKey);
          return;
        }

        const rawConnections = Array.isArray((json as any)?.connections)
          ? ((json as any).connections as SafeMediaConnection[])
          : [];

        const scopedConnections = rawConnections.filter((connection) => {
          return (
            String(connection?.advertiser_id ?? "") === advertiserId &&
            String(connection?.workspace_id ?? "") === currentWorkspaceId
          );
        });

        if (scopedConnections.length !== rawConnections.length) {
          console.warn(
            "[advertiser-media-connections:get] connection scope mismatch"
          );
          setSelectedAdvertiserMediaConnectionsError(
            "매체 연결 범위를 안전하게 확인할 수 없습니다."
          );
          setResolvedAdvertiserMediaConnectionScopeKey(scopeKey);
          return;
        }

        const accessScope = String((json as any)?.access_scope ?? "");

        setSelectedAdvertiserMediaConnections(scopedConnections);
        setSelectedAdvertiserMediaAccessScope(
          accessScope === "true_master" ||
            accessScope === "workspace" ||
            accessScope === "own_created"
            ? accessScope
            : null
        );
        setResolvedAdvertiserMediaConnectionScopeKey(scopeKey);
      } catch (error) {
        if (
          cancelled ||
          requestSeq !== mediaConnectionsRequestSeqRef.current
        ) {
          return;
        }

        console.warn(
          "[advertiser-media-connections:get] exception",
          error
        );
        setSelectedAdvertiserMediaConnectionsError(
          "매체 연결 상태를 불러오지 못했습니다."
        );
        setResolvedAdvertiserMediaConnectionScopeKey(scopeKey);
      } finally {
        if (
          !cancelled &&
          requestSeq === mediaConnectionsRequestSeqRef.current
        ) {
          setLoadingSelectedAdvertiserMediaConnections(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    workspaceId,
    selectedAdvertiserId,
    mediaConnectionsRefreshVersion,
  ]);

  useEffect(() => {
    const outcome =
      searchParams.get("google_ads_oauth")?.trim() || "";

    if (outcome !== "success" && outcome !== "error") {
      return;
    }

    if (!userId) {
      return;
    }

    const callbackKey = searchParams.toString();

    if (
      !callbackKey ||
      googleAdsOAuthReturnHandledRef.current === callbackKey
    ) {
      return;
    }

    const cleanupGoogleAdsOAuthQuery = () => {
      const nextParams = new URLSearchParams(
        searchParams.toString(),
      );

      nextParams.delete("google_ads_oauth");
      nextParams.delete("advertiser_id");
      nextParams.delete("connection_id");
      nextParams.delete("error");

      const nextQuery = nextParams.toString();

      router.replace(
        nextQuery
          ? `/report-builder?${nextQuery}`
          : "/report-builder",
        { scroll: false },
      );
    };

    if (outcome === "error") {
      googleAdsOAuthReturnHandledRef.current = callbackKey;

      setSelectedReportDataSourceKind("api");
      setPendingGoogleAdsOAuthReturn(null);
      setGoogleAdsOAuthReturnNotice({
        kind: "error",
        message:
          "Google Ads 연결이 완료되지 않았습니다. 다시 시도해 주세요.",
      });

      cleanupGoogleAdsOAuthQuery();
      return;
    }

    const callbackWorkspaceId =
      searchParams.get("workspace_id")?.trim() || "";
    const callbackAdvertiserId =
      searchParams.get("advertiser_id")?.trim() || "";
    const callbackConnectionId =
      searchParams.get("connection_id")?.trim() || "";

    if (!workspaceId) {
      return;
    }

    if (
      !callbackWorkspaceId ||
      !callbackAdvertiserId ||
      !callbackConnectionId ||
      workspaceId === ALL_WORKSPACES ||
      workspaceId !== callbackWorkspaceId
    ) {
      googleAdsOAuthReturnHandledRef.current = callbackKey;

      setSelectedReportDataSourceKind("api");
      setPendingGoogleAdsOAuthReturn(null);
      setGoogleAdsOAuthReturnNotice({
        kind: "error",
        message:
          "Google Ads 연결 결과를 현재 작업공간에서 확인할 수 없습니다.",
      });

      cleanupGoogleAdsOAuthQuery();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await getAccessToken();

        if (cancelled) {
          return;
        }

        if (!token) {
          googleAdsOAuthReturnHandledRef.current =
            callbackKey;

          setSelectedReportDataSourceKind("api");
          setPendingGoogleAdsOAuthReturn(null);
          setGoogleAdsOAuthReturnNotice({
            kind: "error",
            message:
              "Google Ads 연결 결과를 확인할 로그인 세션이 없습니다.",
          });

          cleanupGoogleAdsOAuthQuery();
          return;
        }

        const res = await fetch(
          `/api/advertisers/list?workspace_id=${encodeURIComponent(
            callbackWorkspaceId,
          )}`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const json = await safeReadJson(res);

        if (cancelled) {
          return;
        }

        if (!res.ok || !(json as any)?.ok) {
          googleAdsOAuthReturnHandledRef.current =
            callbackKey;

          setSelectedReportDataSourceKind("api");
          setPendingGoogleAdsOAuthReturn(null);
          setGoogleAdsOAuthReturnNotice({
            kind: "error",
            message:
              "Google Ads 연결 결과를 서버에서 다시 확인하지 못했습니다.",
          });

          cleanupGoogleAdsOAuthQuery();
          return;
        }

        const rows = Array.isArray(
          (json as any)?.advertisers,
        )
          ? ((json as any).advertisers as any[])
          : [];

        const exactAdvertiser = rows.find(
          (row) =>
            String(row?.id ?? "").trim() ===
              callbackAdvertiserId &&
            String(row?.workspace_id ?? "").trim() ===
              callbackWorkspaceId,
        );

        if (!exactAdvertiser) {
          googleAdsOAuthReturnHandledRef.current =
            callbackKey;

          setSelectedReportDataSourceKind("api");
          setPendingGoogleAdsOAuthReturn(null);
          setGoogleAdsOAuthReturnNotice({
            kind: "error",
            message:
              "Google Ads 연결 결과의 광고주 범위를 확인할 수 없습니다.",
          });

          cleanupGoogleAdsOAuthQuery();
          return;
        }

        googleAdsOAuthReturnHandledRef.current =
          callbackKey;

        setSelectedReportDataSourceKind("api");
        setSelectedAdvertiserId(callbackAdvertiserId);
        setGoogleAdsOAuthStartError("");
        setGoogleAdsOAuthReturnNotice({
          kind: "pending",
          message:
            "Google Ads 연결 결과를 서버에서 확인하고 있습니다.",
        });

        setPendingGoogleAdsOAuthReturn({
          workspaceId: callbackWorkspaceId,
          advertiserId: callbackAdvertiserId,
          connectionId: callbackConnectionId,
        });

        setMediaConnectionsRefreshVersion(
          (prev) => prev + 1,
        );

        cleanupGoogleAdsOAuthQuery();
      } catch {
        if (cancelled) {
          return;
        }

        googleAdsOAuthReturnHandledRef.current =
          callbackKey;

        setSelectedReportDataSourceKind("api");
        setPendingGoogleAdsOAuthReturn(null);
        setGoogleAdsOAuthReturnNotice({
          kind: "error",
          message:
            "Google Ads 연결 결과를 서버에서 다시 확인하지 못했습니다.",
        });

        cleanupGoogleAdsOAuthQuery();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    router,
    searchParams,
    userId,
    workspaceId,
  ]);

  useEffect(() => {
    const pending = pendingGoogleAdsOAuthReturn;

    if (!pending) {
      return;
    }

    if (
      !workspaceId ||
      workspaceId !== pending.workspaceId
    ) {
      setPendingGoogleAdsOAuthReturn(null);
      setGoogleAdsOAuthReturnNotice({
        kind: "error",
        message:
          "Google Ads 연결 결과의 작업공간 범위가 변경되었습니다.",
      });
      return;
    }

    if (
      selectedAdvertiserId !== pending.advertiserId
    ) {
      return;
    }

    const expectedScopeKey =
      `${pending.workspaceId}:${pending.advertiserId}`;

    if (
      loadingSelectedAdvertiserMediaConnections ||
      resolvedAdvertiserMediaConnectionScopeKey !==
        expectedScopeKey
    ) {
      return;
    }

    if (selectedAdvertiserMediaConnectionsError) {
      setPendingGoogleAdsOAuthReturn(null);
      setGoogleAdsOAuthReturnNotice({
        kind: "error",
        message:
          "Google Ads 연결 상태를 다시 확인하지 못했습니다.",
      });
      return;
    }

    const exactConnection =
      selectedAdvertiserMediaConnections.find(
        (connection) =>
          connection.id === pending.connectionId &&
          connection.workspace_id === pending.workspaceId &&
          connection.advertiser_id ===
            pending.advertiserId &&
          connection.provider === "google_ads",
      ) ?? null;

    if (
      !exactConnection ||
      exactConnection.status !== "active" ||
      !exactConnection.has_credentials
    ) {
      setPendingGoogleAdsOAuthReturn(null);
      setGoogleAdsOAuthReturnNotice({
        kind: "error",
        message:
          "Google Ads 연결은 반환되었지만 사용 가능한 연결 상태를 확인하지 못했습니다.",
      });
      return;
    }

    const accountLabel =
      exactConnection.external_account_name ||
      exactConnection.external_account_id;

    setPendingGoogleAdsOAuthReturn(null);
    setGoogleAdsOAuthReturnNotice({
      kind: "success",
      message:
        `Google Ads 연결이 완료되었습니다. ${accountLabel}`,
    });
  }, [
    pendingGoogleAdsOAuthReturn,
    workspaceId,
    selectedAdvertiserId,
    loadingSelectedAdvertiserMediaConnections,
    resolvedAdvertiserMediaConnectionScopeKey,
    selectedAdvertiserMediaConnectionsError,
    selectedAdvertiserMediaConnections,
  ]);

  useEffect(() => {
    setSelectedAdvertiserIds((prev) => {
      const allowed = new Set(advertisers.map((a) => a.id));
      return prev.filter((id) => allowed.has(id));
    });
  }, [advertisers]);

  useEffect(() => {
    if (!workspaceId) {
      resetReportsState();
      return;
    }

    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    setSelectedReportIds((prev) => {
      const allowed = new Set(reports.map((r) => r.id));
      return prev.filter((id) => allowed.has(id));
    });
  }, [reports]);

  useEffect(() => {
    if (!canDeleteReports && selectedReportIds.length > 0) {
      setSelectedReportIds([]);
    }
  }, [canDeleteReports, selectedReportIds.length]);

  useEffect(() => {
    if (!canDeleteAdvertisers && selectedAdvertiserIds.length > 0) {
      setSelectedAdvertiserIds([]);
    }
  }, [canDeleteAdvertisers, selectedAdvertiserIds.length]);

  async function signIn() {
    setLocalMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLocalMsg(error.message || "로그인 실패");
      return;
    }

    setUserId(data.user?.id ?? null);
    setUserEmail(data.user?.email ?? null);

    await supabase.auth.getSession();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail(null);
    setWorkspaceId(null);
    setWorkspaceName(null);
    setWorkspaceMemberships([]);
    setMemberRole(null);
    setMemberDivision(null);
    setMemberDepartment(null);
    setMemberTeam(null);
    resetReportsState();
    setAdvertisers([]);
    setSearch("");
    setReportFilter("all");
    setSelectedAdvertiserId("");
    setSelectedReportDataSourceKind("csv");
    setSelectedApiMediaConnectionId("");
    setNewAdvertiserName("");
    setPublicSlugInput("");
    setSavingPublicSlug(false);
    setOpenMap({ __none__: true });
    setLocalMsg("");
    setSelectedReportIds([]);
    setSelectedAdvertiserIds([]);
    setDeletingAdvertisers(false);
    setGoogleAdsConnectionFormOpen(false);
    setGoogleAdsTargetCustomerIdInput("");
    setGoogleAdsLoginCustomerIdInput("");
    setGoogleAdsOAuthStartError("");
    setStartingGoogleAdsOAuth(false);
    setNaverMediaConnectionFormMode(null);
    setNaverMediaConnectionTargetId("");
    setNaverExternalAccountIdInput("");
    setNaverExternalAccountNameInput("");
    setNaverCustomerIdInput("");
    setNaverAccessLicenseInput("");
    setNaverSecretKeyInput("");
    setNaverCustomerIdUnlocked(false);
    setNaverAccessLicenseUnlocked(false);
    setNaverSecretKeyUnlocked(false);
    setNaverMediaConnectionFormError("");
    setSavingNaverMediaConnection(false);
  }

  function closeNaverMediaConnectionForm() {
    setNaverMediaConnectionFormMode(null);
    setNaverMediaConnectionTargetId("");
    setNaverExternalAccountIdInput("");
    setNaverExternalAccountNameInput("");
    setNaverCustomerIdInput("");
    setNaverAccessLicenseInput("");
    setNaverSecretKeyInput("");
    setNaverCustomerIdUnlocked(false);
    setNaverAccessLicenseUnlocked(false);
    setNaverSecretKeyUnlocked(false);
    setNaverMediaConnectionFormError("");
  }

  function closeGoogleAdsConnectionForm() {
    setGoogleAdsConnectionFormOpen(false);
    setGoogleAdsTargetCustomerIdInput("");
    setGoogleAdsLoginCustomerIdInput("");
    setGoogleAdsOAuthStartError("");
  }

  function openGoogleAdsConnectionForm() {
    if (startingGoogleAdsOAuth) return;

    closeNaverMediaConnectionForm();
    setGoogleAdsConnectionFormOpen(true);
    setGoogleAdsTargetCustomerIdInput("");
    setGoogleAdsLoginCustomerIdInput("");
    setGoogleAdsOAuthStartError("");
  }

  function openCreateNaverMediaConnectionForm() {
    if (savingNaverMediaConnection) return;

    closeGoogleAdsConnectionForm();
    setNaverMediaConnectionFormMode("create");
    setNaverMediaConnectionTargetId("");
    setNaverExternalAccountIdInput("");
    setNaverExternalAccountNameInput("");
    setNaverCustomerIdInput("");
    setNaverAccessLicenseInput("");
    setNaverSecretKeyInput("");
    setNaverCustomerIdUnlocked(false);
    setNaverAccessLicenseUnlocked(false);
    setNaverSecretKeyUnlocked(false);
    setNaverMediaConnectionFormError("");
  }

  function openReplaceNaverMediaConnectionForm(connection: SafeMediaConnection) {
    if (savingNaverMediaConnection) return;

    closeGoogleAdsConnectionForm();
    setNaverMediaConnectionFormMode("replace");
    setNaverMediaConnectionTargetId(connection.id);
    setNaverExternalAccountIdInput("");
    setNaverExternalAccountNameInput("");
    setNaverCustomerIdInput("");
    setNaverAccessLicenseInput("");
    setNaverSecretKeyInput("");
    setNaverCustomerIdUnlocked(false);
    setNaverAccessLicenseUnlocked(false);
    setNaverSecretKeyUnlocked(false);
    setNaverMediaConnectionFormError("");
  }

  async function submitNaverMediaConnectionForm() {
    if (savingNaverMediaConnection || !naverMediaConnectionFormMode) return;

    const advertiserId = selectedAdvertiserId.trim();
    const currentWorkspaceId = String(workspaceId ?? "").trim();
    const scopeKey =
      advertiserId && currentWorkspaceId && currentWorkspaceId !== ALL_WORKSPACES
        ? `${currentWorkspaceId}:${advertiserId}`
        : "";

    if (
      !scopeKey ||
      resolvedAdvertiserMediaConnectionScopeKey !== scopeKey ||
      mediaConnectionScopeKeyRef.current !== scopeKey ||
      selectedAdvertiserMediaConnectionsError
    ) {
      setNaverMediaConnectionFormError(
        "현재 광고주의 매체 연결 범위를 안전하게 확인할 수 없습니다."
      );
      return;
    }

    if (
      selectedAdvertiserMediaAccessScope !== "true_master" &&
      selectedAdvertiserMediaAccessScope !== "workspace"
    ) {
      setNaverMediaConnectionFormError(
        "이 광고주의 매체 연결을 관리할 권한이 없습니다."
      );
      return;
    }

    const scopedNaverConnections = selectedAdvertiserMediaConnections.filter(
      (connection) =>
        connection.workspace_id === currentWorkspaceId &&
        connection.advertiser_id === advertiserId &&
        connection.provider === "naver_searchad"
    );

    const customerId = naverCustomerIdInput.trim();
    const accessLicense = naverAccessLicenseInput.trim();
    const secretKey = naverSecretKeyInput.trim();

    if (!customerId || !accessLicense || !secretKey) {
      setNaverMediaConnectionFormError(
        "Customer ID, Access License, Secret Key를 모두 입력하세요."
      );
      return;
    }

    if (
      customerId.length > 200 ||
      accessLicense.length > 500 ||
      secretKey.length > 1000
    ) {
      setNaverMediaConnectionFormError(
        "입력값 길이가 허용 범위를 초과했습니다."
      );
      return;
    }

    let requestUrl =
      `/api/advertisers/${encodeURIComponent(advertiserId)}/media-connections`;
    let method: "POST" | "PATCH" = "POST";
    let requestBody: Record<string, unknown>;

    if (naverMediaConnectionFormMode === "create") {
      if (scopedNaverConnections.length !== 0) {
        setNaverMediaConnectionFormError(
          "기존 Naver Search Ads 연결 기록이 있어 새 연결을 자동 생성하지 않습니다."
        );
        return;
      }

      const externalAccountId = naverExternalAccountIdInput.trim();
      const externalAccountName = naverExternalAccountNameInput.trim();

      if (!externalAccountId) {
        setNaverMediaConnectionFormError("외부 광고계정 ID를 입력하세요.");
        return;
      }

      if (externalAccountId.length > 300 || externalAccountName.length > 500) {
        setNaverMediaConnectionFormError(
          "광고계정 식별값 길이가 허용 범위를 초과했습니다."
        );
        return;
      }

      requestBody = {
        provider: "naver_searchad",
        externalAccountId,
        externalAccountName: externalAccountName || null,
        credentials: {
          customerId,
          accessLicense,
          secretKey,
        },
      };
    } else {
      if (scopedNaverConnections.length !== 1) {
        setNaverMediaConnectionFormError(
          "Naver Search Ads 연결이 하나로 확정되지 않아 자격증명을 변경하지 않습니다."
        );
        return;
      }

      const targetConnection = scopedNaverConnections[0];

      if (
        !naverMediaConnectionTargetId ||
        targetConnection.id !== naverMediaConnectionTargetId ||
        targetConnection.status === "disconnected"
      ) {
        setNaverMediaConnectionFormError(
          "자격증명을 변경할 연결을 안전하게 확정할 수 없습니다."
        );
        return;
      }

      method = "PATCH";
      requestUrl =
        `/api/advertisers/${encodeURIComponent(advertiserId)}` +
        `/media-connections/${encodeURIComponent(targetConnection.id)}/credentials`;
      requestBody = {
        provider: "naver_searchad",
        credentials: {
          customerId,
          accessLicense,
          secretKey,
        },
      };
    }

    setSavingNaverMediaConnection(true);
    setNaverMediaConnectionFormError("");

    try {
      const token = await getAccessToken();

      if (!token) {
        setNaverMediaConnectionFormError("로그인 세션이 없습니다.");
        return;
      }

      if (mediaConnectionScopeKeyRef.current !== scopeKey) {
        return;
      }

      const res = await fetch(requestUrl, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const json = await safeReadJson(res);

      if (mediaConnectionScopeKeyRef.current !== scopeKey) {
        return;
      }

      if (!res.ok || !(json as any)?.ok) {
        const errorCode = String((json as any)?.error ?? "").trim();

        if (errorCode === "CONNECTION_ALREADY_EXISTS") {
          setNaverMediaConnectionFormError(
            "이미 등록된 매체 계정 연결입니다. 현재 연결 상태를 다시 확인하세요."
          );
        } else if (
          errorCode === "CONNECTION_MANAGE_ACCESS_DENIED" ||
          errorCode === "MEDIA_CONNECTION_MANAGEMENT_FORBIDDEN"
        ) {
          setNaverMediaConnectionFormError(
            "이 광고주의 매체 연결을 관리할 권한이 없습니다."
          );
        } else if (errorCode === "CONNECTION_NOT_FOUND") {
          setNaverMediaConnectionFormError(
            "대상 연결을 찾을 수 없습니다. 연결 상태를 다시 불러오세요."
          );
        } else if (errorCode === "INVALID_INPUT") {
          setNaverMediaConnectionFormError(
            "입력값을 확인하세요. 저장되지 않았습니다."
          );
        } else if (errorCode === "ENCRYPTION_ERROR") {
          setNaverMediaConnectionFormError(
            "자격증명을 안전하게 암호화하지 못해 저장하지 않았습니다."
          );
        } else {
          setNaverMediaConnectionFormError(
            naverMediaConnectionFormMode === "create"
              ? "Naver Search Ads 연결을 저장하지 못했습니다."
              : "Naver Search Ads 자격증명을 변경하지 못했습니다."
          );
        }
        return;
      }

      const responseAdvertiserId = String(
        (json as any)?.advertiser_id ?? ""
      ).trim();
      const responseWorkspaceId = String(
        (json as any)?.workspace_id ?? ""
      ).trim();
      const responseConnection = (json as any)?.connection as
        | SafeMediaConnection
        | undefined;

      if (
        responseAdvertiserId !== advertiserId ||
        responseWorkspaceId !== currentWorkspaceId ||
        !responseConnection ||
        responseConnection.advertiser_id !== advertiserId ||
        responseConnection.workspace_id !== currentWorkspaceId ||
        responseConnection.provider !== "naver_searchad" ||
        (naverMediaConnectionFormMode === "replace" &&
          responseConnection.id !== naverMediaConnectionTargetId)
      ) {
        console.warn(
          "[advertiser-media-connections:mutation] response scope mismatch"
        );
        setNaverMediaConnectionFormError(
          "저장 결과의 광고주 범위를 안전하게 확인할 수 없습니다."
        );
        return;
      }

      const completedMode = naverMediaConnectionFormMode;

      closeNaverMediaConnectionForm();
      setMediaConnectionsRefreshVersion((prev) => prev + 1);
      setLocalMsg(
        completedMode === "create"
          ? "Naver Search Ads 연결 정보를 안전하게 저장했습니다."
          : "Naver Search Ads 자격증명을 안전하게 교체했습니다."
      );
    } catch (error) {
      console.warn(
        "[advertiser-media-connections:mutation] exception",
        error
      );

      if (mediaConnectionScopeKeyRef.current === scopeKey) {
        setNaverMediaConnectionFormError(
          naverMediaConnectionFormMode === "create"
            ? "Naver Search Ads 연결을 저장하지 못했습니다."
            : "Naver Search Ads 자격증명을 변경하지 못했습니다."
        );
      }
    } finally {
      setSavingNaverMediaConnection(false);
    }
  }

  async function createAdvertiser() {
    if (!canManageAdvertisers) {
      setLocalMsg("광고주 생성 권한이 없습니다.");
      return;
    }

    if (!workspaceId || !userId || creatingAdvertiser) return;

    const name = newAdvertiserName.trim();
    if (!name) {
      setLocalMsg("광고주명을 입력하세요.");
      return;
    }

    setCreatingAdvertiser(true);
    setLocalMsg("");

    try {
      const duplicated = advertisers.find((a) => norm(a.name) === norm(name));
      if (duplicated) {
        setSelectedAdvertiserId(duplicated.id);
        setNewAdvertiserName("");
        setLocalMsg(`이미 있는 광고주입니다. "${duplicated.name}" 을(를) 선택했습니다.`);
        setCreatingAdvertiser(false);
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        setLocalMsg("로그인 세션이 없습니다.");
        setCreatingAdvertiser(false);
        return;
      }

      const res = await fetch("/api/advertisers/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name,
        }),
      });

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[advertisers/create] failed", res.status, json);
        setLocalMsg(
          (json as any)?.message ||
            (json as any)?.detail ||
            (json as any)?.error ||
            "광고주 생성 실패"
        );
        setCreatingAdvertiser(false);
        return;
      }

      const data = (json as any)?.advertiser;

      const created: AdvertiserRow = {
        id: String((data as any)?.id),
        name: String((data as any)?.name ?? name),
        workspace_id: (data as any)?.workspace_id
          ? String((data as any).workspace_id)
          : workspaceId,
        workspace_name: null,
        public_slug: (data as any)?.public_slug
          ? String((data as any).public_slug)
          : null,
        created_by: (data as any)?.created_by
          ? String((data as any).created_by)
          : userId,
      };

      setAdvertisers((prev) => {
        const next = [...prev, created].sort((a, b) =>
          a.name.localeCompare(b.name, "ko")
        );
        return next;
      });

      setOpenMap((prev) => ({ ...prev, [created.id]: true }));
      setSelectedAdvertiserId(created.id);
      setNewAdvertiserName("");
      setLocalMsg(`광고주 "${created.name}" 생성 완료`);
    } catch (e: any) {
      setLocalMsg(e?.message || "광고주 생성 실패");
    } finally {
      setCreatingAdvertiser(false);
    }
  }

  async function deleteSelectedAdvertisers() {
    if (!canDeleteAdvertisers) {
      setLocalMsg("광고주 삭제 권한이 없습니다.");
      return;
    }

    if (!workspaceId || !selectedAdvertiserIds.length || deletingAdvertisers) return;

    const ok = window.confirm(
      `선택한 광고주 ${selectedAdvertiserIds.length}개를 삭제하시겠습니까?\n\n연결된 리포트가 있는 광고주는 삭제되지 않습니다.`
    );
    if (!ok) return;

    setDeletingAdvertisers(true);
    setLocalMsg("");

    try {
      const token = await getAccessToken();
      if (!token) {
        setLocalMsg("로그인 세션이 없습니다.");
        setDeletingAdvertisers(false);
        return;
      }

      let deletedCount = 0;

      for (const advertiserId of selectedAdvertiserIds) {
        const res = await fetch(`/api/advertisers/${advertiserId}`, {
          method: "DELETE",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await safeReadJson(res);

        if (!res.ok || !(json as any)?.ok) {
          setLocalMsg(
            (json as any)?.message ||
              (json as any)?.error ||
              "광고주 삭제 실패"
          );
          setDeletingAdvertisers(false);
          return;
        }

        deletedCount += 1;
      }

      setAdvertisers((prev) =>
        prev.filter((a) => !selectedAdvertiserIds.includes(a.id))
      );

      if (
        selectedAdvertiserId &&
        selectedAdvertiserIds.includes(selectedAdvertiserId)
      ) {
        setSelectedAdvertiserId("");
      }

      setSelectedAdvertiserIds([]);
      setLocalMsg(`광고주 ${deletedCount}개 삭제 완료`);
    } catch (e: any) {
      setLocalMsg(e?.message || "광고주 삭제 실패");
    } finally {
      setDeletingAdvertisers(false);
    }
  }

  async function savePublicSlug() {
    if (!selectedAdvertiserId) {
      setLocalMsg("공개 URL을 설정할 광고주를 먼저 선택하세요.");
      return;
    }

    if (!canUpdatePublicSlug) {
      setLocalMsg("공개 URL 수정 권한이 없습니다.");
      return;
    }

    if (isAllWorkspaceMode) {
      setLocalMsg("전체 workspace 보기에서는 공개 URL을 수정할 수 없습니다.");
      return;
    }

    if (savingPublicSlug) return;

    const nextSlug = publicSlugInput.trim().toLowerCase();

    if (nextSlug && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(nextSlug)) {
      setLocalMsg("공개 URL은 소문자 영어, 숫자, 하이픈만 사용할 수 있고 시작과 끝은 영문 또는 숫자여야 합니다.");
      return;
    }

    setSavingPublicSlug(true);
    setLocalMsg("");

    try {
      const token = await getAccessToken();
      if (!token) {
        setLocalMsg("로그인 세션이 없습니다.");
        setSavingPublicSlug(false);
        return;
      }

      const res = await fetch(
        `/api/advertisers/${encodeURIComponent(selectedAdvertiserId)}/public-slug`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            public_slug: nextSlug,
          }),
        }
      );

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[advertisers/public-slug] failed", res.status, json);
        setLocalMsg(
          (json as any)?.message ||
            (json as any)?.error ||
            "공개 URL 저장 실패"
        );
        setSavingPublicSlug(false);
        return;
      }

      const updated = (json as any)?.advertiser ?? {};
      const updatedSlug = updated?.public_slug
        ? String(updated.public_slug)
        : null;

      setAdvertisers((prev) =>
        prev.map((a) => {
          if (a.id !== selectedAdvertiserId) return a;

          return {
            ...a,
            public_slug: updatedSlug,
          };
        })
      );

      setPublicSlugInput(updatedSlug ?? "");

      if (updatedSlug) {
        setLocalMsg(`공개 URL 저장 완료: ${PUBLIC_CLIENT_URL_PREFIX}${updatedSlug}`);
      } else {
        setLocalMsg("공개 URL 제거 완료");
      }
    } catch (e: any) {
      setLocalMsg(e?.message || "공개 URL 저장 실패");
    } finally {
      setSavingPublicSlug(false);
    }
  }

  async function createReport(type: ReportType) {
    if (isAllWorkspaceMode) {
      setLocalMsg("전체 workspace 보기에서는 리포트를 생성할 수 없습니다. 특정 workspace를 선택해 주세요.");
      return;
    }

    if (!canCreateReport) {
      setLocalMsg("리포트 생성 권한이 없습니다.");
      return;
    }

    if (!workspaceId || creating) return;

    if (selectedReportDataSourceKind === "api") {
      if (!selectedAdvertiserId) {
        setLocalMsg("API 연동형 리포트는 광고주를 먼저 선택해야 합니다.");
        return;
      }

      if (
        loadingSelectedAdvertiserMediaConnections ||
        !hasCurrentAdvertiserMediaConnectionSnapshot
      ) {
        setLocalMsg("현재 광고주의 매체 연결 상태를 확인한 뒤 다시 시도해 주세요.");
        return;
      }

      if (selectedAdvertiserMediaConnectionsError) {
        setLocalMsg("현재 광고주의 매체 연결 상태를 안전하게 확인할 수 없습니다.");
        return;
      }

      if (!selectedApiMediaConnectionId) {
        setLocalMsg("API 연동형 리포트에 사용할 매체 연결을 선택해 주세요.");
        return;
      }

      if (!selectedApiReportConnection) {
        setLocalMsg(
          "선택한 매체 연결을 API 리포트에 사용할 수 없습니다. 연결 상태를 다시 확인해 주세요."
        );
        return;
      }
    }

    setCreating(true);
    setLocalMsg("");

    const token = await getAccessToken();
    if (!token) {
      setCreating(false);
      setLocalMsg("로그인 세션이 없습니다.");
      return;
    }

    const advertiserId = selectedAdvertiserId || null;
    const reportDataSourceMeta =
      selectedReportDataSourceKind === "api"
        ? {
            data_source: {
              kind: "api",
              data_level: "keyword",
              mode: "snapshot_replace",
            },
          }
        : {
            data_source: {
              kind: "csv",
            },
          };

    const res = await fetch("/api/reports/create", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        advertiser_id: advertiserId,
        ...(selectedReportDataSourceKind === "api"
          ? {
              connection_id: selectedApiReportConnection?.id ?? null,
            }
          : {}),
        report_type_id: type.id,
        title: `${type.name} - Draft`,
        meta: {
          ...reportDataSourceMeta,
          report_theme: selectedReportTheme,
        },
        status: "draft",
      }),
    });

    const json = await safeReadJson(res);
    const reportId = (json as any)?.report?.id;

    setCreating(false);

    if (!res.ok || !reportId) {
      console.warn("[reports/create] failed", res.status, json);

      const createError = String((json as any)?.error ?? "").trim();

      if (
        selectedReportDataSourceKind === "api" &&
        (
          createError === "CONNECTION_NOT_FOUND" ||
          createError === "CONNECTION_SCOPE_MISMATCH" ||
          createError === "CONNECTION_NOT_ACTIVE" ||
          createError === "CONNECTION_CREDENTIALS_MISSING"
        )
      ) {
        setSelectedApiMediaConnectionId("");
        setMediaConnectionsRefreshVersion((prev) => prev + 1);
        setLocalMsg(
          "선택한 API 연결 상태가 변경되었습니다. 연결 상태를 다시 확인한 뒤 선택해 주세요."
        );
        return;
      }

      setLocalMsg("리포트 생성 실패");
      return;
    }

    await fetchReports();
    router.push(`/reports/${reportId}`);
  }

  async function updateExistingReportTheme(
    report: ReportRow,
    nextTheme: ReportTheme
  ) {
    const reportId = String(report?.id ?? "").trim();
    const currentTheme = normalizeReportTheme(report?.report_theme);

    if (!reportId || savingReportThemeId || currentTheme === nextTheme) {
      return;
    }

    setSavingReportThemeId(reportId);
    setLocalMsg("");

    try {
      const token = await getAccessToken();

      if (!token) {
        setLocalMsg("로그인 세션이 없습니다.");
        return;
      }

      const res = await fetch(
        `/api/reports/${encodeURIComponent(reportId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            meta: {
              report_theme: nextTheme,
            },
          }),
        }
      );

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[reports/theme] failed", res.status, json);
        setLocalMsg(
          (json as any)?.message ||
            (json as any)?.error ||
            "리포트 테마 저장 실패"
        );
        return;
      }

      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? {
                ...item,
                report_theme: nextTheme,
              }
            : item
        )
      );

      setLocalMsg(
        nextTheme === "studio"
          ? "리포트 테마를 Etrylue Studio로 저장했습니다."
          : "리포트 테마를 Etrylue Light로 저장했습니다."
      );
    } catch (error) {
      console.warn("[reports/theme] exception", error);
      setLocalMsg("리포트 테마 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingReportThemeId((current) =>
        current === reportId ? null : current
      );
    }
  }

  const fetchLatestMediaSyncJobForReport = useCallback(
    async (reportId: string, silent = false) => {
      const normalizedReportId = String(reportId ?? "").trim();

      if (!normalizedReportId) return null;

      if (!silent) {
        setLoadingMediaSyncReportIds((prev) => ({
          ...prev,
          [normalizedReportId]: true,
        }));
      }

      try {
        const token = await getAccessToken();

        if (!token) {
          if (!silent) setLocalMsg("로그인 세션이 없습니다.");
          return null;
        }

        const res = await fetch(
          `/api/reports/${encodeURIComponent(
            normalizedReportId
          )}/media-sync-jobs`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const json = await safeReadJson(res);

        if (!res.ok || !(json as any)?.ok) {
          if (!silent) {
            console.warn(
              "[media-sync-jobs:get] failed",
              res.status,
              json
            );
            setLocalMsg(
              (json as any)?.error || "동기화 상태 조회 실패"
            );
          }
          return null;
        }

        const activeJob =
          ((json as any)?.active_job as ReportMediaSyncJob | null) ?? null;
        const latestJob = Array.isArray((json as any)?.jobs)
          ? (((json as any).jobs[0] as ReportMediaSyncJob | undefined) ??
              null)
          : null;
        const nextJob = activeJob ?? latestJob;

        setMediaSyncJobsByReportId((prev) => ({
          ...prev,
          [normalizedReportId]: nextJob,
        }));

        return nextJob;
      } catch (error: any) {
        if (!silent) {
          console.warn("[media-sync-jobs:get] exception", error);
          setLocalMsg(error?.message || "동기화 상태 조회 실패");
        }
        return null;
      } finally {
        if (!silent) {
          setLoadingMediaSyncReportIds((prev) => {
            const next = { ...prev };
            delete next[normalizedReportId];
            return next;
          });
        }
      }
    },
    []
  );

  async function requestMediaSyncForReport(report: ReportRow) {
    const reportId = String(report.id ?? "").trim();

    if (!reportId || requestingMediaSyncReportId) return;

    if (normalizeReportDataSourceKind(report.data_source_kind) !== "api") {
      setLocalMsg("CSV 업로드형 리포트는 API 동기화 요청 대상이 아닙니다.");
      return;
    }

    if (!report.advertiser_id) {
      setLocalMsg("API 동기화는 광고주가 연결된 리포트에서만 요청할 수 있습니다.");
      return;
    }

    const dateRange = pickReportSyncDateRange(report);

    if (!dateRange) {
      setLocalMsg("API 동기화 기간은 저장되어 있어야 하며, 네이버 검색광고는 31일 이내만 요청할 수 있습니다.");
      return;
    }

    const currentJob = mediaSyncJobsByReportId[reportId];

    if (isActiveMediaSyncJobStatus(currentJob?.status)) {
      setLocalMsg("이미 대기 또는 처리 중인 API 동기화 job이 있습니다.");
      return;
    }

    setRequestingMediaSyncReportId(reportId);
    setLocalMsg("API 동기화 요청을 준비합니다...");

    try {
      const token = await getAccessToken();

      if (!token) {
        setLocalMsg("로그인 세션이 없습니다.");
        return;
      }

      const res = await fetch(
        `/api/reports/${encodeURIComponent(reportId)}/media-sync-jobs`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            dataLevel: report.media_sync_data_level ?? "keyword",
            mode: report.media_sync_mode ?? "snapshot_replace",
          }),
        }
      );

      const json = await safeReadJson(res);

      if (!res.ok || !(json as any)?.ok) {
        console.warn("[media-sync-jobs:post] failed", res.status, json);

        const syncError = String((json as any)?.error ?? "").trim();

        if (syncError === "ACTIVE_JOB_ALREADY_EXISTS") {
          await fetchLatestMediaSyncJobForReport(reportId, true);
          setLocalMsg("이미 대기 또는 처리 중인 API 동기화 job이 있습니다.");
          return;
        }

        if (syncError === "REPORT_CONNECTION_NOT_MAPPED") {
          setLocalMsg("리포트에 연결된 API 매체 연결을 찾을 수 없습니다.");
          return;
        }

        if (
          syncError === "CONNECTION_NOT_FOUND" ||
          syncError === "CONNECTION_SCOPE_MISMATCH" ||
          syncError === "CONNECTION_NOT_ACTIVE"
        ) {
          setLocalMsg("리포트에 연결된 API 매체 연결 상태를 확인해 주세요.");
          return;
        }

        if (syncError === "PROVIDER_SYNC_NOT_ENABLED") {
          setLocalMsg("해당 매체의 API 동기화 기능은 아직 활성화되지 않았습니다.");
          return;
        }

        if (syncError === "PROVIDER_DATA_LEVEL_NOT_SUPPORTED") {
          setLocalMsg("현재 리포트 데이터 수준은 해당 매체 동기화에서 지원되지 않습니다.");
          return;
        }

        setLocalMsg(syncError || "API 동기화 요청 실패");
        return;
      }

      const job = ((json as any)?.job ?? null) as ReportMediaSyncJob | null;

      setMediaSyncJobsByReportId((prev) => ({
        ...prev,
        [reportId]: job,
      }));

      setLocalMsg(
        `API 동기화 요청 생성 완료: ${dateRange.dateFrom} ~ ${dateRange.dateTo}`
      );
    } catch (error: any) {
      console.warn("[media-sync-jobs:post] exception", error);
      setLocalMsg(error?.message || "API 동기화 요청 실패");
    } finally {
      setRequestingMediaSyncReportId(null);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const activeReportIds = Object.entries(mediaSyncJobsByReportId)
      .filter(([, job]) => isActiveMediaSyncJobStatus(job?.status))
      .map(([reportId]) => reportId);

    if (activeReportIds.length === 0) return;

    const timer = window.setInterval(() => {
      activeReportIds.forEach((reportId) => {
        fetchLatestMediaSyncJobForReport(reportId, true);
      });
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [userId, mediaSyncJobsByReportId, fetchLatestMediaSyncJobForReport]);

  async function deleteSelectedReports() {
    if (!canDeleteReports) {
      setLocalMsg("리포트 삭제 권한이 없습니다.");
      return;
    }

    if (!workspaceId || !selectedReportIds.length || deletingReports) return;

    const targetReportIds = [...selectedReportIds];

    const ok = window.confirm(
      `선택한 리포트 ${targetReportIds.length}개를 삭제하시겠습니까?\n\n이 삭제는 실제 삭제(hard delete)이며 report_rows / report_creatives / report_csv_uploads / report_image_uploads / reports 데이터가 함께 제거될 수 있습니다.`
    );
    if (!ok) return;

    setDeletingReports(true);
    setLocalMsg(`리포트 ${targetReportIds.length}개 삭제를 시작합니다...`);

    const deletedIds: string[] = [];
    const failedItems: Array<{
      id: string;
      step?: string;
      error?: string;
    }> = [];
    const notFoundIds: string[] = [];

    try {
      const token = await getAccessToken();

      if (!token) {
        setLocalMsg("로그인 세션이 없습니다.");
        setDeletingReports(false);
        return;
      }

      const selectedReports = targetReportIds
        .map((id) => reports.find((report) => report.id === id))
        .filter(Boolean) as ReportRow[];

      const missingSelectedIds = targetReportIds.filter(
        (id) => !selectedReports.some((report) => report.id === id)
      );

      if (missingSelectedIds.length > 0) {
        notFoundIds.push(...missingSelectedIds);
      }

      const reportsByWorkspace = new Map<string, string[]>();

      for (const report of selectedReports) {
        const reportWorkspaceId = String(report.workspace_id ?? "").trim();

        if (!reportWorkspaceId) {
          failedItems.push({
            id: report.id,
            error: "리포트의 workspace_id를 확인할 수 없습니다.",
          });
          continue;
        }

        const list = reportsByWorkspace.get(reportWorkspaceId) ?? [];
        list.push(report.id);
        reportsByWorkspace.set(reportWorkspaceId, list);
      }

      let processedCount = 0;
      const totalProcessCount = Array.from(reportsByWorkspace.values()).reduce(
        (sum, ids) => sum + ids.length,
        0
      );

      for (const [targetWorkspaceId, ids] of reportsByWorkspace.entries()) {
        for (const reportId of ids) {
          processedCount += 1;
          setLocalMsg(
            `리포트 삭제 중... ${processedCount}/${totalProcessCount}`
          );

          const res = await fetch("/api/reports/delete", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              workspace_id: targetWorkspaceId,
              report_ids: [reportId],
            }),
          });

          const json = await safeReadJson(res);

          if (!res.ok || !(json as any)?.ok) {
            console.warn("[reports/delete] failed", res.status, json);

            failedItems.push({
              id: reportId,
              step: (json as any)?.step,
              error:
                (json as any)?.detail ||
                (json as any)?.message ||
                (json as any)?.error ||
                "리포트 삭제 실패",
            });

            continue;
          }

          const nextDeletedIds = Array.isArray((json as any)?.deleted_ids)
            ? ((json as any).deleted_ids as any[]).map((id) => String(id))
            : [];

          const nextFailed = Array.isArray((json as any)?.failed)
            ? ((json as any).failed as any[])
            : [];

          const nextNotFoundIds = Array.isArray((json as any)?.not_found_ids)
            ? ((json as any).not_found_ids as any[]).map((id) => String(id))
            : [];

          if (nextDeletedIds.length > 0) {
            deletedIds.push(...nextDeletedIds);

            const deletedSet = new Set(nextDeletedIds);

            setReports((prev) =>
              prev.filter((report) => !deletedSet.has(report.id))
            );

            setSelectedReportIds((prev) =>
              prev.filter((id) => !deletedSet.has(id))
            );
          }

          if (nextFailed.length > 0) {
            for (const item of nextFailed) {
              failedItems.push({
                id: String(item?.id ?? reportId),
                step: item?.step ? String(item.step) : undefined,
                error: item?.error ? String(item.error) : "리포트 삭제 실패",
              });
            }
          }

          if (nextNotFoundIds.length > 0) {
            notFoundIds.push(...nextNotFoundIds);
          }

          if (
            nextDeletedIds.length === 0 &&
            nextFailed.length === 0 &&
            nextNotFoundIds.length === 0
          ) {
            failedItems.push({
              id: reportId,
              error: "삭제 결과가 반환되지 않았습니다.",
            });
          }
        }
      }

      const deletedSet = new Set(deletedIds);

      setSelectedReportIds((prev) =>
        prev.filter((id) => !deletedSet.has(id))
      );

      await fetchReports();

      if (failedItems.length > 0 || notFoundIds.length > 0) {
        console.warn("[reports/delete] batch partial result", {
          deletedIds,
          failedItems,
          notFoundIds,
        });

        setLocalMsg(
          `리포트 삭제 일부 완료: 성공 ${deletedIds.length}개 / 실패 ${failedItems.length}개 / 찾을 수 없음 ${notFoundIds.length}개`
        );
        return;
      }

      setSelectedReportIds([]);
      setLocalMsg(`리포트 ${deletedIds.length}개 삭제 완료`);
    } catch (e: any) {
      setLocalMsg(e?.message || "리포트 삭제 실패");
    } finally {
      setDeletingReports(false);
    }
  }

  function toggleAdvertiserSelection(advertiserId: string) {
    if (!canDeleteAdvertisers) return;

    setSelectedAdvertiserIds((prev) => {
      return prev.includes(advertiserId)
        ? prev.filter((id) => id !== advertiserId)
        : [...prev, advertiserId];
    });
  }

  function toggleFolder(key: string) {
    setOpenMap((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  function toggleReportSelection(reportId: string) {
    if (!canDeleteReports) return;

    setSelectedReportIds((prev) => {
      return prev.includes(reportId)
        ? prev.filter((id) => id !== reportId)
        : [...prev, reportId];
    });
  }

  function openMemberManagement() {
    const next = workspaceId
      ? `/report-builder/members?workspace_id=${encodeURIComponent(workspaceId)}`
      : "/report-builder/members";

    router.push(next);
  }

  function changeWorkspace(nextWorkspaceId: string) {
    if (!nextWorkspaceId) return;
    if (nextWorkspaceId === workspaceId) return;

    setSelectedAdvertiserId("");
    setSelectedReportDataSourceKind("csv");
    setSelectedApiMediaConnectionId("");
    setPublicSlugInput("");
    setSavingPublicSlug(false);
    setSelectedAdvertiserIds([]);
    setSelectedReportIds([]);
    setSearch("");
    setLocalMsg("");
    resetReportsState();
    router.replace(`/report-builder?workspace_id=${encodeURIComponent(nextWorkspaceId)}`);
  }

  const advNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of advertisers) {
      m.set(a.id, formatAdvertiserLabel(a));
    }
    return m;
  }, [advertisers]);

  const selectedAdvertiser = useMemo(() => {
    if (!selectedAdvertiserId) return null;
    return advertisers.find((a) => a.id === selectedAdvertiserId) ?? null;
  }, [advertisers, selectedAdvertiserId]);

  const selectedAdvertiserName = useMemo(() => {
    return selectedAdvertiser ? formatAdvertiserLabel(selectedAdvertiser) : "";
  }, [selectedAdvertiser]);

  const currentAdvertiserMediaConnectionScopeKey =
    workspaceId &&
    workspaceId !== ALL_WORKSPACES &&
    selectedAdvertiserId
      ? `${workspaceId}:${selectedAdvertiserId}`
      : "";

  const hasCurrentAdvertiserMediaConnectionSnapshot =
    Boolean(currentAdvertiserMediaConnectionScopeKey) &&
    resolvedAdvertiserMediaConnectionScopeKey ===
      currentAdvertiserMediaConnectionScopeKey;

  const currentAdvertiserMediaConnections =
    hasCurrentAdvertiserMediaConnectionSnapshot
      ? selectedAdvertiserMediaConnections.filter((connection) => {
          return (
            connection.workspace_id === workspaceId &&
            connection.advertiser_id === selectedAdvertiserId
          );
        })
      : [];

  const selectedAdvertiserNaverConnections =
    currentAdvertiserMediaConnections.filter(
      (connection) => connection.provider === "naver_searchad"
    );
  const selectedAdvertiserGoogleConnections =
    currentAdvertiserMediaConnections.filter(
      (connection) => connection.provider === "google_ads"
    );
  const usableGoogleConnections = selectedAdvertiserGoogleConnections.filter(
    (connection) =>
      connection.status === "active" && connection.has_credentials
  );
  const googleConnectionWithoutCredentials =
    selectedAdvertiserGoogleConnections.find(
      (connection) =>
        connection.status === "active" && !connection.has_credentials
    ) ?? null;
  const googleErrorConnection =
    selectedAdvertiserGoogleConnections.find(
      (connection) => connection.status === "error"
    ) ?? null;
  const selectedAdvertiserMetaConnections =
    currentAdvertiserMediaConnections.filter(
      (connection) => connection.provider === "meta_ads"
    );

  const usableNaverConnections = selectedAdvertiserNaverConnections.filter(
    (connection) =>
      connection.status === "active" && connection.has_credentials
  );
  const naverConnectionWithoutCredentials =
    selectedAdvertiserNaverConnections.find(
      (connection) =>
        connection.status === "active" && !connection.has_credentials
    ) ?? null;
  const naverErrorConnection =
    selectedAdvertiserNaverConnections.find(
      (connection) => connection.status === "error"
    ) ?? null;
  const primaryNaverConnection =
    usableNaverConnections.length === 1 ? usableNaverConnections[0] : null;
  const singleNaverConnection =
    selectedAdvertiserNaverConnections.length === 1
      ? selectedAdvertiserNaverConnections[0]
      : null;
  const selectedApiReportConnection =
    hasCurrentAdvertiserMediaConnectionSnapshot &&
    !selectedAdvertiserMediaConnectionsError
      ? usableNaverConnections.find(
          (connection) => connection.id === selectedApiMediaConnectionId
        ) ?? null
      : null;
  const canManageSelectedAdvertiserMediaConnections =
    hasCurrentAdvertiserMediaConnectionSnapshot &&
    !selectedAdvertiserMediaConnectionsError &&
    (selectedAdvertiserMediaAccessScope === "true_master" ||
      selectedAdvertiserMediaAccessScope === "workspace");

  async function startGoogleAdsOAuth() {
    if (startingGoogleAdsOAuth) return;

    const advertiserId = selectedAdvertiserId.trim();
    const targetCustomerId = googleAdsTargetCustomerIdInput.trim();
    const loginCustomerId = googleAdsLoginCustomerIdInput.trim();

    if (!advertiserId || !canManageSelectedAdvertiserMediaConnections) {
      setGoogleAdsOAuthStartError(
        "현재 광고주의 매체 연결을 관리할 권한이 없습니다.",
      );
      return;
    }

    if (!targetCustomerId) {
      setGoogleAdsOAuthStartError(
        "Google Ads 고객 ID를 입력해 주세요.",
      );
      return;
    }

    setStartingGoogleAdsOAuth(true);
    setGoogleAdsOAuthStartError("");

    try {
      const res = await fetch(
        "/api/media-connections/google-ads/oauth/start",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            advertiserId,
            targetCustomerId,
            loginCustomerId: loginCustomerId || null,
          }),
        },
      );

      const data = await safeReadJson(res);

      if (!res.ok) {
        const message =
          res.status === 403
            ? "Google Ads 연결을 시작할 권한이 없습니다."
            : res.status === 400
              ? "Google Ads 고객 ID 입력값을 확인해 주세요."
              : "Google Ads 연결을 시작하지 못했습니다.";

        setGoogleAdsOAuthStartError(message);
        return;
      }

      const authorizationUrl =
        typeof data?.authorization_url === "string"
          ? data.authorization_url.trim()
          : "";

      if (!authorizationUrl) {
        setGoogleAdsOAuthStartError(
          "Google 인증 주소를 확인하지 못했습니다.",
        );
        return;
      }

      window.location.assign(authorizationUrl);
    } catch {
      setGoogleAdsOAuthStartError(
        "Google Ads 연결을 시작하지 못했습니다.",
      );
    } finally {
      setStartingGoogleAdsOAuth(false);
    }
  }

  const canCreateNaverConnection =
    canManageSelectedAdvertiserMediaConnections &&
    selectedAdvertiserNaverConnections.length === 0;
  const canReplaceNaverCredentials =
    canManageSelectedAdvertiserMediaConnections &&
    Boolean(singleNaverConnection) &&
    singleNaverConnection?.status !== "disconnected";
  const naverFormTargetConnection =
    naverMediaConnectionFormMode === "replace" &&
    singleNaverConnection?.id === naverMediaConnectionTargetId
      ? singleNaverConnection
      : null;

  const selectedAdvertiserPublicSlug = selectedAdvertiser?.public_slug ?? "";

  const selectedAdvertiserPublicUrl = selectedAdvertiserPublicSlug
    ? `${PUBLIC_CLIENT_URL_PREFIX}${selectedAdvertiserPublicSlug}`
    : "";

  const filteredReports = useMemo(() => {
    const s = norm(search);

    return reports.filter((r) => {
      if (isArchivedReport(r)) return false;

      const title = norm(r.title);
      const id = norm(r.id);
      const advName =
        norm(r.advertiser_name) ||
        (r.advertiser_id ? norm(advNameById.get(r.advertiser_id) ?? "") : "");

      const matchesSearch =
        !s || title.includes(s) || id.includes(s) || advName.includes(s);

      const matchesStatus =
        reportFilter === "all"
          ? true
          : reportFilter === "published"
          ? isPublishedReport(r)
          : isDraftReport(r);

      const matchesSelectedAdvertiser = selectedAdvertiserId
        ? String(r.advertiser_id ?? "") === selectedAdvertiserId
        : isAllWorkspaceMode
        ? true
        : !r.advertiser_id;

      return matchesSearch && matchesStatus && matchesSelectedAdvertiser;
    });
  }, [reports, search, advNameById, reportFilter, selectedAdvertiserId, isAllWorkspaceMode]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of filteredReports) {
      const k = r.advertiser_id ? String(r.advertiser_id) : "__none__";
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }

    const orderedKeys: string[] = [];
    for (const a of advertisers) {
      if (map.has(a.id)) orderedKeys.push(a.id);
    }
    if (map.has("__none__")) orderedKeys.push("__none__");
    for (const k of map.keys()) {
      if (!orderedKeys.includes(k)) orderedKeys.push(k);
    }

    return { map, orderedKeys };
  }, [filteredReports, advertisers]);

  const virtualRows = useMemo(() => {
    const rows: Array<
      | {
          kind: "folder";
          key: string;
          folderKey: string;
          folderName: string;
          isNone: boolean;
          list: ReportRow[];
          open: boolean;
        }
      | {
          kind: "report";
          key: string;
          folderKey: string;
          report: ReportRow;
          idx: number;
          listLength: number;
        }
    > = [];

    for (const key of grouped.orderedKeys) {
      const list = grouped.map.get(key) ?? [];
      const isNone = key === "__none__";
      const folderName = isNone
        ? "광고주 미지정"
        : advNameById.get(key) ||
          (list.find((x) => x.advertiser_name)?.advertiser_name ?? "(광고주)");

      const open = openMap[key] ?? true;

      rows.push({
        kind: "folder",
        key: `folder:${key}`,
        folderKey: key,
        folderName,
        isNone,
        list,
        open,
      });

      if (open) {
        for (let idx = 0; idx < list.length; idx++) {
          rows.push({
            kind: "report",
            key: `report:${key}:${list[idx].id}`,
            folderKey: key,
            report: list[idx],
            idx,
            listLength: list.length,
          });
        }
      }
    }

    return rows;
  }, [grouped, advNameById, openMap]);

  const getVirtualRowHeight = useCallback(
    (
      row:
        | {
            kind: "folder";
            key: string;
            folderKey: string;
            folderName: string;
            isNone: boolean;
            list: ReportRow[];
            open: boolean;
          }
        | {
            kind: "report";
            key: string;
            folderKey: string;
            report: ReportRow;
            idx: number;
            listLength: number;
          }
    ) => {
      return row.kind === "folder" ? FOLDER_ROW_HEIGHT : REPORT_ROW_HEIGHT;
    },
    [FOLDER_ROW_HEIGHT, REPORT_ROW_HEIGHT]
  );

  const virtualOffsets = useMemo(() => {
    const offsets: number[] = new Array(virtualRows.length);
    let acc = 0;

    for (let i = 0; i < virtualRows.length; i += 1) {
      offsets[i] = acc;
      acc += getVirtualRowHeight(virtualRows[i]);
    }

    return offsets;
  }, [virtualRows, getVirtualRowHeight]);

  const totalVirtualHeight = useMemo(() => {
    if (virtualRows.length === 0) return 0;
    const lastIndex = virtualRows.length - 1;
    return virtualOffsets[lastIndex] + getVirtualRowHeight(virtualRows[lastIndex]);
  }, [virtualRows, virtualOffsets, getVirtualRowHeight]);

  const findVirtualStartIndex = useCallback(
    (scrollTop: number) => {
      if (virtualRows.length === 0) return 0;

      let left = 0;
      let right = virtualRows.length - 1;
      let answer = 0;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const rowTop = virtualOffsets[mid];
        const rowBottom = rowTop + getVirtualRowHeight(virtualRows[mid]);

        if (rowBottom >= scrollTop) {
          answer = mid;
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }

      return answer;
    },
    [virtualRows, virtualOffsets, getVirtualRowHeight]
  );

  const virtualStartIndex = useMemo(() => {
    return Math.max(0, findVirtualStartIndex(listScrollTop) - OVERSCAN);
  }, [findVirtualStartIndex, listScrollTop, OVERSCAN]);

  const virtualEndIndex = useMemo(() => {
    const viewportBottom = listScrollTop + listViewportHeight;
    return Math.min(
      virtualRows.length,
      findVirtualStartIndex(viewportBottom) + OVERSCAN + 1
    );
  }, [
    findVirtualStartIndex,
    listScrollTop,
    listViewportHeight,
    virtualRows.length,
    OVERSCAN,
  ]);

  const visibleVirtualRows = useMemo(() => {
    return virtualRows.slice(virtualStartIndex, virtualEndIndex);
  }, [virtualRows, virtualStartIndex, virtualEndIndex]);

  /**
   * 전체 workspace(master) 화면에서는 실제 row 높이와 고정 row height가 조금만 달라도
   * absolute 기반 virtual list가 스크롤 보정/떨림을 만들 수 있다.
   * 전체 목록 정리/삭제 작업은 안정성이 우선이므로, 전체 workspace 모드에서는
   * 가상 스크롤을 끄고 현재 로딩된 rows를 그대로 렌더링한다.
   */
  const shouldUseVirtualReports = useMemo(() => {
    return !isAllWorkspaceMode && virtualRows.length > 80;
  }, [isAllWorkspaceMode, virtualRows.length]);

  const renderedReportRows = useMemo(() => {
    return shouldUseVirtualReports ? visibleVirtualRows : virtualRows;
  }, [shouldUseVirtualReports, visibleVirtualRows, virtualRows]);

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setListScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;

    const syncViewportHeight = () => {
      setListViewportHeight(el.clientHeight || LIST_VIEWPORT_HEIGHT);
    };

    syncViewportHeight();

    const observer = new ResizeObserver(() => {
      syncViewportHeight();
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    if (!workspaceId) return;
    if (!shouldUseVirtualReports) return;
    if (loadingReportsRef.current || loadingMoreRef.current) return;
    if (!hasMoreRef.current) return;
    if (totalVirtualHeight <= 0) return;

    const viewportBottom = listScrollTop + listViewportHeight;
    const triggerPoint = totalVirtualHeight - LOAD_MORE_THRESHOLD;

    if (viewportBottom >= triggerPoint) {
      loadMoreReports();
    }
  }, [
    workspaceId,
    listScrollTop,
    listViewportHeight,
    totalVirtualHeight,
    loadMoreReports,
    LOAD_MORE_THRESHOLD,
    shouldUseVirtualReports,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    if (!shouldUseVirtualReports) return;
    if (loadingReportsRef.current || loadingMoreRef.current) return;
    if (!hasMoreRef.current) return;
    if (totalVirtualHeight <= 0) return;

    const needsMoreToFillViewport =
      totalVirtualHeight < listViewportHeight + 80;

    if (needsMoreToFillViewport) {
      loadMoreReports();
    }
  }, [
    workspaceId,
    totalVirtualHeight,
    listViewportHeight,
    loadMoreReports,
    shouldUseVirtualReports,
  ]);

  useEffect(() => {
    setListScrollTop(0);
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }
  }, [workspaceId, search, reportFilter, selectedAdvertiserId]);

  const visibleReportIds = useMemo(() => {
    return filteredReports.map((r) => r.id);
  }, [filteredReports]);

  const selectedCount = selectedReportIds.length;

  const selectedVisibleCount = useMemo(() => {
    const set = new Set(selectedReportIds);
    return visibleReportIds.filter((id) => set.has(id)).length;
  }, [selectedReportIds, visibleReportIds]);

  const allVisibleSelected =
    visibleReportIds.length > 0 &&
    visibleReportIds.every((id) => selectedReportIds.includes(id));

  function selectAllVisibleReports() {
    if (!canDeleteReports) return;

    setSelectedReportIds((prev) => {
      const set = new Set(prev);
      for (const id of visibleReportIds) set.add(id);
      return Array.from(set);
    });
  }

  function unselectAllVisibleReports() {
    if (!canDeleteReports) return;

    const visibleSet = new Set(visibleReportIds);
    setSelectedReportIds((prev) => prev.filter((id) => !visibleSet.has(id)));
  }

  function clearAllSelectedReports() {
    if (!canDeleteReports) return;
    setSelectedReportIds([]);
  }

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: 1200,
    padding: 24,
  };

  const topActionsStyle: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  };

  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 18% 0%, rgba(33, 223, 243, 0.10), transparent 30%), radial-gradient(circle at 82% 12%, rgba(124, 92, 255, 0.18), transparent 34%), linear-gradient(135deg, #251b4d 0%, #2c2061 48%, #211a46 100%)",
        backgroundAttachment: "fixed",
        color: "#f7f7ff",
        minHeight: "100vh",
      }}
    >
      <div style={containerStyle}>
        {!userId ? (
          <div className="loginCornerLogo" aria-label="Etrylue">
            <img
              src="/branding/etrylue-logo.png"
              alt="Etrylue"
              className="loginCornerLogoImage"
            />
          </div>
        ) : null}

        {userId ? (
          <div className="builderCornerLogo" aria-label="Etrylue">
            <img
              src="/branding/etrylue-logo.png"
              alt="Etrylue"
              className="builderCornerLogoImage"
            />
          </div>
        ) : null}

        {!userId ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              margin: "4px 0 12px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "clamp(42px, 5vw, 60px)",
                lineHeight: 1,
                fontWeight: 950,
                letterSpacing: "-0.055em",
                color: "transparent",
                background:
                  "linear-gradient(90deg, #21dff3 0%, #82efff 34%, #bdb4ff 68%, #8f6cff 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                filter: "drop-shadow(0 8px 24px rgba(69, 87, 230, 0.20))",
              }}
            >
              Etrylue
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 10,
                lineHeight: 1,
                fontWeight: 850,
                letterSpacing: "0.34em",
                textTransform: "uppercase",
                color: "#bbb8d4",
              }}
            >
              Performance
            </div>

            <div
              aria-hidden="true"
              style={{
                width: 88,
                height: 3,
                marginTop: 12,
                borderRadius: 999,
                background: "linear-gradient(90deg, #21dff3 0%, #7c5cff 100%)",
                boxShadow: "0 0 18px rgba(33, 223, 243, 0.20)",
              }}
            />
          </div>
        ) : null}

        <h1
          style={{
            fontSize: userId ? 36 : "clamp(22px, 2.4vw, 30px)",
            fontWeight: 900,
            textAlign: "center",
            marginBottom: userId ? 20 : 18,
            color: "transparent",
            background: "linear-gradient(90deg, #f7f7ff 0%, #d9faff 54%, #bdb4ff 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            letterSpacing: "-0.02em",
          }}
        >
          Automated Online Ads Reporting
        </h1>

        <div
          style={{
            background: userId
              ? "linear-gradient(160deg, rgba(57, 43, 112, 0.94), rgba(47, 35, 96, 0.92))"
              : "linear-gradient(160deg, rgba(57, 43, 112, 0.86), rgba(47, 35, 96, 0.84))",
            border: "1px solid rgba(255, 255, 255, 0.13)",
            borderRadius: userId ? 18 : 24,
            padding: userId ? "18px 20px" : 40,
            display: "flex",
            flexDirection: "column",
            alignItems: userId ? "stretch" : "center",
            gap: userId ? 14 : 16,
            boxShadow: userId
              ? "0 20px 52px rgba(8, 5, 29, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.06)"
              : "0 24px 60px rgba(8, 5, 29, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
          }}
        >
          {!userId ? (
            <>
              <div
                style={{
                  width: "100%",
                  maxWidth: 760,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 34,
                    lineHeight: 1.2,
                    fontWeight: 900,
                    color: "#f7f7ff",
                    letterSpacing: "-0.02em",
                  }}
                >
                  온라인 광고 리포트를 더 빠르고 정확하게
                </div>

                <div
                  style={{
                    maxWidth: 680,
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: "#e2e1f3",
                  }}
                >
                  광고 성과 데이터를 업로드하고, KPI 요약과 시각화를 거쳐
                  공유 가능한 리포트까지 한 번에 관리하세요.
                </div>
              </div>

              <div
                style={{
                  width: "100%",
                  maxWidth: 420,
                  marginTop: 10,
                }}
              >
                <div className="authCard">
                  <div className="fieldLabel">이메일</div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="neoField"
                  />

                  <div className="fieldLabel" style={{ marginTop: 14 }}>
                    비밀번호
                  </div>
                  <input
                    value={password}
                    type="password"
                    onChange={(e) => setPassword(e.target.value)}
                    className="neoField"
                  />

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 16,
                    }}
                  >
                    <button
                      className="mainBtn"
                      onClick={signIn}
                      style={{ maxWidth: "none" }}
                    >
                      로그인하기
                    </button>

                    <Link href="/signup" className="signupBtn">
                      회원가입
                    </Link>
                  </div>
                </div>
              </div>

              <div
                style={{
                  width: "100%",
                  maxWidth: 760,
                  marginTop: 10,
                  paddingTop: 14,
                  borderTop: "1px solid rgba(255, 255, 255, 0.10)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    color: "#d7d5e8",
                    fontSize: 12,
                    lineHeight: 1.65,
                  }}
                >
                  <strong style={{ color: "#f0eff8", fontWeight: 800 }}>
                    Google Ads Integration
                  </strong>
                  {" · "}
                  Authorized users connect their Google Ads accounts through
                  OAuth 2.0. Google Ads API access is used for reporting and
                  analytics only, not for creating or editing ads.
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 7,
                    marginTop: 7,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <Link
                    href="/about"
                    style={{ color: "#82efff", textDecoration: "none" }}
                  >
                    Google Ads Integration
                  </Link>

                  <span aria-hidden="true" style={{ color: "#77738f" }}>
                    ·
                  </span>

                  <Link
                    href="/privacy"
                    style={{ color: "#82efff", textDecoration: "none" }}
                  >
                    Privacy Policy
                  </Link>

                  <span aria-hidden="true" style={{ color: "#77738f" }}>
                    ·
                  </span>

                  <Link
                    href="/terms"
                    style={{ color: "#82efff", textDecoration: "none" }}
                  >
                    Terms of Service
                  </Link>

                  <span aria-hidden="true" style={{ color: "#77738f" }}>
                    ·
                  </span>

                  <a
                    href="mailto:etrylue3479@gmail.com"
                    style={{ color: "#82efff", textDecoration: "none" }}
                  >
                    Contact
                  </a>
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: "#f7f7ff",
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {userEmail ?? "사용자"}
                  </div>

                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {canManageMembers ? (
                    <button
                      className="subBtn"
                      onClick={openMemberManagement}
                      disabled={!workspaceId}
                      title={!workspaceId ? "workspace_id가 필요합니다." : "멤버 관리"}
                      style={{ padding: "9px 12px" }}
                    >
                      멤버 관리
                    </button>
                  ) : null}

                  <button
                    className="subBtn"
                    onClick={signOut}
                    style={{ padding: "9px 12px" }}
                  >
                    로그아웃
                  </button>
                </div>
              </div>

              <div
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 12,
                  alignItems: "stretch",
                }}
              >
                {workspaceMemberships.length > 0 ? (
                  <div
                    style={{
                      border: "1px solid rgba(255, 255, 255, 0.13)",
                      borderRadius: 14,
                      background: "rgba(42, 33, 87, 0.86)",
                      padding: 14,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#d7d5ec",
                          fontWeight: 800,
                        }}
                      >
                        현재 workspace
                      </div>

                      {currentWorkspaceMembership?.tenant_type ? (
                        <span
                          style={{
                            border: "1px solid rgba(255, 255, 255, 0.13)",
                            borderRadius: 999,
                            background: "rgba(53, 40, 103, 0.90)",
                            padding: "4px 8px",
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#e2e1f3",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {currentWorkspaceMembership.tenant_type === "agency"
                            ? "대행사"
                            : "광고주"}
                        </span>
                      ) : null}
                    </div>

                    <select
                      value={workspaceId ?? ""}
                      onChange={(e) => changeWorkspace(e.target.value)}
                      disabled={!workspaceMemberships.length}
                      className="neoField interactiveSelect"
                      style={{ fontSize: 15 }}
                    >
                      {canViewAllWorkspaces ? (
                        <option value={ALL_WORKSPACES}>전체 workspace (master)</option>
                      ) : null}

                      {workspaceMemberships.map((wm) => (
                        <option key={wm.workspace_id} value={wm.workspace_id}>
                          {wm.workspace_name || wm.workspace_id}
                          {wm.role ? ` (${wm.role})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {workspaceId && !isAllWorkspaceMode && isAgencyWorkspace ? (
                  <div
                    style={{
                      border: "1px solid rgba(255, 255, 255, 0.13)",
                      borderRadius: 14,
                      background: "rgba(42, 33, 87, 0.86)",
                      padding: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 104,
                          height: 44,
                          flex: "0 0 auto",
                          border: "1px solid rgba(255, 255, 255, 0.13)",
                          borderRadius: 10,
                          background: "rgba(53, 40, 103, 0.90)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 7,
                        }}
                      >
                        {!agencyBrandingAvailable ? (
                          <span
                            style={{
                              fontSize: 10,
                              lineHeight: 1.3,
                              textAlign: "center",
                              color: "#ffca70",
                            }}
                          >
                            브랜딩 확인 필요
                          </span>
                        ) : workspaceLogoUrl ? (
                          <img
                            src={workspaceLogoUrl}
                            alt={`${
                              currentWorkspaceMembership?.tenant_name ||
                              workspaceName ||
                              "대행사"
                            } 기업 로고`}
                            style={{
                              width: "100%",
                              height: 30,
                              objectFit: "contain",
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: 10,
                              color: "#bbb8d4",
                              whiteSpace: "nowrap",
                            }}
                          >
                            로고 미등록
                          </span>
                        )}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            color: "#f7f7ff",
                          }}
                        >
                          리포트 브랜딩
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 11,
                            lineHeight: 1.4,
                            color: agencyBrandingAvailable ? "#d7d5ec" : "#ffca70",
                          }}
                        >
                          {agencyBrandingAvailable
                            ? "대행사 공통 로고"
                            : "기준 workspace를 확인할 수 없습니다."}
                        </div>
                      </div>
                    </div>

                    {agencyBrandingAvailable && canManageAgencyBranding ? (
                      <Link
                        href={`/settings?workspace_id=${encodeURIComponent(workspaceId)}`}
                        style={{
                          flex: "0 0 auto",
                          textDecoration: "none",
                        }}
                      >
                        <span
                          className="subBtn"
                          style={{
                            minWidth: 58,
                            padding: "8px 12px",
                            fontSize: 12,
                          }}
                        >
                          설정
                        </span>
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        {canManageAdvertisers ? (
          <section style={{ marginTop: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 48,
                      height: 24,
                      borderRadius: 999,
                      background: "linear-gradient(135deg, #21dff3 0%, #7c5cff 100%)",
                      color: "#ffffff",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.02em",
                    }}
                  >
                    STEP 1
                  </span>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 20,
                      fontWeight: 900,
                      color: "#f7f7ff",
                    }}
                  >
                    광고주 선택
                  </h2>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "#d7d5ec",
                  }}
                >
                  보고서를 만들 광고주를 선택하세요. 목록에 없으면 바로 새 광고주를 추가할 수 있습니다.
                </div>
              </div>

              {selectedAdvertiserId ? (
                <div
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 999,
                    background: "rgba(53, 40, 103, 0.90)",
                    padding: "7px 11px",
                    fontSize: 12,
                    color: "#d9d7ee",
                    whiteSpace: "nowrap",
                  }}
                >
                  선택됨 · <b style={{ color: "#f7f7ff" }}>{selectedAdvertiserName}</b>
                </div>
              ) : null}
            </div>

            <div
              className="panelCard"
              style={{
                marginTop: 14,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 18,
                  alignItems: "start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: "#f7f7ff",
                      marginBottom: 8,
                    }}
                  >
                    기존 광고주
                  </div>

                  <div className="advertiserSelectWrap">
                    <select
                      value={selectedAdvertiserId}
                      onChange={(e) => setSelectedAdvertiserId(e.target.value)}
                      disabled={!userId || !workspaceId}
                      className="advertiserSelect"
                    >
                      <option value="">광고주를 지정하지 않음</option>
                      {advertisers.map((a) => (
                        <option key={a.id} value={a.id}>
                          {formatAdvertiserLabel(a)}
                        </option>
                      ))}
                    </select>
                    <span className="advertiserSelectArrow" aria-hidden="true">
                      ⌄
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "#d7d5ec",
                    }}
                  >
                    {selectedAdvertiserId
                      ? `${selectedAdvertiserName} 기준으로 새 리포트를 준비합니다.`
                      : "광고주 없이 리포트를 만들 수도 있습니다."}
                  </div>
                </div>

                <div
                  style={{
                    minWidth: 0,
                    borderLeft: "1px solid rgba(255, 255, 255, 0.13)",
                    paddingLeft: 18,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: "#f7f7ff",
                    }}
                  >
                    새 광고주 추가
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    <input
                      value={newAdvertiserName}
                      onChange={(e) => setNewAdvertiserName(e.target.value)}
                      placeholder="예: 네이처컬렉션"
                      disabled={!userId || !workspaceId || creatingAdvertiser}
                      style={{
                        flex: 1,
                        minWidth: 180,
                        padding: 12,
                        borderRadius: 11,
                        border: "1px solid rgba(255, 255, 255, 0.13)",
                        background: "rgba(53, 40, 103, 0.90)",
                        fontSize: 14,
                      }}
                    />

                    <button
                      className="subBtn"
                      onClick={createAdvertiser}
                      disabled={!userId || !workspaceId || creatingAdvertiser}
                      style={{ padding: "11px 14px" }}
                    >
                      {creatingAdvertiser ? "추가 중..." : "추가"}
                    </button>
                  </div>

                  <div style={{ marginTop: 7, fontSize: 11, color: "#bbb8d4" }}>
                    필요한 광고주가 목록에 없다면 이름만 입력해 추가하세요. 추가하면 해당 광고주가 자동으로 선택됩니다.
                  </div>
                </div>
              </div>

              {selectedAdvertiserId ? (
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 18,
                    borderTop: "1px solid rgba(255, 255, 255, 0.13)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 900,
                          color: "#f7f7ff",
                        }}
                      >
                        매체 계정 연결
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 12,
                          lineHeight: 1.5,
                          color: "#d7d5ec",
                        }}
                      >
                        선택한 광고주에 등록된 매체 계정 연결을 확인하고 관리합니다.
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: 999,
                        background: "rgba(42, 33, 87, 0.86)",
                        padding: "6px 10px",
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#c9c6df",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {loadingSelectedAdvertiserMediaConnections ||
                      !hasCurrentAdvertiserMediaConnectionSnapshot
                        ? "연결 상태 확인 중"
                        : selectedAdvertiserMediaConnectionsError
                        ? "연결 상태 확인 불가"
                        : selectedAdvertiserMediaAccessScope === "own_created"
                        ? "조회 전용"
                        : selectedAdvertiserMediaAccessScope === "true_master" ||
                          selectedAdvertiserMediaAccessScope === "workspace"
                        ? "연결 관리 가능"
                        : "권한 확인 필요"}
                    </div>
                  </div>

                  {hasCurrentAdvertiserMediaConnectionSnapshot &&
                  selectedAdvertiserMediaConnectionsError ? (
                    <div
                      style={{
                        marginTop: 12,
                        border: "1px solid rgba(255, 99, 124, 0.24)",
                        borderRadius: 12,
                        background: "rgba(255, 99, 124, 0.08)",
                        padding: "10px 12px",
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "#ffb0bd",
                      }}
                    >
                      {selectedAdvertiserMediaConnectionsError}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 10,
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid rgba(33, 223, 243, 0.18)",
                        borderRadius: 14,
                        background: "rgba(42, 33, 87, 0.82)",
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 900,
                            color: "#f7f7ff",
                          }}
                        >
                          NAVER SEARCH ADS
                        </div>
                        <span
                          style={{
                            borderRadius: 999,
                            border:
                              primaryNaverConnection &&
                              hasCurrentAdvertiserMediaConnectionSnapshot
                                ? "1px solid rgba(110, 231, 183, 0.28)"
                                : "1px solid rgba(255, 255, 255, 0.12)",
                            background:
                              primaryNaverConnection &&
                              hasCurrentAdvertiserMediaConnectionSnapshot
                                ? "rgba(110, 231, 183, 0.10)"
                                : "rgba(255, 255, 255, 0.05)",
                            padding: "4px 8px",
                            fontSize: 10,
                            fontWeight: 900,
                            color:
                              primaryNaverConnection &&
                              hasCurrentAdvertiserMediaConnectionSnapshot
                                ? "#a7f3d0"
                                : "#bbb8d4",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {loadingSelectedAdvertiserMediaConnections ||
                          !hasCurrentAdvertiserMediaConnectionSnapshot
                            ? "조회 중"
                            : selectedAdvertiserMediaConnectionsError
                            ? "확인 불가"
                            : usableNaverConnections.length > 1
                            ? "확인 필요"
                            : primaryNaverConnection
                            ? "● 연결됨"
                            : naverConnectionWithoutCredentials
                            ? "자격증명 필요"
                            : naverErrorConnection
                            ? "오류"
                            : "○ 미연결"}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 11,
                          lineHeight: 1.6,
                          color: "#bbb8d4",
                          minHeight: 70,
                        }}
                      >
                        {loadingSelectedAdvertiserMediaConnections ||
                        !hasCurrentAdvertiserMediaConnectionSnapshot ? (
                          <>실제 연결 정보를 확인하고 있습니다.</>
                        ) : selectedAdvertiserMediaConnectionsError ? (
                          <>연결 정보를 표시할 수 없습니다.</>
                        ) : usableNaverConnections.length > 1 ? (
                          <>
                            활성 연결이 {usableNaverConnections.length}개입니다.
                            <br />
                            안전을 위해 자동 선택하지 않습니다.
                          </>
                        ) : primaryNaverConnection ? (
                          <>
                            계정: {primaryNaverConnection.external_account_name || "-"}
                            <br />
                            ID: {primaryNaverConnection.external_account_id}
                            <br />
                            최근 동기화: {primaryNaverConnection.last_sync_at
                              ? fmtDate(primaryNaverConnection.last_sync_at)
                              : "-"}
                          </>
                        ) : naverConnectionWithoutCredentials ? (
                          <>활성 연결은 있지만 저장된 자격증명이 없습니다.</>
                        ) : naverErrorConnection ? (
                          <>
                            연결 상태가 오류입니다.
                            {naverErrorConnection.last_error
                              ? ` ${naverErrorConnection.last_error}`
                              : ""}
                          </>
                        ) : (
                          <>등록된 활성 Naver Search Ads 연결이 없습니다.</>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        {canCreateNaverConnection ? (
                          <button
                            type="button"
                            className="subBtn"
                            onClick={openCreateNaverMediaConnectionForm}
                            disabled={savingNaverMediaConnection}
                            style={{ padding: "8px 10px", fontSize: 11 }}
                          >
                            네이버 계정 연결
                          </button>
                        ) : canReplaceNaverCredentials ? (
                          <button
                            type="button"
                            className="subBtn"
                            onClick={() =>
                              singleNaverConnection &&
                              openReplaceNaverMediaConnectionForm(
                                singleNaverConnection
                              )
                            }
                            disabled={savingNaverMediaConnection}
                            style={{ padding: "8px 10px", fontSize: 11 }}
                          >
                            {singleNaverConnection?.has_credentials
                              ? "자격증명 변경"
                              : "자격증명 등록"}
                          </button>
                        ) : null}

                        <span
                          style={{
                            fontSize: 10,
                            lineHeight: 1.5,
                            color: "#8f8bad",
                          }}
                        >
                          {loadingSelectedAdvertiserMediaConnections ||
                          !hasCurrentAdvertiserMediaConnectionSnapshot
                            ? "연결 상태 확인 후 관리할 수 있습니다."
                            : selectedAdvertiserMediaConnectionsError
                            ? "연결 상태 확인이 필요합니다."
                            : selectedAdvertiserMediaAccessScope === "own_created"
                            ? "조회 권한만 있습니다."
                            : selectedAdvertiserNaverConnections.length > 1
                            ? "Naver 연결이 여러 개라 자동 관리하지 않습니다."
                            : singleNaverConnection?.status === "disconnected"
                            ? "연결 해제 기록의 재연결은 후속 안전 route에서 지원합니다."
                            : "저장된 Secret Key와 Access License는 다시 표시하지 않습니다."}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid rgba(124, 92, 255, 0.18)",
                        borderRadius: 14,
                        background: "rgba(42, 33, 87, 0.82)",
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 900,
                            color: "#f7f7ff",
                          }}
                        >
                          GOOGLE ADS
                        </div>
                        <span
                          style={{
                            borderRadius: 999,
                            border:
                              usableGoogleConnections.length > 0 &&
                              hasCurrentAdvertiserMediaConnectionSnapshot
                                ? "1px solid rgba(110, 231, 183, 0.28)"
                                : "1px solid rgba(255, 255, 255, 0.12)",
                            background:
                              usableGoogleConnections.length > 0 &&
                              hasCurrentAdvertiserMediaConnectionSnapshot
                                ? "rgba(110, 231, 183, 0.10)"
                                : "rgba(255, 255, 255, 0.05)",
                            padding: "4px 8px",
                            fontSize: 10,
                            fontWeight: 900,
                            color:
                              usableGoogleConnections.length > 0 &&
                              hasCurrentAdvertiserMediaConnectionSnapshot
                                ? "#a7f3d0"
                                : "#bbb8d4",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {loadingSelectedAdvertiserMediaConnections ||
                          !hasCurrentAdvertiserMediaConnectionSnapshot
                            ? "조회 중"
                            : selectedAdvertiserMediaConnectionsError
                            ? "확인 불가"
                            : usableGoogleConnections.length > 0
                            ? "● 연결됨"
                            : googleConnectionWithoutCredentials
                            ? "자격증명 필요"
                            : googleErrorConnection
                            ? "오류"
                            : "○ 미연결"}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 11,
                          lineHeight: 1.6,
                          color: "#bbb8d4",
                          minHeight: 70,
                        }}
                      >
                        {loadingSelectedAdvertiserMediaConnections ||
                        !hasCurrentAdvertiserMediaConnectionSnapshot ? (
                          <>실제 연결 정보를 확인하고 있습니다.</>
                        ) : selectedAdvertiserMediaConnectionsError ? (
                          <>연결 정보를 표시할 수 없습니다.</>
                        ) : usableGoogleConnections.length > 0 ? (
                          <>
                            활성 연결: {usableGoogleConnections.length}개
                            <br />
                            {usableGoogleConnections[0].external_account_name ||
                              usableGoogleConnections[0].external_account_id}
                            {" · "}
                            {usableGoogleConnections[0].external_account_id}
                            <br />
                            최근 확인: {usableGoogleConnections[0].last_verified_at
                              ? fmtDate(usableGoogleConnections[0].last_verified_at)
                              : "-"}
                          </>
                        ) : googleConnectionWithoutCredentials ? (
                          <>활성 연결은 있지만 저장된 OAuth 자격증명이 없습니다.</>
                        ) : googleErrorConnection ? (
                          <>
                            연결 상태가 오류입니다.
                            {googleErrorConnection.last_error
                              ? ` ${googleErrorConnection.last_error}`
                              : ""}
                          </>
                        ) : (
                          <>등록된 활성 Google Ads 연결이 없습니다.</>
                        )}
                      </div>

                      {googleAdsOAuthReturnNotice ? (
                        <div
                          style={{
                            marginTop: 10,
                            border:
                              googleAdsOAuthReturnNotice.kind === "success"
                                ? "1px solid rgba(110, 231, 183, 0.28)"
                                : googleAdsOAuthReturnNotice.kind === "error"
                                ? "1px solid rgba(255, 99, 124, 0.26)"
                                : "1px solid rgba(33, 223, 243, 0.24)",
                            borderRadius: 10,
                            background:
                              googleAdsOAuthReturnNotice.kind === "success"
                                ? "rgba(110, 231, 183, 0.09)"
                                : googleAdsOAuthReturnNotice.kind === "error"
                                ? "rgba(255, 99, 124, 0.08)"
                                : "rgba(33, 223, 243, 0.08)",
                            padding: "9px 10px",
                            fontSize: 10,
                            lineHeight: 1.55,
                            color:
                              googleAdsOAuthReturnNotice.kind === "success"
                                ? "#a7f3d0"
                                : googleAdsOAuthReturnNotice.kind === "error"
                                ? "#ffb0bd"
                                : "#9beef8",
                          }}
                        >
                          {googleAdsOAuthReturnNotice.message}
                        </div>
                      ) : null}

                      <div
                        style={{
                          marginTop: 12,
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        {canManageSelectedAdvertiserMediaConnections ? (
                          <button
                            type="button"
                            className="subBtn"
                            onClick={
                              googleAdsConnectionFormOpen
                                ? closeGoogleAdsConnectionForm
                                : openGoogleAdsConnectionForm
                            }
                            disabled={startingGoogleAdsOAuth}
                            style={{ padding: "8px 10px", fontSize: 11 }}
                          >
                            {googleAdsConnectionFormOpen
                              ? "Google 연결 닫기"
                              : "Google 계정 연결"}
                          </button>
                        ) : null}

                        <span
                          style={{
                            fontSize: 10,
                            lineHeight: 1.5,
                            color: "#8f8bad",
                          }}
                        >
                          {loadingSelectedAdvertiserMediaConnections ||
                          !hasCurrentAdvertiserMediaConnectionSnapshot
                            ? "연결 상태 확인 후 관리할 수 있습니다."
                            : selectedAdvertiserMediaConnectionsError
                            ? "연결 상태 확인이 필요합니다."
                            : selectedAdvertiserMediaAccessScope === "own_created"
                            ? "조회 권한만 있습니다."
                            : "OAuth 자격증명은 화면에 표시하지 않습니다."}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid rgba(124, 92, 255, 0.18)",
                        borderRadius: 14,
                        background: "rgba(42, 33, 87, 0.82)",
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 900,
                            color: "#f7f7ff",
                          }}
                        >
                          META ADS
                        </div>
                        <span
                          style={{
                            borderRadius: 999,
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            background: "rgba(255, 255, 255, 0.05)",
                            padding: "4px 8px",
                            fontSize: 10,
                            fontWeight: 900,
                            color: "#bbb8d4",
                          }}
                        >
                          준비 중
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 11,
                          lineHeight: 1.6,
                          color: "#bbb8d4",
                          minHeight: 70,
                        }}
                      >
                        Meta Ads 연동 기능은 아직 활성화하지 않았습니다.
                        {hasCurrentAdvertiserMediaConnectionSnapshot &&
                        !selectedAdvertiserMediaConnectionsError &&
                        selectedAdvertiserMetaConnections.length > 0 ? (
                          <>
                            <br />
                            DB 연결 기록: {selectedAdvertiserMetaConnections.length}개
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {googleAdsConnectionFormOpen ? (
                    <div
                      style={{
                        marginTop: 12,
                        border: "1px solid rgba(124, 92, 255, 0.26)",
                        borderRadius: 14,
                        background: "rgba(33, 26, 72, 0.90)",
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 900,
                              color: "#f7f7ff",
                            }}
                          >
                            Google Ads 연결
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              lineHeight: 1.55,
                              color: "#bbb8d4",
                            }}
                          >
                            선택한 광고주에 Google Ads 계정을 OAuth로 연결합니다.
                            고객 ID와 필요한 경우 MCC / Login Customer ID만 입력합니다.
                          </div>
                        </div>

                        <button
                          type="button"
                          className="subBtn"
                          onClick={closeGoogleAdsConnectionForm}
                          disabled={startingGoogleAdsOAuth}
                          style={{ padding: "7px 10px", fontSize: 11 }}
                        >
                          닫기
                        </button>
                      </div>

                      {selectedAdvertiserGoogleConnections.length > 0 ? (
                        <div
                          style={{
                            marginTop: 12,
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          {selectedAdvertiserGoogleConnections.map((connection) => {
                            const statusLabel =
                              connection.status === "disconnected"
                                ? "연결 해제"
                                : connection.status === "error"
                                ? "오류"
                                : !connection.has_credentials
                                ? "자격증명 필요"
                                : "사용 가능";

                            return (
                              <div
                                key={connection.id}
                                style={{
                                  border:
                                    "1px solid rgba(255, 255, 255, 0.09)",
                                  borderRadius: 10,
                                  background: "rgba(42, 33, 87, 0.72)",
                                  padding: "9px 11px",
                                  fontSize: 11,
                                  lineHeight: 1.55,
                                  color: "#c9c6df",
                                }}
                              >
                                {connection.external_account_name ||
                                  connection.external_account_id}
                                {" · "}
                                {connection.external_account_id}
                                {" · "}
                                {statusLabel}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      <div
                        style={{
                          marginTop: 14,
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: 12,
                        }}
                      >
                        <label style={{ minWidth: 0 }}>
                          <div
                            style={{
                              marginBottom: 6,
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#d7d5ec",
                            }}
                          >
                            Google Ads 고객 ID *
                          </div>
                          <input
                            value={googleAdsTargetCustomerIdInput}
                            onChange={(event) =>
                              setGoogleAdsTargetCustomerIdInput(event.target.value)
                            }
                            maxLength={200}
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            disabled={startingGoogleAdsOAuth}
                            placeholder="예: 123-456-7890"
                            style={{
                              width: "100%",
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid rgba(255, 255, 255, 0.13)",
                              background: "rgba(42, 33, 87, 0.90)",
                              color: "#f7f7ff",
                              fontSize: 12,
                            }}
                          />
                        </label>

                        <label style={{ minWidth: 0 }}>
                          <div
                            style={{
                              marginBottom: 6,
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#d7d5ec",
                            }}
                          >
                            MCC / Login Customer ID (선택)
                          </div>
                          <input
                            value={googleAdsLoginCustomerIdInput}
                            onChange={(event) =>
                              setGoogleAdsLoginCustomerIdInput(event.target.value)
                            }
                            maxLength={200}
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            disabled={startingGoogleAdsOAuth}
                            placeholder="필요한 경우에만 입력"
                            style={{
                              width: "100%",
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid rgba(255, 255, 255, 0.13)",
                              background: "rgba(42, 33, 87, 0.90)",
                              color: "#f7f7ff",
                              fontSize: 12,
                            }}
                          />
                        </label>
                      </div>

                      {googleAdsOAuthStartError ? (
                        <div
                          style={{
                            marginTop: 10,
                            border: "1px solid rgba(255, 99, 124, 0.24)",
                            borderRadius: 10,
                            background: "rgba(255, 99, 124, 0.08)",
                            padding: "9px 11px",
                            fontSize: 11,
                            lineHeight: 1.5,
                            color: "#ffb0bd",
                          }}
                        >
                          {googleAdsOAuthStartError}
                        </div>
                      ) : null}

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 10,
                          lineHeight: 1.55,
                          color: "#8f8bad",
                        }}
                      >
                        비밀번호나 OAuth 토큰은 이 화면에 입력하지 않습니다.
                        OAuth 승인 후 Server API에서 계정 범위와 저장된 연결 상태를 다시 확인합니다.
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          className="subBtn"
                          onClick={closeGoogleAdsConnectionForm}
                          disabled={startingGoogleAdsOAuth}
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          className="primaryBtn"
                          onClick={startGoogleAdsOAuth}
                          disabled={startingGoogleAdsOAuth}
                        >
                          {startingGoogleAdsOAuth
                            ? "Google 연결 준비 중..."
                            : "Google Ads 연결"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {naverMediaConnectionFormMode ? (
                    <div
                      style={{
                        marginTop: 12,
                        border: "1px solid rgba(33, 223, 243, 0.22)",
                        borderRadius: 14,
                        background: "rgba(33, 26, 72, 0.90)",
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 900,
                              color: "#f7f7ff",
                            }}
                          >
                            {naverMediaConnectionFormMode === "create"
                              ? "Naver Search Ads 연결"
                              : "Naver Search Ads 자격증명 변경"}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              lineHeight: 1.55,
                              color: "#bbb8d4",
                            }}
                          >
                            {naverMediaConnectionFormMode === "create"
                              ? "선택한 광고주에 새 Naver Search Ads connection을 저장합니다."
                              : "기존 secret은 표시하지 않습니다. 새 자격증명 3개를 모두 다시 입력합니다."}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="subBtn"
                          onClick={closeNaverMediaConnectionForm}
                          disabled={savingNaverMediaConnection}
                          style={{ padding: "7px 10px", fontSize: 11 }}
                        >
                          닫기
                        </button>
                      </div>

                      {naverMediaConnectionFormMode === "replace" &&
                      naverFormTargetConnection ? (
                        <div
                          style={{
                            marginTop: 12,
                            border: "1px solid rgba(255, 255, 255, 0.10)",
                            borderRadius: 10,
                            background: "rgba(42, 33, 87, 0.72)",
                            padding: "9px 11px",
                            fontSize: 11,
                            lineHeight: 1.55,
                            color: "#c9c6df",
                          }}
                        >
                          대상 계정: {naverFormTargetConnection.external_account_name || "-"}
                          <br />
                          외부 광고계정 ID: {naverFormTargetConnection.external_account_id}
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: 10,
                          marginTop: 12,
                        }}
                      >
                        {naverMediaConnectionFormMode === "create" ? (
                          <>
                            <label style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  marginBottom: 6,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: "#d7d5ec",
                                }}
                              >
                                외부 광고계정 ID *
                              </div>
                              <input
                                value={naverExternalAccountIdInput}
                                onChange={(event) =>
                                  setNaverExternalAccountIdInput(event.target.value)
                                }
                                maxLength={300}
                                autoComplete="off"
                                disabled={savingNaverMediaConnection}
                                placeholder="Naver 외부 광고계정 ID"
                                style={{
                                  width: "100%",
                                  padding: 10,
                                  borderRadius: 10,
                                  border: "1px solid rgba(255, 255, 255, 0.13)",
                                  background: "rgba(42, 33, 87, 0.90)",
                                  color: "#f7f7ff",
                                  fontSize: 12,
                                }}
                              />
                            </label>

                            <label style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  marginBottom: 6,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: "#d7d5ec",
                                }}
                              >
                                계정 표시명 (선택)
                              </div>
                              <input
                                value={naverExternalAccountNameInput}
                                onChange={(event) =>
                                  setNaverExternalAccountNameInput(event.target.value)
                                }
                                maxLength={500}
                                autoComplete="off"
                                disabled={savingNaverMediaConnection}
                                placeholder="예: 네이버 검색광고"
                                style={{
                                  width: "100%",
                                  padding: 10,
                                  borderRadius: 10,
                                  border: "1px solid rgba(255, 255, 255, 0.13)",
                                  background: "rgba(42, 33, 87, 0.90)",
                                  color: "#f7f7ff",
                                  fontSize: 12,
                                }}
                              />
                            </label>
                          </>
                        ) : null}

                        <label style={{ minWidth: 0 }}>
                          <div
                            style={{
                              marginBottom: 6,
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#d7d5ec",
                            }}
                          >
                            Customer ID *
                          </div>
                          <input
                            value={naverCustomerIdInput}
                            onChange={(event) =>
                              setNaverCustomerIdInput(event.target.value)
                            }
                            maxLength={200}
                            name={`naver-searchads-customer-id-${selectedAdvertiserId || "none"}`}
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            readOnly={!naverCustomerIdUnlocked}
                            onFocus={() => setNaverCustomerIdUnlocked(true)}
                            disabled={savingNaverMediaConnection}
                            placeholder="Naver Customer ID"
                            style={{
                              width: "100%",
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid rgba(255, 255, 255, 0.13)",
                              background: "rgba(42, 33, 87, 0.90)",
                              color: "#f7f7ff",
                              fontSize: 12,
                            }}
                          />
                        </label>

                        <label style={{ minWidth: 0 }}>
                          <div
                            style={{
                              marginBottom: 6,
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#d7d5ec",
                            }}
                          >
                            Access License *
                          </div>
                          <input
                            type="password"
                            value={naverAccessLicenseInput}
                            onChange={(event) =>
                              setNaverAccessLicenseInput(event.target.value)
                            }
                            maxLength={500}
                            name={`naver-searchads-access-license-${selectedAdvertiserId || "none"}`}
                            autoComplete="new-password"
                            autoCapitalize="none"
                            spellCheck={false}
                            readOnly={!naverAccessLicenseUnlocked}
                            onFocus={() => setNaverAccessLicenseUnlocked(true)}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            disabled={savingNaverMediaConnection}
                            placeholder="Access License"
                            style={{
                              width: "100%",
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid rgba(255, 255, 255, 0.13)",
                              background: "rgba(42, 33, 87, 0.90)",
                              color: "#f7f7ff",
                              fontSize: 12,
                            }}
                          />
                        </label>

                        <label style={{ minWidth: 0 }}>
                          <div
                            style={{
                              marginBottom: 6,
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#d7d5ec",
                            }}
                          >
                            Secret Key *
                          </div>
                          <input
                            type="password"
                            value={naverSecretKeyInput}
                            onChange={(event) =>
                              setNaverSecretKeyInput(event.target.value)
                            }
                            maxLength={1000}
                            name={`naver-searchads-secret-key-${selectedAdvertiserId || "none"}`}
                            autoComplete="new-password"
                            autoCapitalize="none"
                            spellCheck={false}
                            readOnly={!naverSecretKeyUnlocked}
                            onFocus={() => setNaverSecretKeyUnlocked(true)}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            disabled={savingNaverMediaConnection}
                            placeholder="Secret Key"
                            style={{
                              width: "100%",
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid rgba(255, 255, 255, 0.13)",
                              background: "rgba(42, 33, 87, 0.90)",
                              color: "#f7f7ff",
                              fontSize: 12,
                            }}
                          />
                        </label>
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 10,
                          lineHeight: 1.55,
                          color: "#8f8bad",
                        }}
                      >
                        Secret Key와 Access License는 저장 후 다시 표시하지 않습니다.
                        입력값은 Server API에서 다시 검증한 뒤 암호화 저장됩니다.
                      </div>

                      {naverMediaConnectionFormError ? (
                        <div
                          style={{
                            marginTop: 10,
                            border: "1px solid rgba(255, 99, 124, 0.24)",
                            borderRadius: 10,
                            background: "rgba(255, 99, 124, 0.08)",
                            padding: "9px 11px",
                            fontSize: 11,
                            lineHeight: 1.5,
                            color: "#ffb0bd",
                          }}
                        >
                          {naverMediaConnectionFormError}
                        </div>
                      ) : null}

                      <div
                        style={{
                          marginTop: 12,
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          className="subBtn"
                          onClick={closeNaverMediaConnectionForm}
                          disabled={savingNaverMediaConnection}
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          className="primaryBtn"
                          onClick={submitNaverMediaConnectionForm}
                          disabled={savingNaverMediaConnection}
                        >
                          {savingNaverMediaConnection
                            ? "저장 중..."
                            : naverMediaConnectionFormMode === "create"
                            ? "안전하게 연결"
                            : "자격증명 교체"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedAdvertiserId ? (
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 18,
                    borderTop: "1px solid rgba(255, 255, 255, 0.13)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 900,
                          color: "#f7f7ff",
                        }}
                      >
                        공개 URL
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 12,
                          lineHeight: 1.5,
                          color: "#d7d5ec",
                        }}
                      >
                        발행된 최신 리포트를 고객에게 공유할 광고주 전용 주소입니다.
                      </div>
                    </div>

                    {selectedAdvertiserPublicUrl ? (
                      <a
                        href={selectedAdvertiserPublicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="interactiveLink"
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#78f0ff",
                          textDecoration: "none",
                        }}
                      >
                        현재 공개 URL 열기 ↗
                      </a>
                    ) : null}
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "#c9c6df",
                        background: "rgba(42, 33, 87, 0.86)",
                        border: "1px solid rgba(255, 255, 255, 0.13)",
                        borderRadius: 10,
                        padding: "10px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {PUBLIC_CLIENT_URL_PREFIX}
                    </span>

                    <input
                      value={publicSlugInput}
                      onChange={(e) => setPublicSlugInput(norm(e.target.value))}
                      placeholder="예: gna"
                      disabled={
                        !canUpdatePublicSlug ||
                        savingPublicSlug ||
                        isAllWorkspaceMode
                      }
                      style={{
                        flex: 1,
                        minWidth: 160,
                        padding: 11,
                        borderRadius: 10,
                        border: "1px solid rgba(255, 255, 255, 0.13)",
                        background:
                          !canUpdatePublicSlug || isAllWorkspaceMode
                            ? "rgba(29, 23, 61, 0.72)"
                            : "rgba(33, 26, 72, 0.92)",
                        fontSize: 14,
                      }}
                    />

                    <button
                      className="subBtn"
                      onClick={savePublicSlug}
                      disabled={
                        !canUpdatePublicSlug ||
                        savingPublicSlug ||
                        isAllWorkspaceMode
                      }
                      title={
                        !canUpdatePublicSlug
                          ? "master/director/admin/staff만 수정할 수 있습니다"
                          : isAllWorkspaceMode
                          ? "전체 workspace 보기에서는 수정할 수 없습니다"
                          : "공개 URL 저장"
                      }
                    >
                      {savingPublicSlug ? "저장 중..." : "저장"}
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: 7,
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: "#bbb8d4",
                    }}
                  >
                    소문자 영어, 숫자, 하이픈만 사용할 수 있습니다. 비우고 저장하면 공개 URL이 제거됩니다.
                  </div>
                </div>
              ) : null}

              {canDeleteAdvertisers ? (
                <details
                  style={{
                    marginTop: 16,
                    paddingTop: 14,
                    borderTop: "1px solid rgba(255, 255, 255, 0.13)",
                  }}
                >
                  <summary
                    className="interactiveSummary"
                    style={{
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#d7d5ec",
                      userSelect: "none",
                    }}
                  >
                    광고주 관리
                  </summary>

                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "#d7d5ec",
                        marginBottom: 8,
                      }}
                    >
                      삭제할 광고주를 선택하세요. 삭제 작업은 신중하게 진행해 주세요.
                    </div>

                    <div
                      style={{
                        border: "1px solid rgba(255, 255, 255, 0.13)",
                        borderRadius: 12,
                        background: "rgba(53, 40, 103, 0.90)",
                        padding: 10,
                        maxHeight: 180,
                        overflowY: "auto",
                      }}
                    >
                      {advertisers.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#bbb8d4" }}>
                          관리할 광고주가 없습니다.
                        </div>
                      ) : (
                        advertisers.map((a) => {
                          const checked = selectedAdvertiserIds.includes(a.id);

                          return (
                            <label
                              key={a.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 4px",
                                cursor: "pointer",
                                fontSize: 14,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAdvertiserSelection(a.id)}
                              />
                              <span>{a.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    <button
                      className="subBtn deleteBtn"
                      onClick={deleteSelectedAdvertisers}
                      disabled={selectedAdvertiserIds.length === 0 || deletingAdvertisers}
                      style={{ marginTop: 10 }}
                      title={
                        selectedAdvertiserIds.length === 0
                          ? "삭제할 광고주를 먼저 선택하세요"
                          : `선택된 ${selectedAdvertiserIds.length}개 삭제`
                      }
                    >
                      {deletingAdvertisers
                        ? "삭제 중..."
                        : `선택 삭제${
                            selectedAdvertiserIds.length > 0
                              ? ` (${selectedAdvertiserIds.length})`
                              : ""
                          }`}
                    </button>
                  </div>
                </details>
              ) : null}
            </div>

            {localMsg ? (
              <div className="infoMsg" style={{ marginTop: 12 }}>
                {localMsg}
              </div>
            ) : null}
          </section>
        ) : localMsg ? (
          <div className="infoMsg" style={{ marginTop: 28 }}>
            {localMsg}
          </div>
        ) : null}

        {canCreateReport ? (
          <section style={{ marginTop: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 48,
                      height: 24,
                      borderRadius: 999,
                      background: "linear-gradient(135deg, #21dff3 0%, #7c5cff 100%)",
                      color: "#ffffff",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.02em",
                    }}
                  >
                    STEP 2
                  </span>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 20,
                      fontWeight: 900,
                      color: "#f7f7ff",
                    }}
                  >
                    보고서 유형 선택
                  </h2>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "#d7d5ec",
                  }}
                >
                  데이터 입력 방식과 보고서 목적에 맞는 유형을 선택하세요.
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 999,
                  background: "rgba(53, 40, 103, 0.90)",
                  padding: "7px 11px",
                  fontSize: 12,
                  color: "#d9d7ee",
                  whiteSpace: "nowrap",
                }}
              >
                광고주 · <b style={{ color: "#f7f7ff" }}>{selectedAdvertiserName || "미지정"}</b>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                border: "1px solid rgba(255, 255, 255, 0.13)",
                borderRadius: 16,
                background: "rgba(53, 40, 103, 0.90)",
                padding: 14,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900, color: "#f7f7ff" }}>
                데이터 입력 방식
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#d7d5ec", lineHeight: 1.5 }}>
                새 리포트를 CSV 업로드형으로 만들지, 매체 API 연동형으로 만들지 먼저 선택합니다.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 10,
                  marginTop: 12,
                }}
              >
                {(["csv", "api"] as ReportDataSourceKind[]).map((kind) => {
                  const active = selectedReportDataSourceKind === kind;
                  const disabled = kind === "api" && !selectedAdvertiserId;

                  return (
                    <button
                      key={kind}
                      type="button"
                      className="subBtn dataSourceBtn"
                      onClick={() => {
                        setSelectedReportDataSourceKind(kind);

                        if (kind !== "api") {
                          setSelectedApiMediaConnectionId("");
                        }
                      }}
                      disabled={disabled || creating}
                      style={{
                        borderColor: active ? "#21dff3" : "rgba(255, 255, 255, 0.13)",
                        background: active ? "linear-gradient(135deg, #21dff3 0%, #7c5cff 100%)" : "rgba(53, 40, 103, 0.90)",
                        color: active ? "#ffffff" : "#f7f7ff",
                      }}
                      title={
                        disabled
                          ? "API 연동형 리포트는 광고주 선택이 먼저 필요합니다."
                          : undefined
                      }
                    >
                      <div className="dataSourceTitle">
                        {kind === "api" ? "API 연동" : "CSV 업로드"}
                      </div>
                      <div className="dataSourceDescription">
                        {kind === "api"
                          ? "기간을 설정한 뒤 매체 API로 데이터를 가져옵니다."
                          : "CSV 파일을 업로드해 데이터 기간을 자동 산정합니다."}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedReportDataSourceKind === "api" ? (
              <div
                style={{
                  marginTop: 14,
                  border: "1px solid rgba(33, 223, 243, 0.20)",
                  borderRadius: 16,
                  background: "rgba(42, 33, 87, 0.82)",
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#f7f7ff" }}>
                      API 연결 선택
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "#d7d5ec",
                      }}
                    >
                      STEP 1에서 연결한 매체 계정 중 이 리포트가 사용할 연결을 선택합니다.
                    </div>
                  </div>

                  <span
                    style={{
                      borderRadius: 999,
                      border: selectedApiReportConnection
                        ? "1px solid rgba(110, 231, 183, 0.28)"
                        : "1px solid rgba(255, 255, 255, 0.12)",
                      background: selectedApiReportConnection
                        ? "rgba(110, 231, 183, 0.10)"
                        : "rgba(255, 255, 255, 0.05)",
                      padding: "5px 9px",
                      fontSize: 10,
                      fontWeight: 900,
                      color: selectedApiReportConnection ? "#a7f3d0" : "#bbb8d4",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {loadingSelectedAdvertiserMediaConnections ||
                    !hasCurrentAdvertiserMediaConnectionSnapshot
                      ? "연결 확인 중"
                      : selectedAdvertiserMediaConnectionsError
                      ? "확인 불가"
                      : selectedApiReportConnection
                      ? "● 선택 완료"
                      : "연결 선택 필요"}
                  </span>
                </div>

                {!selectedAdvertiserId ? (
                  <div style={{ marginTop: 12, fontSize: 12, color: "#bbb8d4" }}>
                    먼저 STEP 1에서 광고주를 선택하세요.
                  </div>
                ) : loadingSelectedAdvertiserMediaConnections ||
                  !hasCurrentAdvertiserMediaConnectionSnapshot ? (
                  <div style={{ marginTop: 12, fontSize: 12, color: "#bbb8d4" }}>
                    현재 광고주의 실제 media connection 상태를 확인하고 있습니다.
                  </div>
                ) : selectedAdvertiserMediaConnectionsError ? (
                  <div
                    style={{
                      marginTop: 12,
                      border: "1px solid rgba(255, 99, 124, 0.24)",
                      borderRadius: 12,
                      background: "rgba(255, 99, 124, 0.08)",
                      padding: "10px 12px",
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "#ffb0bd",
                    }}
                  >
                    {selectedAdvertiserMediaConnectionsError}
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        marginTop: 14,
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          overflow: "hidden",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: 18,
                          background: "rgba(57, 43, 112, 0.88)",
                          padding: 16,
                          minHeight: 278,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: 96,
                            height: 2,
                            background:
                              "linear-gradient(90deg, #21dff3 0%, #7c5cff 100%)",
                            opacity: 0.72,
                          }}
                        />

                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 900,
                              color: "#f7f7ff",
                            }}
                          >
                            NAVER SEARCH ADS
                          </div>

                          <span
                            style={{
                              flexShrink: 0,
                              borderRadius: 999,
                              border: selectedApiReportConnection
                                ? "1px solid rgba(110, 231, 183, 0.28)"
                                : "1px solid rgba(255, 255, 255, 0.12)",
                              background: selectedApiReportConnection
                                ? "rgba(110, 231, 183, 0.10)"
                                : "rgba(255, 255, 255, 0.05)",
                              padding: "4px 8px",
                              fontSize: 10,
                              fontWeight: 900,
                              color: selectedApiReportConnection
                                ? "#a7f3d0"
                                : "#bbb8d4",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {selectedApiReportConnection
                              ? "● 선택됨"
                              : usableNaverConnections.length > 0
                                ? "선택 가능"
                                : "연결 필요"}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 14,
                            fontSize: 11,
                            lineHeight: 1.55,
                            color: "#bbb8d4",
                          }}
                        >
                          리포트 생성에 사용할 Naver Search Ads 연결을
                          선택합니다.
                        </div>

                        <div
                          className="advertiserSelectWrap"
                          style={{ marginTop: 12 }}
                        >
                          <select
                            value={selectedApiMediaConnectionId}
                            onChange={(e) =>
                              setSelectedApiMediaConnectionId(e.target.value)
                            }
                            disabled={
                              creating || usableNaverConnections.length === 0
                            }
                            className="advertiserSelect"
                          >
                            <option value="">
                              Naver Search Ads 연결을 선택하세요
                            </option>

                            {selectedAdvertiserNaverConnections.map(
                              (connection) => {
                                const selectable =
                                  connection.status === "active" &&
                                  connection.has_credentials;

                                const statusLabel =
                                  connection.status === "disconnected"
                                    ? "연결 해제"
                                    : connection.status === "error"
                                      ? "오류"
                                      : !connection.has_credentials
                                        ? "자격증명 필요"
                                        : "사용 가능";

                                return (
                                  <option
                                    key={connection.id}
                                    value={connection.id}
                                    disabled={!selectable}
                                  >
                                    {connection.external_account_name ||
                                      connection.external_account_id}{" "}
                                    · {connection.external_account_id} ·{" "}
                                    {statusLabel}
                                  </option>
                                );
                              },
                            )}
                          </select>

                          <span
                            className="advertiserSelectArrow"
                            aria-hidden="true"
                          >
                            ⌄
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            fontSize: 11,
                            lineHeight: 1.55,
                            color: selectedApiReportConnection
                              ? "#a7f3d0"
                              : "#bbb8d4",
                          }}
                        >
                          {selectedApiReportConnection
                            ? `선택됨 · ${
                                selectedApiReportConnection.external_account_name ||
                                selectedApiReportConnection.external_account_id
                              } · ${
                                selectedApiReportConnection.external_account_id
                              }`
                            : usableNaverConnections.length === 0
                              ? "현재 사용할 수 있는 Naver Search Ads 연결이 없습니다."
                              : "사용할 연결을 선택하세요."}
                        </div>
                      </div>

                      <div
                        style={{
                          position: "relative",
                          overflow: "hidden",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: 18,
                          background: "rgba(57, 43, 112, 0.88)",
                          padding: 16,
                          minHeight: 278,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: 96,
                            height: 2,
                            background:
                              "linear-gradient(90deg, #21dff3 0%, #7c5cff 100%)",
                            opacity: 0.72,
                          }}
                        />

                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 900,
                              color: "#f7f7ff",
                            }}
                          >
                            GOOGLE ADS
                          </div>

                          <span
                            style={{
                              flexShrink: 0,
                              borderRadius: 999,
                              border:
                                usableGoogleConnections.length > 0
                                  ? "1px solid rgba(110, 231, 183, 0.28)"
                                  : "1px solid rgba(255, 255, 255, 0.12)",
                              background:
                                usableGoogleConnections.length > 0
                                  ? "rgba(110, 231, 183, 0.10)"
                                  : "rgba(255, 255, 255, 0.05)",
                              padding: "4px 8px",
                              fontSize: 10,
                              fontWeight: 900,
                              color:
                                usableGoogleConnections.length > 0
                                  ? "#a7f3d0"
                                  : "#bbb8d4",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {usableGoogleConnections.length > 0
                              ? "동기화 준비 중"
                              : "STEP 1 연결 필요"}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 14,
                            fontSize: 11,
                            lineHeight: 1.65,
                            color: "#bbb8d4",
                          }}
                        >
                          STEP 1에서 관리한 Google Ads 연결을 사용합니다.
                          현재 Google Ads 데이터 동기화 runtime은 비활성화되어
                          리포트 연결 선택은 아직 잠겨 있습니다.
                        </div>

                        <div
                          className="advertiserSelectWrap"
                          style={{ marginTop: 12 }}
                        >
                          <select
                            disabled
                            className="advertiserSelect"
                          >
                            <option value="">
                              {usableGoogleConnections.length > 0
                                ? "Google Ads 연결 선택은 동기화 활성화 후 제공됩니다"
                                : "STEP 1에서 Google Ads 계정을 먼저 연결하세요"}
                            </option>

                            {selectedAdvertiserGoogleConnections.map(
                              (connection) => {
                                const statusLabel =
                                  connection.status === "disconnected"
                                    ? "연결 해제"
                                    : connection.status === "error"
                                    ? "오류"
                                    : !connection.has_credentials
                                    ? "자격증명 필요"
                                    : "연결됨";

                                return (
                                  <option
                                    key={connection.id}
                                    value={connection.id}
                                  >
                                    {connection.external_account_name ||
                                      connection.external_account_id}{" "}
                                    · {connection.external_account_id} ·{" "}
                                    {statusLabel}
                                  </option>
                                );
                              },
                            )}
                          </select>

                          <span
                            className="advertiserSelectArrow"
                            aria-hidden="true"
                          >
                            ⌄
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            fontSize: 11,
                            lineHeight: 1.55,
                            color:
                              usableGoogleConnections.length > 0
                                ? "#a7f3d0"
                                : "#bbb8d4",
                          }}
                        >
                          {usableGoogleConnections.length > 0
                            ? `${usableGoogleConnections.length}개 사용 가능한 연결 확인 · 데이터 동기화 승인 대기`
                            : "사용 가능한 Google Ads 연결이 없습니다. STEP 1에서 연결을 먼저 완료하세요."}
                        </div>
                      </div>

                      <div
                        style={{
                          position: "relative",
                          overflow: "hidden",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: 18,
                          background: "rgba(57, 43, 112, 0.88)",
                          padding: 16,
                          minHeight: 278,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: 96,
                            height: 2,
                            background:
                              "linear-gradient(90deg, #21dff3 0%, #7c5cff 100%)",
                            opacity: 0.72,
                          }}
                        />

                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 900,
                              color: "#f7f7ff",
                            }}
                          >
                            META ADS
                          </div>

                          <span
                            style={{
                              flexShrink: 0,
                              borderRadius: 999,
                              border:
                                "1px solid rgba(255, 255, 255, 0.12)",
                              background: "rgba(255, 255, 255, 0.05)",
                              padding: "4px 8px",
                              fontSize: 10,
                              fontWeight: 900,
                              color: "#bbb8d4",
                              whiteSpace: "nowrap",
                            }}
                          >
                            준비 중
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 14,
                            fontSize: 11,
                            lineHeight: 1.65,
                            color: "#bbb8d4",
                          }}
                        >
                          Meta Ads 연결은 다음 provider 단계에서
                          활성화합니다.
                        </div>

                        {selectedAdvertiserMetaConnections.length > 0 ? (
                          <div
                            style={{
                              marginTop: 12,
                              border:
                                "1px solid rgba(255, 255, 255, 0.09)",
                              borderRadius: 10,
                              background: "rgba(33, 27, 68, 0.58)",
                              padding: "10px 11px",
                              fontSize: 10,
                              lineHeight: 1.5,
                              color: "#bbb8d4",
                            }}
                          >
                            DB 연결 기록:{" "}
                            {selectedAdvertiserMetaConnections.length}개
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            <div
              style={{
                marginTop: 14,
                border: "1px solid rgba(255, 255, 255, 0.13)",
                borderRadius: 16,
                background: "rgba(53, 40, 103, 0.90)",
                padding: 14,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900, color: "#f7f7ff" }}>
                리포트 테마
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "#d7d5ec",
                  lineHeight: 1.5,
                }}
              >
                고객에게 보여질 리포트의 배경 스타일을 선택합니다.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  className="subBtn"
                  onClick={() => setSelectedReportTheme("light")}
                  disabled={creating}
                  aria-pressed={selectedReportTheme === "light"}
                  style={{
                    minHeight: 150,
                    padding: 12,
                    borderRadius: 14,
                    border:
                      selectedReportTheme === "light"
                        ? "1px solid #21dff3"
                        : "1px solid rgba(255, 255, 255, 0.13)",
                    background:
                      selectedReportTheme === "light"
                        ? "rgba(33, 223, 243, 0.08)"
                        : "rgba(46, 35, 94, 0.72)",
                    color: "#f7f7ff",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      height: 78,
                      borderRadius: 10,
                      background: "#f7f3ec",
                      padding: 9,
                      boxShadow: "inset 0 0 0 1px rgba(207, 194, 177, 0.72)",
                    }}
                  >
                    <div
                      style={{
                        height: 13,
                        borderRadius: 999,
                        background: "#7fa6c4",
                        opacity: 0.8,
                      }}
                    />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                        marginTop: 8,
                      }}
                    >
                      <div
                        style={{
                          height: 38,
                          borderRadius: 7,
                          background: "#fffaf3",
                          border: "1px solid #d9cdbc",
                        }}
                      />
                      <div
                        style={{
                          height: 38,
                          borderRadius: 7,
                          background: "#f3e4d2",
                          border: "1px solid #b7d7e3",
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>
                        Etrylue Light
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11,
                          lineHeight: 1.45,
                          color: "#d7d5ec",
                        }}
                      >
                        현재 리포트 디자인
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color:
                          selectedReportTheme === "light"
                            ? "#78f0ff"
                            : "#bbb8d4",
                      }}
                    >
                      {selectedReportTheme === "light" ? "● 선택됨" : "선택"}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="subBtn"
                  onClick={() => setSelectedReportTheme("studio")}
                  disabled={creating}
                  aria-pressed={selectedReportTheme === "studio"}
                  style={{
                    minHeight: 150,
                    padding: 12,
                    borderRadius: 14,
                    border:
                      selectedReportTheme === "studio"
                        ? "1px solid #21dff3"
                        : "1px solid rgba(255, 255, 255, 0.13)",
                    background:
                      selectedReportTheme === "studio"
                        ? "rgba(33, 223, 243, 0.08)"
                        : "rgba(46, 35, 94, 0.72)",
                    color: "#f7f7ff",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      height: 78,
                      borderRadius: 10,
                      background: "rgba(42, 33, 87, 0.96)",
                      padding: 9,
                      boxShadow:
                        "inset 0 0 0 1px rgba(255, 255, 255, 0.10)",
                    }}
                  >
                    <div
                      style={{
                        height: 13,
                        borderRadius: 999,
                        background:
                          "linear-gradient(135deg, #21dff3 0%, #7c5cff 100%)",
                      }}
                    />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                        marginTop: 8,
                      }}
                    >
                      <div
                        style={{
                          height: 38,
                          borderRadius: 7,
                          background: "rgba(53, 40, 103, 0.90)",
                          border: "1px solid rgba(33, 223, 243, 0.20)",
                        }}
                      />
                      <div
                        style={{
                          height: 38,
                          borderRadius: 7,
                          background: "rgba(46, 35, 94, 0.92)",
                          border: "1px solid rgba(124, 92, 255, 0.34)",
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>
                        Etrylue Studio
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11,
                          lineHeight: 1.45,
                          color: "#d7d5ec",
                        }}
                      >
                        Report Builder 컬러
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color:
                          selectedReportTheme === "studio"
                            ? "#78f0ff"
                            : "#bbb8d4",
                      }}
                    >
                      {selectedReportTheme === "studio" ? "● 선택됨" : "선택"}
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                gap: 16,
                marginTop: 16,
              }}
            >
              {types.map((t) => (
                <button
                  key={t.id}
                  onClick={() => createReport(t)}
                  disabled={
                    !workspaceId ||
                    creating ||
                    (selectedReportDataSourceKind === "api" &&
                      !selectedApiReportConnection)
                  }
                  title={
                    selectedReportDataSourceKind === "api" &&
                    !selectedApiReportConnection
                      ? "API 연결을 먼저 선택해 주세요."
                      : undefined
                  }
                  className="typeCard"
                >
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{t.name}</div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {userId ? (
          <section style={{ marginTop: 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>내 리포트 목록</h2>

              <div style={topActionsStyle}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className={`filterBtn ${
                      reportFilter === "all" ? "filterBtnActive" : ""
                    }`}
                    onClick={() => setReportFilter("all")}
                    disabled={!userId}
                  >
                    전체
                  </button>
                  <button
                    className={`filterBtn ${
                      reportFilter === "published" ? "filterBtnActive" : ""
                    }`}
                    onClick={() => setReportFilter("published")}
                    disabled={!userId}
                  >
                    발행됨
                  </button>
                  <button
                    className={`filterBtn ${
                      reportFilter === "draft" ? "filterBtnActive" : ""
                    }`}
                    onClick={() => setReportFilter("draft")}
                    disabled={!userId}
                  >
                    초안
                  </button>
                </div>

                <button
                  className="subBtn"
                  onClick={fetchReports}
                  disabled={!userId || !workspaceId || loadingReports}
                  style={{ padding: "10px 14px" }}
                >
                  {loadingReports ? "불러오는 중..." : "새로고침"}
                </button>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="검색(광고주/제목/ID)"
                  style={{
                    width: 320,
                    maxWidth: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: "rgba(53, 40, 103, 0.90)",
                    fontSize: 14,
                  }}
                  disabled={!userId}
                />
              </div>
            </div>

            {canDeleteReports ? (
              <div className="selectionBar" style={{ marginTop: 12 }}>
                <div style={{ fontSize: 14, opacity: 0.8 }}>
                  선택됨 <b>{selectedCount}</b>개
                  {visibleReportIds.length > 0 ? (
                    <span style={{ opacity: 0.7 }}>
                      {" "}
                      · 현재 목록 기준 {selectedVisibleCount}/{visibleReportIds.length}
                    </span>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className="subBtn"
                    onClick={
                      allVisibleSelected
                        ? unselectAllVisibleReports
                        : selectAllVisibleReports
                    }
                    disabled={!userId || visibleReportIds.length === 0 || deletingReports}
                    style={{ padding: "10px 14px" }}
                  >
                    {allVisibleSelected ? "현재 목록 선택해제" : "현재 목록 전체선택"}
                  </button>

                  <button
                    className="subBtn"
                    onClick={clearAllSelectedReports}
                    disabled={!userId || selectedCount === 0 || deletingReports}
                    style={{ padding: "10px 14px" }}
                  >
                    전체 해제
                  </button>

                  <button
                    className="subBtn deleteBtn"
                    onClick={deleteSelectedReports}
                    disabled={!userId || deletingReports || selectedCount === 0}
                    style={{ padding: "10px 14px" }}
                    title={
                      selectedCount === 0
                        ? "삭제할 리포트를 먼저 선택하세요"
                        : `선택된 ${selectedCount}개 삭제`
                    }
                  >
                    {deletingReports
                      ? "삭제 중..."
                      : `선택 삭제${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
                  </button>
                </div>
              </div>
            ) : null}

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#d7d5ec",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span>현재 로딩된 리포트: {reports.length}개</span>
              {loadingReports ? <span>첫 목록 불러오는 중...</span> : null}
              {!loadingReports && loadingMore ? <span>추가 불러오는 중...</span> : null}
              {!loadingReports && !loadingMore && hasMore ? (
                <span>스크롤 하단에서 다음 페이지를 자동으로 불러옵니다.</span>
              ) : null}
            </div>

            {filteredReports.length === 0 && !loadingReports && (
              <p style={{ marginTop: 10, opacity: 0.7 }}>
                조건에 맞는 리포트가 없습니다.
              </p>
            )}

            <div
              ref={listScrollRef}
              onScroll={handleListScroll}
              style={{
                marginTop: 12,
                height: shouldUseVirtualReports ? LIST_VIEWPORT_HEIGHT : "auto",
                maxHeight: shouldUseVirtualReports ? LIST_VIEWPORT_HEIGHT : 760,
                overflowY: "auto",
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  position: shouldUseVirtualReports ? "relative" : "static",
                  height: shouldUseVirtualReports ? totalVirtualHeight : "auto",
                }}
              >
                {renderedReportRows.map((item, visibleIdx) => {
                  const absoluteIndex = shouldUseVirtualReports
                    ? virtualStartIndex + visibleIdx
                    : visibleIdx;
                  const top = shouldUseVirtualReports
                    ? virtualOffsets[absoluteIndex] ?? 0
                    : undefined;
                  const rowHeight = getVirtualRowHeight(item);

                  const wrapperStyle = shouldUseVirtualReports
                    ? {
                        position: "absolute" as const,
                        top,
                        left: 0,
                        right: 0,
                        height: rowHeight,
                        boxSizing: "border-box" as const,
                      }
                    : {
                        position: "relative" as const,
                        marginBottom: item.kind === "folder" ? 10 : 0,
                        boxSizing: "border-box" as const,
                      };

                  if (item.kind === "folder") {
                    return (
                      <div
                        key={item.key}
                        style={{
                          ...wrapperStyle,
                          paddingBottom: shouldUseVirtualReports ? 10 : 0,
                        }}
                      >
                        <div className="folderBox">
                          <button
                            className="folderHeader"
                            onClick={() => toggleFolder(item.folderKey)}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 900,
                                  width: 18,
                                  display: "inline-block",
                                }}
                              >
                                {item.open ? "▼" : "▶"}
                              </span>
                              <div
                                style={{
                                  fontWeight: 900,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.folderName}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.65 }}>
                                ({item.list.length})
                              </div>
                            </div>

                            <div style={{ fontSize: 12, opacity: 0.45 }}>
                              {item.isNone ? "" : item.folderKey}
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const r = item.report;
                  const checked = selectedReportIds.includes(r.id);

                  return (
                    <div key={item.key} style={wrapperStyle}>
                      <div className="folderBox" style={{ borderTop: "none" }}>
                        <div
                          className="reportRow"
                          style={{
                            borderBottom:
                              item.idx === item.listLength - 1
                                ? "none"
                                : "1px solid rgba(255, 255, 255, 0.08)",
                          }}
                        >
                          {canDeleteReports ? (
                            <label
                              className="reportCheckWrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleReportSelection(r.id)}
                              />
                            </label>
                          ) : null}

                          <button
                            onClick={() => router.push(`/reports/${r.id}`)}
                            className={`reportItem reportItemMain ${
                              checked ? "reportItemSelected" : ""
                            }`}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              width: "auto",
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>
                              {r.title}
                              <span style={{ fontSize: 12, opacity: 0.55 }}>
                                {" "}
                                · {String(r.status ?? "").toUpperCase()}
                              </span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  marginLeft: 8,
                                  padding: "2px 7px",
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  verticalAlign: "middle",
                                  ...getReportDataSourceBadgeStyle(r.data_source_kind),
                                }}
                              >
                                {getReportDataSourceLabel(r.data_source_kind)}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.6 }}>
                              {fmtDate(r.created_at ?? null)}
                            </div>
                          </button>

                          {(() => {
                            const dataSourceKind = normalizeReportDataSourceKind(
                              r.data_source_kind
                            );

                            if (dataSourceKind !== "api") {
                              return (
                                <div
                                  className="reportActionRail"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <div className="reportModePill">CSV 업로드형</div>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "1fr 1fr",
                                      gap: 5,
                                      width: "100%",
                                    }}
                                  >
                                    {(["light", "studio"] as ReportTheme[]).map(
                                      (theme) => {
                                        const active =
                                          normalizeReportTheme(r.report_theme) ===
                                          theme;
                                        const saving =
                                          savingReportThemeId === r.id;

                                        return (
                                          <button
                                            key={theme}
                                            type="button"
                                            className="subBtn"
                                            onClick={() =>
                                              updateExistingReportTheme(r, theme)
                                            }
                                            disabled={saving}
                                            aria-pressed={active}
                                            style={{
                                              minWidth: 0,
                                              padding: "6px 5px",
                                              borderRadius: 9,
                                              fontSize: 10,
                                              borderColor: active
                                                ? "#21dff3"
                                                : "rgba(255, 255, 255, 0.13)",
                                              background: active
                                                ? "rgba(33, 223, 243, 0.12)"
                                                : "rgba(53, 40, 103, 0.90)",
                                              color: active
                                                ? "#78f0ff"
                                                : "#d7d5ec",
                                              boxShadow: "none",
                                            }}
                                            title={
                                              theme === "studio"
                                                ? "Etrylue Studio 테마로 변경"
                                                : "Etrylue Light 테마로 변경"
                                            }
                                          >
                                            {saving
                                              ? "저장"
                                              : theme === "studio"
                                                ? "Studio"
                                                : "Light"}
                                          </button>
                                        );
                                      }
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            const currentSyncJob =
                              mediaSyncJobsByReportId[r.id] ?? null;
                            const syncRange = pickReportSyncDateRange(r);
                            const isActiveSyncJob = isActiveMediaSyncJobStatus(
                              currentSyncJob?.status
                            );
                            const isLoadingSyncStatus = Boolean(
                              loadingMediaSyncReportIds[r.id]
                            );
                            const isRequestingSync =
                              requestingMediaSyncReportId === r.id;
                            const isSyncDisabled =
                              !r.advertiser_id ||
                              !syncRange ||
                              isRequestingSync ||
                              isLoadingSyncStatus ||
                              isActiveSyncJob;

                            return (
                              <div
                                className="reportActionRail"
                                onClick={(event) => event.stopPropagation()}
                              >
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "1fr 1fr",
                                      gap: 5,
                                      width: "100%",
                                    }}
                                  >
                                    {(["light", "studio"] as ReportTheme[]).map(
                                      (theme) => {
                                        const active =
                                          normalizeReportTheme(r.report_theme) ===
                                          theme;
                                        const saving =
                                          savingReportThemeId === r.id;

                                        return (
                                          <button
                                            key={theme}
                                            type="button"
                                            className="subBtn"
                                            onClick={() =>
                                              updateExistingReportTheme(r, theme)
                                            }
                                            disabled={saving}
                                            aria-pressed={active}
                                            style={{
                                              minWidth: 0,
                                              padding: "6px 5px",
                                              borderRadius: 9,
                                              fontSize: 10,
                                              borderColor: active
                                                ? "#21dff3"
                                                : "rgba(255, 255, 255, 0.13)",
                                              background: active
                                                ? "rgba(33, 223, 243, 0.12)"
                                                : "rgba(53, 40, 103, 0.90)",
                                              color: active
                                                ? "#78f0ff"
                                                : "#d7d5ec",
                                              boxShadow: "none",
                                            }}
                                            title={
                                              theme === "studio"
                                                ? "Etrylue Studio 테마로 변경"
                                                : "Etrylue Light 테마로 변경"
                                            }
                                          >
                                            {saving
                                              ? "저장"
                                              : theme === "studio"
                                                ? "Studio"
                                                : "Light"}
                                          </button>
                                        );
                                      }
                                    )}
                                  </div>

                                <button
                                  type="button"
                                  className="subBtn reportSyncBtn"
                                  onClick={() => requestMediaSyncForReport(r)}
                                  disabled={isSyncDisabled}
                                  style={{
                                    padding: "8px 10px",
                                    fontSize: 12,
                                    whiteSpace: "nowrap",
                                  }}
                                  title={
                                    !r.advertiser_id
                                      ? "광고주가 연결된 리포트만 API 동기화를 요청할 수 있습니다."
                                      : !syncRange
                                      ? "API 연동 기간 설정이 필요하거나 31일을 초과했습니다. 리포트 편집 화면에서 31일 이내 기간을 저장하세요."
                                      : isActiveSyncJob
                                      ? "이미 대기 또는 처리 중인 API 동기화 job이 있습니다."
                                      : "pending job만 생성하고 실제 동기화는 Railway worker가 처리합니다."
                                  }
                                >
                                  {isRequestingSync
                                    ? "요청 중..."
                                    : getMediaSyncJobStatusText(currentSyncJob)}
                                </button>

                                {currentSyncJob ? (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color:
                                        currentSyncJob.status === "failed"
                                          ? "#ff9bad"
                                          : "#d7d5ec",
                                      whiteSpace: "nowrap",
                                      textAlign: "center",
                                    }}
                                  >
                                    API {currentSyncJob.status}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                padding: "8px 4px",
                fontSize: 12,
                color: "#d7d5ec",
                textAlign: "center",
              }}
            >
              {loadingMore
                ? "추가 리포트를 불러오는 중..."
                : hasMore && shouldUseVirtualReports
                ? "아래로 스크롤하면 다음 리포트를 자동으로 불러옵니다."
                : hasMore
                ? "다음 페이지가 더 있습니다. 아래 버튼으로 추가 리포트를 불러오세요."
                : reports.length > 0
                ? "모든 리포트를 불러왔습니다."
                : null}

              {hasMore && !shouldUseVirtualReports ? (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="subBtn"
                    onClick={loadMoreReports}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "불러오는 중..." : "리포트 더 불러오기"}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <style jsx>{`
          :global(body) {
            background: #211a46;
          }

          :global(::selection) {
            background: rgba(33, 223, 243, 0.28);
            color: #ffffff;
          }

          :global(button) {
            transition: transform 0.15s ease, filter 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          }

          :global(button:hover:not(:disabled)) {
            filter: brightness(1.06) saturate(1.03);
          }

          :global(button:active:not(:disabled)) {
            transform: translateY(0) scale(0.99);
          }

          .fieldLabel {
            margin-bottom: 8px;
            font-size: 14px;
            font-weight: 800;
            color: #f7f7ff;
            letter-spacing: 0.01em;
          }

          .authCard {
            border: 1px solid rgba(255, 255, 255, 0.13);
            border-radius: 20px;
            background: linear-gradient(160deg, rgba(57, 43, 112, 0.96), rgba(44, 33, 90, 0.94));
            padding: 20px;
            box-shadow: 0 22px 54px rgba(8, 5, 29, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.06);
          }

          .neoField {
            width: 100%;
            padding: 14px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            outline: none;
            background: rgba(33, 27, 68, 0.82);
            color: #f7f7ff;
            font-size: 16px;
            font-weight: 600;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
            transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
            appearance: none;
            -webkit-appearance: none;
          }

          .neoField::placeholder {
            color: #bbb8d4;
            font-weight: 500;
          }

          .interactiveSelect {
            cursor: pointer;
          }

          .interactiveSelect:hover:not(:disabled),
          .neoField:hover:not(:disabled) {
            border-color: rgba(33, 223, 243, 0.34);
            background: rgba(42, 33, 87, 0.96);
          }

          .neoField:focus {
            border-color: rgba(33, 223, 243, 0.78);
            background: rgba(37, 30, 80, 0.96);
            box-shadow: 0 0 0 3px rgba(33, 223, 243, 0.10);
          }

          .neoField option {
            background: #241b4b;
            color: #f7f7ff;
          }

          .advertiserSelectWrap {
            position: relative;
            width: 100%;
          }

          .advertiserSelect {
            width: 100%;
            min-height: 50px;
            padding: 13px 64px 13px 14px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            outline: none;
            appearance: none;
            -webkit-appearance: none;
            background: rgba(53, 40, 103, 0.90);
            color: #f7f7ff;
            font-size: 15px;
            font-weight: 650;
            cursor: pointer;
            transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          }

          .advertiserSelect:hover:not(:disabled) {
            border-color: rgba(33, 223, 243, 0.42);
            background: rgba(64, 49, 132, 0.96);
          }

          .advertiserSelect:focus {
            border-color: rgba(33, 223, 243, 0.78);
            box-shadow: 0 0 0 3px rgba(33, 223, 243, 0.10);
          }

          .advertiserSelect:disabled {
            cursor: not-allowed;
            opacity: 0.48;
          }

          .advertiserSelect option {
            background: #241b4b;
            color: #f7f7ff;
          }

          .advertiserSelectArrow {
            position: absolute;
            top: 5px;
            right: 5px;
            width: 44px;
            height: 40px;
            border-radius: 10px;
            border: 1px solid rgba(117, 227, 255, 0.22);
            background: linear-gradient(135deg, rgba(33, 223, 243, 0.18), rgba(124, 92, 255, 0.24));
            color: #9ef5ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            font-weight: 900;
            line-height: 1;
            pointer-events: none;
            transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          }

          .advertiserSelectWrap:hover .advertiserSelectArrow,
          .advertiserSelectWrap:focus-within .advertiserSelectArrow {
            transform: translateY(-1px);
            border-color: rgba(33, 223, 243, 0.55);
            background: linear-gradient(135deg, rgba(33, 223, 243, 0.30), rgba(124, 92, 255, 0.36));
            color: #ffffff;
          }

          .dataSourceBtn {
            min-height: 66px;
            padding: 11px 16px;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            text-align: center;
          }

          .dataSourceTitle {
            font-size: 16px;
            font-weight: 900;
            line-height: 1.15;
          }

          .dataSourceDescription {
            font-size: 11px;
            line-height: 1.35;
            color: #d7d5ec;
            opacity: 0.92;
          }

          .mainBtn {
            width: 100%;
            max-width: 520px;
            padding: 14px;
            border-radius: 14px;
            border: 1px solid rgba(117, 227, 255, 0.28);
            background: linear-gradient(135deg, #21dff3 0%, #5f72ff 52%, #7c5cff 100%);
            color: #ffffff;
            font-weight: 900;
            font-size: 16px;
            cursor: pointer;
            box-shadow: 0 12px 26px rgba(70, 77, 217, 0.28);
            transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
            text-align: center;
            letter-spacing: 0.01em;
          }

          .mainBtn:hover {
            transform: translateY(-1px);
            filter: saturate(1.08) brightness(1.03);
            box-shadow: 0 16px 32px rgba(70, 77, 217, 0.34);
          }

          .signupBtn {
            min-width: 180px;
            padding: 12px 18px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(53, 40, 103, 0.88);
            color: #f7f7ff;
            font-weight: 800;
            font-size: 15px;
            cursor: pointer;
            transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
            text-align: center;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 10px 24px rgba(8, 5, 29, 0.20);
          }

          .signupBtn:hover {
            transform: translateY(-1px);
            border-color: rgba(33, 223, 243, 0.34);
            background: rgba(62, 47, 122, 0.96);
          }

          .subBtn {
            padding: 10px 18px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.13);
            background: rgba(53, 40, 103, 0.90);
            cursor: pointer;
            font-weight: 800;
            transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 9px 20px rgba(8, 5, 29, 0.18);
            color: #f7f7ff;
          }

          .subBtn:hover:not(:disabled) {
            transform: translateY(-1px);
            border-color: rgba(33, 223, 243, 0.38);
            background: rgba(64, 49, 132, 0.96);
            box-shadow: 0 12px 24px rgba(8, 5, 29, 0.24);
          }

          .subBtn:disabled {
            cursor: not-allowed;
            opacity: 0.48;
          }

          .deleteBtn {
            border-color: rgba(255, 99, 124, 0.24);
            background: rgba(255, 99, 124, 0.08);
            color: #ff9bad;
          }

          .deleteBtn:hover:not(:disabled) {
            border-color: rgba(255, 99, 124, 0.42);
            background: rgba(255, 99, 124, 0.13);
            box-shadow: 0 12px 24px rgba(133, 24, 59, 0.14);
          }

          .filterBtn {
            padding: 10px 14px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(53, 40, 103, 0.88);
            cursor: pointer;
            font-weight: 800;
            transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
            color: #e2e1f3;
            box-shadow: 0 8px 18px rgba(8, 5, 29, 0.16);
          }

          .filterBtn:hover {
            transform: translateY(-1px);
            border-color: rgba(33, 223, 243, 0.30);
            background: rgba(62, 47, 122, 0.96);
          }

          .filterBtnActive {
            background: linear-gradient(135deg, #21dff3 0%, #7c5cff 100%);
            color: #ffffff;
            border-color: rgba(117, 227, 255, 0.28);
            box-shadow: 0 12px 26px rgba(70, 77, 217, 0.25);
          }

          .interactiveSummary {
            border-radius: 10px;
            transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
          }

          .interactiveSummary:hover {
            color: #ffffff;
            background: rgba(33, 223, 243, 0.07);
            transform: translateX(2px);
          }

          .interactiveLink {
            transition: color 0.15s ease, filter 0.15s ease, transform 0.15s ease;
          }

          .interactiveLink:hover {
            color: #ffffff !important;
            filter: brightness(1.10);
            transform: translateY(-1px);
          }

          .loginCornerLogo {
            position: absolute;
            top: 34px;
            right: 28px;
            width: clamp(126px, 9.5vw, 148px);
            padding: 0;
            border: 0;
            background: transparent;
            box-shadow: none;
            pointer-events: none;
            z-index: 2;
          }

          .loginCornerLogoImage {
            display: block;
            width: 100%;
            height: auto;
            object-fit: contain;
            filter:
              drop-shadow(0 14px 32px rgba(8, 5, 29, 0.34))
              drop-shadow(0 0 24px rgba(33, 223, 243, 0.14));
          }

          .builderCornerLogo {
            position: absolute;
            top: 28px;
            right: 28px;
            width: clamp(72px, 5vw, 84px);
            padding: 0;
            border: 0;
            background: transparent;
            box-shadow: none;
            pointer-events: none;
            z-index: 2;
          }

          .builderCornerLogoImage {
            display: block;
            width: 100%;
            height: auto;
            object-fit: contain;
            filter:
              drop-shadow(0 12px 28px rgba(8, 5, 29, 0.28))
              drop-shadow(0 0 18px rgba(33, 223, 243, 0.12));
          }

          @media (max-width: 980px) {
            .loginCornerLogo,
            .builderCornerLogo {
              display: none;
            }
          }

          .panelCard {
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.13);
            background: linear-gradient(160deg, rgba(57, 43, 112, 0.94), rgba(47, 35, 96, 0.92));
            padding: 18px;
            box-shadow: 0 16px 34px rgba(8, 5, 29, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.045);
          }

          .infoMsg {
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid rgba(33, 223, 243, 0.16);
            background: rgba(33, 223, 243, 0.07);
            color: #d9faff;
            font-size: 14px;
          }

          .selectionBar {
            padding: 12px 14px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.13);
            background: rgba(53, 40, 103, 0.90);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            box-shadow: 0 12px 26px rgba(8, 5, 29, 0.16);
          }

          .typeCard {
            position: relative;
            text-align: left;
            padding: 12px 15px;
            min-height: 52px;
            display: flex;
            align-items: center;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.13);
            background: linear-gradient(160deg, rgba(57, 43, 112, 0.94), rgba(47, 35, 96, 0.92));
            cursor: pointer;
            transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
            box-shadow: 0 14px 30px rgba(8, 5, 29, 0.18);
            overflow: hidden;
            color: #f7f7ff;
          }

          .typeCard::before {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: 2px;
            background: linear-gradient(90deg, #21dff3 0%, #7c5cff 100%);
            transform: scaleX(0.28);
            transform-origin: left center;
            opacity: 0.58;
            transition: transform 0.18s ease, opacity 0.18s ease;
          }

          .typeCard:hover::before {
            transform: scaleX(1);
            opacity: 1;
          }

          .typeCard:hover:not(:disabled) {
            transform: translateY(-3px);
            box-shadow: 0 20px 38px rgba(8, 5, 29, 0.26);
            border-color: rgba(33, 223, 243, 0.26);
            background: linear-gradient(160deg, rgba(61, 45, 124, 0.96), rgba(47, 34, 99, 0.94));
          }

          .typeCard:active:not(:disabled) {
            transform: translateY(-1px);
          }

          .typeCard:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px rgba(33, 223, 243, 0.11), 0 20px 38px rgba(8, 5, 29, 0.26);
            border-color: rgba(33, 223, 243, 0.54);
          }

          .reportRow {
            display: flex;
            align-items: stretch;
            gap: 0;
            background: rgba(53, 40, 103, 0.88);
          }

          .reportActionRail {
            width: 156px;
            min-width: 156px;
            padding: 10px 12px;
            border-left: 1px solid rgba(255, 255, 255, 0.09);
            background: rgba(46, 35, 94, 0.72);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            text-align: center;
          }

          .reportModePill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 32px;
            padding: 7px 10px;
            border-radius: 999px;
            border: 1px solid rgba(124, 92, 255, 0.34);
            background: rgba(124, 92, 255, 0.12);
            color: #e4e1ff;
            font-size: 12px;
            font-weight: 850;
            white-space: nowrap;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
          }

          .reportSyncBtn {
            min-width: 116px;
            padding: 8px 10px;
            font-size: 12px;
            white-space: nowrap;
          }

          .reportCheckWrap {
            width: 52px;
            min-width: 52px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-right: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(46, 35, 94, 0.92);
            cursor: pointer;
          }

          .reportCheckWrap:hover {
            background: rgba(68, 52, 140, 0.82);
          }

          .reportCheckWrap input {
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: #21dff3;
          }

          .reportItem {
            text-align: left;
            padding: 14px;
            border: none;
            background: rgba(53, 40, 103, 0.88);
            color: #f7f7ff;
            cursor: pointer;
            transition: background 0.15s ease, transform 0.15s ease;
            flex: 1;
            min-width: 0;
            width: auto;
          }

          .reportItemMain:hover {
            background: rgba(68, 52, 140, 0.84);
            transform: translateX(2px);
          }

          .reportItemSelected {
            background: rgba(33, 223, 243, 0.10);
          }

          .folderBox {
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.13);
            background: rgba(53, 40, 103, 0.88);
            overflow: hidden;
            box-shadow: 0 12px 28px rgba(8, 5, 29, 0.16);
          }

          .folderHeader {
            width: 100%;
            text-align: left;
            padding: 14px;
            cursor: pointer;
            background: rgba(53, 40, 103, 0.88);
            color: #f7f7ff;
            border: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            transition: background 0.15s ease;
          }

          .folderHeader:hover {
            background: rgba(68, 52, 140, 0.78);
          }

          .folderBody {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
          }

          .virtualSpacer {
            position: relative;
            width: 100%;
          }
        `}</style>
      </div>
    </main>
  );
}
