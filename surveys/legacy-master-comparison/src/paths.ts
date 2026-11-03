import { fileURLToPath } from "node:url";

/** この調査のディレクトリ（surveys/legacy-master-comparison/）。 */
export const SURVEY_DIR = fileURLToPath(new URL("..", import.meta.url));
/** リポジトリのルートディレクトリ。 */
export const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
/** 比較の対象とする旧版のタグ。 */
export const LEGACY_TAG = "legacy-v0";
