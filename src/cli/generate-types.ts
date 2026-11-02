import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { compile, type JSONSchema } from "json-schema-to-typescript";
import { SCHEMA_NAMES } from "../data/schema.ts";
import { REPOSITORY_ROOT, runMain } from "./args.ts";

const OUTPUT = join(REPOSITORY_ROOT, "src/domain/types.generated.ts");
const BANNER = "// このファイルは schemas/ から生成する。手で編集せず `npm run types:generate` を実行する。\n";

async function generateTypes(): Promise<string> {
  const wrapper: JSONSchema = {
    title: "RepositorySchemas",
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(SCHEMA_NAMES.map((name) => [name, { $ref: `${name}.schema.json` }]))
  };
  return compile(wrapper, "RepositorySchemas", {
    cwd: `${join(REPOSITORY_ROOT, "schemas")}/`,
    declareExternallyReferenced: true,
    additionalProperties: false,
    bannerComment: BANNER,
    format: false
  });
}

runMain(async () => {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  const generated = await generateTypes();
  if (values.check) {
    const current = await readFile(OUTPUT, "utf8").catch(() => "");
    if (current !== generated) {
      console.error("src/domain/types.generated.ts is out of date. Run `npm run types:generate`.");
      return 1;
    }
    console.log(JSON.stringify({ status: "clean" }));
    return 0;
  }
  await writeFile(OUTPUT, generated, "utf8");
  console.log(JSON.stringify({ status: "generated", output: "src/domain/types.generated.ts" }));
  return 0;
});
