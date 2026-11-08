import type { RepositoryData } from "../domain/repository.ts";
import type { Source } from "../domain/types.generated.ts";
import { checkLaw, provisionUsers, type LawCheck } from "./detect.ts";
import { EgovClient } from "./egov.ts";
import type { IssueTracker } from "./github.ts";
import type { Fetcher } from "./http.ts";
import { planIssues, type PlannedIssue } from "./report.ts";

/** config/sources.yaml のうち、e-Gov法令APIの巡回先の source_id。 */
export const EGOV_SOURCE_ID = "egov-law-api";

export interface MonitorOptions {
  data: RepositoryData;
  detectedAt: string;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  /** 指定すると、この source_id の巡回先だけを監視する */
  sourceIds?: string[];
  /** 指定すると、e-Gov法令APIの監視でこの law_id の法令だけを監視する */
  lawIds?: string[];
  /** 指定しなければIssueを作成しない（確認用の実行） */
  tracker?: IssueTracker;
  log?: (message: string) => void;
}

interface SourceResult {
  checks: LawCheck[];
  planned: PlannedIssue[];
}

/** 巡回先ごとの監視の処理。取得方式は巡回先ごとに異なるため、source_id ごとに実装する（ADR 0003）。 */
type SourceMonitor = (source: Source, options: MonitorOptions) => Promise<SourceResult>;

/** data/legal-sources.yaml の法令を順に照合し、改正の検知と取得の失敗をIssueの案にする。 */
async function monitorEgov(source: Source, options: MonitorOptions): Promise<SourceResult> {
  const { data, detectedAt, log = () => {} } = options;
  const client = new EgovClient({ baseUrl: source.base_url, intervalMs: source.request_interval_ms, fetcher: options.fetcher, sleep: options.sleep });
  const users = provisionUsers(data.burdens);
  const targets = options.lawIds ? data.legalSources.filter((legal) => options.lawIds!.includes(legal.law_id)) : data.legalSources;
  const checks: LawCheck[] = [];
  for (const legal of targets) {
    const check = await checkLaw(client, legal, users.get(legal.law_id) ?? new Map());
    log(`${source.source_id} ${legal.law_id} ${legal.title}: ${check.kind}`);
    checks.push(check);
  }
  return { checks, planned: planIssues(checks, detectedAt, client.baseUrl) };
}

const MONITORS: Record<string, SourceMonitor> = {
  [EGOV_SOURCE_ID]: monitorEgov
};

/**
 * 巡回先ごとの実行結果。
 * - monitored: 監視した
 * - disabled: config/sources.yaml で無効（enabled: false）
 * - not_implemented: 監視の処理が未実装（例: 厚生労働省の公表ページは #167）
 */
export interface SourceStatus {
  source_id: string;
  status: "monitored" | "disabled" | "not_implemented";
}

export interface MonitorResult {
  sources: SourceStatus[];
  checks: LawCheck[];
  planned: PlannedIssue[];
  /** 未完了の同じIssueがあるため作成しなかったもの */
  skipped: PlannedIssue[];
  /** 作成したIssueのURL */
  created: string[];
}

/** config/sources.yaml の巡回先を順に監視し、検知した変化と取得の失敗をIssueにする。 */
export async function runMonitor(options: MonitorOptions): Promise<MonitorResult> {
  const { data, tracker, log = () => {} } = options;
  const configured = data.sources.sources;
  const unknownSources = (options.sourceIds ?? []).filter((id) => !configured.some((source) => source.source_id === id));
  if (unknownSources.length > 0) throw new Error(`config/sources.yaml にない source_id: ${unknownSources.join(", ")}`);
  const selected = options.sourceIds ? configured.filter((source) => options.sourceIds!.includes(source.source_id)) : configured;
  if (options.lawIds) {
    const unknownLaws = options.lawIds.filter((lawId) => !data.legalSources.some((legal) => legal.law_id === lawId));
    if (unknownLaws.length > 0) throw new Error(`data/legal-sources.yaml にない law_id: ${unknownLaws.join(", ")}`);
    if (!selected.some((source) => source.source_id === EGOV_SOURCE_ID && source.enabled)) throw new Error(`law_id を指定するには、有効な ${EGOV_SOURCE_ID} を監視対象に含める`);
  }

  const sources: SourceStatus[] = [];
  const checks: LawCheck[] = [];
  const planned: PlannedIssue[] = [];
  for (const source of selected) {
    const monitor = MONITORS[source.source_id];
    if (!source.enabled) { sources.push({ source_id: source.source_id, status: "disabled" }); log(`${source.source_id}: 無効（enabled: false）のため監視しない`); continue; }
    if (!monitor) { sources.push({ source_id: source.source_id, status: "not_implemented" }); log(`${source.source_id}: 監視の処理が未実装のため監視しない`); continue; }
    const result = await monitor(source, options);
    sources.push({ source_id: source.source_id, status: "monitored" });
    checks.push(...result.checks);
    planned.push(...result.planned);
  }

  const skipped: PlannedIssue[] = [];
  const created: string[] = [];
  if (tracker && planned.length > 0) {
    const open = await tracker.openIssueKeys();
    for (const issue of planned) {
      if (open.has(issue.key)) { skipped.push(issue); continue; }
      created.push(await tracker.create(issue));
      open.add(issue.key);
    }
  }
  return { sources, checks, planned, skipped, created };
}
