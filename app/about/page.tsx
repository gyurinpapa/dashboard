import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "서비스 소개 | Etrylue Performance",
  description:
    "광고대행사와 인하우스 마케터를 위한 광고 성과 리포트 플랫폼. CSV와 지원되는 매체 API 데이터를 정리하고, 트래픽·DB 획득·커머스 리포트를 만들어 공유합니다.",
  alternates: { canonical: "https://www.etrylue.com/about" },
};

export default function AboutPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f8fa",
        color: "#1f2937",
        padding: "48px 20px",
        wordBreak: "keep-all",
        overflowWrap: "anywhere",
      }}
    >
      <article
        style={{
          width: "100%",
          maxWidth: 860,
          margin: "0 auto",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          padding: "clamp(28px, 5vw, 56px)",
          boxShadow: "0 12px 40px rgba(15, 23, 42, 0.06)",
        }}
      >
        <header style={{ marginBottom: 40 }}>
          <p
            style={{
              margin: "0 0 12px",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            ETRYLUE PERFORMANCE
          </p>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(32px, 6vw, 52px)",
              lineHeight: 1.1,
              letterSpacing: "-0.04em",
            }}
          >
            광고 데이터를 판단과 공유로 연결합니다
          </h1>

          <p
            style={{
              margin: "24px 0 0",
              color: "#475569",
              fontSize: 18,
              lineHeight: 1.75,
            }}
          >
            Etrylue Performance는 광고대행사와 인하우스 마케터를 위한 광고 성과
            리포트 플랫폼입니다. 흩어진 광고 데이터를 같은 기준으로 정리하고,
            목표와 실제 성과를 비교해 팀과 고객에게 전달할 수 있습니다.
          </p>
        </header>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 22, lineHeight: 1.4 }}>
            데이터 입력
          </h2>
          <p style={{ margin: 0, color: "#475569", fontSize: 16, lineHeight: 1.8 }}>
            CSV 파일 업로드 또는 지원되는 매체의 API 연결로 데이터를 입력합니다. API 이용 가능 여부와 수집 범위는 매체별 지원 상태, 계정 연결 및 승인된 권한에 따라 달라집니다.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 22, lineHeight: 1.4 }}>
            목적별 리포트
          </h2>
          <p style={{ margin: 0, color: "#475569", fontSize: 16, lineHeight: 1.8 }}>
            방문 유입을 보는 트래픽, 상담·문의 전환을 보는 DB 획득, 매출과 광고수익률을 보는 커머스 리포트를 제공합니다.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 22, lineHeight: 1.4 }}>
            발행과 공유
          </h2>
          <p style={{ margin: 0, color: "#475569", fontSize: 16, lineHeight: 1.8 }}>
            발행한 리포트를 공개 URL로 공유하거나 PDF·PPT로 내보낼 수 있습니다. 대행사 유형 워크스페이스에서는 기업 로고와 리포트 브랜딩을 적용할 수 있습니다.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: 22,
              lineHeight: 1.4,
            }}
          >
            Google Ads integration
          </h2>

          <p
            style={{
              margin: 0,
              color: "#475569",
              fontSize: 16,
              lineHeight: 1.8,
            }}
          >
            Authorized users may connect Google Ads accounts through Google
            OAuth 2.0. Etrylue Performance uses Google Ads API access for
            reporting and analytics, including account verification,
            performance reporting, aggregation, filtering, and analytical
            insights.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: 22,
              lineHeight: 1.4,
            }}
          >
            Reporting-only product scope
          </h2>

          <p
            style={{
              margin: 0,
              color: "#475569",
              fontSize: 16,
              lineHeight: 1.8,
            }}
          >
            Etrylue Performance does not use the Google Ads API to create,
            edit, or delete campaigns, ad groups, ads, keywords, bids, or
            budgets. Google Ads API access is used for reporting and analytics
            for accounts the user owns or is authorized to access.
          </p>
        </section>

        <section
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            paddingTop: 28,
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <a
            href="https://www.etrylue.com/"
            style={{
              color: "#315f86",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            홈페이지
          </a>

          <span aria-hidden="true" style={{ color: "#cbd5e1" }}>
            ·
          </span>

          <a
            href="/privacy"
            style={{
              color: "#315f86",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Privacy Policy
          </a>

          <span aria-hidden="true" style={{ color: "#cbd5e1" }}>
            ·
          </span>

          <a
            href="/terms"
            style={{
              color: "#315f86",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Terms of Service
          </a>

          <span aria-hidden="true" style={{ color: "#cbd5e1" }}>
            ·
          </span>

          <a
            href="mailto:etrylue3479@gmail.com"
            style={{
              color: "#315f86",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Contact
          </a>
        </section>
      </article>
    </main>
  );
}
