import {createServerClient} from '@supabase/ssr';
import {NextRequest,NextResponse} from 'next/server';
export const dynamic='force-dynamic';
import {allowedOrigin} from '@/lib/site-session-origin';
async function session(request:NextRequest,logout:boolean){
 const origin=request.headers.get('origin'),own=new URL(request.url).origin;
 const headers=new Headers({'Cache-Control':'private, no-store, max-age=0','Vary':'Origin, Cookie'});
 if(origin&&allowedOrigin(origin,own)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Credentials','true');}
 if((origin&&!allowedOrigin(origin,own))||(logout&&!allowedOrigin(origin,own)))return NextResponse.json({ok:false},{status:403,headers});
 const response=NextResponse.json({signedIn:false},{headers});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return NextResponse.json({ok:false},{status:503,headers});
 const client=createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{for(const {name,value,options} of values)response.cookies.set(name,value,options);}}});
 try {
  if(logout){const {error}=await client.auth.signOut({scope:'local'});if(error)return NextResponse.json({ok:false},{status:503,headers});return response;}
  const {data,error}=await client.auth.getUser();
  if(error&&error.name!=='AuthSessionMissingError'&&error.status!==401&&error.status!==403)return NextResponse.json({ok:false},{status:503,headers});
  const result=NextResponse.json({signedIn:!!data.user&&!error},{headers});
  for(const cookie of response.cookies.getAll())result.cookies.set(cookie);
  return result;
 }catch{return NextResponse.json({ok:false},{status:503,headers});}
}
export async function GET(request:NextRequest){return session(request,false);}
export async function POST(request:NextRequest){return session(request,true);}
