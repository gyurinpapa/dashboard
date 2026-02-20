import { summarize } from "./aggregate";

export function groupByCreative(rows: any[]) {
  const map = new Map<string, any[]>();

  for (const r of rows ?? []) {
    const creative = String(r.creative ?? "").trim();
    if (!creative) continue; // ✅ creative 없으면 제외 (키워드에서 empty 제외한 것과 동일)

    if (!map.has(creative)) map.set(creative, []);
    map.get(creative)!.push(r);
  }

  const out = Array.from(map.entries()).map(([creative, items]) => {
    // imagePath는 아이템 중 첫 번째 것을 대표값으로 사용
    const imagePath = String(items.find((x) => x.imagePath)?.imagePath ?? "").trim();

    return {
      creative,
      imagePath,
      ...summarize(items),
      roas: (summarize(items).cost ?? 0) > 0 ? (summarize(items).revenue ?? 0) / (summarize(items).cost ?? 0) : 0,
    };
  });

  // 기본: 클릭 많은 순
  out.sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0));
  return out;
}

export function buildCreativeFilters(rows: any[]) {
  const campaignSet = new Set<string>();
  const groupSet = new Set<string>();

  for (const r of rows ?? []) {
    const c = String(r.campaign_name ?? "").trim();
    const g = String(r.group_name ?? "").trim();
    if (c) campaignSet.add(c);
    if (g) groupSet.add(g);
  }

  return {
    campaignOptions: ["all", ...Array.from(campaignSet).sort((a, b) => a.localeCompare(b, "ko"))],
    groupOptions: ["all", ...Array.from(groupSet).sort((a, b) => a.localeCompare(b, "ko"))],
  };
}

export function filterByCampaignGroup(args: {
  rows: any[];
  selectedCampaign: string | "all";
  selectedGroup: string | "all";
}) {
  const { rows, selectedCampaign, selectedGroup } = args;
  return (rows ?? []).filter((r) => {
    if (selectedCampaign !== "all" && String(r.campaign_name ?? "").trim() !== selectedCampaign) return false;
    if (selectedGroup !== "all" && String(r.group_name ?? "").trim() !== selectedGroup) return false;
    return true;
  });
}
