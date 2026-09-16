'use client';

import {createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import type {ReactNode} from 'react';
import type {CreativeMetadataSource} from './CreativeMetadata';
import {groupReferences, refKey, validateViewEntry} from '@/src/lib/creative-metadata/view';
import type {DisplayGroup, Ref, ViewEntry} from '@/src/lib/creative-metadata/view';

type ReadState = 'pending' | 'ready' | 'empty' | 'unavailable' | 'expired';
const enabled = process.env.NEXT_PUBLIC_CREATIVE_METADATA_UI_ENABLED === '1';
const MAX_REFS = 400;
const PAGE_SIZE = 20;

/** Cache reads only. This client has no discovery, refresh or provider API path. */
export class PreviewCacheReader {
  readonly entries = new Map<string, ViewEntry>();
  readonly states = new Map<string, ReadState>();
  private queue = new Map<string, Ref>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  constructor(readonly source: CreativeMetadataSource) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.revision;
  private emit() { if (!this.disposed) { this.revision++; this.listeners.forEach(fn => fn()); } }
  request(refs: readonly Ref[]) {
    if (this.disposed) return;
    for (const ref of refs) {
      const key = refKey(ref);
      if (this.states.has(key) || this.states.size >= MAX_REFS) continue;
      this.states.set(key, 'pending'); this.queue.set(key, ref);
    }
    if (this.queue.size && !this.running && !this.timer) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.drain(); }, 25);
    }
    this.emit();
  }
  private expire() {
    clearTimeout(this.expiry);
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) {
      this.entries.delete(key); this.states.set(key, 'expired');
    }
    if (this.entries.size) this.expiry = setTimeout(() => { this.expire(); this.emit(); },
      Math.max(1, Math.min(...[...this.entries.values()].map(e => e.expiresAt)) - now));
  }
  private async drain() {
    if (this.disposed || this.running) return;
    this.running = true;
    try {
      while (this.queue.size && !this.disposed) {
        const first = this.queue.values().next().value!;
        const refs = [...this.queue.values()].filter(r => r.provider === first.provider && r.externalAccountId === first.externalAccountId).slice(0, PAGE_SIZE);
        refs.forEach(r => this.queue.delete(refKey(r)));
        const controller = new AbortController(); this.controller = controller;
        const timeout = setTimeout(() => controller.abort(), 18000);
        try {
          const base = this.source.kind === 'share'
            ? `/api/share/${encodeURIComponent(this.source.token)}/creative-metadata`
            : `/api/reports/${encodeURIComponent(this.source.reportId)}/creative-metadata`;
          const fetcher = this.source.kind === 'report' ? this.source.fetcher : fetch;
          const response = await fetcher(base, {method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({provider: first.provider, externalAccountId: first.externalAccountId, entityIds: refs.map(r => r.entityId)}),
            cache: 'no-store', credentials: 'same-origin', referrerPolicy: 'no-referrer', signal: controller.signal});
          if (!response.ok) throw Error('CACHE_UNAVAILABLE');
          const data = await response.json();
          if (data.status !== 'ready' || !Array.isArray(data.entries) || data.entries.length > PAGE_SIZE) throw Error('CACHE_UNAVAILABLE');
          const valid = data.entries.map((e: unknown) => validateViewEntry(e, refs, Date.now())) as (ViewEntry | null)[];
          if (valid.some(e => !e) || new Set(valid.map(e => refKey(e!.ref))).size !== valid.length) throw Error('INVALID_CACHE');
          if (this.disposed) continue;
          if (controller.signal.aborted) throw Error('CACHE_TIMEOUT');
          refs.forEach(r => this.states.set(refKey(r), 'empty'));
          valid.forEach(e => { this.entries.set(refKey(e!.ref), e!); this.states.set(refKey(e!.ref), 'ready'); });
          this.expire();
        } catch {
          if (!this.disposed) refs.forEach(r => this.states.set(refKey(r), 'unavailable'));
        } finally { clearTimeout(timeout); this.emit(); }
      }
    } finally { this.running = false; }
  }
  dispose() {
    this.disposed = true; clearTimeout(this.timer); clearTimeout(this.expiry);
    this.controller?.abort(); this.queue.clear(); this.listeners.clear();
  }
}

