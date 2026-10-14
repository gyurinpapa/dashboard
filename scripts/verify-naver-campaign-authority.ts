import assert from 'node:assert/strict';
import { buildRowLevelBuckets } from '../app/components/ReportTemplate';
import { collectNaverCampaignAuthority } from '../src/lib/media-sync/naver-campaign-authority-enrichment';
const base = {provider:'naver_searchad',external_account_id:'1341036',external_campaign_id:'cmp-a001-01-1',date:'2026-10-01',channel:'검색광고',revenue:0};
const keyword = {...base,row_level:'keyword',keyword:'등록 키워드',impressions:16735,clicks:484,cost:2740871,conversions:24};
const creative = {...base,row_level:'creative',creative:'소재',row_level_reason:'naver_searchad_web_site_ad_daily_stats',impressions:21095,clicks:607,cost:2819398,conversions:30};
const authority = {...base,row_level:'unknown',row_level_reason:'naver_searchad_campaign_daily_stats_v1',impressions:21137,clicks:607,cost:2819397,conversions:30,provider_meta:{entity_type:'campaign',authoritative_grain:'campaign'}};
const select = (rows:any[]) => buildRowLevelBuckets(rows).representativeRows;
assert.deepEqual(select([keyword,creative]),[keyword]);
const buckets=buildRowLevelBuckets([keyword,creative,authority]);
assert.deepEqual(buckets.representativeRows,[authority]);
assert.deepEqual(buckets.keywordRows,[keyword]);
assert.deepEqual(buckets.creativeRows,[creative]);
const otherDay={...keyword,date:'2026-10-02'};
const otherAccount={...keyword,external_account_id:'another'};
const otherCampaign={...keyword,external_campaign_id:'cmp-other'};
assert.deepEqual(select([keyword,otherDay,otherAccount,otherCampaign,authority]),[otherDay,otherAccount,otherCampaign,authority]);
assert.deepEqual(select([keyword,authority,{...authority}]),[keyword]);
assert.deepEqual(select([keyword,{...authority,cost:NaN}]),[keyword]);
assert.deepEqual(select([keyword,{...authority,impressions:-1}]),[keyword]);
const zero={...authority,impressions:0,clicks:0,cost:0,conversions:0};
assert.deepEqual(select([keyword,zero]),[zero]);
console.log('PASS: campaign authority, unchanged details, scope isolation, duplicate/invalid rejection, legitimate zero totals');

const carrier = {...keyword, provider_meta: {campaign_type:'WEB_SITE',campaign_daily_authority_v1:{
  version:1,campaign_id:base.external_campaign_id,date:base.date,
  impressions:21137,clicks:607,cost:2819397,conversions:30,revenue:0,
}}};
const carried = buildRowLevelBuckets([carrier,creative]);
assert.equal(carried.representativeRows.length,1);
assert.equal(carried.representativeRows[0].impressions,21137);
assert.equal(carried.representativeRows[0].keyword,'');
assert.equal(carried.representativeRows[0].group,'');
assert.deepEqual(carried.keywordRows,[carrier]);
assert.deepEqual(carried.creativeRows,[creative]);
assert.equal(carrier.impressions,16735);
const mismatched = {...carrier, date:'2026-10-02'};
assert.deepEqual(select([mismatched]),[mismatched]);

async function verifyCollection() {
  const input = {credentials:{} as any,dateFrom:'2026-10-01',dateTo:'2026-10-02'};
  const campaign = {id:base.external_campaign_id,name:'Campaign',campaignType:'WEB_SITE',status:null,statusReason:null,userLock:null};
  const records = ['2026-10-01','2026-10-02'].map(date=>({entityId:campaign.id,entityType:'campaign' as const,
    date,periodStart:date,periodEnd:date,impCnt:10,clkCnt:2,salesAmt:5,ccnt:1,convAmt:0}));
  const dependencies = {
    campaigns: async()=>({records:[campaign],recordSize:1000,selector:'NEXT' as const,baseSearchId:null,nextBaseSearchId:null}),
    stats: async()=>({entityId:campaign.id,entityType:'campaign' as const,dateFrom:input.dateFrom,dateTo:input.dateTo,records}),
  };
  assert.equal((await collectNaverCampaignAuthority(input,dependencies)).length,2);
  await assert.rejects(collectNaverCampaignAuthority(input,{...dependencies,stats:async()=>({...await dependencies.stats(),records:records.slice(0,1)})}),/Incomplete.*dates/);
  await assert.rejects(collectNaverCampaignAuthority(input,{...dependencies,stats:async()=>({...await dependencies.stats(),records:[records[0],records[0]]})}),/scope/);
  await assert.rejects(collectNaverCampaignAuthority(input,{...dependencies,stats:async()=>({...await dependencies.stats(),records:[{...records[0],impCnt:null},records[1]]})}),/metrics/);
  console.log('PASS: metadata carrier preserves details; campaign API rejects missing dates, duplicate dates and null metrics');
}
verifyCollection().catch(error=>{console.error(error);process.exitCode=1;});
