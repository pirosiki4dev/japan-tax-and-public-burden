import type { Source } from "../../domain/types.generated.ts";
import type { MonitorContext, SourceResult } from "../run.ts";
import { EgovClient } from "./client.ts";
import { checkLaw, provisionUsers, type LawCheck } from "./detect.ts";
import { planIssues } from "./report.ts";

export interface EgovResult extends SourceResult {
  checks: LawCheck[];
}

/** data/legal-sources.yaml の法令を順に照合し、改正の検知と取得の失敗をIssueの案にする。 */
export async function monitorEgov(source: Source, context: MonitorContext): Promise<EgovResult> {
  const { data, detectedAt, lawIds, log = () => {} } = context;
  const client = new EgovClient({ baseUrl: source.base_url, intervalMs: source.request_interval_ms, fetcher: context.fetcher, sleep: context.sleep });
  const users = provisionUsers(data.burdens);
  const targets = lawIds ? data.legalSources.filter((legal) => lawIds.includes(legal.law_id)) : data.legalSources;
  const checks: LawCheck[] = [];
  for (const legal of targets) {
    const check = await checkLaw(client, legal, users.get(legal.law_id) ?? new Map());
    log(`${source.source_id} ${legal.law_id} ${legal.title}: ${check.kind}`);
    checks.push(check);
  }
  const planned = planIssues(checks, { sourceId: source.source_id, detectedAt, revisionsUrl: (lawId) => client.revisionsUrl(lawId), specUrl: client.specUrl() });
  const count = (kind: LawCheck["kind"]) => checks.filter((check) => check.kind === kind).length;
  return { checks, planned, summary: { laws: checks.length, unchanged: count("unchanged"), revised: count("revised"), failed: count("failed") } };
}
