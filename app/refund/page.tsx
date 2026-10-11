/* eslint-disable @next/next/no-html-link-for-pages -- Static public policy links. */
import type { Metadata } from "next";
import PublicSiteShell from "../PublicSiteShell";
import styles from "../pricing/billing.module.css";
export const metadata: Metadata = { title: "환불정책 | Etrylue Performance", alternates: { canonical: "https://www.etrylue.com/refund" } };
export default function RefundPage() {
  return <PublicSiteShell><article className={styles.container}>
    <p className={styles.eyebrow}>REFUND POLICY · 2026년 10월 11일</p><h1 className={styles.title}>이용기간과 환불정책</h1>
    <section className={styles.panel}><h2>1. 판매 상품과 이용기간</h2>
      <p>Etrylue Performance는 광고 성과 리포트 플랫폼 이용권을 판매합니다. 광고비 충전이나 광고 집행 대행 상품이 아닙니다.</p>
      <p>광고주·워크스페이스·회사 중 선택한 범위의 이용권은 결제 승인일부터 1개월간 제공됩니다. 매월 말일 등 다음 달에 같은 날짜가 없으면 해당 달의 마지막 날을 종료일로 적용합니다. 정확한 종료 시각은 결제 내역에서 한국 시간(KST)으로 확인할 수 있습니다.</p>
      <p>건별 결제는 자동 갱신되지 않습니다. 매월 자동결제는 아직 판매하지 않습니다. 모든 표시 가격은 부가세 포함입니다.</p>
    </section>
    <section className={styles.panel}><h2>2. 일반 환불</h2>
      <p>결제 승인 시각부터 7일(168시간) 이내 접수하면 사용 여부와 관계없이 전액 환불합니다.</p>
      <p>7일이 지난 후 이용기간 종료 전 접수하면 남은 이용기간에 비례하여 환불합니다. 별도의 해지 위약금은 없습니다.</p>
      <p>환불금액 = 실제 결제금액 × (이용기간 종료 시각 − 환불 요청 접수 시각) ÷ (이용기간 종료 시각 − 결제 승인 시각). 실제 이용기간을 기준으로 계산하며, 원 미만은 올림합니다. 환불액은 실제 결제금액을 초과하지 않습니다.</p>
      <p>이용기간 종료 후에는 단순 변심에 따른 일반 환불이 제공되지 않습니다. 다만 아래 특별 환불과 법령상 권리는 별도로 적용됩니다.</p>
    </section>
    <section className={styles.panel}><h2>3. 특별 환불과 법령상 권리</h2>
      <p>중복 결제 또는 서비스 제공 불가가 확인되면 해당 결제를 전액 환불합니다. 문의로 사실을 확인하여 처리하며, 일반 환불 기간으로 제한하지 않습니다.</p>
      <p>서비스가 표시·광고 또는 계약 내용과 다르게 제공된 경우 등 관계 법령에 따른 청약철회·환불 권리는 이 정책으로 제한되지 않습니다.</p>
    </section>
    <section className={styles.panel}><h2>4. 요청 방법과 처리</h2>
      <p><a href="mailto:etrylue3479@gmail.com">etrylue3479@gmail.com</a>으로 주문번호와 요청 사유를 보내주세요. 카드번호·비밀번호 등 결제 비밀정보는 보내지 마세요. 이메일 도착 시각을 접수 시각으로 사용합니다.</p>
      <p>심사용 테스트 결제는 결제 내역의 환불 버튼으로도 요청할 수 있습니다. 서버에 최초 저장된 요청 시각과 금액으로 처리하며, 같은 요청의 재시도로 금액이 바뀌지 않습니다. 현재 테스트 결제에서는 실제 요금이 청구되지 않습니다.</p>
      <p>관계 법령에서 정한 환급 기한을 준수합니다. 결제수단별 실제 반영 시점은 다를 수 있으며, 카드 매입 이후 취소·부분 취소는 일반적으로 3~4영업일이 소요됩니다.</p>
    </section>
    <section className={styles.panel}><h2>5. 환불 후 이용권과 데이터</h2>
      <p>환불이 확인되면 해당 이용권의 효력이 종료됩니다. 광고주와 기존 리포트는 환불만으로 자동 삭제되지 않습니다. 별도로 유효한 다른 이용권과 기존 권한·워크스페이스 접근 범위는 유지됩니다.</p>
      <p>결제 결과가 확인되지 않으면 새로 결제하기 전에 기존 결제 상태를 재확인하거나 문의해주세요.</p>
    </section><p><a href="/pricing">요금제</a> · <a href="/terms">이용약관</a></p>
  </article></PublicSiteShell>;
}
