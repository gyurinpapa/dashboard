/** Operator-only read-only verification. Run where stored credentials are available; never logs raw API bodies or secrets. */
import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { decryptMetaAdsCredentials } from "../src/lib/media-sync/meta-ads-credentials";
import { readMetaAdsAccountMetadata } from "../src/lib/media-sync/meta-ads-account-preflight";
import { readMetaAdsInsightsPreview } from "../src/lib/media-sync/meta-ads-insights-preview";
import { readMetaAdsAdDailyDataset } from "../src/lib/media-sync/meta-ads-ad-daily-check";
import { normalizeMetaDailyWindow, shiftMetaDay } from "../src/lib/media-sync/meta-ads-daily";
import { readMetaAdsContactPolicy, type MetaAdsContactPolicy } from "../src/lib/media-sync/meta-ads-contact-policy";
import { readMetaAdsDailyPolicy } from "../src/lib/media-sync/meta-ads-daily-policy";
import { getPreviousCompletedSeoulCalendarDate } from "../src/lib/media-sync/naver-searchads-daily-scheduler";
import { requireMetaContact as check } from "../src/lib/media-sync/meta-ads-contact-rows";
import { isValidYmd } from "../src/lib/media-sync/types";

async function main() {
  const [connectionId, date, expectedForms] = process.argv.slice(2);
  check(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(connectionId ?? "") &&
    isValidYmd(date) && /^\d+$/.test(expectedForms ?? ""), "META_CHECK_INVALID_INPUT");
  const target = getPreviousCompletedSeoulCalendarDate(new Date());
  check(date <= target && date >= shiftMetaDay(target,-30), "META_CHECK_INVALID_RANGE");
  const {data:c,error} = await getSupabaseAdmin().from("media_connections")
    .select("id,workspace_id,advertiser_id,provider,external_account_id,status,credential_ciphertext,credential_version,last_verified_at,updated_at,meta")
    .eq("id",connectionId).eq("provider","meta_ads").single();
  check(!error && c && c.status === "active" && c.last_verified_at && c.credential_version === 1,"META_CHECK_CONNECTION_REQUIRED");
  const base = readMetaAdsContactPolicy(c.meta?.meta_ads_reporting,c.external_account_id);
  const daily = readMetaAdsDailyPolicy(c.meta?.meta_ads_daily);
  check(base && daily,"META_CONTACT_POLICY_REQUIRED");
  const policy: MetaAdsContactPolicy = {...base,instant_form:{field:"actions",action_type:"onsite_conversion.lead_grouped"}};
  const credential = decryptMetaAdsCredentials(c.credential_ciphertext,{connectionId:c.id,workspaceId:c.workspace_id,
    advertiserId:c.advertiser_id,provider:"meta_ads",externalAccountId:c.external_account_id});
  c.credential_ciphertext=null;
  const metadata=await readMetaAdsAccountMetadata({externalAccountId:c.external_account_id,accessToken:credential.access_token},{fetchImpl:fetch});
  check(metadata.currency===policy.currency && metadata.timeZone===policy.time_zone,"META_CONTACT_POLICY_REQUIRED");
  const accountId = c.external_account_id;
  async function verify(dateFrom:string,dateTo:string) {
    const input={dateFrom,dateTo,externalAccountId:accountId,accessToken:credential.access_token};
    const account=await readMetaAdsInsightsPreview(input,fetch);
    const dataset=await readMetaAdsAdDailyDataset(input,account,fetch);
    return normalizeMetaDailyWindow(dataset.records,account,input,policy,dataset.check.page_count);
  }
  const day=await verify(date,date);
  check(day.totals.instant_form_submissions === expectedForms,"META_CHECK_EXPECTED_FORMS_MISMATCH");
  const dateFrom=daily.start_date>shiftMetaDay(target,-6)?daily.start_date:shiftMetaDay(target,-6);
  const recent=await verify(dateFrom,target);
  console.log(JSON.stringify({schema:"meta_instant_form_policy_check_v1",connection_id:c.id,workspace_id:c.workspace_id,
    advertiser_id:c.advertiser_id,external_account_id:c.external_account_id,expected_updated_at:c.updated_at,
    start_date:daily.start_date,policy,verified_date:date,day_totals:day.totals,
    proof:{date_from:dateFrom,date_to:target,complete:true,totals:recent.totals,evidence:recent.evidence,page_count:recent.page_count,row_count:recent.rows.length},
    report_data_saved:false}));
}
main().catch(()=>{console.error("META_INSTANT_FORM_CHECK_FAILED");process.exitCode=1;});
