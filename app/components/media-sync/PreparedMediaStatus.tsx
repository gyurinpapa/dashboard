// Display-only catalog. Never import provider preparation or credential modules here.
const PREPARED_MEDIA = [
  { name: "카카오모먼트", detail: "성과형 4종 · 실계정 검증 대기" },
  { name: "TikTok Ads", detail: "웹사이트 광고 · 실계정 검증 대기" },
  { name: "TG (타게팅게이츠)", detail: "광고실적 API 명세 확인 대기" },
  { name: "크리테오", detail: "공통 준비 · 연동 범위 확인 대기" },
  { name: "모비온", detail: "공통 준비 · 성과 API 명세 확인 대기" },
  { name: "네이버 GFA", detail: "검색광고와 별도 · 연동 기준 확인 대기" },
] as const;

// Hoisted static markup: no effects, requests, account data, selection, or handlers.
const PREPARATION_STATUS = (
  <section
    aria-label="추가 매체 API 준비 상태"
    className="mt-4 rounded-xl border border-white/[0.10] bg-white/[0.025] p-3.5"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="m-0 text-sm font-extrabold text-[#f7f7ff]">추가 매체 API</h3>
      <span className="rounded-full border border-[#7FA6C4]/30 bg-[#7FA6C4]/10 px-2 py-1 text-[10px] font-bold text-[#B7D7E3]">
        동기화 비활성
      </span>
    </div>
    <p className="mb-0 mt-2 text-xs leading-5 text-[#bbb8d4]">
      연동 준비 단계입니다. 아직 계정을 연결하거나 보고서 수집 대상으로 선택할 수 없습니다.
    </p>
    <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {PREPARED_MEDIA.map((media) => (
        <li key={media.name} className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2.5">
          <div className="text-xs font-extrabold text-[#e8e4ff]">{media.name}</div>
          <div className="mt-1 text-[11px] leading-5 text-[#bbb8d4]">{media.detail}</div>
        </li>
      ))}
    </ul>
  </section>
);

export default function PreparedMediaStatus() {
  return PREPARATION_STATUS;
}
