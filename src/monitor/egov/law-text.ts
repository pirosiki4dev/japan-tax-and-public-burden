/**
 * e-Gov法令API v2 の法令本文（law_full_text の JSON 形式）から、`elm` で指定した要素を取り出す。
 * 2つの改正版の全文を1回ずつ取得し、登録済みの条項を手元で照合するために使う。
 */

export interface LawNode {
  tag: string;
  attr?: Record<string, string>;
  children?: (LawNode | string)[];
}

export interface ElmPart {
  tag: string;
  /** `Article_3_2` の `3_2`（要素の Num 属性） */
  num?: string;
  /** `SupplProvision[2]` の `2`（同じ要素の出現順。1から数える） */
  index?: number;
}

/** 指定した要素を探すとき、中に入らない要素。条・項・号の入れ子と、改正文に引用された条文を越えないため。 */
const STOP = new Set(["Article", "Paragraph", "Item", "Subitem1", "Subitem2", "Subitem3", "AmendProvision", "SupplProvision", "AppdxTable"]);

export function parseElm(elm: string): ElmPart[] {
  return elm.split("-").map((part) => {
    const indexed = /^([A-Za-z]+)\[(\d+)\]$/.exec(part);
    if (indexed) return { tag: indexed[1]!, index: Number(indexed[2]) };
    const numbered = /^([A-Za-z]+)_(\d+(?:_\d+)*)$/.exec(part);
    if (numbered) return { tag: numbered[1]!, num: numbered[2]! };
    if (/^[A-Za-z]+$/.test(part)) return { tag: part };
    throw new Error(`unsupported elm part: ${part} (${elm})`);
  });
}

const isNode = (child: LawNode | string): child is LawNode => typeof child !== "string";

/** 文書順に、指定したタグの要素を集める（同じタグの要素の中には入らない）。 */
export function collect(root: LawNode, tag: string): LawNode[] {
  const found: LawNode[] = [];
  (function walk(node: LawNode): void {
    if (node.tag === tag) { found.push(node); return; }
    for (const child of node.children ?? []) if (isNode(child)) walk(child);
  })(root);
  return found;
}

function findDescendant(node: LawNode, part: ElmPart): LawNode | undefined {
  for (const child of node.children ?? []) {
    if (!isNode(child)) continue;
    if (child.tag === part.tag && (part.num === undefined || child.attr?.Num === part.num)) return child;
    if (!STOP.has(child.tag)) {
      const found = findDescendant(child, part);
      if (found) return found;
    }
  }
  return undefined;
}

export function textOf(node: LawNode | string): string {
  return typeof node === "string" ? node : (node.children ?? []).map(textOf).join("");
}

/** 比較用に空白（全角を含む）を除いた本文。 */
export function normalizedText(node: LawNode): string {
  return textOf(node).replace(/[\s　]/g, "");
}

/**
 * 出現順の番号で指す要素（`SupplProvision[n]`・`AppdxTable[n]`）が何を指しているかを表す値。
 * 附則は改正法令番号（AmendLawNum 属性）、別表は題名で識別する。
 */
export function identityOf(node: LawNode): string {
  if (node.tag === "SupplProvision") return node.attr?.AmendLawNum ?? "（改正法令番号なし）";
  const title = (node.children ?? []).find((child) => isNode(child) && /Title$/.test(child.tag));
  return title ? normalizedText(title as LawNode) : normalizedText(node).slice(0, 20);
}

/** `elm` の先頭の要素。出現順の番号で指す場合は、その番号も返す。 */
function locateHead(root: LawNode, head: ElmPart): LawNode | undefined {
  if (head.index !== undefined) return collect(root, head.tag)[head.index - 1];
  if (head.num !== undefined) return findDescendant({ tag: "", children: [root] }, head);
  return collect(root, head.tag)[0];
}

/** `elm` の要素を探す。見つからなければ undefined。 */
export function locate(root: LawNode, elm: string): LawNode | undefined {
  const [head, ...rest] = parseElm(elm);
  let node = head ? locateHead(root, head) : undefined;
  for (const part of rest) {
    if (!node) return undefined;
    node = findDescendant(node, part);
  }
  return node;
}

/** `elm` の先頭が出現順の番号で指す要素なら、その要素の識別値を返す。 */
export function headIdentity(root: LawNode, elm: string): { tag: string; index: number; identity: string } | undefined {
  const [head] = parseElm(elm);
  if (head?.index === undefined) return undefined;
  const node = collect(root, head.tag)[head.index - 1];
  return node ? { tag: head.tag, index: head.index, identity: identityOf(node) } : undefined;
}

/** 識別値が一致する要素の出現順の番号（1から数える）。なければ undefined。 */
export function indexOfIdentity(root: LawNode, tag: string, identity: string): number | undefined {
  const position = collect(root, tag).findIndex((node) => identityOf(node) === identity);
  return position < 0 ? undefined : position + 1;
}

/** `elm` の先頭の番号を付け替える（例: `SupplProvision[843]-Article_15` → `SupplProvision[845]-Article_15`）。 */
export function withHeadIndex(elm: string, index: number): string {
  return elm.replace(/^([A-Za-z]+)\[\d+\]/, `$1[${index}]`);
}
