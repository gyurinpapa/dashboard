import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRowLevelBuckets } from '../app/components/ReportTemplate';

// Sanitized diagnostic output and grouped stored rows are supplied locally, never committed.
const [sourcePath, storedPath] = process.argv.slice(2);
if (!sourcePath || !storedPath) throw new Error('Provide diagnostic markdown and stored grouped JSON.');
const records = readFileSync(sourcePath,'utf8').split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
const campaigns = records.filter(row=>row.campaign_id);
const summary = records.find(row=>row.result==='PASS');
assert.equal(campaigns.length,15);
assert.equal(summary.period,'2026-10-01..2026-10-13');
const fields = ['impCnt','clkCnt','salesAmt','ccnt','convAmt'];
for (const campaign of campaigns) {
  assert.equal(campaign.daily_rows.length,13);
  assert.equal(new Set(campaign.daily_rows.map((r:any)=>r.dateStart)).size,13);
  for (const row of campaign.daily_rows) assert.equal(row.dateStart,row.dateEnd);
  for (const field of fields) assert.equal(campaign.daily_rows.reduce((sum:number,row:any)=>sum+row[field],0),campaign.period[field]);
}
const stored = JSON.parse(readFileSync(storedPath,'utf8')).map((row:any)=>({
  ...row,provider:'naver_searchad',external_account_id:'1341036',external_campaign_id:row.campaign_id,
  channel:'검색광고',campaign:row.campaign_name,
  impressions:Number(row.impressions),clicks:Number(row.clicks),cost:Number(row.cost),conversions:Number(row.conversions),revenue:Number(row.revenue),
  row_level_reason:row.row_level==='creative'?'naver_searchad_web_site_ad_daily_stats':undefined,
  provider_meta:{campaign_type:row.campaign_type},
}));
const before = buildRowLevelBuckets(stored);
const originalDetails = JSON.stringify(stored);
const seen = new Set<string>();
const enriched = stored.map((row:any)=>{
  const key=`${row.external_campaign_id}:${row.date}`;
  if (row.campaign_type!=='WEB_SITE' || seen.has(key)) return row;
  seen.add(key);
  const source=campaigns.find(c=>c.campaign_id===row.external_campaign_id).daily_rows.find((r:any)=>r.dateStart===row.date);
  assert.ok(source);
  return {...row,provider_meta:{...row.provider_meta,campaign_daily_authority_v1:{version:1,campaign_id:row.external_campaign_id,
    date:row.date,impressions:source.impCnt,clicks:source.clkCnt,cost:source.salesAmt,conversions:source.ccnt,revenue:source.convAmt}}};
});
const after=buildRowLevelBuckets(enriched);
assert.equal(after.keywordRows.length,before.keywordRows.length);
assert.equal(after.creativeRows.length,before.creativeRows.length);
assert.equal(JSON.stringify(stored),originalDetails);
const mapping={impressions:'impCnt',clicks:'clkCnt',cost:'salesAmt',conversions:'ccnt',revenue:'convAmt'};
for (const [date,expected] of Object.entries(summary.by_date) as [string,any][]) {
  const selected=after.representativeRows.filter(r=>r.date===date);
  for (const [metric,source] of Object.entries(mapping)) assert.equal(selected.reduce((sum,row)=>sum+row[metric],0),expected[source],`${date} ${metric}`);
}
for (const campaign of campaigns) {
  const selected=after.representativeRows.filter(r=>r.external_campaign_id===campaign.campaign_id);
  for (const [metric,source] of Object.entries(mapping)) assert.equal(selected.reduce((sum,row)=>sum+row[metric],0),campaign.period[source],`${campaign.campaign_id} ${metric}`);
}
console.log(JSON.stringify({result:'PASS',campaigns:campaigns.length,source_daily_rows:195,corrected_campaign_days:seen.size,
  totals:Object.fromEntries(Object.keys(mapping).map(field=>[field,after.representativeRows.reduce((sum,row)=>sum+row[field],0)])),detail_metrics_unchanged:true}));
