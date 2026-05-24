"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type InviteInfo = {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  status: string;
  expires_at?: string | null;
  created_at?: string | null;
};

type ApiResponse = {
  ok: boolean;
  invite?: InviteInfo;
  workspace_id?: string;
  error?: string;
  detail?: string;
};

function asText(v: any) {
  return String(v ?? "").trim();
}

function normalizeRole(v: any) {
  return asText(v).toLowerCase();
}

function isAllowedInviteRole(v: any) {
  const role = normalizeRole(v);

  if (role === "director") return true;
  if (role === "admin") return true;
  if (role === "staff") return true;
  if (role === "client") return true;

  return false;
}

function getFetchErrorMessage(e: any, fallback: string) {
  const message = asText(e?.message);

  if (message === "Failed to fetch") {
    return `${fallback} 네트워크 요청이 차단되었거나 개발 서버/API 라우트가 응답하지 않았습니다. 새로고침 후 다시 시도해 주세요.`;
  }

  return message || fallback;
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();

  const token = useMemo(() => asText(params?.token), [params?.token]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [division, setDivision] = useState("");
  const [department, setDepartment] = useState("");
  const [team, setTeam] = useState("");

  const inviteRole = normalizeRole(invite?.role);
  const inviteRoleAllowed = invite ? isAllowedInviteRole(invite.role) : false;
  const canSubmit =
    !!invite &&
    invite.status === "pending" &&
    inviteRoleAllowed &&
    !submitting &&
    !!token;

  async function loadInvite() {
    if (!token) {
      setError("초대 토큰이 없습니다.");
      setInvite(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/workspace-invites/accept?token=${encodeURIComponent(token)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const json = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !json?.ok || !json.invite) {
        setError(json?.detail || json?.error || "초대 정보를 불러오지 못했습니다.");
        setInvite(null);
        return;
      }

      const nextInvite = json.invite;
      const nextRole = normalizeRole(nextInvite.role);

      setInvite(nextInvite);

      if (nextRole === "master") {
        setError(
          "master 권한은 초대 가입으로 생성할 수 없습니다. 관리자에게 초대 권한을 다시 확인해 주세요."
        );
        return;
      }

      if (!isAllowedInviteRole(nextRole)) {
        setError(
          "지원하지 않는 초대 권한입니다. 관리자에게 초대 권한을 다시 확인해 주세요."
        );
        return;
      }
    } catch (e: any) {
      setError(
        getFetchErrorMessage(e, "초대 정보를 불러오는 중 오류가 발생했습니다.")
      );
      setInvite(null);
    } finally {
      setLoading(false);
    }
  }

  async function registerFromInvite() {
    if (!invite) return;

    if (submitting) return;

    if (!token) {
      setError("초대 토큰이 없습니다.");
      return;
    }

    if (invite.status !== "pending") {
      setError("이미 사용되었거나 더 이상 유효하지 않은 초대입니다.");
      return;
    }

    if (inviteRole === "master") {
      setError(
        "master 권한은 초대 가입으로 생성할 수 없습니다. 관리자에게 초대 권한을 다시 확인해 주세요."
      );
      return;
    }

    if (!inviteRoleAllowed) {
      setError(
        "지원하지 않는 초대 권한입니다. 관리자에게 초대 권한을 다시 확인해 주세요."
      );
      return;
    }

    if (!password || password.length < 6) {
      setError("비밀번호는 최소 6자 이상 입력하세요.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/workspace-invites/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          token,
          password,
          division,
          department,
          team,
        }),
      });

      const json = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !json?.ok) {
        setError(json?.detail || json?.error || "가입 처리에 실패했습니다.");
        return;
      }

      alert("가입이 완료되었습니다. 로그인 페이지로 이동합니다.");

      router.replace("/login?invited=1");
    } catch (e: any) {
      setError(getFetchErrorMessage(e, "가입 처리 중 오류가 발생했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    loadInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>초대 정보를 불러오는 중...</section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>
          Etrylue Performance 가입
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          초대된 이메일은 아이디로 고정됩니다. 비밀번호와 조직 정보를 입력하면
          Etrylue Performance에 바로 가입됩니다.
        </div>

        {error ? (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 12,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#be123c",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        ) : null}

        {invite ? (
          <>
            <div
              style={{
                marginTop: 20,
                display: "grid",
                gap: 12,
              }}
            >
              <label style={labelStyle}>
                <span style={labelTextStyle}>아이디 / 이메일</span>
                <input
                  value={invite.email}
                  readOnly
                  style={{
                    ...inputStyle,
                    background: "#f9fafb",
                    color: "#6b7280",
                  }}
                />
              </label>

              <label style={labelStyle}>
                <span style={labelTextStyle}>역할</span>
                <input
                  value={invite.role}
                  readOnly
                  style={{
                    ...inputStyle,
                    background: "#f9fafb",
                    color: "#6b7280",
                  }}
                />
              </label>

              <label style={labelStyle}>
                <span style={labelTextStyle}>비밀번호</span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="최소 6자 이상"
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                <span style={labelTextStyle}>비밀번호 확인</span>
                <input
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  type="password"
                  placeholder="비밀번호 재입력"
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                }}
              >
                <label style={labelStyle}>
                  <span style={labelTextStyle}>division</span>
                  <input
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    placeholder="예: 광고본부"
                    style={inputStyle}
                  />
                </label>

                <label style={labelStyle}>
                  <span style={labelTextStyle}>department</span>
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="예: 광고3부"
                    style={inputStyle}
                  />
                </label>

                <label style={labelStyle}>
                  <span style={labelTextStyle}>team</span>
                  <input
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    placeholder="예: 8팀"
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>

            <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={registerFromInvite}
                disabled={!canSubmit}
                style={{
                  ...primaryButtonStyle,
                  opacity: canSubmit ? 1 : 0.5,
                  cursor: canSubmit ? "pointer" : "default",
                }}
              >
                {submitting ? "가입 처리 중..." : "가입하기"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/login")}
                style={secondaryButtonStyle}
              >
                취소
              </button>
            </div>

            <div style={{ marginTop: 14, fontSize: 12, color: "#6b7280" }}>
              workspace_id: <b>{invite.workspace_id}</b>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f7f7f8",
  padding: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 760,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  padding: "0 12px",
  outline: "none",
  background: "#fff",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 44,
  padding: "0 18px",
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 44,
  padding: "0 18px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
};