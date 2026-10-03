import type { Metadata } from "next";
import Image from "next/image";
import HomeBackToTop from "./HomeBackToTop";

import styles from "./home.module.css";

const homeUrl = "https://www.etrylue.com/";
const homeTitle = "Etrylue Performance | 광고 성과 리포트 자동화";
const homeDescription =
  "흩어진 광고 데이터를 하나의 기준으로 정리하고, 의사결정과 공유까지 이어주는 광고 성과 리포트 플랫폼입니다.";
const logoUrl = "https://www.etrylue.com/branding/etrylue-logo.png";

export const metadata: Metadata = {
  title: homeTitle,
  description: homeDescription,
  alternates: { canonical: homeUrl },
  verification: {
    other: { "naver-site-verification": "12530a12b58fb58d67a8b2b5f15b556424be2217" },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: homeUrl,
    siteName: "Etrylue Performance",
    title: homeTitle,
    description: homeDescription,
    images: [{ url: logoUrl, width: 294, height: 247, alt: "Etrylue Performance" }],
  },
  twitter: {
    card: "summary",
    title: homeTitle,
    description: homeDescription,
    images: [logoUrl],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${homeUrl}#organization`,
      name: "Etrylue Performance",
      legalName: "이트라이루",
      url: homeUrl,
      logo: logoUrl,
      email: "etrylue3479@gmail.com",
      telephone: "+82-10-5871-6881",
    },
    {
      "@type": "WebSite",
      "@id": `${homeUrl}#website`,
      url: homeUrl,
      name: "Etrylue Performance",
      description: homeDescription,
      inLanguage: "ko-KR",
      publisher: { "@id": `${homeUrl}#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${homeUrl}#webpage`,
      url: homeUrl,
      name: homeTitle,
      description: homeDescription,
      inLanguage: "ko-KR",
      isPartOf: { "@id": `${homeUrl}#website` },
      about: { "@id": `${homeUrl}#organization` },
    },
  ],
};

const values = [
  ["01", "Contribution", "기여", "모든 결정의 출발점. 먼저 고객의 성공에 기여합니다.", "origin"],
  ["02", "Value", "가치", "보기 좋은 숫자보다 실제 의사결정에 남는 가치를 좇습니다.", "teal"],
  ["03", "Try", "시도", "더 나은 기준을 만들기 위해 멈추지 않고 실험합니다.", "blue"],
  ["04", "Reflection", "반성", "결과를 정직하게 돌아보고 타협 없이 다시 다듬습니다.", "violet"],
  ["05", "Gratitude", "감사", "함께 만든 결과를 당연하게 여기지 않는 태도를 지킵니다.", "coral"],
] as const;

const capabilities = [
  {
    number: "01",
    title: "하나의 성과 기준",
    description:
      "매체별 데이터를 같은 지표 체계로 정리해 기간·채널·디바이스별 흐름을 한 화면에서 비교합니다.",
    icon: "chart",
  },
  {
    number: "02",
    title: "판단을 돕는 리포트",
    description:
      "트래픽·DB 획득·커머스 목적에 맞춰 목표와 실제 성과, 주차별 변화와 핵심 지표를 연결합니다.",
    icon: "signal",
  },
  {
    number: "03",
    title: "안전한 공유와 발행",
    description:
      "워크스페이스 권한을 지키면서 공개 URL, PDF·PPT 내보내기, 대행사 전용 브랜딩으로 전달합니다.",
    icon: "share",
  },
];

const outcomes = [
  ["반복 취합에서", "한 번 정한 기준으로", "CSV 업로드와 승인된 매체 API 데이터를 같은 리포트 구조로 정리합니다."],
  ["숫자 나열에서", "의사결정의 맥락으로", "목표, 기간, 채널과 세부 성과를 연결해 다음 행동을 찾기 쉽게 만듭니다."],
  ["파일 전달에서", "공유 가능한 결과로", "최신 발행본을 정규 URL과 문서로 전달해 같은 화면에서 이야기할 수 있습니다."],
] as const;

