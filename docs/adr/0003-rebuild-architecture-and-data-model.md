# ADR 0003: 作り直し後の技術方針、フォルダ構成、データモデル

- 状態: accepted（PR #141のマージをもって承認）
- 対応Issue: #139
- 作成日: 2026-11-02
- 前提: [ADR 0002](0002-rebuild-scope-and-requirements.md)

## 文脈

ADR 0002で全体の対象範囲と最初のリリースの範囲を決めた。全体の範囲は全自治体・全保険者の個別の値、過去の制度、税収・国民負担率との対応まで及ぶ。一方、最初のリリースは国税・地方税・社会保険料の法令上の制度と率・金額（レベル3まで）、e-Gov法令APIの監視に限られる。

旧版（`legacy-v0`）では、制度別・Issue番号別の分岐がコードに直書きされ、CLIに中核ロジックが混在し、監視設定と正本データの間で同じ情報を重複して保持していた。本ADRは、最初のリリースを小さく作りながら、全体の範囲へ作り直しなしで拡張できる構成を定める。

## 決定

### 1. データ形式

| 用途 | 形式 | 理由 |
| --- | --- | --- |
| 正本（人が編集・レビューする） | YAML 1.2 | Pull Requestの差分が読みやすく、原文とコメントを併記できる |
| 正本の検証 | JSON Schema（Draft 2020-12） | 言語に依存せず、利用者もデータ構造を確認できる |
| 配布物 | CSV、JSON | 表計算ソフトとプログラムの両方で使える |

- 正本は1制度1ディレクトリに分け、1ファイルが大きくならないようにする。
- 配布物は正本から決定的に生成し、`dist/` にコミットする。CIで再生成した結果と差分がないことを検査する。

### 2. 実装言語・実行環境

- Node.js 24 LTS以上、TypeScript、ES Modulesとする。
- Node.jsの型除去機能で `.ts` を直接実行し、ビルド工程を持たない。型検査は `tsc --noEmit` でCIに組み込む。
- データ構造の正本はJSON Schemaとし、TypeScriptの型はSchemaから生成する。手書きの型とSchemaを二重に管理しない。
- 依存パッケージは、YAML解析、JSON Schema検証、型生成、型検査に必要なものに限る。

旧 `AGENTS.md` の「当面Node.jsのJavaScriptで実装し、TypeScriptへの移行は別途レビューする」は、本ADRをそのレビューとして置き換える。

### 3. フォルダ構成

```text
.
├── data/                       # 正本（手で編集する）
│   ├── burdens/
│   │   └── <burden-id>/
│   │       ├── burden.yaml     # 制度（レベル1・2）
│   │       └── versions.yaml   # 期間ごとの率・金額と日付（レベル3）
│   ├── legal-sources/
│   │   └── <law-id>.yaml       # 根拠法令（e-Gov法令ID、確認済みの改正版）
│   └── scope-decisions.yaml    # 対象・対象外の個別判断の記録
├── config/
│   └── sources.yaml            # 巡回する公式サイトのURL（唯一の置き場所）
├── schemas/                    # JSON Schema（データ構造の正本）
├── src/
│   ├── domain/                 # 純粋な規則（日付、状態の導出、整合性）。I/Oを持たない
│   ├── data/                   # 正本の読み込みと検証
│   ├── build/                  # 配布物の生成
│   ├── monitor/                # e-Gov法令APIの取得、改正の検知、Issueの作成
│   └── cli/                    # コマンドの入口（引数の解析と表示だけ）
├── tests/
│   └── fixtures/               # 外部通信なしで使う公式応答の保存版
├── dist/                       # 配布物（生成物。手で編集しない）
├── docs/
│   └── adr/
└── .github/workflows/
```

依存の向きは `cli → monitor・build・data → domain` とし、`domain` は他の層とNode.jsの入出力APIに依存しない。この規則はCIで検査する。

全体の範囲へ拡張するときは、次のように追加し、既存のファイルの構造は変えない。

| 拡張 | 追加先 |
| --- | --- |
| 自治体の条例上の税率、保険者ごとの料率 | `data/burdens/<burden-id>/jurisdictions/<団体コード>.yaml`、団体の一覧は `data/jurisdictions/` |
| 減免、特例、経過措置（レベル4） | `data/burdens/<burden-id>/reliefs.yaml` |
| 税収・徴収実績、国民負担率との対応（レベル5） | `data/revenues/`、`data/burden-ratio/` |
| 自治体・保険者等の公式サイトの監視 | `config/sources.yaml` と `src/monitor/` の取得方式の追加 |

### 4. データモデル

#### 識別子

