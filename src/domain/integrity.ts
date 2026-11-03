import type { BurdenCategory, BurdenGroup, BurdenVersion, DescribedItem, LegalReference, ProvisionRole } from "./types.generated.ts";
import type { Findings, RepositoryData } from "./repository.ts";
import { deriveStatus, versionEnd, versionStart } from "./status.ts";

/** burden_id の接頭辞と区分の対応。 */
export const CATEGORY_PREFIX: Readonly<Record<BurdenCategory, string>> = {
  national_tax: "nt",
  local_tax: "lt",
  social_insurance: "si",
  other_public_burden: "ot"
};

/** 値の決まり方ごとに、監視する条項として最低限必要な役割（いずれか1つ）。 */
const BURDENS_FILE = "data/burdens.yaml";
const LEGAL_SOURCES_FILE = "data/legal-sources.yaml";

const REQUIRED_PROVISION_ROLES: Readonly<Record<BurdenVersion["determination"], readonly ProvisionRole[]>> = {
  stated: ["value"],
  calculated: ["formula"],
  published: ["formula", "delegation"]
};

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const found = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) found.add(value);
    seen.add(value);
  }
  return [...found].sort();
}

/** 一覧がキーの昇順に並んでいることを検査する。 */
function checkSorted(keys: readonly string[], file: string, key: string, errors: string[]): void {
  keys.forEach((value, index) => {
    const previous = keys[index - 1];
    if (previous !== undefined && previous > value) errors.push(`${file}: ${value} must come after ${previous} (sort by ${key})`);
  });
}

function itemReferences(items: readonly DescribedItem[]): LegalReference[] {
  return items.flatMap((item) => ("legal_basis" in item && item.legal_basis ? [item.legal_basis] : []));
}

function checkGroups(groups: readonly BurdenGroup[], errors: string[]): Map<string, BurdenGroup> {
  const byId = new Map(groups.map((group) => [group.group_id, group]));
  for (const groupId of duplicates(groups.map((group) => group.group_id))) errors.push(`data/groups.yaml: duplicate group_id ${groupId}`);
  for (const group of groups) {
    if (group.parent_group_id === undefined) continue;
    if (!byId.has(group.parent_group_id)) {
      errors.push(`data/groups.yaml ${group.group_id}: unknown parent_group_id ${group.parent_group_id}`);
      continue;
    }
    const visited = new Set([group.group_id]);
    let parent = byId.get(group.parent_group_id);
    while (parent) {
      if (visited.has(parent.group_id)) {
        errors.push(`data/groups.yaml ${group.group_id}: parent_group_id forms a cycle`);
        break;
      }
      visited.add(parent.group_id);
      parent = parent.parent_group_id === undefined ? undefined : byId.get(parent.parent_group_id);
    }
  }
  return byId;
}

/**
 * Schemaでは表せない正本間の整合性を検査する。
 * asOf は状態の導出に使う基準日（YYYY-MM-DD）。
 */
