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

function canAccessMembersPage(role?: string | null) {
  return role === "master" || role === "director";
}

function canEditTarget(
  meRole?: string | null,
  targetRole?: string | null,
  isSelf?: boolean
) {
  if (!meRole) return false;
  if (isSelf) return false;

  if (meRole === "master") {
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
  targetRole?: string | null,
  isSelf?: boolean,
  targetEmail?: string | null
) {
  if (!canEditTarget(meRole, targetRole, isSelf)) return [];

  if (meRole === "master") {
    if (isOnlyMasterEmail(targetEmail)) {
      return ["master", ...NON_MASTER_ROLE_OPTIONS];
    }
    return [...NON_MASTER_ROLE_OPTIONS];
  }

  if (meRole === "director") {
    return [...DIRECTOR_EDITABLE_ROLE_OPTIONS];
  }

  return [];
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
  const [inviteRole, setInviteRole] = useState<"admin" | "staff" | "client">("staff");

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

          setError(second.json?.error || first.json?.error || "멤버 목록을 불러오지 못했습니다.");
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
          `/report-builder/members?workspace_id=${encodeURIComponent(resolvedWorkspaceId)}`
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

  const canAccess = useMemo(() => canAccessMembersPage(me?.role), [me?.role]);
  const isTrueMasterViewer = useMemo(
    () => me?.role === "master" && isOnlyMasterEmail(me?.email),
    [me?.role, me?.email]
  );

  async function saveMember(member: WorkspaceMember) {
    const memberKey = memberKeyOf(member);
    const draft = drafts[memberKey];
    if (!draft || !member.workspace_id) return;

    setSavingKey(memberKey);
    setError("");

    try {
      const res = await authFetch("/api/workspace-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: member.workspace_id,
          member_user_id: member.user_id,
          role: draft.role,
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
                role: (draft.role as WorkspaceMember["role"]) || m.role,
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
    <div style={{ minHeight: "100vh", background: "#f7f7f8", padding: 24 }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
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
              <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>
                멤버 관리
              </div>
              <div style={{ marginTop: 6, fontSize: 14, color: "#6b7280" }}>
                {isTrueMasterViewer
                  ? "true master 기준 전체 workspace 멤버 조회 및 역할/조직 정보 수정"
                  : "현재 workspace 기준 멤버 목록 조회 및 역할/조직 정보 수정"}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
                workspace_id: <b>{workspaceId || "-"}</b>
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
                내 권한: <b>{me?.role || "-"}</b>
              </div>
              {me?.workspace_name ? (
                <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
                  기준 workspace: <b>{me.workspace_name}</b>
                </div>
              ) : null}
              <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>
                master는 <b>{ONLY_MASTER_EMAIL}</b> 한 명만 허용됩니다.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={loadMembers}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                새로고침
              </button>

              <button
                onClick={goBack}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid #f59e0b",
                  background: "#f59e0b",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                report-builder로 돌아가기
              </button>
            </div>
          </div>
        </div>

        {!!error && (
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#be123c",
              borderRadius: 12,
              padding: 14,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        {!loading && me && !canAccess && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 24,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>
              접근 권한이 없습니다.
            </div>
            <div style={{ marginTop: 8, color: "#6b7280", fontSize: 14 }}>
              이 페이지는 master / director만 접근할 수 있습니다.
            </div>
          </div>
        )}

        {loading && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 24,
              color: "#6b7280",
              fontWeight: 700,
            }}
          >
            멤버 목록 불러오는 중...
          </div>
        )}

        {!loading && canAccess && (
          <>
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>
                멤버 초대 (최소 UI 초안)
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
                지금은 초대 메일 발송 로직 없이, 추후 연결용 최소 UI만 넣었습니다.
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
                  placeholder="초대할 이메일 (추후 연결 예정)"
                  style={{
                    height: 42,
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    padding: "0 12px",
                    outline: "none",
                  }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as "admin" | "staff" | "client")
                  }
                  style={{
                    height: 42,
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    padding: "0 12px",
                    outline: "none",
                    background: "#fff",
                  }}
                >
                  <option value="admin">admin</option>
                  <option value="staff">staff</option>
                  <option value="client">client</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    alert(
                      "현재는 초대 UI 초안만 반영했습니다. 실제 초대 발송/가입 연결은 다음 단계에서 붙이면 됩니다."
                    );
                  }}
                  style={{
                    height: 42,
                    padding: "0 14px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  초대 초안
                </button>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "18px 20px",
                  borderBottom: "1px solid #e5e7eb",
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#111827",
                }}
              >
                멤버 목록 ({members.length}명)
              </div>

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: isTrueMasterViewer ? 1260 : 1100,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {isTrueMasterViewer ? <th style={thStyle}>workspace</th> : null}
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>이메일</th>
                      <th style={thStyle}>user_id</th>
                      <th style={thStyle}>role</th>
                      <th style={thStyle}>division</th>
                      <th style={thStyle}>department</th>
                      <th style={thStyle}>team</th>
                      <th style={thStyle}>저장</th>
                    </tr>
                  </thead>

                  <tbody>
                    {members.map((member) => {
                      const memberKey = memberKeyOf(member);
                      const isSelf = me?.user_id === member.user_id;
                      const editable = canEditTarget(me?.role, member.role, isSelf);
                      const roleOptions = allowedRoleOptionsForTarget(
                        me?.role,
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

                      return (
                        <tr key={memberKey}>
                          {isTrueMasterViewer ? (
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 700 }}>
                                {member.workspace_name || "-"}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#6b7280",
                                  marginTop: 2,
                                  fontFamily: "monospace",
                                }}
                              >
                                {member.workspace_id}
                              </div>
                            </td>
                          ) : null}

                          <td style={tdStyle}>{displayNameOf(member)}</td>
                          <td style={tdStyle}>{member.email || "-"}</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontSize: 12,
                                color: "#374151",
                              }}
                            >
                              {member.user_id}
                            </span>
                          </td>

                          <td style={tdStyle}>
                            <select
                              value={draft.role}
                              disabled={!editable}
                              onChange={(e) => updateDraft(member, "role", e.target.value)}
                              style={inputStyle(!editable)}
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
                              disabled={!editable}
                              onChange={(e) =>
                                updateDraft(member, "division", e.target.value)
                              }
                              style={inputStyle(!editable)}
                              placeholder="-"
                            />
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={draft.department}
                              disabled={!editable}
                              onChange={(e) =>
                                updateDraft(member, "department", e.target.value)
                              }
                              style={inputStyle(!editable)}
                              placeholder="-"
                            />
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={draft.team}
                              disabled={!editable}
                              onChange={(e) => updateDraft(member, "team", e.target.value)}
                              style={inputStyle(!editable)}
                              placeholder="-"
                            />
                          </td>

                          <td style={tdStyle}>
                            <button
                              type="button"
                              disabled={!editable || savingKey === memberKey}
                              onClick={() => saveMember(member)}
                              style={{
                                height: 38,
                                padding: "0 14px",
                                borderRadius: 10,
                                border: "1px solid #f59e0b",
                                background:
                                  !editable || savingKey === memberKey
                                    ? "#f3f4f6"
                                    : "#f59e0b",
                                color:
                                  !editable || savingKey === memberKey
                                    ? "#9ca3af"
                                    : "#fff",
                                fontWeight: 800,
                                cursor:
                                  !editable || savingKey === memberKey
                                    ? "default"
                                    : "pointer",
                              }}
                            >
                              {savingKey === memberKey
                                ? "저장 중..."
                                : editable
                                  ? "저장"
                                  : isSelf
                                    ? "본인"
                                    : "권한 없음"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {members.length === 0 && (
                      <tr>
                        <td
                          colSpan={isTrueMasterViewer ? 9 : 8}
                          style={{
                            padding: 24,
                            textAlign: "center",
                            color: "#6b7280",
                          }}
                        >
                          멤버가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#374151",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #f3f4f6",
  fontSize: 14,
  color: "#111827",
  verticalAlign: "middle",
};

function inputStyle(disabled?: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: 38,
    borderRadius: 10,
    border: "1px solid #d1d5db",
    padding: "0 10px",
    outline: "none",
    background: disabled ? "#f9fafb" : "#fff",
    color: disabled ? "#6b7280" : "#111827",
  };
}