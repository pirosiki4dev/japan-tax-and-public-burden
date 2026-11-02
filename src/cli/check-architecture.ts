import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { checkFileImports } from "../domain/architecture.ts";
import { REPOSITORY_ROOT, runMain } from "./args.ts";

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files.sort();
}

runMain(async () => {
  const files = await sourceFiles(join(REPOSITORY_ROOT, "src"));
  const violations = [];
  for (const path of files) {
    violations.push(...checkFileImports(relative(REPOSITORY_ROOT, path), await readFile(path, "utf8")));
  }
  for (const violation of violations) console.error(`error: ${violation.file}: ${violation.rule} (${violation.specifier})`);
  console.log(JSON.stringify({ status: violations.length ? "error" : "clean", files: files.length, violations: violations.length }));
  return violations.length ? 1 : 0;
});
