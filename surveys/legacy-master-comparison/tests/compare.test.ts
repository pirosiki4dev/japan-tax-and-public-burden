import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { loadRepository } from "../../../src/data/repository.ts";
import { checkMappings, type Mapping } from "../src/compare.ts";
import { buildLegacyItems, type LegacyItem } from "../src/legacy.ts";
import { LEGACY_TAG, REPOSITORY_ROOT, SURVEY_DIR } from "../src/paths.ts";

const items = (JSON.parse(await readFile(join(SURVEY_DIR, "legacy-items.json"), "utf8")) as { items: LegacyItem[] }).items;
const mappings = (parse(await readFile(join(SURVEY_DIR, "mapping.yaml"), "utf8"), { version: "1.2" }) as { mappings: Mapping[] }).mappings;
const firstRelease = parse(await readFile(join(REPOSITORY_ROOT, "surveys/first-release-scope/judgments.yaml"), "utf8"), { version: "1.2" }) as { judgments: Array<{ law_id: string; judgment: string }> };

test("every legacy item is mapped once and consistently with the first release survey", async () => {
  const { data } = await loadRepository(REPOSITORY_ROOT);
  const lawJudgments = new Map(firstRelease.judgments.map((judgment) => [judgment.law_id, judgment.judgment]));
  assert.deepEqual(checkMappings(items, mappings, new Set(data.groups.groups.map((group) => group.group_id)), lawJudgments), []);
});

test("legacy-items.json matches the legacy tag", (t) => {
  let show: (path: string) => unknown;
  try {
    execFileSync("git", ["rev-parse", "--verify", `${LEGACY_TAG}^{commit}`], { cwd: REPOSITORY_ROOT, stdio: "ignore" });
    show = (path) => JSON.parse(execFileSync("git", ["show", `${LEGACY_TAG}:${path}`], { cwd: REPOSITORY_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    t.skip(`${LEGACY_TAG} tag is not available in this checkout`);
    return;
  }
  assert.deepEqual(buildLegacyItems(show("data/master/canonical.json") as never, show("data/master/initial-import.json") as never), items);
});

const item = (id: string, lawIds: string[] = []): LegacyItem => ({ legacy_id: id, name: id, legacy_category: "x", legacy_status: "canonical", law_ids: lawIds, law_names: [] });

test("mapping checks detect gaps, duplicates, and conflicts", () => {
  const errors = checkMappings(
    [item("a"), item("b", ["999AC0000000001"]), item("c")],
    [
      { legacy_id: "a", legacy_name: "a", result: "target", reason: "グループなし" },
      { legacy_id: "a", legacy_name: "a", result: "later", reason: "重複した対応" },
      { legacy_id: "b", legacy_name: "b", result: "later", reason: "対象外の法律" },
      { legacy_id: "x", legacy_name: "x", result: "excluded", groups: ["g"], reason: "旧版にない項目" }
    ],
    new Set(["g"]),
    new Map([["999AC0000000001", "excluded"]])
  );
  for (const expected of ["a: target requires groups", "a: mapped more than once", "b: law 999AC0000000001 is judged excluded", "x: not in legacy items", "x: only target may have groups", "c: not mapped"]) {
    assert.ok(errors.some((error) => error.includes(expected)), `${expected}\n${errors.join("\n")}`);
  }
});

test("legacy items combine canonical burdens and held candidates", () => {
  const built = buildLegacyItems(
    { public_burdens: [{ public_burden_id: "b", name: "unknown", category: "levy", legacy_record: { official_name: "賦課金", legal_bases: [{ law_id: "999AC0000000001", name: "例示法" }, { law_id: null }] } }] },
    { candidates: [{ source_record_id: "b", disposition: "pending" }, { source_record_id: "a", disposition: "pending", record: { name_raw: "保留", burden_type: "tax" } }, { source_record_id: "c", disposition: "merged" }] }
  );
  assert.deepEqual(built.map((entry) => [entry.legacy_id, entry.name, entry.legacy_status, entry.law_ids]), [["a", "保留", "hold", []], ["b", "賦課金", "canonical", ["999AC0000000001"]]]);
});
