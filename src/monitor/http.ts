/**
 * 監視の各取得先（e-Gov法令API、GitHub API）で共通に使うHTTPの型。
 * 取得先ごとの処理は、取得先ごとのファイル（egov.ts、github.ts）に置く。
 */

/** fetch と同じ形の関数。テストでは保存した応答を返す関数に差し替える。 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
