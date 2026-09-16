import {handleMetadataTargets} from '@/src/lib/creative-metadata/server/view-gateway';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
 const {id}=await ctx.params;if(!id||id.length>256)return Response.json({status:'rejected'},{status:400});
 return handleMetadataTargets(request,id);
}
