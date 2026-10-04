import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관 | Etrylue Performance",
  description: "Etrylue Performance의 서비스 이용, 광고 계정 연결 권한, 데이터 및 리포트, 이용 제한에 관한 약관입니다.",
  alternates: { canonical: "https://www.etrylue.com/terms" },
};

export default function TermsPage() {
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
            이용약관 / Terms of Service
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

        <TermsSection title="1. Service" koreanTitle="1. 서비스" koreanText="Etrylue Performance는 광고 성과 보고, 분석, 집계, 필터링 및 관련 리포트 도구를 제공합니다. 일부 기능에서는 권한 있는 이용자가 Google Ads와 같은 외부 광고 플랫폼을 연결할 수 있습니다.">
          Etrylue Performance provides advertising performance reporting,
          analytics, aggregation, filtering, and related reporting tools.
          Certain features may allow authorized users to connect third-party
          advertising platforms such as Google Ads.
        </TermsSection>

        <TermsSection title="2. Authorized account access" koreanTitle="2. 승인된 계정 접근" koreanText="이용자는 자신이 소유하거나 접근 권한을 부여받은 광고 계정만 연결할 수 있습니다. 이용자는 자신의 계정 인증 정보를 안전하게 관리하고, 연결된 광고 데이터의 이용이 적법하며 필요한 권한에 근거하도록 할 책임이 있습니다.">
          You may connect only advertising accounts that you own or are
          authorized to access. You are responsible for maintaining the
          security of your account credentials and for ensuring that your use
          of connected advertising data is authorized and lawful.
        </TermsSection>

        <TermsSection title="3. Google Ads integration" koreanTitle="3. Google Ads 연동" koreanText="이용자가 Google Ads 접근을 승인하면, Etrylue Performance는 Google Ads API를 사용해 연결된 계정을 확인하고 보고 및 분석을 위한 광고 성과 데이터를 조회할 수 있습니다. Google Ads API를 캠페인, 광고그룹, 광고, 키워드, 입찰가 또는 예산의 생성·수정·삭제에 사용하지 않습니다.">
          When you authorize Google Ads access, Etrylue Performance may use the
          Google Ads API to verify the connected account and retrieve
          advertising performance data for reporting and analytics. Etrylue
          Performance does not use the Google Ads API to create, edit, or
          delete campaigns, ad groups, ads, keywords, bids, or budgets.
        </TermsSection>

        <TermsSection title="4. Acceptable use" koreanTitle="4. 허용되는 이용" koreanText="타인의 계정에 무단으로 접근하거나, 서비스를 방해하거나, 보안 통제를 우회하거나, 관련 법령을 위반하거나, 연결된 광고 플랫폼에서 얻은 정보를 오용하는 목적으로 서비스를 이용해서는 안 됩니다.">
          You may not use the service to gain unauthorized access to another
          person&apos;s account, interfere with the service, circumvent
          security controls, violate applicable law, or misuse information
          obtained through connected advertising platforms.
        </TermsSection>

        <TermsSection title="5. Data and reporting" koreanTitle="5. 데이터 및 리포트" koreanText="광고 데이터는 외부 플랫폼에서 제공될 수 있으며, 해당 플랫폼의 사정에 따라 지연되거나 불완전할 수 있고, 정정되거나 그 밖의 영향을 받을 수 있습니다. Etrylue Performance는 보고와 분석을 돕기 위한 서비스이며, 외부 플랫폼의 모든 데이터가 항상 중단이나 오류 없이 제공되는 것을 보장하지 않습니다.">
          Advertising data may originate from third-party platforms and may be
          delayed, incomplete, corrected, or otherwise affected by those
          platforms. Etrylue Performance is intended to assist with reporting
          and analysis and does not guarantee that every third-party data point
          will always be uninterrupted or error-free.
        </TermsSection>

        <TermsSection title="6. Availability and changes" koreanTitle="6. 서비스 제공 및 변경" koreanText="서비스의 발전이나 외부 API 및 플랫폼 요구사항의 변화에 따라 기능이 업데이트·개선·중단·변경될 수 있습니다. 서비스의 연속성을 유지하고 기존 이용자 데이터와 리포트 동작을 보호하기 위해 합리적인 노력을 기울입니다.">
          Features may be updated, improved, suspended, or changed as the
          service evolves or as third-party APIs and platform requirements
          change. Reasonable efforts are made to maintain service continuity
          and protect existing user data and reporting behavior.
        </TermsSection>

        <TermsSection title="7. Third-party services" koreanTitle="7. 외부 서비스" koreanText="Google Ads와 같은 연결 서비스의 이용에는 해당 제공업체의 약관, 정책 및 기술적 요구사항도 적용됩니다. Etrylue Performance는 외부 플랫폼의 가용성이나 운영을 통제하지 않습니다.">
          Use of connected services such as Google Ads is also subject to the
          terms, policies, and technical requirements of those third-party
          providers. Etrylue Performance does not control the availability or
          operation of third-party platforms.
        </TermsSection>

        <TermsSection title="8. Intellectual property" koreanTitle="8. 지식재산권" koreanText="Etrylue Performance와 그 소프트웨어, 인터페이스 및 고유한 서비스 자료는 관련 지식재산권 법령에 따라 보호됩니다. 이 약관은 서비스나 소프트웨어의 소유권을 이용자에게 이전하지 않습니다.">
          Etrylue Performance, its software, interface, and original service
          materials remain protected by applicable intellectual property laws.
          These Terms do not transfer ownership of the service or its software
          to users.
        </TermsSection>

        <TermsSection title="9. Disclaimer" koreanTitle="9. 책임 관련 안내" koreanText="서비스는 광고 보고 및 분석 목적으로 제공됩니다. 리포트나 분석 결과를 활용해 내린 의사결정의 책임은 이용자에게 있습니다.">
          The service is provided for advertising reporting and analytical
          purposes. Decisions made using reports or analytical outputs remain
          the responsibility of the user.
        </TermsSection>

        <TermsSection title="10. Changes to these terms" koreanTitle="10. 약관 변경" koreanText="서비스, 적용되는 요구사항 또는 지원하는 연동 기능이 변경되면 이 약관이 개정될 수 있습니다. 최신 약관은 개정일과 함께 이 페이지에 게시합니다.">
          These Terms may be updated as the service, applicable requirements,
          or supported integrations change. The latest version will be
          published on this page with an updated revision date.
        </TermsSection>

        <TermsSection title="11. Contact" koreanTitle="11. 문의" koreanText="이 약관에 관한 문의는 etrylue3479@gmail.com으로 보내주시기 바랍니다.">
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
            href="/privacy"
            style={{
              color: "#315f86",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            개인정보처리방침
          </a>
        </footer>
      </article>
    </main>
  );
}

function TermsSection({
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
