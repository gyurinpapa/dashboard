// app/report-builder/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase/client";
import { useRouter } from "next/navigation";

type ReportType = {
  id: string;
  key: string;
  name: string;
};

type ReportRow = {
  id: string;
  title: string;
  status: string;
  created_at?: string;
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

export default function ReportBuilderPage() {
  const router = useRouter();

  const [email, setEmail] = useState("test@test.com");
  const [password, setPassword] = useState("12345678");

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [types, setTypes] = useState<ReportType[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const [creating, setCreating] = useState(false);

  /* ---------------- auth ---------------- */

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

  /* ---------------- workspace ---------------- */

  useEffect(() => {
    if (!userId) {
      setWorkspaceId(null);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      setWorkspaceId(data?.workspace_id ?? null);
    })();
  }, [userId]);

  /* ---------------- report types ---------------- */

  useEffect(() => {
    if (!userId) {
      setTypes([]);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("report_types")
        .select("id,key,name")
        .order("name");

      setTypes((data ?? []) as ReportType[]);
    })();
  }, [userId]);

  /* ---------------- reports ---------------- */

  useEffect(() => {
    if (!workspaceId) return;
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  async function fetchReports() {
    if (!workspaceId) return;

    const token = await getAccessToken();
    if (!token) {
      // 로그인 UI는 userId로 보일 수 있는데, 세션 토큰이 아직 없으면 서버 API가 무조건 401
      // 구조는 유지하되 안전하게 중단
      return;
    }

    const res = await fetch(
      `/api/reports/list?workspace_id=${workspaceId}&limit=50`,
      {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const json = await safeReadJson(res);
    if (!res.ok || !(json as any).ok) {
      // 필요하면 콘솔로만 확인 (UI/구조 영향 없음)
      // eslint-disable-next-line no-console
      console.warn("[reports/list] failed", res.status, json);
      return;
    }

    setReports(((json as any).reports ?? []) as ReportRow[]);
  }

  /* ---------------- actions ---------------- */

  async function signIn() {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return;

    setUserId(data.user?.id ?? null);
    setUserEmail(data.user?.email ?? null);

    // ✅ 로그인 직후 token null 방지용(세션이 늦게 세팅되는 케이스 대비)
    await supabase.auth.getSession();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail(null);
    setWorkspaceId(null);
    setReports([]);
  }

  async function createReport(type: ReportType) {
    if (!workspaceId || creating) return;

    setCreating(true);

    const token = await getAccessToken();
    if (!token) {
      setCreating(false);
      return;
    }

    const res = await fetch("/api/reports/create", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        report_type_id: type.id,
        title: `${type.name} - Draft`,
        meta: {},
        status: "draft",
      }),
    });

    const json = await safeReadJson(res);

    // 너 API 응답 형태가 { report: { id } } 인 것으로 유지
    const reportId = (json as any)?.report?.id;

    setCreating(false);

    if (!res.ok || !reportId) {
      // eslint-disable-next-line no-console
      console.warn("[reports/create] failed", res.status, json);
      return;
    }

    await fetchReports();
    router.push(`/reports/${reportId}`);
  }

  /* ---------------- UI ---------------- */

  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 1200,
    padding: 24,
  };

  return (
    <main style={{ display: "flex", justifyContent: "center" }}>
      <div style={containerStyle}>
        {/* ---------- Header ---------- */}
        <h1
          style={{
            fontSize: 36,
            fontWeight: 900,
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          Automated Online Ads Reporting
        </h1>

        {/* ---------- Login Box ---------- */}
        <div
          style={{
            background: "#f5a62333",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 20,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          {!userId ? (
            <>
              <div style={{ width: "100%", maxWidth: 520 }}>
                <div style={{ marginBottom: 6, fontSize: 13 }}>이메일</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#eaf2ff",
                    fontSize: 18,
                  }}
                />
              </div>

              <div style={{ width: "100%", maxWidth: 520 }}>
                <div style={{ marginBottom: 6, fontSize: 13 }}>비밀번호</div>
                <input
                  value={password}
                  type="password"
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#eaf2ff",
                    fontSize: 18,
                  }}
                />
              </div>

              <button className="mainBtn" onClick={signIn}>
                로그인
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {userEmail ?? "사용자"}님 반갑습니다 👋
              </div>

              <button className="subBtn" onClick={signOut}>
                로그아웃
              </button>
            </>
          )}

          <div style={{ fontSize: 13, opacity: 0.7 }}>
            workspace_id: {workspaceId ?? "(없음)"}
          </div>
        </div>

        {/* ---------- Types ---------- */}
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>보고서 유형 선택</h2>

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
                disabled={!workspaceId || creating}
                className="typeCard"
              >
                <div style={{ fontWeight: 800, fontSize: 16 }}>{t.name}</div>
                <div style={{ marginTop: 6, opacity: 0.7 }}>key: {t.key}</div>
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
                  클릭하면 draft report 생성(API 사용)
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ---------- Reports ---------- */}
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>내 리포트 목록</h2>

          {!userId && (
            <p style={{ marginTop: 10, opacity: 0.7 }}>
              로그인하면 목록이 보입니다.
            </p>
          )}

          {userId && reports.length === 0 && (
            <p style={{ marginTop: 10, opacity: 0.7 }}>아직 목록이 없습니다.</p>
          )}

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/reports/${r.id}`)}
                className="reportItem"
              >
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div style={{ fontSize: 13, opacity: 0.6 }}>
                  {r.created_at ?? ""}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ---------- Styles ---------- */}
        <style jsx>{`
          .mainBtn {
            width: 100%;
            max-width: 520px;
            padding: 14px;
            border-radius: 14px;
            border: none;
            background: black;
            color: white;
            font-weight: 800;
            cursor: pointer;
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.15);
            transition: 0.15s;
          }

          .mainBtn:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 22px rgba(0, 0, 0, 0.18);
          }

          .subBtn {
            padding: 10px 18px;
            border-radius: 12px;
            border: 1px solid #ddd;
            background: rgba(255, 255, 255, 0.85);
            cursor: pointer;
            font-weight: 800;
            transition: 0.15s;
          }

          .subBtn:hover {
            transform: translateY(-1px);
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.08);
          }

          /* ---------- TYPE CARD ---------- */
          .typeCard {
            position: relative;
            text-align: left;
            padding: 18px;
            border-radius: 16px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            background: white;
            cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
            overflow: hidden;
          }

          /* 주황 포인트 라인 */
          .typeCard::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: #ff8800;
            transform: scaleY(0);
            transform-origin: center;
            transition: transform 0.15s ease;
          }

          .typeCard:hover::before {
            transform: scaleY(1);
          }

          .typeCard:hover:not(:disabled) {
            transform: translateY(-4px);
            box-shadow: 0 18px 30px rgba(0, 0, 0, 0.1);
            border-color: rgba(0, 0, 0, 0.18);
          }

          .typeCard:active:not(:disabled) {
            transform: translateY(-1px);
          }

          .typeCard:focus-visible {
            outline: none;
            box-shadow: 0 0 0 4px rgba(255, 136, 0, 0.3),
              0 18px 30px rgba(0, 0, 0, 0.1);
            border-color: rgba(255, 136, 0, 0.65);
          }

          /* ---------- REPORT ITEM ---------- */
          .reportItem {
            text-align: left;
            padding: 14px;
            border-radius: 12px;
            border: 1px solid #eee;
            background: white;
            cursor: pointer;
            transition: 0.15s;
          }

          .reportItem:hover {
            background: #fafafa;
          }
        `}</style>
      </div>
    </main>
  );
}