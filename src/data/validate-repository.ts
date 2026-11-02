import { checkIntegrity } from "../domain/integrity.ts";
import type { Findings } from "../domain/repository.ts";
import { loadRepository } from "./repository.ts";

/** Schema検証と整合性検査をまとめて実行する。 */
export async function validateRepository(root: string, { asOf, schemaDir }: { asOf: string; schemaDir?: string }): Promise<Findings> {
  const { data, errors } = await loadRepository(root, schemaDir);
  const integrity = checkIntegrity(data, { asOf });
  return { errors: [...errors, ...integrity.errors], warnings: integrity.warnings };
}
