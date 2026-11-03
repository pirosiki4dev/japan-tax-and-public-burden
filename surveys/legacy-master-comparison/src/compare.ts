import type { LegacyItem } from "./legacy.ts";

export const RESULTS = ["target", "later", "pending", "excluded", "not_found"] as const;
export type ComparisonResult = (typeof RESULTS)[number];

/** 旧版マスタの1件と、最初のリリースの調査結果との対応。 */
export interface Mapping {
  legacy_id: string;
  legacy_name: string;
  result: ComparisonResult;
  groups?: string[];
  /** 旧版が根拠とした法律のうち、新しい構成では根拠にしないもの（理由は reason に書く）。 */
  replaced_law_ids?: string[];
  reason: string;
}

/** 最初のリリースの調査での法律ごとの判定（law_id → judgment）。 */
export type LawJudgments = ReadonlyMap<string, string>;

/**
 * 対応付けを検査する。
 * - 旧版の全件がちょうど1回ずつ対応付けられていること
 * - target は存在するグループを1つ以上持ち、それ以外はグループを持たないこと
 * - 旧版の根拠法令が最初のリリースの調査で「対象外」と判定されていながら、対応が target・later になっていないこと（replaced_law_ids に挙げた法律を除く）
 */
export function checkMappings(items: readonly LegacyItem[], mappings: readonly Mapping[], groupIds: ReadonlySet<string>, lawJudgments: LawJudgments): string[] {
  const errors: string[] = [];
  const itemIds = new Set(items.map((item) => item.legacy_id));
  const seen = new Set<string>();
  const byId = new Map(items.map((item) => [item.legacy_id, item]));
  for (const mapping of mappings) {
    const id = mapping.legacy_id;
    if (seen.has(id)) errors.push(`${id}: mapped more than once`);
    seen.add(id);
    if (!itemIds.has(id)) errors.push(`${id}: not in legacy items`);
    for (const lawId of mapping.replaced_law_ids ?? []) if (!byId.get(id)?.law_ids.includes(lawId)) errors.push(`${id}: replaced law ${lawId} is not a legacy legal basis`);
    if (!RESULTS.includes(mapping.result)) errors.push(`${id}: unknown result ${String(mapping.result)}`);
    if (!mapping.reason || mapping.reason.length < 5) errors.push(`${id}: reason is required`);
    if (mapping.result === "target") {
      if (!mapping.groups || mapping.groups.length === 0) errors.push(`${id}: target requires groups`);
      for (const group of mapping.groups ?? []) if (!groupIds.has(group)) errors.push(`${id}: unknown group ${group}`);
    } else if (mapping.groups) {
      errors.push(`${id}: only target may have groups`);
    }
    if (mapping.result === "target" || mapping.result === "later") {
      for (const lawId of byId.get(id)?.law_ids ?? []) {
        if (mapping.replaced_law_ids?.includes(lawId)) continue;
        if (lawJudgments.get(lawId) === "excluded") errors.push(`${id}: law ${lawId} is judged excluded in first-release-scope`);
      }
    }
  }
  for (const id of itemIds) if (!seen.has(id)) errors.push(`${id}: not mapped`);
  return errors;
}
