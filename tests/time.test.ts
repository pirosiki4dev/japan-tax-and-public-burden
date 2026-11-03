import assert from "node:assert/strict";
import { test } from "node:test";
import { formatJst } from "../src/domain/time.ts";

test("dates are formatted in JST with a +09:00 offset", () => {
  assert.equal(formatJst(new Date("2026-11-03T03:22:26.789Z")), "2026-11-03T12:22:26+09:00");
  assert.equal(formatJst(new Date("2026-12-31T15:00:00Z")), "2027-01-01T00:00:00+09:00");
});
