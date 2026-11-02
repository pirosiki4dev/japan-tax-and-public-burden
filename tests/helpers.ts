import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SCHEMA_DIR = join(ROOT, "schemas");
export const VALID_REPO = join(ROOT, "tests/fixtures/valid-repo");

export async function readFixture<T>(relativePath: string): Promise<T> {
  return parse(await readFile(join(VALID_REPO, relativePath), "utf8")) as T;
}

/** 正常なfixtureを一時ディレクトリへ複製し、指定したファイルだけ書き換える。 */
export async function copyRepository(overrides: Record<string, unknown> = {}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "jtpb-"));
  await cp(VALID_REPO, directory, { recursive: true });
  for (const [path, value] of Object.entries(overrides)) {
    await writeFile(join(directory, path), typeof value === "string" ? value : stringify(value), "utf8");
  }
  return directory;
}
