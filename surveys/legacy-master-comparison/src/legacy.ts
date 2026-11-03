/** 旧版マスタの1件（比較に使う項目だけ）。 */
export interface LegacyItem {
  legacy_id: string;
  name: string;
  legacy_category: string;
  legacy_status: "canonical" | "hold";
  law_ids: string[];
  law_names: string[];
}

interface CanonicalBurden {
  public_burden_id: string;
  name: string;
  category: string;
  legacy_record?: { official_name?: string; legal_bases?: Array<{ law_id: string | null; name?: string }> };
}

interface ImportCandidate {
  source_record_id: string;
  disposition: string;
  record?: { official_name?: string; name_raw?: string; burden_type?: string };
}

/**
 * 旧版の正本（canonical.json）と候補一覧（initial-import.json）から、比較の対象を作る。
 * 正本の全件と、正本に入らなかった候補（保留）を、旧版のIDの昇順で返す。
 */
export function buildLegacyItems(canonical: { public_burdens: CanonicalBurden[] }, initialImport: { candidates: ImportCandidate[] }): LegacyItem[] {
  const items = new Map<string, LegacyItem>();
  for (const burden of canonical.public_burdens) {
    const bases = (burden.legacy_record?.legal_bases ?? []).filter((base) => base.law_id);
    const name = burden.name !== "unknown" ? burden.name : burden.legacy_record?.official_name ?? "unknown";
    items.set(burden.public_burden_id, {
      legacy_id: burden.public_burden_id,
      name,
      legacy_category: burden.category,
      legacy_status: "canonical",
      law_ids: [...new Set(bases.map((base) => base.law_id as string))],
      law_names: [...new Set(bases.map((base) => base.name ?? ""))].filter(Boolean)
    });
  }
  const canonicalIds = new Set(items.keys());
  for (const candidate of initialImport.candidates) {
    const id = candidate.source_record_id;
    if (canonicalIds.has(id) || candidate.disposition === "merged") continue;
    const record = candidate.record ?? {};
    items.set(id, { legacy_id: id, name: record.official_name ?? record.name_raw ?? "unknown", legacy_category: record.burden_type ?? "unknown", legacy_status: "hold", law_ids: [], law_names: [] });
  }
  return [...items.values()].sort((a, b) => a.legacy_id.localeCompare(b.legacy_id));
}
