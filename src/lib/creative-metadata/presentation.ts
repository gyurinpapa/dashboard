import {identityKey,safeHttpsUrl,safeImageUrl,timestamp} from "./contract";
import type {Asset,Identity,Metadata,Scope} from "./contract";

export type Preview = Readonly<{kind:"image"|"youtube"|"text"|"none";imageUrl:string|null;watchUrl:string|null;
  source:"upload"|"api"|"fallback";loadVideo:false}>;
export type GalleryItem = Readonly<{identityKey:string;assetId:string;role:Asset["role"];preview:Preview}>;
export type Presentation = Readonly<{
  legacyGroupKey:string;displayName:string;state:"single"|"multiple"|"unresolved";
  members:readonly Metadata[];expectedMembers:number;unresolvedMembers:number;
  hasUnresolvedReferences:boolean;preview:Preview;gallery:readonly GalleryItem[];
}>;
function matchesScope(x:Identity,scope:Scope):boolean {
  return x.workspaceId===scope.workspaceId && x.advertiserId===scope.advertiserId &&
    x.provider===scope.provider && x.externalAccountId===scope.externalAccountId.replace(/-/g,"");
}
/** Input entries must be trusted normalizer outputs. Conflicts do not silently pick a revision. */
export function buildMetadataIndex(entries:readonly Metadata[]):ReadonlyMap<string,Metadata>{
  const map=new Map<string,Metadata>();
  for(const x of entries){const k=identityKey(x.identity);if(map.has(k))throw new Error("DUPLICATE_METADATA_IDENTITY");map.set(k,x);}
  return map;
}
function assetPreview(asset:Asset,metadata:Metadata,mode:"interactive"|"static",now:number):Preview|null{
  if(asset.expiresAt!==null){const expiry=timestamp(asset.expiresAt);if(!expiry || Date.parse(expiry)<=now)return null;}
  const image=asset.imageUrl && safeImageUrl(asset.imageUrl,metadata.identity.provider);
  if(asset.kind==="image" && image)return Object.freeze({kind:"image",imageUrl:image,watchUrl:null,source:"api",loadVideo:false});
  if(asset.kind==="youtube" && asset.videoId && /^[a-zA-Z0-9_-]{11}$/.test(asset.videoId)){
    const watchUrl=`https://www.youtube.com/watch?v=${asset.videoId}`;
    return Object.freeze({kind:mode==="static" ? (image?"image":"text") : "youtube",
      imageUrl:image||null,watchUrl,source:"api",loadVideo:false});
  }
  return null;
}
/** No rows or aggregate objects accepted: presentation cannot rewrite performance keys. */
export function resolvePresentation(input:{
  legacyGroupKey:string;authorizedScopes:readonly Scope[];references:readonly (Identity|null)[];
  metadata:ReadonlyMap<string,Metadata>;mode:"interactive"|"static";now:string;
  uploadedImageUrl?:string|null;uploadHosts?:readonly string[];
}):Presentation{
  const now=timestamp(input.now);if(!now)throw new Error("INVALID_NOW");
  const refs=new Map<string,Identity>();let unknown=0;
  for(const ref of input.references){
    if(!ref || !input.authorizedScopes.some(scope=>matchesScope(ref,scope))){unknown++;continue;}
    try{refs.set(identityKey(ref),ref);}catch{unknown++;}
  }
  const members:Metadata[]=[];
  for(const [key] of refs){
    const candidate=input.metadata.get(key);
    if(!candidate)continue;
    try{if(identityKey(candidate.identity)!==key || !["ready","partial"].includes(candidate.status))continue;}
    catch{continue;}
    members.push(candidate);
  }
  const total=refs.size,unresolved=total-members.length;
  const state=total>1 ? "multiple" : total===1 && members.length===1 && unknown===0 ? "single" : "unresolved";
  const single=state==="single" ? members[0] : undefined;
  const gallery:GalleryItem[]=[];
  for(const member of members){
    for(const asset of member.assets){
      const resolved=assetPreview(asset,member,input.mode,Date.parse(now));
      if(resolved)gallery.push(Object.freeze({identityKey:identityKey(member.identity),assetId:asset.assetId,
        role:asset.role,preview:resolved}));
    }
  }
  const uploaded=safeHttpsUrl(input.uploadedImageUrl,input.uploadHosts??[]);
  let preview:Preview=Object.freeze({kind:"none",imageUrl:null,watchUrl:null,source:"fallback",loadVideo:false});
  if(uploaded)preview=Object.freeze({kind:"image",imageUrl:uploaded,watchUrl:null,source:"upload",loadVideo:false});
  else if(single){
    // A logo alone must not be represented as the advertised banner.
    const candidates=single.assets.filter(a=>a.role==="main");
    // Multi-asset ads are resolved to a gallery by the future UI, never an arbitrary first image.
    if(candidates.length===1)preview=assetPreview(candidates[0]!,single,input.mode,Date.parse(now))??preview;
    if(preview.kind==="none" && (single.headlines.length || single.descriptions.length))
      preview=Object.freeze({kind:"text",imageUrl:null,watchUrl:null,source:"api",loadVideo:false});
  }
  return Object.freeze({legacyGroupKey:input.legacyGroupKey,displayName:single?.displayName||input.legacyGroupKey,
    state,members:Object.freeze(members),expectedMembers:total,unresolvedMembers:unresolved,
    hasUnresolvedReferences:unknown>0,preview,gallery:Object.freeze(gallery)});
}
