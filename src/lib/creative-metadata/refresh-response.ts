/** Public fixed codes only; never return provider messages, credentials or raw errors. */
export function refreshHttpResponse(result:{status:string;problem:unknown;hasMore:boolean;retryAt:number|null}){
 let http=200,problem:string|null=null;
 if(result.status==='rejected'){
  if(result.problem==='TIMEOUT'){http=504;problem='TIMEOUT';}
  else if(result.problem==='STALE_CONTEXT'){http=409;problem='STALE_CONTEXT';}
  else if(['ABORTED','DEPENDENCY_ERROR','TRANSPORT_ERROR','PROVIDER_ERROR'].includes(String(result.problem))){http=503;problem='TEMPORARY_FAILURE';}
  else {http=403;problem='ACCESS_OR_CONTEXT_REJECTED';}
 }
 return {http,body:{status:result.status,hasMore:result.hasMore,retryAt:result.retryAt,...(problem?{problem}:{})}};
}

/** Shared with the editor so a processing timeout cannot be described as an auth failure. */
export function refreshErrorMessage(http:number,value:unknown):string|null{
 const result=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 if(result.problem==='TIMEOUT'||http===504)return '소재 정보를 처리하는 중 시간이 초과되었습니다. 저장 완료 여부를 확인하지 못했습니다.';
 if(result.status==='disabled')return '소재 정보 가져오기 기능이 비활성화되어 있습니다.';
 if(result.problem==='STALE_CONTEXT'||http===409)return '보고서 또는 연결 정보가 변경되었습니다. 화면을 새로고침해 주세요.';
 if(result.problem==='TEMPORARY_FAILURE'||http>=500)return '소재 정보를 처리하는 중 일시적인 오류가 발생했습니다. 저장 완료 여부를 확인하지 못했습니다.';
 if(http<200||http>=300||result.status==='rejected')return '소재 정보 요청이 거부되었습니다. 접근 권한 또는 보고서 연결 상태를 확인해 주세요.';
 return null;
}
