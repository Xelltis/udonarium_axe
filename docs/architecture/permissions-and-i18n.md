# 役割・公開範囲・言語

新しい機能で「誰が見えて、誰が変えられるか」と「画面の文や同期する文をどの言語で出すか」を決めるための仕組みと決まりを書く。
物が席から席へ届く仕組みは[同期と通信](sync-and-network.md)に、機能ごとの公開範囲（ステルスや名前を隠すなど）は`docs/features/`の各ファイルにある。

## 役割

役割は`gm`（ゲームマスター）・`pl`（プレイヤー）・`guest`（見学）の3つで、各席の`PeerCursor.role`（SyncVar）が持つ（`domain/peer/peer-role`の`PeerRole`）。
知らない値は`pl`と読み（`normalizePeerRole`）、自分の`PeerCursor`ができるまでの`PeerCursor.myRole`も`pl`である。

できることは役割を次の3つの関数に渡して決める。画面とサービスは`application/permission/role-permission.service`の`RolePermissionService`から読む。
このサービスは`ObjectChangeService.trackMyCursor()`を読むので、`computed`やテンプレートで読めば役割の変更に追従する。
signalの外の判断は、`PeerCursor.myRole`をdomainの関数に渡す（`DisclosureService`など）。

| domainの関数        | `RolePermissionService` | 真になる役割 | 決めること                            |
| ------------------- | ----------------------- | ------------ | ------------------------------------- |
| `canRoleEdit`       | `canEditTabletop()`     | `gm`・`pl`   | 卓の物と遊びのルールを変える          |
| `canRoleSeeHidden`  | `canSeeHidden()`        | `gm`         | プレイヤーから伏せた物を見る          |
| `canRoleEditShared` | `canEditShared()`       | `gm`         | 1つの画面から全員の画面の設定を変える |

たとえばジュークボックスで曲を流すのは`canEditTabletop`、部屋のシャッフルとリピートは`canEditShared`で決める（`JukeboxPlaybackService`）。
部屋設定は、設定ごとの書ける人（遊びのルールの`'table'`と、全員の画面に出る物の`'shared'`）と読み書きの変換を、`ROOM_SETTINGS`（`application/tabletop/room-settings`）の1か所に持つ。パネル（`RoomSettingsAccessService.setting`）とAIの部屋設定の欄はどちらもこれを読み、`'table'`を`canEditTabletop`で、`'shared'`を`canEditShared`で通す。1つの画面だけに効く設定には誰の許しも要らない。

### 役割の決まり方

SkyWayの部屋では、役割もほかのSyncVarと同じく書いた席の値がそのまま届き、受けた席は確かめない。
部屋を作った席はGMになり（`features/lobby/room-setting`）、招待リンクで初めて入る席はリンクの役割を自分のカーソルに書く（`features/lobby/invite-join`）。
GMだった部屋でないのにGMのまま入る席は、PLにして入れる（`features/lobby/room-join.service`）。
席は自分でPLと見学を選べるが、GMを選べるのはいまGMの席か、GMがつながっていない部屋の席だけである（`PeerMenuComponent.isRoleSelfAssignable`）。
ほかの席の役割は、GMが相手のカーソルに書く（`PeerMenuComponent.reassignRole`）。
部屋の外で1人で遊ぶときは、見学の席もPLに戻す（`features/lobby/network-event-handler.service`の`playAlone`）。

