import { fileURLToPath } from "node:url";

/** リポジトリのルートディレクトリ。 */
export const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 日本時間の今日の日付（YYYY-MM-DD）。 */
export function todayInJapan(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

/** CLIの本体を実行し、例外を終了コード1に変換する。 */
export function runMain(main: () => Promise<number>): void {
  main().then(
    (code) => { process.exitCode = code; },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  );
}
