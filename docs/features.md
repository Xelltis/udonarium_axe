# Udonarium Axe — 追加・拡張機能

[Udonarium](https://github.com/TK11235/udonarium) / [Udonarium Lily](https://github.com/entyu/udonarium_lily)の系譜の上で、
Udonarium Axeが**追加**または**大きく拡張・再設計**した機能の一覧。本リポジトリの開発履歴（`feat` / `perf`コミット）を基に整理している。

> 「追加」か「Lilyからの拡張」かの切り分けは、本リポジトリのLICENSE・コード・公開情報に基づく暫定整理。
> 既存機能の再設計（ジュークボックス、カットイン、バフ編集など）も「拡張」として含めている。

本文は領域ごとに[features/](features/)の下のファイルへ分けてある。

| ファイル                                                          | 扱う機能                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| [卓とテーブル](features/tabletop.md)                              | 2D / 3Dの表示、ヘクスグリッド、スナップ、複数選択      |
| [暗闇・視界・光源](features/vision-lighting.md)                   | 暗闇、視界の種類、光源                                 |
| [マップ生成](features/map-generator.md)                           | ダンジョンとフィールドの自動生成                       |
| [マップエディターとスイッチ](features/map-editor.md)              | 機能塗り、スイッチ                                     |
| [テーブルに置く物](features/table-objects.md)                     | 範囲（射程）シェイプ、共有メモ、ホワイトボード         |
| [キャラクター](features/character.md)                             | キャラクターシート、キャラクターの取り込み、データ要素 |
| [PLツール・ホットバー・インベントリ](features/pl-tools.md)        | PLツール、手札、ホットバー、インベントリ               |
| [チャット](features/chat.md)                                      | チャット                                               |
| [ダイス](features/dice.md)                                        | ダイス、ダイスボット                                   |
| [メディアと音楽](features/media.md)                               | ジュークボックス、カットイン、音                       |
| [マップ演出](features/map-effects.md)                             | マップ演出（エフェクト）                               |
| [戦闘カットイン](features/battle-cut-in.md)                       | 戦闘カットイン                                         |
| [ロビー・部屋・ネットワーク](features/lobby-network.md)           | ロビー、部屋、ネットワーク、同期の内部基盤             |
| [画像・ストレージ・ルームの取り込み](features/storage.md)         | 画像、ストレージ、ルームの取り込み                     |
| [セッションログと配信](features/replay.md)                        | セッションログ（リプレイ基盤）、配信オーバーレイ       |
| [画面とUI](features/ui.md)                                        | ウィンドウ操作、モバイル、テーマ                       |
| [卓上ディスプレイの多方向表示・実寸表示](features/multi-angle.md) | 2D多方向閲覧・外周ティッカー・実寸表示の設定と使い方   |
| [セッションログの記録範囲](features/replay-coverage.md)           | セッションログが何を記録し、何を記録しないかの棚卸し   |

---

詳細な実装場所は各featureフォルダ（[architecture.md](architecture.md)の`@axe/features/*`を参照）と該当コミットを辿ってください。
