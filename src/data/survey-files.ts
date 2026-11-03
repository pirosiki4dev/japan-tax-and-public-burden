import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import type { SourceRegistry, SurveyCandidates, SurveyConditions, SurveyJudgments } from "../domain/types.generated.ts";
import { createSchemaValidator, type SchemaName } from "./schema.ts";

/** docs/surveys/<survey-id>/ の各ファイルのパス。 */
export function surveyPaths(root: string, surveyId: string) {
  const directory = join(root, "docs/surveys", surveyId);
  return {
    directory,
    conditions: join(directory, "conditions.yaml"),
    candidates: join(directory, "candidates.json"),
    judgments: join(directory, "judgments.yaml")
  };
}

async function loadValidated<T>(path: string, schema: SchemaName, root: string): Promise<T> {
  const document: unknown = path.endsWith(".json") ? JSON.parse(await readFile(path, "utf8")) : parse(await readFile(path, "utf8"), { version: "1.2" });
  const validator = await createSchemaValidator(join(root, "schemas"));
  const errors = validator.validate(schema, document, path);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return document as T;
}

export const loadSurveyConditions = (root: string, surveyId: string) => loadValidated<SurveyConditions>(surveyPaths(root, surveyId).conditions, "survey-conditions", root);
export const loadSurveyCandidates = (root: string, surveyId: string) => loadValidated<SurveyCandidates>(surveyPaths(root, surveyId).candidates, "survey-candidates", root);
export const loadSurveyJudgments = (root: string, surveyId: string) => loadValidated<SurveyJudgments>(surveyPaths(root, surveyId).judgments, "survey-judgments", root);
export const loadSourceRegistry = (root: string) => loadValidated<SourceRegistry>(join(root, "config/sources.yaml"), "sources", root);

/** 抽出結果を決まった書式（2スペースのJSON、末尾改行）の文字列にする。 */
export function formatCandidates(candidates: SurveyCandidates): string {
  return `${JSON.stringify(candidates, null, 2)}\n`;
}
