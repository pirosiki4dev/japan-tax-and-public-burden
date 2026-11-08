import { issueBody, issueKey, type PlannedIssue } from "../issues.ts";
import type { RevisionSummary } from "./client.ts";
import type { LawCheck, ProvisionCheck, ProvisionStatus } from "./detect.ts";

/** e-Gov法令APIの監視のIssueの題名と本文。URLは config/sources.yaml の base_url と data/legal-sources.yaml の source_url から作る。 */
export interface ReportContext {
  /** config/sources.yaml の source_id（重複防止の目印の先頭に付ける） */
  sourceId: string;
  detectedAt: string;
  revisionsUrl: (lawId: string) => string;
  specUrl: string;
}

const USERS_SHOWN = 5;

export const revisionKey = (sourceId: string, lawId: string, revisionId: string): string => issueKey(sourceId, "revision", lawId, revisionId);
export const failureKey = (sourceId: string, lawId: string, kind: string): string => issueKey(sourceId, "failure", lawId, kind);

const cell = (value: string | null | undefined): string => (value ?? "（なし）").replace(/\|/g, "\\|");

const STATUS_LABEL: Record<ProvisionStatus, string> = {
  changed: "本文が変わった",
  shifted: "附則・別表の番号がずれた",
  missing: "現在施行中の版に見つからない",
  not_in_reviewed: "確認済みの版に見つからない",
  not_compared: "照合していない（確認済みの版の全文を取得できない）",
  unchanged: "変わらない"
};
const STATUS_ORDER: ProvisionStatus[] = ["changed", "shifted", "missing", "not_in_reviewed", "not_compared", "unchanged"];

function usersCell(check: ProvisionCheck): string {
  const ids = [...new Set(check.users.map((user) => user.burden_id))];
  const shown = ids.slice(0, USERS_SHOWN).join("、");
  return ids.length > USERS_SHOWN ? `${shown} ほか${ids.length - USERS_SHOWN}件` : shown;
}

function statusCell(check: ProvisionCheck): string {
  if (check.status !== "shifted") return STATUS_LABEL[check.status];
  return `${STATUS_LABEL.shifted}（新しい指定: \`${check.newElm}\`、本文は${check.textChanged ? "変わった" : "変わらない"}）`;
}

function revisionRow(revision: RevisionSummary): string {
  return `| \`${revision.law_revision_id}\` | ${cell(revision.amendment_law_num)} | ${cell(revision.amendment_promulgate_date)} | ${cell(revision.amendment_enforcement_date)} | ${cell(revision.current_revision_status)} |`;
}

function provisionSection(check: Extract<LawCheck, { kind: "revised" }>): string[] {
  if (check.provisions.length === 0) return ["この法令の条項を `provisions` に登録した負担項目はない。"];
  const counts = STATUS_ORDER.map((status) => [status, check.provisions.filter((provision) => provision.status === status).length] as const).filter(([, count]) => count > 0);
  const lines = [
    `登録済みの条項 ${check.provisions.length} 件を、確認済みの版と現在施行中の版で照合した（本文の空白を除いて比較）。`,
    "",
    ...counts.map(([status, count]) => `- ${STATUS_LABEL[status]}: ${count} 件`),
    ""
  ];
  const attention = check.provisions.filter((provision) => provision.status !== "unchanged")
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.elm.localeCompare(b.elm));
  if (attention.length > 0) {
    lines.push("| elm | 結果 | 負担項目 |", "| --- | --- | --- |");
    for (const provision of attention) lines.push(`| \`${provision.elm}\` | ${statusCell(provision)} | ${usersCell(provision)} |`);
  } else {
    lines.push("本文が変わった条項はない。");
  }
  return lines;
}

