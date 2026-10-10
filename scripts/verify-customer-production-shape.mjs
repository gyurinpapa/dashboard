import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);`);
 await db.exec(await readFile(new URL('./sql/customer-onboarding-test-baseline.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('./sql/customer-onboarding.sql',import.meta.url),'utf8'));
 console.log('PASS production-shape baseline and unmodified candidate installation');
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await db.query(`insert into auth.users values($1,'shape@example.test',now(),$2,'{}')`,[id,JSON.stringify({etrylue_customer_version:'1',company_name:'Shape fixture',contact_name:'Fixture',tenant_type:'agency'})]);
 const first=(await db.query('select provision_etrylue_customer($1) result',[id])).rows[0].result;
 assert.deepEqual((await db.query('select provision_etrylue_customer($1) result',[id])).rows[0].result,first);
 assert.equal((await db.query('select role from workspace_members where user_id=$1',[id])).rows[0].role,'admin');
 console.log('PASS production triggers provision one idempotent admin workspace');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');
 const own=await db.query('select * from companies');
 assert.equal(own.rows.length,1);
 console.log('PASS customer can read only own company with actual production policies');
} finally {await db.close();}
