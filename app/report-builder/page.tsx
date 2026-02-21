"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type ReportType = {
  id: string;
  key: string;
  name: string;
};

export default function ReportBuilderPage() {
  const router = useRouter();

  const [email, setEmail] = useState("test@test.com");
  const [password, setPassword] = useState("12345678");
  const [userId, setUserId] = useState<string | null>(null);

  const [types, setTypes] = useState<ReportType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
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
  }

  async function createReport(type: ReportType) {
    if (!userId) {
      setMsg("먼저 로그인 해줘.");
      return;
    }
    if (creating) return;

    setCreating(true);
    setMsg("");

    // 1) 내가 속한 workspace 1개 가져오기 (workspace_members 기준)
    const { data: wm, error: wmErr } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (wmErr || !wm) {
      setMsg(`workspace_members 조회 실패: ${wmErr?.message ?? "소속 workspace 없음"}`);
      setCreating(false);
      return;
    }

    const workspaceId = wm.workspace_id;
    const title = `${type.name} - Draft`;

    // 2) reports 생성
    const { data: report, error } = await supabase
      .from("reports")
      .insert({
        workspace_id: workspaceId,
        report_type_id: type.id,
        title,
        status: "draft",
        created_by: userId,
      })
      .select("id")
      .single();

    if (error) {
      setMsg(`report 생성 실패: ${error.message}`);
      setCreating(false);
      return;
    }

    // ✅ 생성 즉시 이동
    setMsg(`✅ report 생성됨: ${report.id}`);
    router.push(`/reports/${report.id}`);
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Report Builder (테스트)</h1>

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
        </div>

        {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
      </div>

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
              disabled={!userId || creating}
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
                클릭하면 draft report 1개 생성
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
    </main>
  );
}