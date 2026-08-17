"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabase/client";

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

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

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

  return (
    <main
      className="min-h-screen text-[#f7f7ff]"
      style={{
        background:
          "radial-gradient(circle at 18% 0%, rgba(33, 223, 243, 0.10), transparent 30%), radial-gradient(circle at 82% 12%, rgba(124, 92, 255, 0.18), transparent 34%), linear-gradient(135deg, #251b4d 0%, #2c2061 48%, #211a46 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-8 md:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-extrabold tracking-[0.08em] text-[#9ef5ff]">
              SETTINGS
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#f7f7ff]">
              설정
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#d7d5ec]">
              workspace와 리포트 브랜딩 설정을 관리합니다.
            </p>
          </div>

          <Link
            href={
              selectedWorkspaceId
                ? `/report-builder?workspace_id=${encodeURIComponent(selectedWorkspaceId)}`
                : "/report-builder"
            }
            className="inline-flex items-center justify-center rounded-xl border border-white/[0.13] bg-[#352867]/90 px-4 py-2.5 text-sm font-extrabold text-[#f7f7ff] shadow-[0_9px_20px_rgba(8,5,29,0.18)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[#21dff3]/40 hover:bg-[#403184] hover:shadow-[0_12px_24px_rgba(8,5,29,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#21dff3]/50"
          >
            ← 리포트 Builder
          </Link>
        </div>

        <section className="mt-8 rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-5 shadow-[0_22px_54px_rgba(8,5,29,0.22)] md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-[-0.02em] text-[#f7f7ff]">
                현재 workspace
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-[#d7d5ec]">
                설정을 확인할 workspace를 선택합니다.
              </p>
            </div>

            {selectedWorkspace?.tenant_type ? (
              <span className="rounded-full border border-[#21dff3]/20 bg-[#21dff3]/10 px-3 py-1 text-xs font-extrabold text-[#9ef5ff]">
                {selectedWorkspace.tenant_type === "agency"
                  ? "대행사"
                  : "광고주(인하우스)"}
              </span>
            ) : null}
          </div>

          <div className="relative mt-4">
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
              className="etrylue-settings-select min-h-[50px] w-full appearance-none rounded-xl border border-white/[0.14] bg-[#211b44]/80 px-4 py-3 pr-16 text-sm font-semibold text-[#f7f7ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition-all duration-150 hover:border-[#21dff3]/40 hover:bg-[#2a2157] focus:border-[#21dff3]/80 focus:bg-[#251e50] focus:ring-4 focus:ring-[#21dff3]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {workspaces.length === 0 ? (
                <option value="">
                  {loadingWorkspaces
                    ? "workspace 불러오는 중..."
                    : "선택 가능한 workspace가 없습니다."}
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

            <div className="pointer-events-none absolute right-[5px] top-[5px] flex h-10 w-11 items-center justify-center rounded-[10px] border border-[#75e3ff]/20 bg-[linear-gradient(135deg,rgba(33,223,243,0.18),rgba(124,92,255,0.24))] text-[22px] font-black leading-none text-[#9ef5ff]">
              ⌄
            </div>
          </div>
        </section>

        {isAgencyWorkspace ? (
          <section className="mt-6 rounded-[20px] border border-white/[0.13] bg-[#392b70]/90 p-5 shadow-[0_22px_54px_rgba(8,5,29,0.22)] md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black tracking-[-0.02em] text-[#f7f7ff]">
                  리포트 브랜딩
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-[#d7d5ec]">
                  {selectedWorkspace?.tenant_name || "대행사"} 소속 workspace의
                  리포트·공유·PPT에 공통 적용되는 기업 로고입니다.
                </p>
              </div>

              <span className="rounded-full border border-[#7c5cff]/30 bg-[#7c5cff]/15 px-3 py-1 text-xs font-extrabold text-[#cfc7ff]">
                대행사 공통
              </span>
            </div>

            {!agencyBrandingAvailable ? (
              <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                대행사 브랜딩 기준 workspace를 안전하게 확정할 수 없어 로고
                관리를 비활성화했습니다.
              </div>
            ) : (
              <>
                <div className="mt-5 rounded-2xl border border-white/[0.12] bg-[#2a2157]/85 p-5">
                  {selectedWorkspace?.workspace_logo_url ? (
                    <div className="flex min-h-28 items-center justify-center rounded-xl border border-white/[0.13] bg-[#211b44]/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                      <img
                        src={selectedWorkspace.workspace_logo_url}
                        alt={`${selectedWorkspace.tenant_name || "대행사"} 기업 로고`}
                        className="h-20 w-full max-w-sm object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-white/20 bg-[#211b44]/60 p-4 text-sm text-[#bbb8d4]">
                      등록된 대행사 기업 로고가 없습니다.
                    </div>
                  )}

                  <div className="mt-3 text-xs leading-5 text-[#bbb8d4]">
                    기준 workspace:{" "}
                    {selectedWorkspace?.branding_workspace_name || "-"}
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
                        className="inline-flex items-center justify-center rounded-xl border border-white/[0.13] bg-[#352867]/90 px-4 py-2.5 text-sm font-extrabold text-[#f7f7ff] shadow-[0_9px_20px_rgba(8,5,29,0.18)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[#21dff3]/40 hover:bg-[#403184] hover:shadow-[0_12px_24px_rgba(8,5,29,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#21dff3]/50 disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="inline-flex items-center justify-center rounded-xl border border-[#75e3ff]/25 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_26px_rgba(70,77,217,0.28)] transition-all duration-150 hover:-translate-y-0.5 hover:brightness-105 hover:saturate-110 hover:shadow-[0_16px_32px_rgba(70,77,217,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#21dff3]/50 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{
                          background:
                            "linear-gradient(135deg, #21dff3 0%, #5f72ff 52%, #7c5cff 100%)",
                        }}
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
                          className="inline-flex items-center justify-center rounded-xl border border-[#ff637c]/25 bg-[#ff637c]/10 px-4 py-2.5 text-sm font-extrabold text-[#ff9bad] transition-all duration-150 hover:-translate-y-0.5 hover:border-[#ff637c]/45 hover:bg-[#ff637c]/15 hover:shadow-[0_12px_24px_rgba(133,24,59,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff637c]/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingBranding ? "삭제 중..." : "로고 삭제"}
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 text-xs leading-5 text-[#bbb8d4]">
                      PNG, JPG, WebP · 최대 3MB ·
                      가로형·세로형·투명 PNG 지원
                      {brandingFile ? (
                        <>
                          <br />
                          선택 파일:{" "}
                          <b className="text-[#f7f7ff]">
                            {brandingFile.name}
                          </b>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-sm leading-6 text-[#bbb8d4]">
                    로고 등록·교체·삭제는 true master 또는 director만
                    가능합니다.
                  </div>
                )}

                {brandingMsg ? (
                  <div className="mt-4 rounded-xl border border-white/[0.10] bg-[#2a2157]/80 px-4 py-3 text-sm text-[#d7d5ec]">
                    {brandingMsg}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}
      </div>

      <style jsx global>{`
        body {
          background: #211a46;
        }

        ::selection {
          background: rgba(33, 223, 243, 0.28);
          color: #ffffff;
        }

        .etrylue-settings-select option {
          background: #241b4b;
          color: #f7f7ff;
        }

        button,
        a,
        select {
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </main>
  );
}
