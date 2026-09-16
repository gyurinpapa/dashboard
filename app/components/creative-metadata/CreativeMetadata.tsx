'use client';
import {createContext,useContext,useMemo,useState,useEffect,useRef} from 'react';
import type {ReactNode} from 'react';
import {groupReferences,refKey,validateViewEntry} from '@/src/lib/creative-metadata/view';
import type {DisplayGroup,Ref,ViewEntry,ViewRequest} from '@/src/lib/creative-metadata/view';
export type CreativeMetadataSource={kind:'share';token:string}|{kind:'report';reportId:string;fetcher:typeof fetch};
type State={source:CreativeMetadataSource;groups:Map<string,DisplayGroup>;entries:ReadonlyMap<string,ViewEntry>;clear:()=>void;store:(entries:readonly ViewEntry[])=>void};
const Context=createContext<State|null>(null);
const uiEnabled=process.env.NEXT_PUBLIC_CREATIVE_METADATA_UI_ENABLED==='1';
function sourceKey(s?:CreativeMetadataSource){return s?.kind==='share'?'share:'+s.token:s?.kind==='report'?'report:'+s.reportId:'';}
export function CreativeMetadataProvider({source,rows,kind,children}:{source?:CreativeMetadataSource;rows:readonly unknown[];kind:'creative'|'detail';children:ReactNode}){
 if(!uiEnabled||!source)return <>{children}</>;
 return <ActiveProvider key={sourceKey(source)} source={source} rows={rows} kind={kind}>{children}</ActiveProvider>;
}
function ActiveProvider({source,rows,kind,children}:{source:CreativeMetadataSource;rows:readonly unknown[];kind:'creative'|'detail';children:ReactNode}){
 const groups=useMemo(()=>groupReferences(rows,kind),[rows,kind]);
 const [entries,setEntries]=useState<ReadonlyMap<string,ViewEntry>>(new Map());
 useEffect(()=>{if(!entries.size)return;const ms=Math.max(1,Math.min(...[...entries.values()].map(e=>e.expiresAt))-Date.now());const t=setTimeout(()=>setEntries(current=>new Map([...current].filter(([,e])=>e.expiresAt>Date.now()))),ms);return()=>clearTimeout(t);},[entries]);
 const value:State={source,groups,entries,clear:()=>setEntries(new Map()),store:incoming=>setEntries(current=>{const map=new Map([...current].filter(([,e])=>e.expiresAt>Date.now()));for(const e of incoming){map.delete(refKey(e.ref));map.set(refKey(e.ref),e);}while(map.size>400)map.delete(map.keys().next().value!);return map;})};
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function CreativeMetadataLabel({name}:{name:string}){
 const ctx=useContext(Context),group=ctx?.groups.get(name);const m=group&&!group.unresolved&&group.refs.length===1?ctx?.entries.get(refKey(group.refs[0]!)):null;
 return <>{m&&m.expiresAt>Date.now()?m.displayName||name:name}</>;
}
function batches(refs:readonly Ref[]):ViewRequest[]{
 const map=new Map<string,Ref[]>();for(const r of refs){const k=JSON.stringify([r.provider,r.externalAccountId]);const list=map.get(k)??[];list.push(r);map.set(k,list);}
 return [...map.values()].flatMap(list=>{const out:ViewRequest[]=[];for(let i=0;i<list.length;i+=20)out.push({provider:list[0]!.provider,externalAccountId:list[0]!.externalAccountId,entityIds:list.slice(i,i+20).map(r=>r.entityId)});return out;});
}
export function CreativeMetadataPanel({name}:{name:string|null}){
 const ctx=useContext(Context);if(!ctx||!name)return null;const group=ctx.groups.get(name);if(!group?.refs.length)return null;
 return <Panel key={sourceKey(ctx.source)+':'+name+':'+JSON.stringify(group.refs)} ctx={ctx} name={name} group={group}/>;
}
function SafeImage({src,alt}:{src:string;alt:string}){const [failed,setFailed]=useState(false);return failed?<div className="p-5 text-sm text-slate-500">이미지를 표시할 수 없습니다.</div>:<img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)} className="h-44 w-full object-contain"/>;}
function Panel({ctx,name,group}:{ctx:State;name:string;group:DisplayGroup}){
 const pages=useMemo(()=>batches(group.refs),[group.refs]),[page,setPage]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[member,setMember]=useState(0),[assetPage,setAssetPage]=useState(0);
 const abort=useRef<AbortController|null>(null),serial=useRef(0),inFlight=useRef(false),[retryAt,setRetryAt]=useState(0);
 useEffect(()=>()=>{serial.current++;abort.current?.abort();},[]);
 useEffect(()=>{if(!retryAt)return;const t=setTimeout(()=>setRetryAt(0),Math.max(1,retryAt-Date.now()));return()=>clearTimeout(t);},[retryAt]);
 const entries=group.refs.map(r=>ctx.entries.get(refKey(r))).filter((x):x is ViewEntry=>!!x&&x.expiresAt>Date.now());const selected=entries[member]??entries[0];
 async function request(refresh=false){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setMessage('');const seq=++serial.current,controller=new AbortController();abort.current=controller;
  const timer=setTimeout(()=>controller.abort(),refresh?35000:18000),batch=pages[page];
  if(!batch){inFlight.current=false;setBusy(false);clearTimeout(timer);return;}
  const base=ctx.source.kind==='share'?`/api/share/${encodeURIComponent(ctx.source.token)}/creative-metadata`:`/api/reports/${encodeURIComponent(ctx.source.reportId)}/creative-metadata`;
  const fetcher=ctx.source.kind==='report'?ctx.source.fetcher:fetch;
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(batch),cache:'no-store' as const,credentials:'same-origin' as const,referrerPolicy:'no-referrer' as const,signal:controller.signal};
  try{
   if(refresh){const response=await fetcher(base+'/refresh',options);const result=await response.json();if(!response.ok||result.status==='disabled'||result.status==='rejected')throw Error('권한 또는 연결 상태를 확인해 주세요.');
    if(typeof result.retryAt==='number')setRetryAt(result.retryAt);
    if(['busy','cooldown','budget'].includes(result.status)){setMessage('다른 조회가 진행 중이거나 잠시 대기해야 합니다.');return;}
   }
   const response=await fetcher(base,options);if(!response.ok)throw Error('소재 정보를 확인할 수 없습니다. 기존 리포트는 계속 사용할 수 있습니다.');
   const data=await response.json();if(data.status==='disabled'){ctx.clear();setMessage('소재 정보 기능을 준비 중입니다.');return;}
   if(data.status!=='ready'||!Array.isArray(data.entries)||data.entries.length>20)throw Error('소재 정보를 확인할 수 없습니다.');
   const expected=batch.entityIds.map(entityId=>({provider:batch.provider,externalAccountId:batch.externalAccountId,entityId}));
   const valid=data.entries.map((x:unknown)=>validateViewEntry(x,expected,Date.now()));
   if(valid.some((x:ViewEntry|null)=>!x)||new Set(valid.map((x:ViewEntry)=>refKey(x.ref))).size!==valid.length)throw Error('소재 정보를 확인할 수 없습니다.');
   if(controller.signal.aborted||serial.current!==seq)return;ctx.store(valid as ViewEntry[]);setMember(0);setAssetPage(0);
   const missing=batch.entityIds.length-valid.length;
   setMessage(valid.length?`저장된 소재 ${valid.length}개를 표시합니다.${missing?` 아직 표시할 정보가 없는 소재 ${missing}개가 있습니다.`:''}`:'저장된 소재 정보가 없습니다.');
  }catch(e){if(serial.current===seq){ctx.clear();setMessage(controller.signal.aborted?'조회 시간이 초과되었습니다. 잠시 후 다시 확인해 주세요.':e instanceof Error?e.message:'소재 정보를 확인할 수 없습니다.');}}
  finally{clearTimeout(timer);if(serial.current===seq){inFlight.current=false;setBusy(false);}}
 }
 return <aside aria-label="소재 이미지 및 문구" className="my-4 rounded-2xl border border-[#B7D7E3] bg-white p-4 text-slate-700">
  <div className="flex flex-wrap items-center gap-3"><strong className="break-all"><CreativeMetadataLabel name={name}/></strong>
   <button type="button" disabled={busy} onClick={()=>void request()} className="rounded-lg border border-[#7FA6C4] px-3 py-2 text-sm disabled:opacity-40">{busy?'확인 중…':'저장된 소재 보기'}</button>
   {ctx.source.kind==='report'&&<button type="button" disabled={busy||Date.now()<retryAt} onClick={()=>void request(true)} className="rounded-lg bg-[#B7D7E3] px-3 py-2 text-sm disabled:opacity-40">광고 매체에서 소재 정보 가져오기</button>}
   {pages.length>1&&<select aria-label="소재 조회 묶음" disabled={busy} value={page} onChange={e=>setPage(Number(e.target.value))}>{pages.map((_,i)=><option key={i} value={i}>{i+1} / {pages.length}</option>)}</select>}
  </div>
  <p className="mt-2 text-xs text-slate-500">소재 문구와 이미지는 정보 수집 시점 기준입니다.</p>
  {group.unresolved&&<p className="mt-1 text-xs text-slate-500">일부 행은 광고 소재를 식별할 수 없습니다.</p>}
  <p role="status" aria-live="polite" className="mt-2 text-sm">{message}</p>
  {entries.length>1&&<select aria-label="그룹 내 광고 소재" value={member} onChange={e=>{setMember(Number(e.target.value));setAssetPage(0);}}>{entries.map((e,i)=><option key={refKey(e.ref)} value={i}>{e.displayName||e.ref.entityId}</option>)}</select>}
  {selected&&<div className="mt-3 space-y-3"><div className="text-xs text-slate-500">{selected.ref.entityId} · {new Date(selected.fetchedAt).toLocaleString('ko-KR')}</div>
   {selected.headlines.map((t,i)=><p key={'h'+i} className="break-words font-semibold">{t}</p>)}{selected.descriptions.map((t,i)=><p key={'d'+i} className="break-words text-sm">{t}</p>)}
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selected.assets.slice(assetPage*12,assetPage*12+12).map((a,i)=><figure key={a.assetId+':'+i+':'+String(a.imageUrl)} className="rounded-xl border border-slate-200 p-2">
    {a.imageUrl&&<SafeImage src={a.imageUrl} alt={selected.displayName||selected.ref.entityId}/>}
    <figcaption className="mt-1 text-xs">{a.role==='logo'?'로고':a.role==='thumbnail'?'썸네일':'광고 자산'}</figcaption>
    {a.kind==='youtube'&&a.watchUrl&&<a href={a.watchUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="text-sm text-blue-700 underline">YouTube에서 영상 보기</a>}
   </figure>)}</div>
   {selected.assets.length>12&&<button type="button" onClick={()=>setAssetPage(p=>(p+1)%Math.ceil(selected.assets.length/12))} className="rounded-lg border px-3 py-2 text-sm">다음 자산 ({assetPage+1}/{Math.ceil(selected.assets.length/12)})</button>}
  </div>}
 </aside>;
}
