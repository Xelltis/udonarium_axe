# 画面とUI

## ウィンドウ操作

- **パネルをタブにまとめる** — タイトルバーを別のパネルへ重ねて落とすと1枚の枠にまとまり、名前の列で切り替える。名前をつまんで外へ引けば枠から出る。枠は名前・ボタン・透明度・縮み方を**いま見せているタブ**のものにする。畳むと中身も名前の列も引っ込む。狭い画面でも名前の列は出す（列しか裏のパネルへの道がないため）。まるごと別ウィンドウへ出すこともでき、枠のいまの大きさと位置で開いて、閉じると元の場所へ戻る（`ui/components/ui-panel/`、`application/ui/panel-drag.service`、`features/panels/panel-window.service`）
- **90°回転** — キャラクター詳細、チャット、チャットパレット、インベントリなどの共通ウィンドウを、右上のボタンで時計回りに90°ずつ回転。ボタンはFABの「テーブル関連」の「卓上ディスプレイ」か、部屋設定の「UI」タブの「卓上」で「ウィンドウを90°回転できるようにする」を入れたときだけ出る（卓を囲む画面のための機能なので既定は非表示）。移動、リサイズ、縮小、全画面表示、閉じる操作と併用できる（[利用方法](multi-angle.md#ウィンドウを90回転する)）

## モバイル（狭い画面）

- **モバイルレイアウト** — 幅768px未満の画面と、高さ500px以下で指で操作する画面（横に持った電話）では、上下分割のシェルに切り替え（上=テーブル / 下=チャット常時表示）。判定は`COMPACT_VIEWPORT_QUERY`で、`ViewportService.isCompact`が持つ。境目のドラッグでテーブルの比率を20〜85%（既定45%）の間で変えられ、localStorage（`ui-mobile-layout`）に永続化。デスクトップのFAB・GM/PLツールバー・時計・ゲーム内時間・方位磁石・通信品質・ミニプレイヤーは出さない。手札レールはメニューの「手札を開閉」で開く（`application/ui/viewport.service`、`application/ui/mobile-layout.service`、`features/mobile`）
- **機能の集約** — 下部バー（所有キャラクター / メニュー）から全機能へ到達。ツールバー固有だったマップエディター・同行・手札・暗闇・行動順送り・操作対象のパレットもメニューに集約し、GM限定項目はロールで出し分け
- **手動切替** — メニューの「パソコン版の画面を使う」でデスクトップ版へ、FABの「表示」の「スマホ版の画面に戻す」で復帰。戻す項目は、狭い画面でデスクトップ版を使っているときだけ出す（`MenuCommandService.isAvailable`）。選択は永続化（`MobileLayoutService.prefersDesktop`）
- **タッチ長押しのコンテキストメニュー** — `contextmenu`イベントはiOSで発火しないため、`PointerDeviceService`が400msの長押しを検出して合成（移動・複数指でキャンセル）
- **キーボードがないときの代わりの操作** — Altでのターゲット指定とShift + Altの一括解除、Shiftで開く移動の計画は、いずれもコマのコンテキストメニューからも辿れる（`game-character-context-menu.ts`の`onToggleTarget` / `onClearTargets` / `onPlanMove`）。移動の計画中に出る帯は、キーボードではスペースで切り替える跳び越えを**歩く／跳ぶの対**として並べる（いま効いているほうを塗るので、状態が読める）。帯そのものは卓への押下を通し、帯の中のボタンだけが受け取る（`MovePlanEventHandlerService`は`data-move-plan-control`の付いた要素への押下を卓への押下として扱わない）。説明文は指のときタップ・長押しの言い方に差し替える（`ViewportService.isTouch`）。マーキーは指のとき、既に何か選ばれていれば置き換えではなく反転する（`marqueeApply()`、`features/tabletop/game-table/rect-hit-test`）
- **パネルのモバイル化** — 全画面表示、ドラッグ/リサイズとハンドルの無効化、入力欄16px（iOSの自動ズーム防止）、表の横スクロール、多カラムの縦積み、ホバーでしか出ない操作の常時表示、「クリック」表記のタップ化
- **ビジュアルノベルモード** — モバイルレイアウトで開くと、シェルと手札レールを出さず、[ビジュアルノベルモード](visual-novel.md)の画面が全画面を使う。狭い画面（`isCompact`）では操作列を発言欄だけに畳み、「発言の設定」のボタンで残りを開く（`features/visual-novel/visual-novel-overlay`）
- **キャラクターシートは自分の幅で組む** — シートは自分の幅が36rem未満のとき、または電話のとき（`ViewportService.isCompact`、`(max-width: 767px), (max-height: 500px) and (pointer: coarse)`）に`data-narrow`を立てる。電話を横に持つと幅は足りても高さが足りないため、幅だけでは決めない。指の画面（`isTouch`）では幅を問わず`data-compact`を立てる（`features/character/game-character-sheet`の`narrowLayout` / `compactEditing`）。`data-narrow`のシートは1段組みになる。行の高さは44pxで、ラベルを値の横に置き、書き込める値は枠で描き、グループは字下げせず区切り線の見出しにする。長文は内容に合わせて3〜14行に伸びる。中身には`data-own-mobile-layout`の印を付け、全パネル一律のモバイル寸法から外す（入力欄16px＝iOSの自動ズーム防止だけは残す）
- **狭いシートの見出しとセクション移動** — `data-narrow`のシートは、ツールバーと立ち絵の列の代わりに、小さなコマ画像・キャラクター名・`⋯`の見出しで始まる。コマ画像は立ち絵をボトムシートで開き、`⋯`には「立ち絵」「コピーを作る」「保存」「すべて畳む」「すべて開く」が並ぶ（`character-sheet-context-menu`）。上端にはセクション名の列が貼り付き、読んでいる箇所を`IntersectionObserver`で点灯する。押すとそのセクションへ移り、畳んであれば開く。選んだセクションは1.2秒点灯を保ち、最下部では見えている最後のセクションを点灯する。セクションは幅を問わず見出しから畳める。畳んだ状態は識別子でなく名前でlocalStorage`ui-sheet-folded`に残す（`SheetViewPreferenceService`、最大200件）。部屋を読み直すと識別子は変わるが名前は変わらないためで、別のキャラクターの同名セクションも畳まれる。編集中のセクションは畳まない
- **数値とリソースの±ボタン** — 狭いシートか`pointer: coarse`の画面では、シートで読んでいる数値の両脇に`−` / `+`が出る。リソースは`− 12 / 20 +`の形になる（`showsSteppers()`）。1押しで1ずつ動き、上下限で止まる。限界側のボタンは淡くする（`value-stepper`の`stepValue` / `canStep`）。連打は最後の押下から450ms後に1回だけ書く（`STEP_COMMIT_MS`）ので、部屋とコマのバーには変更1件として届く。下限が0以上の値は数字キーパッド（`inputmode="decimal"`）を出し、負になりうる値は通常のキーボードのままにする（iPhoneの数字キーパッドにはマイナスが無いため）
- **行の編集は下から出るシートで** — `data-compact`のシートでは、編集中の行に名前・値・`⋯`だけを残す。`⋯`から「項目の設定」「グループの設定」「セクションの設定」を`BottomSheetService`で開く（`features/data-element/data-element-editor`、初回に遅延読み込み）。設定シートには種別のアイコン格子・並び・「移動先を選ぶ…」・複製・削除などが並ぶ。グループ末尾の「項目を追加」は、選んだ種別で項目を作り、名前を選択した状態でエディタに渡す。広いシートの行ボタンも同じ`DataElementEditService`を通るので、どちらから変えても同じ変更になる。設定シートは`isCompact`の画面では画面下からせり上がってキーボードの上に留まり、つまみを下へ引く・Escape・背景の押下で閉じる。それより広い画面では中央のダイアログになる。行は取っ手を指で引いて並べ替えられる（`data-element-touch-drag`。HTMLのドラッグ&ドロップは指では始まらないため）。6px動くとドラッグが始まり、上下56pxの帯では自動でスクロールし、`canDropStructureElement`が許す場所にだけ置ける。マウスのドラッグと、取っ手の長押しで開く並べ替えメニューも使える

## テーマ / UI基盤

- **ダーク / ライトテーマ** — グラスモーフィズムUI、ラベンダーパステルのライトテーマ。`ThemeService.resolved`が自動をOSの設定で解いた結果を、`<html>`の`theme-light` / `theme-dark`クラスにする。自動以外を選んだときは`data-theme`属性にも書く。別ウィンドウで開いた文書にも同じものを付ける（`application/ui/theme.service`）
- ユーザ選択式のlight / dark / autoトグル
- 演出のauto / on / offトグル（`MotionService`）— OSのreduced motionを既定値として読み、FABの「表示」の「アニメーション」で上書きできる。止めている間は`<html>`に`motion-reduced`クラスが付く
- `--ui-*`デザイントークンをTailwind themeにブリッジ
- **色の選び方** — 発言の色は、16色のプリセット（`CHAT_PRESET_COLORS`、8列×2段）とブラウザの`<input type="color">`から選ぶ（`features/chat/chat-color-setting`）。色の入力欄はどのパネルでも`<input type="color">`を使う。色選びのライブラリ（`@acrodata/color-picker`）はChromeのスポイトで不具合が出たため採らなかった
- **FABメニュー** — 機能は画面隅のFAB（`features/menu/fab-drawer`）から開く。並べ方は[ロビー / 部屋 / ネットワーク](lobby-network.md#ロビー--部屋--ネットワーク)。起動時は接続情報パネルを左上に開き、狭い画面（`isCompact`）でなければ、チャットウィンドウ（660×460）を左下に開いて接続情報パネルの上に重ねる（`app.component`の`startPanels`）
- ピアカーソルのpingアニメーションとアクセント表示
- `TextTooltipDirective`とパネル / モーダルタイトルの省略表示
- ウィンドウタイトルを`package.json`のversionから生成
- **ボタンの名前をすべて表示** — `?`キー（全角の`？`も可）で、FABのドロワーとGM / PLツールバーにあるボタンの名前をまとめて書き出す。普段は名前がポインタの下に1つずつしか出ず、初めての人が探し回るため。もう一度`?`を押すか、Escか、どこかを押すと消える。名前は横に描くだけでボタンを動かさないので、押したボタンはそのまま働く。入口はドロワー末尾の「ボタンの名前をすべて表示（? キー）」（命令`buttonGuide`）と、FABボタンの右クリックメニュー（並べ方の編集では消せない）。ビジュアルノベルモード（`?`を自分のキー一覧に使う）、モバイルレイアウト、配信オーバーレイの間は出さない（`application/ui/button-guide.service`、`features/button-guide/`）
- **ボタンの名前の配置** — `ui-button-guide`がバー内の`data-guide-label`（`ui-icon-button`は`label`から自動で付く）を測る。`buttonGuideLayout`（`ui/button-guide-layout`）は、画面の広い側に当たるバー端の外へ名前を1列に並べ、ボタンから縦→横に1回だけ折れる線でつなぐ。端に近いボタンほどバーに近い行を取るので、線どうしも、線と名前も交差しない。ドロワーはガイドを出している間は1列に固定する（2列だと内側の列の名前が外側の列に重なるため）
- **キー操作の一覧（チートシート）** — `domain/ui/keyboard-shortcuts`の`KEYBOARD_SHORTCUTS`が、画面ごとのキーと修飾キー付きの操作、説明のi18nキー、役割（`audience`）、マス目（`grid`）を持つ。キーの処理は各画面の純関数のままで、行に付けた`probe`を各画面のspecが流し、一覧表と処理がずれたら落ちる。`?`でボタンの名前と一緒に出す（`features/keyboard/shortcut-sheet.component`、表示は`ui/components/shortcut-sheet`）。並べるのは今の画面で使える節だけで、開いている編集画面（`ShortcutScopeService.hold`で名乗る）を先頭に、ダンジョンドリィマスターモードのあいだは卓と選択の節の代わりにその節を出す。置き場所は`shortcutSheetPlace`（`ui/shortcut-sheet-place`）が幅680・960・1120・1280の形を測り、ボタンの名前（`data-shortcut-sheet-avoid`と`data-guide-label`）とホットバーに重なる面積が最小の形と位置を選ぶ。z 145でツールバー・ホットバー・FABの下に置くので、空きがなくても名前を隠さない。押下は素通しする。ノベルモードのふきだしも同じ一覧表から描く

## スキン

- **この画面だけの配色** — パネルとメニューの色を、ライトとダークのそれぞれで選ぶ（`SkinService`、`application/ui/skin.service`）。部屋には配らないので、ほかの参加者の画面は変わらない。テーマが自動のときは、OSの設定で決まった側のスキンを使う。開く場所はFABの「表示」の「スキン」と、部屋設定の「UI」タブの「スキン」（`features/skin/`）
- **同梱のスキン** — ライトとダークに20種ずつあり、「標準」「色みで選ぶ」「見やすさ重視」「卓の雰囲気」「懐かしい配色」に分けて並べる（`domain/ui/skin`の`SKINS`）。スキンは色相や色の濃さなど数個の値（`SkinRecipe`）で表し、`skinTokens`（`domain/ui/skin-palette`）がそこから約40の`--ui-*`を作って`<html>`のstyleに書く。別ウィンドウで開いた文書にも書く。「標準」は何も書かず、スタイルシートのライト / ダークの色をそのまま使う。一覧でマウスを乗せたスキンは、画面を塗り替えずにパネルの見本にだけ映す（`tryOn`）
- **自分で作る** — 色相・色の濃さ・明るさ・地の沈み・アクセントの色相・アクセントの強さのつまみと、「境界と文字を強くする」で作る。つまみの範囲は、どう組み合わせても本文の文字と地のコントラストが4.5:1を下回らないように絞ってある（`MAX_LIFT`、`MAX_SPREAD`、`READABLE_GROUND`）。同梱のスキンも、本文・弱い文字・アクセントなど8組の文字と地が4.5:1以上になることをspecで確かめる
- **パネルの地の画像** — ライトとダークのそれぞれに6枚まで重ねる（`MAX_LAYERS`、`domain/ui/skin-layer`）。画像の重なりはスキンでなくライト / ダークの側に付くので、スキンを替えても残る。推奨の大きさは1600×1200、「並べる」で使うものは256px。1枚ごとに透過率・合わせ方（「画面いっぱい」「全体を収める」「並べる」「引き伸ばす」）・位置を持つ。画像はlocalStorageに収まらない大きさなので、専用のIndexedDB（`SkinImageStore`、`core/storage/skin-image-store`）に置く。24MBを超えるファイルと画像でないファイルは受け取らず、長辺2560pxまで縮めてから置く
- **保存とファイル** — 選んだスキン・自作の値・画像の並び・ダイスのマットは、ライト / ダーク別にlocalStorage（`ui-skin-light` / `ui-skin-dark`、`ui-skin-recipe-*`、`ui-skin-layers-*`、`ui-skin-mat-*`）に置く。一覧にないスキンのidは「標準」として読む（`asSkinId`）。「zip で書き出す」は`skin.json`と画像を`<名前>.axe-skin.zip`にまとめる（`SKIN_FILE_VERSION`は2、`domain/ui/skin-file`）。ファイルを読み込むときは、数値をつまみと同じ範囲に収めてから使う。マットは[ダイス](dice.md#ダイス)の「ダイスのマット」

## 描画を軽くする

- **切り替え** — FABの「表示」で「描画: 自動」「描画: 軽くする」「描画: 通常」を切り替える。スマホ版の画面では、メニューの下の段のボタンで切り替える。選んだ値だけをlocalStorage（`ui-render-lite`）に書き、自動の判定は開くたびにやり直す（`RenderLiteService`、`application/ui/render-lite.service`）。軽くしている間は`<html>`に`render-lite`クラスが付く
- **自動で軽くする端末** — Firefoxと、コア数（`hardwareConcurrency`）が2以下か、メモリ（`deviceMemory`）が2GB以下の端末（`prefersLightRendering`）。Firefoxは、動いている3Dの卓の上でパネルの背後をぼかす負担がChromiumよりずっと大きい。iPhoneとiPadはコア数とメモリで判定しない。WebKitはチップを問わずコア数を2と返し、メモリを返さないので、新しい機種まで遅い端末に数えてしまうため
- **軽くするもの** — パネルの背後のすりガラス（`backdrop-filter`）を外す。環境エフェクトの時刻を32ms刻みで進め、天候と地表の演出を描く回数をおよそ半分にする（`LIGHT_RENDERING_FRAME_STEP_MS`、`application/tabletop/ambience.service`）。天候の覆いは、投影し直す間隔を100msから400msに延ばし、覆いの画素を8px刻みで作る。視界の覆いとグリッドのcanvasは、画素の上限を1200万から400万に下げる（`LIGHT_OVERLAY_PIXEL_BUDGET`）。コマの頭上の吹き出しの影を消す。ダイスは画素比を1.5までにし、半透明の材質を樹脂で描き、同時に転がす数を200個までにする（[ダイス](dice.md#ダイス)）。「卓の画質: 自動」は「卓の画質: 軽」になる（`table3dQualityOf`）

## ウィジェット

- **出し入れ** — FABの「ウィジェット」で、PLツール・GMツール・時計・ゲーム内時間・方位磁石・録画・通信品質・ミニプレイヤー・ホットバーを出し入れする（`WidgetVisibilityService`、`application/ui/widget-visibility.service`）。PLツールはプレイヤーに、GMツールはGMにだけ並べ、ホットバーは見学者には並べない。表示の有無は席ごとにlocalStorage（`ui-widgets`）に残す。既定で出すのはゲーム内時間・録画・ミニプレイヤー・PLツール・GMツールで、時計・方位磁石・通信品質・ホットバーは出さない。既定を見直したときの扱いは[ゲーム内時間](gm-tools.md#ゲーム内時間と時間帯の空)のウィジェットの項目にある
- **置き場所** — ドラッグで動かした位置を、ウィジェットの名前ごとにlocalStorage（`ui-widget-layout`）に残し、次に出すときもそこへ置く（`WidgetLayoutService`、`ui/directives/widget-place.directive`、名前は`application/ui/widget-place`）。ウィンドウが小さくなっても、画面の端から8px内側へ引き戻す（`keepInView`）。動かしていないウィジェットは、それぞれの既定の位置に出る
- **ほかの節にあるウィジェット** — 方位磁石は[テーブル表示（2D / 3D）](tabletop.md#テーブル表示2d--3d)、ゲーム内時間は[ゲーム内時間と時間帯の空](gm-tools.md#ゲーム内時間と時間帯の空)、録画は[セッションログ](replay.md#セッションログリプレイ基盤)、ミニプレイヤーは[メディア / 音楽](media.md#メディア--音楽)、ホットバーは[ホットバー](pl-tools.md#ホットバー)、ツールバーからの時計とミニプレイヤーの切り替えは[PLツール / 手札](pl-tools.md#plツール--手札)
- **通信品質** — 自分の席から見た回線を、相手ごとに「良好」「やや不安定」「不安定」「切断」で並べ（測る前は「測定中」）、見出しにはいちばん悪い段を出す（`features/widgets/connection-quality`、`domain/peer/peer-link-quality`）。SkyWay版では相手ごとのpingと接続の健全度（`health`）で決め、pingが200ms以上か健全度が1未満で「やや不安定」、pingが500ms以上か健全度が0.5以下で「不安定」になる。中継サーバーを通っている相手には「中継サーバー経由」の印を付け、遅くなりやすい状態だと添える。部屋のサーバー版では、サーバーまでの往復時間と、各席からサーバーに最後に届いた時刻で決める（[部屋のサーバー](lobby-network.md#部屋のサーバーサーバー版ベータ)の「回線の見守り」）。出している間は`LinkWatchService.watch`で回線の見守りを続ける
- **描画の統計** — URLに`?stats=1`を付けて開くと出る、開発用のウィジェット（`features/widgets/render-stats`）。FABの「ウィジェット」には並ばず、表示の有無はほかのウィジェットと同じく`ui-widgets`に残るので、×で閉じるまで出し続ける。1秒ごとに、フレーム時間（中央値・95パーセンタイル・最大）と50msを超えたフレームの数、長いタスク、地形と卓の要素の数、地形と卓のコンポーネントの更新回数、性能カウンタ（`core/util/perf-counters`）を出す
