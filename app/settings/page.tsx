"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabase/client";

type ProviderKey = "naver" | "google" | "meta";

type ProviderState = {
  key: ProviderKey;
  label: string;
  status: "disconnected" | "connected";
  connectedAt?: string;
  accountName?: string;
};

type MemberRole =
  | "master"
  | "director"
  | "admin"
  | "staff"
  | "client"
  | null;

type WorkspaceRow = {
  workspace_id: string;
  workspace_name: string | null;
  role: MemberRole;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_type: "agency" | "advertiser" | null;
  tenant_status: string | null;
  workspace_type: string | null;
  workspace_kind: string | null;
  agency_branding_enabled: boolean;
  branding_workspace_id: string | null;
  branding_workspace_name: string | null;
  workspace_logo_url: string | null;
  logo_storage_bucket: string | null;
  logo_storage_path: string | null;
  logo_updated_at: string | null;
};

const LS_KEY = "report-system:integrations:v1";
const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function loadStates(): Record<ProviderKey, ProviderState> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

function saveStates(states: Record<ProviderKey, ProviderState>) {
  localStorage.setItem(LS_KEY, JSON.stringify(states));
}

function isoNow() {
  return new Date().toISOString();
}

function formatKST(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function normalizeEmail(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRole(value: unknown): MemberRole {
  const role = String(value ?? "").trim().toLowerCase();

  if (
    role === "master" ||
    role === "director" ||
    role === "admin" ||
    role === "staff" ||
    role === "client"
  ) {
    return role;
  }

  return null;
}

function canManageAgencyBranding(
  role: MemberRole,
  email?: string | null,
) {
  if (role === "director") {
    return true;
  }

  return (
    role === "master" &&
    normalizeEmail(email) === ONLY_MASTER_EMAIL
  );
}

function normalizeWorkspaceRow(row: any): WorkspaceRow {
  return {
    workspace_id: String(row?.workspace_id ?? "").trim(),
    workspace_name: row?.workspace_name
      ? String(row.workspace_name)
      : null,
    role: normalizeRole(row?.role),
    tenant_id: row?.tenant_id
      ? String(row.tenant_id)
      : null,
    tenant_name: row?.tenant_name
      ? String(row.tenant_name)
      : null,
    tenant_type:
      row?.tenant_type === "agency" || row?.tenant_type === "advertiser"
        ? row.tenant_type
        : null,
    tenant_status: row?.tenant_status
      ? String(row.tenant_status)
      : null,
    workspace_type: row?.workspace_type
      ? String(row.workspace_type)
      : null,
    workspace_kind: row?.workspace_kind
      ? String(row.workspace_kind)
      : null,
    agency_branding_enabled: Boolean(row?.agency_branding_enabled),
    branding_workspace_id: row?.branding_workspace_id
      ? String(row.branding_workspace_id)
      : null,
    branding_workspace_name: row?.branding_workspace_name
      ? String(row.branding_workspace_name)
      : null,
    workspace_logo_url: row?.workspace_logo_url
      ? String(row.workspace_logo_url)
      : null,
    logo_storage_bucket: row?.logo_storage_bucket
      ? String(row.logo_storage_bucket)
      : null,
    logo_storage_path: row?.logo_storage_path
      ? String(row.logo_storage_path)
      : null,
    logo_updated_at: row?.logo_updated_at
      ? String(row.logo_updated_at)
      : null,
  };
}

async function safeReadJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const defaultStates = useMemo<Record<ProviderKey, ProviderState>>(
    () => ({
      naver: { key: "naver", label: "네이버", status: "disconnected" },
      google: { key: "google", label: "Google Ads", status: "disconnected" },
      meta: { key: "meta", label: "Meta Ads", status: "disconnected" },
    }),
    [],
  );

  const [states, setStates] =
    useState<Record<ProviderKey, ProviderState>>(defaultStates);

  const [modal, setModal] = useState<{
    open: boolean;
    provider?: ProviderKey;
  }>({ open: false });

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [brandingFile, setBrandingFile] = useState<File | null>(null);
  const [uploadingBranding, setUploadingBranding] = useState(false);
  const [deletingBranding, setDeletingBranding] = useState(false);
  const [brandingMsg, setBrandingMsg] = useState("");
  const brandingInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loaded = loadStates();
    if (loaded) setStates({ ...defaultStates, ...loaded });
  }, [defaultStates]);

  useEffect(() => {
    saveStates(states);
  }, [states]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceSettings() {
      const workspaceIdFromQuery =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
              .get("workspace_id")
              ?.trim() || ""
          : "";

      setLoadingWorkspaces(true);
      setBrandingMsg("");

      try {
        const { data: userData } = await supabase.auth.getUser();

        if (cancelled) return;

        setUserEmail(userData.user?.email ?? null);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? null;

        if (!token) {
          setWorkspaces([]);
          setSelectedWorkspaceId("");
          setBrandingMsg("로그인 세션이 없습니다.");
          return;
        }

        const res = await fetch("/api/workspaces/list", {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await safeReadJson(res);

        if (!res.ok || !json?.ok) {
          setWorkspaces([]);
          setSelectedWorkspaceId("");
          setBrandingMsg(
            json?.error || "workspace 설정 정보를 불러오지 못했습니다.",
          );
          return;
        }

        const rows = Array.isArray(json?.workspaces)
          ? json.workspaces
              .map(normalizeWorkspaceRow)
              .filter((row: WorkspaceRow) => row.workspace_id)
          : [];

        if (cancelled) return;

        setWorkspaces(rows);
        setSelectedWorkspaceId((prev) => {
          if (prev && rows.some((row: WorkspaceRow) => row.workspace_id === prev)) {
            return prev;
          }

          if (
            workspaceIdFromQuery &&
            rows.some(
              (row: WorkspaceRow) => row.workspace_id === workspaceIdFromQuery,
            )
          ) {
            return workspaceIdFromQuery;
          }

          return rows[0]?.workspace_id ?? "";
        });
      } finally {
        if (!cancelled) {
          setLoadingWorkspaces(false);
        }
      }
    }

    void loadWorkspaceSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedWorkspace = useMemo(() => {
    return (
      workspaces.find(
        (row) => row.workspace_id === selectedWorkspaceId,
      ) ?? null
    );
  }, [workspaces, selectedWorkspaceId]);

  const isAgencyWorkspace =
    selectedWorkspace?.tenant_type === "agency";

  const agencyBrandingAvailable = Boolean(
    isAgencyWorkspace &&
      selectedWorkspace?.tenant_status === "active" &&
      selectedWorkspace?.agency_branding_enabled,
  );

  const canManageBranding = Boolean(
    agencyBrandingAvailable &&
      canManageAgencyBranding(
        selectedWorkspace?.role ?? null,
        userEmail,
      ),
  );

  async function refreshWorkspaces() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? null;

    if (!token) {
      setBrandingMsg("로그인 세션이 없습니다.");
      return;
    }

    const res = await fetch("/api/workspaces/list", {
      credentials: "include",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await safeReadJson(res);

    if (!res.ok || !json?.ok) {
      setBrandingMsg(
        json?.error || "workspace 설정 정보를 다시 불러오지 못했습니다.",
      );
      return;
    }

    const rows = Array.isArray(json?.workspaces)
      ? json.workspaces
          .map(normalizeWorkspaceRow)
          .filter((row: WorkspaceRow) => row.workspace_id)
      : [];

    setWorkspaces(rows);
  }

  function handleBrandingFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setBrandingFile(null);
      return;
    }

    const allowedTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);

    if (!allowedTypes.has(file.type)) {
      event.target.value = "";
      setBrandingFile(null);
      setBrandingMsg("로고는 PNG, JPG, WebP 파일만 등록할 수 있습니다.");
      return;
    }

    if (file.size <= 0) {
      event.target.value = "";
      setBrandingFile(null);
      setBrandingMsg("비어 있는 파일은 등록할 수 없습니다.");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      event.target.value = "";
      setBrandingFile(null);
      setBrandingMsg("로고 파일은 최대 3MB까지 등록할 수 있습니다.");
      return;
    }

    setBrandingFile(file);
    setBrandingMsg(`선택된 로고: ${file.name}`);
  }

  async function uploadAgencyBrandingLogo() {
    if (!selectedWorkspace || !canManageBranding) {
      setBrandingMsg("대행사 리포트 브랜딩 수정 권한이 없습니다.");
      return;
    }

    if (!brandingFile || uploadingBranding) {
      setBrandingMsg("등록할 로고 파일을 먼저 선택하세요.");
      return;
    }

    setUploadingBranding(true);
    setBrandingMsg("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;

      if (!token) {
        setBrandingMsg("로그인 세션이 없습니다.");
        return;
      }

      const formData = new FormData();
      formData.append("file", brandingFile);

      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(selectedWorkspace.workspace_id)}/logo`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      const json = await safeReadJson(res);

      if (!res.ok || !json?.ok) {
        setBrandingMsg(
          json?.error || "대행사 기업 로고 등록에 실패했습니다.",
        );
        return;
      }

      setBrandingFile(null);
      if (brandingInputRef.current) {
        brandingInputRef.current.value = "";
      }

      await refreshWorkspaces();
      setBrandingMsg("대행사 공통 기업 로고를 저장했습니다.");
    } catch (error: any) {
      setBrandingMsg(
        error?.message || "대행사 기업 로고 등록에 실패했습니다.",
      );
    } finally {
      setUploadingBranding(false);
    }
  }

  async function deleteAgencyBrandingLogo() {
    if (!selectedWorkspace || !canManageBranding) {
      setBrandingMsg("대행사 리포트 브랜딩 삭제 권한이 없습니다.");
      return;
    }

    if (!selectedWorkspace.workspace_logo_url || deletingBranding) {
      return;
    }

    const ok = window.confirm(
      "이 대행사에 공통 적용되는 기업 로고를 삭제하시겠습니까?",
    );

    if (!ok) return;

    setDeletingBranding(true);
    setBrandingMsg("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;

      if (!token) {
        setBrandingMsg("로그인 세션이 없습니다.");
        return;
      }

      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(selectedWorkspace.workspace_id)}/logo`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const json = await safeReadJson(res);

      if (!res.ok || !json?.ok) {
        setBrandingMsg(
          json?.error || "대행사 기업 로고 삭제에 실패했습니다.",
        );
        return;
      }

      setBrandingFile(null);
      if (brandingInputRef.current) {
        brandingInputRef.current.value = "";
      }

      await refreshWorkspaces();
      setBrandingMsg("대행사 공통 기업 로고를 삭제했습니다.");
    } catch (error: any) {
      setBrandingMsg(
        error?.message || "대행사 기업 로고 삭제에 실패했습니다.",
      );
    } finally {
      setDeletingBranding(false);
    }
  }

  const openConnect = (provider: ProviderKey) =>
    setModal({ open: true, provider });
  const closeModal = () => setModal({ open: false });

  const devMarkConnected = (provider: ProviderKey) => {
    setStates((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        status: "connected",
        connectedAt: isoNow(),
        accountName:
          provider === "naver"
            ? "Naver SearchAd (예시)"
            : provider === "google"
              ? "Google Ads Account (예시)"
              : "Meta Business (예시)",
      },
    }));
  };

  const disconnect = (provider: ProviderKey) => {
    setStates((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        status: "disconnected",
        connectedAt: undefined,
        accountName: undefined,
      },
    }));
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">설정</h1>
          <p className="mt-1 text-sm text-gray-600">
            workspace 설정과 광고 계정 연동 상태를 관리합니다.
          </p>
        </div>

        <Link
          href={
            selectedWorkspaceId
              ? `/report-builder?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`
              : "/report-builder"
          }
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
        >
          ← 리포트 Builder
        </Link>
      </div>

      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">현재 workspace</h2>
            <p className="mt-1 text-sm text-gray-600">
              설정을 확인할 workspace를 선택합니다.
            </p>
          </div>

          {selectedWorkspace?.tenant_type ? (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              {selectedWorkspace.tenant_type === "agency"
                ? "대행사"
                : "광고주(인하우스)"}
            </span>
          ) : null}
        </div>

        <div className="mt-4">
          <select
            value={selectedWorkspaceId}
            onChange={(event) => {
              setSelectedWorkspaceId(event.target.value);
              setBrandingFile(null);
              setBrandingMsg("");
              if (brandingInputRef.current) {
                brandingInputRef.current.value = "";
              }
            }}
            disabled={loadingWorkspaces || workspaces.length === 0}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
          >
            {workspaces.length === 0 ? (
              <option value="">
                {loadingWorkspaces ? "workspace 불러오는 중..." : "선택 가능한 workspace가 없습니다."}
              </option>
            ) : null}

            {workspaces.map((workspace) => (
              <option
                key={workspace.workspace_id}
                value={workspace.workspace_id}
              >
                {workspace.workspace_name || workspace.workspace_id}
                {workspace.role ? ` (${workspace.role})` : ""}
              </option>
            ))}
          </select>
        </div>
      </section>

      {isAgencyWorkspace ? (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">리포트 브랜딩</h2>
              <p className="mt-1 text-sm text-gray-600">
                {selectedWorkspace?.tenant_name || "대행사"} 소속 workspace의 리포트·공유·PPT에 공통 적용되는 기업 로고입니다.
              </p>
            </div>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              대행사 공통
            </span>
          </div>

          {!agencyBrandingAvailable ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              대행사 브랜딩 기준 workspace를 안전하게 확정할 수 없어 로고 관리를 비활성화했습니다.
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-5">
                {selectedWorkspace?.workspace_logo_url ? (
                  <div className="flex min-h-28 items-center justify-center rounded-xl border border-gray-200 bg-white p-4">
                    <img
                      src={selectedWorkspace.workspace_logo_url}
                      alt={`${selectedWorkspace.tenant_name || "대행사"} 기업 로고`}
                      className="h-20 w-full max-w-sm object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
                    등록된 대행사 기업 로고가 없습니다.
                  </div>
                )}

                <div className="mt-3 text-xs text-gray-500">
                  기준 workspace: {selectedWorkspace?.branding_workspace_name || "-"}
                  {selectedWorkspace?.logo_updated_at
                    ? ` · 마지막 변경 ${formatKST(selectedWorkspace.logo_updated_at)}`
                    : ""}
                </div>
              </div>

              {canManageBranding ? (
                <div className="mt-4">
                  <input
                    ref={brandingInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleBrandingFileChange}
                    disabled={uploadingBranding || deletingBranding}
                    className="hidden"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => brandingInputRef.current?.click()}
                      disabled={uploadingBranding || deletingBranding}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedWorkspace?.workspace_logo_url
                        ? "로고 교체 파일 선택"
                        : "로고 파일 선택"}
                    </button>

                    <button
                      type="button"
                      onClick={uploadAgencyBrandingLogo}
                      disabled={
                        !brandingFile ||
                        uploadingBranding ||
                        deletingBranding
                      }
                      className="rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {uploadingBranding
                        ? "저장 중..."
                        : selectedWorkspace?.workspace_logo_url
                          ? "선택 파일로 교체"
                          : "로고 등록"}
                    </button>

                    {selectedWorkspace?.workspace_logo_url ? (
                      <button
                        type="button"
                        onClick={deleteAgencyBrandingLogo}
                        disabled={uploadingBranding || deletingBranding}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingBranding ? "삭제 중..." : "로고 삭제"}
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 text-xs leading-5 text-gray-500">
                    PNG, JPG, WebP · 최대 3MB · 가로형·세로형·투명 PNG 지원
                    {brandingFile ? (
                      <>
                        <br />
                        선택 파일: <b>{brandingFile.name}</b>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-sm text-gray-500">
                  로고 등록·교체·삭제는 true master 또는 director만 가능합니다.
                </div>
              )}

              {brandingMsg ? (
                <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  {brandingMsg}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">광고 플랫폼 연동</h2>
            <p className="mt-1 text-sm text-gray-600">
              지금은 UI/구조만 먼저 만들고, 다음 단계에서 OAuth + API 수집을 붙입니다.
            </p>
          </div>

          <span className="text-xs text-gray-400">
            *개발 중이므로 “연동됨”은 시뮬레이션 버튼으로 표시됩니다.
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <IntegrationCard
            state={states.naver}
            onConnect={() => openConnect("naver")}
            onDisconnect={() => disconnect("naver")}
            onDevMarkConnected={() => devMarkConnected("naver")}
          />
          <IntegrationCard
            state={states.google}
            onConnect={() => openConnect("google")}
            onDisconnect={() => disconnect("google")}
            onDevMarkConnected={() => devMarkConnected("google")}
          />
          <IntegrationCard
            state={states.meta}
            onConnect={() => openConnect("meta")}
            onDisconnect={() => disconnect("meta")}
            onDevMarkConnected={() => devMarkConnected("meta")}
          />
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-base font-semibold">다음 단계(로드맵)</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>
            <b>OAuth 콜백 URL</b>을 만들고, “연동하기” 버튼이 해당 인증 페이지로 이동하도록 연결
          </li>
          <li>
            인증 성공 시 발급되는 <b>토큰/계정 정보</b>를 DB에 저장
          </li>
          <li>
            크론(스케줄러)로 <b>일 단위 성과</b>를 수집해 DB에 적재
          </li>
          <li>
            대시보드가 CSV 대신 <b>DB 데이터를 읽어 렌더링</b>하도록 교체
          </li>
        </ol>
      </section>

      {modal.open && (
        <Modal onClose={closeModal}>
          <h4 className="text-lg font-semibold">
            {modal.provider === "naver"
              ? "네이버 연동"
              : modal.provider === "google"
                ? "Google Ads 연동"
                : "Meta Ads 연동"}
          </h4>

          <div className="mt-3 space-y-2 text-sm text-gray-700">
            <p>
              지금은 “연동 UI 자리”만 만든 상태야. 다음 단계에서 실제로는{" "}
              <b>OAuth 인증 흐름</b>을 붙여서, 광고 계정 접근 권한을 받고 토큰을 저장해야 해.
            </p>
            <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              ✅ 앞으로 붙일 것: <br />
              - /api/integrations/{`{provider}`}/start (인증 시작) <br />
              - /api/integrations/{`{provider}`}/callback (인증 콜백) <br />
              - DB: integrations 테이블(토큰/계정/연동자) <br />
              - 스케줄러: 일/주 단위 성과 수집
            </p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={closeModal}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
            >
              닫기
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function IntegrationCard(props: {
  state: ProviderState;
  onConnect: () => void;
  onDisconnect: () => void;
  onDevMarkConnected: () => void;
}) {
  const { state, onConnect, onDisconnect, onDevMarkConnected } = props;

  const badge =
    state.status === "connected" ? (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
        ● 연동됨
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
        ● 미연동
      </span>
    );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{state.label}</div>
          <div className="mt-1 text-xs text-gray-500">
            연결 계정: {state.accountName ?? "-"}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            연결 시각: {formatKST(state.connectedAt)}
          </div>
        </div>
        {badge}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onConnect}
          className="rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90"
        >
          연동하기
        </button>

        {state.status === "connected" ? (
          <button
            onClick={onDisconnect}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
          >
            연동 해제
          </button>
        ) : (
          <button
            onClick={onDevMarkConnected}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
            title="개발 중 테스트용 버튼(나중에 삭제)"
          >
            (개발용) 연동됨 표시
          </button>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        <b>설명</b>
        <div className="mt-1">
          “연동하기”는 나중에 OAuth 인증으로 이어질 버튼이야. 지금은 안내 모달만 띄웁니다.
        </div>
      </div>
    </div>
  );
}

function Modal(props: { onClose: () => void; children: React.ReactNode }) {
  const { onClose, children } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-lg">
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-50"
            aria-label="close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
