import assert from "node:assert/strict";
import { test } from "node:test";
import { createSchemaValidator } from "../src/data/schema.ts";
import type { Burden, BurdenVersions } from "../src/domain/types.generated.ts";
import { readFixture, SCHEMA_DIR } from "./helpers.ts";

const validator = await createSchemaValidator(SCHEMA_DIR);
const burden = await readFixture<Burden>("data/burdens/example-tax/burden.yaml");
const versions = await readFixture<BurdenVersions>("data/burdens/example-tax/versions.yaml");

function clone<T>(value: T): T {
  return structuredClone(value);
}

test("valid fixture documents pass their schemas", async () => {
  assert.deepEqual(validator.validate("burden", burden, "burden"), []);
  assert.deepEqual(validator.validate("versions", versions, "versions"), []);
  assert.deepEqual(validator.validate("legal-source", await readFixture("data/legal-sources/999AC0000000001.yaml"), "law"), []);
  assert.deepEqual(validator.validate("scope-decisions", await readFixture("data/scope-decisions.yaml"), "decisions"), []);
  assert.deepEqual(validator.validate("sources", await readFixture("config/sources.yaml"), "sources"), []);
});

const invalidBurdens: Array<[string, (document: Record<string, unknown>) => void]> = [
  ["missing source_url", (document) => { delete document.source_url; }],
  ["non-https source_url", (document) => { document.source_url = "http://example.com/"; }],
  ["checked_at without time zone", (document) => { document.checked_at = "2026-11-01T09:00:00"; }],
  ["non kebab-case burden_id", (document) => { document.burden_id = "Example_Tax"; }],
  ["invalid law_id", (document) => { document.legal_bases = [{ law_id: "abc" }]; }],
  ["unknown category", (document) => { document.category = "fee"; }],
  ["unknown value without reason", (document) => { document.tax_base = [{ unknown: true }]; }],
  ["unexpected property", (document) => { document.note = "x"; }]
];

for (const [name, mutate] of invalidBurdens) {
  test(`burden schema rejects ${name}`, () => {
    const document = clone(burden) as unknown as Record<string, unknown>;
    mutate(document);
    assert.notDeepEqual(validator.validate("burden", document, "burden"), []);
  });
}

type RateDocument = Record<string, unknown>;
function firstRate(document: BurdenVersions, versionIndex: number, rateIndex: number): RateDocument {
  return document.versions[versionIndex]!.rates[rateIndex] as unknown as RateDocument;
}

const invalidRates: Array<[string, (document: BurdenVersions) => void]> = [
  ["progressive rate without brackets", (document) => { delete firstRate(document, 1, 0).brackets; }],
  ["progressive rate with a single value", (document) => { firstRate(document, 1, 0).value = 5; }],
  ["proportional rate without value", (document) => { delete firstRate(document, 0, 0).value; }],
  ["proportional rate with brackets", (document) => { firstRate(document, 0, 0).brackets = [{ lower: 0, upper: null, value: 1 }]; }],
  ["per-unit rate without per", (document) => { delete firstRate(document, 1, 1).per; }],
  ["per on a non per-unit rate", (document) => { firstRate(document, 0, 0).per = "1個"; }],
  ["share ratio above 1", (document) => { firstRate(document, 1, 0).shares = [{ party: "a", ratio: 1.5 }]; }],
  ["missing collection_start", (document) => { delete (document.versions[0]!.dates as unknown as Record<string, unknown>).collection_start; }],
  ["known date without raw text", (document) => { (document.versions[0]!.dates as unknown as Record<string, unknown>).enforcement = { value: "2020-04-01" }; }],
  ["invalid normalized date", (document) => { (document.versions[0]!.dates as unknown as Record<string, unknown>).enforcement = { raw: "令和二年", value: "2020-13-01" }; }]
];

for (const [name, mutate] of invalidRates) {
  test(`versions schema rejects ${name}`, () => {
    const document = clone(versions);
    mutate(document);
    assert.notDeepEqual(validator.validate("versions", document, "versions"), []);
  });
}

test("scope decision schema rejects decisions without source URLs", () => {
  const document = { decisions: [{ decision_id: "x", subject: "x", reason: "対象とする理由の説明", decided_at: "2026-11-01", source_urls: [] }] };
  assert.notDeepEqual(validator.validate("scope-decisions", document, "decisions"), []);
});

test("scope decision schema does not record excluded decisions", () => {
  const document = { decisions: [{ decision_id: "x", subject: "x", decision: "excluded", reason: "対象外とする理由の説明", decided_at: "2026-11-01", source_urls: ["https://example.com/x"] }] };
  assert.notDeepEqual(validator.validate("scope-decisions", document, "decisions"), []);
});