const steps = [
  ["STEP 1", "목적 선택", "방문 유입은 트래픽, 상담·문의 전환은 DB 획득, 매출 성과는 커머스 리포트를 선택합니다.", "target"],
  ["STEP 2", "데이터 수집", "CSV를 올리거나 권한이 연결된 매체 API에서 데이터를 가져옵니다.", "download"],
  ["STEP 3", "성과 정리", "기간과 필터 기준을 유지하며 지표·차트·인사이트를 구성합니다.", "dashboard"],
  ["STEP 4", "발행과 공유", "공개 URL 또는 PDF·PPT로 팀과 클라이언트에 전달합니다.", "send"],
] as const;

const faqs = [
  {
    question: "Etrylue Performance는 누구를 위한 서비스인가요?",
    answer:
      "여러 광고주의 성과를 보고하는 광고대행사와 자사 광고를 분석하는 인하우스 마케터를 위한 서비스입니다. 광고 데이터를 정리하고 목적에 맞는 리포트를 만들어 팀과 고객에게 공유할 수 있습니다.",
  },
  {
    question: "어떤 광고 성과 리포트를 만들 수 있나요?",
    answer:
      "방문 유입을 보는 트래픽, 상담·문의 전환을 보는 DB 획득, 매출과 광고수익률을 보는 커머스 리포트를 만들 수 있습니다. 리포트 목적에 맞춰 목표와 실제 성과를 비교합니다.",
  },
  {
    question: "리포트는 어디에서 만들 수 있나요?",
    answer:
      "리포트 생성과 관리는 app.etrylue.com에서 이용할 수 있습니다.",
  },
  {
    question: "어떤 방식으로 데이터를 넣을 수 있나요?",
    answer:
      "CSV 파일 업로드 또는 지원되는 매체의 API 연결로 데이터를 입력합니다. API 이용 가능 여부와 수집 범위는 매체별 지원 상태, 계정 연결 및 승인된 권한에 따라 달라집니다.",
  },
  {
    question: "리포트를 외부에 공유할 수 있나요?",
    answer:
      "발행된 최신 결과를 공개 URL로 공유하거나 PDF·PPT로 내보낼 수 있습니다. 공개 범위와 워크스페이스 권한은 분리해 보호합니다.",
  },
  {
    question: "회사 로고를 적용할 수 있나요?",
    answer:
      "대행사 유형 워크스페이스에서는 기업 로고와 리포트 브랜딩을 적용할 수 있습니다. 광고주 인하우스 유형에는 이 기능을 노출하지 않습니다.",
  },
];

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.brandLockup}>
      <Image
        src="/branding/etrylue-logo.png"
        alt=""
        width={294}
        height={247}
        sizes={compact ? "46px" : "58px"}
        className={compact ? styles.brandMarkCompact : styles.brandMark}
        priority={!compact}
      />
      <span>
        <b>Etrylue</b>
        <small>PERFORMANCE</small>
      </span>
    </span>
  );
}

function FeatureIcon({ type }: { type: string }) {
  if (type === "chart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="13" width="4" height="8" rx="1" />
        <rect x="10" y="8" width="4" height="13" rx="1" opacity=".78" />
        <rect x="17" y="4" width="4" height="17" rx="1" opacity=".56" />
      </svg>
    );
  }
  if (type === "signal") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 17.5 9 12l3.2 3.2L20 6.8" />
        <path d="M15.5 6.8H20v4.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" opacity=".72" />
      <circle cx="18" cy="18" r="2.5" opacity=".72" />
      <path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6" />
    </svg>
  );
}

function StepIcon({ type }: { type: string }) {
  if (type === "target") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="m15 9 5-5M16 4h4v4" />
      </svg>
    );
  }
  if (type === "download") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 18v2h16v-2" />
      </svg>
    );
  }
  if (type === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 16v-4m4 4V8m4 8v-6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m21 3-8 18-3.2-7L3 11l18-8Z" />
      <path d="m9.8 14 4.8-4.8" />
    </svg>
  );
}

