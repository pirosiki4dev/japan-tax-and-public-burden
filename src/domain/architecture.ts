/** src/ 直下のディレクトリを層とし、依存してよい層を定める（ADR 0003）。 */
export const LAYERS = ["cli", "monitor", "build", "data", "domain"] as const;
export type Layer = (typeof LAYERS)[number];

const ALLOWED: Record<Layer, readonly Layer[]> = {
  cli: ["cli", "monitor", "build", "data", "domain"],
  monitor: ["monitor", "data", "domain"],
  build: ["build", "data", "domain"],
  data: ["data", "domain"],
  domain: ["domain"]
};

export interface ImportViolation {
  file: string;
  specifier: string;
  rule: string;
}

/** "src/<layer>/..." 形式のパスから層を求める。 */
export function layerOf(path: string): Layer | undefined {
  const match = /^src\/([^/]+)\//.exec(path);
  return LAYERS.find((layer) => layer === match?.[1]);
}

export function parseImports(source: string): string[] {
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^"'();]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1] ?? ""));
}

/** 相対パスを src からのパスへ解決する（node:path を使わない純粋な実装）。 */
export function resolveRelative(fromFile: string, specifier: string): string {
  const parts = fromFile.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

export function checkFileImports(file: string, source: string): ImportViolation[] {
  const fromLayer = layerOf(file);
  if (!fromLayer) return [{ file, specifier: "", rule: "file_outside_layers" }];
  const violations: ImportViolation[] = [];
  for (const specifier of parseImports(source)) {
    if (specifier.startsWith(".")) {
      const target = resolveRelative(file, specifier);
      const toLayer = layerOf(target);
      if (!toLayer) violations.push({ file, specifier, rule: "import_outside_layers" });
      else if (!ALLOWED[fromLayer].includes(toLayer)) violations.push({ file, specifier, rule: `${fromLayer}_must_not_depend_on_${toLayer}` });
    } else if (fromLayer === "domain") {
      violations.push({ file, specifier, rule: specifier.startsWith("node:") ? "domain_must_not_use_node_io" : "domain_must_not_use_packages" });
    }
  }
  return violations;
}
