import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compile, type JSONSchema } from "json-schema-to-typescript";
import { SURVEY_DIR } from "./paths.ts";

export const SURVEY_SCHEMA_NAMES = ["conditions", "candidates", "judgments"] as const;
export type SurveySchemaName = (typeof SURVEY_SCHEMA_NAMES)[number];

const OUTPUT = join(SURVEY_DIR, "src/types.generated.ts");
const BANNER = "// このファイルは surveys/first-release-scope/schemas/ から生成する。手で編集せず `node surveys/first-release-scope/src/generate-types.ts` を実行する。\n";

/** 調査のSchemaからTypeScriptの型を生成する。 */
export async function generateSurveyTypes(): Promise<string> {
  const wrapper: JSONSchema = {
    title: "SurveySchemas",
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(SURVEY_SCHEMA_NAMES.map((name) => [name, { $ref: `${name}.schema.json` }]))
  };
  return compile(wrapper, "SurveySchemas", { cwd: `${join(SURVEY_DIR, "schemas")}/`, declareExternallyReferenced: true, additionalProperties: false, bannerComment: BANNER, format: false });
}

export async function readGeneratedTypes(): Promise<string> {
  return readFile(OUTPUT, "utf8").catch(() => "");
}

if (import.meta.main) {
  await writeFile(OUTPUT, await generateSurveyTypes(), "utf8");
  console.log(JSON.stringify({ status: "generated", output: "surveys/first-release-scope/src/types.generated.ts" }));
}
