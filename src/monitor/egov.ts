import type { Fetcher } from "./http.ts";
import type { LawNode } from "./law-text.ts";

/** 改正履歴（law_revisions）の1つの改正版のうち、監視で使う項目。 */
export interface RevisionSummary {
  law_revision_id: string;
  amendment_law_id: string | null;
  amendment_law_num: string | null;
  amendment_promulgate_date: string | null;
  amendment_enforcement_date: string | null;
  current_revision_status: string;
}

/** 取得の失敗（通信の失敗・HTTPエラー）と、応答形式の変化を区別する。 */
export type FailureKind = "fetch_failed" | "unexpected_format";

export class MonitorFailure extends Error {
  readonly kind: FailureKind;
  readonly url: string;
  constructor(kind: FailureKind, url: string, message: string) {
    super(message);
    this.kind = kind;
    this.url = url;
  }
}

export interface EgovClientOptions {
  /** config/sources.yaml の base_url（末尾の / を含む） */
  baseUrl: string;
  /** config/sources.yaml の request_interval_ms */
  intervalMs: number;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** 通信の失敗とHTTP 5xxを再試行する回数 */
  retries?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** e-Gov法令API v2 の利用者。リクエストの間隔を request_interval_ms 以上に保つ。 */
export class EgovClient {
  readonly baseUrl: string;
  private readonly intervalMs: number;
  private readonly fetcher: Fetcher;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly retries: number;
  private last = Number.NEGATIVE_INFINITY;

  constructor(options: EgovClientOptions) {
    this.baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
    this.intervalMs = options.intervalMs;
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.retries = options.retries ?? 2;
  }

  revisionsUrl(lawId: string): string {
    return `${this.baseUrl}law_revisions/${encodeURIComponent(lawId)}`;
  }

  lawDataUrl(revisionId: string): string {
    return `${this.baseUrl}law_data/${encodeURIComponent(revisionId)}?law_full_text_format=json`;
  }

  /** 応答の本文（JSON）。404 は undefined を返す。 */
  private async getJson(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.intervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
      let response: Response;
      try {
        response = await this.fetcher(url, { headers: { Accept: "application/json" } });
      } catch (error) {
        if (attempt < this.retries) continue;
        throw new MonitorFailure("fetch_failed", url, `通信に失敗した: ${(error as Error).message}`);
      }
      if (response.status === 404) return undefined;
      if (response.status >= 500 && attempt < this.retries) continue;
      if (!response.ok) throw new MonitorFailure("fetch_failed", url, `HTTP ${response.status} が返った`);
      try {
        return await response.json();
      } catch (error) {
        throw new MonitorFailure("unexpected_format", url, `応答をJSONとして解析できない: ${(error as Error).message}`);
      }
    }
  }

  /** 法令の改正履歴（新しい版から順）。 */
  async revisions(lawId: string): Promise<RevisionSummary[]> {
    const url = this.revisionsUrl(lawId);
    const body = await this.getJson(url);
    if (body === undefined) throw new MonitorFailure("fetch_failed", url, "法令が見つからない（HTTP 404）");
    if (!isRecord(body) || !Array.isArray(body.revisions)) throw new MonitorFailure("unexpected_format", url, "応答に revisions の配列がない");
    return body.revisions.map((revision, position) => {
      if (!isRecord(revision) || typeof revision.law_revision_id !== "string" || typeof revision.current_revision_status !== "string"
        || !isNullableString(revision.amendment_law_id) || !isNullableString(revision.amendment_law_num)
        || !isNullableString(revision.amendment_promulgate_date) || !isNullableString(revision.amendment_enforcement_date)) {
        throw new MonitorFailure("unexpected_format", url, `revisions[${position}] に必要な項目（law_revision_id、current_revision_status、amendment_*）がない`);
      }
      return {
        law_revision_id: revision.law_revision_id,
        amendment_law_id: revision.amendment_law_id,
        amendment_law_num: revision.amendment_law_num,
        amendment_promulgate_date: revision.amendment_promulgate_date,
        amendment_enforcement_date: revision.amendment_enforcement_date,
        current_revision_status: revision.current_revision_status
      };
    });
  }

  /** 改正版の全文。版が見つからない（HTTP 404）ときは undefined。 */
  async fullText(revisionId: string): Promise<LawNode | undefined> {
    const url = this.lawDataUrl(revisionId);
    const body = await this.getJson(url);
    if (body === undefined) return undefined;
    if (!isRecord(body) || !isRecord(body.law_full_text) || typeof body.law_full_text.tag !== "string") {
      throw new MonitorFailure("unexpected_format", url, "応答に law_full_text（tag を持つ要素）がない");
    }
    return body.law_full_text as unknown as LawNode;
  }
}
