import { createHash } from "node:crypto";
import type { Burden, PublishedDocument, Source } from "../../domain/types.generated.ts";
import { HttpClient, MonitorFailure } from "../http.ts";
import { issueBody, issueKey, type PlannedIssue } from "../issues.ts";
import type { MonitorContext, SourceResult } from "../run.ts";
import { documentLinks } from "./page.ts";

/**
 * 掲載資料の変化。
 * - added: 確認済みの状態にない資料が掲載された
 * - removed: 確認済みの資料が掲載されなくなった
 * - title_changed: 同じURLのリンクの文字列が変わった
 * - content_changed: 同じURLの資料のファイルが変わった（SHA-256が異なる）
 */
export type DocumentChangeKind = "added" | "removed" | "title_changed" | "content_changed";

export interface DocumentChange {
  kind: DocumentChangeKind;
  /** 現在の資料（removed のときは確認済みの資料） */
  document: PublishedDocument;
  /** title_changed・content_changed のときの確認済みの資料 */
  reviewed?: PublishedDocument;
}

export type PageCheck =
  | { kind: "unchanged"; documents: PublishedDocument[] }
  | { kind: "changed"; documents: PublishedDocument[]; changes: DocumentChange[] }
  | { kind: "failed"; failure: MonitorFailure };

const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

/** 現在の掲載資料と、確認済みの掲載資料を比べる。 */
export function compareDocuments(current: PublishedDocument[], reviewed: PublishedDocument[]): DocumentChange[] {
  const reviewedByUrl = new Map(reviewed.map((document) => [document.url, document]));
  const currentUrls = new Set(current.map((document) => document.url));
  const changes: DocumentChange[] = [];
  for (const document of current) {
    const before = reviewedByUrl.get(document.url);
    if (!before) changes.push({ kind: "added", document });
    else {
      if (before.title !== document.title) changes.push({ kind: "title_changed", document, reviewed: before });
      if (before.sha256 !== document.sha256) changes.push({ kind: "content_changed", document, reviewed: before });
    }
  }
  for (const document of reviewed) if (!currentUrls.has(document.url)) changes.push({ kind: "removed", document });
  return changes;
}

/** ページを取得し、本文の資料をすべて取得して、確認済みの状態と比べる。 */
export async function checkPage(http: HttpClient, source: Source, reviewed: PublishedDocument[] | undefined): Promise<PageCheck> {
  try {
    const html = await http.getText(source.base_url);
    if (html === undefined) throw new MonitorFailure("fetch_failed", source.base_url, "ページが見つからない（HTTP 404）");
    const links = documentLinks(html, source.base_url);
    if (links === undefined) throw new MonitorFailure("unexpected_format", source.base_url, "本文の領域（l-contentMain）が見つからない");
    if (links.length === 0) throw new MonitorFailure("unexpected_format", source.base_url, "本文の領域に資料（PDF）へのリンクがない");
    const documents: PublishedDocument[] = [];
    for (const link of links) {
      const bytes = await http.getBytes(link.url, "application/pdf");
      if (bytes === undefined) throw new MonitorFailure("fetch_failed", link.url, `掲載資料「${link.title}」が見つからない（HTTP 404）`);
      documents.push({ title: link.title, url: link.url, sha256: sha256(bytes) });
    }
    const changes = compareDocuments(documents, reviewed ?? []);
    return changes.length === 0 ? { kind: "unchanged", documents } : { kind: "changed", documents, changes };
  } catch (error) {
    if (error instanceof MonitorFailure) return { kind: "failed", failure: error };
    throw error;
  }
}

/** 公表ページまたは掲載資料を根拠URLに持つ負担項目。 */
export function relatedBurdens(burdens: Burden[], urls: Set<string>): Burden[] {
  return burdens.filter((burden) => [...burden.source_urls, ...burden.versions.flatMap((version) => version.source_urls)].some((url) => urls.has(url)));
}

const CHANGE_LABEL: Record<DocumentChangeKind, string> = {
  added: "掲載された",
  removed: "掲載されなくなった",
  title_changed: "リンクの文字列が変わった",
  content_changed: "ファイルが変わった"
};
const FAILURE_LABEL = { fetch_failed: "取得の失敗", unexpected_format: "ページの構造の変化" } as const;
const cell = (value: string): string => value.replace(/\|/g, "\\|");
const yamlString = (value: string): string => JSON.stringify(value);