export function checkIntegrity(data: RepositoryData, { asOf }: { asOf: string }): Findings {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lawIds = new Set(data.legalSources.map((source) => source.law_id));
  const referencedLaws = new Set<string>();
  const requireLaw = (reference: { law_id: string }, location: string): void => {
    referencedLaws.add(reference.law_id);
    if (!lawIds.has(reference.law_id)) errors.push(`${location}: unknown law_id ${reference.law_id} (add it to ${LEGAL_SOURCES_FILE})`);
  };

  const sourceLawIds = data.legalSources.map((source) => source.law_id);
  for (const lawId of duplicates(sourceLawIds)) errors.push(`${LEGAL_SOURCES_FILE}: duplicate law_id ${lawId}`);
  checkSorted(sourceLawIds, LEGAL_SOURCES_FILE, "law_id", errors);

  const groups = checkGroups(data.groups.groups, errors);
  const usedGroups = new Set<string>();
  const burdenIds = new Set(data.burdens.map((burden) => burden.burden_id));

  for (const burdenId of duplicates(data.burdens.map((burden) => burden.burden_id))) errors.push(`${BURDENS_FILE}: duplicate burden_id ${burdenId}`);
  checkSorted(data.burdens.map((burden) => burden.burden_id), BURDENS_FILE, "burden_id", errors);

  const versionIds: string[] = [];
  for (const burden of data.burdens) {
    const base = `${BURDENS_FILE} ${burden.burden_id}`;
    const prefix = CATEGORY_PREFIX[burden.category];
    if (!burden.burden_id.startsWith(`${prefix}-`)) errors.push(`${base}: burden_id must start with ${prefix}- for category ${burden.category}`);

    for (const groupId of burden.groups) {
      usedGroups.add(groupId);
      const group = groups.get(groupId);
      if (!group) errors.push(`${base}: unknown group ${groupId}`);
      else if (group.aggregation === "progressive" && burden.versions.some((version) => version.rate.bracket === undefined)) errors.push(`${base}: every version must have rate.bracket because group ${groupId} is progressive`);
    }
    for (const predecessor of burden.predecessors ?? []) {
      if (predecessor === burden.burden_id) errors.push(`${base}: predecessors must not include itself`);
      else if (!burdenIds.has(predecessor)) errors.push(`${base}: unknown predecessor ${predecessor}`);
    }

    burden.legal_bases.forEach((reference, index) => requireLaw(reference, `${base} legal_bases[${index}]`));
    for (const reference of itemReferences([...burden.liable_parties, ...burden.taxable_objects, ...burden.tax_base])) requireLaw(reference, base);

    for (const version of burden.versions) {
      const location = `${base} ${version.version_id}`;
      versionIds.push(version.version_id);
      const { promulgation, enforcement } = version.dates;
      if ("value" in promulgation && "value" in enforcement && promulgation.value > enforcement.value) errors.push(`${location}: promulgation must not be after enforcement`);
      const start = versionStart(version);
      const end = versionEnd(version);
      if (start !== undefined && end !== undefined && start > end) errors.push(`${location}: application_start must not be after application_end`);

      const { bracket } = version.rate;
      if (bracket && bracket.upper !== null && bracket.upper <= bracket.lower) errors.push(`${location}: bracket upper must be greater than lower`);
      for (const reference of itemReferences([version.rate.applies_to])) requireLaw(reference, location);

      version.provisions.forEach((provision, index) => requireLaw(provision, `${location} provisions[${index}]`));
      for (const key of duplicates(version.provisions.map((provision) => `${provision.law_id} ${provision.elm}`))) errors.push(`${location}: duplicate provision ${key}`);
      const required = REQUIRED_PROVISION_ROLES[version.determination];
      if (!version.provisions.some((provision) => required.includes(provision.role))) errors.push(`${location}: determination ${version.determination} requires a provision with role ${required.join(" or ")}`);
    }

    const derived = deriveStatus(burden.versions, asOf);
    if (derived === undefined) warnings.push(`${base}: status cannot be derived from version dates as of ${asOf}`);
    else if (derived !== burden.status) warnings.push(`${base}: status ${burden.status} differs from ${derived} derived as of ${asOf}`);
  }
  for (const versionId of duplicates(versionIds)) errors.push(`version_id: duplicate ${versionId}`);

  for (const group of data.groups.groups) {
    if (group.parent_group_id !== undefined) usedGroups.add(group.parent_group_id);
  }
  for (const group of data.groups.groups) {
    if (!usedGroups.has(group.group_id)) warnings.push(`data/groups.yaml ${group.group_id}: no burden or child group belongs to this group`);
  }
  for (const { law_id: lawId } of data.legalSources) {
    if (!referencedLaws.has(lawId)) warnings.push(`${LEGAL_SOURCES_FILE} ${lawId}: not referenced by any burden`);
  }

  for (const decisionId of duplicates(data.scopeDecisions.decisions.map((decision) => decision.decision_id))) errors.push(`data/scope-decisions.yaml: duplicate decision_id ${decisionId}`);
  for (const decision of data.scopeDecisions.decisions) {
    if (decision.burden_id && !burdenIds.has(decision.burden_id)) errors.push(`data/scope-decisions.yaml ${decision.decision_id}: unknown burden_id ${decision.burden_id}`);
  }
  for (const sourceId of duplicates(data.sources.sources.map((source) => source.source_id))) errors.push(`config/sources.yaml: duplicate source_id ${sourceId}`);

  return { errors, warnings };
}
