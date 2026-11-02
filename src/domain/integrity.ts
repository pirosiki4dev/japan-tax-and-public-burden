import type { DescribedItem, LegalReference, Rate, RateBracket } from "./types.generated.ts";
import type { Findings, RepositoryData } from "./repository.ts";
import { deriveStatus, versionEnd, versionStart } from "./status.ts";

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const found = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) found.add(value);
    seen.add(value);
  }
  return [...found].sort();
}

function itemReferences(items: readonly DescribedItem[]): LegalReference[] {
  return items.flatMap((item) => ("legal_basis" in item && item.legal_basis ? [item.legal_basis] : []));
}

function checkBrackets(brackets: readonly RateBracket[], location: string, errors: string[]): void {
  brackets.forEach((bracket, index) => {
    const isLast = index === brackets.length - 1;
    if (bracket.upper === null && !isLast) errors.push(`${location}: only the last bracket may have no upper bound`);
    if (bracket.upper !== null && bracket.upper <= bracket.lower) errors.push(`${location}: bracket ${index} upper must be greater than lower`);
    const previous = brackets[index - 1];
    if (previous && previous.upper !== bracket.lower) errors.push(`${location}: bracket ${index} must start where bracket ${index - 1} ends`);
  });
}

function checkShares(rate: Rate, location: string, errors: string[]): void {
  if (!rate.shares) return;
  const total = rate.shares.reduce((sum, share) => sum + share.ratio, 0);
  if (Math.abs(total - 1) > 1e-9) errors.push(`${location}: share ratios must sum to 1 (got ${total})`);
  for (const party of duplicates(rate.shares.map((share) => share.party))) errors.push(`${location}: duplicate share party ${party}`);
}

/**
 * Schemaでは表せない正本間の整合性を検査する。
 * asOf は状態の導出に使う基準日（YYYY-MM-DD）。
 */
export function checkIntegrity(data: RepositoryData, { asOf }: { asOf: string }): Findings {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lawIds = new Set(data.legalSources.map(({ source }) => source.law_id));
  const referencedLaws = new Set<string>();
  const requireLaw = (reference: LegalReference, location: string): void => {
    referencedLaws.add(reference.law_id);
    if (!lawIds.has(reference.law_id)) errors.push(`${location}: unknown law_id ${reference.law_id} (add data/legal-sources/${reference.law_id}.yaml)`);
  };

  for (const { fileStem, source } of data.legalSources) {
    if (fileStem !== source.law_id) errors.push(`data/legal-sources/${fileStem}.yaml: file name must match law_id ${source.law_id}`);
  }
  for (const lawId of duplicates(data.legalSources.map(({ source }) => source.law_id))) errors.push(`law_id: duplicate ${lawId}`);

  const versionIds: string[] = [];
  for (const { directory, burden, versions } of data.burdens) {
    const base = `data/burdens/${directory}`;
    if (burden.burden_id !== directory) errors.push(`${base}/burden.yaml: burden_id ${burden.burden_id} must match directory name`);
    if (versions.burden_id !== directory) errors.push(`${base}/versions.yaml: burden_id ${versions.burden_id} must match directory name`);
    burden.legal_bases.forEach((reference, index) => requireLaw(reference, `${base}/burden.yaml legal_bases[${index}]`));
    for (const reference of itemReferences([...burden.liable_parties, ...burden.taxable_objects, ...burden.tax_base])) requireLaw(reference, `${base}/burden.yaml`);

    for (const version of versions.versions) {
      const location = `${base}/versions.yaml ${version.version_id}`;
      versionIds.push(version.version_id);
      const { promulgation, enforcement } = version.dates;
      if ("value" in promulgation && "value" in enforcement && promulgation.value > enforcement.value) errors.push(`${location}: promulgation must not be after enforcement`);
      const start = versionStart(version);
      const end = versionEnd(version);
      if (start !== undefined && end !== undefined && start > end) errors.push(`${location}: application_start must not be after application_end`);
      for (const rateId of duplicates(version.rates.map((rate) => rate.rate_id))) errors.push(`${location}: duplicate rate_id ${rateId}`);
      for (const rate of version.rates) {
        const rateLocation = `${location} ${rate.rate_id}`;
        requireLaw(rate.legal_basis, rateLocation);
        for (const reference of itemReferences([rate.applies_to])) requireLaw(reference, rateLocation);
        if (rate.brackets) checkBrackets(rate.brackets, rateLocation, errors);
        checkShares(rate, rateLocation, errors);
      }
    }

    const derived = deriveStatus(versions.versions, asOf);
    if (derived === undefined) warnings.push(`${base}: status cannot be derived from version dates as of ${asOf}`);
    else if (derived !== burden.status) warnings.push(`${base}/burden.yaml: status ${burden.status} differs from ${derived} derived as of ${asOf}`);
  }
  for (const versionId of duplicates(versionIds)) errors.push(`version_id: duplicate ${versionId}`);

  for (const { fileStem } of data.legalSources) {
    if (!referencedLaws.has(fileStem)) warnings.push(`data/legal-sources/${fileStem}.yaml: not referenced by any burden`);
  }

  const burdenIds = new Set(data.burdens.map(({ burden }) => burden.burden_id));
  for (const decisionId of duplicates(data.scopeDecisions.decisions.map((decision) => decision.decision_id))) errors.push(`data/scope-decisions.yaml: duplicate decision_id ${decisionId}`);
  for (const decision of data.scopeDecisions.decisions) {
    if (decision.burden_id && !burdenIds.has(decision.burden_id)) errors.push(`data/scope-decisions.yaml ${decision.decision_id}: unknown burden_id ${decision.burden_id}`);
  }
  for (const sourceId of duplicates(data.sources.sources.map((source) => source.source_id))) errors.push(`config/sources.yaml: duplicate source_id ${sourceId}`);

  return { errors, warnings };
}
