import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveStatus } from "../src/domain/status.ts";
import type { BurdenVersion, DateValue } from "../src/domain/types.generated.ts";

const unknown: DateValue = { unknown: true, reason: "テスト用に日付を不明とする" };
function version(start: string | null, end?: string): BurdenVersion {
  const date = (value: string | null): DateValue => (value ? { raw: value, value } : unknown);
  return {
    version_id: `v-${start ?? "unknown"}`,
    dates: { promulgation: unknown, enforcement: unknown, application_start: date(start), collection_start: unknown, ...(end ? { application_end: date(end) } : {}) },
    rate: { kind: "proportional", role: "statutory", value: 1, unit: "percent", applies_to: { summary: "テスト" }, raw_text: "テスト" },
    determination: "stated",
    provisions: [{ law_id: "999AC0000000001", elm: "MainProvision-Article_1", article: "第一条", role: "value" }],
    source_urls: ["https://example.com/"],
    checked_at: "2026-11-01T00:00:00+09:00"
  };
}

test("a version covering the as-of date is active", () => {
  assert.equal(deriveStatus([version("2020-04-01")], "2026-11-01"), "active");
  assert.equal(deriveStatus([version("2020-04-01", "2026-11-01")], "2026-11-01"), "active");
});

test("only future versions mean promulgated but not effective", () => {
  assert.equal(deriveStatus([version("2027-04-01")], "2026-11-01"), "promulgated_not_effective");
  assert.equal(deriveStatus([version("2020-04-01", "2025-03-31"), version("2027-04-01")], "2026-11-01"), "promulgated_not_effective");
});

test("all ended versions mean abolished", () => {
  assert.equal(deriveStatus([version("2020-04-01", "2025-03-31")], "2026-11-01"), "abolished");
});

test("an unknown start prevents derivation unless another version is active", () => {
  assert.equal(deriveStatus([version(null)], "2026-11-01"), undefined);
  assert.equal(deriveStatus([version(null), version("2020-04-01")], "2026-11-01"), "active");
});

test("the enforcement date is used when the application start is unknown", () => {
  const value = version(null);
  value.dates.enforcement = { raw: "令和二年四月一日", value: "2020-04-01" };
  assert.equal(deriveStatus([value], "2026-11-01"), "active");
});
