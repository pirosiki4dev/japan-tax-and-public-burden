import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { parse } from "yaml";
import { createSchemaValidator } from "../../../src/data/schema.ts";
import type { SourceRegistry } from "../../../src/domain/types.generated.ts";
import type { SurveySchemaName } from "./generate-types.ts";
import { REPOSITORY_ROOT, SURVEY_DIR } from "./paths.ts";
import type { SurveyCandidates, SurveyConditions, SurveyJudgments } from "./types.generated.ts";

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;

export const SURVEY_FILES = {
  conditions: join(SURVEY_DIR, "conditions.yaml"),
  candidates: join(SURVEY_DIR, "candidates.json"),
  judgments: join(SURVEY_DIR, "judgments.yaml")
} as const;

async function surveyValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const schemaDir = join(SURVEY_DIR, "schemas");
  for (const file of (await readdir(schemaDir)).filter((name) => name.endsWith(".schema.json")).sort()) {
    ajv.addSchema(JSON.parse(await readFile(join(schemaDir, file), "utf8")));
  }
  return ajv;
}

async function loadValidated<T>(name: SurveySchemaName): Promise<T> {
  const path = SURVEY_FILES[name];
  const text = await readFile(path, "utf8");
  const document: unknown = path.endsWith(".json") ? JSON.parse(text) : parse(text, { version: "1.2" });
  const validate = (await surveyValidator()).getSchema(`${name}.schema.json`);
  if (!validate) throw new Error(`Schema not found: ${name}.schema.json`);
  if (!validate(document)) throw new Error((validate.errors ?? []).map((error) => `${path}${error.instancePath}: ${error.message}`).join("\n"));
  return document as T;
}

export const loadConditions = () => loadValidated<SurveyConditions>("conditions");
export const loadCandidates = () => loadValidated<SurveyCandidates>("candidates");
export const loadJudgments = () => loadValidated<SurveyJudgments>("judgments");

/** 巡回先の設定（config/sources.yaml）を通常運用のSchemaで検証して読み込む。 */
export async function loadSourceRegistry(): Promise<SourceRegistry> {
  const path = join(REPOSITORY_ROOT, "config/sources.yaml");
  const document: unknown = parse(await readFile(path, "utf8"), { version: "1.2" });
  const errors = (await createSchemaValidator(join(REPOSITORY_ROOT, "schemas"))).validate("sources", document, path);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return document as SourceRegistry;
}

/** 抽出結果を決まった書式（2スペースのJSON、末尾改行）の文字列にする。 */
export function formatCandidates(candidates: SurveyCandidates): string {
  return `${JSON.stringify(candidates, null, 2)}\n`;
}
