// このファイルは surveys/first-release-scope/schemas/ から生成する。手で編集せず `node surveys/first-release-scope/src/generate-types.ts` を実行する。


export type SurveyKebabId = string
/**
 * config/sources.yaml の情報源。
 */
export type SurveyKebabId1 = string
export type SurveyCondition = ({
condition_id: SurveyKebabId
burden_category: SurveyBurdenCategory
method: SurveyMethod
description: string
category_cd?: string
keyword?: string
law_id?: SurveyLawId
/**
 * @minItems 1
 */
elms?: [SurveyElement, ...(SurveyElement)[]]
} & {
condition_id: SurveyKebabId
burden_category: SurveyBurdenCategory
method: SurveyMethod
description: string
category_cd?: string
keyword?: string
law_id?: SurveyLawId
/**
 * @minItems 1
 */
elms?: [SurveyElement, ...(SurveyElement)[]]
})
export type SurveyBurdenCategory = ("national_tax" | "local_tax" | "social_insurance" | "other_public_burden")
/**
 * category: e-Govの法令分類、keyword: 全文検索、articles: 指定した条項の取得（列挙規定の記録）。
 */
export type SurveyMethod = ("category" | "keyword" | "articles")
/**
 * e-Gov法令ID。
 */
export type SurveyLawId = string
/**
 * e-Gov法令API v2のelmパラメータで指定する条項の位置。
 */
export type SurveyElement = string
/**
 * 日本標準時（+09:00）のISO 8601日時。
 */
export type SurveyDateTime = string
export type SurveyUrl = string
/**
 * 日本標準時（+09:00）のISO 8601日時。
 */
export type SurveyDateTime1 = string
export type SurveyJudgment = {
law_id: SurveyLawId
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
groups?: SurveyKebabId[]
}
/**
 * target: 最初のリリースの対象、later: 全体の範囲だが最初のリリースの対象外（特例・減免、過去の制度、保険者決定値、その他の公的負担等）、pending: 対象とするかユーザーの判断が必要、excluded: 負担を課す規定がない等で対象外。
 */
export type SurveyJudgmentResult = ("target" | "later" | "pending" | "excluded")

export interface SurveySchemas {
conditions?: SurveyConditions
candidates?: SurveyCandidates
judgments?: SurveyJudgments
}
/**
 * 抽出条件（surveys/first-release-scope/conditions.yaml）。
 */
export interface SurveyConditions {
survey_id: SurveyKebabId
source_id: SurveyKebabId1
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
 * 抽出結果（surveys/first-release-scope/candidates.json）。プログラムが出力し、手で編集しない。
 */
export interface SurveyCandidates {
survey_id: SurveyKebabId
retrieved_at: SurveyDateTime
base_url: SurveyUrl
law_type: string
condition_results: SurveyConditionResult[]
laws: SurveyLaw[]
/**
 * articles条件で取得した条項の本文。
 */
articles: SurveyArticle[]
}
export interface SurveyConditionResult {
condition_id: SurveyKebabId
law_count: number
/**
 * 廃止・失効のため除いた件数。
 */
excluded_repealed_count?: number
}
export interface SurveyLaw {
law_id: SurveyLawId
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
matched_conditions: [SurveyKebabId, ...(SurveyKebabId)[]]
/**
 * 全文検索で該当した文の抜粋（条件ごとに先頭の1文）。
 */
snippets?: {
condition_id: SurveyKebabId
text: string
}[]
}
export interface SurveyArticle {
condition_id: SurveyKebabId
law_id: SurveyLawId
elm: SurveyElement
law_revision_id: string
text: string
}
/**
 * 判定結果（surveys/first-release-scope/judgments.yaml）。抽出結果の全件を判定する。
 */
export interface SurveyJudgments {
survey_id: SurveyKebabId
judged_against: SurveyDateTime1
judgments: SurveyJudgment[]
}
