// src/lib/report/keyword.ts

export function groupByKeyword(rows: any[]) {
  const map = new Map<string, any>();

  const s = (v: any) => (v == null ? "" : String(v).trim());

  const toNum = (v: any) => {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = Number(String(v).replace(/[%₩,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const getKeyword = (r: any) =>
    s(r.keyword ?? r.query ?? r.term ?? r.name ?? r.label);

  const getCampaign = (r: any) =>
    s(
      r.campaign_name ??
        r.campaign ??
        r.campaignName ??
        r.campaign_nm ??
        r.campaignNm ??
        r.campaign_title ??
        r.cmp_name ??
        r.cmp_nm
    );

  const getGroup = (r: any) =>
    s(
      r.group_name ??
        r.group ??
        r.groupName ??
        r.group_nm ??
        r.groupNm ??
        r.adgroup_name ??
        r.adgroup ??
        r.adgroupName ??
        r.grp_name ??
        r.grp_nm
    );

  const getKey = (r: any) => {
    const kw = getKeyword(r);
    const c = getCampaign(r);
    const g = getGroup(r);
    return kw ? `${kw}␟${c}␟${g}` : "";
  };

  for (const r of rows ?? []) {
    const kw = getKeyword(r);
    if (!kw) continue;

    const c = getCampaign(r);
    const g = getGroup(r);
    const k = getKey(r);
    if (!k) continue;

    if (!map.has(k)) {
      map.set(k, {
        keyword: kw,
        campaign_name: c || null,
        group_name: g || null,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        revenue: 0,
      });
    }

    const t = map.get(k);

    t.impressions += toNum(r.impressions ?? r.impr ?? r.imp);
    t.clicks += toNum(r.clicks ?? r.clk ?? r.click);
    t.cost += toNum(r.cost ?? r.spend ?? r.ad_cost);
    t.conversions += toNum(r.conversions ?? r.conv ?? r.cv);
    t.revenue += toNum(r.revenue ?? r.sales ?? r.purchase_amount ?? r.gmv);
  }

  const arr = Array.from(map.values()).map((x) => {
    const impressions = toNum(x.impressions);
    const clicks = toNum(x.clicks);
    const cost = toNum(x.cost);
    const conversions = toNum(x.conversions);
    const revenue = toNum(x.revenue);

    return {
      ...x,
      impressions,
      clicks,
      cost,
      conversions,
      revenue,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc: clicks > 0 ? cost / clicks : 0,
      cvr: clicks > 0 ? conversions / clicks : 0,
      cpa: conversions > 0 ? cost / conversions : 0,
      roas: cost > 0 ? revenue / cost : 0,
    };
  });

  arr.sort((a, b) => {
    const clickDiff = toNum(b.clicks) - toNum(a.clicks);
    if (clickDiff !== 0) return clickDiff;
    return String(a.keyword ?? "").localeCompare(String(b.keyword ?? ""), "ko");
  });

  return arr;
}