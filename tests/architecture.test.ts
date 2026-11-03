import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFileImports, layerOf, parseImports, resolveRelative } from "../src/domain/architecture.ts";

test("layers are taken from the first directory under src", () => {
  assert.equal(layerOf("src/domain/status.ts"), "domain");
  assert.equal(layerOf("src/cli/validate.ts"), "cli");
  assert.equal(layerOf("src/other/x.ts"), undefined);
});

test("imports are parsed from static, type-only, re-export and dynamic forms", () => {
  const source = [
    'import { a } from "./a.ts";',
    'import type { B } from "../domain/b.ts";',
    'export * from "./c.ts";',
    'export type { D } from "./d.ts";',
    'const e = await import("./e.ts");',
    'import "./f.ts";'
  ].join("\n");
  assert.deepEqual(parseImports(source).sort(), ["../domain/b.ts", "./a.ts", "./c.ts", "./d.ts", "./e.ts", "./f.ts"]);
});

test("relative specifiers resolve against the importing file", () => {
  assert.equal(resolveRelative("src/cli/validate.ts", "../data/repository.ts"), "src/data/repository.ts");
});

test("allowed dependencies pass", () => {
  assert.deepEqual(checkFileImports("src/cli/x.ts", 'import "../data/y.ts"; import "node:fs";'), []);
  assert.deepEqual(checkFileImports("src/data/x.ts", 'import "../domain/y.ts"; import "yaml";'), []);
  assert.deepEqual(checkFileImports("src/survey/x.ts", 'import "../data/y.ts"; import "../domain/z.ts";'), []);
  assert.deepEqual(checkFileImports("src/domain/x.ts", 'import type { T } from "./types.generated.ts";'), []);
});

test("forbidden dependencies are reported", () => {
  assert.deepEqual(checkFileImports("src/domain/x.ts", 'import "../data/y.ts";').map(({ rule }) => rule), ["domain_must_not_depend_on_data"]);
  assert.deepEqual(checkFileImports("src/domain/x.ts", 'import "node:fs";').map(({ rule }) => rule), ["domain_must_not_use_node_io"]);
  assert.deepEqual(checkFileImports("src/domain/x.ts", 'import "yaml";').map(({ rule }) => rule), ["domain_must_not_use_packages"]);
  assert.deepEqual(checkFileImports("src/data/x.ts", 'import "../cli/y.ts";').map(({ rule }) => rule), ["data_must_not_depend_on_cli"]);
  assert.deepEqual(checkFileImports("src/build/x.ts", 'import "../monitor/y.ts";').map(({ rule }) => rule), ["build_must_not_depend_on_monitor"]);
});