部屋のサーバーでは、サーバーが役割を決めて`PeerCursor`を上書きし、席は役割の変更をサーバーに頼む。
仕組みは[サーバーに頼む要求](sync-and-network.md#サーバーに頼む要求)に、誰がどの役割になるかは[部屋のサーバー](../features/lobby-network.md#部屋のサーバーサーバー版ベータ)にある。

### 見学の席

見学の席が卓に書いた物を、部屋のサーバーは取り消すが、SkyWayの席どうしでは止めるものがない（`PeerCursor.isMyselfKeptOffTable`）。
そこでAxeの側で、見学の書き込みを次のように止める。

- 書き換えの判断は、どの画面から操作しても通るapplicationのサービスに置く（`TurnOrderService.canTakeTurns`・`StealthService.mayToggle`）。
  coreの部品にはcompositionから判断を渡す（`composition/app-initialization.service`が`FileArchiver.mayLoadDrops`に`canEditTabletop`を渡す）
- 画面ではボタンを`@if`で描かないか、`[disabled]`にする。サービスだけで止めると、押しても何も起きないボタンが残る
- 右クリックメニューは見学には開かない（`ContextMenuService`）。項目ごとに役割を見るメニュー（チャットの行のメニュー）だけが、`forGuests: true`で開く
- 卓に書くパネルはコンストラクタで`closeWhenOffTheTable()`（`application/ui/close-when-off-the-table`）を呼び、席が見学になったら閉じる。
  specは`expectClosesForAGuest`（`testing/closes-for-a-guest`）で書く
- チャットの発言から起きる操作は、同じ操作のボタンと同じ判断で止める。見学の発言は、リソースとバフの操作・立ち絵の切り替え（`ChatMessageService.sendMessage`）、卓のダイスへの反映（`DiceChatEventHandlerService`）、エフェクトの`《名前》`と戦闘カットインの`《vs》`（各featureの`*-chat-event-handler.service`）、ラウンドのコマンド（`TurnOrderService.canTakeTurns`）を起こさない。発言そのものは流れる。カットインは、SkyWayの見学がボタンでも流せるので、発言からも流せる

## 公開範囲と秘匿

物ごとの見え方は次の4つの仕組みで決める。

| 仕組み     | 置き場                                                   | 欄                                                                                       | 決めること                                   |
| ---------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| 公開範囲   | `domain/disclosure/disclosure`                           | `GameCharacter`・`Card`・`DiceSymbol`・`TextNote`の`disclosureMode`・`disclosureUserIds` | 中身（シート・メモの文・詳細）を誰が読めるか |
| 持ち主     | `domain/tabletop/ownership`                              | `owner`（ユーザーID）                                                                    | 物の種類ごとに違う                           |
| 見せる相手 | `domain/tabletop/shown-to`                               | `TableTrigger`・`TableAmbience`の`shownTo`                                               | 塗った地面を誰の卓に描くか                   |
| 伏せた形   | `domain/tabletop/withheld`・`domain/peer/withheld-table` | なし                                                                                     | 手元の物が、部屋のサーバーが伏せた形か       |

公開範囲は`gm`（「GMのみ」）・`selected`（「特定PL」）・`all`（「全員」）で、空と知らない値は`all`と読む（`normalizeDisclosureMode`）。
GMと持ち主はいつも読め、ほかの席は範囲で決まる（`canViewDisclosable`）。範囲を変えられるのはGMと持ち主で、見学は持ち主でも変えられない（`DisclosureService.canEdit`）。
画面はシートや詳細を開く前に`DisclosureService.canView`を聞く。

持ち主の意味は物の種類で次のように違う。

| 物     | `owner`の意味                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| コマ   | その人の持ちコマ。ステルスや名前を隠したコマも持ち主には見える                                                                                                                                            |
| ダイス | 出目を読める人。持ち主のいないダイスは全員が読める（`DiceSymbol.isVisible`）                                                                                                                              |
| カード | 覗いている人（`Card.isPeeking`）。表にする・伏せる・手札に移す・山札に入れると外れる。つながっているほかの席が覗いているカードは、GMも含めて誰も裏返さず、覗かず、取らない（`CardGameService.canHandle`） |
| メモ   | いつも中身を読め、公開範囲を変えられる人                                                                                                                                                                  |

持ち主を変えられるのはGMと持ち主で、持ち主のいない物は、卓を変えられる席が自分の物にできる（`DisclosureService.canSetOwner`）。
部屋のサーバーでは、GM以外の席がメモ・ダイス・カードに付けられる持ち主は自分だけで、中身を読めないメモは自分の物にもできない（`ownerRuledByServer`・`canClaimOwnership`）。
保存した`owner`と`disclosureUserIds`は保存したときの席のユーザーIDなので、部屋を読み込むとすべて外す（`domain/peer/room`で`clearOwnership`・`forgetChosenViewers`）。
選んだ相手を残すと、そのIDをあとで使った人に物が見えるためである。ファイルから卓へ出した物は、コマだけを出した人の物にする（`claimBroughtInPiece`）。

見せる相手は`master`（GMだけ）・`sight`（視界に入ったら）・`room`（全員）の3つである。値と古いデータの読み方は[機能塗り](../features/map-editor.md#機能塗りマップエディター)にある。

部屋のサーバーはGM以外の席に物の一部を伏せて渡すことがある。`isWithheldHere`は手元の物がその形か（表の見えないカード、それを含む山札、範囲の外のメモ、ほかの人のダイス）を答える。
そうした物では「コピーを作る」などの写しを作る項目を押せなくする。伏せた形の写しが、部屋の新しい物として全員に広がるためである。
卓は部屋を出たあともその形で残り（`isTableWithheld`）、その卓の保存には`withheld`の印が付く（`SaveDataService.isRoomWithheld`）。

### 視界

卓の物を描くかは、種類ごとに`TablePiecesService`（`application/tabletop/table-pieces.service`）の`shown`が決める。
コマは`VisionService.isTokenVisible`に、カード・山札・ダイス・メモ・コイン・光源は`VisionService.isPieceHiddenByFog`に聞く。
当たり判定の`TablePickService`も同じ`TablePiecesService`から形を取るので、見えない物は描かれず、押すこともできない（[卓の描き方](../architecture.md#卓の描き方)）。
一覧（インベントリ・ラウンド・チャットの話し手）は`VisionService.mayBeListed`で絞り、卓の外にある物はいつも載せる。

見る人（`VisionService.viewer`）がGMなら、卓のすべてが見える。PLは自分とパーティの目で見て、見学はPL全員の視界を合わせた範囲を見る。
GMは`previewAsUserId`で、あるPLや見学（`GUEST_PERSONA`）の見え方を確かめられる。
手番の知らせのように全員が読む行は、書いた席の見え方ではなく`VisionService.isSeenByParty`で決める。書くのがGMなら、その画面には卓のすべてが見えているためである。

### 届けない物と画面で隠す物

SkyWayでは、部屋のデータはすべての席に届き、各席の画面が隠す。秘話の行も全員に届き、`ChatMessage.isDisplayable`が宛先と送り主の画面にだけ出す。
部屋のサーバーは次の物を、席によって届けないか、一部を伏せて届ける。
期待値は`core/network/server/contract/visibility.json`にあり、サーバーの規則はAxeの画面の判断（`canViewDisclosable`など）と同じ結果になるようにしてある。

| 物                               | 伏せる相手                                              | 伏せ方                              |
| -------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| カードの表（絵・名前・文・詳細） | 表を見られない席（GMは見える）                          | 届けない                            |
| メモ                             | 公開範囲の外の席                                        | 題と文の文字を█にし、詳細は届けない |
| ダイス                           | 持ち主とGMのほか                                        | 出目を空にし、名前は届けない        |
| 秘話の行                         | 宛先と送り主のほか（GMも）                              | 届けない                            |
| シークレットダイスの行           | 送り主とGMのほか                                        | 本文を空にする                      |
| タブの行                         | そのタブを見られない役割（`plCanView`・`guestCanView`） | 届けない                            |
| シナリオテキスト                 | GMのほか                                                | 届けない                            |

コマはこの表にないので、部屋のサーバーでも全員に届く。
ステルス・名前を隠す・コマの公開範囲は、どちらの通信でもデータは全員に届き、画面で隠すだけである（[ステルスと名前を隠す](../features/character.md#ステルスと名前を隠す)）。
こうした物は次の決まりで隠す。

- 判断には共通の関数とサービスを使う。卓と一覧は`VisionService.isTokenVisible`・`mayBeListed`（ステルスは`domain/tabletop/token-sight`の`tokenVisibleTo`が最初に見る）、名前は`application/character/piece-name.service`の`PieceNameService`、中身は`DisclosureService.canView`を使う。欄を自分で読む面を作ると、その面から漏れる
- 全員が読む行には`PieceNameService.said`で名前を書く。名前を隠したコマは、書くのがGMでも`SAID_HIDDEN_NAME`（「？？？」）になる。行はログにも残る

## 新しい機能で決めること

- 誰が変えられるか。卓の物と遊びのルールなら`canEditTabletop`、全員の画面に出る設定なら`canEditShared`、持ち主に任せる物なら`StealthService.mayToggle`のようにGMと持ち主を見る。判断はサービスに置き、画面からも消す
- 誰が見えるか。全員か、中身を公開範囲で絞るか（`disclosureMode`を持たせ`canViewDisclosable`で読む）、卓の上で視界に従うか（`VisionService`）、GMだけか（`canSeeHidden`）
- 見学に何を出すか。読むだけの面は残し、書く面は閉じる（`closeWhenOffTheTable()`、右クリックメニュー）。卓の上は、PL全員の視界を合わせた範囲が見える
- 部屋のサーバーで届けないか。画面で隠すだけで足りなければ、backendの見え方の規則と`visibility.json`の期待値を足し、Axeの側では`isWithheldHere`にその種類を足す。契約の写し方は[プロトコルの版と契約](sync-and-network.md#プロトコルの版と契約)にある
- 全員に届く文をどう書くか。名前は`PieceNameService.said`で書き、読み手の言語で読ませる文は鍵のまま持つ（[同期する文](#同期する文)）

## 言語

翻訳は`@jsverse/transloco`で、言語は`ja`・`en`・`ko`の3つ、`defaultLang`と`fallbackLang`は`ja`である（`application/i18n/transloco.config`）。
始めの言語は`detectInitialLang()`が決める。このブラウザで前に選んだ言語（localStorageの`ui-lang`）があればそれを使い、なければブラウザの言語が日本語なら`ja`、韓国語なら`ko`、ほかは`en`にする。
`LanguageService.initialize()`は`APP_INITIALIZERS`の最初に走り、翻訳を読み終えてから最初の画面を描く（[再描画と起動の順](sync-and-network.md#再描画と起動の順)）。
メニューの命令`language`は`LanguageService.toggle()`で次の言語へ回し、`setLang`が翻訳を読んでから切り替えてlocalStorageに書く。
翻訳のファイルは`assets/i18n/<言語>.json?v=<アプリの版>`で読む（`TranslocoHttpLoader`）。版をアドレスに入れるのは、新しい版がブラウザに残った前の版のファイルで読まれ、足した語の鍵が画面に出るのを防ぐためである。

### 訳す場所

テンプレートは`transloco`パイプ（`TranslocoModule`）で訳す。
TypeScriptのクラスは`TRANSLATE_FN`（`application/i18n/translate.token`）を`inject`し、`t(key, params)`で訳す。
`TranslocoService`を直接使うのは、言語を切り替える`LanguageService`と、選んだ言語で動画の文を組む`application/replay/replay-video-studio.service`だけである。
Angularの外の純関数（メニューの組み立てなど）は、呼ぶ側から`t: TranslateFn`を引数で受ける。domainとcoreは訳さず、鍵を返す（`roleLabelKey`）か、言語によらない記号を使う（`SAID_HIDDEN_NAME`）。
TypeScriptで文を組むメソッドや`computed`は、`LanguageService.currentLang()`を読んで言語の切り替えに追従させる（`chat-message.component`の`displayName`）。

### 鍵の決まり

- 3つの言語で鍵をそろえ、空の訳を置かない。空の訳と無い鍵では、画面に鍵の文字列がそのまま出る。
  `testing/i18n-keys.spec.ts`が、鍵のそろい・空の訳・テンプレートに字で書いた鍵を確かめる
- 値から組む鍵（`'feature.tabletop.shownTo_' + SHOWN_TO`の値）はテンプレートを読んでも見つからないので、`testing/i18n-choices.spec.ts`の`CHOICES`に値の一覧を足す
- `ja.json`と`en.json`には`"feature.controller"`・`"feature.alarm"`・`"feature.vote"`・`"feature.dataElement"`というドット入りの最上位の鍵がある。
  `ko.json`は同じ物を`feature`の下に入れ子で持つ。Translocoは読み込むときに平らにするのでどちらでも引けるが、ja・enの`feature`の下に`controller`を作ると、同じ名前空間が2か所に分かれる。足すときは既にある塊に入れる
- JSONだけを変えたコミットでは、`pre-commit`のテストは走らない（`lefthook.yml`の対象は`src/**/*.{ts,html,css}`など）。上の2つのspecは手で流す

### 同期する文

チャットの行や名前のように同期する文は、部屋の全員がそれぞれの言語で読む。
読み手の言語で読ませる文は、訳さずに鍵のまま持つ。`encodeI18nMessage(key, params)`（`application/i18n/i18n-message`）が`@i18n:<鍵>:<引数のJSON>`の文字列を作り、読む側が`decodeI18nMessage(text, t)`で自分の言語に戻す。
包んでいない文と引数を読めない文は、そのまま返す。
引数の値も包んであれば先に戻してから埋める。コインの面の名前や手番の行動の種類のように、文の中に訳す物が入るときはこれを使う。
いくつかの文を1つの行にするときは`encodeI18nList(parts, separator)`で包む。読む側が各部分を戻してから区切りでつなぐ（投票の結果の行、アラームの開始の行）。

戻すのはチャットの行の本文（システムの行でも発言でも）とシステムの行の名前、ノベルの表示、配信用の透過画面（`features/streaming-overlay`）、リプレイ、ログの書き出しである。書き出すログは、書き出す人の言語で戻す（`SaveDataService`）。
システムの行は、`from`が`System`か、タグに`system-message`がある行である（`ChatMessage.isSystemMessage`）。投票とアラームは最後に発言した人の行として書く（`sendSystemMessageAsLastSpeaker`）ので、発言の本文も戻す。
システムの行の名前も`common.chat.systemName`を包んで持つ。

部屋に書くお知らせは全部この形で書く。書く席で`t()`に通してから書くと、書いた席の言語で全員に届き、保存したログにもその言語で残る。
値だけを運ぶのはドメインの出来事も同じで、アラームの時間切れは`AlarmTimeUpEvent`に秒数・対象・題を載せ、文は`features/alarm`のイベントハンドラが鍵で包む。
包んでいない引数の値は訳さずにそのまま渡る。名前を隠したコマの名前を、どの言語で読んでも同じ記号の`SAID_HIDDEN_NAME`にしてあるのはこのためである（`domain/character/hidden-name`）。
包んだ文は鍵のまま部屋の保存とリプレイに残る。使っている鍵の名前を変えたり消したりすると、古い行には鍵の文字列が出る。
