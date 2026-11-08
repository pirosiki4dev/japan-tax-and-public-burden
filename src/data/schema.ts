import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;

export const SCHEMA_NAMES = ["burdens", "groups", "legal-sources", "published-sources", "scope-decisions", "sources"] as const;
export type SchemaName = (typeof SCHEMA_NAMES)[number];

export interface SchemaValidator {
  validate(schema: SchemaName, document: unknown, location: string): string[];
}

/** schemas/ のJSON Schemaをすべて登録した検証器を作る。 */
export async function createSchemaValidator(schemaDir: string): Promise<SchemaValidator> {
  // strictRequired は if/then 内の required を誤検知するため無効にし、それ以外の strict 検査は維持する。
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  for (const file of (await readdir(schemaDir)).filter((name) => name.endsWith(".schema.json")).sort()) {
    ajv.addSchema(JSON.parse(await readFile(join(schemaDir, file), "utf8")));
  }
  // 対象データがなくてもSchemaの誤りを検出できるよう、すべて先にコンパイルする。
  const compiled = new Map<SchemaName, ValidateFunction>();
  for (const name of SCHEMA_NAMES) {
    const validate = ajv.getSchema(`${name}.schema.json`);
    if (!validate) throw new Error(`Schema not found: schemas/${name}.schema.json`);
    compiled.set(name, validate);
  }
  return {
    validate(schema, document, location) {
      const validate = compiled.get(schema);
      if (!validate) throw new Error(`Unknown schema: ${schema}`);
      if (validate(document)) return [];
      return (validate.errors ?? []).map((error) => `${location}${error.instancePath || "/"}: ${error.message ?? "is invalid"}`);
    }
  };
}
