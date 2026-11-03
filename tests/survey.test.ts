import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { loadRepository } from "../src/data/repository.ts";
import { loadSurveyCandidates, loadSurveyConditions, loadSurveyJudgments } from "../src/data/survey-files.ts";
import { checkJudgments, diffCandidates, hasDifferences, mergeHits, type EgovLawHit } from "../src/domain/survey.ts";
import type { SurveyCandidates } from "../src/domain/types.generated.ts";
import { createEgovClient } from "../src/survey/egov-client.ts";
import { runSurvey } from "../src/survey/run-survey.ts";
import { ROOT } from "./helpers.ts";

const surveyIds = (await readdir(join(ROOT, "docs/surveys"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

for (const surveyId of surveyIds) {
  test(`survey ${surveyId}: files pass their schemas and every candidate is judged`, async () => {
    const conditions = await loadSurveyConditions(ROOT, surveyId);
    const candidates = await loadSurveyCandidates(ROOT, surveyId);
    const judgments = await loadSurveyJudgments(ROOT, surveyId);
    const { data } = await loadRepository(ROOT);
    assert.equal(conditions.survey_id, surveyId);
    assert.deepEqual(checkJudgments(candidates, judgments, new Set(data.groups.groups.map((group) => group.group_id))), []);
  });
}

test("survey first-release-scope: target laws and registered legal sources match", async () => {
  const judgments = await loadSurveyJudgments(ROOT, "first-release-scope");
  const { data } = await loadRepository(ROOT);
  const targets = judgments.judgments.filter((judgment) => judgment.judgment === "target").map((judgment) => judgment.law_id).sort();
  assert.deepEqual(data.legalSources.map((source) => source.law_id), targets);
});

const hit = (lawId: string, overrides: Partial<EgovLawHit> = {}): EgovLawHit => ({
  law_id: lawId, law_title: `法${lawId}`, law_num: "令和元年法律第一号", category: "国税", law_revision_id: `${lawId}_r1`, current_revision_status: "CurrentEnforced", repeal_status: "None", ...overrides
});

test("hits are merged by law, sorted, and repealed laws are excluded", () => {
  const { laws, counts } = mergeHits([
    { conditionId: "b-cond", hits: [hit("999AC0000000002", { snippet: "税を課する" }), hit("999AC0000000003", { repeal_status: "Repeal" })] },
    { conditionId: "a-cond", hits: [hit("999AC0000000002"), hit("999AC0000000001"), hit("999AC0000000001")] }
  ]);
  assert.deepEqual(laws.map((law) => law.law_id), ["999AC0000000001", "999AC0000000002"]);
  assert.deepEqual(laws[1]!.matched_conditions, ["a-cond", "b-cond"]);
  assert.deepEqual(laws[1]!.snippets, [{ condition_id: "b-cond", text: "税を課する" }]);
  assert.deepEqual(counts.get("b-cond"), { law_count: 1, excluded_repealed_count: 1 });
  assert.deepEqual(counts.get("a-cond"), { law_count: 2, excluded_repealed_count: 0 });
});

function candidates(laws: SurveyCandidates["laws"], overrides: Partial<SurveyCandidates> = {}): SurveyCandidates {
  return { survey_id: "s", retrieved_at: "2026-11-01T09:00:00+09:00", base_url: "https://example.com/", law_type: "Act", condition_results: [{ condition_id: "a-cond", law_count: laws.length }], laws, articles: [], ...overrides };
}

test("diffs report added, removed, and revised laws but ignore the retrieval time", () => {
  const { laws } = mergeHits([{ conditionId: "a-cond", hits: [hit("999AC0000000001"), hit("999AC0000000002")] }]);
  const recorded = candidates(laws);
  assert.equal(hasDifferences(diffCandidates(recorded, { ...recorded, retrieved_at: "2026-12-01T09:00:00+09:00" })), false);
  const changed = mergeHits([{ conditionId: "a-cond", hits: [hit("999AC0000000002", { law_revision_id: "r2" }), hit("999AC0000000003")] }]).laws;
  const diff = diffCandidates(recorded, candidates(changed));
  assert.deepEqual(diff.added, ["999AC0000000003 法999AC0000000003"]);
  assert.deepEqual(diff.removed, ["999AC0000000001 法999AC0000000001"]);
  assert.ok(diff.revised[0]?.includes("999AC0000000002_r1 -> r2"));
});

test("judgments must cover every candidate exactly once", () => {
  const { laws } = mergeHits([{ conditionId: "a-cond", hits: [hit("999AC0000000001"), hit("999AC0000000002")] }]);
  const errors = checkJudgments(candidates(laws), {
    survey_id: "s",
    judged_against: "2026-11-01T09:00:00+09:00",
    judgments: [
      { law_id: "999AC0000000001", law_title: "a", judgment: "target", reason: "課税する規定", articles: ["第一条"], groups: ["missing"] },
      { law_id: "999AC0000000001", law_title: "a", judgment: "excluded", reason: "重複した判定" },
      { law_id: "999AC0000000009", law_title: "x", judgment: "excluded", reason: "候補にない法令" }
    ]
  }, new Set());
  assert.ok(errors.some((error) => error.includes("judged more than once")));
  assert.ok(errors.some((error) => error.includes("999AC0000000009: not in candidates")));
  assert.ok(errors.some((error) => error.includes("unknown group missing")));
  assert.ok(errors.some((error) => error.includes("999AC0000000002") && error.includes("no judgment")));
});

test("the e-Gov client paginates, waits between requests, and reads article text", async () => {
  const requested: string[] = [];
  const waits: number[] = [];
  const pages: Record<string, unknown> = {
    "0": { laws: [{ law_info: { law_id: "999AC0000000001", law_num: "n" }, revision_info: { law_revision_id: "r", law_title: "t", category: "国税", repeal_status: "None", current_revision_status: "CurrentEnforced" } }], next_offset: 1 },
    "1": { laws: [] }
  };
  const client = createEgovClient({
    baseUrl: "https://example.com/api/",
    intervalMs: 1000,
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async (url) => {
      requested.push(url);
      const parsed = new URL(url);
      const body = parsed.pathname.endsWith("/laws")
        ? pages[parsed.searchParams.get("offset") ?? "0"]
        : { revision_info: { law_revision_id: "r9" }, law_full_text: { tag: "Article", children: ["第一条", { tag: "Sentence", children: ["税を課する。"] }] } };
      return { ok: true, status: 200, json: async () => body };
    }
  });
  const hits = await client.lawsByCategory("013", "Act");
  assert.deepEqual(hits.map((entry) => entry.law_id), ["999AC0000000001"]);
  assert.ok(requested[0]?.startsWith("https://example.com/api/laws?category_cd=013&law_type=Act&limit=100&offset=0"));
  assert.ok(waits.length >= 1 && waits.every((ms) => ms > 0 && ms <= 1000));
  assert.deepEqual(await client.article("999AC0000000001", "MainProvision-Article_1"), { law_revision_id: "r9", text: "第一条税を課する。" });
});

test("the e-Gov client reports structural changes", async () => {
  const client = createEgovClient({ baseUrl: "https://example.com/", intervalMs: 0, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ unexpected: [] }) }) });
  await assert.rejects(client.keyword("税", "Act"), /structure changed/);
  const failing = createEgovClient({ baseUrl: "https://example.com/", intervalMs: 0, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  await assert.rejects(failing.lawsByCategory("013", "Act"), /HTTP 503/);
});

test("a survey run records condition counts and article text", async () => {
  const fake = {
    lawsByCategory: async () => [hit("999AC0000000001")],
    keyword: async () => [hit("999AC0000000001", { snippet: "s" }), hit("999AC0000000002", { repeal_status: "Repeal" })],
    article: async () => ({ law_revision_id: "r", text: "第四条" })
  };
  const result = await runSurvey({
    survey_id: "s",
    source_id: "egov-law-api",
    law_type: "Act",
    conditions: [
      { condition_id: "c-cat", burden_category: "national_tax", method: "category", category_cd: "013", description: "分類" },
      { condition_id: "c-key", burden_category: "national_tax", method: "keyword", keyword: "税", description: "検索" },
      { condition_id: "c-art", burden_category: "local_tax", method: "articles", law_id: "999AC0000000001", elms: ["MainProvision-Article_4"], description: "条項" }
    ]
  }, fake as never, { baseUrl: "https://example.com/", now: () => new Date("2026-11-03T01:02:03.456Z") });
  assert.equal(result.retrieved_at, "2026-11-03T10:02:03+09:00");
  assert.deepEqual(result.condition_results, [{ condition_id: "c-cat", law_count: 1, excluded_repealed_count: 0 }, { condition_id: "c-key", law_count: 1, excluded_repealed_count: 1 }]);
  assert.deepEqual(result.laws[0]!.matched_conditions, ["c-cat", "c-key"]);
  assert.equal(result.articles[0]!.text, "第四条");
});