type State = {reader: PreviewCacheReader; groups: Map<string, DisplayGroup>};
const Context = createContext<State | null>(null);
const noSubscribe = () => () => {};
const zero = () => 0;

export function CachedCreativeProvider({source, rows, kind, children}: {
  source?: CreativeMetadataSource; rows: readonly unknown[]; kind: 'creative' | 'detail'; children: ReactNode;
}) {
  const groups = useMemo(() => enabled && source ? groupReferences(rows, kind) : new Map<string, DisplayGroup>(), [rows, kind, source?.kind]);
  if (!enabled || !source) return <>{children}</>;
  // A source or identity/grouping change creates an isolated cache and aborts late responses.
  const key = JSON.stringify([source.kind, source.kind === 'share' ? source.token : source.reportId, [...groups]]);
  return <Scope key={key} source={source} groups={groups}>{children}</Scope>;
}
function Scope({source, groups, children}: {source: CreativeMetadataSource; groups: Map<string, DisplayGroup>; children: ReactNode}) {
  const [reader, setReader] = useState<PreviewCacheReader | null>(null);
  useEffect(() => { const next = new PreviewCacheReader(source); setReader(next); return () => next.dispose(); }, [source.kind, source.kind === 'share' ? source.token : source.reportId, source.kind === 'report' ? source.fetcher : null]);
  const value = useMemo(() => reader ? {reader, groups} : null, [reader, groups]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
function useCached(name: string | null) {
  const ctx = useContext(Context);
  useSyncExternalStore(ctx?.reader.subscribe ?? noSubscribe, ctx?.reader.snapshot ?? zero, zero);
  const group = name ? ctx?.groups.get(name) : undefined;
  const entries = (group?.refs ?? []).map(r => ctx?.reader.entries.get(refKey(r))).filter((e): e is ViewEntry => !!e && e.expiresAt > Date.now());
  const single = group && !group.unresolved && group.refs.length === 1 ? entries[0] : undefined;
  return {ctx, group, entries, single};
}
function useVisibleRead(name: string, page = 0) {
  const state = useCached(name), anchor = useRef<HTMLSpanElement>(null);
  const {ctx, group} = state;
  useEffect(() => {
    if (!ctx || !group?.refs.length || !anchor.current) return;
    const read = () => ctx.reader.request(group.refs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    if (typeof IntersectionObserver === 'undefined') { read(); return; }
    const observer = new IntersectionObserver(items => { if (items.some(item => item.isIntersecting)) { observer.disconnect(); read(); } }, {rootMargin: '120px'});
    observer.observe(anchor.current); return () => observer.disconnect();
  }, [ctx?.reader, group, page]);
  return {...state, anchor};
}
export function CachedCreativeLabel({name}: {name: string}) {
  const {anchor, single} = useVisibleRead(name);
  return <span ref={anchor}>{single?.displayName || name}</span>;
}
function PreviewImage({src, alt, small = false}: {src: string; alt: string; small?: boolean}) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="text-xs text-slate-400">이미지를 표시할 수 없습니다.</span> : <img
    src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
    className={small ? 'h-12 w-12 object-cover' : 'max-h-60 w-full object-contain'}/>;
}
export function CachedCreativeThumbnail({name, fallbackUrl = ''}: {name: string; fallbackUrl?: string}) {
  const {anchor, single} = useVisibleRead(name);
  const image = fallbackUrl || single?.assets.find(a => a.imageUrl)?.imageUrl;
  const label = single?.assets.some(a => a.kind === 'youtube') ? '영상' : single && (single.headlines.length || single.descriptions.length) ? '문구' : 'AD';
  return <span ref={anchor} className="flex h-12 w-12 items-center justify-center overflow-hidden text-[10px] font-semibold text-slate-400">
    {image ? <PreviewImage key={image} src={image} alt={single?.displayName || name} small/> : label}
  </span>;
}
export function CachedCreativeHint({name, fallbackUrl = ''}: {name: string; fallbackUrl?: string}) {
  const {single} = useCached(name);
  return <>{fallbackUrl || single?.assets.some(a => a.imageUrl) ? '이미지 미리보기' : single?.assets.some(a => a.kind === 'youtube') ? '영상 미리보기' : single ? '문구 미리보기' : '소재 미리보기'}</>;
}
export function CachedCreativePreview({name, fallbackUrl = ''}: {name: string | null; fallbackUrl?: string}) {
  return <PreviewBody key={name || ''} name={name || ''} fallbackUrl={fallbackUrl}/>;
}
function PreviewBody({name, fallbackUrl}: {name: string; fallbackUrl: string}) {
  const [page, setPage] = useState(0);
  const {anchor, ctx, group, entries} = useVisibleRead(name, page);
  const refs = group?.refs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  const keys = new Set(refs.map(refKey));
  const visible = entries.filter(e => keys.has(refKey(e.ref)));
  const pending = !!ctx && refs.some(r => ctx.reader.states.get(refKey(r)) === 'pending' || !ctx.reader.states.has(refKey(r)) && ctx.reader.states.size < MAX_REFS);
  const limited = !!ctx && refs.some(r => !ctx.reader.states.has(refKey(r))) && ctx.reader.states.size >= MAX_REFS;
  const unavailable = refs.some(r => ctx?.reader.states.get(refKey(r)) === 'unavailable');
  const expired = refs.some(r => ctx?.reader.states.get(refKey(r)) === 'expired');
  return <div data-cached-creative-preview className="max-h-[360px] overflow-auto p-3 text-sm text-slate-700">
    <span ref={anchor}/>
    {fallbackUrl && <PreviewImage key={fallbackUrl} src={fallbackUrl} alt={name}/>}
    {visible.map(entry => <EntryContent key={refKey(entry.ref) + ':' + entry.fetchedAt} entry={entry} fallbackUrl={fallbackUrl} name={name} grouped={!!group && group.refs.length > 1}/>)}
    {!visible.length && !fallbackUrl && <p role="status" className="flex min-h-32 items-center justify-center px-2 text-center text-xs text-slate-400">
      {pending ? '저장된 소재를 확인하고 있습니다.' : limited ? '소재를 더 확인하려면 필터 범위를 좁혀 주세요.' : unavailable ? '소재 정보를 표시할 수 없습니다.' : expired ? '저장된 소재 정보의 유효기간이 지났습니다.' : '저장된 소재 정보가 없습니다.'}
    </p>}
    {group && group.refs.length > PAGE_SIZE && <div className="flex items-center justify-between gap-2 text-xs">
      <button type="button" disabled={!page} onClick={() => setPage(p => p - 1)}>이전 소재</button>
      <span>{page + 1} / {Math.ceil(group.refs.length / PAGE_SIZE)}</span>
      <button type="button" disabled={(page + 1) * PAGE_SIZE >= group.refs.length} onClick={() => setPage(p => p + 1)}>다음 소재</button>
    </div>}
  </div>;
}

function EntryContent({entry, fallbackUrl, name, grouped}: {entry: ViewEntry; fallbackUrl: string; name: string; grouped: boolean}) {
  const [assetPage, setAssetPage] = useState(0);
  return <div className="space-y-2 py-2">
    {grouped && <div className="break-all text-xs text-slate-500">{entry.displayName || entry.ref.entityId} · {entry.ref.entityId}</div>}
    {entry.headlines.map((text, i) => <p key={'h' + i} className="break-words font-semibold">{text}</p>)}
    {entry.descriptions.map((text, i) => <p key={'d' + i} className="break-words leading-6">{text}</p>)}
    {entry.assets.slice(assetPage * 12, (assetPage + 1) * 12).map((asset, i) => <figure key={asset.assetId + ':' + i} className="space-y-1">
      {asset.imageUrl && asset.imageUrl !== fallbackUrl && <PreviewImage key={asset.imageUrl} src={asset.imageUrl} alt={entry.displayName || name}/>}
      {asset.kind === 'youtube' && asset.watchUrl && <a href={asset.watchUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="text-blue-700 underline">YouTube에서 영상 보기</a>}
    </figure>)}
    {entry.assets.length > 12 && <button type="button" onClick={() => setAssetPage(p => (p + 1) % Math.ceil(entry.assets.length / 12))} className="text-xs text-blue-700">다음 자산 ({assetPage + 1}/{Math.ceil(entry.assets.length / 12)})</button>}
  </div>;
}
