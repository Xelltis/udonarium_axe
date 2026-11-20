# 同期と通信

部屋の物がどう席から席へ届き、食い違ったときにどちらが勝つかを書く。
`@SyncObject`・`@SyncVar`の宣言とDIへの橋渡しは[同期 / DI基盤](../architecture.md#同期--di基盤)に、変更の購読は[イベント購読パターン](../architecture.md#イベント購読パターン)にある。
部屋のサーバーの機能としての決まり（上限・ログイン・放置の退出）は[ロビー・部屋・ネットワーク](../features/lobby-network.md)にあり、ここでは仕組みだけを扱う。

## 同期オブジェクトと版

同期する物は`GameObject`で、`ObjectContext`（`aliasName`・`identifier`・`majorVersion`・`minorVersion`・`syncData`）の形で席の間を行き来する（`core/sync/game-object`）。
`@SyncVar`の欄に代入すると`update()`が走り、`majorVersion`に1を足し、`minorVersion`を`Math.random()`の値に替えて、`UPDATE_GAME_OBJECT`を部屋へ送る。
配列やオブジェクトの中身をその場で書き換えたときは送られないので、`update()`を自分で呼ぶ。多くの欄を書くときは`GameObject.batch`で包むと、物ごとに1回だけ版が上がる。

受けた側は、版（`majorVersion`と`minorVersion`の和）が手元より大きいときだけ受け入れ、等しければ手元を残す（`core/sync/object-version`の`isNewerVersion`）。
端数の`minorVersion`は、同じ物を同時に変えた2席が同じ版にならないためにある。
受け入れるときは`GameObject.apply`が`syncData`を丸ごと置き換えるので、同じ物の別々の欄を2席が同時に変えると、負けた側の変更は残らない。
部屋のサーバーも同じ決まりで比べる（期待値は`core/network/server/contract/lww.json`）。

`destroy()`は識別子を`ObjectStore`の削除の記録に残してから`DELETE_GAME_OBJECT`を送り、記録にある識別子の物がほかの席から届いてもストアに入れない。
記録は10万件を超えたときだけ10分より古いものから捨て、部屋に入るときとつなぎ直すときに`clearDeleteHistory()`で空にする。

物の同期のイベントは`core/sync/object-synchronizer`が受ける。

| イベント                  | data                          | 受けた席がすること                                                                              |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `UPDATE_GAME_OBJECT`      | `ObjectContext`               | 版を比べて受け入れ、無ければ作る。削除の記録にあれば、P2Pでは送り主へ`DELETE_GAME_OBJECT`を返す |
| `DELETE_GAME_OBJECT`      | `{ aliasName, identifier }`   | 消して削除の記録に残す                                                                          |
| `SYNCHRONIZE_GAME_OBJECT` | `CatalogItem[]`（識別子と版） | 足りない物と新しい物を取り寄せの表に積む                                                        |
| `REQUEST_GAME_OBJECT`     | 識別子                        | `UPDATE_GAME_OBJECT`で返す。消した物なら`DELETE_GAME_OBJECT`を返す                              |
| `REQUEST_CATALOG`         | `{}`                          | 自分のカタログを送る                                                                            |
| `FORGET_DELETED_OBJECTS`  | `{ identifiers }`             | 削除の記録から外す                                                                              |
| `AUTHORITATIVE_OBJECT`    | `ObjectContext`               | サーバーからだけ受ける。版を見ずに受け入れる                                                    |
| `WITHDRAW_GAME_OBJECT`    | `{ identifier }`              | サーバーからだけ受ける。削除の記録に残さずに取り去る                                            |

## カタログの交換と取り寄せ

席がつながると、双方が相手にカタログ（持っている物すべての識別子と版）を`CATALOG_BATCH`（2048件）ずつ、16ミリ秒ごとに送る。
受けた側は、手元に無い物と手元より新しい物を表に積み、同じ版を持つ席を持ち主として並べる。

取り寄せは`SynchronizeTask`（`core/sync/synchronize-task`）が受け持つ。
1つのタスクは1つの席へ最大32件の`REQUEST_GAME_OBJECT`を送り、同時に動くタスクは32まで。頼む先には、受け持ちのタスクが少ない席を選ぶ。
頼んだ物が`UPDATE_GAME_OBJECT`・`DELETE_GAME_OBJECT`・`AUTHORITATIVE_OBJECT`・`WITHDRAW_GAME_OBJECT`のどれかで届けば済み、30秒進みがないか相手が抜けると時間切れになる。
時間切れの件は、持ち主がまだつながっていれば、要求ごとの`ttl`（初めは2）が尽きるまで積み直す。

「接続情報」パネルの「部屋のデータを同期し直す」とリプレイの再生の終わりは、`ObjectSynchronizer.requestFullSync()`で自分のカタログを送り、`REQUEST_CATALOG`で相手のカタログも求める。

## 送り方

| 関数                                 | 宛先         | 自分にも届くか               | 使う所                                                       |
| ------------------------------------ | ------------ | ---------------------------- | ------------------------------------------------------------ |
| `networkSend(name, data)`            | 部屋の全員   | 届く（`isSendFromSelf`が真） | `callEffectCast`などの一度きりの知らせ                       |
| `networkSend(name, data, peerId)`    | 1つの席      | 宛先が自分のときだけ         | 取り寄せ、部屋のサーバーへの要求                             |
| `networkSendLatest(name, data, key)` | 部屋の全員   | 届く                         | `UPDATE_GAME_OBJECT`（キーは識別子）                         |
| `localDispatch(name, data)`          | この端末だけ | その場で届く                 | `OPEN_NETWORK`などの接続の知らせ、`callDiceThrow(…, 'here')` |

送る物は`Network`（`core/network/network`）の待ち行列に入り、次のターンに128件までまとめて出る。
全員宛てと自分宛ての物は、出したあとで自分の`networkMessage$`にも流れるので、2度動かしたくない受け手は`isSendFromSelf`を見る。
`networkSendLatest`は同じキーで待っている物を置き換えるので、続けて変えても物ごとに最新の1件だけが出る。
ただし同じ席へ届く物があとに積まれていれば、元の物を消して最後尾に付け、あとの物を追い越さない。

受けた物は、`core/network/network-messaging`の`receiveEvents`が確かめてから流す。
この端末が自分にだけ流すイベント（`LOCAL_ONLY_EVENTS`。`OPEN_NETWORK`・`CONNECT_PEER`など）はだれから届いても捨て、サーバーだけが送るイベント（`AUTHORITY_ONLY_EVENTS`）はサーバー以外から届けば捨てる。
自分にだけ流すイベントを新しく作ったら、`LOCAL_ONLY_EVENTS`に足す。

`networkSend`だけで送る知らせは部屋の保存に入らないので、あとで読み込んだ部屋では再生されない（`callDiceThrow`・`callBattleCutIn`のJSDoc）。読み込んだあとも残したい状態は、同期オブジェクトの欄に置く。
一度きりの知らせを足すときは、`core/event/domain-events`に送る関数（`call…`）と、`networkMessage$`の`switch`から型付きのチャンネルへ流す枝を足す。
リプレイの記録は`networkMessage$`を聞き、`domain/replay/replay-interpreter`の`isIgnoredReplayEvent`が外す物のほかは録る。

リプレイの再生中は、`setNetworkIsolated(true)`（`core/network/network-isolation`）で部屋から切り離す。
その間、`networkSend`はその場の`localDispatch`に替わり、`ObjectSynchronizer`は物の同期のイベントを聞かない。

### フレームの形

送り物の塊は`core/util/message-pack`でMessagePackにし、1024バイト（`COMPRESSION_THRESHOLD_BYTES`）を超えてgzipで小さくなるときだけgzipにする（`core/network/frame-codec`）。
画像と音声の断片（`FILE_SEND_CHUNK_`で始まるイベント）は圧縮済みなので、別の塊に分けてgzipにかけない。
SkyWayでは、15.5KBを超える塊を断片に分けて送る。全員宛ての塊は`ttl`を1つ持ち、送り主がまだつながっていない席へは、受けた席が1回だけ中継する。
部屋のサーバーでは、1つのバイナリフレームに1つの封筒（`ClientMessage`か`ServerMessage`）を入れ、送り物は256KB（`MAX_FRAME_BYTES`）に収まるまで半分に割る（`core/network/server/server-frames`）。
テキストフレームは`ping`と`pong`だけである。

### SkyWayの送る順

SkyWayでは`SkyWayDataStream`（`core/network/skyway/skyway-data-stream`）が相手ごとに3本の待ち行列を持ち、`ping`とその折り返し、制御、まとめ送りの順に出す。
まとめ送りに入るのは画像・音声・モデルの断片だけの塊で、ほかの塊はすべて制御に入る（`SkyWayConnection.send`が`splitAtFileChunks`の分け方で決める）。中継する塊と席の一覧の塊も制御に入る。

同じ待ち行列の中では積んだ順に出るので、物の更新どうしの順と断片どうしの順は変わらない。
制御と断片の間の順は保たず、断片のあとに積んだ制御は断片より先に届くことがある。
転送の始まりの知らせ（`START_FILE_TRANSMISSION`など）は制御で、最初の断片より先に積むので先に届く。

データチャネルが抱えている量（`bufferedAmount`）が上限に達すると、その種類は送らずに待つ。

| 種類         | 上限  | 定数                         |
| ------------ | ----- | ---------------------------- |
| `ping`と制御 | 1MB   | `CONTROL_BUFFER_LIMIT_BYTES` |
| まとめ送り   | 256KB | `BULK_BUFFER_LIMIT_BYTES`    |

チャネルに渡した分は追い越せないので、まとめ送りの上限を低くして、制御の前に入っている断片を少なくしている。
制御が続く間も、断片が待っていれば、制御を64KB（`BULK_FLOOR_BYTES`）出すたびに断片を1つ出す。この1つはまとめ送りの上限に達していても出し、制御の上限に達していれば出さない。
`ping`は待ち行列の先頭から出るので、往復時間は断片の待ちを含まない。

`Network`の待ち行列と、塊を作って圧縮する`SkyWayConnection`の列は1本のままで、積んだ順に進む。
部屋のサーバーの経路は種類で分けずに1本で送る。

### 素材を頼む時機

ピアの間では、ネットワークを開いてから物の同期が初めて済むまで、画像・音声・モデルを相手に頼まない（`SharedAssetSharingSystem`、`core/storage/shared-asset-sharing-system`）。
`ObjectSynchronizer`は、頼んだ物がすべて届くか諦めた時点か、最初の席がつながってから5秒（`FIRST_SYNC_GRACE_MS`）たって頼む物が無い時点で、`FIRST_SYNC_SETTLED`を`localDispatch`で流す。流すのはネットワークを開くたびに1回だけである。

それまでに届いた素材のカタログには、空の入れ物を作り、相手のカタログが手元より少なければ自分のカタログを返す。頼むのは保留し、相手ごとに最新のカタログを1つ覚えておく。
`FIRST_SYNC_SETTLED`が流れると、覚えたカタログから優先する物（`preferredIdentifiers`）を先に頼む。
物の同期が済まなくても、最初の席がつながってから20秒（`FIRST_SYNC_HOLD_MAX_MS`）たてば頼む。
相手から頼まれた物は、同期が済む前でもすぐ送る。部屋のサーバーのある部屋では保留せず、置き場からの取り寄せも保留しない。

画像は、ある相手からの転送が届いている間、その相手に頼まない。
画像の転送はどの画像を運ぶかを名乗らないので、届き終わる前に来たカタログで頼むと、運ばれている画像をもう一度頼むことになる。カタログは覚えておき、転送を取り込んでから頼む。
音声とモデルの転送はファイルの識別子を名乗るので、届いている途中の物だけを除いて頼む。

転送は、次の断片が来ないと時間切れになる。送る側は断片を受け取った知らせ（`FILE_MORE_CHUNK_<識別子>`）を同じように待つ。
待つ長さは直前の断片にかかった時間の4倍で、10秒より短くも60秒より長くもしない（`transferTimeoutMs`、`core/storage/buffer-sharing-task`）。断片が1つ届くたびに待ち直す。

## 部屋のサーバー

### 切り替え

通信の方法は配備ごとに`assets/config.json`の`transport`で決め、部屋ごとには選べない。
`"server"`なら`ServerConnection`、それ以外はキーが無いときも含めてSkyWayになる（`core/network/transport`の`transportOf`）。
サーバーの場所は同じファイルの`backend.url`で、配布物の既定（`config.json.example`）は`skyway`である。
コードの中では、配備の違いを`Network.transport`で、いまサーバーの部屋にいるかを`Network.authorityPeerId`で見る。
後者はSkyWayと部屋の外では`null`で、domainからは`core/network/peer-context-source`の`getAuthorityPeerId()`で読む。

### 取り寄せの相手とサーバーの言葉

`ServerConnection`（`core/network/server/server-connection`）は部屋のサーバーへWebSocketを1本張り、サーバーが席の間を中継して部屋の物を持ち続ける。
サーバーは席の一覧に入らないが、一度だけ`CONNECT_PEER`で知らされ、`welcome`のすぐあとにサーバーのカタログが届く。
SkyWayとは次の3点で動きが変わる。

1. カタログの交換と取り寄せの相手は、サーバーだけになる（`syncPeerIds`と`tradesCatalogWith`）。
   サーバーは削除の記録を自分で持つので、そのカタログに載る物はいまある物として、手元の削除の記録から外す。
2. 手元で消した物の変更が届くと、`DELETE_GAME_OBJECT`を返さずにサーバーへ取り寄せ直し、サーバーの答えからだけ作り直す。
   物を失ったのはこの席だけかもしれず、返した削除がほかの全員から物を消すおそれがあるためである。
3. サーバーの言葉は版より強い。`AUTHORITATIVE_OBJECT`は版を見ずに受け入れて削除の印も外し、その席がしてはいけない変更を戻すときと、見えるようになった物を渡すときに届く。
   `WITHDRAW_GAME_OBJECT`は物とその子を削除の記録に残さずに取り去り、見えなくなった物と、その席が作ってはいけない物に届く。取り去った物は、また届けば入る。

だれに何を見せて何を伏せるかの期待値は`contract/visibility.json`にあり（`full`・`masked`・`hidden`・`pending`）、`application/sync/masked-objects.spec.ts`が読む。

### サーバーに頼む要求

役割とダイスは、席が自分で書かずにサーバーへ1対1で頼む。

| 要求           | data                                            | 断り            | 通ったとき                                                                                  |
| -------------- | ----------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `ROLE_REQUEST` | `{ peerId, role }`                              | `ROLE_REJECTED` | サーバーが`PeerCursor`の役割を書き換える。自分の役割が変われば`SERVER_ROLE_CHANGED`が流れる |
| `ROLL_REQUEST` | `RollRequest`（結果の行の下書きとコマンドなど） | `ROLL_REJECTED` | サーバーがBCDiceで振り、`serverRoll`を付けた結果の行を、頼んだ席も含めて全員に送る          |

役割の要求は、GMが席の役割を変えるとき（`features/lobby/peer-menu`）と見学への切り替え（`features/lobby/server-watch.service`）に出る。
ダイスの要求は`domain/dice/dice-bot`が出し、`ServerRollRequests`が答えを60秒待つ。
`MAX_ROLL_COMMAND_LENGTH`（4000字）を超える行と、部屋から切り離した卓で言った行は、手元で振る。

### 送る量とつなぎ直し

送り物は16ミリ秒（`SEND_GATHER_MS`）集めてから出し、`SendPacer`が11秒あたり9,000件・900フレームまでに抑える。
これはサーバーが接続を切る量（10秒あたり2万件・2,000フレーム）の半分より少なく、大きな部屋の読み込みは数回に分けて出る。

つながりが切れると、同じpeerIdで1・2・4・8・15秒後につなぎ直す。
その間に送った物は、`ROLE_REQUEST`（64件まで）、`DELETE_GAME_OBJECT`（2万件まで）、`FORGET_DELETED_OBJECTS`、物ごとの最後の変更だけを持っておき、入り直したら送る（`core/network/server/outbound-events`）。
ほかは捨て、入り直したときのカタログの交換で埋める。`ROLL_REQUEST`は持たず、ダイスボットが答えの無い要求を頼み直す。

### プロトコルの版と契約

`core/network/server/server-protocol`の`PROTOCOL_VERSION`（いまは6）が、Axeとサーバーのやりとりの版である。
版の違う`hello`はサーバーが`protocol-mismatch`で断るので、版の違うAxeとサーバーはつながらない。
封筒やイベントの形を変えたら、省略できる欄を足すだけでも版を上げる。

契約の持ち主は、backend（`udonarium_axe_backend`）の`apps/cloudflare/contracts`である。
`node scripts/sync-server-contract.mjs <ref>`が、そのコミットのフィクスチャを`core/network/server/contract/`へ写し、`PROTOCOL_VERSION`を`source.json`に書く。
型は写さず、Axeは自前の型を`server-protocol.ts`に持つ。両者の食い違いは、同じフィクスチャを読むspecが見つける。

| ファイル                       | 中身                                             | 読むspec                                                                     |
| ------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `lww.json`                     | 版の比べ方                                       | `server-protocol.spec.ts`                                                    |
| `messages.json`・`errors.json` | 封筒の例と断る形、接続を閉じる理由               | `server-protocol.spec.ts`                                                    |
| `events.json`・`limits.json`   | サーバーとの間だけのイベント、両側でそろえる上限 | `server-protocol.spec.ts`                                                    |
| `http.json`                    | HTTPの要求と返事の例                             | `server-protocol.spec.ts`・`server-login.spec.ts`・`server-room-api.spec.ts` |
| `visibility.json`              | 席ごとの見え方                                   | `application/sync/masked-objects.spec.ts`                                    |
| `source.json`                  | 写したコミットと版                               | `server-protocol.spec.ts`（`PROTOCOL_VERSION`と比べる）                      |

## 再描画と起動の順

アプリはZonelessで動き、データチャネルやWebSocketのコールバックはAngularの外で起きる。
そこで`receiveEvents`と`localDispatch`は、イベントを流したあと、`setNetworkTick`で渡された関数をマイクロタスクごとに1回呼ぶ。
`src/main.ts`は起動を終えたあと、その関数として`ChangeDetectionScheduler`（`ɵChangeDetectionScheduler`）の`notify(0)`を渡す。
物の変更の知らせは、`core/sync/object-event-extension`の`markForChanged`がマイクロタスクに集めて物ごとに1回`objectChanged$`を流し、`ObjectChangeService`が`versionOf()`・`collectionOf()`のsignalを進める。
このモジュールは読み込まれたときに`GameObject.onUpdate`と`ObjectNode.onChildrenChanged`を差し込むので、2つのクラスの側から読み込まれない所に置く（ストアの出入りの知らせ`objectAdded$`・`objectRemoved$`は`core/sync/object-store-events`に分けた）。こうしておくと、どちらが先に読み込まれても、できあがったクラスに差し込める。

`src/main.ts`は、前のページが頼んだブラウザのデータの消去を済ませてから`bootstrapApplication`を呼ぶ。
最初の画面を描く前に、`composition/app-providers`の`APP_INITIALIZERS`が次の順で走る。

1. `LanguageService.initialize()`。言語を決め、翻訳を読み込む
2. `AppInitializationService.initialize()`。`initializeNetworkMessaging()`と`ObjectSynchronizer.initialize()`を済ませ、`config.json`の読み込みを始める。
   続けて`DiceBot`・`Jukebox`などの部屋の物、既定のチャットタブ、自分の`PeerCursor`を作る
3. `StartRoomService.prepare()`。開始部屋が保存されているかを、待つ時間を区切って確かめる

`config.json`の中身は`loadConfig$`で届き、それを受けて`Network.configure`と待機の接続が始まる。
`loadConfig$`は購読より先に流れうるので、最後の値をあとの購読にも渡す`StickyEventChannel`にしてある。
起動の部品の間でDIが循環すると、`composition/app-providers.spec.ts`が落ちる。

## 同期する物を足すとき

- `@SyncObject(alias)`の`alias`は保存したXMLのタグ名で、通信でも型の名前になるので、変えずに一意に保つ。同じ`alias`を2度登録すると、2度目はログに出して無視する
- 古いAxeの席は、知らない`alias`の物を受けても作らない（`[ObjectSync] 未知のオブジェクト`）
- `@SyncVar`の欄のキーは、名前を渡さなければプロパティ名になる。
  プロパティ名を変えるときは、`@SyncVar('komaImageHeignt') komaImageHeight`（`domain/character/game-character`）のように元のキーを渡す
- 欄の無いデータは既定値で読む。保存したXMLに無い属性は、コンストラクタの既定値のまま残る。
  古いAxeの席から届いた物は`syncData`ごと置き換わり、無い欄は`undefined`になる。`ObjectNode`を継ぐ物（`Config`・`GameTable`など）では、`getAttribute`が空文字を返す。読む側はどちらも既定値として扱う
- 空文字を0と読ませない（`Number('')`は0）。
  `Config`の部屋のルールは、数を`readRuleNumber`（空と負の数は答えなし、書くときは-1）で、はい・いいえを`readRuleFlag`（`'1'`・`'0'`・空）で読む（`domain/tabletop/room-rules`）
- 識別子は既定でUUID（`generateUuid`）。保存したXMLには識別子を書かず、読み込むと新しい識別子になる。
  ほかの物から識別子で指される物（`EffectPreset`・`Party`・`CutIn`・`BoardScene`・`ScenarioText`）だけが、`core/sync/persisted-identifier`で書き出して読み戻す
- destroyした識別子では作り直せない。手元の`ObjectStore.add`は通しても、ほかの席とサーバーは削除の取り消しとして拒み、P2Pでは削除が返ってきて手元からも消える。
  同じ識別子で読み戻すときは、先に`ObjectStore.announceComingBack`で`FORGET_DELETED_OBJECTS`を送る（`domain/peer/room`の部屋の読み込みなど）
- 決まった識別子（`name_${親の識別子}`のような`名前_親ID`の形や、`DiceBot`・`Jukebox`のような固定の名前）は、destroyしない要素だけに使い、作っては消す要素は既定のUUIDにする。
  既定のエフェクトを作る`createDefaultEffectPresets`は、決まった識別子が消されていれば新しい識別子で作る
