import { HttpClient, isRecord, MonitorFailure, type HttpClientOptions } from "../http.ts";
import type { LawNode } from "./law-text.ts";

export interface EgovClientOptions extends HttpClientOptions {
  /** config/sources.yaml の base_url（末尾の / を含む） */
  baseUrl: string;
}

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** 改正履歴（law_revisions）の1つの改正版のうち、監視で使う項目。 */
export interface RevisionSummary {
  law_revision_id: string;
  amendment_law_id: string | null;
  amendment_law_num: string | null;
  amendment_promulgate_date: string | null;
  amendment_enforcement_date: string | null;
  current_revision_status: string;
}

/** e-Gov法令API v2 の取得と応答の解釈。リクエストの間隔の維持と再試行は HttpClient が行う。 */
export class EgovClient {
  readonly baseUrl: string;
  private readonly http: HttpClient;

  constructor(options: EgovClientOptions) {
    this.baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
    this.http = new HttpClient(options);
  }

  /** e-Gov法令API v2 の仕様（応答形式が変わったときに確認する）。 */
  specUrl(): string {
    return `${this.baseUrl}swagger-ui/lawapi-v2.yaml`;
  }

  revisionsUrl(lawId: string): string {
    return `${this.baseUrl}law_revisions/${encodeURIComponent(lawId)}`;
  }

  lawDataUrl(revisionId: string): string {
    return `${this.baseUrl}law_data/${encodeURIComponent(revisionId)}?law_full_text_format=json`;
  }

  /** 法令の改正履歴（新しい版から順）。 */
  async revisions(lawId: string): Promise<RevisionSummary[]> {
    const url = this.revisionsUrl(lawId);
    const body = await this.http.getJson(url);
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
    const body = await this.http.getJson(url);
    if (body === undefined) return undefined;
    if (!isRecord(body) || !isRecord(body.law_full_text) || typeof body.law_full_text.tag !== "string") {
      throw new MonitorFailure("unexpected_format", url, "応答に law_full_text（tag を持つ要素）がない");
    }
    return body.law_full_text as unknown as LawNode;
  }
}
