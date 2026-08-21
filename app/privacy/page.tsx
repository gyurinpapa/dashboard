import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Etrylue Performance",
  description: "Privacy Policy for Etrylue Performance.",
};

export default function PrivacyPage() {
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
            Privacy Policy
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

        <PolicySection title="1. Overview">
          Etrylue Performance is an advertising performance reporting and
          analytics service. This Privacy Policy explains how information is
          handled when users access Etrylue Performance or connect advertising
          accounts, including Google Ads accounts.
        </PolicySection>

        <PolicySection title="2. Information we process">
          We may process account and workspace information required to operate
          the service, connection information for advertising platforms, and
          advertising performance data that an authorized user chooses to
          connect. For Google Ads, this may include Google Ads customer account
          identifiers, account metadata, campaign and advertising performance
          metrics, and OAuth credentials required to maintain an authorized
          connection.
        </PolicySection>

        <PolicySection title="3. How Google user data is used">
          Information received from Google APIs is used only to provide
          user-facing Etrylue Performance features, including verifying an
          authorized Google Ads account, retrieving advertising performance
          data, producing reports, aggregating and filtering results, and
          generating analytical insights requested through the service.
        </PolicySection>

        <PolicySection title="4. Google Ads API scope">
          Etrylue Performance uses Google Ads API access for reporting and
          analytics. The service does not use the Google Ads API to create,
          edit, or delete campaigns, ad groups, ads, keywords, bids, or
          budgets.
        </PolicySection>

        <PolicySection title="5. Storage and protection">
          Etrylue Performance uses technical and organizational safeguards
          designed to protect stored connection information and advertising
          data against unauthorized access, alteration, disclosure, or
          destruction. OAuth access tokens may be handled temporarily when
          communicating with Google APIs. Persistent connection credentials,
          when required to maintain an authorized connection, are protected by
          application security controls.
        </PolicySection>

        <PolicySection title="6. Sharing and disclosure">
          Etrylue Performance does not sell Google user data. Google user data
          is not shared for advertising targeting or unrelated marketing
          purposes. Information may be processed by infrastructure or service
          providers only as necessary to operate, secure, and maintain the
          service, or when disclosure is required by applicable law.
        </PolicySection>

        <PolicySection title="7. Data retention and deletion">
          Information is retained only for as long as reasonably necessary to
          provide the service, maintain an authorized connection, satisfy
          legitimate operational requirements, or comply with applicable law.
          Users may revoke Etrylue Performance&apos;s Google authorization
          through their Google Account settings. Requests concerning deletion
          of Etrylue Performance data may be sent to the contact address below.
        </PolicySection>

        <PolicySection title="8. Google API Services User Data Policy">
          Etrylue Performance&apos;s use and transfer of information received
          from Google APIs will adhere to the Google API Services User Data
          Policy, including the Limited Use requirements where applicable.
        </PolicySection>

        <PolicySection title="9. Changes to this policy">
          This Privacy Policy may be updated when the service, legal
          requirements, or data-handling practices change. The latest version
          will be published on this page with an updated revision date.
        </PolicySection>

        <PolicySection title="10. Contact">
          For privacy questions or data requests, contact
          {" "}
          <a
            href="mailto:etrylue3479@gmail.com"
            style={{ color: "#315f86", fontWeight: 700 }}
          >
            etrylue3479@gmail.com
          </a>
          .
        </PolicySection>

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
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
            style={{
              color: "#315f86",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Google API Services User Data Policy
          </a>
        </footer>
      </article>
    </main>
  );
}

function PolicySection({
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
