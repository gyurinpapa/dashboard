'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import styles from '../../pricing/billing.module.css';
export default function AssignForm({orderId,destinations}:{orderId:string;destinations:{id:string;name:string}[]}){
  const [workspace,setWorkspace]=useState(destinations.length===1?destinations[0].id:''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const pending=useRef(false),router=useRouter();
  if(!destinations.length)return <p className={styles.details}>현재 배정할 수 있는 워크스페이스가 없습니다. 같은 회사·조직 내 배정 권한과 구매자의 워크스페이스 접근 권한을 확인해주세요.</p>;
  async function submit(event:React.FormEvent){
    event.preventDefault();if(pending.current||!workspace)return;pending.current=true;setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/billing/registrations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,workspaceId:workspace})});
      if(!response.ok){const value=await response.json();throw new Error(value.error);}
      setMessage('배정이 완료되었습니다. 배정 완료 시각부터 1개월 이용기간이 시작됩니다.');router.refresh();
    }catch(error){const code=error instanceof Error?error.message:'';
      setMessage(code==='BUYER_DESTINATION_ACCESS_REQUIRED'?'구매자의 대상 워크스페이스 접근 권한이 필요합니다. 접근 권한을 설정한 뒤 다시 확인해주세요.':
        code==='VERIFIED_PAYMENT_REQUIRED'?'환불·결제 상태가 변경되어 배정할 수 없습니다. 결제 상태를 먼저 확인해주세요.':
        code==='ALREADY_ASSIGNED'?'이미 다른 워크스페이스에 배정되었습니다. 새로고침해서 최신 상태를 확인해주세요.':
        '배정 완료 여부를 확인하지 못했습니다. 새로고침 후 미등록 목록을 확인해주세요. 재시도로 이용기간이 늘어나지는 않습니다.');
    }finally{pending.current=false;setBusy(false);}
  }
  return <form onSubmit={submit}><label className={styles.label} htmlFor={`assign-${orderId}`}>관리자 워크스페이스 배정</label>
    <select id={`assign-${orderId}`} className={styles.select} value={workspace} onChange={e=>setWorkspace(e.target.value)} disabled={busy} required><option value=''>워크스페이스 선택</option>{destinations.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
    <button className={styles.button} disabled={busy||!workspace}>{busy?'배정 확인 중…':'배정하고 이용 시작'}</button><p role='status'>{message}</p></form>;
}
