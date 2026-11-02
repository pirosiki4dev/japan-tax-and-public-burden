import type { Burden, BurdenVersions, LegalSource, ScopeDecisions, SourceRegistry } from "./types.generated.ts";

/** 制度ディレクトリ（data/burdens/<burden-id>/）の内容。 */
export interface BurdenEntry {
  directory: string;
  burden: Burden;
  versions: BurdenVersions;
}

export interface LegalSourceEntry {
  fileStem: string;
  source: LegalSource;
}

/** Schema検証を通った正本と設定の全体。 */
export interface RepositoryData {
  burdens: BurdenEntry[];
  legalSources: LegalSourceEntry[];
  scopeDecisions: ScopeDecisions;
  sources: SourceRegistry;
}

export interface Findings {
  errors: string[];
  warnings: string[];
}
