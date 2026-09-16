import {handleMetadataRequest} from '@/src/lib/creative-metadata/server/view-gateway';
export const runtime='nodejs';
export const preferredRegion='hnd1';
export const dynamic='force-dynamic';
export const maxDuration=40;
export async function POST(request:Request,ctx:{params:Promise<{token:string}>}){
 const {token}=await ctx.params;
 if(!token||token.length>256)return Response.json({status:'rejected'},{status:400});
 return handleMetadataRequest(request,{kind:'share',token},false);
}
