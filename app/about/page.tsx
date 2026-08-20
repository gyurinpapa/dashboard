import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Etrylue Performance",
  description:
    "Advertising performance reporting and analytics for authorized Google Ads accounts.",
};

export default function AboutPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f8fa",
        color: "#1f2937",
        padding: "48px 20px",
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
            Advertising performance reporting and analytics
          </h1>

          <p
            style={{
              margin: "24px 0 0",
              color: "#475569",
              fontSize: 18,
              lineHeight: 1.75,
            }}
          >
            Etrylue Performance helps authorized users connect advertising
            accounts, review performance data, build reports, compare results,
            and generate analytical insights in one workspace.
          </p>
        </header>

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
