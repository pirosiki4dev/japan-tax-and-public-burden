import type { Burden, BurdenGroups, LegalSource, ScopeDecisions, SourceRegistry } from "./types.generated.ts";

/** Schema検証を通った正本と設定の全体。 */
export interface RepositoryData {
  burdens: Burden[];
  groups: BurdenGroups;
  legalSources: LegalSource[];
  scopeDecisions: ScopeDecisions;
  sources: SourceRegistry;
}

export interface Findings {
  errors: string[];
  warnings: string[];
}
