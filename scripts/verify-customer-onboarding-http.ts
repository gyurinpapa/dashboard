import assert from 'node:assert/strict';
import { registrationInput, registrationAttributes, onboardingOrigin } from '../src/lib/customer-onboarding/contract';
import { POST as signup } from '../app/api/auth/signup/route';
import { POST as provision } from '../app/api/auth/onboarding/route';
const origin='http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://onboarding-fixture.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
process.env.CUSTOMER_ONBOARDING_DATABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.CUSTOMER_ONBOARDING_ORIGIN=origin;
delete process.env.VERCEL;delete process.env.VERCEL_ENV;
const input={email:'owner@example.test',password:'Synthetic-12345',companyName:'Test company',contactName:'Test owner',tenantType:'agency'};
let state='new',confirmed=false,invalid=false, calls:Array<{url:string,body:any}>=[];
const fetchBefore=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 const path=new URL(String(url)).pathname;const body=init?.body?JSON.parse(String(init.body)):null;
 calls.push({url:path,body});let result:unknown;
 if(path==='/rest/v1/rpc/reserve_etrylue_customer_signup')result=state;
 else if(path==='/auth/v1/admin/users')result={id:'11111111-1111-4111-8111-111111111111',email:input.email,email_confirmed_at:null};
 else if(path==='/auth/v1/resend')result={};
 else if(path==='/auth/v1/user'){
  if(invalid)return new Response(JSON.stringify({msg:'Invalid token'}),{status:401,headers:{'Content-Type':'application/json'}});
  result={id:'11111111-1111-4111-8111-111111111111',email:input.email,email_confirmed_at:confirmed?'2026-10-10T00:00:00Z':null};
 }else if(path==='/rest/v1/rpc/provision_etrylue_customer')result={workspace_id:'synthetic'};
 else throw new Error('UNEXPECTED_NETWORK_REQUEST '+path);
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
let checks=0;
async function test(name:string,fn:()=>Promise<void>|void){calls=[];await fn();checks++;console.log('PASS '+name);}
const req=(body:unknown=input,orig=origin)=>new Request(origin+'/api/auth/signup',{method:'POST',headers:{Origin:orig,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function main(){
try{
 await test('default disabled never reaches Auth or database',async()=>{delete process.env.CUSTOMER_ONBOARDING_ENABLED;assert.equal((await signup(req())).status,410);assert.equal(calls.length,0);});
 process.env.CUSTOMER_ONBOARDING_ENABLED='true';
 await test('foreign origin rejected before any remote request',async()=>{assert.equal((await signup(req(input,'https://other.invalid'))).status,403);assert.equal(calls.length,0);});
 await test('forged role company and app metadata rejected',async()=>{for(const extra of [{role:'master'},{company_id:'forged'},{app_metadata:{etrylue_invite_version:'1'}}])assert.equal((await signup(req({...input,...extra}))).status,400);assert.equal(calls.length,0);});
 await test('password and names are validated without authority input',()=>{assert.throws(()=>registrationInput({...input,password:'short'}));assert.throws(()=>registrationInput({...input,tenantType:'platform'}));assert.equal(registrationAttributes(registrationInput(input)).email_confirm,false);});
 await test('oversized chunked body rejected before database',async()=>{assert.equal((await signup(req({...input,companyName:'x'.repeat(5000)}))).status,413);assert.equal(calls.length,0);});
 await test('new signup creates unverified account and sends only signup confirmation',async()=>{
  assert.equal((await signup(req())).status,200);assert.equal(calls.length,3);
  const attrs=calls.find(c=>c.url.endsWith('/admin/users'))!.body;
  assert.equal(attrs.email_confirm,false);assert.equal(attrs.app_metadata.etrylue_customer_version,'1');assert.equal(attrs.app_metadata.role,undefined);
  assert.equal(calls[2].body.type,'signup');assert.equal(calls.some(c=>c.url.includes('provision_etrylue_customer')),false);
 });
 await test('pending retry resends without replacing user or password',async()=>{state='pending';assert.equal((await signup(req())).status,200);assert.equal(calls.length,2);assert.equal(calls.some(c=>c.url.includes('/admin/users')),false);});
 await test('existing account returns generic success without changing it',async()=>{state='existing';assert.equal((await signup(req())).status,200);assert.equal(calls.length,1);});
 await test('rate limited requests do not reach Auth',async()=>{state='limited';assert.equal((await signup(req())).status,429);assert.equal(calls.length,1);});
 const finish=()=>provision(new Request(origin+'/api/auth/onboarding',{method:'POST',headers:{Origin:origin,Authorization:'Bearer synthetic-token'},body:JSON.stringify({user_id:'forged-user'})}));
 await test('unverified user cannot provision',async()=>{confirmed=false;assert.equal((await finish()).status,403);assert.equal(calls.length,1);});
 await test('invalid token cannot provision',async()=>{invalid=true;assert.equal((await finish()).status,401);assert.equal(calls.length,1);invalid=false;});
 await test('verified identity comes only from Auth, never request body',async()=>{confirmed=true;assert.equal((await finish()).status,200);assert.equal(calls.length,2);assert.equal(calls[1].body.p_user_id,'11111111-1111-4111-8111-111111111111');});
 await test('unsafe production origin remains disabled',()=>{assert.throws(()=>onboardingOrigin({CUSTOMER_ONBOARDING_ENABLED:'true',VERCEL_ENV:'production',CUSTOMER_ONBOARDING_ORIGIN:'https://some.vercel.app'}));});
 console.log(`PASS ${checks} mocked HTTP/contract checks; live network requests=0`);
}finally{globalThis.fetch=fetchBefore;}

}
main().catch(e=>{console.error(e);process.exitCode=1;});
