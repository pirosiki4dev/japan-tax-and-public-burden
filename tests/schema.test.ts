import assert from "node:assert/strict";
import { test } from "node:test";
import { createSchemaValidator } from "../src/data/schema.ts";
import type { Burden, Burdens } from "../src/domain/types.generated.ts";
import { readFixture, SCHEMA_DIR } from "./helpers.ts";

const validator = await createSchemaValidator(SCHEMA_DIR);
const { burdens } = await readFixture<Burdens>("data/burdens.yaml");
const byId = (id: string): Burden => burdens.find((burden) => burden.burden_id === id)!;
const burden = byId("nt-000001");
const published = byId("nt-000003");

function clone<T>(value: T): T {
  return structuredClone(value);
}

test("valid fixture documents pass their schemas", async () => {
  assert.deepEqual(validator.validate("burdens", await readFixture("data/burdens.yaml"), "burdens"), []);
  assert.deepEqual(validator.validate("groups", await readFixture("data/groups.yaml"), "groups"), []);
  assert.deepEqual(validator.validate("legal-sources", await readFixture("data/legal-sources.yaml"), "laws"), []);
  assert.deepEqual(validator.validate("scope-decisions", await readFixture("data/scope-decisions.yaml"), "decisions"), []);
  assert.deepEqual(validator.validate("sources", await readFixture("config/sources.yaml"), "sources"), []);
});

const invalidBurdens: Array<[string, (document: Record<string, unknown>) => void]> = [
  ["missing source_urls", (document) => { delete document.source_urls; }],
  ["empty source_urls", (document) => { document.source_urls = []; }],
  ["non-https source URL", (document) => { document.source_urls = ["http://example.com/"]; }],
  ["checked_at without time zone", (document) => { document.checked_at = "2026-11-01T09:00:00"; }],
  ["checked_at in UTC instead of JST", (document) => { document.checked_at = "2026-11-01T00:00:00Z"; }],
  ["a meaningful burden_id", (document) => { document.burden_id = "income-tax"; }],
  ["burden_id with an unknown prefix", (document) => { document.burden_id = "xx-000001"; }],
  ["burden_id without six digits", (document) => { document.burden_id = "nt-1"; }],
  ["missing groups", (document) => { delete document.groups; }],
  ["invalid law_id", (document) => { document.legal_bases = [{ law_id: "abc" }]; }],
  ["invalid elm", (document) => { document.legal_bases = [{ law_id: "999AC0000000001", elm: "第一条" }]; }],
  ["unknown category", (document) => { document.category = "fee"; }],
  ["unknown value without reason", (document) => { document.tax_base = [{ unknown: true }]; }],
  ["unexpected property", (document) => { document.note = "x"; }]
];

for (const [name, mutate] of invalidBurdens) {
  test(`burden schema rejects ${name}`, () => {
    const document = clone(burden) as unknown as Record<string, unknown>;
    mutate(document);
    assert.notDeepEqual(validator.validate("burdens", { burdens: [document] }, "burdens"), []);
  });
}

type Loose = Record<string, unknown>;
const version = (document: Burden): Loose => document.versions[0] as unknown as Loose;
const rate = (document: Burden): Loose => document.versions[0]!.rate as unknown as Loose;

const invalidVersions: Array<[string, Burden, (document: Burden) => void]> = [
  ["a rate without value", burden, (document) => { delete rate(document).value; }],
  ["multiple rates in one version", burden, (document) => { version(document).rates = [rate(document)]; }],
  ["per on a non per-unit rate", burden, (document) => { rate(document).per = "1個"; }],
  ["per-unit rate without per", published, (document) => { delete rate(document).per; }],
  ["published value without formula", published, (document) => { delete version(document).formula; }],
  ["unknown determination", burden, (document) => { version(document).determination = "guessed"; }],
  ["no versions", burden, (document) => { (document as unknown as Loose).versions = []; }],
  ["no provisions", burden, (document) => { version(document).provisions = []; }],
  ["a provision without elm", burden, (document) => { version(document).provisions = [{ law_id: "999AC0000000001", article: "第三条", role: "value" }]; }],
  ["unknown provision role", burden, (document) => { version(document).provisions = [{ law_id: "999AC0000000001", elm: "MainProvision-Article_3", article: "第三条", role: "other" }]; }],
  ["missing collection_start", burden, (document) => { delete (version(document).dates as Loose).collection_start; }],
  ["known date without raw text", burden, (document) => { (version(document).dates as Loose).enforcement = { value: "2020-04-01" }; }],
  ["invalid normalized date", burden, (document) => { (version(document).dates as Loose).enforcement = { raw: "令和二年", value: "2020-13-01" }; }]
];

for (const [name, fixture, mutate] of invalidVersions) {
  test(`versions schema rejects ${name}`, () => {
    const document = clone(fixture);
    mutate(document);
    assert.notDeepEqual(validator.validate("burdens", { burdens: [document] }, "burdens"), []);
  });
}

test("groups schema rejects an unknown aggregation", () => {
  const document = { groups: [{ group_id: "x", name: "x", aggregation: "average" }] };
  assert.notDeepEqual(validator.validate("groups", document, "groups"), []);
});

test("scope decision schema rejects decisions without source URLs", () => {
  const document = { decisions: [{ decision_id: "x", subject: "x", reason: "対象とする理由の説明", decided_at: "2026-11-01", source_urls: [] }] };
  assert.notDeepEqual(validator.validate("scope-decisions", document, "decisions"), []);
});

test("scope decision schema does not record excluded decisions", () => {
  const document = { decisions: [{ decision_id: "x", subject: "x", decision: "excluded", reason: "対象外とする理由の説明", decided_at: "2026-11-01", source_urls: ["https://example.com/x"] }] };
  assert.notDeepEqual(validator.validate("scope-decisions", document, "decisions"), []);
});