function revisedIssue(check: Extract<LawCheck, { kind: "revised" }>, context: ReportContext): PlannedIssue {
  const { source, current } = check;
  const key = revisionKey(context.sourceId, source.law_id, current.law_revision_id);
  const lines = [
    "e-Gov法令APIの監視が、根拠法令の現在施行中の改正版が確認済みの版（`data/legal-sources.yaml` の `reviewed_revision_id`）と異なることを検知した。",
    "",
    "## 検知した改正",
    "",
    "| 項目 | 値 |",
    "| --- | --- |",
    `| 法令 | ${cell(source.title)}（\`${source.law_id}\`）${source.law_number_raw ? `、${source.law_number_raw}` : ""} |`,
    `| 確認済みの改正版 | \`${source.reviewed_revision_id}\`（確認日時 ${source.reviewed_at}） |`,
    `| 現在施行中の改正版 | \`${current.law_revision_id}\` |`,
    `| 根拠URL | ${source.source_url} 、${context.revisionsUrl(source.law_id)} |`,
    `| 検知日時 | ${context.detectedAt} |`,
    "",
    "## 確認済みの版より後の改正版（古い順）",
    "",
    ...(check.reviewedFound ? [] : ["確認済みの改正版が改正履歴に見つからないため、現在施行中の版だけを示す。", ""]),
    "| 改正版 | 改正法令 | 公布日 | 施行日 | 状態 |",
    "| --- | --- | --- | --- | --- |",
    ...check.newer.map(revisionRow),
    "",
    "## 登録済みの条項の照合",
    "",
    ...(check.reviewedTextAvailable || check.provisions.length === 0 ? [] : ["確認済みの版の全文を取得できなかったため、本文は照合していない。", ""]),
    ...provisionSection(check),
    "",
    "## 対応",
    "",
    "1. 改正内容を確認し、マスタ（`data/burdens.yaml`）へ反映するかを判断する。附則・別表の番号がずれた条項は、`elm` を新しい指定に直す。",
    "2. 反映する場合もしない場合も、Pull Requestで `data/legal-sources.yaml` の `reviewed_revision_id` と `reviewed_at` を更新する。",
    "3. Pull Requestのマージ後、判断の結果をこのIssueに記録してCloseする。",
    "",
    "施行前の改正版（状態が UnEnforced）は、施行されて現在施行中の版になったときに検知する。"
  ];
  return { key, title: `[改正検知] ${source.title}（${source.law_id}）の改正版 ${current.law_revision_id}`, body: issueBody(key, lines) };
}

const FAILURE_LABEL = { fetch_failed: "取得の失敗", unexpected_format: "応答形式の変化" } as const;

function failureIssue(check: Extract<LawCheck, { kind: "failed" }>, context: ReportContext): PlannedIssue {
  const { source, failure } = check;
  const key = failureKey(context.sourceId, source.law_id, failure.kind);
  const body = issueBody(key, [
    `e-Gov法令APIの監視で、${FAILURE_LABEL[failure.kind]}が起きた。改正の検知ではない。この法令の改正の有無は確認できていない。`,
    "",
    "| 項目 | 値 |",
    "| --- | --- |",
    `| 法令 | ${cell(source.title)}（\`${source.law_id}\`） |`,
    `| 種類 | ${FAILURE_LABEL[failure.kind]}（\`${failure.kind}\`） |`,
    `| 内容 | ${cell(failure.message)} |`,
    `| URL | ${failure.url} |`,
    `| 確認済みの改正版 | \`${source.reviewed_revision_id}\` |`,
    `| 検知日時 | ${context.detectedAt} |`,
    "",
    "## 対応",
    "",
    "- 一時的な失敗であれば、監視を手動で再実行して解消を確かめ、このIssueをCloseする。",
    `- 応答形式の変化であれば、e-Gov法令APIの仕様（${context.specUrl}）を確認し、監視の実装（\`src/monitor/egov/\`）を直す。`,
    "",
    "同じ法令の同じ種類のIssueが開いている間は、新たに作成しない。"
  ]);
  return { key, title: `[監視エラー] ${source.title}（${source.law_id}）: ${FAILURE_LABEL[failure.kind]}`, body };
}

/** 照合の結果から、作成するIssueを決める。改正のない法令はIssueにしない。 */
export function planIssues(checks: LawCheck[], context: ReportContext): PlannedIssue[] {
  return checks.flatMap((check) => {
    if (check.kind === "revised") return [revisedIssue(check, context)];
    if (check.kind === "failed") return [failureIssue(check, context)];
    return [];
  });
}
