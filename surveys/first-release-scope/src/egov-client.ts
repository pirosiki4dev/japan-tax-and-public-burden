import type { EgovLawHit } from "./survey.ts";

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface LawEntry {
  law_info: { law_id: string; law_num: string };
  revision_info: { law_revision_id: string; law_title: string; category: string; repeal_status: string; current_revision_status: string };
  sentences?: Array<{ text: string }>;
}

interface TextNode {
  tag?: string;
  children?: Array<TextNode | string>;
}

export interface EgovClientOptions {
  baseUrl: string;
  intervalMs: number;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
}

const PAGE_SIZE = 100;

function toHit(entry: LawEntry): EgovLawHit {
  const sentence = entry.sentences?.[0]?.text;
  return {
    law_id: entry.law_info.law_id,
    law_title: entry.revision_info.law_title,
    law_num: entry.law_info.law_num,
    category: entry.revision_info.category,
    law_revision_id: entry.revision_info.law_revision_id,
    current_revision_status: entry.revision_info.current_revision_status,
    repeal_status: entry.revision_info.repeal_status,
    ...(sentence === undefined ? {} : { snippet: sentence.replace(/<[^>]+>/g, "") })
  };
}

function textOf(node: TextNode | string): string {
  return typeof node === "string" ? node : (node.children ?? []).map(textOf).join("");
}

/** e-Gov法令API v2の読み取り専用クライアント。リクエストの間隔を intervalMs 以上空ける。 */
export function createEgovClient({ baseUrl, intervalMs, fetchImpl = fetch as unknown as Fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }: EgovClientOptions) {
  let last = 0;
  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const wait = last + intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries({ ...params, response_format: "json" })) url.searchParams.set(key, value);
    const response = await fetchImpl(url.toString());
    if (!response.ok) throw new Error(`e-Gov API ${url.pathname} failed with HTTP ${response.status}`);
    return response.json();
  }

  async function paginate(path: string, params: Record<string, string>, key: "laws" | "items"): Promise<EgovLawHit[]> {
    const hits: EgovLawHit[] = [];
    let offset = 0;
    for (;;) {
      const page = (await get(path, { ...params, limit: String(PAGE_SIZE), offset: String(offset) })) as Record<string, unknown>;
      const entries = page[key];
      if (!Array.isArray(entries)) throw new Error(`e-Gov API ${path}: response has no ${key} (structure changed?)`);
      hits.push(...(entries as LawEntry[]).map(toHit));
      const next = page.next_offset;
      if (typeof next !== "number" || entries.length === 0) return hits;
      offset = next;
    }
  }

  return {
    /** 法令分類で法令を検索する。 */
    lawsByCategory: (categoryCd: string, lawType: string) => paginate("laws", { category_cd: categoryCd, law_type: lawType }, "laws"),
    /** 条文の全文を検索する。 */
    keyword: (keyword: string, lawType: string) => paginate("keyword", { keyword, law_type: lawType }, "items"),
    /** 指定した条項の本文と改正版IDを取得する。 */
    async article(lawId: string, elm: string): Promise<{ law_revision_id: string; text: string }> {
      const data = (await get(`law_data/${lawId}`, { elm, law_full_text_format: "json" })) as { revision_info?: { law_revision_id?: string }; law_full_text?: TextNode };
      const revisionId = data.revision_info?.law_revision_id;
      if (!revisionId || !data.law_full_text) throw new Error(`e-Gov API law_data/${lawId} ${elm}: missing revision or text (structure changed?)`);
      return { law_revision_id: revisionId, text: textOf(data.law_full_text) };
    }
  };
}

export type EgovClient = ReturnType<typeof createEgovClient>;
