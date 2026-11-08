import type { RepositoryData } from "../domain/repository.ts";
import type { Source } from "../domain/types.generated.ts";
import { checkLaw, provisionUsers, type LawCheck } from "./detect.ts";
import { EgovClient } from "./egov.ts";
import type { Fetcher } from "./http.ts";
import type { IssueTracker } from "./github.ts";
import { planIssues, type PlannedIssue } from "./report.ts";

/** config/sources.yaml のうち、e-Gov法令APIの巡回先の source_id。 */
export const EGOV_SOURCE_ID = "egov-law-api";

export function egovSource(data: RepositoryData): Source {
  const source = data.sources.sources.find((candidate) => candidate.source_id === EGOV_SOURCE_ID);
  if (!source) throw new Error(`config/sources.yaml に ${EGOV_SOURCE_ID} がない`);
  if (!source.enabled) throw new Error(`config/sources.yaml の ${EGOV_SOURCE_ID} が無効（enabled: false）`);
  return source;
}

export interface MonitorResult {
  checks: LawCheck[];
  planned: PlannedIssue[];
  /** 未完了の同じIssueがあるため作成しなかったもの */
  skipped: PlannedIssue[];
  /** 作成したIssueのURL */
  created: string[];
}

export interface MonitorOptions {
  data: RepositoryData;
  detectedAt: string;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  /** 指定すると、この law_id の法令だけを監視する */
  lawIds?: string[];
  /** 指定しなければIssueを作成しない（確認用の実行） */
  tracker?: IssueTracker;
  log?: (message: string) => void;
}

/** data/legal-sources.yaml の法令を順に照合し、改正の検知と取得の失敗をIssueにする。 */
export async function runEgovMonitor(options: MonitorOptions): Promise<MonitorResult> {
  const { data, detectedAt, tracker, log = () => {} } = options;
  const source = egovSource(data);
  const client = new EgovClient({ baseUrl: source.base_url, intervalMs: source.request_interval_ms, fetcher: options.fetcher, sleep: options.sleep });
  const users = provisionUsers(data.burdens);
  const targets = options.lawIds ? data.legalSources.filter((legal) => options.lawIds!.includes(legal.law_id)) : data.legalSources;
  const unknown = (options.lawIds ?? []).filter((lawId) => !data.legalSources.some((legal) => legal.law_id === lawId));
  if (unknown.length > 0) throw new Error(`data/legal-sources.yaml にない law_id: ${unknown.join(", ")}`);

  const checks: LawCheck[] = [];
  for (const legal of targets) {
    const check = await checkLaw(client, legal, users.get(legal.law_id) ?? new Map());
    log(`${legal.law_id} ${legal.title}: ${check.kind}`);
    checks.push(check);
  }

  const planned = planIssues(checks, detectedAt, client.baseUrl);
  const skipped: PlannedIssue[] = [];
  const created: string[] = [];
  if (tracker) {
    const open = await tracker.openIssueKeys();
    for (const issue of planned) {
      if (open.has(issue.key)) { skipped.push(issue); continue; }
      created.push(await tracker.create(issue));
      open.add(issue.key);
    }
  }
  return { checks, planned, skipped, created };
}
