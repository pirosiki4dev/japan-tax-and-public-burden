// このファイルは schemas/ から生成する。手で編集せず `npm run types:generate` を実行する。


/**
 * 負担項目のID。区分の接頭辞（nt: 国税、lt: 地方税、si: 社会保険料、ot: その他の公的負担）と6桁の連番。意味を持たせず、一度使った番号は再利用しない。
 */
export type BurdenId = string
/**
 * burden_idの接頭辞と一致させる（national_tax: nt、local_tax: lt、social_insurance: si、other_public_burden: ot）。
 */
export type BurdenCategory = ("national_tax" | "local_tax" | "social_insurance" | "other_public_burden")
export type LevyingBodyType = ("national" | "prefecture" | "municipality" | "insurer")
/**
 * 英小文字・数字のkebab-caseによる永続ID。一度公開したIDは変更しない。
 */
export type KebabId = string
/**
 * e-Gov法令ID（例: 363AC0000000108）。
 */
export type LawId = string
/**
 * e-Gov法令API v2のelmパラメータで指定する条項の位置（例: MainProvision-Article_89-Paragraph_1、AppdxTable_1）。同名の要素が複数ある場合は、e-Gov法令APIの指定方法に従い出現順の番号を角括弧で付ける（例: 改正法の附則 SupplProvision[2]-Article_63-Paragraph_2-Item_1）。
 */
export type EgovElement = string
export type DescribedItem = (KnownItem | UnknownValue)
export type BurdenVersion = ({
version_id: KebabId
dates: VersionDates
rate: Rate
determination: Determination
formula?: Formula
/**
 * 監視する条項。法律が政令・省令に委任している場合は、委任元と委任先の両方を含める。
 * 
 * @minItems 1
 */
provisions: [Provision, ...(Provision)[]]
source_urls: SourceUrls
checked_at: DateTime
} & {
version_id: KebabId
dates: VersionDates
rate: Rate
determination: Determination
formula?: Formula
/**
 * 監視する条項。法律が政令・省令に委任している場合は、委任元と委任先の両方を含める。
 * 
 * @minItems 1
 */
provisions: [Provision, ...(Provision)[]]
source_urls: SourceUrls
checked_at: DateTime
})
export type DateValue = (KnownDate | UnknownValue)
export type IsoDate = string
export type Rate = {
kind: RateKind
role: RateRole
value: number
unit: RateUnit
/**
 * 従量の基準となる数量（原文の表記。例: 1キロリットル）。
 */
per?: string
bracket?: RateBracket
applies_to: DescribedItem
/**
 * 値を定める原文。
 */
raw_text: string
}
/**
 * proportional: 比例（累進の1区分を含む）、fixed_amount: 定額、per_unit: 従量。
 */
export type RateKind = ("proportional" | "fixed_amount" | "per_unit")
/**
 * statutory: 法定、standard: 標準税率、limit: 制限税率、reduced: 軽減。
 */
export type RateRole = ("statutory" | "standard" | "limit" | "reduced")
/**
 * valueの単位。percentは100分率（10は10%）。
 */
export type RateUnit = ("percent" | "per_mille" | "yen")
/**
 * 値の決まり方。stated: 条文に値が書かれている、calculated: 条文の算式から計算する、published: 告示等、e-Gov法令APIで取得できない公表物で定まる。
 */
export type Determination = ("stated" | "calculated" | "published")
/**
 * value: 値を定める、formula: 算式を定める、delegation: 政令・省令・告示等へ委任する、condition: 適用の条件を定める。
 */
export type ProvisionRole = ("value" | "formula" | "delegation" | "condition")
/**
 * @minItems 1
 */
export type SourceUrls = [SourceUrl, ...(SourceUrl)[]]
/**
 * 根拠とした公式一次情報のURL。
 */
export type SourceUrl = string
/**
 * 日本標準時（JST）のISO 8601日時。タイムゾーンは +09:00 で記録する。
 */
export type DateTime = string
export type BurdenStatus = ("active" | "promulgated_not_effective" | "abolished")
/**
 * sum: 所属する率・金額を足すと全体の負担になる、progressive: 区分ごとに計算して合計する（累進）、select_one: 条件によりどれか1つが適用される、classification: 分類だけで率・金額を合算しない。
 */
export type GroupAggregation = ("sum" | "progressive" | "select_one" | "classification")
/**
 * 英小文字・数字のkebab-caseによる永続ID。一度公開したIDは変更しない。
 */
export type KebabId1 = string
/**
 * 根拠とした公式一次情報のURL。
 */
export type SourceUrl1 = string

