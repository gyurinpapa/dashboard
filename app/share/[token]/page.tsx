// app/share/[token]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ReportTemplate from "@/app/components/ReportTemplate";

type ReportRow = {
  id: string;
  title: string;
  status: "draft" | "ready" | "archived";
  meta: any;
  share_token?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  advertiser_id?: string | null;
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
  const [rows, setRows] = useState<any[]>([]);
  const [creativesMap, setCreativesMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  // ✅ ReportTemplate 내부 memo/state가 이전 데이터에 묶이지 않도록 “버전 키”를 만든다
  // - report.updated_at (있으면 최우선)
  // - rows length / creatives count로도 변화를 감지
  const versionKey = useMemo(() => {
    const id = report?.id ?? "no-report";
    const u = (report as any)?.updated_at ?? "";
    const rowsCnt = rows?.length ?? 0;
    const cCnt = Object.keys(creativesMap || {}).length;
    return `${id}:${u}:${rowsCnt}:${cCnt}`;
  }, [report, rows, creativesMap]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");
        setReport(null);
        setRows([]);
        setCreativesMap({});

        if (!token) {
          setError("잘못된 공유 링크입니다. (token 없음)");
          setLoading(false);
          return;
        }

        // ✅ cache bust (브라우저/프록시/CDN 캐시까지 확실히 차단)
        const bust = Date.now();
        const res = await fetch(
          `/api/share/${encodeURIComponent(token)}?t=${bust}`,
          { cache: "no-store" }
        );
        const json = await safeReadJson(res);

        if (!alive) return;

        if (!res.ok || !json?.ok) {
          setError(json?.error || "공유 리포트 조회 실패");
          setLoading(false);
          return;
        }

        const r = json.report as ReportRow;

        if (r?.status !== "ready") {
          setError("아직 공개되지 않은 리포트입니다. (status != ready)");
          setLoading(false);
          return;
        }

        const rowsArr = Array.isArray(json.rows) ? json.rows : [];

        // ✅ creativesMapNormalized(있으면 최우선) → creativesMap → creatives[]
        const cmap =
          (json.creativesMapNormalized &&
          typeof json.creativesMapNormalized === "object"
            ? json.creativesMapNormalized
            : null) ??
          (json.creativesMap && typeof json.creativesMap === "object"
            ? json.creativesMap
            : null) ??
          (Array.isArray(json.creatives)
            ? Object.fromEntries(
                json.creatives
                  .map((c: any) => [
                    String(c?.creative_key ?? "").trim(),
                    String(c?.signed_url ?? "").trim(),
                  ])
                  .filter(([k, u]: any[]) => k && u)
              )
            : {}) ??
          {};

        setReport(r);
        setRows(rowsArr);
        setCreativesMap(cmap);
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
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          공유 리포트
        </h1>
        <div
          style={{
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="p-6" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <ReportTemplate
        key={versionKey}
        rows={rows}
        isLoading={false}
        creativesMap={creativesMap}
      />
      <div className="mt-2 text-xs text-gray-500">
        rows: {rows.length}개 / creatives: {Object.keys(creativesMap || {}).length}
        개
      </div>
    </main>
  );
}