import type { RepositoryData } from "../domain/repository.ts";
import type { Source } from "../domain/types.generated.ts";
import type { Fetcher } from "./http.ts";
import type { PlannedIssue } from "./issues.ts";

/** 巡回先の監視に渡す共通の値。 */
export interface MonitorContext {
  data: RepositoryData;
  detectedAt: string;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  /** e-Gov法令APIの監視で、この law_id の法令だけを監視する */
  lawIds?: string[];
  log?: (message: string) => void;
}

/** 1つの巡回先の監視の結果。summary は件数の内訳（表示用）。 */
export interface SourceResult {
  planned: PlannedIssue[];
  summary: Record<string, number>;
}

/** 巡回先ごとの監視の処理。取得方式は巡回先ごとに異なるため、巡回先ごとのディレクトリに実装する（ADR 0003）。 */
export type SourceMonitor = (source: Source, context: MonitorContext) => Promise<SourceResult>;