function SignalMap() {
  const lines = [
    [220, 190, 70, 58],
    [220, 190, 372, 55],
    [220, 190, 400, 235],
    [220, 190, 318, 335],
    [220, 190, 70, 310],
  ];
  const nodes = [
    [70, 58],
    [372, 55],
    [400, 235],
    [318, 335],
    [70, 310],
  ];
  return (
    <div className={styles.signalWrap} aria-label="여러 데이터가 하나의 리포트로 모이는 구조">
      <p className={styles.signalCaption}>MULTIPLE SOURCES · ONE REPORT</p>
      <div className={styles.signalPanel}>
        <div className={styles.signalGrid} aria-hidden="true" />
        <svg className={styles.signalSvg} viewBox="0 0 440 380" aria-hidden="true">
          <defs>
            <radialGradient id="home-core-gradient" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#f3e4d2" />
              <stop offset="45%" stopColor="#2fe0c4" />
              <stop offset="100%" stopColor="#7fa6c4" />
            </radialGradient>
          </defs>
          {lines.map((line, index) => (
            <line
              key={line.join("-")}
              className={styles.signalLine}
              x1={line[0]}
              y1={line[1]}
              x2={line[2]}
              y2={line[3]}
              style={{ animationDelay: String(index * 0.22) + "s" }}
            />
          ))}
          <circle className={styles.signalPing} cx="220" cy="190" r="27" />
          <circle className={styles.signalRing} cx="220" cy="190" r="62" />
          <circle className={styles.signalRingSoft} cx="220" cy="190" r="88" />
          <circle fill="url(#home-core-gradient)" cx="220" cy="190" r="25" />
          {nodes.map((node) => (
            <circle key={node.join("-")} className={styles.signalNode} cx={node[0]} cy={node[1]} r="5" />
          ))}
        </svg>
        <span className={[styles.sourceLabel, styles.sourceGoogle].join(" ")}><i className={styles.googleBadge}>G</i>Google Ads</span>
        <span className={[styles.sourceLabel, styles.sourceNaver].join(" ")}><i className={styles.naverBadge}>N</i>Naver Search Ads</span>
        <span className={[styles.sourceLabel, styles.sourceCsv].join(" ")}><i className={styles.csvBadge}>C</i>CSV Upload</span>
        <span className={[styles.sourceLabel, styles.sourceCreative].join(" ")}><i className={styles.creativeBadge}>A</i>Creative</span>
        <span className={[styles.sourceLabel, styles.sourceGoal].join(" ")}><i className={styles.goalBadge}>K</i>Goal &amp; KPI</span>
        <div className={styles.signalCoreLabel}><b>SIGNAL</b><span>ONE VIEW</span></div>
      </div>
    </div>
  );
}

