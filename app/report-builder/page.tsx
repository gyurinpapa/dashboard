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
  period_start?: string | null;
  period_end?: string | null;
};

async function safeReadJson(res: Response) {
  const text = await res.text(); // ✅ 먼저 text로 받기
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

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [types, setTypes] = useState<ReportType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // 1) 현재 로그인 상태 읽기
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2) 로그인되어 있으면 report_types 불러오기
  useEffect(() => {
    if (!userId) {
      setTypes([]);
      return;
    }

    (async () => {
      setLoadingTypes(true);
      setMsg("");
      const { data, error } = await supabase
        .from("report_types")
        .select("id,key,name")
        .order("name", { ascending: true });

      if (error) setMsg(`report_types 조회 실패: ${error.message}`);
      else setTypes((data ?? []) as ReportType[]);

      setLoadingTypes(false);
    })();
  }, [userId]);

  // 3) workspace_id 1개 가져오기
  useEffect(() => {
    if (!userId) {
      setWorkspaceId(null);
      return;
    }
    (async () => {
      const { data: wm, error } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !wm) {
        setWorkspaceId(null);
        setMsg(
          `workspace_members 조회 실패: ${error?.message ?? "소속 workspace 없음"}`
        );
        return;
      }
      setWorkspaceId(wm.workspace_id);
    })();
  }, [userId]);

  async function signIn() {
    setMsg("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setMsg(`로그인 실패: ${error.message}`);
    else setUserId(data.user?.id ?? null);
  }

  async function signOut() {
    setMsg("");
    const { error } = await supabase.auth.signOut();
    if (error) setMsg(`로그아웃 실패: ${error.message}`);
    setUserId(null);
    setWorkspaceId(null);
    setReports([]);
  }

  async function fetchReports() {
    if (!workspaceId) {
      setMsg("workspace_id가 없어. workspace_members부터 확인해줘.");
      return;
    }

    setLoadingReports(true);
    setMsg("");

    const res = await fetch(
      `/api/reports/list?workspace_id=${workspaceId}&limit=50`,
      {
        credentials: "include", // ✅ 추가
      }
    );
    const json = await safeReadJson(res);

    if ((json as any).__nonjson) {
      setMsg(
        `목록 조회 응답이 JSON이 아님 (status ${(json as any).status}).\n` +
          String((json as any).text).slice(0, 400)
      );
      setLoadingReports(false);
      return;
    }

    if (!res.ok || !(json as any).ok) {
      setMsg(
        `목록 조회 실패(${res.status}): ${(json as any).error ?? "unknown error"}`
      );
      setLoadingReports(false);
      return;
    }

    setReports(((json as any).reports ?? []) as ReportRow[]);
    setLoadingReports(false);
  }

  async function createReport(type: ReportType) {
    if (!workspaceId) {
      setMsg("workspace_id가 없어. workspace_members부터 확인해줘.");
      return;
    }
    if (creating) return;

    setCreating(true);
    setMsg("");

    const title = `${type.name} - Draft`;

    const res = await fetch("/api/reports/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // ✅ 추가
      body: JSON.stringify({
        workspace_id: workspaceId,
        report_type_id: type.id,
        title,
        meta: {},
        status: "draft",
      }),
    });

    const json = await safeReadJson(res);

    if ((json as any).__nonjson) {
      setMsg(
        `report 생성 응답이 JSON이 아님 (status ${(json as any).status}).\n` +
          String((json as any).text).slice(0, 400)
      );
      setCreating(false);
      return;
    }

    if (!res.ok || !(json as any).ok) {
      setMsg(
        `report 생성 실패(${res.status}): ${(json as any).error ?? "unknown error"}`
      );
      setCreating(false);
      return;
    }

    const reportId = (json as any).report?.id as string | undefined;
    if (!reportId) {
      setMsg("report 생성은 성공했는데 id가 없어. 응답 포맷 확인 필요");
      setCreating(false);
      return;
    }

    setMsg(`✅ report 생성됨: ${reportId}`);
    setCreating(false);

    // 목록 갱신 + 상세 이동
    await fetchReports();
    router.push(`/reports/${reportId}`);
  }

  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 1000,
    padding: 24,
  };

  return (
    <main style={{ display: "flex", justifyContent: "center" }}>
      <div style={containerStyle}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Report Builder</h1>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            로그인 상태: {userId ? "로그인됨" : "로그아웃"}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              style={{
                padding: 8,
                border: "1px solid #ccc",
                borderRadius: 8,
                minWidth: 260,
              }}
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              type="password"
              style={{
                padding: 8,
                border: "1px solid #ccc",
                borderRadius: 8,
                minWidth: 220,
              }}
            />
            <button onClick={signIn} style={{ padding: "8px 12px" }}>
              로그인
            </button>
            <button onClick={signOut} style={{ padding: "8px 12px" }}>
              로그아웃
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
            workspace_id: {workspaceId ?? "(없음)"}
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button
              onClick={fetchReports}
              style={{ padding: "8px 12px" }}
              disabled={!workspaceId}
            >
              reports list test
            </button>
          </div>

          {msg && (
            <pre
              style={{
                marginTop: 10,
                whiteSpace: "pre-wrap",
                background: "#fafafa",
                border: "1px solid #eee",
                padding: 10,
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              {msg}
            </pre>
          )}
        </div>

        <section style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>보고서 유형 선택</h2>
          {!userId && (
            <p style={{ marginTop: 8 }}>먼저 로그인하면 유형이 보입니다.</p>
          )}
          {userId && loadingTypes && <p style={{ marginTop: 8 }}>불러오는 중...</p>}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            {types.map((t) => (
              <button
                key={t.id}
                onClick={() => createReport(t)}
                disabled={!workspaceId || creating}
                style={{
                  textAlign: "left",
                  padding: 14,
                  border: "1px solid #ddd",
                  borderRadius: 14,
                  background: "white",
                  cursor: creating ? "wait" : "pointer",
                  opacity: !workspaceId || creating ? 0.6 : 1,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 16 }}>{t.name}</div>
                <div style={{ opacity: 0.7, marginTop: 4 }}>key: {t.key}</div>
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                  클릭하면 draft report 1개 생성(API 사용)
                </div>
                {creating && (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                    생성 중...
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>내 리포트 목록</h2>
          <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>
            (reports list test 버튼 누르면 로드)
          </div>

          {loadingReports && <p style={{ marginTop: 10 }}>불러오는 중...</p>}

          {!loadingReports && reports.length === 0 && (
            <p style={{ marginTop: 10, opacity: 0.7 }}>아직 목록이 없습니다.</p>
          )}

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/reports/${r.id}`)}
                style={{
                  textAlign: "left",
                  padding: 14,
                  border: "1px solid #eee",
                  borderRadius: 14,
                  background: "white",
                }}
              >
                <div style={{ fontWeight: 800 }}>{r.title}</div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                  status: {r.status} · created: {r.created_at ?? "-"}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}