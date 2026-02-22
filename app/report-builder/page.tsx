"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
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
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
};

export default function ReportBuilderPage() {
  const router = useRouter();

  const [email, setEmail] = useState("test@test.com");
  const [password, setPassword] = useState("12345678");
  const [userId, setUserId] = useState<string | null>(null);

  const [types, setTypes] = useState<ReportType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const canUseApi = useMemo(() => !!userId && !!workspaceId, [userId, workspaceId]);

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

  // 3) 로그인되어 있으면 "내 workspace 1개" 가져오기 (workspace_members 기준)
  useEffect(() => {
    if (!userId) {
      setWorkspaceId(null);
      return;
    }

    (async () => {
      setLoadingWorkspace(true);
      setMsg("");

      const { data: wm, error: wmErr } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (wmErr || !wm?.workspace_id) {
        setWorkspaceId(null);
        setMsg(`workspace_members 조회 실패: ${wmErr?.message ?? "소속 workspace 없음"}`);
      } else {
        setWorkspaceId(wm.workspace_id);
      }

      setLoadingWorkspace(false);
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

  // ✅ API: reports 목록 가져오기
  async function fetchReports() {
    if (!workspaceId) {
      setMsg("workspace_id가 없어. 먼저 로그인/워크스페이스 확인!");
      return;
    }

    setLoadingReports(true);
    setMsg("");

    try {
      const res = await fetch(`/api/reports/list?workspace_id=${workspaceId}`, {
        method: "GET",
      });
      const json = await res.json();

      if (!res.ok) {
        setMsg(`reports list 실패: ${json?.error ?? "unknown error"}`);
        setReports([]);
      } else {
        setReports((json.reports ?? []) as ReportRow[]);
        setMsg(`✅ reports ${json.reports?.length ?? 0}개 로드 완료`);
      }
    } catch (e: any) {
      setMsg(`reports list 예외: ${e?.message ?? String(e)}`);
    } finally {
      setLoadingReports(false);
    }
  }

  // ✅ API: reports 생성
  async function createReport(type: ReportType) {
    if (!userId) {
      setMsg("먼저 로그인 해줘.");
      return;
    }
    if (!workspaceId) {
      setMsg("workspace_id를 못 가져왔어. workspace_members 확인해줘.");
      return;
    }
    if (creating) return;

    setCreating(true);
    setMsg("");

    const title = `${type.name} - Draft`;

    try {
      const res = await fetch("/api/reports/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          report_type_id: type.id,
          title,
          period_start: null,
          period_end: null,
          meta: {},
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMsg(`report 생성 실패(API): ${json?.error ?? "unknown error"}`);
        return;
      }

      const reportId = json?.report?.id as string | undefined;
      if (!reportId) {
        setMsg("report 생성은 됐는데 id를 못 받았어(응답 확인 필요)");
        return;
      }

      setMsg(`✅ report 생성됨: ${reportId}`);

      // 목록 갱신
      await fetchReports();

      // 생성 즉시 이동
      router.push(`/reports/${reportId}`);
    } catch (e: any) {
      setMsg(`report 생성 예외: ${e?.message ?? String(e)}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Report Builder (테스트)</h1>

      {/* 로그인 박스 */}
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            style={{
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 8,
              minWidth: 220,
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

          <div style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
            workspace_id:{" "}
            {loadingWorkspace ? "불러오는 중..." : workspaceId ? workspaceId : "(없음)"}
          </div>
        </div>

        {msg && <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{msg}</p>}

        {/* ✅ 임시 테스트 버튼: API list */}
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={fetchReports}
            disabled={!canUseApi || loadingReports}
            style={{ padding: "8px 12px" }}
          >
            {loadingReports ? "불러오는 중..." : "reports list test"}
          </button>

          <button
            onClick={async () => {
              // create API가 401 뜨면, 로그인 세션/쿠키가 안 붙는 상태일 수 있음
              setMsg(
                "Tip: create 버튼은 아래 '보고서 유형 선택'에서 하나 클릭하면 실행됨."
              );
            }}
            style={{ padding: "8px 12px" }}
          >
            create는 유형 클릭
          </button>
        </div>
      </div>

      {/* 보고서 유형 */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>보고서 유형 선택</h2>
        {!userId && <p style={{ marginTop: 8 }}>먼저 로그인하면 유형이 보여.</p>}
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
              disabled={!userId || !workspaceId || creating}
              style={{
                textAlign: "left",
                padding: 14,
                border: "1px solid #ddd",
                borderRadius: 14,
                background: "white",
                cursor: creating ? "wait" : "pointer",
                opacity: creating ? 0.7 : 1,
              }}
            >
              <div style={{ fontWeight: 700 }}>{t.name}</div>
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

      {/* 리포트 목록 */}
      <section style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>내 리포트 목록</h2>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            (reports list test 버튼 누르면 로드)
          </span>
        </div>

        {!userId && <p style={{ marginTop: 8 }}>로그인하면 목록을 불러올 수 있어.</p>}
        {userId && !workspaceId && (
          <p style={{ marginTop: 8 }}>
            workspace_members에서 workspace_id를 못 가져왔어.
          </p>
        )}

        {reports.length > 0 && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/reports/${r.id}`)}
                style={{
                  textAlign: "left",
                  padding: 12,
                  border: "1px solid #eee",
                  borderRadius: 12,
                  background: "white",
                }}
              >
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                  status: {r.status} · created_at: {new Date(r.created_at).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}

        {reports.length === 0 && userId && (
          <p style={{ marginTop: 10, opacity: 0.8 }}>
            아직 목록이 비어있어. (list 버튼을 눌러 로드해봐)
          </p>
        )}
      </section>
    </main>
  );
}