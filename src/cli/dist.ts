import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildDistribution, distributionDifferences } from "../build/distribution.ts";
import { loadRepository } from "../data/repository.ts";
import { REPOSITORY_ROOT, runMain } from "./args.ts";

const OUTPUT = join(REPOSITORY_ROOT, "dist");

runMain(async () => {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  const { data, errors } = await loadRepository(REPOSITORY_ROOT);
  if (errors.length > 0) {
    for (const error of errors) console.error(`error: ${error}`);
    console.error("正本の読み込みに失敗したため、配布物を生成しない（`npm run validate` で確認する）。");
    return 1;
  }
  const files = buildDistribution(data);
  if (values.check) {
    const differences = await distributionDifferences(files, OUTPUT);
    for (const difference of differences) console.error(`dist/${difference}`);
    if (differences.length > 0) {
      console.error("dist/ が正本と食い違う。`npm run dist:generate` を実行してコミットする。");
      return 1;
    }
    console.log(JSON.stringify({ status: "clean" }));
    return 0;
  }
  await mkdir(OUTPUT, { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(join(OUTPUT, name), content, "utf8");
  console.log(JSON.stringify({ status: "generated", output: "dist/", files: Object.keys(files) }));
  return 0;
});
