// app/share/[token]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type UploadCsvInfo = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  uploaded_at: string;
};

type UploadImageInfo = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  uploaded_at: string;
};

type ReportRow = {
  id: string;
  title: string;
  status: "draft" | "ready" | "archived";
  meta: any;
  share_token?: string | null;
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

function ensureUpload(meta: any) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (!m.upload || typeof m.upload !== "object") m.upload = {};
  if (!Array.isArray(m.upload.images)) m.upload.images = [];
  return m;
}

export default function ShareReportPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [error, setError] = useState<string>("");

  const [imgUrlMap, setImgUrlMap] = useState<Record<string, string>>({});
  const [csvUrl, setCsvUrl] = useState<string>("");

  const meta = useMemo(() => ensureUpload(report?.meta), [report]);
  const csv: UploadCsvInfo | null = meta?.upload?.csv || null;
  const images: UploadImageInfo[] = meta?.upload?.images || [];

  // ✅ 1) 공개 리포트 조회
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");
        setReport(null);

        if (!token || typeof token !== "string") {
          setError("잘못된 공유 링크입니다. (token 없음)");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/reports/share/${token}`, { cache: "no-store" });
        const json = await safeReadJson(res);

        // ✅ json은 여기서만 존재 → 여기서만 로그
        console.log("SHARE API JSON =", json);

        if (!res.ok || !json?.ok) {
          setError(json?.error || "공유 리포트 조회 실패");
          setLoading(false);
          return;
        }

        if (!alive) return;
        setReport(json.report as ReportRow);
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

  // ✅ 2) 공개 signed url 생성 유틸
  async function getPublicSignedUrl(bucket: string, path: string) {
    if (!token) return null;

    const res = await fetch("/api/uploads/signed-url-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, bucket, path }),
    });

    const json = await safeReadJson(res);
    if (!res.ok || !json?.ok) return null;
    return (json.url as string) || null;
  }

  // ✅ 3) CSV/이미지 signed url 로딩
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!report) return;

      // CSV
      if (csv && !csvUrl) {
        const url = await getPublicSignedUrl(csv.bucket, csv.path);
        if (alive && url) setCsvUrl(url);
      }

      // Images
      const need = images.filter((it) => !imgUrlMap[it.path]);
      for (const it of need) {
        const url = await getPublicSignedUrl(it.bucket, it.path);
        if (!alive) return;
        if (url) setImgUrlMap((prev) => ({ ...prev, [it.path]: url }));
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;

  if (error) {
    return (
      <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>공유 리포트</h1>
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fafafa" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ padding: 16 }}>
        <div>Report not found</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
        {report.title || "Report"} <span style={{ opacity: 0.6 }}>- Shared</span>
      </h1>

      <div style={{ marginBottom: 14, opacity: 0.85 }}>
        상태: <b>{report.status}</b>
      </div>

      {/* ✅ 디버그: meta.upload 확인용 (문제 해결 후 삭제해도 됨) */}
      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: "pointer" }}>DEBUG: report.meta.upload 보기</summary>
        <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: 12, borderRadius: 10, border: "1px solid #eee" }}>
          {JSON.stringify(meta?.upload ?? null, null, 2)}
        </pre>
      </details>

      {/* CSV */}
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>CSV</div>
        {csv ? (
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}>
              파일: <b>{csv.name}</b> ({(csv.size || 0).toLocaleString()} bytes)
            </div>
            {csvUrl ? (
              <a href={csvUrl} target="_blank" rel="noreferrer">
                CSV 열기(새 탭)
              </a>
            ) : (
              <div style={{ opacity: 0.7 }}>CSV 링크 생성 중...</div>
            )}
          </div>
        ) : (
          <div style={{ opacity: 0.7, fontSize: 13 }}>CSV가 없습니다.</div>
        )}
      </section>

      {/* Images */}
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>이미지</div>

        {images.length ? (
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {images
              .slice()
              .reverse()
              .map((it) => {
                const url = imgUrlMap[it.path];
                return (
                  <div
                    key={it.path}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <a
                      href={url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "block",
                        width: "100%",
                        aspectRatio: "4 / 3",
                        background: "#f5f5f5",
                        pointerEvents: url ? "auto" : "none",
                      }}
                      title="새 탭에서 열기"
                    >
                      {url ? (
                        <img
                          src={url}
                          alt={it.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            opacity: 0.7,
                          }}
                        >
                          loading...
                        </div>
                      )}
                    </a>

                    <div style={{ padding: 10 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginBottom: 6,
                        }}
                        title={it.name}
                      >
                        {it.name}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        {(it.size || 0).toLocaleString()} bytes
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>업로드된 이미지가 없습니다.</div>
        )}
      </section>
    </div>
  );
}