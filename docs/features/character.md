# キャラクター

## キャラクターシート / コマ

- **シート再設計** — シートと設定をタブで分離。ポートレートギャラリー＋コマ画像セクション、ダークテーマ統合レイアウト
- **構造化シートビルダー** — セクション / カード単位の編集、ドラッグ並べ替え、per-card編集トグル、colspanトグル、セクションアイコン
- **アイコンピッカー** — テキスト入力をアイコン選択ポップアップに置換、コマ選択＋チャットスロットUI
- **ポップアップデータタグ選択** — キャラ単位で表示するデータタグを選択（インベントリタグ付き要素はロック）
- **範囲エリア設定パネル**と高度（altitude）コントロール
- **スキルテーブル** — GAP判定モード、判定候補ロジック
- **端数サイズ対応** — マルチヘクスの頂点スナップ、端数サイズ向けの頂点クラスタ台座
- **コマ画像の幅と縦横比** — 設定タブの「コマ画像の大きさを指定」を入れると、高さ（`komaImageHeight`、50〜750px）に加えて幅も指定できる。幅は`GameCharacter.komaImageWidth`（SyncVar、既定0）に持ち、0や正の数でない値は画像の縦横比を保つ。幅の欄を持たない古い保存も、見た目は変わらない。幅と高さの欄の間にある鎖のアイコンのボタンで、幅を別に持つ（10〜2000px）か、縦横比に戻すかを切り替える。縦横比を保っている間に幅を変えると、高さが比に合わせて動く。3Dモデルで描くコマでは、モデルの箱の大きさにも効く（`domain/character/piece-image-size`、`features/character/game-character-sheet/game-character-settings-tab.component`）

## ステルスと名前を隠す

- **ステルス** — コマの右クリックの「コマの状態」→「ステルス（GMと持ち主・仲間にだけ見える）」で、`GameCharacter.stealth`（SyncVar、`'1'`か`''`）を切り替える。切り替えられるのはGMと、そのコマの持ち主だけ（`StealthService.mayToggle`、`application/character/stealth.service`）。見えるのはGM・持ち主・そのコマのパーティの席だけで、暗闇や霧の有無にかかわらず、`tokenVisibleTo`と`seenByParty`（`domain/tabletop/token-sight`）が最初にこれを判定する。見える席では、絵を半分の不透明度で描き、印を付ける。コマのデータは全員に届き、隠すのは各席の表示だけ。部位は本体と同じに扱うので、本体がステルスなら部位も隠れる
- **名前を隠す** — `GameCharacter.hideName`（SyncVar、既定`false`）。切り替えはGMだけで（`RolePermissionService.canSeeHidden`）、コマの右クリックの「☐ 名前を隠す」で切り替える。GM以外の席では、名前を隠したコマに「☑ 名前を隠す（GMのみ）」を押せない項目として出す。名前が見えるのはGMと持ち主の画面で、ほかの画面では`common.hiddenName`の「？？？」に置き換える（`PieceNameService`、`application/character/piece-name.service`）。システムメッセージのように全員が読む行には、書く人が誰でも`SAID_HIDDEN_NAME`（「？？？」）を書く。どの言語で読んでも同じ記号にしてある（`domain/character/hidden-name`）

## キャラクターの取り込み

- **取り込みパイプライン** — ココフォリア コマJSON / キャラクター保管所 / キャラクターシート倉庫 / ゆとシート / CharaXivからキャラコマを生成（`domain/character/import`、`features/character/import-character`。取得と画像の解決は同じフォルダの`character-import.service`）
- **取得経路** — 保管所は直fetch（`Access-Control-Allow-Origin: *`）、倉庫はJSONP（CORS不可のためscriptタグ注入）。ゆとシートはキャラクターのURLを`mode=json`のアドレスに直して直fetchする（このサービスはJSONの取得をどのオリジンにも許している）。CharaXivはココフォリア形式の貼り付け。URLから取得の仕方を選ぶのは`detectImportFetchPlan`（`domain/character/import/import-source`）
- **正規化モデル** — `ImportedCharacter`（statuses / params / system固有sections）へ正規化し、`ImportedCharacterFactory`がdata-elementツリーを構築。保管所CoCは`NA1..NA14`を能力値・SANへ写像、倉庫は`base` / 配列（技能・コンボ・武器）をセクションへ展開。ゆとシートは、`weapon1Name`のように種類・番号・欄を並べたキーを、種類ごとのセクションと番号ごとのグループにまとめる。専用のプロファイル（`system-profiles/ytsheet-sw25-profile`）に合う形なら、そちらで読む

