# 厚生労働省のページのfixture

公表ページの監視（`src/monitor/mhlw/`）のテストで、外部通信の代わりに使う。

| ファイル | 内容 |
| --- | --- |
| `employment-insurance-rate.html` | 厚生労働省「雇用保険料率について」（https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000108634.html）の応答の保存版（2026-11-08 取得） |

掲載資料（PDF）の中身は、テストの中で架空のバイト列を返す。
