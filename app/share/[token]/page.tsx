// app/share/[token]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CommerceDashboard from "@/components/dashboard/CommerceDashboard";

type ReportRow = {
  id: string;
  title: string;
  status: "draft" | "ready" | "archived";
  meta: any;
  share_token?: string | null;
  period_start?: string | null;
  period_end?: string | null;
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

export default function ShareReportPage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => String(params?.token ?? "").trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");
        setReport(null);

        if (!token) {
          setError("잘못된 공유 링크입니다. (token 없음)");
          setLoading(false);
          return;
        }

        // ✅ 공개 API 사용
        const res = await fetch(`/api/reports/share/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const json = await safeReadJson(res);

        if (!res.ok || !json?.ok) {
          setError(json?.error || "공유 리포트 조회 실패");
          setLoading(false);
          return;
        }

        if (!alive) return;

        const r = json.report as ReportRow;
        if (r?.status !== "ready") {
          setError("아직 공개되지 않은 리포트입니다. (status != ready)");
          setLoading(false);
          return;
        }

        setReport(r);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Unknown error");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  if (loading) return <main className="p-6">Loading...</main>;

  if (error) {
    return (
      <main className="p-6" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>공유 리포트</h1>
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fafafa" }}>
          {error}
        </div>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="p-6">
        <div>Report not found</div>
      </main>
    );
  }

  return (
    <main className="p-6" style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* ✅ shareToken을 그대로 전달 (하위가 /api/uploads/signed-url 호출 시 body에 shareToken 넣도록 하면 됨) */}
      <CommerceDashboard />
    </main>
  );
}