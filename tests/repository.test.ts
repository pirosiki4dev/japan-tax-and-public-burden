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
  const burden = await readFixture<Burden>("data/burdens/example-tax/burden.yaml");
  const root = await copyRepository({ "data/burdens/example-tax/burden.yaml": { ...burden, burden_id: "other-tax" } });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("must match directory name")), errors.join("\n"));
});

test("a reference to an unregistered law is an error", async () => {
  const burden = await readFixture<Burden>("data/burdens/example-tax/burden.yaml");
  const root = await copyRepository({ "data/burdens/example-tax/burden.yaml": { ...burden, legal_bases: [{ law_id: "999AC0000000002" }] } });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("unknown law_id 999AC0000000002")), errors.join("\n"));
});

test("a legal source file name must match its law_id", async () => {
  const root = await copyRepository();
  await rm(join(root, "data/legal-sources/999AC0000000001.yaml"));
  await writeFile(join(root, "data/legal-sources/999AC0000000009.yaml"), (await import("yaml")).stringify(await readFixture("data/legal-sources/999AC0000000001.yaml")));
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("file name must match law_id")), errors.join("\n"));
});

test("brackets must be contiguous and shares must sum to 1", async () => {
  const versions = await readFixture<BurdenVersions>("data/burdens/example-tax/versions.yaml");
  const rate = versions.versions[1]!.rates[0]!;
  rate.brackets = [{ lower: 0, upper: 1000000, value: 5 }, { lower: 2000000, upper: null, value: 10 }];
  rate.shares = [{ party: "製造者", ratio: 0.5 }, { party: "販売者", ratio: 0.4 }];
  const root = await copyRepository({ "data/burdens/example-tax/versions.yaml": versions });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("must start where bracket 0 ends")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("share ratios must sum to 1")), errors.join("\n"));
});

test("duplicate version IDs and inverted dates are errors", async () => {
  const versions = await readFixture<BurdenVersions>("data/burdens/example-tax/versions.yaml");
  versions.versions[1]!.version_id = versions.versions[0]!.version_id;
  versions.versions[0]!.dates.promulgation = { raw: "令和三年一月一日", value: "2021-01-01" };
  const root = await copyRepository({ "data/burdens/example-tax/versions.yaml": versions });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("version_id: duplicate")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("promulgation must not be after enforcement")), errors.join("\n"));
});

test("a recorded status that differs from the derived status is a warning", async () => {
  const { errors, warnings } = await validate(VALID_REPO, "2020-01-01");
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((warning) => warning.includes("differs from promulgated_not_effective")), warnings.join("\n"));
});

test("a scope decision must reference an existing burden", async () => {
  const root = await copyRepository({ "data/scope-decisions.yaml": { decisions: [{ decision_id: "x", subject: "x", reason: "対象とする理由の説明", decided_at: "2026-11-01", burden_id: "missing-tax", source_urls: ["https://example.com/x"] }] } });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("unknown burden_id missing-tax")), errors.join("\n"));
});

test("files without a validation route are errors", async () => {
  const root = await copyRepository();
  await mkdir(join(root, "data/other"), { recursive: true });
  await writeFile(join(root, "data/other/note.yaml"), "a: 1\n");
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.includes("data/other/note.yaml: no validation route")), errors.join("\n"));
});

test("schema errors are reported with the file location", async () => {
  const root = await copyRepository({ "data/burdens/example-tax/burden.yaml": "burden_id: example-tax\n" });
  const { errors } = await validate(root);
  assert.ok(errors.some((error) => error.startsWith("data/burdens/example-tax/burden.yaml/:")), errors.join("\n"));
});
