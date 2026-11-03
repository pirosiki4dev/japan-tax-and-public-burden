import { fileURLToPath } from "node:url";

/** この調査のディレクトリ（surveys/first-release-scope/）。 */
export const SURVEY_DIR = fileURLToPath(new URL("..", import.meta.url));
/** リポジトリのルートディレクトリ。 */
export const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
