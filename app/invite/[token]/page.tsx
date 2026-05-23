"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";

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

function asText(v: any) {
  return String(v ?? "").trim();
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();

  const token = useMemo(() => asText(params?.token), [params?.token]);

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");

  async function loadInvite() {
    if (!token) {
      setError("초대 토큰이 없습니다.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data } = await supabase.auth.getSession();
      setSessionEmail(data?.session?.user?.email ?? "");

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

      setInvite(json.invite);
    } catch (e: any) {
      setError(e?.message || "초대 정보를 불러오는 중 오류가 발생했습니다.");
      setInvite(null);
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvite() {
    if (!token) return;

    setAccepting(true);
    setError("");

    try {
      const res = await authFetch("/api/workspace-invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const json = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !json?.ok) {
        setError(json?.detail || json?.error || "초대를 수락하지 못했습니다.");
        return;
      }

      const workspaceId = json.workspace_id || invite?.workspace_id || "";

      if (workspaceId) {
        router.push(`/report-builder?workspace_id=${encodeURIComponent(workspaceId)}`);
        return;
      }

      router.push("/report-builder");
    } catch (e: any) {
      setError(e?.message || "초대 수락 중 오류가 발생했습니다.");
    } finally {
      setAccepting(false);
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
          Nature Report workspace 초대
        </div>

        <div style={{ marginTop: 8, fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
          초대받은 이메일로 로그인한 뒤 workspace에 참여할 수 있습니다.
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
            }}
          >
            {error}
          </div>
        ) : null}

        {invite ? (
          <div
            style={{
              marginTop: 20,
              display: "grid",
              gap: 10,
              fontSize: 14,
              color: "#374151",
            }}
          >
            <div>
              초대 이메일: <b>{invite.email}</b>
            </div>
            <div>
              역할: <b>{invite.role}</b>
            </div>
            <div>
              상태: <b>{invite.status}</b>
            </div>
            <div>
              workspace_id: <b>{invite.workspace_id}</b>
            </div>
            {invite.expires_at ? (
              <div>
                만료일: <b>{new Date(invite.expires_at).toLocaleString()}</b>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!sessionEmail ? (
            <button
              type="button"
              onClick={() => router.push(`/login?next=/invite/${encodeURIComponent(token)}`)}
              style={primaryButtonStyle}
            >
              로그인 후 수락
            </button>
          ) : (
            <button
              type="button"
              onClick={acceptInvite}
              disabled={accepting || !invite || invite.status !== "pending"}
              style={{
                ...primaryButtonStyle,
                opacity: accepting || !invite || invite.status !== "pending" ? 0.5 : 1,
                cursor:
                  accepting || !invite || invite.status !== "pending"
                    ? "default"
                    : "pointer",
              }}
            >
              {accepting ? "수락 중..." : "초대 수락"}
            </button>
          )}

          <button type="button" onClick={() => router.push("/report-builder")} style={secondaryButtonStyle}>
            report-builder로 이동
          </button>
        </div>

        {sessionEmail ? (
          <div style={{ marginTop: 14, fontSize: 12, color: "#6b7280" }}>
            현재 로그인 이메일: <b>{sessionEmail}</b>
          </div>
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
  maxWidth: 680,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 44,
  padding: "0 18px",
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
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