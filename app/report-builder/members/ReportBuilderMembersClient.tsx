"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";

type WorkspaceMember = {
  id?: string;
  workspace_id: string;
  user_id: string;
  role: "master" | "director" | "admin" | "staff" | "client";
  division?: string | null;
  department?: string | null;
  team?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  email?: string | null;
  full_name?: string | null;
  name?: string | null;
  workspace_name?: string | null;
};

type MeInfo = {
  user_id: string;
  workspace_id: string;
  role: "master" | "director" | "admin" | "staff" | "client";
  division?: string | null;
  department?: string | null;
  team?: string | null;
  email?: string | null;
  full_name?: string | null;
  name?: string | null;
  workspace_name?: string | null;
};

type ApiGetResponse = {
  ok: boolean;
  workspace_id?: string;
  me?: MeInfo;
  members?: WorkspaceMember[];
  error?: string;
};

type ApiPatchResponse = {
  ok: boolean;
  member?: WorkspaceMember;
  error?: string;
};

type ApiDeleteResponse = {
  ok: boolean;
  workspace_id?: string;
  member_user_id?: string;
  error?: string;
};

type ApiInviteCreateResponse = {
  ok: boolean;
  invite?: {
    id: string;
    workspace_id: string;
    email: string;
    role: string;
    token: string;
    status: string;
    expires_at?: string | null;
    created_at?: string | null;
  };
  invitePath?: string;
  error?: string;
  detail?: string;
};

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

const NON_MASTER_ROLE_OPTIONS = ["director", "admin", "staff", "client"] as const;
const DIRECTOR_EDITABLE_ROLE_OPTIONS = ["admin", "staff", "client"] as const;

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function isOnlyMasterEmail(email?: string | null) {
  return norm(email) === ONLY_MASTER_EMAIL;
}

function memberKeyOf(member: Pick<WorkspaceMember, "workspace_id" | "user_id">) {
  return `${member.workspace_id}:${member.user_id}`;
}

function displayNameOf(member: WorkspaceMember) {
  return (
    member.full_name?.trim() ||
    member.name?.trim() ||
    member.email?.trim() ||
    member.user_id
  );
}

function canAccessMembersPage(role?: string | null, email?: string | null) {
  if (role === "director") {
    return true;
  }

  if (role === "master") {
    return isOnlyMasterEmail(email);
  }

  return false;
}

function canUseTrueMasterPower(role?: string | null, email?: string | null) {
  return role === "master" && isOnlyMasterEmail(email);
}

function isProtectedOnlyMasterMember(
  member?: Pick<WorkspaceMember, "role" | "email"> | null
) {
  if (!member) return false;
  return member.role === "master" && isOnlyMasterEmail(member.email);
}

function canEditTarget(
  meRole?: string | null,
  meEmail?: string | null,
  targetRole?: string | null,
  isSelf?: boolean
) {
  if (!meRole) return false;
  if (isSelf) return false;

  if (canUseTrueMasterPower(meRole, meEmail)) {
    return true;
  }

  if (meRole === "director") {
    if (targetRole === "master" || targetRole === "director") return false;
    return true;
  }

  return false;
}

function allowedRoleOptionsForTarget(
  meRole?: string | null,
  meEmail?: string | null,
  targetRole?: string | null,
  isSelf?: boolean,
  targetEmail?: string | null
) {
  if (!canEditTarget(meRole, meEmail, targetRole, isSelf)) return [];

  if (canUseTrueMasterPower(meRole, meEmail)) {
    if (targetRole === "master" && isOnlyMasterEmail(targetEmail)) {
      return ["master"];
    }

    if (isOnlyMasterEmail(targetEmail)) {
      return ["master"];
    }

    return [...NON_MASTER_ROLE_OPTIONS];
  }

  if (meRole === "director") {
    return [...DIRECTOR_EDITABLE_ROLE_OPTIONS];
  }

  return [];
}

