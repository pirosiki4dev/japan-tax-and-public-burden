import { parseArgs } from "node:util";
import { loadRepository } from "../data/repository.ts";
import { formatJst } from "../domain/time.ts";
import { GitHubIssues } from "../monitor/github.ts";
import { runMonitor } from "../monitor/run.ts";
import { REPOSITORY_ROOT, runMain } from "./args.ts";

/**
 * config/sources.yaml の巡回先を監視し、検知した変化と取得の失敗をIssueにする。
 *   --dry-run      Issueを作成せず、作成するIssueを表示する
 *   --source <id>  指定した source_id の巡回先だけを監視する（複数指定可）
 *   --law <id>     e-Gov法令APIの監視で、指定した law_id の法令だけを監視する（複数指定可）
 * Issueを作成するときは、環境変数 GITHUB_TOKEN と GITHUB_REPOSITORY（owner/repo）が必要。
 */
runMain(async () => {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false }, source: { type: "string", multiple: true }, law: { type: "string", multiple: true } } });
  const dryRun = values["dry-run"] ?? false;
  const { data, errors } = await loadRepository(REPOSITORY_ROOT);
  if (errors.length > 0) {
    for (const error of errors) console.error(`error: ${error}`);
    throw new Error("正本または設定がSchema検証を通らないため、監視を中止した");
  }

  let tracker;
  if (!dryRun) {
    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    if (!token || !repository) throw new Error("Issueを作成するには GITHUB_TOKEN と GITHUB_REPOSITORY が必要（確認だけなら --dry-run）");
    tracker = new GitHubIssues({ repository, token, api: process.env.GITHUB_API_URL });
  }

  const result = await runMonitor({ data, detectedAt: formatJst(new Date()), sourceIds: values.source, lawIds: values.law, tracker, log: (message) => console.error(message) });

  if (dryRun) {
    for (const issue of result.planned) console.log(`----- ${issue.title}\n${issue.body}\n`);
  }
  for (const url of result.created) console.error(`created: ${url}`);
  for (const issue of result.skipped) console.error(`skipped (open issue exists): ${issue.title}`);
  console.error(JSON.stringify({
    dry_run: dryRun,
    sources: Object.fromEntries(result.sources.map(({ source_id, status, summary }) => [source_id, summary ? { status, ...summary } : { status }])),
    planned: result.planned.length, created: result.created.length, skipped: result.skipped.length
  }));
  return 0;
});
