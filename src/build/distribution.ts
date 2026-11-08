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
  value: (burden: Burden, version: BurdenVersion, asOf: string) => string | number | null | undefined;
}

const dateValue = (date: DateValue | undefined): string | undefined => (date && "value" in date ? date.value : undefined);
const joined = (values: readonly string[]): string => values.join(" ");

/** burdens.csv の列。順序が列の順序になる。各列の意味は README.md の「配布物」に記載する（列名の一致はテストで検査する）。 */
export const CSV_COLUMNS: readonly Column[] = [
  { name: "as_of", value: (_b, _v, asOf) => asOf },
  { name: "burden_id", value: (b) => b.burden_id },
  { name: "name", value: (b) => b.name },
  { name: "category", value: (b) => b.category },
  { name: "levying_body_type", value: (b) => b.levying_body_type },
  { name: "groups", value: (b) => joined(b.groups) },
  { name: "status", value: (b) => b.status },
  { name: "version_id", value: (_b, v) => v.version_id },
  { name: "promulgation_date", value: (_b, v) => dateValue(v.dates.promulgation) },
  { name: "enforcement_date", value: (_b, v) => dateValue(v.dates.enforcement) },
  { name: "application_start_date", value: (_b, v) => dateValue(v.dates.application_start) },
  { name: "collection_start_date", value: (_b, v) => dateValue(v.dates.collection_start) },
  { name: "application_end_date", value: (_b, v) => dateValue(v.dates.application_end) },
  { name: "rate_kind", value: (_b, v) => v.rate.kind },
  { name: "rate_role", value: (_b, v) => v.rate.role },
  { name: "value", value: (_b, v) => v.rate.value },
  { name: "unit", value: (_b, v) => v.rate.unit },
  { name: "per", value: (_b, v) => v.rate.per },
  { name: "bracket_lower", value: (_b, v) => v.rate.bracket?.lower },
  { name: "bracket_upper", value: (_b, v) => v.rate.bracket?.upper },
  { name: "bracket_unit", value: (_b, v) => v.rate.bracket?.unit },
  { name: "applies_to", value: (_b, v) => ("summary" in v.rate.applies_to ? v.rate.applies_to.summary : undefined) },
  { name: "raw_text", value: (_b, v) => v.rate.raw_text },
  { name: "determination", value: (_b, v) => v.determination },
  { name: "source_urls", value: (_b, v) => joined(v.source_urls) },
  { name: "checked_at", value: (_b, v) => v.checked_at }
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

/** burdens.json。正本の構造のまま収め、基準日を付ける。 */
export function burdensJson(data: RepositoryData, asOf: string): string {
  const document = { as_of: asOf, burdens: data.burdens, groups: data.groups.groups, legal_sources: data.legalSources, published_documents: data.publishedDocuments };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** 配布物のファイル名と内容。 */
export function buildDistribution(data: RepositoryData): Record<string, string> {
  const asOf = distributionAsOf(data);
  return { "burdens.csv": burdensCsv(data, asOf), "burdens.json": burdensJson(data, asOf) };
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
