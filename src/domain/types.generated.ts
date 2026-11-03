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
 * e-Gov法令API v2のelmパラメータで指定する条項の位置（例: MainProvision-Article_89-Paragraph_1、AppdxTable_1）。
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
export type SurveyCondition = ({
condition_id: KebabId
burden_category: BurdenCategory
method: SurveyMethod
description: string
category_cd?: string
keyword?: string
law_id?: LawId
/**
 * @minItems 1
 */
elms?: [EgovElement, ...(EgovElement)[]]
} & {
condition_id: KebabId
burden_category: BurdenCategory
method: SurveyMethod
description: string
category_cd?: string
keyword?: string
law_id?: LawId
/**
 * @minItems 1
 */
elms?: [EgovElement, ...(EgovElement)[]]
})
/**
 * category: e-Govの法令分類、keyword: 全文検索、articles: 指定した条項の取得（列挙規定の記録）。
 */
export type SurveyMethod = ("category" | "keyword" | "articles")
/**
 * 日本標準時（JST）のISO 8601日時。タイムゾーンは +09:00 で記録する。
 */
export type DateTime1 = string
export type SurveyJudgment = {
law_id: LawId
law_title: string
judgment: SurveyJudgmentResult
reason: string
/**
 * 判定の根拠とした条項（原文表記）。
 */
articles?: string[]
/**
 * targetの場合に対応するグループ（data/groups.yaml）。
 */
groups?: KebabId[]
}
/**
 * target: 最初のリリースの対象、later: 全体の範囲だが最初のリリースの対象外（特例・減免、過去の制度、保険者決定値、その他の公的負担等）、pending: 対象とするかユーザーの判断が必要、excluded: 負担を課す規定がない等で対象外。
 */
export type SurveyJudgmentResult = ("target" | "later" | "pending" | "excluded")

export interface RepositorySchemas {
burdens?: Burdens
groups?: BurdenGroups
"legal-sources"?: LegalSources
"scope-decisions"?: ScopeDecisions
sources?: SourceRegistry
"survey-conditions"?: SurveyConditions
"survey-candidates"?: SurveyCandidates
"survey-judgments"?: SurveyJudgments
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
 * 根拠法令の正本（data/legal-sources.yaml）。law_idの昇順に並べる。
 */
export interface LegalSources {
legal_sources: LegalSource[]
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
/**
 * 法令調査の抽出条件（docs/surveys/<survey-id>/conditions.yaml）。
 */
export interface SurveyConditions {
survey_id: KebabId
source_id: KebabId1
/**
 * e-Gov法令APIの法令種別。
 */
law_type: ("Act" | "CabinetOrder" | "MinisterialOrdinance")
/**
 * @minItems 1
 */
conditions: [SurveyCondition, ...(SurveyCondition)[]]
}
/**
 * 法令調査の抽出結果（docs/surveys/<survey-id>/candidates.json）。プログラムが出力し、手で編集しない。
 */
export interface SurveyCandidates {
survey_id: KebabId
retrieved_at: DateTime
base_url: SourceUrl
law_type: string
condition_results: SurveyConditionResult[]
laws: SurveyLaw[]
/**
 * articles条件で取得した条項の本文。
 */
articles: SurveyArticle[]
}
export interface SurveyConditionResult {
condition_id: KebabId
law_count: number
/**
 * 廃止・失効のため除いた件数。
 */
excluded_repealed_count?: number
}
export interface SurveyLaw {
law_id: LawId
law_title: string
law_num: string
/**
 * e-Govの法令分類。
 */
category: string
law_revision_id: string
current_revision_status: string
/**
 * @minItems 1
 */
matched_conditions: [KebabId, ...(KebabId)[]]
/**
 * 全文検索で該当した文の抜粋（条件ごとに先頭の1文）。
 */
snippets?: {
condition_id: KebabId
text: string
}[]
}
export interface SurveyArticle {
condition_id: KebabId
law_id: LawId
elm: EgovElement
law_revision_id: string
text: string
}
/**
 * 法令調査の判定結果（docs/surveys/<survey-id>/judgments.yaml）。抽出結果の全件を判定する。
 */
export interface SurveyJudgments {
survey_id: KebabId
judged_against: DateTime1
judgments: SurveyJudgment[]
}
