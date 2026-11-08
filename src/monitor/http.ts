/**
 * 監視の取得先に共通のHTTPの処理。リクエストの間隔の維持、再試行、失敗の分類を行う。
 * 取得先ごとの応答の解釈は、取得先ごとのディレクトリ（例: egov/）に置く。
 */

/** fetch と同じ形の関数。テストでは保存した応答を返す関数に差し替える。 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

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

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export interface HttpClientOptions {
  /** config/sources.yaml の request_interval_ms */
  intervalMs: number;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** 通信の失敗とHTTP 5xxを再試行する回数 */
  retries?: number;
}

/** 1つの巡回先への取得。リクエストの間隔を request_interval_ms 以上に保つ。 */
export class HttpClient {
  private readonly intervalMs: number;
  private readonly fetcher: Fetcher;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly retries: number;
  private last = Number.NEGATIVE_INFINITY;

  constructor(options: HttpClientOptions) {
    this.intervalMs = options.intervalMs;
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.retries = options.retries ?? 2;
  }

  /** 応答。404 は undefined を返す。通信の失敗とHTTPエラーは MonitorFailure（fetch_failed）にする。 */
  async get(url: string, accept: string): Promise<Response | undefined> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.intervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
      let response: Response;
      try {
        response = await this.fetcher(url, { headers: { Accept: accept } });
      } catch (error) {
        if (attempt < this.retries) continue;
        throw new MonitorFailure("fetch_failed", url, `通信に失敗した: ${(error as Error).message}`);
      }
      if (response.status === 404) return undefined;
      if (response.status >= 500 && attempt < this.retries) continue;
      if (!response.ok) throw new MonitorFailure("fetch_failed", url, `HTTP ${response.status} が返った`);
      return response;
    }
  }

  /** 応答の本文（文字列）。404 は undefined を返す。 */
  async getText(url: string, accept = "text/html"): Promise<string | undefined> {
    const response = await this.get(url, accept);
    return response ? response.text() : undefined;
  }

  /** 応答の本文（バイト列）。404 は undefined を返す。 */
  async getBytes(url: string, accept = "*/*"): Promise<Uint8Array | undefined> {
    const response = await this.get(url, accept);
    return response ? new Uint8Array(await response.arrayBuffer()) : undefined;
  }

  /** 応答の本文（JSON）。404 は undefined を返す。JSONでなければ MonitorFailure（unexpected_format）にする。 */
  async getJson(url: string): Promise<unknown> {
    const response = await this.get(url, "application/json");
    if (!response) return undefined;
    try {
      return await response.json();
    } catch (error) {
      throw new MonitorFailure("unexpected_format", url, `応答をJSONとして解析できない: ${(error as Error).message}`);
    }
  }
}
