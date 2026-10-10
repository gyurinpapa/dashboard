/* eslint-disable @next/next/no-html-link-for-pages -- Preserve the homepage's native navigation. */
import Image from "next/image";
import HomeAccountLinks from "./HomeAccountLinks";
import HomeBackToTop from "./HomeBackToTop";
import styles from "./home.module.css";

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

export function HomeHeader({ home = false }: { home?: boolean }) {
  return (
      <nav className={styles.nav} aria-label="주요 메뉴">
        <div className={[styles.container, styles.navInner].join(" ")}>
          <a href={`${home ? "" : "/"}#top`} className={styles.logoLink} aria-label="Etrylue Performance 홈"><BrandLockup /></a>
          <div className={styles.navLinks}>
            <a href={`${home ? "" : "/"}#brand`}>소개</a><a href={`${home ? "" : "/"}#capabilities`}>기능</a><a href={`${home ? "" : "/"}#workflow`}>동작 방식</a><a href={`${home ? "" : "/"}#faq`}>자주 묻는 질문</a>
            <a href="/pricing">요금제</a>
          </div>
          <HomeAccountLinks />
        </div>
      </nav>
  );
}

export function HomeFooter({ home = false }: { home?: boolean }) {
  const buttonAccent = [styles.button, styles.buttonAccent, styles.buttonLarge].join(" ");
  const buttonGhost = [styles.button, styles.buttonGhost, styles.buttonLarge].join(" ");
  return <>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}><a href={`${home ? "" : "/"}#top`} aria-label="Etrylue Performance 홈"><BrandLockup compact /></a><p>흩어진 광고 데이터를 하나의 기준으로 정리하는<br /> 광고 성과 리포트 플랫폼.</p></div>
            <div><h3>제품</h3><a href="/pricing">요금제</a><a href={`${home ? "" : "/"}#capabilities`}>기능</a><a href={`${home ? "" : "/"}#workflow`}>동작 방식</a><a href="/account">내 서비스</a></div>
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
      <section className={styles.ctaSection} aria-label="요금제 안내 및 도입 문의">
        <div className={[styles.container, styles.ctaCard].join(" ")}>
          <div><span className={styles.eyebrow}>READY WHEN YOU ARE</span><h2>다음 리포트는, 더 명확한 기준으로</h2><p>요금제를 선택하고 우리 회사의 첫 리포트를 시작하세요.</p></div>
          <div className={styles.ctaActions}><a className={buttonAccent} href="/pricing">요금제 바로가기</a><a className={buttonGhost} href="mailto:etrylue3479@gmail.com">도입 문의</a></div>
        </div>
      </section>
      <HomeBackToTop />
  </>;
}