function changeRow(change: DocumentChange): string {
  const detail = change.kind === "title_changed" ? `（変更前: ${cell(change.reviewed!.title)}）` : change.kind === "content_changed" ? `（変更前: \`${change.reviewed!.sha256}\`）` : "";
  return `| ${CHANGE_LABEL[change.kind]}${detail} | ${cell(change.document.title)} | ${change.document.url} | \`${change.document.sha256}\` |`;
}

function changedIssue(source: Source, check: Extract<PageCheck, { kind: "changed" }>, context: MonitorContext, reviewedAt: string | undefined): PlannedIssue {
  const state = sha256(JSON.stringify(check.documents.map(({ url, title, sha256: hash }) => [url, title, hash]).sort()));
  const key = issueKey(source.source_id, "change", state.slice(0, 16));
  const urls = new Set([source.base_url, ...check.documents.map((document) => document.url), ...check.changes.map((change) => change.document.url)]);
  const burdens = relatedBurdens(context.data.burdens, urls);
  const lines = [
    `公表ページの監視が、掲載資料が確認済みの状態（\`data/published-sources.yaml\`）と異なることを検知した。`,
    "",
    "## 検知した変化",
    "",
    "| 項目 | 値 |",
    "| --- | --- |",
    `| 巡回先 | ${cell(source.name)}（\`${source.source_id}\`） |`,
    `| ページ | ${source.base_url} |`,
    `| 確認済みの状態の確認日時 | ${reviewedAt ?? "（未登録）"} |`,
    `| 検知日時 | ${context.detectedAt} |`,
    "",
    "| 変化 | 資料 | URL | SHA-256 |",
    "| --- | --- | --- | --- |",
    ...check.changes.map(changeRow),
    "",
    "## 関係する負担項目",
    "",
    burdens.length === 0 ? "ページまたは掲載資料を根拠URLに持つ負担項目はない。" : burdens.map((burden) => `- ${burden.burden_id} ${burden.name}`).join("\n"),
    "",
    "## 対応",
    "",
    "1. 変化した資料を確認し、マスタ（`data/burdens.yaml`）へ反映するかを判断する（例: 新年度の率は版を追加する）。",
    "2. 反映する場合もしない場合も、Pull Requestで `data/published-sources.yaml` の `documents` と `reviewed_at` を更新する。現在の掲載資料は次のとおり。",
    "3. Pull Requestのマージ後、判断の結果をこのIssueに記録してCloseする。",
    "",
    "```yaml",
    "    documents:",
    ...check.documents.flatMap((document) => [`      - title: ${yamlString(document.title)}`, `        url: ${document.url}`, `        sha256: ${yamlString(document.sha256)}`]),
    "```"
  ];
  return { key, title: `[公表資料の変化] ${source.name}（${source.source_id}）`, body: issueBody(key, lines) };
}

function failureIssue(source: Source, failure: MonitorFailure, detectedAt: string): PlannedIssue {
  const key = issueKey(source.source_id, "failure", failure.kind);
  const lines = [
    `公表ページの監視で、${FAILURE_LABEL[failure.kind]}が起きた。掲載資料の変化の検知ではない。掲載資料の変化の有無は確認できていない。`,
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

/** 厚生労働省の公表ページの掲載資料を、data/published-sources.yaml の確認済みの状態と比べる。 */
export async function monitorMhlwPage(source: Source, context: MonitorContext): Promise<SourceResult> {
  const { log = () => {} } = context;
  const http = new HttpClient({ intervalMs: source.request_interval_ms, fetcher: context.fetcher, sleep: context.sleep });
  const published = context.data.publishedSources.find((candidate) => candidate.source_id === source.source_id);
  const check = await checkPage(http, source, published?.documents);
  log(`${source.source_id}: ${check.kind}`);
  const planned = check.kind === "changed" ? [changedIssue(source, check, context, published?.reviewed_at)]
    : check.kind === "failed" ? [failureIssue(source, check.failure, context.detectedAt)] : [];
  const count = (kind: DocumentChangeKind) => (check.kind === "changed" ? check.changes.filter((change) => change.kind === kind).length : 0);
  return {
    planned,
    summary: { documents: check.kind === "failed" ? 0 : check.documents.length, added: count("added"), removed: count("removed"), title_changed: count("title_changed"), content_changed: count("content_changed"), failed: check.kind === "failed" ? 1 : 0 }
  };
}
