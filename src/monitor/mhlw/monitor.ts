import { createHash } from "node:crypto";
import type { Burden, PublishedDocument, Source } from "../../domain/types.generated.ts";
import { HttpClient, MonitorFailure } from "../http.ts";
import { issueBody, issueKey, type PlannedIssue } from "../issues.ts";
import type { MonitorContext, SourceResult } from "../run.ts";
import { documentLinks, type PageLink } from "./page.ts";

/** 公表ページに掲載された最新の資料（本文の最初のPDF）と、そのファイルのSHA-256。 */
export interface LatestDocument extends PageLink {
  sha256: string;
}

/**
 * 公表ページの確認の結果。
 * - unchanged: 最新の資料のSHA-256が確認済みの値と同じ
 * - changed: 最新の資料のSHA-256が確認済みの値と異なる（新しい資料の掲載、または同じURLでの差し替え）
 * - failed: 取得の失敗、またはページの構造の変化
 */
export type PageCheck =
  | { kind: "unchanged"; latest: LatestDocument }
  | { kind: "changed"; latest: LatestDocument }
  | { kind: "failed"; failure: MonitorFailure };

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** ページを取得し、本文に掲載された最新の資料だけを取得して、確認済みのSHA-256と比べる。 */
export async function checkPage(http: HttpClient, source: Source, reviewed: PublishedDocument | undefined): Promise<PageCheck> {
  try {
    const html = await http.getText(source.base_url);
    if (html === undefined) throw new MonitorFailure("fetch_failed", source.base_url, "ページが見つからない（HTTP 404）");
    const links = documentLinks(html, source.base_url);
    if (links === undefined) throw new MonitorFailure("unexpected_format", source.base_url, "本文の領域（l-contentMain）が見つからない");
    const [link] = links;
    if (!link) throw new MonitorFailure("unexpected_format", source.base_url, "本文の領域に資料（PDF）へのリンクがない");
    const bytes = await http.getBytes(link.url, "application/pdf");
    if (bytes === undefined) throw new MonitorFailure("fetch_failed", link.url, `最新の資料「${link.title}」が見つからない（HTTP 404）`);
    const latest = { ...link, sha256: sha256(bytes) };
    return { kind: latest.sha256 === reviewed?.reviewed_sha256 ? "unchanged" : "changed", latest };
  } catch (error) {
    if (error instanceof MonitorFailure) return { kind: "failed", failure: error };
    throw error;
  }
}

/** 公表ページまたは資料を根拠URLに持つ負担項目。 */
export function relatedBurdens(burdens: Burden[], urls: Set<string>): Burden[] {
  return burdens.filter((burden) => [...burden.source_urls, ...burden.versions.flatMap((version) => version.source_urls)].some((url) => urls.has(url)));
}

const FAILURE_LABEL = { fetch_failed: "取得の失敗", unexpected_format: "ページの構造の変化" } as const;
const cell = (value: string): string => value.replace(/\|/g, "\\|");

