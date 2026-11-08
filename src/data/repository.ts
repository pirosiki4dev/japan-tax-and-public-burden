import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse } from "yaml";
import type { RepositoryData } from "../domain/repository.ts";
import type { Burdens, BurdenGroups, LegalSources, ScopeDecisions, SourceRegistry } from "../domain/types.generated.ts";
import { createSchemaValidator, type SchemaName, type SchemaValidator } from "./schema.ts";

export interface LoadResult {
  data: RepositoryData;
  errors: string[];
}

const IGNORED = new Set([".gitkeep"]);

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (!IGNORED.has(entry.name)) files.push(path);
  }
  return files.sort();
}

/**
 * 正本（data/）と設定（config/）を読み込み、Schemaで検証する。
 * Schema検証に失敗した文書は data に含めず、errors に理由を記録する。
 * 読み込み経路のないファイルもエラーにする。
 */
export async function loadRepository(root: string, schemaDir = join(root, "schemas")): Promise<LoadResult> {
  const validator: SchemaValidator = await createSchemaValidator(schemaDir);
  const errors: string[] = [];
  const handled = new Set<string>();
  const display = (path: string): string => relative(root, path);

  async function load<T>(path: string, schema: SchemaName): Promise<T | undefined> {
    handled.add(path);
    let document: unknown;
    try {
      document = parse(await readFile(path, "utf8"), { version: "1.2" });
    } catch (error) {
      errors.push(`${display(path)}: ${(error as Error).message}`);
      return undefined;
    }
    const schemaErrors = validator.validate(schema, document, display(path));
    errors.push(...schemaErrors);
    return schemaErrors.length === 0 ? (document as T) : undefined;
  }

  const { burdens } = (await load<Burdens>(join(root, "data/burdens.yaml"), "burdens")) ?? { burdens: [] };

  const legal = await load<LegalSources>(join(root, "data/legal-sources.yaml"), "legal-sources");
  const legalSources = legal?.legal_sources ?? [];
  const publishedDocuments = legal?.published_documents ?? [];
  const groups = (await load<BurdenGroups>(join(root, "data/groups.yaml"), "groups")) ?? { groups: [] };
  const scopeDecisions = (await load<ScopeDecisions>(join(root, "data/scope-decisions.yaml"), "scope-decisions")) ?? { decisions: [] };
  const sources = (await load<SourceRegistry>(join(root, "config/sources.yaml"), "sources")) ?? { sources: [] };

  for (const path of [...await listFiles(join(root, "data")), ...await listFiles(join(root, "config"))]) {
    if (!handled.has(path)) errors.push(`${display(path)}: no validation route (unexpected file)`);
  }

  return { data: { burdens, groups, legalSources, publishedDocuments, scopeDecisions, sources }, errors };
}
