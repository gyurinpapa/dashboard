import {handleMetadataRequest} from '@/src/lib/creative-metadata/server/view-gateway';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=40;
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
 const {id}=await ctx.params;
 if(!id||id.length>256)return Response.json({status:'rejected'},{status:400});
 return handleMetadataRequest(request,{kind:'report',id},true);
}
