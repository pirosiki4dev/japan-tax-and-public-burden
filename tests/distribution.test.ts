import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildDistribution, burdensCsv, CSV_COLUMNS, distributionAsOf, distributionDifferences, JSON_KEYS } from "../src/build/distribution.ts";
import { loadRepository } from "../src/data/repository.ts";
import type { RepositoryData } from "../src/domain/repository.ts";
import { ROOT, SCHEMA_DIR, VALID_REPO } from "./helpers.ts";

async function fixtureData(): Promise<RepositoryData> {
  const { data, errors } = await loadRepository(VALID_REPO, SCHEMA_DIR);
  assert.deepEqual(errors, []);
  return data;
}

/** RFC 4180 のCSVを行と列に分ける（テスト用）。 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === "\"" && text[i + 1] === "\"") { field += "\""; i++; } else if (char === "\"") quoted = false; else field += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") { row.push(field); field = ""; } else if (char === "\r" && text[i + 1] === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; } else field += char;
  }
  return rows;
}

test("the same source data always produces the same distribution", async () => {
  const first = buildDistribution(await fixtureData());
  const second = buildDistribution(await fixtureData());
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), ["README.md", "burdens.csv", "burdens.json"]);
});

test("the as-of date is the latest confirmation date in the source data, not the generation date", async () => {
  const data = await fixtureData();
  const before = distributionAsOf(data);
  data.legalSources[0]!.reviewed_at = "2027-01-02T08:00:00+09:00";
  assert.notEqual(before, "2027-01-02");
  assert.equal(distributionAsOf(data), "2027-01-02");
  data.burdens[0]!.versions[0]!.checked_at = "2027-02-03T23:59:59+09:00";
  assert.equal(distributionAsOf(data), "2027-02-03");
});

test("burdens.csv has one row per version with source URLs, checked_at, and the as-of date, and quotes special characters", async () => {
  const data = await fixtureData();
  const burden = data.burdens[0]!;
  burden.name = "名称に\"引用符\"と,カンマと\n改行を含む";
  const text = burdensCsv(data, "2026-11-08");
  assert.ok(text.startsWith("﻿"));
  const [header, ...rows] = parseCsv(text.slice(1));
  assert.deepEqual(header, CSV_COLUMNS.map((column) => column.name));
  for (const required of ["as_of", "source_urls", "checked_at"]) assert.ok(header!.includes(required), required);
  assert.equal(rows.length, data.burdens.reduce((count, b) => count + b.versions.length, 0));
  const first = Object.fromEntries(header!.map((name, i) => [name, rows[0]![i]]));
  assert.equal(first.as_of, "2026-11-08");
  assert.equal(first.name, burden.name);
  assert.equal(first.version_id, burden.versions[0]!.version_id);
  assert.equal(first.source_urls, burden.versions[0]!.source_urls.join(" "));
  assert.equal(first.checked_at, burden.versions[0]!.checked_at);
  assert.ok(rows.every((row) => row.length === header!.length));
});

test("burdens.json carries the as-of date and the source data, and the README documents every CSV column and JSON key", async () => {
  const data = await fixtureData();
  const files = buildDistribution(data);
  const json = JSON.parse(files["burdens.json"]!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(json), JSON_KEYS.map((key) => key.name));
  assert.equal(json.as_of, distributionAsOf(data));
  assert.deepEqual(json.burdens, data.burdens);
  assert.deepEqual(json.legal_sources, data.legalSources);
  for (const name of [...CSV_COLUMNS.map((column) => column.name), ...JSON_KEYS.map((key) => key.name)]) {
    assert.ok(files["README.md"]!.includes(`| \`${name}\` |`), `README.md must document ${name}`);
  }
  assert.ok(CSV_COLUMNS.every((column) => column.description.length > 0));
});

test("differences between dist/ and the generated files are reported", async () => {
  const files = buildDistribution(await fixtureData());
  const directory = await mkdtemp(join(tmpdir(), "jtpb-dist-"));
  for (const [name, content] of Object.entries(files)) await writeFile(join(directory, name), content, "utf8");
  assert.deepEqual(await distributionDifferences(files, directory), []);

  await writeFile(join(directory, "burdens.csv"), "edited by hand", "utf8");
  await writeFile(join(directory, "extra.csv"), "", "utf8");
  assert.deepEqual(await distributionDifferences({ ...files, "new.json": "{}" }, directory), ["burdens.csv: out of date", "new.json: missing", "extra.csv: not generated from the source data"]);
});

test("the CI check runs the distribution check", async () => {
  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.match(packageJson.scripts.check!, /npm run dist:check/);
});
