import type { SurveyCandidates, SurveyJudgments, SurveyLaw } from "./types.generated.ts";

/** e-Gov法令APIの検索結果1件のうち、調査に使う項目。 */
export interface EgovLawHit {
  law_id: string;
  law_title: string;
  law_num: string;
  category: string;
  law_revision_id: string;
  current_revision_status: string;
  repeal_status: string;
  snippet?: string;
}

/** 条件ごとの検索結果を、法令ID順の重複のない一覧にまとめる。廃止・失効した法令は除く。 */
export function mergeHits(results: ReadonlyArray<{ conditionId: string; hits: readonly EgovLawHit[] }>): { laws: SurveyLaw[]; counts: Map<string, { law_count: number; excluded_repealed_count: number }> } {
  const byId = new Map<string, SurveyLaw>();
  const counts = new Map<string, { law_count: number; excluded_repealed_count: number }>();
  for (const { conditionId, hits } of results) {
    const current = hits.filter((hit) => hit.repeal_status === "None");
    const unique = new Map(current.map((hit) => [hit.law_id, hit]));
    counts.set(conditionId, { law_count: unique.size, excluded_repealed_count: new Set(hits.map((hit) => hit.law_id)).size - unique.size });
    for (const hit of unique.values()) {
      const law = byId.get(hit.law_id) ?? {
        law_id: hit.law_id,
        law_title: hit.law_title,
        law_num: hit.law_num,
        category: hit.category,
        law_revision_id: hit.law_revision_id,
        current_revision_status: hit.current_revision_status,
        matched_conditions: [] as unknown as SurveyLaw["matched_conditions"]
      };
      law.matched_conditions.push(conditionId);
      if (hit.snippet !== undefined) (law.snippets ??= []).push({ condition_id: conditionId, text: hit.snippet });
      byId.set(hit.law_id, law);
    }
  }
  const laws = [...byId.values()].sort((a, b) => a.law_id.localeCompare(b.law_id));
  for (const law of laws) law.matched_conditions.sort();
  return { laws, counts };
}

export interface CandidateDiff {
  added: string[];
  removed: string[];
  revised: string[];
  conditionCounts: string[];
}

/** 記録済みの抽出結果と再実行した結果の差分。取得日時と抜粋の文面は比較しない。 */
export function diffCandidates(recorded: SurveyCandidates, current: SurveyCandidates): CandidateDiff {
  const before = new Map(recorded.laws.map((law) => [law.law_id, law]));
  const after = new Map(current.laws.map((law) => [law.law_id, law]));
  const label = (law: SurveyLaw): string => `${law.law_id} ${law.law_title}`;
  const added = [...after.values()].filter((law) => !before.has(law.law_id)).map(label);
  const removed = [...before.values()].filter((law) => !after.has(law.law_id)).map(label);
  const revised: string[] = [];
  for (const [lawId, law] of after) {
    const old = before.get(lawId);
    if (!old) continue;
    if (old.law_revision_id !== law.law_revision_id) revised.push(`${label(law)}: ${old.law_revision_id} -> ${law.law_revision_id}`);
    if (old.matched_conditions.join(",") !== law.matched_conditions.join(",")) revised.push(`${label(law)}: conditions ${old.matched_conditions.join(",")} -> ${law.matched_conditions.join(",")}`);
  }
  const oldCounts = new Map(recorded.condition_results.map((result) => [result.condition_id, result.law_count]));
  const conditionCounts = current.condition_results
    .filter((result) => oldCounts.get(result.condition_id) !== result.law_count)
    .map((result) => `${result.condition_id}: ${oldCounts.get(result.condition_id) ?? "none"} -> ${result.law_count}`);
  const oldArticles = new Map(recorded.articles.map((article) => [`${article.law_id} ${article.elm}`, article.text]));
  for (const article of current.articles) {
    const key = `${article.law_id} ${article.elm}`;
    if (oldArticles.get(key) !== article.text) revised.push(`${key}: article text changed`);
  }
  return { added, removed, revised, conditionCounts };
}

export function hasDifferences(diff: CandidateDiff): boolean {
  return Object.values(diff).some((items) => items.length > 0);
}

/** 抽出結果の全件に判定が1つずつあり、判定が抽出結果にない法令を含まないことを検査する。 */
export function checkJudgments(candidates: SurveyCandidates, judgments: SurveyJudgments, groupIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  if (judgments.survey_id !== candidates.survey_id) errors.push(`survey_id ${judgments.survey_id} does not match ${candidates.survey_id}`);
  if (judgments.judged_against !== candidates.retrieved_at) errors.push(`judged_against ${judgments.judged_against} does not match candidates retrieved_at ${candidates.retrieved_at}`);
  const candidateIds = new Set(candidates.laws.map((law) => law.law_id));
  const seen = new Set<string>();
  for (const judgment of judgments.judgments) {
    if (seen.has(judgment.law_id)) errors.push(`${judgment.law_id}: judged more than once`);
    seen.add(judgment.law_id);
    if (!candidateIds.has(judgment.law_id)) errors.push(`${judgment.law_id}: not in candidates`);
    for (const groupId of judgment.groups ?? []) {
      if (!groupIds.has(groupId)) errors.push(`${judgment.law_id}: unknown group ${groupId}`);
    }
  }
  for (const law of candidates.laws) {
    if (!seen.has(law.law_id)) errors.push(`${law.law_id} ${law.law_title}: no judgment`);
  }
  return errors;
}
