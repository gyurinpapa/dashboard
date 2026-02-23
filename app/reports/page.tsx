"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type ReportRow = {
  id: string;
  title: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
};

export default function ReportsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // 1) 로그인 상태
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // 2) 내 workspace 1개 가져오기
  useEffect(() => {
    if (!userId) {
      setWorkspaceId(null);
      return;
    }

    (async () => {
      setMsg("");
      const { data: wm, error } = await supabase
        .from("workspace_members")
        .select("id, title, status, created_at, workspace_id, created_by, report_type_id, meta, period_start, period_end")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !wm?.workspace_id) {
        setWorkspaceId(null);
        setMsg(`workspace 조회 실패: ${error?.message ?? "소속 workspace 없음"}`);
      } else {
        setWorkspaceId(wm.workspace_id);
      }
    })();
  }, [userId]);

  async function loadReports() {
  if (!workspaceId) {
    setMsg("workspace_id가 없어. 먼저 로그인/워크스페이스를 확인해줘.");
    return;
  }

  setLoading(true);
  setMsg("");

  try {
    const res = await fetch(`/api/reports/list?workspace_id=${workspaceId}`);

    // ✅ JSON 파싱 전에 원문 텍스트를 먼저 읽는다
    const text = await res.text();
    console.log("LIST raw status:", res.status);
    console.log("LIST raw text:", text);

    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (e) {
      json = null;
    }

    if (!res.ok) {
      setReports([]);
      setMsg(`목록 조회 실패(${res.status}): ${json?.error ?? text ?? "empty response"}`);
      return;
    }

    setReports((json?.reports ?? []) as ReportRow[]);
  } catch (e: any) {
    setMsg(`목록 조회 예외: ${e?.message ?? String(e)}`);
  } finally {
    setLoading(false);
  }
}

  // workspaceId 생기면 자동 로드
  useEffect(() => {
    if (workspaceId) loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Reports</h1>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
        user: {userId ?? "(none)"} <br />
        workspace: {workspaceId ?? "(none)"}
      </div>

      {msg && <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{msg}</p>}

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          onClick={loadReports}
          disabled={!workspaceId || loading}
          style={{ padding: "8px 12px" }}
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>

        <button
          onClick={() => router.push("/report-builder")}
          style={{ padding: "8px 12px" }}
        >
          + 새 리포트 만들기
        </button>
      </div>

      <section style={{ marginTop: 16 }}>
        {reports.length === 0 && !loading && (
          <p style={{ opacity: 0.8 }}>리포트가 없거나 아직 불러오지 못했어.</p>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/reports/${r.id}`)}
              style={{
                textAlign: "left",
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 12,
                background: "white",
              }}
            >
              <div style={{ fontWeight: 700 }}>{r.title}</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                status: {r.status} · created:{" "}
                {new Date(r.created_at).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}