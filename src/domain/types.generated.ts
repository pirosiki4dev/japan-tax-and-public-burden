// このファイルは schemas/ から生成する。手で編集せず `npm run types:generate` を実行する。


/**
 * 英小文字・数字のkebab-caseによる永続ID。一度公開したIDは変更しない。
 */
export type KebabId = string
export type BurdenCategory = ("national_tax" | "local_tax" | "social_insurance" | "other_public_burden")
export type LevyingBodyType = ("national" | "prefecture" | "municipality" | "insurer")
/**
 * e-Gov法令ID（例: 363AC0000000108）。
 */
export type LawId = string
export type DescribedItem = (KnownItem | UnknownValue)
export type BurdenStatus = ("active" | "promulgated_not_effective" | "abolished")
/**
 * 根拠とした公式一次情報のURL。
 */
export type SourceUrl = string
/**
 * タイムゾーン付きのISO 8601日時。
 */
export type DateTime = string
export type DateValue = (KnownDate | UnknownValue)
export type IsoDate = string
export type Rate = ({
rate_id: KebabId
kind: RateKind
role: RateRole
value?: number
unit: RateUnit
/**
 * 従量の基準となる数量（原文の表記。例: 1キロリットル）。
 */
per?: string
/**
 * 累進区分の境界の単位。
 */
bracket_unit?: "yen"
/**
 * @minItems 1
 */
brackets?: [RateBracket, ...(RateBracket)[]]
applies_to: DescribedItem
/**
 * @minItems 1
 */
shares?: [RateShare, ...(RateShare)[]]
legal_basis: LegalReference
raw_text: string
} & {
rate_id: KebabId
kind: RateKind
role: RateRole
value?: number
unit: RateUnit
/**
 * 従量の基準となる数量（原文の表記。例: 1キロリットル）。
 */
per?: string
/**
 * 累進区分の境界の単位。
 */
bracket_unit?: "yen"
/**
 * @minItems 1
 */
brackets?: [RateBracket, ...(RateBracket)[]]
applies_to: DescribedItem
/**
 * @minItems 1
 */
shares?: [RateShare, ...(RateShare)[]]
legal_basis: LegalReference
raw_text: string
})
/**
 * proportional: 比例、progressive: 累進、fixed_amount: 定額、per_unit: 従量。
 */
export type RateKind = ("proportional" | "progressive" | "fixed_amount" | "per_unit")
/**
 * statutory: 法定、standard: 標準税率、limit: 制限税率、reduced: 軽減。
 */
export type RateRole = ("statutory" | "standard" | "limit" | "reduced")
/**
 * valueの単位。percentは100分率（10は10%）。
 */
export type RateUnit = ("percent" | "per_mille" | "yen")
export type ScopeDecisionResult = ("included" | "excluded")

export interface RepositorySchemas {
burden?: Burden
versions?: BurdenVersions
"legal-source"?: LegalSource
"scope-decisions"?: ScopeDecisions
sources?: SourceRegistry
}
/**
 * 制度（data/burdens/<burden-id>/burden.yaml）。レベル1・2の情報を持つ。
 */
export interface Burden {
burden_id: KebabId
name: string
category: BurdenCategory
levying_body_type: LevyingBodyType
/**
 * @minItems 1
 */
legal_bases: [LegalReference, ...(LegalReference)[]]
/**
 * 納税義務者・負担者。
 * 
 * @minItems 1
 */
liable_parties: [DescribedItem, ...(DescribedItem)[]]
/**
 * 課税対象・負担の対象。
 * 
 * @minItems 1
 */
taxable_objects: [DescribedItem, ...(DescribedItem)[]]
/**
 * 課税標準・算定基礎。
 * 
 * @minItems 1
 */
tax_base: [DescribedItem, ...(DescribedItem)[]]
status: BurdenStatus
source_url: SourceUrl
checked_at: DateTime
}
/**
 * 根拠法令と条項。条項は原文の表記で記録する。
 */
export interface LegalReference {
law_id: LawId
article?: string
}
/**
 * 要約と、必要に応じて原文・根拠条項を持つ説明項目。
 */
export interface KnownItem {
summary: string
raw_text?: string
legal_basis?: LegalReference
}
/**
 * 公式情報で確認できない値。推測で補完せず、根拠不足の理由を記録する。
 */
export interface UnknownValue {
unknown: true
reason: string
}
/**
 * 版（data/burdens/<burden-id>/versions.yaml）。率・金額が変わるごとに版を追加する。
 */
export interface BurdenVersions {
burden_id: KebabId
/**
 * @minItems 1
 */
versions: [BurdenVersion, ...(BurdenVersion)[]]
}
export interface BurdenVersion {
version_id: KebabId
dates: VersionDates
/**
 * @minItems 1
 */
rates: [Rate, ...(Rate)[]]
source_url: SourceUrl
checked_at: DateTime
}
/**
 * 公布日、施行日、適用開始日、徴収開始日を個別に持つ。適用終了日は終了が定まっている場合だけ持つ。
 */
export interface VersionDates {
promulgation: DateValue
enforcement: DateValue
application_start: DateValue
collection_start: DateValue
application_end?: DateValue
}
/**
 * 原文（和暦等）と正規化した日付。
 */
export interface KnownDate {
raw: string
value: IsoDate
}
/**
 * 累進の区分。upperがnullの区分は上限なし。
 */
export interface RateBracket {
lower: number
upper: (number | null)
value: number
}
/**
 * 負担割合（本人・事業主・国庫等）。ratioは0より大きく1以下。
 */
export interface RateShare {
party: string
ratio: number
}
/**
 * 根拠法令（data/legal-sources/<law-id>.yaml）。監視対象の一覧を兼ねる。
 */
export interface LegalSource {
law_id: LawId
title: string
/**
 * 法令番号の原文（例: 昭和六十三年法律第百八号）。
 */
law_number_raw?: string
/**
 * 人がマスタへの反映を確認した最新の改正版のID（e-Gov法令APIの改正版ID）。
 */
reviewed_revision_id: string
reviewed_at: DateTime
source_url: SourceUrl
}
/**
 * 対象・対象外の個別判断の記録（data/scope-decisions.yaml）。
 */
export interface ScopeDecisions {
decisions: ScopeDecision[]
}
export interface ScopeDecision {
decision_id: KebabId
subject: string
decision: ScopeDecisionResult
reason: string
decided_at: IsoDate
burden_id?: KebabId
source_urls?: SourceUrl[]
}
/**
 * 巡回する公式サイトの一覧（config/sources.yaml）。巡回URLはこのファイルだけに置く。
 */
export interface SourceRegistry {
sources: Source[]
}
export interface Source {
source_id: KebabId
name: string
base_url: SourceUrl
rate_limit: string
enabled: boolean
}
