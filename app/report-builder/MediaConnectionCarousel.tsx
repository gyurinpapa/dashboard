"use client";

import { useId, useRef, type ReactNode } from "react";
import { PREPARED_MEDIA } from "@/app/components/media-sync/PreparedMediaStatus";

export default function MediaConnectionCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const trackId = useId();

  function move(direction: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({
      left: direction * (track.clientWidth + 10),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  return (
    <div className="mt-3 min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <button type="button" aria-label="이전 매체 보기" aria-controls={trackId} onClick={() => move(-1)} className="rounded-lg border border-white/20 px-3 py-1.5 text-lg text-[#e8e4ff] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#B7D7E3]">←</button>
        <span className="text-[11px] text-[#bbb8d4]">좌우로 이동하여 매체를 확인하세요</span>
        <button type="button" aria-label="다음 매체 보기" aria-controls={trackId} onClick={() => move(1)} className="rounded-lg border border-white/20 px-3 py-1.5 text-lg text-[#e8e4ff] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#B7D7E3]">→</button>
      </div>
      <div ref={trackRef} id={trackId} role="region" aria-label="매체 계정 연결 목록" tabIndex={0} className="media-connection-track">
        {children}
        {PREPARED_MEDIA.map(media => (
          <div key={media.name} className="min-w-0 rounded-[14px] border border-white/10 bg-[rgba(42,33,87,0.82)] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[13px] font-black text-[#f7f7ff]">{media.name}</div>
              <span className="rounded-full border border-[#7FA6C4]/30 bg-[#7FA6C4]/10 px-2 py-1 text-[10px] font-bold text-[#B7D7E3]">동기화 비활성</span>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-[#bbb8d4]">{media.detail}</p>
            <p className="mt-4 text-[11px] leading-5 text-[#bbb8d4]">연동 준비 단계입니다. 아직 계정을 연결하거나 보고서 수집 대상으로 선택할 수 없습니다.</p>
          </div>
        ))}
      </div>
      <style jsx>{`
        .media-connection-track {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: calc((100% - 20px) / 3);
          gap: 10px;
          overflow-x: scroll;
          overscroll-behavior-x: contain;
          scroll-snap-type: x mandatory;
          padding-bottom: 12px;
          scrollbar-color: #7fa6c4 rgba(255, 255, 255, 0.08);
          scrollbar-width: auto;
        }
        .media-connection-track > :global(*) { min-width: 0; scroll-snap-align: start; }
        .media-connection-track::-webkit-scrollbar { height: 9px; }
        .media-connection-track::-webkit-scrollbar-track { background: rgba(255,255,255,0.08); border-radius: 999px; }
        .media-connection-track::-webkit-scrollbar-thumb { background: #7fa6c4; border-radius: 999px; }
        @media (max-width: 767px) { .media-connection-track { grid-auto-columns: 100%; } }
      `}</style>
    </div>
  );
}
