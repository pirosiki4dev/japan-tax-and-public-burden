const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日時を日本標準時（JST、+09:00）のISO 8601形式（秒単位）にする。 */
export function formatJst(date: Date): string {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS).toISOString();
  return `${shifted.slice(0, 19)}+09:00`;
}
