import type { Fetcher } from "./http.ts";
import { markersIn, type PlannedIssue } from "./report.ts";

export interface IssueTracker {
  /** 未完了のIssueに埋め込まれた重複防止の目印 */
  openIssueKeys(): Promise<Set<string>>;
  create(issue: PlannedIssue): Promise<string>;
}

/** GitHub REST API で、リポジトリのIssueを読み、作成する。Issueの作成以外の書き込みはしない。 */
export class GitHubIssues implements IssueTracker {
  private readonly api: string;
  private readonly repository: string;
  private readonly token: string;
  private readonly fetcher: Fetcher;

  constructor({ repository, token, api = "https://api.github.com", fetcher = fetch }: { repository: string; token: string; api?: string; fetcher?: Fetcher }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error(`Invalid repository: ${repository}`);
    this.repository = repository;
    this.token = token;
    this.api = api.replace(/\/$/, "");
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