function parseTeamNumber(name?: string | null) {
  const raw = String(name ?? "").trim();
  const m = raw.match(/^(\d+)\s*팀$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function workspaceSortTuple(name?: string | null): [number, number, string] {
  const raw = String(name ?? "").trim();

  const teamNo = parseTeamNumber(raw);
  if (teamNo != null) {
    return [0, -teamNo, raw];
  }

  if (raw === "Einvention") {
    return [1, 0, raw];
  }

  if (raw === "미분류") {
    return [2, 0, raw];
  }

  return [3, 0, raw];
}

function compareMembersForDisplay(a: WorkspaceMember, b: WorkspaceMember) {
  const [aGroup, aTeamOrder, aName] = workspaceSortTuple(a.workspace_name);
  const [bGroup, bTeamOrder, bName] = workspaceSortTuple(b.workspace_name);

  if (aGroup !== bGroup) return aGroup - bGroup;
  if (aTeamOrder !== bTeamOrder) return aTeamOrder - bTeamOrder;

  if (aGroup === 3) {
    const workspaceCmp = bName.localeCompare(aName, "ko");
    if (workspaceCmp !== 0) return workspaceCmp;
  } else {
    const workspaceCmp = aName.localeCompare(bName, "ko");
    if (workspaceCmp !== 0) return workspaceCmp;
  }

  const displayCmp = displayNameOf(a).localeCompare(displayNameOf(b), "ko");
  if (displayCmp !== 0) return displayCmp;

  return a.user_id.localeCompare(b.user_id, "ko");
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = await getAccessToken();

  const headers = new Headers(init?.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}

export default function ReportBuilderMembersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const workspaceIdFromQuery = searchParams.get("workspace_id")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string>("");
  const [removingKey, setRemovingKey] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [workspaceId, setWorkspaceId] = useState<string>(workspaceIdFromQuery);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        role: string;
        division: string;
        department: string;
        team: string;
      }
    >
  >({});

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<
    "director" | "admin" | "staff" | "client"
  >("staff");
  const [inviteCreating, setInviteCreating] = useState(false);
  const [createdInvitePath, setCreatedInvitePath] = useState("");

  function applyMembersResponse(json: ApiGetResponse, fallbackWorkspaceId?: string) {
    const nextWorkspaceId =
      json.workspace_id || fallbackWorkspaceId || workspaceIdFromQuery || "";
    const nextMembers = Array.isArray(json.members) ? json.members : [];
    const nextMe = json.me ?? null;

    setWorkspaceId(nextWorkspaceId);
    setMembers(nextMembers);
    setMe(nextMe);

    const nextDrafts: Record<
      string,
      { role: string; division: string; department: string; team: string }
    > = {};

    for (const m of nextMembers) {
      nextDrafts[memberKeyOf(m)] = {
        role: m.role || "staff",
        division: m.division || "",
        department: m.department || "",
        team: m.team || "",
      };
    }

    setDrafts(nextDrafts);

    return nextWorkspaceId;
  }

  async function requestMembers(targetWorkspaceId?: string) {
    const qs = new URLSearchParams();
    if (targetWorkspaceId) qs.set("workspace_id", targetWorkspaceId);

    const res = await authFetch(
      `/api/workspace-members${qs.toString() ? `?${qs.toString()}` : ""}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    const json = (await res.json().catch(() => null)) as ApiGetResponse | null;

    return { res, json };
  }

  async function loadMembers() {
    setLoading(true);
    setError("");

    try {
      if (workspaceIdFromQuery) {
        const first = await requestMembers(workspaceIdFromQuery);

        if (first.res.ok && first.json?.ok) {
          applyMembersResponse(first.json, workspaceIdFromQuery);
          return;
        }

        const shouldFallback =
          first.json?.error === "WORKSPACE_ACCESS_DENIED" ||
          first.res.status === 403;

        if (shouldFallback) {
          const second = await requestMembers();

          if (second.res.ok && second.json?.ok) {
            const resolvedWorkspaceId = applyMembersResponse(second.json);

            setError(
              "이전 workspace 링크가 남아 있어 현재 접근 가능한 workspace로 자동 전환했습니다."
            );

            if (resolvedWorkspaceId) {
              router.replace(
                `/report-builder/members?workspace_id=${encodeURIComponent(
                  resolvedWorkspaceId
                )}`
              );
            }

            return;
          }

          setError(
            second.json?.error ||
              first.json?.error ||
              "멤버 목록을 불러오지 못했습니다."
          );
          setMembers([]);
          setMe(null);
          return;
        }

        setError(first.json?.error || "멤버 목록을 불러오지 못했습니다.");
        setMembers([]);
        setMe(null);
        return;
      }

      const base = await requestMembers();

      if (!base.res.ok || !base.json?.ok) {
        setError(base.json?.error || "멤버 목록을 불러오지 못했습니다.");
        setMembers([]);
        setMe(null);
        return;
      }

      const resolvedWorkspaceId = applyMembersResponse(base.json);

      if (resolvedWorkspaceId && resolvedWorkspaceId !== workspaceIdFromQuery) {
        router.replace(
          `/report-builder/members?workspace_id=${encodeURIComponent(
            resolvedWorkspaceId
          )}`
        );
      }
    } catch (e: any) {
      setError(e?.message || "멤버 목록을 불러오는 중 오류가 발생했습니다.");
      setMembers([]);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceIdFromQuery]);

  const canAccess = useMemo(
    () => canAccessMembersPage(me?.role, me?.email),
    [me?.role, me?.email]
  );

  const isTrueMasterViewer = useMemo(
    () => canUseTrueMasterPower(me?.role, me?.email),
    [me?.role, me?.email]
  );

  const sortedMembers = useMemo(() => {
    return [...members].sort(compareMembersForDisplay);
  }, [members]);

  async function saveMember(member: WorkspaceMember) {
    const memberKey = memberKeyOf(member);
    const draft = drafts[memberKey];
    if (!draft || !member.workspace_id) return;

    setSavingKey(memberKey);
    setError("");

    try {
      const roleOptions = allowedRoleOptionsForTarget(
        me?.role,
        me?.email,
        member.role,
        me?.user_id === member.user_id,
        member.email
      );
      const nextRole = roleOptions.some((role) => role === draft.role)
        ? draft.role
        : member.role;

      const res = await authFetch("/api/workspace-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: member.workspace_id,
          member_user_id: member.user_id,
          role: nextRole,
          division: draft.division,
          department: draft.department,
          team: draft.team,
        }),
      });

      const json = (await res.json().catch(() => null)) as ApiPatchResponse | null;

      if (!res.ok || !json?.ok) {
        alert(json?.error || "멤버 정보를 저장하지 못했습니다.");
        return;
      }

      setMembers((prev) =>
        prev.map((m) =>
          memberKeyOf(m) === memberKey
            ? {
                ...m,
                role: (nextRole as WorkspaceMember["role"]) || m.role,
                division: draft.division,
                department: draft.department,
                team: draft.team,
              }
            : m
        )
      );

      alert("멤버 정보가 저장되었습니다.");
    } catch (e: any) {
      alert(e?.message || "멤버 정보를 저장하는 중 오류가 발생했습니다.");
    } finally {
      setSavingKey("");
    }
  }

  async function removeMember(member: WorkspaceMember) {
    const memberKey = memberKeyOf(member);

    if (!member.workspace_id || !member.user_id) return;

    const confirmed = window.confirm(
      `정말 "${displayNameOf(
        member
      )}" 멤버를 현재 workspace에서 제거하시겠습니까?\n\n계정 자체는 삭제되지 않습니다.`
    );
    if (!confirmed) return;

    setRemovingKey(memberKey);
    setError("");

    try {
      const res = await authFetch("/api/workspace-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: member.workspace_id,
          member_user_id: member.user_id,
        }),
      });

      const json = (await res.json().catch(() => null)) as ApiDeleteResponse | null;

      if (!res.ok || !json?.ok) {
        alert(json?.error || "멤버를 제거하지 못했습니다.");
        return;
      }

      setMembers((prev) => prev.filter((m) => memberKeyOf(m) !== memberKey));

      setDrafts((prev) => {
        const next = { ...prev };
        delete next[memberKey];
        return next;
      });

      alert("멤버가 현재 workspace에서 제거되었습니다.");
    } catch (e: any) {
      alert(e?.message || "멤버 제거 중 오류가 발생했습니다.");
    } finally {
      setRemovingKey("");
    }
  }

  async function createInvite() {
    const email = inviteEmail.trim().toLowerCase();

    if (!workspaceId) {
      alert("workspace_id를 확인할 수 없습니다.");
      return;
    }

    if (!email || !email.includes("@")) {
      alert("초대할 이메일을 정확히 입력하세요.");
      return;
    }

    if (inviteRole === "director" && !canUseTrueMasterPower(me?.role, me?.email)) {
      alert("director 초대는 true master만 가능합니다.");
      return;
    }

    setInviteCreating(true);
    setCreatedInvitePath("");
    setError("");

    try {
      const res = await authFetch("/api/workspace-invites/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          email,
          role: inviteRole,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | ApiInviteCreateResponse
        | null;

      if (!res.ok || !json?.ok) {
        alert(json?.detail || json?.error || "초대를 생성하지 못했습니다.");
        return;
      }

      const path = json.invitePath || "";
      setCreatedInvitePath(path);
      setInviteEmail("");

      alert("초대 링크가 생성되었습니다. 링크를 복사해서 전달하세요.");
    } catch (e: any) {
      alert(e?.message || "초대 생성 중 오류가 발생했습니다.");
    } finally {
      setInviteCreating(false);
    }
  }

async function copyInviteLink() {
  if (!createdInvitePath) return;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${createdInvitePath}`;

  try {
    await navigator.clipboard.writeText(url);
    alert("초대 링크를 복사했습니다.");
  } catch {
    window.prompt("아래 초대 링크를 복사하세요.", url);
  }
}

  function updateDraft(
    member: WorkspaceMember,
    key: "role" | "division" | "department" | "team",
    value: string
  ) {
    const memberKey = memberKeyOf(member);

    setDrafts((prev) => ({
      ...prev,
      [memberKey]: {
        ...(prev[memberKey] || {
          role: "staff",
          division: "",
          department: "",
          team: "",
        }),
        [key]: value,
      },
    }));
  }

  function goBack() {
    if (workspaceId) {
      router.push(`/report-builder?workspace_id=${encodeURIComponent(workspaceId)}`);
      return;
    }
    router.push("/report-builder");
  }

  return (
    <main style={pageShellStyle}>
      <div style={contentStyle}>
        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: TEXT_PRIMARY }}>
                멤버 관리
              </div>
              <div style={{ marginTop: 6, fontSize: 14, color: TEXT_SECONDARY }}>
                {isTrueMasterViewer
                  ? "true master 기준 전체 workspace 멤버 조회 및 역할/조직 정보 수정"
                  : "현재 workspace 기준 멤버 목록 조회 및 역할/조직 정보 수정"}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: TEXT_SECONDARY }}>
                workspace_id: <b style={{ color: TEXT_PRIMARY }}>{workspaceId || "-"}</b>
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: TEXT_SECONDARY }}>
                내 권한: <b style={{ color: TEXT_PRIMARY }}>{me?.role || "-"}</b>
              </div>
              {me?.workspace_name ? (
                <div style={{ marginTop: 4, fontSize: 13, color: TEXT_SECONDARY }}>
                  기준 workspace:{" "}
                  <b style={{ color: TEXT_PRIMARY }}>{me.workspace_name}</b>
                </div>
              ) : null}
              <div style={{ marginTop: 4, fontSize: 12, color: TEXT_MUTED }}>
                master는{" "}
                <b style={{ color: TEXT_SECONDARY }}>{ONLY_MASTER_EMAIL}</b> 한 명만
                허용됩니다.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={loadMembers} style={secondaryButtonStyle}>
                새로고침
              </button>

              <button onClick={goBack} style={primaryButtonStyle}>
                report-builder로 돌아가기
              </button>
            </div>
          </div>
        </section>

        {!!error && (
          <div style={errorPanelStyle}>
            {error}
          </div>
        )}

        {!loading && me && !canAccess && (
          <section style={panelStyle}>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_PRIMARY }}>
              접근 권한이 없습니다.
            </div>
            <div style={{ marginTop: 8, color: TEXT_SECONDARY, fontSize: 14 }}>
              이 페이지는 master / director만 접근할 수 있습니다.
            </div>
          </section>
        )}

        {loading && (
          <section
            style={{
              ...panelStyle,
              padding: 24,
              color: TEXT_SECONDARY,
              fontWeight: 700,
            }}
          >
            멤버 목록 불러오는 중...
          </section>
        )}

        {!loading && canAccess && (
          <>
            <section style={panelStyle}>
              <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_PRIMARY }}>
                멤버 초대 (최소 UI 초안)
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: TEXT_SECONDARY }}>
                초대 링크를 생성합니다. 메일 자동 발송은 다음 단계에서 연결하고,
                지금은 링크를 복사해 전달합니다.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr auto",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="초대할 이메일"
                  style={inviteFieldStyle}
                />

                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(
                      e.target.value as "director" | "admin" | "staff" | "client"
                    )
                  }
                  style={inviteFieldStyle}
                >
                  {isTrueMasterViewer ? (
                    <option value="director">director</option>
                  ) : null}
                  <option value="admin">admin</option>
                  <option value="staff">staff</option>
                  <option value="client">client</option>
                </select>

                <button
                  type="button"
                  onClick={createInvite}
                  disabled={inviteCreating}
                  style={actionButtonStyle(inviteCreating)}
                >
                  {inviteCreating ? "생성 중..." : "초대 링크 생성"}
                </button>
              </div>

              {createdInvitePath ? (
                <div style={inviteResultStyle}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 260,
                      fontSize: 13,
                      color: TEXT_SECONDARY,
                      wordBreak: "break-all",
                    }}
                  >
                    {typeof window !== "undefined"
                      ? `${window.location.origin}${createdInvitePath}`
                      : createdInvitePath}
                  </div>

                  <button
                    type="button"
                    onClick={copyInviteLink}
                    style={secondaryButtonStyle}
                  >
                    링크 복사
                  </button>
                </div>
              ) : null}
            </section>

            <section style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "18px 20px",
                  borderBottom: PANEL_BORDER,
                  fontSize: 18,
                  fontWeight: 800,
                  color: TEXT_PRIMARY,
                }}
              >
                멤버 목록 ({sortedMembers.length}명)
              </div>

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: isTrueMasterViewer ? 1330 : 1210,
                    tableLayout: "fixed",
                  }}
                >
                  <colgroup>
                    {isTrueMasterViewer ? <col style={{ width: 120 }} /> : null}
                    <col style={{ width: 140 }} />
                    <col style={{ width: 260 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 180 }} />
                  </colgroup>

                  <thead>
                    <tr style={{ background: "rgba(124, 92, 255, 0.10)" }}>
                      {isTrueMasterViewer ? <th style={thStyle}>workspace</th> : null}
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>이메일</th>
                      <th style={thStyle}>role</th>
                      <th style={thStyle}>division</th>
                      <th style={thStyle}>department</th>
                      <th style={thStyle}>team</th>
                      <th style={thStyle}>작업</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sortedMembers.map((member) => {
                      const memberKey = memberKeyOf(member);
                      const isSelf = me?.user_id === member.user_id;
                      const protectedOnlyMaster = isProtectedOnlyMasterMember(member);
                      const editable = canEditTarget(
                        me?.role,
                        me?.email,
                        member.role,
                        isSelf
                      );
                      const roleOptions = allowedRoleOptionsForTarget(
                        me?.role,
                        me?.email,
                        member.role,
                        isSelf,
                        member.email
                      );
                      const draft = drafts[memberKey] || {
                        role: member.role || "staff",
                        division: member.division || "",
                        department: member.department || "",
                        team: member.team || "",
                      };

                      const removable =
                        editable &&
                        !isSelf &&
                        !protectedOnlyMaster &&
                        savingKey !== memberKey;

                      return (
                        <tr key={memberKey} style={{ background: "rgba(25, 19, 58, 0.16)" }}>
                          {isTrueMasterViewer ? (
                            <td style={tdStyle}>
                              <div
                                style={{ ...singleLineCellStyle, fontWeight: 700 }}
                                title={member.workspace_name || "-"}
                              >
                                {member.workspace_name || "-"}
                              </div>
                            </td>
                          ) : null}

                          <td style={tdStyle}>
                            <div
                              style={singleLineCellStyle}
                              title={displayNameOf(member)}
                            >
                              {displayNameOf(member)}
                            </div>
                          </td>

                          <td style={tdStyle}>
                            <div
                              style={singleLineCellStyle}
                              title={member.email || "-"}
                            >
                              {member.email || "-"}
                            </div>
                          </td>

                          <td style={tdStyle}>
                            <select
                              value={draft.role}
                              disabled={!editable || removingKey === memberKey}
                              onChange={(e) => updateDraft(member, "role", e.target.value)}
                              style={inputStyle(!editable || removingKey === memberKey)}
                            >
                              {editable ? (
                                roleOptions.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))
                              ) : (
                                <option value={member.role}>{member.role}</option>
                              )}
                            </select>
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={draft.division}
                              disabled={!editable || removingKey === memberKey}
                              onChange={(e) =>
                                updateDraft(member, "division", e.target.value)
                              }
                              style={inputStyle(!editable || removingKey === memberKey)}
                              placeholder="-"
                              title={draft.division || "-"}
                            />
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={draft.department}
                              disabled={!editable || removingKey === memberKey}
                              onChange={(e) =>
                                updateDraft(member, "department", e.target.value)
                              }
                              style={inputStyle(!editable || removingKey === memberKey)}
                              placeholder="-"
                              title={draft.department || "-"}
                            />
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={draft.team}
                              disabled={!editable || removingKey === memberKey}
                              onChange={(e) => updateDraft(member, "team", e.target.value)}
                              style={inputStyle(!editable || removingKey === memberKey)}
                              placeholder="-"
                              title={draft.team || "-"}
                            />
                          </td>

                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                disabled={
                                  !editable ||
                                  savingKey === memberKey ||
                                  removingKey === memberKey
                                }
                                onClick={() => saveMember(member)}
                                style={saveButtonStyle(
                                  !editable ||
                                    savingKey === memberKey ||
                                    removingKey === memberKey
                                )}
                              >
                                {savingKey === memberKey
                                  ? "저장 중..."
                                  : editable
                                    ? "저장"
                                    : isSelf
                                      ? "본인"
                                      : "권한 없음"}
                              </button>

                              {!isSelf ? (
                                <button
                                  type="button"
                                  disabled={!removable || removingKey === memberKey}
                                  onClick={() => removeMember(member)}
                                  style={removeButtonStyle(
                                    !removable || removingKey === memberKey
                                  )}
                                >
                                  {removingKey === memberKey
                                    ? "제거 중..."
                                    : protectedOnlyMaster
                                      ? "제거 불가"
                                      : "제거"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {sortedMembers.length === 0 && (
                      <tr>
                        <td
                          colSpan={isTrueMasterViewer ? 8 : 7}
                          style={{
                            padding: 24,
                            textAlign: "center",
                            color: TEXT_SECONDARY,
                            borderBottom: PANEL_BORDER,
                          }}
                        >
                          멤버가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const PAGE_BACKGROUND =
  "radial-gradient(circle at 18% 0%, rgba(33, 223, 243, 0.10), transparent 30%), radial-gradient(circle at 82% 12%, rgba(124, 92, 255, 0.18), transparent 34%), linear-gradient(135deg, #251b4d 0%, #2c2061 48%, #211a46 100%)";

const PANEL_BACKGROUND =
  "linear-gradient(160deg, rgba(57, 43, 112, 0.94), rgba(47, 35, 96, 0.92))";

const PANEL_BORDER = "1px solid rgba(255, 255, 255, 0.13)";
const FIELD_BORDER = "1px solid rgba(255, 255, 255, 0.15)";
const TEXT_PRIMARY = "#f7f7ff";
const TEXT_SECONDARY = "#c8c5df";
const TEXT_MUTED = "#9692b3";

const pageShellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: PAGE_BACKGROUND,
  backgroundAttachment: "fixed",
  color: TEXT_PRIMARY,
  padding: 24,
};

const contentStyle: React.CSSProperties = {
  maxWidth: 1400,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const panelStyle: React.CSSProperties = {
  background: PANEL_BACKGROUND,
  border: PANEL_BORDER,
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 12px 32px rgba(12, 8, 30, 0.18)",
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 10,
  border: FIELD_BORDER,
  background: "rgba(38, 29, 82, 0.86)",
  color: TEXT_PRIMARY,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(111, 203, 255, 0.56)",
  background: "linear-gradient(90deg, #21cbea 0%, #6f65ff 100%)",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 8px 20px rgba(69, 87, 230, 0.18)",
};

const errorPanelStyle: React.CSSProperties = {
  background: "rgba(118, 37, 67, 0.50)",
  border: "1px solid rgba(251, 113, 133, 0.38)",
  color: "#ffd7df",
  borderRadius: 12,
  padding: 14,
  fontSize: 14,
  fontWeight: 700,
};

const inviteFieldStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: FIELD_BORDER,
  padding: "0 12px",
  outline: "none",
  background: "rgba(30, 24, 70, 0.78)",
  color: TEXT_PRIMARY,
  colorScheme: "dark",
};

const inviteResultStyle: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 12,
  background: "rgba(30, 24, 70, 0.56)",
  border: FIELD_BORDER,
};

function actionButtonStyle(disabled?: boolean): React.CSSProperties {
  return {
    height: 42,
    padding: "0 14px",
    borderRadius: 10,
    border: disabled ? FIELD_BORDER : "1px solid rgba(111, 203, 255, 0.50)",
    background: disabled
      ? "rgba(255, 255, 255, 0.06)"
      : "linear-gradient(90deg, rgba(33, 203, 234, 0.92), rgba(111, 101, 255, 0.92))",
    color: disabled ? TEXT_MUTED : "#ffffff",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderBottom: PANEL_BORDER,
  fontSize: 13,
  color: "#dedcf2",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  fontSize: 14,
  color: TEXT_PRIMARY,
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  overflow: "hidden",
};

const singleLineCellStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function inputStyle(disabled?: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: 38,
    borderRadius: 10,
    border: FIELD_BORDER,
    padding: "0 10px",
    outline: "none",
    background: disabled
      ? "rgba(255, 255, 255, 0.055)"
      : "rgba(30, 24, 70, 0.76)",
    color: disabled ? "#aaa6c1" : TEXT_PRIMARY,
    colorScheme: "dark",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

function saveButtonStyle(disabled?: boolean): React.CSSProperties {
  return {
    height: 38,
    minWidth: 76,
    padding: "0 14px",
    borderRadius: 10,
    border: disabled ? FIELD_BORDER : "1px solid rgba(111, 203, 255, 0.48)",
    background: disabled
      ? "rgba(255, 255, 255, 0.055)"
      : "linear-gradient(90deg, rgba(33, 203, 234, 0.92), rgba(111, 101, 255, 0.92))",
    color: disabled ? TEXT_MUTED : "#ffffff",
    fontWeight: 800,
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
}

function removeButtonStyle(disabled?: boolean): React.CSSProperties {
  return {
    height: 38,
    minWidth: 76,
    padding: "0 14px",
    borderRadius: 10,
    border: disabled
      ? FIELD_BORDER
      : "1px solid rgba(248, 113, 113, 0.55)",
    background: disabled
      ? "rgba(255, 255, 255, 0.055)"
      : "rgba(190, 52, 76, 0.72)",
    color: disabled ? TEXT_MUTED : "#ffffff",
    fontWeight: 800,
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
}
