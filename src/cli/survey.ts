import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { formatCandidates, loadSourceRegistry, loadSurveyCandidates, loadSurveyConditions, surveyPaths } from "../data/survey-files.ts";
import { diffCandidates, hasDifferences } from "../domain/survey.ts";
import { createEgovClient } from "../survey/egov-client.ts";
import { runSurvey } from "../survey/run-survey.ts";
import { REPOSITORY_ROOT, runMain } from "./args.ts";

/**
 * 法令調査の抽出を実行する。
 *   node src/cli/survey.ts --survey <survey-id>          抽出結果を candidates.json に書き出す
 *   node src/cli/survey.ts --survey <survey-id> --check  再実行し、記録済みの抽出結果との差分を表示する（差分があれば終了コード1）
 */
runMain(async () => {
  const { values } = parseArgs({ options: { survey: { type: "string" }, check: { type: "boolean", default: false } } });
  if (!values.survey) throw new Error("Usage: node src/cli/survey.ts --survey <survey-id> [--check]");
  const conditions = await loadSurveyConditions(REPOSITORY_ROOT, values.survey);
  const { sources } = await loadSourceRegistry(REPOSITORY_ROOT);
  const source = sources.find((entry) => entry.source_id === conditions.source_id);
  if (!source || !source.enabled) throw new Error(`Source ${conditions.source_id} is not configured or not enabled in config/sources.yaml`);
  const client = createEgovClient({ baseUrl: source.base_url, intervalMs: source.request_interval_ms });
  const current = await runSurvey(conditions, client, { baseUrl: source.base_url, now: () => new Date() });
  const paths = surveyPaths(REPOSITORY_ROOT, values.survey);

  if (values.check) {
    const recorded = await loadSurveyCandidates(REPOSITORY_ROOT, values.survey);
    const diff = diffCandidates(recorded, current);
    for (const [kind, items] of Object.entries(diff)) for (const item of items) console.log(`${kind}: ${item}`);
    console.log(JSON.stringify({ status: hasDifferences(diff) ? "changed" : "unchanged", recorded_at: recorded.retrieved_at, checked_at: current.retrieved_at, laws: current.laws.length }));
    return hasDifferences(diff) ? 1 : 0;
  }

  const previous = await readFile(paths.candidates, "utf8").catch(() => undefined);
  await writeFile(paths.candidates, formatCandidates(current), "utf8");
  console.log(JSON.stringify({ status: previous === undefined ? "created" : "written", output: `docs/surveys/${values.survey}/candidates.json`, retrieved_at: current.retrieved_at, laws: current.laws.length }));
  return 0;
});
