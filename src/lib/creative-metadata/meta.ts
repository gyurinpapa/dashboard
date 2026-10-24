import {finish,id,makeIdentity,record,safeImageUrl,text} from './contract';
import type {Asset,Identity,NormalizeResult,Observation} from './contract';

// Read the ad and its expanded creative together, proving the account/ad identity.
export const META_CREATIVE_FIELDS = 'id,account_id,name,creative{id,account_id,name,title,body,image_url,thumbnail_url,object_story_spec,asset_feed_spec}';

export function metaImageExpiry(url: string): string | null {
  const expiry = new URL(url).searchParams.get('oe');
  if (!expiry || !/^[a-f0-9]{8}$/i.test(expiry)) return null;
  return new Date(parseInt(expiry,16)*1000).toISOString();
}

export function normalizeMetaCreative(input: {identity:Identity;observation:Observation;ad:unknown}):NormalizeResult {
  let identity:Identity;
  try { identity=makeIdentity(input.identity); } catch { return {ok:false,reason:'INVALID_INPUT'}; }
  const ad=record(input.ad),creative=record(ad.creative);
  if(identity.provider!=='meta_ads'||identity.entityType!=='ad'||id(ad.id)!==identity.entityId||
    id(ad.account_id)!==identity.externalAccountId||!id(creative.id)||
    creative.account_id!==undefined&&id(creative.account_id)!==identity.externalAccountId) return {ok:false,reason:'SCOPE_MISMATCH'};
  const story=record(creative.object_story_spec),link=record(story.link_data),photo=record(story.photo_data),video=record(story.video_data),feed=record(creative.asset_feed_spec);
  const texts=(values:unknown[])=>[...new Set(values.map(text).filter((x):x is string=>!!x))].slice(0,20);
  const items=(value:unknown)=>Array.isArray(value)?value.slice(0,20).map(record):[];
  const headlines=texts([creative.title,link.name,video.title,...items(feed.titles).map(x=>x.text)]);
  const descriptions=texts([creative.body,link.message,link.description,photo.caption,video.message,...items(feed.bodies).map(x=>x.text)]);
  const candidates=[creative.image_url,link.picture,photo.url,video.image_url,
    ...items(link.child_attachments).map(x=>x.picture),...items(feed.images).map(x=>x.url)];
  let urls=[...new Set(candidates.map(x=>safeImageUrl(x,'meta_ads')).filter((x):x is string=>!!x))];
  if(!urls.length){const thumbnail=safeImageUrl(creative.thumbnail_url,'meta_ads');if(thumbnail)urls=[thumbnail];}
  const assets:Asset[]=urls.slice(0,20).flatMap((url,index)=>{
    const expiresAt=metaImageExpiry(url);
    if(expiresAt&&Date.parse(expiresAt)<=Date.parse(input.observation.fetchedAt))return [];
    return [{assetId:`meta:${creative.id}:${index}`,kind:'image' as const,role:index?'other' as const:'main' as const,
      imageUrl:url,videoId:null,watchUrl:null,expiresAt}];
  });
  return finish(identity,input.observation,{name:text(ad.name)??text(creative.name),headlines,descriptions,assets,
    issues:assets.length||headlines.length||descriptions.length?[]:['NO_DISPLAY_CONTENT']});
}
