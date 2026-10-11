import assert from 'node:assert/strict';
const user='11111111-1111-4111-a111-111111111111',oid='22222222-2222-4222-a222-222222222222';
Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',BILLING_REVIEW_ENABLED:'true',BILLING_REVIEW_SUPABASE_URL:'https://kbqyszbuxojofugqfjbh.supabase.co',BILLING_REVIEW_SERVICE_ROLE_KEY:'synthetic',BILLING_REVIEW_ORIGIN:'http://localhost:3000',BILLING_REVIEW_USER_IDS:user,BILLING_REVIEW_STATE_SECRET:'x'.repeat(32),BILLING_REVIEW_TOSS_CLIENT_KEY:'test_ck_synthetic',BILLING_REVIEW_TOSS_SECRET_KEY:'test_sk_synthetic'});
(async()=>{
 const {manage}=await import('../src/lib/billing/review/server');
 const {verifiedPayment}=await import('../src/lib/billing/review/toss');
 for(const scenario of ['full','partial','completed','provider-timeout-success','provider-failed','foreign-user','mismatched-merchant','mismatched-key']){
  let status='DONE',balance=39000,completed=scenario==='completed',cancelCalls=0;
  const amount=scenario==='partial'?26000:39000;
  globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input)),method=init?.method||'GET',body=init?.body?JSON.parse(String(init.body)):{};
   const response=(value:unknown,code=200)=>Response.json(value,{status:code});
   if(url.origin==='https://api.tosspayments.com'){
    if(method==='POST'){
     cancelCalls++;assert.equal(body.cancelAmount,amount);assert.equal((init?.headers as Record<string,string>)['Idempotency-Key'],`policy-refund-${oid}`);
     if(scenario==='provider-failed')return response({},502);
     balance=39000-amount;status=balance?'PARTIAL_CANCELED':'CANCELED';
     if(scenario==='provider-timeout-success')throw new Error('synthetic timeout after provider success');
    }
    return response({orderId:oid,paymentKey:scenario==='mismatched-key'?'wrong':oid,totalAmount:39000,balanceAmount:balance,status,currency:'KRW',approvedAt:'2026-10-10T00:00:00Z',mId:scenario==='mismatched-merchant'?'wrong':'tetryluei6e'});
   }
   assert.equal(url.origin,process.env.BILLING_REVIEW_SUPABASE_URL,'No live external request allowed');
   const table=url.pathname.split('/').pop();
   if(table==='billing_test_orders')return response({id:oid,user_id:user,mode:'once',status:'active',amount:39000,anchor_at:'2026-10-10T00:00:00Z'});
   if(table==='billing_test_charges')return response({id:oid,order_id:oid,amount:39000,status:'done',payment_key:oid,cycle:1});
   if(table==='billing_test_request_refund'){assert.equal(body.p_user,user);return response({charge_id:oid,amount,status:completed?'completed':'pending'});}
   if(table==='billing_test_settle_refund'){
    assert.equal(body.p.balance_amount,balance);
    if(status!=='DONE')completed=true;
    return response(null);
   }
   if(table==='billing_test_refund_requests')return response({amount,status:completed?'completed':'pending'});
   throw new Error(`Unexpected route: ${url.pathname}`);
  };
  const run=()=>manage(scenario==='foreign-user'?'33333333-3333-4333-a333-333333333333':user,oid,'refund');
  if(scenario==='foreign-user')await assert.rejects(run,/ORDER_NOT_FOUND/);
  else if(scenario==='provider-failed')await assert.rejects(run,/REFUND_PENDING_RECONCILIATION/);
  else if(scenario==='mismatched-merchant')await assert.rejects(run,/REVIEW_MERCHANT_MISMATCH/);
  else if(scenario==='mismatched-key')await assert.rejects(run,/PAYMENT_VERIFICATION_FAILED/);
  else await run();
  assert.equal(cancelCalls,['completed','foreign-user','mismatched-merchant','mismatched-key'].includes(scenario)?0:1,scenario);
  console.log(`PASS refund server ${scenario}`);
 }
 const base={orderId:oid,paymentKey:oid,totalAmount:39000,balanceAmount:10000,status:'PARTIAL_CANCELED',currency:'KRW',approvedAt:'2026-10-10T00:00:00Z'};
 for(const balanceAmount of [0,39000,-1,1.2,40000])assert.throws(()=>verifiedPayment({...base,balanceAmount},{id:oid,amount:39000}),/PAYMENT_VERIFICATION_FAILED/);
 console.log('REFUND_SERVER_VERIFIED 8 scenarios + balance validation, intercepted requests only');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
