/**
 * 監視が作成するIssueの共通の扱い（重複防止の目印、本文の長さ、作成）。
 * Issueの題名と本文は、取得先ごとのディレクトリ（例: egov/report.ts）で作る。
 */

/** 作成するIssue。key は重複防止の目印で、本文の先頭にHTMLコメントとして埋め込む。 */
export interface PlannedIssue {
  key: string;
  title: string;
  body: string;
}

export interface IssueTracker {
  /** 未完了のIssueに埋め込まれた重複防止の目印 */
  openIssueKeys(): Promise<Set<string>>;
  create(issue: PlannedIssue): Promise<string>;
}

const MARKER = /<!-- monitor: ([^\n]+?) -->/g;
/** GitHubのIssue本文の上限（65,536文字）より余裕をもたせる。 */
const BODY_LIMIT = 60000;

/** 重複防止の目印。巡回先の source_id を先頭に付け、巡回先の間で重ならないようにする。 */
export const issueKey = (sourceId: string, ...parts: string[]): string => [sourceId, ...parts].join(" ");

export const marker = (key: string): string => `<!-- monitor: ${key} -->`;

/** Issue本文から重複防止の目印を取り出す。 */
export function markersIn(body: string): string[] {
  return [...body.matchAll(MARKER)].map((match) => match[1]!);
}

/** 目印を先頭に付け、上限を超える本文を省略する。 */
export function issueBody(key: string, lines: string[]): string {
  const body = [marker(key), "", ...lines].join("\n");
  if (body.length <= BODY_LIMIT) return body;
  return `${body.slice(0, BODY_LIMIT)}\n\n（本文が長いため、ここで省略した。監視を \`--dry-run\` で実行すると全体を確認できる）`;
}

/** 未完了の同じIssueがないものだけを作成する。 */
export async function fileIssues(planned: PlannedIssue[], tracker: IssueTracker): Promise<{ created: string[]; skipped: PlannedIssue[] }> {
  const created: string[] = [];
  const skipped: PlannedIssue[] = [];
  if (planned.length === 0) return { created, skipped };
  const open = await tracker.openIssueKeys();
  for (const issue of planned) {
    if (open.has(issue.key)) { skipped.push(issue); continue; }
    created.push(await tracker.create(issue));
    open.add(issue.key);
  }
  return { created, skipped };
}