function DashboardPreview() {
  const bars = [46, 70, 58, 94, 82, 124, 108, 146, 132, 174, 158, 194];
  return (
    <div className={styles.dashboardPreview} aria-hidden="true">
      <div className={styles.previewChrome}><i /><i /><i /><span>서비스 화면 예시 · 예시 데이터</span></div>
      <div className={styles.previewBody}>
        <div className={styles.previewMetrics}>
          <div><span>광고비</span><b>₩ 48.2M</b><small>선택 기간</small></div>
          <div><span>전환</span><b>1,345</b><small>통합 집계</small></div>
          <div><span>ROAS</span><b className={styles.tealText}>412%</b><small>목표 대비</small></div>
        </div>
        <div className={styles.previewChart}>
          <div className={styles.chartLegend}>
            <span><i className={styles.legendBlue} />성과</span>
            <span><i className={styles.legendTeal} />목표 흐름</span>
          </div>
          <div className={styles.bars}>
            {bars.map((height, index) => <i key={height + index} style={{ height }} />)}
            <svg viewBox="0 0 600 220" preserveAspectRatio="none">
              <path d="M18 176 C 94 168, 128 141, 188 146 S 286 118, 342 105 S 442 72, 582 36" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const buttonPrimary = [styles.button, styles.buttonPrimary, styles.navButton].join(" ");
  const buttonAccent = [styles.button, styles.buttonAccent, styles.buttonLarge].join(" ");
  const buttonGhost = [styles.button, styles.buttonGhost, styles.buttonLarge].join(" ");
  return (
    <main className={styles.page}>
      <script
        id="etrylue-home-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <nav className={styles.nav} aria-label="주요 메뉴">
        <div className={[styles.container, styles.navInner].join(" ")}>
          <a href="#top" className={styles.logoLink} aria-label="Etrylue Performance 홈"><BrandLockup /></a>
          <div className={styles.navLinks}>
            <a href="#brand">소개</a><a href="#capabilities">기능</a><a href="#workflow">동작 방식</a><a href="#faq">자주 묻는 질문</a>
          </div>
          <a className={buttonPrimary} href="https://app.etrylue.com/report-builder">리포트 열기</a>
        </div>
      </nav>

      <header className={styles.hero} id="top">
        <div className={[styles.container, styles.heroGrid].join(" ")}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>AD PERFORMANCE · ONE STANDARD</span>
            <h1>흩어진 광고 숫자를,<br />하나의 <em>신호</em>로 정리합니다</h1>
            <p>광고대행사와 인하우스 마케터를 위한 광고 성과 리포트 플랫폼입니다.<br className={styles.desktopBreak} /> 흩어진 데이터를 같은 기준으로 정리하고, 분석부터 공유까지 연결합니다.</p>
            <div className={styles.heroActions}>
              <a className={buttonAccent} href="https://app.etrylue.com/report-builder">리포트 시작하기</a>
              <a className={buttonGhost} href="#capabilities">서비스 구조 보기 <span aria-hidden="true">→</span></a>
            </div>
            <p className={styles.heroNote}>CSV와 승인된 매체 API · 목적별 리포트 · 공개 URL과 문서 내보내기</p>
          </div>
          <SignalMap />
        </div>
      </header>

      <section className={styles.trustStrip} aria-label="리포트 핵심 범위">
        <div className={styles.container}>
          <div><strong>CSV + API</strong><span>운영 방식에 맞춘 데이터 수집</span></div>
          <div><strong>3 REPORT TYPES</strong><span>목적별로 분리한 성과 기준</span></div>
          <div><strong>URL · PDF · PPT</strong><span>발행부터 공유까지 한 흐름</span></div>
        </div>
      </section>

      <section className={styles.brandSection} id="brand">
        <div className={styles.container}>
          <div className={styles.brandHeading}>
            <span className={styles.eyebrow}>OUR NAME, OUR STANDARD</span>
            <h2>Etrylue, 다섯 마음이 모여 만든 이름</h2>
            <p>Contribution · Value · Try · Reflection · Gratitude<br />기여, 가치, 시도, 반성, 감사의 기준을 제품과 일하는 방식에 담았습니다.</p>
          </div>
          <blockquote className={styles.brandQuote}>성공은 혼자 오지 않습니다.<br />먼저 <b>누군가의 성공을 잇는 통로</b>가 되어야 한다고 믿습니다.</blockquote>
          <div className={styles.valueFlow}>
            {values.map(([index, word, korean, description, tone], valueIndex) => (
              <div className={styles.valueItem} key={word}>
                <article className={[styles.valueCard, styles[tone]].join(" ")}><span>{index}</span><h3>{word}</h3><h4>{korean}</h4><p>{description}</p></article>
                {valueIndex < values.length - 1 ? <span className={styles.valueArrow} aria-hidden="true">→</span> : null}
              </div>
            ))}
          </div>
          <p className={styles.brandClosing}>기여라는 철학 위에서 가치를 좇고, 시도로 도전합니다.<br />반성으로 다듬고, 감사로 고객을 대합니다.</p>
        </div>
      </section>

      <section className={styles.capabilitySection} id="capabilities">
        <div className={[styles.ambient, styles.ambientOne].join(" ")} aria-hidden="true" />
        <div className={[styles.ambient, styles.ambientTwo].join(" ")} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>WHY ETRYLUE PERFORMANCE</span>
            <h2>리포트에 쓰는 시간을, <em>판단하는 시간</em>으로</h2>
            <p>반복되는 데이터 취합과 결과 정리를 가볍게 만들고,<br className={styles.desktopBreak} /> 팀이 성과의 의미와 다음 행동에 집중하도록 돕습니다.</p>
          </div>
          <div className={styles.capabilityLayout}>
            <div className={styles.capabilityVisual}>
              <DashboardPreview />
          <div className={styles.reportTypeRow}>{["TRAFFIC", "DB ACQUISITION", "COMMERCE"].map((type) => <span key={type}>{type}</span>)}</div>
            </div>
          <div className={styles.capabilityGrid}>
            {capabilities.map((capability) => (
              <article className={styles.capabilityCard} key={capability.title}>
                <div className={styles.capabilityIcon}><FeatureIcon type={capability.icon} /></div>
                <span className={styles.cardNumber}>{capability.number}</span><h3>{capability.title}</h3><p>{capability.description}</p>
              </article>
            ))}
          </div>
          </div>
        </div>
      </section>

      <section className={styles.outcomeSection}>
        <svg className={styles.outcomeArtwork} viewBox="0 0 760 500" fill="none" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="home-flow-glow">
              <stop stopColor="#2fe0c4" stopOpacity=".28" />
              <stop offset="1" stopColor="#2fe0c4" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="home-flow-line" x1="60" y1="390" x2="680" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7fa6c4" stopOpacity="0" />
              <stop offset=".5" stopColor="#2fe0c4" />
              <stop offset="1" stopColor="#a88cff" />
            </linearGradient>
          </defs>
          <ellipse cx="490" cy="240" rx="270" ry="230" fill="url(#home-flow-glow)" />
          <g stroke="#7fa6c4" strokeOpacity=".18">
            <ellipse cx="490" cy="240" rx="220" ry="150" transform="rotate(-25 490 240)" />
            <ellipse cx="490" cy="240" rx="280" ry="190" transform="rotate(-25 490 240)" />
            <path d="M260 80V440M380 35V465M500 15V475M620 35V450M185 140H730M165 260H750M185 380H730" strokeDasharray="2 10" />
          </g>
          <g stroke="url(#home-flow-line)" strokeLinecap="round">
            <path d="M30 410C180 410 180 160 330 160S425 230 485 230S575 90 700 90" strokeWidth="2" />
            <path d="M0 430C160 430 220 230 330 230H485C580 230 590 120 700 120" strokeWidth="3" />
            <path d="M80 475C225 475 210 310 330 310S430 230 485 230S590 150 700 150" strokeWidth="2" />
          </g>
          <g transform="translate(270 114) rotate(-12)" stroke="#b7d7e3">
            <rect width="88" height="110" rx="14" fill="#182640" fillOpacity=".65" strokeOpacity=".5" />
            <path d="M20 28H59M20 42H48M20 78V65M35 78V55M50 78V61M65 78V48" strokeWidth="3" strokeLinecap="round" strokeOpacity=".65" />
          </g>
          <g transform="translate(605 45) rotate(12)" stroke="#c6b5ff">
            <rect width="100" height="128" rx="16" fill="#242440" fillOpacity=".6" strokeOpacity=".55" />
            <path d="M23 28H72M23 42H56M23 80L38 65L51 73L76 55M23 103H72" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity=".8" />
          </g>
          <circle cx="485" cy="230" r="48" fill="#152f3c" stroke="#2fe0c4" strokeOpacity=".2" />
          <circle cx="485" cy="230" r="35" stroke="#2fe0c4" strokeOpacity=".55" />
          <path d="m468 230 11 11 23-24" stroke="#a4f1e5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <g fill="#2fe0c4"><circle cx="222" cy="262" r="4" /><circle cx="552" cy="205" r="5" /><circle cx="387" cy="299" r="3" /></g>
          <g fill="#a88cff"><circle cx="590" cy="159" r="4" /><circle cx="697" cy="120" r="5" /></g>
        </svg>
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>WORKFLOW, REFRAMED</span><h2>리포트가 바꾸는 세 가지 흐름</h2><p>기능을 늘리기보다, 반복 업무의 경계를 정확히 줄였습니다.</p>
          </div>
          <div className={styles.outcomeGrid}>
            {outcomes.map(([label, title, description], index) => (
              <article className={styles.outcomeCard} key={label}><span>0{index + 1}</span><small>{label}</small><h3>{title}</h3><p>{description}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.workflowSection} id="workflow">
        <div className={styles.speedLines} aria-hidden="true"><i /><i /><i /><i /></div>
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>HOW IT WORKS</span><h2>데이터에서 공유까지, 한 흐름으로</h2><p>운영 방식은 나누고, 성과를 읽는 기준은 연결합니다.</p>
          </div>
          <div className={styles.stepGrid}>
            {steps.map(([step, title, description, icon]) => (
              <article className={styles.stepCard} key={step}><div className={styles.stepIcon}><StepIcon type={icon} /></div><span>{step}</span><h3>{title}</h3><p>{description}</p></article>
            ))}
          </div>
        </div>
      </section>



      <section className={styles.faqSection} id="faq">
        <div className={styles.container}>
          <div className={styles.sectionHeading}><span className={styles.eyebrow}>FAQ</span><h2>자주 묻는 질문</h2></div>
          <div className={styles.faqGrid}>{faqs.map((faq) => <article className={styles.faqCard} key={faq.question}><h3>{faq.question}</h3><p>{faq.answer}</p></article>)}</div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}><a href="#top" aria-label="Etrylue Performance 홈"><BrandLockup compact /></a><p>흩어진 광고 데이터를 하나의 기준으로 정리하는<br /> 광고 성과 리포트 플랫폼.</p></div>
            <div><h3>제품</h3><a href="#capabilities">기능</a><a href="#workflow">동작 방식</a><a href="https://app.etrylue.com/report-builder">리포트 열기</a></div>
            <div><h3>안내</h3><a href="/about">서비스 소개</a><a href="/terms">이용약관</a><a href="/privacy">개인정보처리방침</a></div>
            <div><h3>문의</h3><a href="mailto:etrylue3479@gmail.com">etrylue3479@gmail.com</a><a href="tel:01058716881">010-5871-6881</a></div>
          </div>
          <div className={styles.businessInfo} aria-label="사업자 정보">
            <p className={styles.businessName}>이트라이루</p>
            <dl className={styles.businessDetails}>
              <div><dt>대표자</dt><dd>신광희</dd></div>
              <div><dt>사업자등록번호</dt><dd>365-31-01818</dd></div>
              <div><dt>연락처</dt><dd><a href="tel:01058716881">010-5871-6881</a></dd></div>
              <div><dt>CS 이메일</dt><dd><a href="mailto:etrylue3479@gmail.com">etrylue3479@gmail.com</a></dd></div>
              <div className={styles.businessAddress}><dt>사업자 주소</dt><dd>경기도 수원시 권선구 세권로181번길 20-23, 2층 137호(권선동, 태양빌딩)</dd></div>
            </dl>
          </div>
          <div className={styles.footerBottom}><span>© 2026 Etrylue Performance. All rights reserved.</span><span>Contribution · Value · Try · Reflection · Gratitude</span></div>
        </div>
      </footer>
      <section className={styles.ctaSection} aria-label="리포트 시작 및 도입 문의">
        <div className={[styles.container, styles.ctaCard].join(" ")}>
          <div><span className={styles.eyebrow}>READY WHEN YOU ARE</span><h2>다음 리포트는, 더 명확한 기준으로</h2><p>광고주와 리포트 목적을 선택하고 시작하세요.</p></div>
          <div className={styles.ctaActions}><a className={buttonAccent} href="https://app.etrylue.com/report-builder">리포트 열기</a><a className={buttonGhost} href="mailto:etrylue3479@gmail.com">도입 문의</a></div>
        </div>
      </section>
      <HomeBackToTop />
    </main>
  );
}
