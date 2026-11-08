import type { Burden, LegalSource } from "../../domain/types.generated.ts";
import { MonitorFailure, type FailureKind } from "../http.ts";
import type { EgovClient, RevisionSummary } from "./client.ts";
import { headIdentity, indexOfIdentity, locate, normalizedText, withHeadIndex, type LawNode } from "./law-text.ts";

/** 条項を参照している負担項目の版。 */
export interface ProvisionUser {
  burden_id: string;
  name: string;
  version_id: string;
}

/**
 * 登録済みの条項（provisions の law_id と elm）を、確認済みの版と現在施行中の版で照合した結果。
 * - unchanged: 本文が同じ
 * - changed: 本文が変わった
 * - shifted: 出現順の番号で指す附則・別表の番号がずれた（newElm が新しい版での指定）
 * - missing: 現在施行中の版に見つからない
 * - not_in_reviewed: 確認済みの版に見つからない（登録時の誤りの可能性）
 * - not_compared: 確認済みの版の全文を取得できず、照合していない
 */
export type ProvisionStatus = "unchanged" | "changed" | "shifted" | "missing" | "not_in_reviewed" | "not_compared";

export interface ProvisionCheck {
  elm: string;
  status: ProvisionStatus;
  /** shifted のとき、現在施行中の版で同じ附則・別表を指す elm */
  newElm?: string;
  /** shifted のとき、番号を付け替えた要素の本文が変わったか */
  textChanged?: boolean;
  users: ProvisionUser[];
}

export type LawCheck =
  | { kind: "unchanged"; source: LegalSource; current: RevisionSummary }
  | { kind: "revised"; source: LegalSource; current: RevisionSummary; reviewedFound: boolean; newer: RevisionSummary[]; reviewedTextAvailable: boolean; provisions: ProvisionCheck[] }
  | { kind: "failed"; source: LegalSource; failure: { kind: FailureKind; url: string; message: string } };

/** 法令ごとに、登録済みの条項の elm と、それを参照する負担項目の版を集める。 */
export function provisionUsers(burdens: Burden[]): Map<string, Map<string, ProvisionUser[]>> {
  const byLaw = new Map<string, Map<string, ProvisionUser[]>>();
  for (const burden of burdens) {
    for (const version of burden.versions) {
      for (const provision of version.provisions) {
        const byElm = byLaw.get(provision.law_id) ?? new Map<string, ProvisionUser[]>();
        byLaw.set(provision.law_id, byElm);
        const users = byElm.get(provision.elm) ?? [];
        byElm.set(provision.elm, users);
        if (!users.some((user) => user.version_id === version.version_id)) users.push({ burden_id: burden.burden_id, name: burden.name, version_id: version.version_id });
      }
    }
  }
  return byLaw;
}

/** 1つの条項を2つの版で照合する。 */
export function compareProvision(reviewed: LawNode | undefined, current: LawNode, elm: string): Omit<ProvisionCheck, "users"> {
  if (!reviewed) return { elm, status: locate(current, elm) ? "not_compared" : "missing" };
  const before = locate(reviewed, elm);
  if (!before) return { elm, status: "not_in_reviewed" };
  const reviewedHead = headIdentity(reviewed, elm);
  if (reviewedHead && headIdentity(current, elm)?.identity !== reviewedHead.identity) {
    const index = indexOfIdentity(current, reviewedHead.tag, reviewedHead.identity);
    if (index === undefined) return { elm, status: "missing" };
    const newElm = withHeadIndex(elm, index);
    const after = locate(current, newElm);
    if (!after) return { elm, status: "missing" };
    return { elm, status: "shifted", newElm, textChanged: normalizedText(after) !== normalizedText(before) };
  }
  const after = locate(current, elm);
  if (!after) return { elm, status: "missing" };
  return { elm, status: normalizedText(after) === normalizedText(before) ? "unchanged" : "changed" };
}

/** 確認済みの版より新しく、現在施行中の版までの改正版（古い順）。 */
function newerRevisions(revisions: RevisionSummary[], reviewedId: string, currentId: string): { found: boolean; newer: RevisionSummary[] } {
  const oldestFirst = [...revisions].reverse();
  const currentAt = oldestFirst.findIndex((revision) => revision.law_revision_id === currentId);
  const reviewedAt = oldestFirst.findIndex((revision) => revision.law_revision_id === reviewedId);
  if (reviewedAt < 0) return { found: false, newer: [oldestFirst[currentAt]!] };
  return { found: true, newer: oldestFirst.slice(reviewedAt + 1, currentAt + 1) };
}

/** 1つの法令について、現在施行中の版と確認済みの版を比べ、改正があれば登録済みの条項を照合する。 */
export async function checkLaw(client: EgovClient, source: LegalSource, users: Map<string, ProvisionUser[]>): Promise<LawCheck> {
  try {
    const revisions = await client.revisions(source.law_id);
    const currents = revisions.filter((revision) => revision.current_revision_status === "CurrentEnforced");
    if (currents.length !== 1) {
      throw new MonitorFailure("unexpected_format", client.revisionsUrl(source.law_id), `現在施行中（current_revision_status: CurrentEnforced）の改正版が${currents.length}件ある（1件を想定）`);
    }
    const current = currents[0]!;
    if (current.law_revision_id === source.reviewed_revision_id) return { kind: "unchanged", source, current };
    const { found, newer } = newerRevisions(revisions, source.reviewed_revision_id, current.law_revision_id);
    const provisions: ProvisionCheck[] = [];
    let reviewedTextAvailable = false;
    if (users.size > 0) {
      const currentText = await client.fullText(current.law_revision_id);
      if (!currentText) throw new MonitorFailure("fetch_failed", client.lawDataUrl(current.law_revision_id), "現在施行中の版の全文が見つからない（HTTP 404）");
      const reviewedText = await client.fullText(source.reviewed_revision_id);
      reviewedTextAvailable = reviewedText !== undefined;
      for (const [elm, elmUsers] of [...users].sort(([a], [b]) => a.localeCompare(b))) {
        provisions.push({ ...compareProvision(reviewedText, currentText, elm), users: elmUsers });
      }
    }
    return { kind: "revised", source, current, reviewedFound: found, newer, reviewedTextAvailable, provisions };
  } catch (error) {
    if (error instanceof MonitorFailure) return { kind: "failed", source, failure: { kind: error.kind, url: error.url, message: error.message } };
    throw error;
  }
}
