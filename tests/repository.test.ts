import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { validateRepository } from "../src/data/validate-repository.ts";
import type { Burden, BurdenVersions } from "../src/domain/types.generated.ts";
import { copyRepository, readFixture, ROOT, SCHEMA_DIR, VALID_REPO } from "./helpers.ts";

const AS_OF = "2026-11-01";
const validate = (root: string, asOf = AS_OF) => validateRepository(root, { asOf, schemaDir: SCHEMA_DIR });

test("the repository's own data and config are valid", async () => {
  const { errors } = await validate(ROOT);
  assert.deepEqual(errors, []);
});

test("the valid fixture repository has no errors or warnings", async () => {
  assert.deepEqual(await validate(VALID_REPO), { errors: [], warnings: [] });
});

test("a burden_id that differs from its directory is an error", async () => {
  const burden = await readFixture<Burden>("data/burdens/nt-000001/burden.yaml");
  const root = await copyRepository({ "data/burdens/nt-000001/burden.yaml": { ...burden, burden_id: "nt-000009" } });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("must match directory name")), errors.join("\n"));
});

test("the burden_id prefix must match the category", async () => {
  const burden = await readFixture<Burden>("data/burdens/nt-000001/burden.yaml");
  const root = await copyRepository({ "data/burdens/nt-000001/burden.yaml": { ...burden, category: "local_tax" } });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("must start with lt- for category local_tax")), errors.join("\n"));
});

test("a reference to an unregistered law is an error", async () => {
  const burden = await readFixture<Burden>("data/burdens/nt-000001/burden.yaml");
  const root = await copyRepository({ "data/burdens/nt-000001/burden.yaml": { ...burden, legal_bases: [{ law_id: "999AC0000000009" }] } });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("unknown law_id 999AC0000000009")), errors.join("\n"));
});

test("a monitored provision must be in a registered law", async () => {
  const versions = await readFixture<BurdenVersions>("data/burdens/nt-000003/versions.yaml");
  versions.versions[0]!.provisions.push({ law_id: "999CO0000000009", elm: "MainProvision-Article_1", article: "第一条", role: "delegation" });
  const root = await copyRepository({ "data/burdens/nt-000003/versions.yaml": versions });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("provisions[2]: unknown law_id 999CO0000000009")), errors.join("\n"));
});

test("a legal source file name must match its law_id", async () => {
  const root = await copyRepository();
  await rm(join(root, "data/legal-sources/999AC0000000001.yaml"));
  await writeFile(join(root, "data/legal-sources/999AC0000000009.yaml"), (await import("yaml")).stringify(await readFixture("data/legal-sources/999AC0000000001.yaml")));
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("file name must match law_id")), errors.join("\n"));
});

test("the determination requires a provision with a matching role", async () => {
  const stated = await readFixture<BurdenVersions>("data/burdens/nt-000002/versions.yaml");
  stated.versions[0]!.provisions[0]!.role = "condition";
  const calculated = await readFixture<BurdenVersions>("data/burdens/si-000001/versions.yaml");
  calculated.versions[0]!.provisions = [calculated.versions[0]!.provisions[0]!];
  const root = await copyRepository({ "data/burdens/nt-000002/versions.yaml": stated, "data/burdens/si-000001/versions.yaml": calculated });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("nt-000002-v1: determination stated requires a provision with role value")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("si-000001-v1: determination calculated requires a provision with role formula")), errors.join("\n"));
});

test("groups must exist, must not form cycles, and progressive members need brackets", async () => {
  const burden = await readFixture<Burden>("data/burdens/si-000001/burden.yaml");
  const versions = await readFixture<BurdenVersions>("data/burdens/nt-000002/versions.yaml");
  delete versions.versions[0]!.rate.bracket;
  const root = await copyRepository({
    "data/burdens/si-000001/burden.yaml": { ...burden, groups: ["missing-group"] },
    "data/burdens/nt-000002/versions.yaml": versions,
    "data/groups.yaml": {
      groups: [
        { group_id: "example-national-tax", name: "a", aggregation: "classification", parent_group_id: "example-tax" },
        { group_id: "example-tax", name: "b", aggregation: "progressive", parent_group_id: "example-national-tax" },
        { group_id: "example-insurance", name: "c", aggregation: "sum" }
      ]
    }
  });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("unknown group missing-group")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("parent_group_id forms a cycle")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("nt-000002/versions.yaml: every version must have rate.bracket")), errors.join("\n"));
});

test("predecessors must be other existing burdens", async () => {
  const burden = await readFixture<Burden>("data/burdens/nt-000002/burden.yaml");
  const root = await copyRepository({ "data/burdens/nt-000002/burden.yaml": { ...burden, predecessors: ["nt-000002", "nt-000099"] } });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("predecessors must not include itself")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("unknown predecessor nt-000099")), errors.join("\n"));
});

test("duplicate version IDs and inverted dates are errors", async () => {
  const versions = await readFixture<BurdenVersions>("data/burdens/nt-000001/versions.yaml");
  versions.versions[1]!.version_id = versions.versions[0]!.version_id;
  versions.versions[0]!.dates.promulgation = { raw: "令和三年一月一日", value: "2021-01-01" };
  versions.versions[1]!.rate.bracket = { lower: 1000000, upper: 1000000, unit: "yen" };
  const root = await copyRepository({ "data/burdens/nt-000001/versions.yaml": versions });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("version_id: duplicate")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("promulgation must not be after enforcement")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("bracket upper must be greater than lower")), errors.join("\n"));
});

test("an unused group is a warning", async () => {
  const groups = await readFixture<{ groups: unknown[] }>("data/groups.yaml");
  groups.groups.push({ group_id: "unused", name: "未使用", aggregation: "sum" });
  const { errors, warnings } = await validate(await copyRepository({ "data/groups.yaml": groups }));
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((warning) => warning.includes("unused: no burden or child group")), warnings.join("\n"));
});

test("a recorded status that differs from the derived status is a warning", async () => {
  const { errors, warnings } = await validate(VALID_REPO, "2020-01-01");
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((warning) => warning.includes("differs from promulgated_not_effective")), warnings.join("\n"));
});

test("a scope decision must reference an existing burden", async () => {
  const root = await copyRepository({ "data/scope-decisions.yaml": { decisions: [{ decision_id: "x", subject: "x", reason: "対象とする理由の説明", decided_at: "2026-11-01", burden_id: "nt-000099", source_urls: ["https://example.com/x"] }] } });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("unknown burden_id nt-000099")), errors.join("\n"));
});

test("files without a validation route are errors", async () => {
  const root = await copyRepository();
  await mkdir(join(root, "data/other"), { recursive: true });
  await writeFile(join(root, "data/other/note.yaml"), "a: 1\n");
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("data/other/note.yaml: no validation route")), errors.join("\n"));
});

test("schema errors are reported with the file location", async () => {
  const root = await copyRepository({ "data/burdens/nt-000001/burden.yaml": "burden_id: nt-000001\n" });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.startsWith("data/burdens/nt-000001/burden.yaml/:")), errors.join("\n"));
});