## データ要素（ゲームデータ）

- **`RANGE_SHAPE`フィールド型** — 射程シェイプをサムネイル付きで保持
- **min/maxの分割** — 基準値＋補正に分離し、実効上下限を算出
- **表示項目の既定はサンプル語彙から切り離した** — `DataSummarySetting`の`dataTag` / `tableDataTag` / `sortTag`の既定は**空**。空のあいだは卓のコマから推定する（`application/inventory/summary-items`の`derivedItemNames`：`cs-piece-gauge`付きを先に、次に多くのコマが共有するリソース、上限8件。表は推定結果の後ろに登録済み状態異常を足すが、推定が空なら表も空＝「表示項目が空です」の案内が出る）。サンプル部屋を作ったときだけ`makeSampleSummaryItems()`がHP/MP＋6能力値と`敏捷度`降順を書き込む。既存の部屋は保存値をそのまま尊重し、推定で上書きしない
- **表示項目は引用符でパス参照・空白入りの名前を書ける** — `domain/data/summary-tag-list`の`splitSummaryTags`が引用符付きトークンを1項目として切り出し、**引用を外して下流へ渡す**ので`DataElement.findElementByReference`のパス解決がそのまま効く（`"リソース/正気度"` / `"所持金 合計"`）。裸の`/`は従来どおり改行マーカー。改名追従の発火条件は`tagLeafNames`でパス末尾の名前と照合する（途中のグループを改名するとパスは切れる。名前で参照している以上の制約）
- **項目の別名** — 部屋は、シートごとに名前の違う同じ値に1つの名前を付けられる。表は`DataSummarySetting.elementAliases`（SyncVar、`writeElementAliases`が書くJSON。既定は空文字）に持ち、`aliases`で読む。欄のない古い保存、空文字、JSONとして読めない値、名前が空の項目は「別名なし」として読む（`readElementAliases`、`domain/data/element-alias`）。別名を知らない版は属性を無視するので、今までどおり動く
- **別名の解決は1か所** — 名前で項目を探す所は`findReferencedElement` / `findReferencedElements`（`domain/data/element-reference`）を通る。別名に当たれば候補を上から`DataElement.findElementByReference`で探し、最初に1つに決まった項目を読む。同名が複数あって決まらない候補は飛ばし、どれも当たらなければ`null`（同名の項目へは落ちない）。別名でなければ今までの解決のまま。表は引数で渡せ、省くと部屋の表を`DataSummarySetting.aliasesInRoom()`で読む（ストアを見るだけで、設定を作らない）。通る所は、インベントリの表示項目と並び順（手番の順も同じ並び）、`{名前}` / `t{名前}`と画像の参照、`StatusAccessor`（`:`記法・バフの修整・リモコン）、移動力の項目名、トリガーのリソース、射線のルールの項目名。シートの計算式（`data-element-calc-env`）と見本の部屋の初期値は別名を通らない
- **別名への書き込みは候補すべてへ** — `StatusAccessor.setValue` / `setText`は、そのコマで当たった候補すべてに書く。先頭に書いたあと、先頭が実際に持った値をほかの候補に書き、候補ごとの上下限で止める。ベースと補正値のスロットは同じ値をそのまま書く
- **直接の編集は仲間へ運ぶ** — シート・インベントリの欄・コマの詳細・リモコン・PLツールの入力は`writeElementField`（`domain/character/alias-mate-follow`）で書く。書いた席が同じ`GameObject.batch`の中で、同じ別名に当たる仲間の項目（`aliasMatesOf`）へ値を運ぶ。リソースの現在値は仲間の現在値へ、最大値は仲間の最大値へ、ふつうの項目の値は仲間の現在値へ運び、すでに同じ値の仲間には書かない。項目の変更を購読して書き直す仕組みは持たないので、ほかの席から届いた値では何も書かない
- **リソースの棚卸しは1か所** — 「何がリソースか」「コマの集合で何を名前で操作できるか」は`domain/character/resource-catalog`（`isResourceElement` / `isResourceField` / `resourceElementsOf` / `resourceNamesOf` / `resourceCatalogOf`）。リモコン・PLツールのインライン編集・コマのバーの増減演出・マップエディターの項目名一覧が同じ判定を使い、ICON/POS（シート内部のUI状態）の除外もここだけに書いてある。画面ごとに判定が違っていたのを揃えたもの
- **リソースのスロットは1つの語彙** — 現在値・最大値・上下限のベースと補正値を`domain/data/resource-slot`の`ResourceSlot`に統一。`StatusAccessor`・チャットの`:`記法・バフの`&!`修整・リモコンが同じ語彙を使い、`HP^` / `HP_MAX` / `HP_MAX_BUFF` / `HP_MIN` / `HP_MIN_BUFF`の読み取りも`readNamedResourceSlot`の1か所。知らないスロット名は現在値として読むので、古いピアが書いたバフもそのまま動く
- **オーバーリソース** — リソースの項目の設定で「オーバーリソース」を入れると、現在値が最大値を超えられる。一時的な補正などを、最大値を戻り先にして扱うためのもの。属性`cs-over-resource`（`DataElementAttribute.OVER_RESOURCE`）が`'true'`のときだけ効き、印のない古い保存は今までどおり最大値で止まる（`allowsOverResource`、`domain/character/over-resource`）。上限を外すのは`domain/character/status-accessor`の`heldWithinBounds`で、シートの現在値の入力欄も最大値を上限にしない。切ると、最大値を超えていた現在値を最大値に戻す（`features/data-element/game-data-element-field-options`）
- **項目の既定値** — 項目は、リセットで戻る先の値を属性に持てる。`cs-default`（今の値。リソースは現在値、ほかは値）、`cs-default-max`（リソースの最大値）、`cs-default-max-correction`と`cs-default-min-correction`（最大値と最小値の補正値）の4つで、読み書きは`domain/character/default-value`に集めた。属性がない項目、空文字、空白、数として読めない値は「既定値なし」と読み、0とは読まない（`readDefault`）。0を既定値にするときは`"0"`を書く。チェックは`0`と`1`だけを読む。持てるスロットは`defaultSlotsOf`が決める。リソースは4つ、数値・チェック・テキストの行は今の値の1つ。長文・選択・計算・画像、古いチェック表の下のセル、`cellKind`を持つセル、シートの「立ち絵位置」と「コマ画像」の下の項目は持てず、属性が残っていても読まない
- **テキストの行の既定値** — 数値の種別ができる前のシートは数もテキストの行に持つので、テキストの行も既定値を持てる。行が数かどうかは`plainNumberIn`が決める。半角の数字に、前の符号と後ろの小数、前後の空白だけを許す。全角の数字、単位の付いた数、指数、ほかの基数は数と読まない。`:`記法がテキストから読む数（`3点`を3と読む）より狭い。`captureDefaults`は数でない行に既定値を付けず、付いていた既定値を外す。項目の設定に既定値の欄が出るのは、行が数を持つか、すでに既定値を持つときだけ。付いた既定値は、行が数でなくなっても読め、戻すとその数を書く
- **既定値を付ける・消す** — `captureDefaults(piece)`は、コマと`partsAlong()`の部位の、既定値を持てる全項目に今の値を書く。リソースは現在値・最大値と両方の補正値で、補正のない項目は0を書く。補正値の既定値を書くのはこの関数だけで、項目の設定（`features/data-element/game-data-element-field-options`）の欄は`cs-default`と`cs-default-max`だけを書く。`clearDefaults`は、持てない種別に残った属性も外す。どちらもシートの上部のボタンと、細いシートのメニューから呼ぶ（`features/character/game-character-sheet`、`DataElementEditService`）。件数を示した確認を先に出す。取り込みと新しいコマの雛形は既定値を書かない
- **既定値へ戻す** — `resetPieceToDefaults`は1体、`resetToDefaults`は部位も、`resetElementToDefaults`は1項目を戻す。既定値のあるスロットだけを、最小値の補正・最大値の補正・最大値・現在値の順に書き、`heldWithinBounds`で項目の上下限に収める。同じ値は書かない。全部書いたあとで`followMates`が、別名ごとに最初に戻した項目の値を、同じスロットに既定値を持たない仲間へ運ぶ。項目が値を受け取るのは1度だけなので、結果は項目の並びによらない。シートの`↺`は`isOffDefault`が真の項目に出る。上下限で止まっている値は、限界の外の既定値にいるものとして扱う（`GameDataElementComponent.showsDefaultMark`）
- **リセット** — バフを外して値を既定値へ戻す処理は`domain/character/piece-reset`の`resetAcross(pieces, { rule, values }, ailments)`にある。渡したコマを1体ずつ扱い、全コマのバフを外してから値を戻す。ステータスを動かすバフは外れるときに動かした分を戻すので、値を先に戻すと、その分が既定値からもう一度動くため。卓全体のリセットもこの関数で、チャットの`&&リセット-`（`ResourceEditProcessor.resetTable`）、バフマネージャーの一括解除、コマのメニューが同じものを呼ぶ。`countReset`は何も書かずに届く範囲を数え、確認の文に出す。値は今の状態で数えるので、バフが動かしている項目も入り、実行後の件数と違うことがある
- **リセットの取り消し** — `ResetRecorder`が、リセットの操作がコマに届く直前に、バフの`snapshot()`とシートの全項目の値を控える（`watch`）。終わりに`finish()`が、コマごとの前後のバフと変わった欄を`ResetRecord`にまとめる。ドメインはサービスを呼べないので、記録は`emitResetCarriedOut({ messageIdentifier, record })`で渡す（`core/event/domain-events`の`resetCarriedOut$`）。このイベントは操作した端末の中だけで流れ、部屋には送らない。`features/character/reset-undo/reset-undo-event-handler.service`が受け、`ResetUndoService`（`application/character/reset-undo.service`）が報告の行の識別子と一緒に持つ。持つのは直近の1回だけで、メモリの中にあり、同期も保存もしない。`undoReset`はコマごとに、バフがリセット直後のままで、変えた欄がリセット後の値のままかを確かめる（`standsAsLeft`）。`buffs.restore`は控えにないバフを消すので、変わったコマと消えたコマには何もせず、数だけ返す。戻すときは`buffs.restore(buffsBefore)`のあと、補正・最大値・現在値の順にリセット前の値を書く。バフが戻るときに動かした欄も同じ値で書き直すので、ステータスは2回動かない
- **リセットのボタン** — `PieceResetService`（`application/character/piece-reset.service`）の`count`・`run`・`takeBack`を、コマのメニュー（`features/character/game-character/piece-reset-context-menu`の純関数と`GameCharacterMenuService.resetPiece`）とバフマネージャーが使う。メニューの5項目は「バフ・演出」のグループにじかに並び、`offeredPieceResets`が、そのコマで何も変わらない項目を落とす。`run`は見学の席では何もしない。報告は`sendSystemNotice('round', …)`で送り、行ができたときだけ記録を渡す。部屋が`round`の通知を送らない設定なら、`tellSelfSystemNotice`が、操作した席だけに宛てた行（`to`が自分の`userId`の`to-pl-system-message`）を`round`の既定のタブに書く。秘話と同じ扱いの行で、ほかの席には表示されず、ほかの席が保存したデータにも入らない。取り消しはこの行から使える。`takeBack`は、戻したコマがあれば同じタブに`feature.chat.reset.undoneNotice`を送り、元の行が自分宛てなら、これも自分宛てにする
- **チェック表（check-table）型** — 旧Markdownレンダラを置換
- 要素単位の原寸表示オプション（ポップアップ画像）
- 型ピッカーを`ng-select`化
- **消した行・グループ・セクションを元に戻す** — 削除ボタンは確認なしで即座に消し、画面下に「「名前」を削除しました」と「元に戻す」を6秒出す（`DataElementDeletionService`、`SnackbarService`）。消す前にXML・親・直後の兄弟・位置を控える（`domain/data/data-element-restore`）。戻すときは新しい識別子のコピーを同じ場所に読み込む。破棄した識別子は二度と使えないためで、そのあいだに同名の兄弟ができていれば名前をずらす。通知は1度に1つで、この席にしか出ず、新しい通知が出ると前の取り消しはできなくなる。`role="status"`でフォーカスを奪わずに読み上げ、ボトムシートより手前に出る
