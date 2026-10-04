import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | Etrylue Performance",
  description: "Etrylue Performance의 계정·광고 데이터 처리, Google API 데이터 이용, 보관 및 삭제 요청에 관한 개인정보처리방침입니다.",
  alternates: { canonical: "https://www.etrylue.com/privacy" },
};

export default function PrivacyPage() {
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
              fontSize: "clamp(32px, 6vw, 48px)",
              lineHeight: 1.15,
              letterSpacing: "-0.04em",
            }}
          >
            개인정보처리방침 / Privacy Policy
          </h1>

          <p
            style={{
              margin: "16px 0 0",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            Last updated: August 20, 2026
            <br />
            한국어 번역 추가: 2026년 10월 4일
          </p>
        </header>

        <PolicySection title="1. Overview" koreanTitle="1. 개요" koreanText="Etrylue Performance는 광고 성과 보고 및 분석 서비스입니다. 이 개인정보처리방침은 이용자가 서비스를 이용하거나 Google Ads를 포함한 광고 계정을 연결할 때 정보가 어떻게 처리되는지 설명합니다.">
          Etrylue Performance is an advertising performance reporting and
          analytics service. This Privacy Policy explains how information is
          handled when users access Etrylue Performance or connect advertising
          accounts, including Google Ads accounts.
        </PolicySection>

        <PolicySection title="2. Information we process" koreanTitle="2. 처리하는 정보" koreanText="서비스 운영에 필요한 계정 및 워크스페이스 정보, 광고 플랫폼 연결 정보, 권한 있는 이용자가 연결하기로 선택한 광고 성과 데이터를 처리할 수 있습니다. Google Ads의 경우 고객 계정 식별자, 계정 메타데이터, 캠페인 및 광고 성과 지표, 승인된 연결을 유지하는 데 필요한 OAuth 인증 정보가 포함될 수 있습니다.">
          We may process account and workspace information required to operate
          the service, connection information for advertising platforms, and
          advertising performance data that an authorized user chooses to
          connect. For Google Ads, this may include Google Ads customer account
          identifiers, account metadata, campaign and advertising performance
          metrics, and OAuth credentials required to maintain an authorized
          connection.
        </PolicySection>

        <PolicySection title="3. How Google user data is used" koreanTitle="3. Google 사용자 데이터의 이용 목적" koreanText="Google API에서 받은 정보는 Etrylue Performance의 이용자 대상 기능을 제공하는 데만 사용됩니다. 여기에는 승인된 Google Ads 계정 확인, 광고 성과 데이터 조회, 리포트 작성, 결과 집계 및 필터링, 서비스를 통해 요청한 분석 인사이트 생성이 포함됩니다.">
          Information received from Google APIs is used only to provide
          user-facing Etrylue Performance features, including verifying an
          authorized Google Ads account, retrieving advertising performance
          data, producing reports, aggregating and filtering results, and
          generating analytical insights requested through the service.
        </PolicySection>

        <PolicySection title="4. Google Ads API scope" koreanTitle="4. Google Ads API 이용 범위" koreanText="Etrylue Performance는 Google Ads API를 보고 및 분석 목적으로 사용합니다. 캠페인, 광고그룹, 광고, 키워드, 입찰가 또는 예산을 생성·수정·삭제하는 데 사용하지 않습니다.">
          Etrylue Performance uses Google Ads API access for reporting and
          analytics. The service does not use the Google Ads API to create,
          edit, or delete campaigns, ad groups, ads, keywords, bids, or
          budgets.
        </PolicySection>

        <PolicySection title="5. Storage and protection" koreanTitle="5. 저장 및 보호" koreanText="저장된 연결 정보와 광고 데이터를 무단 접근·변경·공개·파기로부터 보호하기 위한 기술적·관리적 보호조치를 적용합니다. OAuth 액세스 토큰은 Google API와 통신할 때 일시적으로 처리될 수 있습니다. 승인된 연결을 유지하기 위해 지속적으로 보관해야 하는 인증 정보는 애플리케이션 보안 통제로 보호합니다.">
          Etrylue Performance uses technical and organizational safeguards
          designed to protect stored connection information and advertising
          data against unauthorized access, alteration, disclosure, or
          destruction. OAuth access tokens may be handled temporarily when
          communicating with Google APIs. Persistent connection credentials,
          when required to maintain an authorized connection, are protected by
          application security controls.
        </PolicySection>

        <PolicySection title="6. Sharing and disclosure" koreanTitle="6. 공유 및 공개" koreanText="Etrylue Performance는 Google 사용자 데이터를 판매하지 않습니다. 해당 데이터를 광고 타기팅이나 서비스와 무관한 마케팅 목적으로 공유하지 않습니다. 정보는 서비스 운영·보안·유지에 필요한 범위에서 인프라 또는 서비스 제공업체가 처리하거나, 관련 법령에 따라 공개될 수 있습니다.">
          Etrylue Performance does not sell Google user data. Google user data
          is not shared for advertising targeting or unrelated marketing
          purposes. Information may be processed by infrastructure or service
          providers only as necessary to operate, secure, and maintain the
          service, or when disclosure is required by applicable law.
        </PolicySection>

        <PolicySection title="7. Data retention and deletion" koreanTitle="7. 보관 및 삭제" koreanText="정보는 서비스 제공, 승인된 연결 유지, 정당한 운영상 필요 또는 관련 법령 준수를 위해 합리적으로 필요한 기간 동안만 보관합니다. 이용자는 Google 계정 설정에서 Etrylue Performance에 부여한 접근 권한을 철회할 수 있습니다. 서비스에 저장된 데이터의 삭제 요청은 아래 연락처로 보낼 수 있습니다.">
          Information is retained only for as long as reasonably necessary to
          provide the service, maintain an authorized connection, satisfy
          legitimate operational requirements, or comply with applicable law.
          Users may revoke Etrylue Performance&apos;s Google authorization
          through their Google Account settings. Requests concerning deletion
          of Etrylue Performance data may be sent to the contact address below.
        </PolicySection>

        <PolicySection title="8. Google API Services User Data Policy" koreanTitle="8. Google API Services User Data Policy" koreanText="Etrylue Performance는 Google API에서 받은 정보의 이용 및 이전에 관하여 Google API Services User Data Policy를 준수하며, 해당되는 경우 Limited Use 요건도 준수합니다.">
          Etrylue Performance&apos;s use and transfer of information received
          from Google APIs will adhere to the Google API Services User Data
          Policy, including the Limited Use requirements where applicable.
        </PolicySection>

        <PolicySection title="9. Changes to this policy" koreanTitle="9. 방침 변경" koreanText="서비스, 법적 요구사항 또는 데이터 처리 방식이 변경되면 이 방침이 개정될 수 있습니다. 최신 방침은 개정일과 함께 이 페이지에 게시합니다.">
          This Privacy Policy may be updated when the service, legal
          requirements, or data-handling practices change. The latest version
          will be published on this page with an updated revision date.
        </PolicySection>

        <PolicySection title="10. Contact" koreanTitle="10. 문의" koreanText="개인정보 관련 문의 또는 데이터 요청은 etrylue3479@gmail.com으로 보내주시기 바랍니다.">
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
            href="https://www.etrylue.com/"
            style={{ color: "#315f86", fontWeight: 700, textDecoration: "none" }}
          >
            홈페이지
          </a>
          <span aria-hidden="true" style={{ color: "#cbd5e1" }}>·</span>

          <a
            href="/about"
            style={{
              color: "#315f86",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            서비스 소개
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
            이용약관
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
  koreanTitle,
  koreanText,
  children,
}: {
  title: string;
  koreanTitle: string;
  koreanText: string;
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
        {koreanTitle}
        <br />
        <span lang="en">{title}</span>
      </h2>

      <p style={{ margin: "0 0 12px", color: "#475569", fontSize: 16, lineHeight: 1.85 }}>
        {koreanText}
      </p>
      <p
        lang="en"
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
