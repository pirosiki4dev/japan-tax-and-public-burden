# 日本の税・公的負担データベース

日本の税と公的負担（国税、地方税、社会保険料、法令に基づく賦課金・拠出金・負担金など）を、公式一次情報の根拠付きで構造化し、制度の新設・改廃や率・金額の変更を継続的に追跡するプロジェクトです。

> [!IMPORTANT]
> このデータは制度の存在と変更を可視化するためのものです。個別の納税額計算、税務・法務上の助言、将来の成立・適用の断定には利用できません。

## 現在の状況

フォルダ構成から設計し直して作り直しています（[#139](https://github.com/pirosiki4dev/japan-tax-and-public-burden/issues/139)）。現時点では基盤とデータ構造の定義だけがあり、制度データは未投入です。

作り直し前の実装とデータは [`legacy-v0`](https://github.com/pirosiki4dev/japan-tax-and-public-burden/tree/legacy-v0) タグで参照できます。

## 対象範囲

- 全体: 法令に基づき、反対給付なしに、または加入・支払いが義務付けられて徴収される負担。国、地方自治体、保険者の単位まで、過去の制度を含め、税収・国民負担率との対応まで扱う。
- 最初のリリース: 国税（関税を除く）、地方税（法定税の法令上の制度と標準税率・制限税率）、社会保険料（法令で定まる率・金額）の現行の制度と公布済み未施行の制度。

詳細は [ADR 0002](docs/adr/0002-rebuild-scope-and-requirements.md) を参照してください。

## フォルダ構成

| パス | 内容 |
| --- | --- |
| `data/burdens.yaml` | 負担項目（1つの率または金額）と、期間ごとの値・監視する条項 |
| `data/groups.yaml` | 負担項目を括って集計するためのグループ |
| `data/legal-sources.yaml` | 根拠法令（e-Gov法令ID、確認済みの改正版）と告示等の公表資料（確認済みのSHA-256）。監視対象の一覧を兼ねる |
| `data/scope-decisions.yaml` | 個別判断で対象とした負担 |
| `config/sources.yaml` | 巡回する公式サイト |
| `schemas/` | データ構造（JSON Schema） |
| `dist/` | 配布物（CSV・JSON）。正本から生成する（下記「配布物」） |
| `src/` | 検証・生成・監視のプログラム（TypeScript） |
| `docs/adr/` | 設計判断の記録 |
| `surveys/` | 正本に登録する対象を決めた法令調査の作業場所（通常運用では使わない） |

各ファイルの役割と監視の流れを含む設計の詳細は、[ADR 0003](docs/adr/0003-rebuild-architecture-and-data-model.md) を参照してください。

## 配布物

`dist/` の配布物は、正本（`data/`）から `npm run dist:generate` で生成します。手で編集しないでください。CIは、生成し直した結果と `dist/` に差分がないことを検査します（`npm run dist:check`）。

| ファイル | 内容 |
| --- | --- |
| `dist/burdens.csv` | 負担項目の版ごとに1行の表。表計算ソフト向け（UTF-8・BOM付き、改行はCRLF、RFC 4180） |
| `dist/burdens.json` | 負担項目、集計用グループ、根拠法令、公表資料を正本の構造のまま収めたもの。プログラム向け |

基準日（`as_of`）は、正本の確認日時（`checked_at`、`reviewed_at`）のうち最も新しい日付です。配布物の内容は、この日までに確認した公式情報に基づきます。生成した日ではないため、正本が同じなら配布物も同じになります。

### burdens.csv の列

日付の原文（和暦）、不明な日付の理由、監視する条項、負担者・課税対象・課税標準は、`burdens.json` に収めています。

| 列 | 意味 |
| --- | --- |
| `as_of` | 基準日（YYYY-MM-DD）。正本の確認日時のうち最も新しい日付。全行で同じ値 |
| `burden_id` | 負担項目のID（1つの率または金額ごとの永続ID） |
| `name` | 負担項目の名称 |
| `category` | 区分。`national_tax`（国税）、`local_tax`（地方税）、`social_insurance`（社会保険料）、`other_public_burden`（その他の公的負担） |
| `levying_body_type` | 課す主体。`national`、`prefecture`、`municipality`、`insurer` |
| `groups` | 所属する集計用グループの `group_id`（空白区切り）。グループの定義は `burdens.json` の `groups` |
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

### burdens.json の最上位の項目

| 項目 | 意味 |
| --- | --- |
| `as_of` | 基準日（YYYY-MM-DD）。`burdens.csv` の `as_of` と同じ |
| `burdens` | 負担項目（`data/burdens.yaml` の `burdens`）。各項目の意味は `schemas/burden.schema.json` |
| `groups` | 集計用グループ（`data/groups.yaml` の `groups`）。各項目の意味は `schemas/groups.schema.json` |
| `legal_sources` | 根拠法令と確認済みの改正版（`data/legal-sources.yaml` の `legal_sources`）。各項目の意味は `schemas/legal-source.schema.json` |
| `published_documents` | 告示等の値を公表する最新の資料と確認済みのSHA-256（`data/legal-sources.yaml` の `published_documents`）。各項目の意味は `schemas/legal-sources.schema.json` |

## 開発

Node.js 24以上が必要です。

```sh
npm ci
npm run check
```

| コマンド | 内容 |
| --- | --- |
| `npm run check` | CIと同じ検査をすべて実行する |
| `npm run validate` | 正本と設定をSchemaと整合性規則で検証する |
| `npm run types:generate` | `schemas/` からTypeScriptの型を生成する |
| `npm run dist:generate` | 正本から配布物（`dist/`）を生成する。正本を変更したら実行してコミットする |
| `npm run monitor -- --dry-run` | `config/sources.yaml` の巡回先を監視し、作成するIssueを表示する。e-Gov法令APIで根拠法令の改正を、公表ページで最新の資料の変化を確認する（`--dry-run` を外すとIssueを作成する。`GITHUB_TOKEN` と `GITHUB_REPOSITORY` が必要） |

## 貢献

Issue駆動で開発します。変更に着手する前に対応するIssueを確認し、なければ目的、対象範囲、受け入れ条件を記載したIssueを作成してください。新しい事実には一次情報のURLと確認日時を付け、推測値は登録しないでください。作業の規則は [AGENTS.md](AGENTS.md) にまとめています。
