import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createEgovClient } from "./egov-client.ts";
import { formatCandidates, loadCandidates, loadConditions, loadSourceRegistry, SURVEY_FILES } from "./files.ts";
import { runSurvey } from "./run-survey.ts";
import { diffCandidates, hasDifferences } from "./survey.ts";

/**
 * 法令調査（first-release-scope）の抽出を実行する。通常運用では使わない。
 *   node surveys/first-release-scope/src/cli.ts           抽出結果を candidates.json に書き出す
 *   node surveys/first-release-scope/src/cli.ts --check   再実行し、記録済みの抽出結果との差分を表示する（差分があれば終了コード1）
 */
async function main(): Promise<number> {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  const conditions = await loadConditions();
  const { sources } = await loadSourceRegistry();
  const source = sources.find((entry) => entry.source_id === conditions.source_id);
  if (!source || !source.enabled) throw new Error(`Source ${conditions.source_id} is not configured or not enabled in config/sources.yaml`);
  const client = createEgovClient({ baseUrl: source.base_url, intervalMs: source.request_interval_ms });
  const current = await runSurvey(conditions, client, { baseUrl: source.base_url, now: () => new Date() });

  if (values.check) {
    const recorded = await loadCandidates();
    const diff = diffCandidates(recorded, current);
    for (const [kind, items] of Object.entries(diff)) for (const item of items) console.log(`${kind}: ${item}`);
    console.log(JSON.stringify({ status: hasDifferences(diff) ? "changed" : "unchanged", recorded_at: recorded.retrieved_at, checked_at: current.retrieved_at, laws: current.laws.length }));
    return hasDifferences(diff) ? 1 : 0;
  }

  const previous = await readFile(SURVEY_FILES.candidates, "utf8").catch(() => undefined);
  await writeFile(SURVEY_FILES.candidates, formatCandidates(current), "utf8");
  console.log(JSON.stringify({ status: previous === undefined ? "created" : "written", output: "surveys/first-release-scope/candidates.json", retrieved_at: current.retrieved_at, laws: current.laws.length }));
  return 0;
}

main().then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
);
