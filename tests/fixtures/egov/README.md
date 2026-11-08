# e-Gov法令API v2 の応答のfixture

監視（`src/monitor/`）のテストで、外部通信の代わりに使う。テスト専用の架空の法令（`tests/fixtures/valid-repo/data/legal-sources.yaml` の法令）の応答で、実在の法令ではない。項目の構成は e-Gov法令API v2 の `law_revisions`・`law_data`（`law_full_text_format=json`）の応答に合わせている。

| ファイル | 内容 |
| --- | --- |
| `law_revisions-999AC0000000001.json` | 確認済みの版（2025-04-01）より後に、現在施行中の版（2027-04-01）と施行前の版がある |
| `law_revisions-999AC0000000002.json` | 現在施行中の版が確認済みの版と同じ |
| `law_data-999AC0000000001_20250401_000000000000000.json` | 確認済みの版の全文 |
| `law_data-999AC0000000001_20270401_508AC0000000997.json` | 現在施行中の版の全文。第三条の税率の変更、第四条の削除、附則の追加（令和七年法律の附則の番号が2から3にずれる）を含む |
