import type { LawCheck, ProvisionCheck, ProvisionStatus } from "./detect.ts";
import type { RevisionSummary } from "./egov.ts";

/** 作成するIssue。key は重複防止の目印で、本文の先頭にHTMLコメントとして埋め込む。 */
export interface PlannedIssue {
  key: string;
  title: string;
  body: string;
}

const MARKER = /<!-- monitor-egov: ([^\n]+?) -->/g;
/** GitHubのIssue本文の上限（65,536文字）より余裕をもたせる。 */
const BODY_LIMIT = 60000;
const USERS_SHOWN = 5;

export const marker = (key: string): string => `<!-- monitor-egov: ${key} -->`;

/** Issue本文から重複防止の目印を取り出す。 */
export function markersIn(body: string): string[] {
  return [...body.matchAll(MARKER)].map((match) => match[1]!);
}

export const revisionKey = (lawId: string, revisionId: string): string => `revision ${lawId} ${revisionId}`;
export const failureKey = (lawId: string, kind: string): string => `failure ${lawId} ${kind}`;

const lawPage = (lawId: string): string => `https://laws.e-gov.go.jp/law/${lawId}`;
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

function revisedIssue(check: Extract<LawCheck, { kind: "revised" }>, detectedAt: string, apiBase: string): PlannedIssue {
  const { source, current } = check;
  const key = revisionKey(source.law_id, current.law_revision_id);
  const lines = [
    marker(key),
    "",
    "e-Gov法令APIの監視が、根拠法令の現在施行中の改正版が確認済みの版（`data/legal-sources.yaml` の `reviewed_revision_id`）と異なることを検知した。",
    "",
    "## 検知した改正",
    "",
    "| 項目 | 値 |",
    "| --- | --- |",
    `| 法令 | ${cell(source.title)}（\`${source.law_id}\`）${source.law_number_raw ? `、${source.law_number_raw}` : ""} |`,
    `| 確認済みの改正版 | \`${source.reviewed_revision_id}\`（確認日時 ${source.reviewed_at}） |`,
    `| 現在施行中の改正版 | \`${current.law_revision_id}\` |`,
    `| 根拠URL | ${lawPage(source.law_id)} 、${apiBase}law_revisions/${source.law_id} |`,
    `| 検知日時 | ${detectedAt} |`,
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
  return { key, title: `[改正検知] ${source.title}（${source.law_id}）の改正版 ${current.law_revision_id}`, body: truncate(lines.join("\n")) };
}

const FAILURE_LABEL = { fetch_failed: "取得の失敗", unexpected_format: "応答形式の変化" } as const;

function failureIssue(check: Extract<LawCheck, { kind: "failed" }>, detectedAt: string): PlannedIssue {
  const { source, failure } = check;
  const key = failureKey(source.law_id, failure.kind);
  const body = [
    marker(key),
    "",
    `e-Gov法令APIの監視で、${FAILURE_LABEL[failure.kind]}が起きた。改正の検知ではない。この法令の改正の有無は確認できていない。`,
    "",
    "| 項目 | 値 |",
    "| --- | --- |",
    `| 法令 | ${cell(source.title)}（\`${source.law_id}\`） |`,
    `| 種類 | ${FAILURE_LABEL[failure.kind]}（\`${failure.kind}\`） |`,
    `| 内容 | ${cell(failure.message)} |`,
    `| URL | ${failure.url} |`,
    `| 確認済みの改正版 | \`${source.reviewed_revision_id}\` |`,
    `| 検知日時 | ${detectedAt} |`,
    "",
    "## 対応",
    "",
    "- 一時的な失敗であれば、監視を手動で再実行して解消を確かめ、このIssueをCloseする。",
    "- 応答形式の変化であれば、e-Gov法令APIの仕様（https://laws.e-gov.go.jp/api/2/swagger-ui/lawapi-v2.yaml）を確認し、監視の実装（`src/monitor/`）を直す。",
    "",
    "同じ法令の同じ種類のIssueが開いている間は、新たに作成しない。"
  ].join("\n");
  return { key, title: `[監視エラー] ${source.title}（${source.law_id}）: ${FAILURE_LABEL[failure.kind]}`, body };
}

function truncate(body: string): string {
  if (body.length <= BODY_LIMIT) return body;
  return `${body.slice(0, BODY_LIMIT)}\n\n（本文が長いため、ここで省略した。監視を \`--dry-run\` で実行すると全体を確認できる）`;
}

/** 照合の結果から、作成するIssueを決める。改正のない法令はIssueにしない。 */
export function planIssues(checks: LawCheck[], detectedAt: string, apiBase: string): PlannedIssue[] {
  return checks.flatMap((check) => {
    if (check.kind === "revised") return [revisedIssue(check, detectedAt, apiBase)];
    if (check.kind === "failed") return [failureIssue(check, detectedAt)];
    return [];
  });
}
