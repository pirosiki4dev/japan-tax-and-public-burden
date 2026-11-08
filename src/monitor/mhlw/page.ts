/**
 * 厚生労働省のサイトのページ（HTML）から、本文の領域に掲載された資料へのリンクを取り出す。
 * 本文の領域は `<div class="l-contentMain">` から `<!-- /.l-contentMain -->` まで（ヘッダー・メニュー・フッターを除く）。
 */

export interface PageLink {
  /** リンクの文字列（タグを除き、連続する空白を1つにしたもの） */
  title: string;
  /** ページのURLを基準に解決した絶対URL */
  url: string;
}

const MAIN_START = /<div class="l-contentMain">/;
const MAIN_END = /<!-- \/\.l-contentMain -->/;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/** 本文の領域のHTML。見つからなければ undefined（ページの構造が変わった）。 */
export function mainContent(html: string): string | undefined {
  const start = MAIN_START.exec(html);
  if (!start) return undefined;
  const rest = html.slice(start.index);
  const end = MAIN_END.exec(rest);
  return end ? rest.slice(0, end.index) : undefined;
}

/** 本文の領域にある、PDFへのリンク（掲載順）。 */
export function documentLinks(html: string, pageUrl: string): PageLink[] | undefined {
  const main = mainContent(html);
  if (main === undefined) return undefined;
  const links: PageLink[] = [];
  for (const match of main.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(decodeEntities(match[1]!), pageUrl).href;
    if (!/\.pdf$/i.test(new URL(url).pathname)) continue;
    const title = decodeEntities(match[2]!.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
    links.push({ title, url });
  }
  return links;
}