- `burden_id`: 英小文字のkebab-case（例: `consumption-tax`）。一度公開したIDは変更しない。
- `law_id`: e-Gov法令ID（例: `363AC0000000108`）。
- 団体を追加するときは、自治体は全国地方公共団体コード、保険者は保険者番号を使う。

#### 制度（`burden.yaml`）

| 項目 | 内容 |
| --- | --- |
| `burden_id`、`name` | ID、正式名称 |
| `category` | `national_tax`、`local_tax`、`social_insurance`、`other_public_burden` |
| `levying_body_type` | `national`、`prefecture`、`municipality`、`insurer` |
| `legal_bases` | `law_id` と条項。複数可 |
| `liable_parties`、`taxable_objects`、`tax_base` | 納税義務者・負担者、課税対象、課税標準（レベル2）。原文と要約を併記 |
| `status` | `active`、`promulgated_not_effective`、`abolished` |
| `source_url`、`checked_at` | 根拠URLと確認日時 |

#### 版（`versions.yaml`）

率や金額が変わるごとに版を追加し、段階的な適用は複数の版で表す。

| 項目 | 内容 |
| --- | --- |
| `version_id` | 版のID |
| `dates` | 公布日、施行日、適用開始日、徴収開始日を個別に持つ。それぞれ原文（和暦）、正規化値、または `unknown` と根拠不足の理由 |
| `rates` | 率・金額の一覧 |

`rates` の各要素は次を持つ。

| 項目 | 内容 |
| --- | --- |
| `kind` | `proportional`（比例）、`progressive`（累進）、`fixed_amount`（定額）、`per_unit`（従量） |
| `role` | `statutory`（法定）、`standard`（標準税率）、`limit`（制限税率）、`reduced`（軽減） |
| `value`、`unit`、`brackets` | 値、単位、累進の区分 |
| `applies_to` | 対象の条件（原文と構造化した区分） |
| `shares` | 本人・事業主・国庫等の負担割合（社会保険料等） |
| `legal_basis` | 根拠の `law_id` と条項 |
| `raw_text` | 根拠の原文 |

制度の状態（現行、施行前、廃止）は、版の日付と基準日から導出し、手入力の値と矛盾しないことを検査する。

#### 根拠法令（`legal-sources/<law-id>.yaml`）

| 項目 | 内容 |
| --- | --- |
| `law_id`、`title` | e-Gov法令ID、題名 |
| `reviewed_revision_id` | 人がマスタへの反映を確認した最新の改正版のID |
| `reviewed_at` | その確認日時 |

### 5. 最初のリリースの監視方式

1. 監視対象の法令は、`data/legal-sources/` の一覧から決める。監視対象だけを別に列挙する設定ファイルは持たない。
2. GitHub Actionsで定期的にe-Gov法令APIから各法令の最新の改正版を取得し、`reviewed_revision_id` と比べる。
3. 異なる場合は、法令ID、新旧の改正版、根拠URL、検知日時を記載したIssueを作成する。同じ法令の同じ改正版について未完了のIssueがある場合は、新たに作成しない。
4. 人がIssueを確認し、マスタへ反映するかを判断する。反映する場合も反映しない場合も、Pull Requestで `reviewed_revision_id` を更新し、そのIssueを閉じる。
5. 取得の失敗やAPIの応答形式の変化は、改正の検知と区別したIssueにする。

監視の状態は正本の `reviewed_revision_id` だけで管理するため、Actionsがリポジトリへ書き込む必要はなく、権限はIssueの作成に限る。

## 検討した代替案

| 案 | 採用しない理由 |
| --- | --- |
| JSONを正本にする | Pull Requestでの差分確認と、原文・コメントの併記がしにくい |
| 全制度を1ファイルにまとめる | 全体の範囲では数千の団体に広がり、差分と競合の管理が難しくなる |
| JavaScriptのまま実装する | 全体の範囲ではデータ構造が大きく、型による検査の効果が大きい。ビルド工程なしで導入できる |
| Pythonで実装する | PDF解析等の利点はあるが、最初のリリースはe-Gov法令API（JSON）だけを扱うため決め手にならない |
| 監視対象を別の設定ファイルで管理する | 正本と同じ情報を二重に持つことになり、旧版の問題を繰り返す |

## 結果

- 制度を追加するときは、`data/burdens/<burden-id>/` と、新しい根拠法令であれば `data/legal-sources/<law-id>.yaml` を追加するだけで、コードと設定の変更を要しない。
- 旧版のファイルはすべて削除し、上記の構成で作り直す。`AGENTS.md`、`README.md`、テンプレート、CIもこの構成に合わせて作り直す。
- 実装はサブIssueに分けて進める（例: 基盤とSchema、データ投入、配布物の生成、監視）。
