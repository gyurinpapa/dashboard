"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ProviderKey = "naver" | "google" | "meta";

type ProviderState = {
  key: ProviderKey;
  label: string;
  status: "disconnected" | "connected";
  connectedAt?: string; // ISO
  accountName?: string;
};

const LS_KEY = "report-system:integrations:v1";

function loadStates(): Record<ProviderKey, ProviderState> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

function saveStates(states: Record<ProviderKey, ProviderState>) {
  localStorage.setItem(LS_KEY, JSON.stringify(states));
}

function isoNow() {
  return new Date().toISOString();
}

function formatKST(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function SettingsPage() {
  const defaultStates = useMemo<Record<ProviderKey, ProviderState>>(
    () => ({
      naver: { key: "naver", label: "네이버", status: "disconnected" },
      google: { key: "google", label: "Google Ads", status: "disconnected" },
      meta: { key: "meta", label: "Meta Ads", status: "disconnected" },
    }),
    []
  );

  const [states, setStates] =
    useState<Record<ProviderKey, ProviderState>>(defaultStates);

  const [modal, setModal] = useState<{
    open: boolean;
    provider?: ProviderKey;
  }>({ open: false });

  useEffect(() => {
    const loaded = loadStates();
    if (loaded) setStates({ ...defaultStates, ...loaded });
  }, [defaultStates]);

  useEffect(() => {
    // defaultStates는 초기 렌더 때도 저장되면 안 되므로
    // "실제 로드 이후"에도 잘 동작하도록 간단 저장만 수행
    saveStates(states);
  }, [states]);

  const openConnect = (provider: ProviderKey) => setModal({ open: true, provider });
  const closeModal = () => setModal({ open: false });

  // “연동됨” 시뮬레이션 버튼(개발 중 테스트용)
  const devMarkConnected = (provider: ProviderKey) => {
    setStates((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        status: "connected",
        connectedAt: isoNow(),
        accountName:
          provider === "naver"
            ? "Naver SearchAd (예시)"
            : provider === "google"
            ? "Google Ads Account (예시)"
            : "Meta Business (예시)",
      },
    }));
  };

  const disconnect = (provider: ProviderKey) => {
    setStates((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        status: "disconnected",
        connectedAt: undefined,
        accountName: undefined,
      },
    }));
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* 상단 타이틀 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">설정</h1>
          <p className="mt-1 text-sm text-gray-600">
            광고 계정 연동 상태를 확인하고, 향후 자동 수집 기능(네이버/구글/메타)을 붙일 자리입니다.
          </p>
        </div>

        {/* 홈(보고서)로 돌아가기 - 경로는 네 프로젝트에 맞게 수정 가능 */}
        <Link
          href="/"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
        >
          ← 보고서로
        </Link>
      </div>

      {/* 섹션: 연동 */}
      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">광고 플랫폼 연동</h2>
            <p className="mt-1 text-sm text-gray-600">
              지금은 UI/구조만 먼저 만들고, 다음 단계에서 OAuth + API 수집을 붙입니다.
            </p>
          </div>

          {/* 개발용(원하면 나중에 삭제) */}
          <span className="text-xs text-gray-400">
            *개발 중이므로 “연동됨”은 시뮬레이션 버튼으로 표시됩니다.
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <IntegrationCard
            state={states.naver}
            onConnect={() => openConnect("naver")}
            onDisconnect={() => disconnect("naver")}
            onDevMarkConnected={() => devMarkConnected("naver")}
          />
          <IntegrationCard
            state={states.google}
            onConnect={() => openConnect("google")}
            onDisconnect={() => disconnect("google")}
            onDevMarkConnected={() => devMarkConnected("google")}
          />
          <IntegrationCard
            state={states.meta}
            onConnect={() => openConnect("meta")}
            onDisconnect={() => disconnect("meta")}
            onDevMarkConnected={() => devMarkConnected("meta")}
          />
        </div>
      </section>

      {/* 섹션: 다음 단계 안내 */}
      <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-base font-semibold">다음 단계(로드맵)</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>
            <b>OAuth 콜백 URL</b>을 만들고, “연동하기” 버튼이 해당 인증 페이지로 이동하도록 연결
          </li>
          <li>
            인증 성공 시 발급되는 <b>토큰/계정 정보</b>를 DB에 저장
          </li>
          <li>
            크론(스케줄러)로 <b>일 단위 성과</b>를 수집해 DB에 적재
          </li>
          <li>
            대시보드가 CSV 대신 <b>DB 데이터를 읽어 렌더링</b>하도록 교체
          </li>
        </ol>
      </section>

      {/* 모달 */}
      {modal.open && (
        <Modal onClose={closeModal}>
          <h4 className="text-lg font-semibold">
            {modal.provider === "naver"
              ? "네이버 연동"
              : modal.provider === "google"
              ? "Google Ads 연동"
              : "Meta Ads 연동"}
          </h4>

          <div className="mt-3 space-y-2 text-sm text-gray-700">
            <p>
              지금은 “연동 UI 자리”만 만든 상태야.
              다음 단계에서 실제로는 <b>OAuth 인증 흐름</b>을 붙여서,
              광고 계정 접근 권한을 받고 토큰을 저장해야 해.
            </p>
            <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              ✅ 앞으로 붙일 것: <br />
              - /api/integrations/{`{provider}`}/start (인증 시작) <br />
              - /api/integrations/{`{provider}`}/callback (인증 콜백) <br />
              - DB: integrations 테이블(토큰/계정/연동자) <br />
              - 스케줄러: 일/주 단위 성과 수집
            </p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={closeModal}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
            >
              닫기
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function IntegrationCard(props: {
  state: ProviderState;
  onConnect: () => void;
  onDisconnect: () => void;
  onDevMarkConnected: () => void;
}) {
  const { state, onConnect, onDisconnect, onDevMarkConnected } = props;

  const badge =
    state.status === "connected" ? (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
        ● 연동됨
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
        ● 미연동
      </span>
    );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{state.label}</div>
          <div className="mt-1 text-xs text-gray-500">
            연결 계정: {state.accountName ?? "-"}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            연결 시각: {formatKST(state.connectedAt)}
          </div>
        </div>
        {badge}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onConnect}
          className="rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90"
        >
          연동하기
        </button>

        {state.status === "connected" ? (
          <button
            onClick={onDisconnect}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
          >
            연동 해제
          </button>
        ) : (
          <button
            onClick={onDevMarkConnected}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
            title="개발 중 테스트용 버튼(나중에 삭제)"
          >
            (개발용) 연동됨 표시
          </button>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        <b>설명</b>
        <div className="mt-1">
          “연동하기”는 나중에 OAuth 인증으로 이어질 버튼이야. 지금은 안내 모달만 띄웁니다.
        </div>
      </div>
    </div>
  );
}

function Modal(props: { onClose: () => void; children: React.ReactNode }) {
  const { onClose, children } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-lg">
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-50"
            aria-label="close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
