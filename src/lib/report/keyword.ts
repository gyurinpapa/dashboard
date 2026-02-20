export function groupByKeyword(rows: any[]) {
  const map = new Map<string, any>();

  const getKey = (r: any) => String(r.keyword ?? r.query ?? r.term ?? "").trim();

  for (const r of rows ?? []) {
    const k = getKey(r);
    if (!k) continue;

    if (!map.has(k)) {
      map.set(k, {
        keyword: k,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        revenue: 0,
      });
    }

    const t = map.get(k);
    t.impressions += Number(r.impressions) || 0;
    t.clicks += Number(r.clicks) || 0;
    t.cost += Number(r.cost) || 0;
    t.conversions += Number(r.conversions) || 0;
    t.revenue += Number(r.revenue) || 0;
  }

  const arr = Array.from(map.values()).map((x) => ({
    ...x,
    roas: x.cost > 0 ? x.revenue / x.cost : 0,
  }));

  arr.sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  return arr.slice(0, 20);
}
