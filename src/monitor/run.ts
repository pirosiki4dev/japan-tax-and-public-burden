import { monitorEgov } from "./egov/monitor.ts";
import { fileIssues, type IssueTracker, type PlannedIssue } from "./issues.ts";
import type { MonitorContext, SourceMonitor } from "./source-monitor.ts";

/** config/sources.yaml のうち、e-Gov法令APIの巡回先の source_id。 */
export const EGOV_SOURCE_ID = "egov-law-api";

/** 巡回先（source_id）と監視の処理の対応。処理のない巡回先は監視しない旨を報告する。 */
const MONITORS: Record<string, SourceMonitor> = {
  [EGOV_SOURCE_ID]: monitorEgov
};

export interface MonitorOptions extends MonitorContext {
  /** 指定すると、この source_id の巡回先だけを監視する */
  sourceIds?: string[];
  /** 指定しなければIssueを作成しない（確認用の実行） */
  tracker?: IssueTracker;
}

/**
 * 巡回先ごとの実行結果。
 * - monitored: 監視した（summary は件数の内訳）
 * - disabled: config/sources.yaml で無効（enabled: false）
 * - not_implemented: 監視の処理が未実装（例: 厚生労働省の公表ページは #167）
 */
export interface SourceStatus {
  source_id: string;
  status: "monitored" | "disabled" | "not_implemented";
  summary?: Record<string, number>;
}

export interface MonitorResult {
  sources: SourceStatus[];
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
  const planned: PlannedIssue[] = [];
  for (const source of selected) {
    const monitor = MONITORS[source.source_id];
    if (!source.enabled) { sources.push({ source_id: source.source_id, status: "disabled" }); log(`${source.source_id}: 無効（enabled: false）のため監視しない`); continue; }
    if (!monitor) { sources.push({ source_id: source.source_id, status: "not_implemented" }); log(`${source.source_id}: 監視の処理が未実装のため監視しない`); continue; }
    const result = await monitor(source, options);
    sources.push({ source_id: source.source_id, status: "monitored", summary: result.summary });
    planned.push(...result.planned);
  }

  const { created, skipped } = tracker ? await fileIssues(planned, tracker) : { created: [], skipped: [] };
  return { sources, planned, skipped, created };
}
