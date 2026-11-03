import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildLegacyItems } from "./legacy.ts";
import { LEGACY_TAG, REPOSITORY_ROOT, SURVEY_DIR } from "./paths.ts";

/**
 * 旧版（legacy-v0 タグ）のマスタから比較の対象を取り出し、legacy-items.json に書き出す。
 *   node surveys/legacy-master-comparison/src/extract.ts
 */
const show = (path: string): unknown => JSON.parse(execFileSync("git", ["show", `${LEGACY_TAG}:${path}`], { cwd: REPOSITORY_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const items = buildLegacyItems(show("data/master/canonical.json") as never, show("data/master/initial-import.json") as never);
writeFileSync(join(SURVEY_DIR, "legacy-items.json"), `${JSON.stringify({ source: `${LEGACY_TAG}:data/master/canonical.json, ${LEGACY_TAG}:data/master/initial-import.json`, items }, null, 2)}\n`);
console.log(JSON.stringify({ status: "written", output: "surveys/legacy-master-comparison/legacy-items.json", items: items.length }));
