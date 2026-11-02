import type { BurdenStatus, BurdenVersion, DateValue } from "./types.generated.ts";

function knownDate(value: DateValue | undefined): string | undefined {
  return value && "value" in value ? value.value : undefined;
}

/** 版の開始日。適用開始日を優先し、不明なら施行日を使う。 */
export function versionStart(version: BurdenVersion): string | undefined {
  return knownDate(version.dates.application_start) ?? knownDate(version.dates.enforcement);
}

export function versionEnd(version: BurdenVersion): string | undefined {
  return knownDate(version.dates.application_end);
}

/**
 * 版の日付と基準日（YYYY-MM-DD）から制度の状態を導出する。
 * 開始日が不明な版があり状態を決められない場合は undefined を返す。
 */
export function deriveStatus(versions: readonly BurdenVersion[], asOf: string): BurdenStatus | undefined {
  let hasUnknownStart = false;
  let hasFuture = false;
  let allEnded = versions.length > 0;
  for (const version of versions) {
    const start = versionStart(version);
    const end = versionEnd(version);
    if (start === undefined) {
      hasUnknownStart = true;
      allEnded = false;
      continue;
    }
    if (start <= asOf && (end === undefined || end >= asOf)) return "active";
    if (start > asOf) hasFuture = true;
    if (end === undefined || end >= asOf) allEnded = false;
  }
  if (hasUnknownStart) return undefined;
  if (hasFuture) return "promulgated_not_effective";
  if (allEnded) return "abolished";
  return undefined;
}
