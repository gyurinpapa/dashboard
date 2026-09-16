'use client';
import {useMemo,useState,useRef,useEffect} from 'react';
import {groupReferences} from '@/src/lib/creative-metadata/view';
import {CreativeMetadataProvider,CreativeMetadataPanel} from './CreativeMetadata';
export default function CreativeMetadataAdmin({reportId,rows,fetcher}:{reportId:string;rows:readonly unknown[];fetcher:typeof fetch}){
 const [targets,setTargets]=useState<readonly unknown[]|null>(null),[next,setNext]=useState<number|null>(null),[ingestion,setIngestion]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const visible=targets??rows,names=useMemo(()=>[...groupReferences(visible,'creative')].filter(([,g])=>g.refs.length).map(([k])=>k),[visible]);
 const [selected,setSelected]=useState('');const name=names.includes(selected)?selected:names[0]??'';
 const abort=useRef<AbortController|null>(null),active=useRef(false);
 useEffect(()=>()=>{abort.current?.abort();abort.current=null;},[]);
 async function discover(more=false){
  if(active.current)return;active.current=true;setBusy(true);setMessage('');const c=new AbortController();abort.current=c;const t=setTimeout(()=>c.abort(),18000);
  try{const response=await fetcher(`/api/reports/${encodeURIComponent(reportId)}/creative-metadata/targets`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(more?{afterRowIndex:next,ingestionId:ingestion}:{}),signal:c.signal,cache:'no-store'});
   const d=await response.json();if(!response.ok||d.status!=='ready'||!Array.isArray(d.rows)||d.rows.length>20||typeof d.ingestionId!=='string'||!(d.nextRowIndex===null||Number.isSafeInteger(d.nextRowIndex)&&d.nextRowIndex>=0))throw Error('소재 목록을 확인할 수 없습니다. 권한과 연결 상태를 확인해 주세요.');
   if(c.signal.aborted)return;setTargets(d.rows);setNext(d.nextRowIndex);setIngestion(d.ingestionId);setSelected('');setMessage(d.rows.length?'':'이 구간에 지원되는 소재가 없습니다.');
  }catch(e){if(abort.current===c){setTargets([]);setNext(null);setMessage(c.signal.aborted?'조회 시간이 초과되었습니다.':e instanceof Error?e.message:'소재 목록을 확인할 수 없습니다.');}}
  finally{clearTimeout(t);if(abort.current===c)setBusy(false);active.current=false;}
 }
 return <section className="rounded-2xl border border-[#B7D7E3] bg-white p-4 text-slate-700"><h2 className="font-semibold">광고 소재 이미지·문구</h2>
  <div className="my-2 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void discover()} className="rounded border px-3 py-2">소재 목록 불러오기</button>{next!==null&&<button type="button" disabled={busy} onClick={()=>void discover(true)} className="rounded border px-3 py-2">다음 소재 목록</button>}
  {!!names.length&&<select aria-label="소재 정보 확인 대상" className="max-w-full rounded border p-2" value={name} onChange={e=>setSelected(e.target.value)}>{names.map(n=><option key={n} value={n}>{n}</option>)}</select>}</div>
  <p role="status" className="text-sm">{busy?'확인 중…':message}</p>
  <CreativeMetadataProvider source={{kind:'report',reportId,fetcher}} rows={visible} kind="creative"><CreativeMetadataPanel name={name}/></CreativeMetadataProvider>
 </section>;
}