export interface RepositorySchemas {
burdens?: Burdens
groups?: BurdenGroups
"legal-sources"?: LegalSources
"scope-decisions"?: ScopeDecisions
sources?: SourceRegistry
}
/**
 * 負担項目の正本（data/burdens.yaml）。burden_idの昇順に並べる。
 */
export interface Burdens {
burdens: Burden[]
}
/**
 * 負担項目（data/burdens.yaml の burdens の要素）。1つの率または金額を1項目とし、負担者が異なれば項目を分ける。レベル1・2の情報と、期間ごとの版を持つ。
 */
export interface Burden {
burden_id: BurdenId
name: string
category: BurdenCategory
levying_body_type: LevyingBodyType
/**
 * 所属する集計用グループ（data/groups.yaml のgroup_id）。
 * 
 * @minItems 1
 */
groups: [KebabId, ...(KebabId)[]]
/**
 * 分割・統合で終了した前身の負担項目。
 * 
 * @minItems 1
 */
predecessors?: [BurdenId, ...(BurdenId)[]]
/**
 * 負担そのものの根拠（課税・徴収を定める条項）。
 * 
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
/**
 * 版。率・金額、または根拠の条項の位置が変わるごとに追加する。
 * 
 * @minItems 1
 */
versions: [BurdenVersion, ...(BurdenVersion)[]]
status: BurdenStatus
source_urls: SourceUrls
checked_at: DateTime
}
/**
 * 根拠法令と条項。条項は原文の表記で記録する。
 */
export interface LegalReference {
law_id: LawId
elm?: EgovElement
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
 * 累進の区分のうち、この項目が適用される範囲。upperがnullの場合は上限なし。
 */
export interface RateBracket {
lower: number
upper: (number | null)
unit: "yen"
}
/**
 * calculated・publishedの場合の算式。原文と、値を求めた過程を記録する。
 */
export interface Formula {
/**
 * 算式の原文。
 */
raw_text: string
/**
 * 値を求めた過程（例: 18.3% × 1/2 = 9.15%）。
 */
derivation: string
}
/**
 * 値を定める、または値の決まり方に関わる条項。e-Gov法令APIで取得でき、監視の対象になる。
 */
export interface Provision {
law_id: LawId
elm: EgovElement
/**
 * 条項の原文表記（例: 第八十九条第一項）。
 */
article: string
role: ProvisionRole
}
/**
 * 集計用グループ（data/groups.yaml）。負担項目はdata/burdens.yamlの各項目のgroupsで所属を示す。
 */
export interface BurdenGroups {
groups: BurdenGroup[]
}
export interface BurdenGroup {
group_id: KebabId
name: string
aggregation: GroupAggregation
parent_group_id?: KebabId
description?: string
}
/**
 * 根拠の正本（data/legal-sources.yaml）。監視対象の一覧を兼ねる。legal_sources は law_id の昇順、published_documents は source_id の昇順に並べる。
 */
export interface LegalSources {
/**
 * e-Gov法令APIで取得する根拠法令。
 */
legal_sources: LegalSource[]
/**
 * e-Gov法令APIで取得できない告示等の値を公表する資料。公表ページ（config/sources.yaml の巡回先）ごとに、最新の資料を1件だけ記録する。
 */
published_documents?: PublishedDocument[]
}
/**
 * 根拠法令（data/legal-sources.yaml の legal_sources の要素）。監視対象の一覧を兼ねる。
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
 * 公表ページに掲載された最新の資料と、人がマスタへの反映を確認したファイルのSHA-256。
 */
export interface PublishedDocument {
source_id: KebabId1
/**
 * 資料の題名（原文）。
 */
title: string
/**
 * 人がマスタへの反映を確認した資料のファイルのSHA-256（16進数の小文字）。数値と解釈されないよう、YAMLでは引用符で囲む。
 */
reviewed_sha256: string
reviewed_at: DateTime
source_url: SourceUrl1
}
/**
 * 区分表だけでは判定できない負担のうち、対象と判断したものの記録（data/scope-decisions.yaml）。対象外と判断したものはADR 0002に記録し、ここには記録しない。
 */
export interface ScopeDecisions {
decisions: ScopeDecision[]
}
export interface ScopeDecision {
decision_id: KebabId
subject: string
reason: string
decided_at: IsoDate
burden_id?: BurdenId
/**
 * @minItems 1
 */
source_urls: [SourceUrl, ...(SourceUrl)[]]
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
/**
 * 連続するリクエストの最小間隔（ミリ秒）。rate_limitの方針を機械的に守るための値。
 */
request_interval_ms: number
enabled: boolean
}
