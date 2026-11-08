import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryData } from "../domain/repository.ts";
import type { Burden, BurdenVersion, DateValue } from "../domain/types.generated.ts";

/**
 * 配布物（dist/）の生成。正本から決定的に生成し、生成した日時等の実行環境に依存する値を含めない。
 * 基準日は、配布物に含む正本の確認日時（checked_at、reviewed_at）のうち最も新しい日付とする。
 */

interface Column {
  name: string;
  description: string;
  value: (burden: Burden, version: BurdenVersion, asOf: string) => string | number | null | undefined;
}

const dateValue = (date: DateValue | undefined): string | undefined => (date && "value" in date ? date.value : undefined);
const joined = (values: readonly string[]): string => values.join(" ");

/** burdens.csv の列。順序が列の順序になる。説明は dist/README.md の項目定義になる。 */
export const CSV_COLUMNS: readonly Column[] = [
  { name: "as_of", description: "基準日（YYYY-MM-DD）。正本の確認日時のうち最も新しい日付。全行で同じ値", value: (_b, _v, asOf) => asOf },
  { name: "burden_id", description: "負担項目のID（1つの率または金額ごとの永続ID）", value: (b) => b.burden_id },
  { name: "name", description: "負担項目の名称", value: (b) => b.name },
  { name: "category", description: "区分。`national_tax`（国税）、`local_tax`（地方税）、`social_insurance`（社会保険料）、`other_public_burden`（その他の公的負担）", value: (b) => b.category },
  { name: "levying_body_type", description: "課す主体。`national`、`prefecture`、`municipality`、`insurer`", value: (b) => b.levying_body_type },
  { name: "groups", description: "所属する集計用グループの `group_id`（空白区切り）。グループの定義は burdens.json の `groups`", value: (b) => joined(b.groups) },
  { name: "status", description: "制度の状態（正本に記録した値）。`active`（現行）、`promulgated_not_effective`（施行前）、`abolished`（廃止）", value: (b) => b.status },
  { name: "version_id", description: "版のID。率・金額や根拠の条項の位置が変わるごと、段階的に適用されるごとに版を分ける。1行が1つの版", value: (_b, v) => v.version_id },
  { name: "promulgation_date", description: "公布日（YYYY-MM-DD）。不明の場合は空欄", value: (_b, v) => dateValue(v.dates.promulgation) },
  { name: "enforcement_date", description: "施行日（YYYY-MM-DD）。不明の場合は空欄", value: (_b, v) => dateValue(v.dates.enforcement) },
  { name: "application_start_date", description: "適用開始日（YYYY-MM-DD）。不明の場合は空欄", value: (_b, v) => dateValue(v.dates.application_start) },
  { name: "collection_start_date", description: "徴収開始日（YYYY-MM-DD）。不明の場合は空欄", value: (_b, v) => dateValue(v.dates.collection_start) },
  { name: "application_end_date", description: "適用終了日（YYYY-MM-DD）。終了日の定めがない場合と不明の場合は空欄", value: (_b, v) => dateValue(v.dates.application_end) },
  { name: "rate_kind", description: "率・金額の種類。`proportional`（比例。累進の1区分を含む）、`fixed_amount`（定額）、`per_unit`（従量）", value: (_b, v) => v.rate.kind },
  { name: "rate_role", description: "率・金額の位置付け。`statutory`（法定）、`standard`（標準税率）、`limit`（制限税率）、`reduced`（軽減）", value: (_b, v) => v.rate.role },
  { name: "value", description: "率・金額の値", value: (_b, v) => v.rate.value },
  { name: "unit", description: "`value` の単位。`percent`（10は10%）、`per_mille`（1,000分率）、`yen`（円）", value: (_b, v) => v.rate.unit },
  { name: "per", description: "従量の基準となる数量（原文の表記）。従量でない場合は空欄", value: (_b, v) => v.rate.per },
  { name: "bracket_lower", description: "累進の区分の下限（この金額を超える部分。0は下限なし）。累進でない場合は空欄", value: (_b, v) => v.rate.bracket?.lower },
  { name: "bracket_upper", description: "累進の区分の上限（この金額以下の部分）。上限がない場合と累進でない場合は空欄", value: (_b, v) => v.rate.bracket?.upper },
  { name: "bracket_unit", description: "累進の区分の単位（`yen`）。累進でない場合は空欄", value: (_b, v) => v.rate.bracket?.unit },
  { name: "applies_to", description: "率・金額が適用される対象の条件（要約）。不明の場合は空欄", value: (_b, v) => ("summary" in v.rate.applies_to ? v.rate.applies_to.summary : undefined) },
  { name: "raw_text", description: "率・金額を定める原文", value: (_b, v) => v.rate.raw_text },
  { name: "determination", description: "値の決まり方。`stated`（条文に値が書かれている）、`calculated`（条文の算式から計算する）、`published`（告示等の公表物で定まる）", value: (_b, v) => v.determination },
  { name: "source_urls", description: "版の根拠URL（空白区切り）", value: (_b, v) => joined(v.source_urls) },
  { name: "checked_at", description: "版の確認日時（ISO 8601、+09:00）", value: (_b, v) => v.checked_at }
];

