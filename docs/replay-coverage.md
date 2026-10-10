# セッションログ — 記録範囲の棚卸し

同期オブジェクト（`@SyncObject`）とローカル状態を全件洗い出し、
セッションログ（[features.md](features.md#セッションログリプレイ基盤)）が
どこまで意味づけして記録できているかを突き合わせた表。

規則は[replay-interpreter.ts](../src/app/domain/replay/replay-interpreter.ts)にある。
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

| alias                                                                                                                                            | 理由                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `chat-tab` / `chat-tab-list`                                                                                                                     | タブの作成・改名は卓の出来事ではなく設定。`full`でのみ残る     |
| `cut-in` / `cut-in-scene` / `cut-in-layer` / `effect-preset` / `effect-preset-set` / `dice-table` / `dice-bot` / `chat-palette` / `buff-palette` | 素材・定義の編集。使ったときは別途記録される                   |
| `image-tag` / `image-tag-list` / `audio-tag` / `audio-tag-list` / `playlist`                                                                     | 素材の整理                                                     |
| `config` / `summary-setting` / `markdown` / `reload-check` / `room` / `sound-effect`                                                             | 部屋の設定・内部管理                                           |
| `party`                                                                                                                                          | 同行編成。卓の進行としては現れにくい。要望があれば規則を足せる |
| `PeerCursor`の改名                                                                                                                               | 人物辞書が当時の名前を保持するため、行としては起こさない       |
| `Alarm`                                                                                                                                          | タイマー。鳴った事実はSEとして残る                             |
| `node` / `TabletopObject`                                                                                                                        | 抽象基底。実体は個別alias側で拾う                              |

## 共通規則だけで拾っているもの

専用の規則は置いていない。作成は`object.create`、座標・回転・固定の変化は共通規則で記録する。
それ以外の中身の変更は`object.update`に落ちるので、標準設定では残らない。

| alias                          | 共通規則のあとに落ちるもの                             |
| ------------------------------ | ------------------------------------------------------ |
| `white-board`                  | 角度（`pitch`）・色・描いた中身（`scene`）             |
| `chat-reaction`                | 付け外ししたスタンプ（`stamps`）                       |
| `stamp-pack`                   | 組の名前と、入っている画像                             |
| `board-switch` / `board-stash` | スイッチの中身と押された記録、スイッチで伏せた物の控え |

## 記録できないもの

- **記録者が落ちていた区間**。再接続時にキーフレームを取って断絶を明示する
- **各ピアのローカル表示**（カメラ位置、パネル配置、音量など）。VN表示モードだけは
  再生の見え方に関わるため例外的に記録する

## 前提: 卓の出来事はすべてブロードキャストで流れる

`networkSend()`の第3引数（`sendTo`）を使う送信を全件調べた結果、
ユニキャストは**複製の裏方と入力中インジケータだけ**だった。

| 送信元                                                                         | イベント                                                                                                                        | 種別                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `object-synchronizer` / `synchronize-task`                                     | `SYNCHRONIZE_GAME_OBJECT` / `REQUEST_CATALOG` / `REQUEST_GAME_OBJECT` / 追いつき用の`UPDATE_GAME_OBJECT` / `DELETE_GAME_OBJECT` | 複製の裏方                       |
| `image-storage` / `audio-storage` / `*-sharing-system` / `buffer-sharing-task` | `SYNCHRONIZE_FILE_LIST` / `SYNCHRONIZE_AUDIO_LIST` / `START_*_TRANSMISSION` / `FILE_*_CHUNK_*` / `CANCEL_TASK_*`                | ファイル転送                     |
| `domain-events`                                                                | `WRITING_A_MESSAGE` / `WRITING_A_MESSAGE_DETAIL`                                                                                | 入力中インジケータ（記録対象外） |

内緒話・秘匿ダイス・秘話カットインは、いずれも同期オブジェクトとして全員へ流れ、
見せるかどうかは表示側が決めている。だから記録者にも届き、当時の可視性ごと残る。

**不変条件**: 卓の出来事はブロードキャストで流す。ユニキャストは複製の裏方に限る。
ここを破って`sendTo`で中身のあるイベントを送ると、記録者が宛先でない限り記録から消える。

## 抜けを疑うときの手順

1. `@SyncObject`の一覧を取る
   （`grep -rn "@SyncObject(" src/app/domain src/app/core --include="*.ts" | grep -v spec`）
2. そのaliasが[replay-interpreter.ts](../src/app/domain/replay/replay-interpreter.ts)
   の規則にあるか確認する
3. 無ければ`object.update`に落ちている。卓の出来事なら規則を足し、
   設定や素材なら本書の「意図的に規則を置いていない」へ追記する
