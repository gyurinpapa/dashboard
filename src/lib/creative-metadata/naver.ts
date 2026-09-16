import {finish,id,makeIdentity,record,safeImageUrl,text,unavailable} from "./contract";
import type {Identity,Observation,NormalizeResult,Asset} from "./contract";

/** Exact WEB_SITE /ncc/ads object; campaign type comes from verified discovery context. */
export function normalizeNaver(input: {
  identity: Identity; observation: Observation; campaignType: string; ad: unknown;
}): NormalizeResult {
  let identity: Identity;
  try { identity=makeIdentity(input.identity); } catch { return {ok:false,reason:"INVALID_INPUT"}; }
  if (identity.provider !== "naver_searchad") return {ok:false,reason:"SCOPE_MISMATCH"};
  if (identity.entityType !== "ad" || input.campaignType !== "WEB_SITE")
    return unavailable(identity,input.observation,"unsupported");
  const raw=record(input.ad);
  if (id(raw.nccAdId) !== identity.entityId || id(raw.customerId) !== identity.externalAccountId)
    return {ok:false,reason:"SCOPE_MISMATCH"};
  const ad=record(raw.ad);
  // NAVER's documented TEXT_45 payload stores text directly under ad.
  // Preserve existing nested payloads; never mix layouts or infer an unknown type.
  // TEXT_45 has no documented image field, so only its text fields are selected.
  const basic=record(raw.type==='TEXT_45'&&(ad.basic===undefined||ad.basic===null)
    ? {headline:ad.headline,description:ad.description}
    : ad.basic);
  const headline=text(basic.headline), description=text(basic.description);
  const image=safeImageUrl(basic.image,"naver_searchad");
  const issues: string[]=[];
  if (basic.image && !image) issues.push("IMAGE_URL_UNSUPPORTED");
  if (basic.headline && !headline) issues.push("HEADLINE_INVALID");
  if (basic.description && !description) issues.push("DESCRIPTION_INVALID");
  const assets: Asset[]=image ? [{assetId:`naver-ad-image:${identity.entityId}`,kind:"image",role:"main",
    imageUrl:image,videoId:null,watchUrl:null,expiresAt:null}] : [];
  if (!headline && !description && !image) issues.push("NO_DISPLAY_CONTENT");
  return finish(identity,input.observation,{name:headline,headlines:headline ? [headline] : [],
    descriptions:description ? [description] : [],assets,issues});
}