/** 基準日。配布物に含む正本の確認日時のうち最も新しい日付（JST）。 */
export function distributionAsOf(data: RepositoryData): string {
  const dates = [
    ...data.burdens.flatMap((burden) => [burden.checked_at, ...burden.versions.map((version) => version.checked_at)]),
    ...data.legalSources.map((source) => source.reviewed_at),
    ...data.publishedDocuments.map((document) => document.reviewed_at)
  ].map((dateTime) => dateTime.slice(0, 10));
  const latest = dates.sort().at(-1);
  if (!latest) throw new Error("基準日を決められない（正本に確認日時がない）");
  return latest;
}

function csvField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

/** burdens.csv。版ごとに1行。表計算ソフトで文字化けしないよう、UTF-8のBOMを付け、改行はCRLFとする（RFC 4180）。 */
export function burdensCsv(data: RepositoryData, asOf: string): string {
  const rows = [CSV_COLUMNS.map((column) => column.name)];
  for (const burden of data.burdens) {
    for (const version of burden.versions) rows.push(CSV_COLUMNS.map((column) => csvField(column.value(burden, version, asOf))));
  }
  return `﻿${rows.map((row) => row.join(",")).join("\r\n")}\r\n`;
}

/** burdens.json の最上位の項目。順序が出力の順序になる。 */
export const JSON_KEYS: readonly { name: string; description: string }[] = [
  { name: "as_of", description: "基準日（YYYY-MM-DD）。burdens.csv の `as_of` と同じ" },
  { name: "burdens", description: "負担項目（`data/burdens.yaml` の `burdens`）。各項目の意味は `schemas/burden.schema.json`" },
  { name: "groups", description: "集計用グループ（`data/groups.yaml` の `groups`）。各項目の意味は `schemas/groups.schema.json`" },
  { name: "legal_sources", description: "根拠法令と確認済みの改正版（`data/legal-sources.yaml` の `legal_sources`）。各項目の意味は `schemas/legal-source.schema.json`" },
  { name: "published_documents", description: "告示等の値を公表する最新の資料と確認済みのSHA-256（`data/legal-sources.yaml` の `published_documents`）。各項目の意味は `schemas/legal-sources.schema.json`" }
];

/** burdens.json。正本の構造のまま収め、基準日を付ける。 */
export function burdensJson(data: RepositoryData, asOf: string): string {
  const document = { as_of: asOf, burdens: data.burdens, groups: data.groups.groups, legal_sources: data.legalSources, published_documents: data.publishedDocuments };
  return `${JSON.stringify(document, null, 2)}\n`;
}

const cell = (text: string): string => text.replace(/\|/g, "\\|");

/** dist/README.md。配布物の項目定義。 */
export function distributionReadme(asOf: string): string {
  return [
    "# 配布物",
    "",
    "このディレクトリは正本（`data/`）から `npm run dist:generate` で生成する。手で編集しない。CIは、生成し直した結果とこのディレクトリに差分がないことを検査する（`npm run dist:check`）。",
    "",
    `基準日: ${asOf}（正本の確認日時のうち最も新しい日付。配布物の内容は、この日までに確認した公式情報に基づく）`,
    "",
    "| ファイル | 内容 |",
    "| --- | --- |",
    "| `burdens.csv` | 負担項目の版ごとに1行の表。表計算ソフト向け（UTF-8・BOM付き、改行はCRLF、RFC 4180） |",
    "| `burdens.json` | 負担項目、集計用グループ、根拠法令、公表資料を正本の構造のまま収めたもの。プログラム向け |",
    "",
    "## burdens.csv の列",
    "",
    "日付の原文（和暦）、不明な日付の理由、監視する条項、負担者・課税対象・課税標準は、burdens.json に収める。",
    "",
    "| 列 | 意味 |",
    "| --- | --- |",
    ...CSV_COLUMNS.map((column) => `| \`${column.name}\` | ${cell(column.description)} |`),
    "",
    "## burdens.json の最上位の項目",
    "",
    "| 項目 | 意味 |",
    "| --- | --- |",
    ...JSON_KEYS.map((key) => `| \`${key.name}\` | ${cell(key.description)} |`),
    ""
  ].join("\n");
}

/** 配布物のファイル名と内容。 */
export function buildDistribution(data: RepositoryData): Record<string, string> {
  const asOf = distributionAsOf(data);
  return { "README.md": distributionReadme(asOf), "burdens.csv": burdensCsv(data, asOf), "burdens.json": burdensJson(data, asOf) };
}

/** dist/ の内容と生成結果の食い違い（内容の異なるファイル、ないファイル、生成しないファイル）。 */
export async function distributionDifferences(expected: Record<string, string>, directory: string): Promise<string[]> {
  const present = await readdir(directory).catch(() => [] as string[]);
  const differences: string[] = [];
  for (const [name, content] of Object.entries(expected)) {
    if (!present.includes(name)) differences.push(`${name}: missing`);
    else if ((await readFile(join(directory, name), "utf8")) !== content) differences.push(`${name}: out of date`);
  }
  for (const name of present) if (!(name in expected)) differences.push(`${name}: not generated from the source data`);
  return differences;
}
