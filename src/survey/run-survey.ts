import { mergeHits } from "../domain/survey.ts";
import { formatJst } from "../domain/time.ts";
import type { SurveyArticle, SurveyCandidates, SurveyConditions } from "../domain/types.generated.ts";
import type { EgovClient } from "./egov-client.ts";

/** 抽出条件に従ってe-Gov法令APIを検索し、抽出結果を作る。 */
export async function runSurvey(conditions: SurveyConditions, client: EgovClient, { baseUrl, now }: { baseUrl: string; now: () => Date }): Promise<SurveyCandidates> {
  const results: Array<{ conditionId: string; hits: Awaited<ReturnType<EgovClient["keyword"]>> }> = [];
  const articles: SurveyArticle[] = [];
  for (const condition of conditions.conditions) {
    if (condition.method === "category" && condition.category_cd) {
      results.push({ conditionId: condition.condition_id, hits: await client.lawsByCategory(condition.category_cd, conditions.law_type) });
    } else if (condition.method === "keyword" && condition.keyword) {
      results.push({ conditionId: condition.condition_id, hits: await client.keyword(condition.keyword, conditions.law_type) });
    } else if (condition.method === "articles" && condition.law_id && condition.elms) {
      for (const elm of condition.elms) {
        const { law_revision_id, text } = await client.article(condition.law_id, elm);
        articles.push({ condition_id: condition.condition_id, law_id: condition.law_id, elm, law_revision_id, text });
      }
    } else {
      throw new Error(`${condition.condition_id}: incomplete condition for method ${condition.method}`);
    }
  }
  const { laws, counts } = mergeHits(results);
  const retrievedAt = formatJst(now());
  return {
    survey_id: conditions.survey_id,
    retrieved_at: retrievedAt,
    base_url: baseUrl,
    law_type: conditions.law_type,
    condition_results: conditions.conditions.filter((condition) => condition.method !== "articles").map((condition) => ({ condition_id: condition.condition_id, ...(counts.get(condition.condition_id) ?? { law_count: 0, excluded_repealed_count: 0 }) })),
    laws,
    articles
  };
}
