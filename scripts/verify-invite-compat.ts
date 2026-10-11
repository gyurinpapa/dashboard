import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Run from the target checkout: node --import tsx /path/to/this/script.ts
// All fetch calls are intercepted; no Auth, database, or email traffic is sent.
process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
(async()=>{
const {POST}=await import(pathToFileURL(resolve('app/api/workspace-invites/register/route.ts')).href);
const scenarios:any[]=[
 ...['director','admin','staff','client','unknown'].map(role=>({name:`success-${role}`,role,status:200})),
 {name:'missing-token',body:{token:''},status:400},
 {name:'short-password',body:{password:'a'},status:400},
 {name:'missing-invite',missing:'workspace_invites',status:404},
 {name:'accepted',invite:{status:'accepted'},status:409},
 {name:'expired',invite:{expires_at:'2020-01-01'},status:410},
 {name:'invalid-email',invite:{email:'invalid'},status:400},
 {name:'missing-workspace-id',invite:{workspace_id:''},status:500},
 {name:'master',role:'master',status:403},
 {name:'missing-workspace',missing:'workspaces',status:404},
 {name:'missing-company',company:'',status:500},
 {name:'existing-user',existing:true,status:409},
 {name:'existing-member',existing:true,member:true,status:409},
 ...['workspace_invites','workspaces','profiles','workspace_members'].map(table=>({name:`lookup-error-${table}`,error:`GET:${table}`,existing:table==='workspace_members',status:500})),
 {name:'auth-error',error:'POST:users',status:500},
 ...['profiles','workspace_members','workspace_invites'].map(table=>({name:`write-error-${table}`,error:`${table==='workspace_invites'?'PATCH':'POST'}:${table}`,status:500,cleanup:true})),
];
for(const s of scenarios){
 const calls:any[]=[];
 globalThis.fetch=async(input:any,init:any={})=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  assert.equal(url.origin,'https://synthetic.invalid','All external requests forbidden');
  const method=init.method??'GET'; const table=url.pathname.split('/').pop()!;
  const body=init.body?JSON.parse(init.body):null; calls.push({url,method,table,body});
  const response=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  if(s.error===`${method}:${table}`)return response({message:'synthetic_failure',code:'synthetic_failure'},400);
  if(url.pathname.startsWith('/auth/v1/admin/users'))return response({id:'11111111-1111-4111-8111-111111111111',email:'member@example.invalid'});
  assert.ok(url.pathname.startsWith('/rest/v1/'));
  if(method!=='GET')return new Response(null,{status:204});
  let row:any=null;
  if(table==='workspace_invites')row={id:'invite-1',workspace_id:'workspace-1',email:'MEMBER@example.invalid',role:s.role??'staff',status:'pending',expires_at:'2099-01-01',...s.invite};
  if(table==='workspaces')row={id:'workspace-1',company_id:s.company??'company-1'};
  if(table==='profiles'&&s.existing)row={id:'existing-user',email:'member@example.invalid'};
  if(table==='workspace_members'&&s.member)row={user_id:'existing-user',workspace_id:'workspace-1',role:'staff'};
  if(s.missing===table)row=null;
  return response(row?[row]:[]);
 };
 const response=await POST(new Request('https://synthetic.invalid/api/workspace-invites/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test-token',password:'synthetic-password',email:'attacker@example.invalid',workspace_id:'forged-workspace',role:'master',app_metadata:{etrylue_invite_version:'forged',invited_workspace_id:'forged'},...s.body})}));
 const result=await response.json(); assert.equal(response.status,s.status,`${s.name}: ${result.error}`);
 const created=calls.find(c=>c.method==='POST'&&c.table==='users');
 const deleted=calls.filter(c=>c.method==='DELETE');
 if(s.status===200){
  assert.deepEqual(created.body.app_metadata,{etrylue_invite_version:'1',invited_workspace_id:'workspace-1'});
  assert.equal(created.body.email,'member@example.invalid');
  assert.equal(result.workspace_id,'workspace-1');assert.equal(result.company_id,'company-1');
  assert.equal(result.role,s.role==='unknown'?'staff':s.role);
  const member=calls.find(c=>c.method==='POST'&&c.table==='workspace_members');assert.equal(member.body.role,result.role);
  const update=calls.find(c=>c.method==='PATCH');assert.equal(update.url.searchParams.get('status'),'eq.pending');assert.equal(update.body.accepted_by,'11111111-1111-4111-8111-111111111111');
 }
 if(!s.cleanup&&s.status!==200&&s.name!=='auth-error')assert.equal(created,undefined,s.name);
 assert.equal(deleted.length,s.cleanup?1:0,s.name);
 if(s.cleanup)assert.equal(deleted[0].table,'11111111-1111-4111-8111-111111111111');
 console.log(`PASS ${s.name}`);
}
console.log(`INVITE_COMPAT_VERIFIED ${scenarios.length} scenarios; no live requests`);
})().catch(e=>{console.error(e);process.exitCode=1;});