function changedIssue(source: Source, latest: LatestDocument, reviewed: PublishedDocument | undefined, context: MonitorContext): PlannedIssue {
  const key = issueKey(source.source_id, "change", latest.sha256.slice(0, 16));
  const kind = !reviewed ? "確認済みの資料が未登録" : latest.url === reviewed.source_url ? "同じURLの資料のファイルが差し替えられた" : "新しい資料が掲載された";
  const burdens = relatedBurdens(context.data.burdens, new Set([source.base_url, latest.url, ...(reviewed ? [reviewed.source_url] : [])]));
  const lines = [
    "公表ページの監視が、最新の資料のファイルのSHA-256が確認済みの値（`data/legal-sources.yaml` の `published_documents` の `reviewed_sha256`）と異なることを検知した。",
    "",
    "## 検知した変化",
    "",
    "| 項目 | 値 |",
    "| --- | --- |",
    `| 巡回先 | ${cell(source.name)}（\`${source.source_id}\`） |`,
    `| ページ | ${source.base_url} |`,
    `| 変化 | ${kind} |`,
    `| 最新の資料 | ${cell(latest.title)}、${latest.url} |`,
    `| 最新の資料のSHA-256 | \`${latest.sha256}\` |`,
    `| 確認済みの資料 | ${reviewed ? `${cell(reviewed.title)}、${reviewed.source_url}（確認日時 ${reviewed.reviewed_at}）` : "（未登録）"} |`,
    `| 確認済みのSHA-256 | ${reviewed ? `\`${reviewed.reviewed_sha256}\`` : "（未登録）"} |`,
    `| 検知日時 | ${context.detectedAt} |`,
    "",
    "## 関係する負担項目",
    "",
    burdens.length === 0 ? "ページまたは資料を根拠URLに持つ負担項目はない。" : burdens.map((burden) => `- ${burden.burden_id} ${burden.name}`).join("\n"),
    "",
    "## 対応",
    "",
    "1. 最新の資料の値を読み取り、マスタ（`data/burdens.yaml`）へ反映するかを判断する（例: 新年度の率は版を追加する）。",
    "2. 反映する場合もしない場合も、Pull Requestで `data/legal-sources.yaml` の `published_documents` の該当する要素を、最新の資料の題名、`reviewed_sha256`、`reviewed_at`、`source_url` に更新する。",
    "3. Pull Requestのマージ後、判断の結果をこのIssueに記録してCloseする。"
  ];
  return { key, title: `[公表資料の変化] ${source.name}（${source.source_id}）`, body: issueBody(key, lines) };
}

function failureIssue(source: Source, failure: MonitorFailure, detectedAt: string): PlannedIssue {
  const key = issueKey(source.source_id, "failure", failure.kind);
  const lines = [
    `公表ページの監視で、${FAILURE_LABEL[failure.kind]}が起きた。公表資料の変化の検知ではない。公表資料の変化の有無は確認できていない。`,
    "",
    "| 項目 | 値 |",
    "| --- | --- |",
    `| 巡回先 | ${cell(source.name)}（\`${source.source_id}\`） |`,
    `| 種類 | ${FAILURE_LABEL[failure.kind]}（\`${failure.kind}\`） |`,
    `| 内容 | ${cell(failure.message)} |`,
    `| URL | ${failure.url} |`,
    `| 検知日時 | ${detectedAt} |`,
    "",
    "## 対応",
    "",
    "- 一時的な失敗であれば、監視を手動で再実行して解消を確かめ、このIssueをCloseする。",
    "- ページの構造の変化であれば、ページを確認し、監視の実装（`src/monitor/mhlw/`）を直す。ページのURLが変わった場合は `config/sources.yaml` を直す。",
    "",
    "同じ巡回先の同じ種類のIssueが開いている間は、新たに作成しない。"
  ];
  return { key, title: `[監視エラー] ${source.name}（${source.source_id}）: ${FAILURE_LABEL[failure.kind]}`, body: issueBody(key, lines) };
}

/** 厚生労働省の公表ページの最新の資料を、data/legal-sources.yaml の published_documents の確認済みのSHA-256と比べる。 */
export async function monitorMhlwPage(source: Source, context: MonitorContext): Promise<SourceResult> {
  const { log = () => {} } = context;
  const http = new HttpClient({ intervalMs: source.request_interval_ms, fetcher: context.fetcher, sleep: context.sleep });
  const reviewed = context.data.publishedDocuments.find((document) => document.source_id === source.source_id);
  const check = await checkPage(http, source, reviewed);
  log(`${source.source_id}: ${check.kind}`);
  const planned = check.kind === "changed" ? [changedIssue(source, check.latest, reviewed, context)]
    : check.kind === "failed" ? [failureIssue(source, check.failure, context.detectedAt)] : [];
  return { planned, summary: { changed: check.kind === "changed" ? 1 : 0, failed: check.kind === "failed" ? 1 : 0 } };
}
