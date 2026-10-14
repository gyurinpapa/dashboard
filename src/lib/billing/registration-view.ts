import {canUse,refundAmount,REGISTRATION_VERSION,type Registration} from './unassigned-lifecycle';
import type {RegistrationRow} from './review/registration-store';
function state(row:RegistrationRow):Registration {
  return {version:REGISTRATION_VERSION,orderId:row.order_id,advertiserId:row.advertiser_id,buyerId:row.buyer_id,
    companyId:row.company_id,tenantId:row.tenant_id,name:row.name,amount:row.amount,payment:row.payment_status,
    approvedAt:row.approved_at,assignment:row.workspace_id&&row.started_at&&row.paid_until
      ?{workspaceId:row.workspace_id,assignedBy:row.assigned_by||'',startedAt:row.started_at,paidUntil:row.paid_until}:null};
}
export function registrationUsable(row:RegistrationRow,now:string){return canUse(state(row),now);}
export function registrationRefundEstimate(row:RegistrationRow,now:string){
  if(row.payment_status==='refunded'||row.payment_status==='review')return 0;
  if(row.refund_amount!==null)return row.refund_amount;
  return refundAmount(state(row),now);
}
