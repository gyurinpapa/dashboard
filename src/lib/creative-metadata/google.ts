import {finish,id,makeIdentity,record,safeImageUrl,text,unavailable} from "./contract";
import type {Identity,Observation,NormalizeResult,Asset} from "./contract";

type Spec = Readonly<{field:string; images: readonly string[]; logos: readonly string[]; videos:readonly string[]}>;
// REST JSON uses lowerCamelCase. Each spec is tied to the v25 ad type.
const specs: Readonly<Record<string,Spec>> = {
  RESPONSIVE_SEARCH_AD:{field:"responsiveSearchAd",images:[],logos:[],videos:[]},
  RESPONSIVE_DISPLAY_AD:{field:"responsiveDisplayAd",images:["marketingImages","squareMarketingImages"],
    logos:["logoImages","squareLogoImages"],videos:["youtubeVideos"]},
  DEMAND_GEN_MULTI_ASSET_AD:{field:"demandGenMultiAssetAd",images:["marketingImages","squareMarketingImages",
    "portraitMarketingImages","tallPortraitMarketingImages","classicDisplayImages"],logos:["logoImages"],videos:[]},
  DEMAND_GEN_VIDEO_RESPONSIVE_AD:{field:"demandGenVideoResponsiveAd",images:["companionBanners"],logos:["logoImages"],videos:["videos"]},
};

/** One GAQL result containing customer.id + adGroupAd.ad, and linked asset-query rows. */
export function normalizeGoogle(input: {
  identity: Identity; observation: Observation; adResult: unknown; assetResults: readonly unknown[];
}): NormalizeResult {
  let identity: Identity;
  try { identity=makeIdentity(input.identity); } catch { return {ok:false,reason:"INVALID_INPUT"}; }
  if (identity.provider !== "google_ads") return {ok:false,reason:"SCOPE_MISMATCH"};
  if (identity.entityType !== "ad") return unavailable(identity,input.observation,"unsupported");
  const result=record(input.adResult),ad=record(record(result.adGroupAd).ad);
  if (id(record(result.customer).id) !== identity.externalAccountId || id(ad.id) !== identity.entityId)
    return {ok:false,reason:"SCOPE_MISMATCH"};
  if (ad.resourceName !== `customers/${identity.externalAccountId}/ads/${identity.entityId}`)
    return {ok:false,reason:"SCOPE_MISMATCH"};
  const spec=typeof ad.type === "string" && Object.hasOwn(specs,ad.type) ? specs[ad.type] : undefined;
  if (!spec) return unavailable(identity,input.observation,"unsupported");
  if (input.assetResults.length>500) return {ok:false,reason:"INVALID_INPUT"};
  const info=record(ad[spec.field]),issues:string[]=[];
  if(Object.keys(info).length===0)issues.push("AD_PAYLOAD_MISSING");
  function textAssets(field:string):string[] {
    if (info[field] === undefined) return [];
    if (!Array.isArray(info[field])) {issues.push("TEXT_LIST_INVALID");return [];}
    const entries=info[field] as unknown[];
    if (entries.length>100) {issues.push("TEXT_LIST_TOO_LARGE");return [];}
    return entries.flatMap(x=>{const s=text(record(x).text);if(!s){issues.push("TEXT_ASSET_INVALID");return [];}return [s];});
  }
  const headlines=[...textAssets("headlines"),...textAssets("longHeadlines")];
  const longHeadline=text(record(info.longHeadline).text);
  if(longHeadline) headlines.push(longHeadline);
  const descriptions=textAssets("descriptions");
  const catalog=new Map<string,Record<string,unknown>>(), conflicts=new Set<string>();
  for(const item of input.assetResults){
    const a=record(record(item).asset),resource=text(a.resourceName);
    if(!resource) {issues.push("ASSET_RECORD_INVALID");continue;}
    const match=/^customers\/(\d+)\/assets\/(\d+)$/.exec(resource);
    if(!match || match[1] !== identity.externalAccountId || id(a.id) !== match[2])
      return {ok:false,reason:"SCOPE_MISMATCH"};
    if(catalog.has(resource)){conflicts.add(resource);issues.push("DUPLICATE_ASSET_RECORD");}
    else catalog.set(resource,a);
  }
  const assets:Asset[]=[],seen=new Set<string>();
  function references(fields:readonly string[],kind:"image"|"youtube",role:Asset["role"]){
    for(const field of fields){
      if(info[field]===undefined)continue;
      if(!Array.isArray(info[field]) || (info[field] as unknown[]).length>100){issues.push("ASSET_LIST_INVALID");continue;}
      for(const entry of info[field] as unknown[]){
        const resource=text(record(entry).asset);
        const match=resource && /^customers\/(\d+)\/assets\/(\d+)$/.exec(resource);
        if(!match || match[1]!==identity.externalAccountId){issues.push("ASSET_REFERENCE_SCOPE_INVALID");continue;}
        const k=JSON.stringify([resource,kind,role]);if(seen.has(k))continue;seen.add(k);
        const a=catalog.get(resource!);
        if(!a || conflicts.has(resource!)){issues.push("ASSET_UNRESOLVED");continue;}
        if(kind==="image"){
          const url=safeImageUrl(record(record(a.imageAsset).fullSize).url,"google_ads");
          if(a.type!=="IMAGE" || !url){issues.push("IMAGE_ASSET_INVALID");continue;}
          assets.push({assetId:resource!,kind,role,imageUrl:url,videoId:null,watchUrl:null,expiresAt:null});
        }else{
          const videoId=text(record(a.youtubeVideoAsset).youtubeVideoId);
          if(a.type!=="YOUTUBE_VIDEO" || !videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)){
            issues.push("VIDEO_ASSET_INVALID");continue;
          }
          // Do not guess a poster URL, companion-banner relationship, or playable MP4.
          assets.push({assetId:resource!,kind,role,imageUrl:null,videoId,
            watchUrl:`https://www.youtube.com/watch?v=${videoId}`,expiresAt:null});
        }
      }
    }
  }
  references(spec.images,"image","main");references(spec.logos,"image","logo");references(spec.videos,"youtube","main");
  const name=text(ad.name)??headlines[0]??null;
  if(!name && !descriptions.length && !assets.length)issues.push("NO_DISPLAY_CONTENT");
  return finish(identity,input.observation,{name,headlines,descriptions,assets,issues});
}
