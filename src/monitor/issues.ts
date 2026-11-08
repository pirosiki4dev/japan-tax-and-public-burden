import type { Fetcher } from "./http.ts";

/**
 * 監視が作成するIssue（GitHub Issues）の扱い。重複防止の目印、本文の長さ、GitHub REST API での読み取りと作成。
 * Issueの題名と本文は、巡回先ごとのディレクトリ（例: egov/report.ts）で作る。
 */

/** 作成するIssue。key は重複防止の目印で、本文の先頭にHTMLコメントとして埋め込む。 */
export interface PlannedIssue {
  key: string;
  title: string;
  body: string;
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
export async function fileIssues(planned: PlannedIssue[], tracker: GitHubIssues): Promise<{ created: string[]; skipped: PlannedIssue[] }> {
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

/** GitHub REST API で、リポジトリのIssueを読み、作成する。Issueの作成以外の書き込みはしない。 */
export class GitHubIssues {
  private readonly api: string;
  private readonly repository: string;
  private readonly token: string;
  private readonly fetcher: Fetcher;

  /** api は GitHub Actions が設定する GITHUB_API_URL。未設定なら github.com の API を使う。 */
  constructor({ repository, token, api, fetcher = fetch }: { repository: string; token: string; api?: string; fetcher?: Fetcher }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error(`Invalid repository: ${repository}`);
    this.repository = repository;
    this.token = token;
    this.api = (api || "https://api.github.com").replace(/\/$/, "");
    this.fetcher = fetcher;
  }

  private headers(): Record<string, string> {
    return { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token}`, "X-GitHub-Api-Version": "2022-11-28" };
  }

  async openIssueKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    for (let page = 1; ; page++) {
      const url = `${this.api}/repos/${this.repository}/issues?state=open&per_page=100&page=${page}`;
      const response = await this.fetcher(url, { headers: this.headers() });
      if (!response.ok) throw new Error(`GitHub API: GET ${url} returned HTTP ${response.status}`);
      const issues = await response.json() as { body?: string | null; pull_request?: unknown }[];
      for (const issue of issues) if (!issue.pull_request) for (const key of markersIn(issue.body ?? "")) keys.add(key);
      if (issues.length < 100) return keys;
    }
  }

  async create(issue: PlannedIssue): Promise<string> {
    const url = `${this.api}/repos/${this.repository}/issues`;
    const response = await this.fetcher(url, { method: "POST", headers: { ...this.headers(), "Content-Type": "application/json" }, body: JSON.stringify({ title: issue.title, body: issue.body }) });
    if (!response.ok) throw new Error(`GitHub API: POST ${url} returned HTTP ${response.status}: ${await response.text()}`);
    const created = await response.json() as { html_url?: string };
    return created.html_url ?? "";
  }
}
