'use client';
import { useEffect, useState } from 'react';
type Access = { key: string; eligible: boolean; failed: boolean };
export function useCreationAccess(enabled: boolean, workspace: string, advertiser: string) {
  const key = enabled && workspace && advertiser ? `${workspace}:${advertiser}` : '';
  const [result, setResult] = useState<Access | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const query = new URLSearchParams({ workspace, advertiser });
        const response = await fetch(`/api/billing/review/creation-access?${query}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const access = await response.json();
        if (typeof access.eligible !== 'boolean') throw new Error();
        if (!controller.signal.aborted) {
          setResult({ key, eligible: access.eligible, failed: false });
          if (timer) clearTimeout(timer);
          if (access.eligible && access.paidUntil) {
            const delay = Date.parse(access.paidUntil) - Date.now();
            if (Number.isFinite(delay) && delay > 0 && delay < 2147483647)
              timer = setTimeout(() => { setResult(null); void check(); }, delay + 10);
          }
        }
      } catch {
        if (!controller.signal.aborted) setResult({ key, eligible: false, failed: true });
      } finally { pending = false; }
    }
    const focus = () => { setResult(null); void check(); };
    void check();
    window.addEventListener('focus', focus);
    return () => { controller.abort(); if (timer) clearTimeout(timer); window.removeEventListener('focus', focus); };
  }, [key, workspace, advertiser, revision]);
  const current = result?.key === key ? result : null;
  const blocked = !!key && (!current || !current.eligible);
  const message = !current ? '이용권을 확인하고 있습니다.' : current.failed
    ? '이용권을 확인하지 못했습니다. 다시 확인해 주세요. 새 리포트 생성은 잠시 중지됩니다.'
    : '사용 가능한 이용권이 없습니다. 이용권 구매 후 새 리포트를 만들 수 있습니다.';
  return { blocked, message, failed: !!current?.failed, denied: !!current && !current.failed && !current.eligible,
    refresh: () => { setResult(null); setRevision(v => v + 1); } };
}
