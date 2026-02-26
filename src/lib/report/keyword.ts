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

  // ✅ 키워드 + 캠페인 + 그룹 기준으로 집계 (A안)
  const getKeyword = (r: any) => s(r.keyword ?? r.query ?? r.term ?? r.name ?? r.label);

  // 원천 rows에 실려 있을 수 있는 키들(프로젝트 톤 맞춰 최대한 안전하게)
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

  // 구분자 충돌 방지(희귀 문자)
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
    const k = `${kw}␟${c}␟${g}`;

    if (!map.has(k)) {
      map.set(k, {
        keyword: kw,

        // ✅ KeywordSection에서 읽을 수 있도록 포함
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

    // ✅ 기존 코드(Number(..)||0)보다 안전하게 숫자 정규화
    t.impressions += toNum(r.impressions ?? r.impr ?? r.imp);
    t.clicks += toNum(r.clicks ?? r.clk);
    t.cost += toNum(r.cost);
    t.conversions += toNum(r.conversions ?? r.conv);
    t.revenue += toNum(r.revenue);
  }

  // ✅ 기존 결과 유지: roas만 추가
  const arr = Array.from(map.values()).map((x) => ({
    ...x,
    roas: x.cost > 0 ? x.revenue / x.cost : 0,
  }));

  // ✅ 기존 정렬/슬라이스 유지 (Top20, clicks desc)
  arr.sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  return arr.slice(0, 20);
}