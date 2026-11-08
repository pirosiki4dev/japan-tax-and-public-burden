import type { Burden, BurdenGroups, LegalSource, PublishedDocument, ScopeDecisions, SourceRegistry } from "./types.generated.ts";

/** Schema検証を通った正本と設定の全体。 */
export interface RepositoryData {
  burdens: Burden[];
  groups: BurdenGroups;
  legalSources: LegalSource[];
  /** data/legal-sources.yaml の published_documents（公表ページごとの最新の資料） */
  publishedDocuments: PublishedDocument[];
  scopeDecisions: ScopeDecisions;
  sources: SourceRegistry;
}

export interface Findings {
  errors: string[];
  warnings: string[];
}
