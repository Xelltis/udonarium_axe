# セッションログ — 記録範囲の棚卸し

同期オブジェクト（`@SyncObject`）とローカル状態を全件洗い出し、
[セッションログ](replay.md#セッションログリプレイ基盤)が
どこまで意味づけして記録できているかを突き合わせた表。テスト用のaliasは載せない。

規則は[replay-interpreter.ts](../../src/app/domain/replay/replay-interpreter.ts)にある。
規則が無い変更は`object.update`に落ちる。既定の詳細度（`notable`）は
`object.update`を捨てるため、**規則が無い = 標準設定では記録されない**。

## 意味づけの規則がある

| alias / 状態                                                                                                                                                             | 記録される種類                                                                       | 備考                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `chat`（新規）                                                                                                                                                           | `chat.message` / `chat.dice`                                                         | 発言者・宛先・タブ・秘匿を保持                                                                                              |
| `data`の値                                                                                                                                                               | `object.value`                                                                       | HP等。`RESOURCE_CHANGE`の合図も同種へ                                                                                       |
| `character` / `card` / `coin` / `dice-symbol` / `terrain` / `table-mask` / `table-scratch-mask` / `text-note` / `light-source` / `range` / `effect-field` / `card-stack` | `object.move` / `rotate` / `face` / `owner` / `lock` / `image` / `create` / `remove` | 座標・回転・持ち主・固定はalias非依存の共通規則                                                                             |
| `cut-in-launcher`                                                                                                                                                        | `media.cutin`                                                                        | `launchTimeStamp` / `soundOnlyTimeStamp`の更新で発火                                                                        |
| `jukebox`                                                                                                                                                                | `media.bgm` / `media.se`                                                             | 曲の切り替え・停止・SEトリガ                                                                                                |
| `background-sound`                                                                                                                                                       | `media.bgs`                                                                          | 環境音の開始と停止（`isPlaying`の変化）。音量だけの変更は記録しない                                                         |
| `vn-stage`                                                                                                                                                               | `vn.scene` / `vn.playhead` / `vn.direct`                                             | 背景転換・語りの送り・進行役の交代                                                                                          |
| `TurnState`                                                                                                                                                              | `turn.change`                                                                        | ラウンド・フェーズ・手番のコマ・陣営フェイズ                                                                                |
| `Vote`                                                                                                                                                                   | `vote.start` / `vote.finish`                                                         | 投票と点呼を区別する                                                                                                        |
| `game-table`の見た目                                                                                                                                                     | `table.scene`                                                                        | 盤面画像・壁画像・暗闇。`selected`は対象外（切替は合図側）                                                                  |
| `PeerCursor.role`                                                                                                                                                        | `peer.role`                                                                          | `lastControl*`の頻繁な更新は拾わない                                                                                        |
| `TableSelecter`                                                                                                                                                          | `table.change`                                                                       | 全員に見せるテーブルの切り替え。最初にテーブルを採った分は数えない（`SELECT_GAME_TABLE`は受信の処理だけで、送る箇所がない） |
| VN表示モード（ローカル）                                                                                                                                                 | `vn.mode`                                                                            | 同期されないため`localDispatch`で手元にだけ知らせる                                                                         |

合図（ネットワークイベント）由来:
`ROLL_DICE_SYMBOL` / `FLIP_COIN` / `SHUFFLE_CARD_STACK` / `SOUND_EFFECT` /
`EFFECT_CAST` / `SELECT_GAME_TABLE` / `RESOURCE_CHANGE` / `CONNECT_PEER` / `DISCONNECT_PEER`。
鳴らし直せるものは`signal`を添えて、再生時に発火し直す。

## 意図的に規則を置いていない

| alias                                                                                                                                                                                                     | 理由                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `chat-tab` / `chat-tab-list`                                                                                                                                                                              | タブの作成・改名は卓の出来事ではなく設定。`full`でのみ残る                                                                 |
| `cut-in` / `cut-in-scene` / `cut-in-layer` / `effect-preset` / `effect-preset-set` / `dice-table` / `dice-bot` / `chat-palette` / `buff-palette` / `dice-table-palette` / `board-scene` / `scenario-text` | 素材・定義の編集。使ったときは別途記録される                                                                               |
| `image-tag` / `image-tag-list` / `audio-tag` / `audio-tag-list` / `playlist` / `model-tag` / `image-tag-lock` / `asset-owner` / `asset-removal`                                                           | 素材の整理（タグ・自分専用のタグ・追加した人・削除）                                                                       |
| `config` / `summary-setting` / `markdown` / `reload-check` / `room` / `sound-effect` / `status-ailment-catalog`                                                                                           | 部屋の設定・内部管理                                                                                                       |
| `table-move-cost` / `move-block-map` / `ground-field` / `ground-chunk` / `table-background-layer`                                                                                                         | 地図の設定（移動の重さ・通れないマス・地面の高さと塗り・背景の層）                                                         |
| `table-trigger`                                                                                                                                                                                           | 仕掛けの置き方は地図の設定。踏んだときの発言・効果音・カットイン・エフェクト・値の変化・移動は、それぞれの種類で記録される |
| `fog-memory`                                                                                                                                                                                              | 霧の中で見た範囲の記録。プレイヤーのコマから1つの席が自動で書くので、元になるコマの移動が記録される                        |
| `hotbar` / `hotbar-slot`                                                                                                                                                                                  | 各自のホットバー。押したときの発言や値の変化は、それぞれの種類で記録される                                                 |
| `playlist-list` / `image-link-list` / `image-tag-lock-list` / `model-tag-list` / `asset-owner-list` / `hotbar-set`                                                                                        | 保存ファイルを書き読みするための入れ物。ストアに入るとすぐ取り除くので、部屋へ流れない                                     |
| `sub-palette`                                                                                                                                                                                             | ほかのフォークの保存データを読むための形。読み込むとキャラクターのチャットパレットのタブへ畳んで消す                       |
| `party`                                                                                                                                                                                                   | 同行編成。卓の進行としては現れにくい。要望があれば規則を足せる                                                             |
| `PeerCursor`の改名                                                                                                                                                                                        | 人物辞書が当時の名前を保持するため、行としては起こさない                                                                   |
| `Alarm`                                                                                                                                                                                                   | タイマー。鳴った事実はSEとして残る                                                                                         |
| `engagement-zone`                                                                                                                                                                                         | 宣言・参加・離脱はシステムメッセージに残る                                                                                 |
| `node` / `TabletopObject`                                                                                                                                                                                 | 抽象基底。実体は個別alias側で拾う                                                                                          |

## 共通規則だけで拾っているもの

専用の規則は置いていない。作成は`object.create`、座標・回転・固定の変化は共通規則で記録する。
それ以外の中身の変更は`object.update`に落ちるので、標準設定では残らない。

| alias                          | 共通規則のあとに落ちるもの                             |
| ------------------------------ | ------------------------------------------------------ |
| `white-board`                  | 角度（`pitch`）・色・描いた中身（`scene`）             |
| `chat-reaction`                | 付け外ししたスタンプ（`stamps`）                       |
| `stamp-pack`                   | 組の名前と、入っている画像                             |
| `board-switch` / `board-stash` | スイッチの中身と押された記録、スイッチで伏せた物の控え |
| `table-ambience`               | 種類・色・濃さ・水の設定など（`ambienceKind`ほか）     |

## 記録できないもの

- **記録者が落ちていた区間**。再接続時にキーフレームを取って断絶を明示する
- **各ピアのローカル表示**（カメラ位置、パネル配置、音量など）。VN表示モードだけは
  再生の見え方に関わるため例外的に記録する

## 前提: 卓の出来事はすべてブロードキャストで流れる

`networkSend()`の第3引数（`sendTo`）を使う送信を全件調べた結果、
ユニキャストは**複製の裏方、入力中インジケータ、部屋のサーバーへの要求だけ**だった。

| 送信元                                                                                | イベント                                                                                                                        | 種別                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `object-synchronizer` / `synchronize-task`                                            | `SYNCHRONIZE_GAME_OBJECT` / `REQUEST_CATALOG` / `REQUEST_GAME_OBJECT` / 追いつき用の`UPDATE_GAME_OBJECT` / `DELETE_GAME_OBJECT` | 複製の裏方                       |
| `image-storage` / `shared-asset-storage` / `*-sharing-system` / `buffer-sharing-task` | `SYNCHRONIZE_*_LIST` / `REQUEST_*_RESOURE` / `START_*_TRANSMISSION` / `FILE_*_CHUNK_*` / `CANCEL_TASK_*`                        | ファイル転送                     |
| `domain-events`                                                                       | `WRITING_A_MESSAGE` / `WRITING_A_MESSAGE_DETAIL`                                                                                | 入力中インジケータ（記録対象外） |
| `server-watch.service` / `peer-menu` / `dice-bot`                                     | `ROLE_REQUEST` / `ROLL_REQUEST`                                                                                                 | 部屋のサーバーへの要求           |

内緒話・秘匿ダイス・秘話カットインは、いずれも同期オブジェクトとして全員へ流れ、
見せるかどうかは表示側が決めている。だから記録者にも届き、当時の可視性ごと残る。

部屋のサーバーへの`ROLE_REQUEST`と`ROLL_REQUEST`は、サーバーだけに送る。
答えはサーバーが同期オブジェクトとして全員へ流すので、ロールの変更は`PeerCursor`の`role`の更新（`peer.role`）として、
ダイスの結果は結果の行（`chat.dice`）として、記録者にも届く（[サーバーに頼む要求](../architecture/sync-and-network.md#サーバーに頼む要求)）。

**不変条件**: 卓の出来事はブロードキャストで流す。ユニキャストは複製の裏方と、答えが全員へ流れる部屋のサーバーへの要求に限る。
ここを破って`sendTo`で中身のあるイベントを送ると、記録者が宛先でない限り記録から消える。

## 抜けを疑うときの手順

1. `@SyncObject`の一覧を取る
   （`grep -rn "@SyncObject(" src/app/domain src/app/core --include="*.ts" | grep -v spec`）
2. そのaliasが[replay-interpreter.ts](../../src/app/domain/replay/replay-interpreter.ts)
   の規則にあるか確認する
3. 無ければ`object.update`に落ちている。卓の出来事なら規則を足し、
   設定や素材なら本書の「意図的に規則を置いていない」へ追記する
