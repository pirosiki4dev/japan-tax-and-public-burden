# 配布物

このディレクトリは正本（`data/`）から `npm run dist:generate` で生成する。手で編集しない。CIは、生成し直した結果とこのディレクトリに差分がないことを検査する（`npm run dist:check`）。

基準日: 2026-11-08（正本の確認日時のうち最も新しい日付。配布物の内容は、この日までに確認した公式情報に基づく）

| ファイル | 内容 |
| --- | --- |
| `burdens.csv` | 負担項目の版ごとに1行の表。表計算ソフト向け（UTF-8・BOM付き、改行はCRLF、RFC 4180） |
| `burdens.json` | 負担項目、集計用グループ、根拠法令、公表資料を正本の構造のまま収めたもの。プログラム向け |

## burdens.csv の列

日付の原文（和暦）、不明な日付の理由、監視する条項、負担者・課税対象・課税標準は、burdens.json に収める。

| 列 | 意味 |
| --- | --- |
| `as_of` | 基準日（YYYY-MM-DD）。正本の確認日時のうち最も新しい日付。全行で同じ値 |
| `burden_id` | 負担項目のID（1つの率または金額ごとの永続ID） |
| `name` | 負担項目の名称 |
| `category` | 区分。`national_tax`（国税）、`local_tax`（地方税）、`social_insurance`（社会保険料）、`other_public_burden`（その他の公的負担） |
| `levying_body_type` | 課す主体。`national`、`prefecture`、`municipality`、`insurer` |
| `groups` | 所属する集計用グループの `group_id`（空白区切り）。グループの定義は burdens.json の `groups` |
| `status` | 制度の状態（正本に記録した値）。`active`（現行）、`promulgated_not_effective`（施行前）、`abolished`（廃止） |
| `version_id` | 版のID。率・金額や根拠の条項の位置が変わるごと、段階的に適用されるごとに版を分ける。1行が1つの版 |
| `promulgation_date` | 公布日（YYYY-MM-DD）。不明の場合は空欄 |
| `enforcement_date` | 施行日（YYYY-MM-DD）。不明の場合は空欄 |
| `application_start_date` | 適用開始日（YYYY-MM-DD）。不明の場合は空欄 |
| `collection_start_date` | 徴収開始日（YYYY-MM-DD）。不明の場合は空欄 |
| `application_end_date` | 適用終了日（YYYY-MM-DD）。終了日の定めがない場合と不明の場合は空欄 |
| `rate_kind` | 率・金額の種類。`proportional`（比例。累進の1区分を含む）、`fixed_amount`（定額）、`per_unit`（従量） |
| `rate_role` | 率・金額の位置付け。`statutory`（法定）、`standard`（標準税率）、`limit`（制限税率）、`reduced`（軽減） |
| `value` | 率・金額の値 |
| `unit` | `value` の単位。`percent`（10は10%）、`per_mille`（1,000分率）、`yen`（円） |
| `per` | 従量の基準となる数量（原文の表記）。従量でない場合は空欄 |
| `bracket_lower` | 累進の区分の下限（この金額を超える部分。0は下限なし）。累進でない場合は空欄 |
| `bracket_upper` | 累進の区分の上限（この金額以下の部分）。上限がない場合と累進でない場合は空欄 |
| `bracket_unit` | 累進の区分の単位（`yen`）。累進でない場合は空欄 |
| `applies_to` | 率・金額が適用される対象の条件（要約）。不明の場合は空欄 |
| `raw_text` | 率・金額を定める原文 |
| `determination` | 値の決まり方。`stated`（条文に値が書かれている）、`calculated`（条文の算式から計算する）、`published`（告示等の公表物で定まる） |
| `source_urls` | 版の根拠URL（空白区切り） |
| `checked_at` | 版の確認日時（ISO 8601、+09:00） |

## burdens.json の最上位の項目

| 項目 | 意味 |
| --- | --- |
| `as_of` | 基準日（YYYY-MM-DD）。burdens.csv の `as_of` と同じ |
| `burdens` | 負担項目（`data/burdens.yaml` の `burdens`）。各項目の意味は `schemas/burden.schema.json` |
| `groups` | 集計用グループ（`data/groups.yaml` の `groups`）。各項目の意味は `schemas/groups.schema.json` |
| `legal_sources` | 根拠法令と確認済みの改正版（`data/legal-sources.yaml` の `legal_sources`）。各項目の意味は `schemas/legal-source.schema.json` |
| `published_documents` | 告示等の値を公表する最新の資料と確認済みのSHA-256（`data/legal-sources.yaml` の `published_documents`）。各項目の意味は `schemas/legal-sources.schema.json` |
