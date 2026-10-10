import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET,POST} from '../app/api/auth/site-session/route';
async function main(){
 const project='lpwmxtnzpgyrhphwufsd',origin='https://app.etrylue.com';
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:`https://${project}.supabase.co`,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic'});
 let calls=0;const original=global.fetch;
 global.fetch=async(input)=>{calls++;const url=String(input);assert.ok(url.startsWith(`https://${project}.supabase.co/auth/v1/`));return new Response(JSON.stringify(url.includes('/logout')?{}:{id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated'}),{status:200,headers:{'Content-Type':'application/json'}});};
 try{
  const anonymous=await GET(new NextRequest(origin+'/api/auth/site-session'));assert.deepEqual(await anonymous.json(),{signedIn:false});assert.match(anonymous.headers.get('cache-control')||'',/no-store/);
  const denied=await GET(new NextRequest(origin+'/api/auth/site-session',{headers:{origin:'https://evil.test'}}));assert.equal(denied.status,403);
  const csrf=await POST(new NextRequest(origin+'/api/auth/site-session',{method:'POST'}));assert.equal(csrf.status,403);assert.equal(calls,0);
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:'11111111-1111-4111-8111-111111111111',exp:Math.floor(Date.now()/1000)+3600},'synthetic'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.');
  const value='base64-'+Buffer.from(JSON.stringify({access_token:jwt,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:'11111111-1111-4111-8111-111111111111'}})).toString('base64url');
  const headers={origin:'https://www.etrylue.com',cookie:`sb-${project}-auth-token=${value}`};
  const signed=await GET(new NextRequest(origin+'/api/auth/site-session',{headers}));assert.deepEqual(await signed.json(),{signedIn:true});assert.equal(signed.headers.get('access-control-allow-origin'),'https://www.etrylue.com');assert.equal(signed.headers.get('access-control-allow-credentials'),'true');
  const logout=await POST(new NextRequest(origin+'/api/auth/site-session',{method:'POST',headers}));assert.equal(logout.status,200);assert.ok(logout.cookies.getAll().some(c=>c.name.includes('auth-token')&&c.value===''));
  global.fetch=async()=>new Response('{"message":"temporary"}',{status:500,headers:{'Content-Type':'application/json'}});
  const outage=await GET(new NextRequest(origin+'/api/auth/site-session',{headers}));assert.equal(outage.status,503);assert.deepEqual(await outage.json(),{ok:false});
  console.log('PASS: signed-out/signed-in truth, no-store, exact website CORS, CSRF rejection, cookie-clearing logout, outage not mislabelled signed-out; live requests=0');
 }finally{global.fetch=original;}
}
main().catch(e=>{console.error(e);process.exitCode=1});
