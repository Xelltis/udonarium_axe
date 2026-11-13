# ロビー・部屋・ネットワーク

## ロビー / 部屋 / ネットワーク

- **2D / 3Dは席ごと** — `ViewModePreferenceService`（`application/ui`、localStorage）が持ち、`TabletopService.mode2d`はそれだけを見る。`GameTable.mode2d`は**削除済み**（卓の決めごとではなくなったため）。卓の傾きロックは`game-table.component`のeffectが`mode2d()`を見て張り直す（テーブル切替時にしか再評価されず、切り替えても外れなかった）
- **メニューは命令表＋並べ方の2枚** — 押せるもの1つずつに固定のkeyを与えた`MENU_COMMANDS`（`domain/ui/menu-command`）と、面ごとの並び`MenuLayout`（`domain/ui/menu-layout`、入れ子は1段）。`MenuAction`は`panel` / `toggle` / `cycle` / `act` / `custom`の5種で、`custom`は行動順表示・ペルソナ・NPCバー・操作対象・射程のようにボタンでないものの逃げ道。**`audience`は命令表が持つ**のが要で、利用者のデータに入るのはkeyだけなのでlocalStorageを書き換えてもGM専用の命令は現れない（`MenuCommandService.run()`が`offers()`を再確認する）。発火と「いまどう見えるか」（切替の点灯・設定の現在値アイコン・保存中の無効化）は`features/menu/menu-command.service`の1か所。保存と読み込み・画面の開閉だけは画面が持つので`registerHost()`で受け取る。FAB・GMツール・PLツールの3面がこの1枚から描かれ、`FabEntry` / `FabSubmenuOpener` / 手書きHTML / `SeatButton`の4形と、ツールバーの手書き`<ui-icon-button>`は全部消えた（`features/seat-display`ごと削除）。i18nの抜けは`i18n-choices.spec`が`MENU_COMMANDS`の`labelKey`と既定の小窓の`labelKey`で拾う
- **並びはこの端末だけのもの** — `application/ui/menu-layout.service`（`axe.menu.fab` / `axe.menu.gmToolbar` / `axe.menu.plToolbar`）。**保存キーが無いときだけ既定**（状態異常カタログの「空なら配る」とは意味が違う。空にした人に配り直さないため）。リセットは既定を書き込むのでなく**キーを消す**ので、後の版で項目が増えたらその増分が入る。`parseMenuLayout`は寛容で、知らないcommandを**読み取り時には落とさず**描画時に落とす（新しい版で書いた並びを古い版で開いて戻したとき、消えていないように）。部屋のXML・`SaveDataService`・`FileArchiver`は一切触らない
- **編集パネル** — `features/menu/menu-editor-panel`（パネル名`menuEditor`、Favの「表示」から）。足す / 外す / 改名 / アイコン変更 / 小窓へ出し入れ / 上下。アイコンは`ui/components/icon-picker`の一覧から選ぶ。候補は`domain/ui/icon-font`の`ICON_FONT_NAMES`（同梱WOFF2の字形2,234種を、切り出し元の符号位置表で公開名に戻したもの。合字名は数字が英単語に化けるため字形名からは起こせない）で、**打つ前は命令表が使っているマークだけを出す**（2,234件を並べても選べない）。`icon-font.spec`が「既定のメニューが使うマークは全部描ける」を固定する。小窓の出る位置は`ui/anchored-popover`の`fitPopover`（立ち絵ピッカーと共用）。並べ替えと段替えはどちらも取っ手のドラッグで、`ui/dragging/row-reorder`の`RowReorder`に載る。**落とし先は`domain/ui/menu-layout-edit`の`menuDropSpot`が決める**（小窓の見出しの下半分は「中へ」・それ以外の隙間は隣り合う項目のもの・小窓を小窓の中身の隣に落とすとその小窓の隣に出る）。タッチはドラッグが始まらないので、行の右クリック/長押しに`buildReorderContextMenu`の上下と移す先を出す。足す側は`menu-command-picker`（同じ小窓の作法・名前とキーで絞り込み・**選んでも閉じない**ので続けて足せる）で、小窓は名前を聞かずに作って行で改名させる（同じことを二度聞かない）。編集操作は`domain/ui/menu-layout-edit`の純関数で、小窓の入れ子は`moveMenuNodeInto`が拒む。持ち出しは`domain/ui/menu-layout-file`のJSON 1枚（`axe-menus.json`）で、**面を1つも名指ししていないファイルはnull**（読むと全面が空になるため）
- **部屋設定パネル** — テーブルをまたいで効く決めごとを1枚に集める（`features/room-settings/`、パネル名`roomSettings`）。中身は`ROOM_SETTINGS_TABS`（一般/戦闘/移動/UI/自動保存/ユーティリティ）のタブ。UIタブは共通設定（コマの向きの示し方＝部屋ルール、コマ画像を常にカメラに向ける＝卓の属性）と個人設定（卓上ディスプレイ一式＝その画面のlocalStorage）に割る。読み取り専用の`inert`は共通設定側だけに掛ける（個人設定は誰でも触れる）。**読み取り専用の`inert`はタブの中身に掛ける**（hostに掛けると見学者がタブを切り替えられない）。自動保存タブは`RoomSnapshotPanelComponent`を埋め込む（`FEATURE_DEPENDENCIES`に`'room-settings': ['room-archive']`が要る）。自動保存の入切は`RoomSnapshotService.isKeeping`＝**localStorage**（ひかえはその端末の中にしか無いので、部屋の決めごとにしない）。`RoomArchiveEventHandlerService`は`markDirty`と`flush`の両方で見る。移動範囲・ZOC・1マスの距離・コマの向きは`GameTable`の属性のままだが、`Config`が同名の答えを持ち、`domain/tabletop/room-rules`の`resolveRoomRules()`が**フィールド単位でConfig → table → 既定**の順に解決する。`Config`側の「未回答」は文字列/enumが`''`・数値が`-1`・booleanが`''`/`'0'`/`'1'`（`_hideSystemAvatar`と同じ規約。素のbooleanだと未設定時の`JSON.parse('')`がconfig.xmlを丸ごと落とす）。**移行処理は無く**、パネルでその項目を初めて書いた時点がその項目の移行で、触らない部屋は永久に今までどおり動く。「テーブルごとに戻す」は`ROOM_RULE_GROUPS`単位で番兵を書き戻すだけ。既定ダイスボットもテーブル設定のフッタからここへ移した
- **招待リンク** — 接続パネルで部屋ID / 部屋名 / 合言葉（任意）/ ロールを載せたリンクを生成。開くと起動時に自動入室し、進行状況と失敗時のロビー導線をバナーで表示。リンクはハッシュフラグメントに載せるためサーバーログに残らず、合言葉は部屋固有のマスクを掛けて平文を出さない（`domain/peer/invite-link`、`features/lobby/invite-join`）
- **入室処理の共通化** — 部屋検索と接続を`application/lobby/room-join.service`に集約し、タイムアウトで決着させる（ロビーと招待リンクで共用）
- **部屋のサーバーで見学に切り替える** — 部屋のサーバーは、ログインしている席に、部屋が覚えている役割を`welcome`と`asset-token`の`keptRole`で知らせる。接続パネルの役割は、`keptRole`がGMかPLの席だけ、その役割と「見学」の2ボタンになる（`features/lobby/server-watch.service`）。押すと自分の`peerId`への`ROLE_REQUEST`で頼み、見学していることは部屋のサーバーが席の表とは別に覚える。入り直しても見学のまま座り、同じアカウントのほかの席も一緒に切り替わるので、Axeは何も覚えない。`keptRole`を足したので、やりとりの版（`PROTOCOL_VERSION`）は4に上げた。自分の頼みが断られたときは、ほかの人の役割の断りとは別の文で知らせ、サーバーの理由のコードは出さない
- ロビー / 部屋設定 / パスワード確認のUI再設計
- 部屋名を255文字まで拡張
- URLクエリによる再接続デバッグモード
- ネットワークエラーをチャットパネルに表示
- 部屋名をSkyWay member metadataでリレー
- **再読み込み直後の再参加待ち** — peerIdは再読み込みしても変わらず、去るページはチャンネルから抜けきれないので、前のメンバーが最長1分ほど残る。以前はその間の参加が`alreadySameNameMemberExist`で失敗し、汎用のネットワークエラーになっていた。いまは部屋とロビーへ参加する前に、同じ名前のメンバーが抜けるのを`onMemberLeft`で待つ（`core/network/skyway/same-name-member`）。期限はSDKのkeepaliveの間隔と猶予（各30秒）に5秒を足した長さで、部屋とロビーで共有する。相手のメンバーは消さない（複製したタブかもしれないため）。開くたびに中止用のシグナルを作り、閉じたり開き直したりすると待ちを取り消す。期限切れはerrorType`same-name-member`で、専用の文言を出して待機に戻り、汎用の再試行の回数には数えない。待っている間は、ロビーと招待のバナーに「前の接続が切れるのを待っています（最長1分ほど）」を出す（`RoomJoinService.waitingForPreviousConnection`）。参加は「開く」（待ちに10秒を足した長さまで）と「つなぐ」（15秒）の2段で、openとエラーは部屋のpeerIdで照らし、待機用の接続のものと取り違えない。一覧に残った自分の古いpeerIdは接続先から外し、ほかに誰もいなければ部屋を開けた時点で参加とする（GMが一人だった部屋）。ロビーは、参加の処理中は次の参加ボタンを受け付けない

## 同期 / 内部基盤

- `ObjectChangeService`のインデックス付きディスパッチ購読、`objectAdded$` / `objectRemoved$`、`aliasName`フィルタによる購読のスケール最適化
- `versionOf()` / `collectionOf()`のsignal API（テンプレートのリアクティブ配線）
- movable / rotableをインデックス付きobject-change dispatchに接続
- `CoordinateService`の`Transform`インスタンスプールでドラッグ中のGCを削減
- translocoによるi18n基盤の導入
