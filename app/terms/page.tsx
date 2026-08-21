import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Etrylue Performance",
  description: "Terms of Service for Etrylue Performance.",
};

export default function TermsPage() {
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
              fontSize: "clamp(32px, 6vw, 48px)",
              lineHeight: 1.15,
              letterSpacing: "-0.04em",
            }}
          >
            Terms of Service
          </h1>

          <p
            style={{
              margin: "16px 0 0",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            Last updated: August 20, 2026
          </p>
        </header>

        <TermsSection title="1. Service">
          Etrylue Performance provides advertising performance reporting,
          analytics, aggregation, filtering, and related reporting tools.
          Certain features may allow authorized users to connect third-party
          advertising platforms such as Google Ads.
        </TermsSection>

        <TermsSection title="2. Authorized account access">
          You may connect only advertising accounts that you own or are
          authorized to access. You are responsible for maintaining the
          security of your account credentials and for ensuring that your use
          of connected advertising data is authorized and lawful.
        </TermsSection>

        <TermsSection title="3. Google Ads integration">
          When you authorize Google Ads access, Etrylue Performance may use the
          Google Ads API to verify the connected account and retrieve
          advertising performance data for reporting and analytics. Etrylue
          Performance does not use the Google Ads API to create, edit, or
          delete campaigns, ad groups, ads, keywords, bids, or budgets.
        </TermsSection>

        <TermsSection title="4. Acceptable use">
          You may not use the service to gain unauthorized access to another
          person&apos;s account, interfere with the service, circumvent
          security controls, violate applicable law, or misuse information
          obtained through connected advertising platforms.
        </TermsSection>

        <TermsSection title="5. Data and reporting">
          Advertising data may originate from third-party platforms and may be
          delayed, incomplete, corrected, or otherwise affected by those
          platforms. Etrylue Performance is intended to assist with reporting
          and analysis and does not guarantee that every third-party data point
          will always be uninterrupted or error-free.
        </TermsSection>

        <TermsSection title="6. Availability and changes">
          Features may be updated, improved, suspended, or changed as the
          service evolves or as third-party APIs and platform requirements
          change. Reasonable efforts are made to maintain service continuity
          and protect existing user data and reporting behavior.
        </TermsSection>

        <TermsSection title="7. Third-party services">
          Use of connected services such as Google Ads is also subject to the
          terms, policies, and technical requirements of those third-party
          providers. Etrylue Performance does not control the availability or
          operation of third-party platforms.
        </TermsSection>

        <TermsSection title="8. Intellectual property">
          Etrylue Performance, its software, interface, and original service
          materials remain protected by applicable intellectual property laws.
          These Terms do not transfer ownership of the service or its software
          to users.
        </TermsSection>

        <TermsSection title="9. Disclaimer">
          The service is provided for advertising reporting and analytical
          purposes. Decisions made using reports or analytical outputs remain
          the responsibility of the user.
        </TermsSection>

        <TermsSection title="10. Changes to these terms">
          These Terms may be updated as the service, applicable requirements,
          or supported integrations change. The latest version will be
          published on this page with an updated revision date.
        </TermsSection>

        <TermsSection title="11. Contact">
          Questions about these Terms may be sent to
          {" "}
          <a
            href="mailto:etrylue3479@gmail.com"
            style={{ color: "#315f86", fontWeight: 700 }}
          >
            etrylue3479@gmail.com
          </a>
          .
        </TermsSection>

        <footer
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 40,
            paddingTop: 28,
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <a
            href="/about"
            style={{
              color: "#315f86",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Etrylue Performance
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
        </footer>
      </article>
    </main>
  );
}

function TermsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2
        style={{
          margin: "0 0 10px",
          fontSize: 20,
          lineHeight: 1.4,
        }}
      >
        {title}
      </h2>

      <p
        style={{
          margin: 0,
          color: "#475569",
          fontSize: 16,
          lineHeight: 1.85,
        }}
      >
        {children}
      </p>
    </section>
  );
}
