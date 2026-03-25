export function extractAdvertiserName(rows: any[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  const keys = ["advertiser_name", "advertiser", "account", "client_name"];

  for (const row of rows) {
    for (const key of keys) {
      const v = row?.[key];
      if (v && String(v).trim()) {
        return String(v).trim();
      }
    }
  }

  return "";
}