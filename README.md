# 日本の税・公的負担データベース

日本の税と公的負担（国税、地方税、社会保険料、法令に基づく賦課金・拠出金・負担金など）を、公式一次情報の根拠付きで構造化し、制度の新設・改廃や率・金額の変更を継続的に追跡するプロジェクトです。

> [!IMPORTANT]
> このデータは制度の存在と変更を可視化するためのものです。個別の納税額計算、税務・法務上の助言、将来の成立・適用の断定には利用できません。

## 現在の状況

フォルダ構成から設計し直して作り直しています（[#139](https://github.com/pirosiki4dev/japan-tax-and-public-burden/issues/139)）。現時点では基盤とデータ構造の定義だけがあり、制度データは未投入です。

作り直し前の実装とデータは [`legacy-v0`](https://github.com/pirosiki4dev/japan-tax-and-public-burden/tree/legacy-v0) タグで参照できます。

## 対象範囲

- 全体: 法令に基づき、反対給付なしに、または加入・支払いが義務付けられて徴収される負担。国、地方自治体、保険者の単位まで、過去の制度を含め、税収・国民負担率との対応まで扱う。
- 最初のリリース: 国税、地方税（法定税の法令上の制度と標準税率・制限税率）、社会保険料（法令で定まる率・金額）の現行の制度と公布済み未施行の制度。

詳細は [ADR 0002](docs/adr/0002-rebuild-scope-and-requirements.md) を参照してください。

## フォルダ構成

| パス | 内容 |
| --- | --- |
| `data/burdens.yaml` | 負担項目（1つの率または金額）と、期間ごとの値・監視する条項 |
| `data/groups.yaml` | 負担項目を括って集計するためのグループ |
| `data/legal-sources.yaml` | 根拠法令（e-Gov法令ID、確認済みの改正版）。監視対象の一覧を兼ねる |
| `data/scope-decisions.yaml` | 個別判断で対象とした負担 |
| `config/sources.yaml` | 巡回する公式サイト |
| `schemas/` | データ構造（JSON Schema） |
| `src/` | 検証・生成・監視のプログラム（TypeScript） |
| `docs/adr/` | 設計判断の記録 |
| `surveys/` | 正本に登録する対象を決めた法令調査の作業場所（通常運用では使わない） |

各ファイルの役割と監視の流れを含む設計の詳細は、[ADR 0003](docs/adr/0003-rebuild-architecture-and-data-model.md) を参照してください。

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
| `npm run monitor -- --dry-run` | `config/sources.yaml` の巡回先を監視し、作成するIssueを表示する。現在はe-Gov法令APIで根拠法令の改正を確認する（`--dry-run` を外すとIssueを作成する。`GITHUB_TOKEN` と `GITHUB_REPOSITORY` が必要） |

## 貢献

Issue駆動で開発します。変更に着手する前に対応するIssueを確認し、なければ目的、対象範囲、受け入れ条件を記載したIssueを作成してください。新しい事実には一次情報のURLと確認日時を付け、推測値は登録しないでください。作業の規則は [AGENTS.md](AGENTS.md) にまとめています。
