import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
if(!process.env.PGLITE_MODULE) throw new Error('PGLITE_MODULE required');
const {PGlite}=await import(process.env.PGLITE_MODULE);
const db=new PGlite();let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',legacy='33333333-3333-4333-8333-333333333333';
const meta={etrylue_customer_version:'1',company_name:'Synthetic company',contact_name:'Synthetic owner',tenant_type:'agency'};
async function user(id,app=meta,usr={},confirmed=false){return db.query('insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,$4,$5)',[id,id+'@example.test',JSON.stringify(app),JSON.stringify(usr),confirmed?'2026-10-10':null]);}
const provision=id=>q('select public.provision_etrylue_customer($1) as result',[id]);
async function actor(id){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function denied(sql,args=[],pattern=/permission denied|CUSTOMER_/){await assert.rejects(db.query(sql,args),pattern);}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
 create table companies(id uuid primary key default gen_random_uuid(),name text not null,is_locked boolean default true);
 insert into companies(name) values('000');
 create table profiles(id uuid primary key references auth.users,company_id uuid not null references companies,name text not null,email text,role_id uuid,platform_role text,department_id uuid,team_id uuid);
 create table tenants(id uuid primary key,name text,slug text unique,tenant_type text check(tenant_type in ('agency','advertiser')),created_by uuid references auth.users);
 create table tenant_members(tenant_id uuid references tenants,user_id uuid references auth.users,role text,primary key(tenant_id,user_id));
 create table workspaces(id uuid primary key,name text,created_by uuid references auth.users,owner_user_id uuid,company_id uuid references companies,tenant_id uuid references tenants,workspace_type text,workspace_kind text);
 create table workspace_members(workspace_id uuid references workspaces,user_id uuid references auth.users,role text,primary key(workspace_id,user_id));
 create table departments(id uuid primary key default gen_random_uuid(),company_id uuid references companies);
 create table teams(id uuid primary key default gen_random_uuid(),company_id uuid references companies);
 create table roles(id uuid primary key default gen_random_uuid(),company_id uuid references companies);
 create table org_units(id uuid primary key default gen_random_uuid());
 create function handle_new_user_create_profile() returns trigger language plpgsql security definer as $$begin insert into profiles(id,company_id,name) values(new.id,(select id from companies where name='000'),coalesce(new.raw_user_meta_data->>'name','New User'));return new;end$$;
 create trigger on_auth_user_created_profile after insert on auth.users for each row execute function handle_new_user_create_profile();
 create function add_workspace_owner_member() returns trigger language plpgsql as $$begin insert into public.workspace_members values(new.id,new.created_by,'master') on conflict do nothing; return new;end$$;
 create trigger trg_workspaces_add_owner after insert on workspaces for each row execute function add_workspace_owner_member();
 create function tenant_from_workspace_member() returns trigger language plpgsql as $$begin insert into public.tenant_members select tenant_id,new.user_id,'member' from public.workspaces where id=new.workspace_id on conflict do nothing;return new;end$$;
 create trigger tenant_from_workspace_member after insert on workspace_members for each row execute function tenant_from_workspace_member();
 create function prepare_daily_report_v2_combined_snapshot(jsonb) returns int language sql as $$select 1$$;
 revoke all on function prepare_daily_report_v2_combined_snapshot(jsonb) from public,anon,authenticated;
 grant execute on function prepare_daily_report_v2_combined_snapshot(jsonb) to service_role;
 alter table profiles enable row level security;
 grant select,update on profiles to authenticated;
 create policy profiles_select_own on profiles for select to authenticated using(id=auth.uid());
 create policy profiles_update_own on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());`);
 for(const table of ['companies','departments','teams','roles','org_units']) await db.exec(`alter table ${table} enable row level security; grant select on ${table} to authenticated; create policy legacy_select on ${table} for select to authenticated using(true);`);
 const src=await readFile(new URL('./sql/customer-onboarding.sql',import.meta.url),'utf8');
 const hash=(await q("select md5(prosrc) hash from pg_proc where oid='handle_new_user_create_profile()'::regprocedure"))[0].hash;
 await test('baseline guard rejects drift without installing schema',async()=>{
  await assert.rejects(db.exec(src),/CUSTOMER_PROFILE_BASELINE_CHANGED/);await db.exec('rollback');
  assert.equal((await q("select count(*)::int n from pg_namespace where nspname='etrylue_customer_private'"))[0].n,0);
 });
 await db.exec(src.replace('6a1282e030f4ca80893e0fc98bdc692f',hash));
 await test('unmarked direct signup and forged user metadata are rejected atomically',async()=>{
  await assert.rejects(user(a,{},meta),/CUSTOMER_REGISTRATION_ROUTE_REQUIRED/);
  assert.equal((await q('select count(*)::int n from auth.users'))[0].n,0);
 });
 await test('trusted invite retains legacy profile path',async()=>{
  await user(legacy,{etrylue_invite_version:'1'},{name:'Invite'},true);
  assert.equal((await q('select name from profiles where id=$1',[legacy]))[0].name,'Invite');
  await assert.rejects(provision(legacy),/CUSTOMER_ACCOUNT_REQUIRED/);
 });
 await test('new customer remains pending without company or memberships',async()=>{
  await user(a);await user(b,{...meta,tenant_type:'advertiser'});
  assert.equal((await q('select count(*)::int n from companies'))[0].n,1);
  assert.equal((await q('select count(*)::int n from profiles'))[0].n,1);
  await assert.rejects(provision(a),/CUSTOMER_EMAIL_UNVERIFIED/);
 });
 await test('pending customer cannot read legacy metadata',async()=>{
  await actor(a);assert.equal((await q('select * from companies')).length,0);await db.exec('reset role');
 });
 await test('verified customer gets one own company tenant and admin workspace',async()=>{
  await db.exec('update auth.users set email_confirmed_at=now()');
  await provision(a);await provision(b);
  assert.equal((await q('select count(*)::int n from companies'))[0].n,3);
  assert.deepEqual((await q('select distinct role from workspace_members')).map(r=>r.role),['admin']);
  assert.deepEqual((await q('select distinct role from tenant_members')).map(r=>r.role),['owner']);
  assert.equal((await q('select count(*)::int n from profiles where platform_role is not null'))[0].n,0);
 });
 const own=(await q('select * from etrylue_customer_private.accounts where user_id=$1',[a]))[0];
 const other=(await q('select * from etrylue_customer_private.accounts where user_id=$1',[b]))[0];
 await test('customers invited into a new company inherit its metadata boundary',async()=>{
  const invited='55555555-5555-4555-8555-555555555555';
  await user(invited,{etrylue_invite_version:'1',invited_workspace_id:own.workspace_id},{name:'Invited member'},true);
  await db.query('update profiles set company_id=$1,email=$2 where id=$3',[own.company_id,invited+'@example.test',invited]);
  await db.query("insert into workspace_members values($1,$2,'staff')",[own.workspace_id,invited]);
  await actor(invited);const rows=await q('select * from companies');assert.equal(rows.length,1);assert.equal(rows[0].id,own.company_id);await db.exec('reset role');
  await denied("update workspace_members set role='master' where user_id=$1",[invited],/CUSTOMER_MASTER_FORBIDDEN/);
 });
 await test('retries return the same graph without duplicate writes',async()=>{
  assert.deepEqual(await provision(a),await provision(a));assert.equal((await q('select count(*)::int n from workspaces'))[0].n,2);
 });
 for(const table of ['departments','teams','roles']) await db.query(`insert into ${table}(company_id) values($1),($2)`,[own.company_id,other.company_id]);
 await db.exec('insert into org_units default values');
 for(const table of ['companies','departments','teams','roles']) await test('customer scope filters '+table,async()=>{
  await actor(a);const rows=await q(`select * from ${table}`);assert.equal(rows.length,1);assert.equal(rows[0][table==='companies'?'id':'company_id'],own.company_id);await db.exec('reset role');
 });
 await test('unmapped legacy org units are hidden from new customer',async()=>{await actor(a);assert.equal((await q('select * from org_units')).length,0);await db.exec('reset role');});
 await test('legacy metadata access is preserved',async()=>{await actor(legacy);assert.equal((await q('select * from companies')).length,3);assert.equal((await q('select * from org_units')).length,1);await db.exec('reset role');});
 await test('company and platform authority cannot be changed through own profile',async()=>{
  await actor(a);await denied('update profiles set company_id=$1 where id=$2',[other.company_id,a],/CUSTOMER_IDENTITY_IMMUTABLE/);
  await denied("update profiles set platform_role='platform_owner' where id=$1",[a],/CUSTOMER_IDENTITY_IMMUTABLE/);
  await db.query('update profiles set name=$1 where id=$2',['New name',a]);await db.exec('reset role');
 });
 await test('master escalation is rejected even through an elevated writer',async()=>{await denied("update workspace_members set role='master' where user_id=$1",[a],/CUSTOMER_MASTER_FORBIDDEN/);});
 await test('cohort and service functions are inaccessible to user roles',async()=>{
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await denied('select * from etrylue_customer_private.accounts');await denied('select public.provision_etrylue_customer($1)',[a]);await denied("select public.reserve_etrylue_customer_signup('x@example.test',repeat('a',64))");await db.exec('reset role');}
 });
 await test('service role can provision but existing identities cannot be enrolled',async()=>{
  await db.exec('set role service_role');await provision(a);await assert.rejects(provision(legacy),/CUSTOMER_ACCOUNT_REQUIRED/);await db.exec('reset role');
 });
 await test('failure rolls back the entire provisioning graph and permits retry',async()=>{
  const c='44444444-4444-4444-8444-444444444444';await user(c,meta,{},true);
  await db.exec(`create function fail_customer_fixture() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_FAILURE';end$$;
   create trigger fail_customer_fixture before insert on workspaces for each row execute function fail_customer_fixture();`);
  await assert.rejects(provision(c),/SYNTHETIC_FAILURE/);
  assert.equal((await q('select count(*)::int n from companies'))[0].n,3);
  assert.equal((await q('select provisioned_at from etrylue_customer_private.accounts where user_id=$1',[c]))[0].provisioned_at,null);
  await db.exec('drop trigger fail_customer_fixture on workspaces');await provision(c);
 });
 await test('per-email registration limits are persisted and bounded',async()=>{
  const reserve=()=>q("select public.reserve_etrylue_customer_signup('limit@example.test',repeat('a',64)) as s");
  for(let i=0;i<5;i++)assert.equal((await reserve())[0].s,'new');assert.equal((await reserve())[0].s,'limited');
 });
 await test('existing accounts never become customer signups',async()=>{
  assert.equal((await q('select public.reserve_etrylue_customer_signup($1,repeat(\'b\',64)) as s',[legacy+'@example.test']))[0].s,'existing');
 });
 await test('legacy workspace owner trigger behavior remains master',async()=>{
  await db.exec('begin');
  await db.query("insert into workspaces(id,name,created_by,tenant_id) values('66666666-6666-4666-8666-666666666666','Legacy', $1,$2)",[legacy,own.tenant_id]);
  assert.equal((await q("select role from workspace_members where workspace_id='66666666-6666-4666-8666-666666666666'"))[0].role,'master');
  await db.exec('rollback');
 });
 console.log(`PASS ${checks} isolated customer SQL checks`);
}finally{await db.close();}
