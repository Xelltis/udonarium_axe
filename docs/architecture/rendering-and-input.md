# 卓の描画・入力・音

新しい種類のコマや演出を卓に描くとき、canvasの卓で押下を効かせるとき、オーバーレイの重なりや別ウィンドウを扱うとき、新しい音を鳴らすときの設計を書く。
three.jsのengine、ライブラリの囲い、秘匿、HUDの置き方、新しい種類の物を先に組む決まりは[卓の描き方](../architecture.md#卓の描き方)にある。
一人称と三人称の機能は[一人称と三人称](../features/first-person.md)に、音の設定パネルと部屋の音量の機能は[メディアと音楽](../features/media.md)にある。

## 床に敷く絵

移動範囲や交戦エリアのように床に塗る印は、ページが2Dのcanvasに描き、その絵をthree.jsの床に貼る。

| 置き場                                        | 受け持ち                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ui/tabletop/laid-on-canvas-floor`            | `laidOnCanvasFloor`。部品が自分で描くcanvasを敷く。返された関数を描き直すたびに呼ぶ           |
| `ui/tabletop/floor-marks`                     | `layFloorMarks`。線・円・文字（`FloorMark`）を高さごとのcanvasに描いて敷く                    |
| `application/tabletop/floor-canvases.service` | `FloorCanvasesService`。敷いたcanvasの一覧を持ち、敷き直すたびに`revision`を上げる            |
| `infrastructure/table-3d/floor-canvas-layer`  | `FloorCanvasLayer`。canvasごとに`CanvasTexture`を貼った面を作り、`revision`が変われば写し直す |

部品が自分で描くcanvasは、game-tableの見えない箱（`invisible`で大きさ0）の中に置く。
canvasが盤のどこにあるかは、canvasの`style.left`・`style.top`・`style.width`・`style.height`を卓の画素として読む。
`laidOnCanvasFloor`は、canvasが無くなったとき、idが変わったとき、部品が消えたときに絵を外す。

平らな盤では、絵を`heightPx`の高さの水平な面に貼る。起伏のある地面では、地面のメッシュを`heightPx`だけ持ち上げた面（`gridOverGround`）に貼るので、印は丘に沿い、地面と同じように陰に隠れる。
前に立つ地形も絵を隠す。高さには`ui/tabletop/z-offset`の`Z_OFFSET_*`（卓の画素。大きいほど手前）を使う。
床と同じ平面にある物の前後は、polygonOffsetの順で決める（`infrastructure/table-3d/floor-order`）。盤、盤に重ねる絵、地形の面、厚みのない地形の面、格子と面に重ねる絵、床に敷くcanvasの順に手前へ出る。見え方の傾きに比例する分（factor）は、床やほかの水平な面と同じ平面に寝る面（厚みのない地形の水平な面と、上面まで床に沈めた地形の上面）にだけ付ける。ほかの地形の面は深度の段（units）だけで手前に出し、2枚の面が接する縁では、傾きによらず手前の面が描かれるようにする。幅・奥行き・高さのどれかが0の地形は、背中合わせになる2枚の面をそれぞれ外側からだけ描き、互いが透けないようにする。
床に敷いた絵は当たり判定に入らない。暗闇と霧は`TableVeilService`の別の経路で渡す。

## 盤に重ねるDOMと視点

`FloorPlaneDirective`（`[appFloorPlane]`）は、要素を盤と同じ大きさにし、CSSのtransformで遠近をつけて盤に重ねる。
中を卓の画素で並べると、canvasがその床の点を描く所に来る。視点が動くか卓が変わると、次のフレームで置き直す。
DOMなので地形には隠れず、canvasより常に手前に出る。game-tableでは範囲選択の枠をこの中に置く。

盤の点を画面へ写す式は、`TABLE_SCREEN`（`application/tabletop/table-screen`）から受け取る。
既定は卓のカメラ（`TableCameraService`）で、一人称のビューは自分の目で写す`FirstPersonScreen`をprovidersで差し込む。
盤にDOMを重ねる部品（`FloorPlaneDirective`・`table-effect-overlay`・`effect-target-overlay`・`table-altitude-guide-overlay`）は、`TableCameraService`ではなく`TABLE_SCREEN`を注入する。一人称のビューの中に置けば、そのビューの目で写す。
三人称は`TABLE_SCREEN`を差し替えない。`GameTableGestureService`が`ThirdPersonService.view()`を卓自身の視点の代わりに卓のカメラへ渡すので、HUDも当たり判定もそのまま三人称の視点に合う。

## 画質と軽い描き方

「卓の画質」（`Table3dQualityService`、localStorageの`axe.table.quality`）は、engineに渡す描き方の組を選ぶ（`infrastructure/table-3d/table-3d-quality`）。

| 画質       | 影を落とす明かり | 太陽と月の影 | ブルーム | アンチエイリアス |
| ---------- | ---------------- | ------------ | -------- | ---------------- |
| `high`     | 4                | あり         | あり     | `smaa`           |
| `standard` | 2                | あり         | あり     | `fxaa`           |
| `light`    | 0                | なし         | なし     | `none`           |

アンビエントオクルージョンはどの画質でも切ってある。
「卓の画質: 自動」は、軽く描く設定が効いていれば`light`、グラフィックカードが描くなら`high`、ほかは`standard`になる。

軽く描くかどうかは`RenderLiteService`（`application/ui/render-lite.service`、localStorageの`ui-render-lite`）が決める。
「描画: 自動」では、Firefoxと、コアが2つ以下かメモリが2GB以下の端末を軽く描く。iPhoneとiPadは、コアの数とメモリでは判定しない。
軽く描くあいだは、`<html>`の`render-lite`クラスでパネルの背景のぼかしを消す。格子・暗闇・天気の絵は粗く描き、環境エフェクトはフレームを間引き、転がすダイスの数と画素比を下げ、ガラスのダイスを樹脂で描く。
重い描画を足すときは、`RenderLiteService.active()`を読んで軽い描き方を用意する。

描き方そのものは、URLの`?renderer=`で`three`・`three-webgl2`・`none`から選べ、localStorageの`axe.table.renderer`に残る。
`none`は何も描かず、卓をページと当たり判定だけで操作するspecのためにある。

## GPUが描画を失ったとき

GPUがcanvasの描画を手放すと、engineの`onLost`から`Table3dService`の`restart()`が呼ばれる。
描画を失ったcanvasにはもう描けないので、`canvasGeneration`を1つ上げ、テンプレートの`@for`にcanvasの要素を作り直させる。
作り直すのは`RESTARTS`（3回）まで。それを超えると、卓の場所には覆い（`table-scene-cover`）が出たままになる。

## canvasの卓の押下

### 物の要素へ渡す

canvasには物の要素が無いので、押下はいったん卓の要素に届く。
`handCanvasPressesOn`（`features/tabletop/game-table/canvas-presses`）は、卓の根の要素で`pointerdown`・`mousedown`・`touchstart`・`click`・`contextmenu`・`dblclick`をcaptureで聞き、次の順に振り分ける。

1. 物の要素（`[data-object-id]`かwhite-board）の中の押下のうち、HUDの箱でもラベルでもないものは、その要素に任せる。操作部品（`button`・`input`・`.rotate-grab`・`[data-hud-control]`など）への押下はこれに当たる
2. 押した点から`TablePickService.pressedAt`で物を当てる。`mousedown`・`contextmenu`・`click`・`dblclick`は、`pointerdown`の点から1画素未満なら`pointerdown`の点で当てる。ブラウザが整数に丸めても、コマの縁で同じ物に渡すためである
3. HUDの箱（`[data-part]`・`[data-hud-box]`）とラベルへの押下は、当たった物が自分ならその要素に任せる。ラベルで何にも当たらなかったときも同じ
4. 当たった物が無いか`TabletopOverlapService`に登録が無ければ、箱への押下は卓の根の要素へ送り直し、ほかはそのまま卓に任せる
5. 要素の無い物（まとめて描く地形）は`contextmenu`だけを受け、登録した`openMenu`を呼ぶ
6. 要素のある物には、同じ押下の写しをその要素へ送り、元の押下は止める。写しが取り消されたら、元も取り消す

スクリプトが送った押下（`isTrusted`が偽）は、HUDの中の要素に送られても箱やラベルとして扱わない。
`pressedAt`は、固定した地形を素通りして後ろのコマを当てる。扉とスイッチは素通りしない。固定した地形の後ろで最初に当たる物がコマでなければ、固定した地形そのものを当てる。

### 当たり判定

`TablePickService`は、卓のカメラの逆行列から画面の点を通る視線を作り、物の形と交わらせる。
当てる物は、地形、`TablePiecesService`の`sprites()`と`coins()`から作るコマ、環境エフェクトの3種である。
canvasも当たり判定も同じ`TablePiecesService`を読むので、コマは描かれた所で押される。
形は`domain/tabletop/pick/pick-geometry`の`PickShape`（prism・quad・cylinder・floor・on-face・draped）で、`pick-index`の`pickAll`が近い順に並べる。
0.5画素（`SAME_DISTANCE_PX`）以内の差は同じ距離として、`order`の大きい方を手前にする。`opaqueAt`が偽を返す所は透けて後ろに当たる。

### マウスとタッチの身ぶり

| 操作       | マウス（`TableMouseGesture`）    | タッチ（`TableTouchGesture`）                  |
| ---------- | -------------------------------- | ---------------------------------------------- |
| 平行移動   | 右ボタン以外のドラッグ、矢印キー | 1本指                                          |
| 回転と傾き | 右ドラッグ、Shift+矢印キー       | 2本指のひねりで回転、2本指を上下に動かして傾き |
| 寄る・引く | ホイール、Ctrl+上下キー          | ピンチ、タップの直後にもう一度押して上下       |
| 右クリック | `contextmenu`                    | 400ミリ秒（`TABLE_LONG_PRESS_MS`）の長押し     |
| 範囲選択   | 何も無い所を350ミリ秒押し続ける  | 何も無い所を300ミリ秒押し続ける                |

どちらも動かした量を`GameTableGestureService`へ渡す。そこで寄りと引きの上限に収め、フレームごとに1回`TableCameraService`へ視点を渡す。
何も無い卓か中ボタンか右ボタンの押下は視点を動かし、物の押下ならドラッグの間だけ格子を出す。
三人称で追っている間は、視点を動かす身ぶりがコマの周りを回すことに替わる。
タッチの長押しは、ページ全体の長押し（`PointerDeviceService`）を取り消してから、押した要素へ合成の`contextmenu`を送る。範囲選択をドラッグしている間は送らない。

### 新しい種類の物を押せるようにする

1. 当たり判定に載せる。`TablePiecesService`のスプライトかコインで描く物は、`TablePickService`が`id`をスプライトの`owner`、`layer`を`kind`にした`PickTarget`を自動で作る。ほかの描き方の物は、`TablePickService`に形を作る処理を足す
2. 物のコンポーネントをHUDの中に置き、`appHudPlace`でcanvasが描く位置に合わせる。hostに`[attr.data-object-id]`を、押下を受ける箱に`data-hud-box`を付ける
3. 箱に`appMovable`を付けると、`MovableDirective`が箱を`TabletopOverlapService`に登録する。箱の大きさは描く大きさで、面の上の大きさとは違うので、`footprint`を渡す
4. ドラッグは、渡された`mousedown`・`touchstart`を`MovableDirective`が受けて始まる。置く面は`TablePickService.faceAt`で決まる
5. 右クリックはhostで`(contextmenu)`を聞く。タッチの長押しも同じイベントで届く
6. 箱の中で自分で押下を受ける部品には、`pointer-events-auto`と`data-hud-control`を付ける

## 重ね順

卓の層は`isolate`で独立した重ね合わせコンテキストになっているので、卓の中の物は画面の部品より手前に出ない。
画面の部品の段は、`ui/z-layers.ts`の定数と冒頭のコメントにまとめてある。

| z-index       | 部品                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| 小さな数      | パネルとカットインの窓。前に出すたびに数え直す。全画面とコンパクト表示のパネルは201                            |
| 100〜200      | ウィジェット、手札のレール、`Z_SHORTCUT_SHEET`、`Z_HOTBAR`、ノベルモードの覆い、`Z_TABLE_BANDS`、メニューのFAB |
| 900〜1010     | `Z_BATTLE_CUT_IN`、`Z_BOTTOM_SHEET`、`Z_SNACKBAR`                                                              |
| 9900〜2000000 | 右クリックメニュー、ドラッグの影、モーダル、`Z_HOTBAR_PINNED`、ドロップダウンと文字のツールチップ              |

パネルには決まった段が無い。`DraggableDirective`は、押したパネルを一番上の1つ上に置き、一番下が0になるよう全体をずらす。
`PanelOption.layer`を渡して開いたパネルは`data-z-layer`を持ち、この並べ替えから外れる。ノベルモードの窓やモーダルの上の画像編集がこれを使い、そこから開いたパネルも同じ段に立つ。
ボトムシートは、開いたパネルが1000以上の段にあればその1つ上に出る（`bottomSheetLayer`）。
新しい段が要るときは`ui/z-layers.ts`に定数を足し、何より上で何より下かをJSDocに書く。

## 別ウィンドウのパネル

`PanelWindowService`（`features/panels/panel-window.service`）は、パネルをポップアップのウィンドウに出す。
1枚のパネルは、本体で閉じて新しいウィンドウの層で開き直すので、打ちかけの行やスクロールの位置は残らない。タブでまとめた枠は、ビューごと新しいウィンドウへ動かすので残る。
コンポーネントはこのアプリに残り、ノードだけが新しいウィンドウの文書にある。ノードはその文書で作り（`select`の一覧をOSに渡すため）、スタイルシートを写す。
テーマのクラスやスキンの色のように文書に書く物は、`AttachedDocuments`の全部の文書に書く。
500ミリ秒ごとにウィンドウを確かめ、閉じられていればパネルを卓へ戻し、パネルが自分で閉じていればウィンドウも閉じる。指だけで操作する画面では出せない。

メニューやダイアログをどのウィンドウに出すかは、`OverlayLayers`（`application/ui/overlay-layers`）で決める。窓を開くと、その文書と層を`attach`で登録する。

| 開く物                           | 出す層                                                        |
| -------------------------------- | ------------------------------------------------------------- |
| 右クリックメニュー、ツールチップ | `front()`。フォーカスのある別ウィンドウ、無ければ本体         |
| モーダル                         | `current()`、無ければ本体                                     |
| パネル                           | 開いたパネルが立つ文書の層（`layerFor`）、無ければ本体        |
| ボトムシート、スタンプの選択     | 起点の要素の文書の層、無ければ`current()`、それも無ければ本体 |

枠のコンポーネントは、選んだ層のinjectorから`CONTEXT_MENU_COMPONENT`などのトークンで読む。
起点の要素があるオーバーレイを足すときは、`layerFor(element.ownerDocument)`を先に試す。
文書で要素を探すときも動きを聞くときも、グローバルの`document`ではなく要素の`ownerDocument`を使う（`InputHandler`・`DraggableDirective`）。

## 音の経路

### チャンネルと部品

AudioContextはページに1つで、`AudioOutput`（`core/storage/audio-output`）が最初に使うときに作る。
音は`VolumeType`のチャンネルを通り、チャンネルごとのGainNodeから直にスピーカーへ出る。全部に掛かる音量のノードは無く、`MASTER`はBGMのチャンネルである。

| `VolumeType`   | 個人の音量     | 部屋の音量     | 鳴らす物                                                       |
| -------------- | -------------- | -------------- | -------------------------------------------------------------- |
| `MASTER`       | `bgm`          | `bgm`          | ジュークボックスの曲（SEタグ以外）                             |
| `AUDITION`     | `audition`     | 全体だけ       | 試聴                                                           |
| `SE`           | `se`           | `se`           | SEタグの曲、部屋に足された効果音                               |
| `BACKGROUND`   | `background`   | `background`   | 環境音（`LoopPlayer`）                                         |
| `CUT_IN`       | `cutIn`        | `cutIn`        | カットインの音                                                 |
| `NOTIFICATION` | `notification` | `notification` | チャットの通知音、アラーム、手番のチャイム                     |
| `HANDLING`     | `handling`     | `handling`     | 組み込み音のうちダイス・コイン・カード・コマ・地形・鍵・掃く音 |
| `EFFECT`       | `effect`       | `effect`       | 残りの組み込み音（マップの演出、値の増減）                     |

1曲を流すのは`AudioPlayer`、1つの音を回すのは`LoopPlayer`、短い音をデコード済みのバッファで鳴らすのは`SoundEffects`である。
`AudioPlayer`の音は、フェーダーとトリムのGainNodeを通って`channelInput(volumeType)`へ入る。
`SoundEffect.play`は識別子だけを部屋へ送り、受けた席（送った席も含む）が`SoundEffect.kindOf`で決めたチャンネルに音量0.5で鳴らす。

### 音楽の経路とダッキング

`MASTER`のチャンネルには`MusicBus`（`core/audio/music-bus`）を差し込んである。
音楽はハイパスとローパスのフィルターを通り、上げている間だけつなぐエコーとリバーブを足され、ダッキングのGainNodeを通ってチャンネルの音量へ出る。
`MusicBus.installWhenReady()`は`AudioOutput.whenContextReady`を使い、AudioContextができたときに組む。操作の前にAudioContextを作るとブラウザが警告するためである。組めないブラウザでは、音楽はチャンネルの音量へ直に流れる。

`SidechainDucker`は`SE`と`CUT_IN`のチャンネルの音量のあとを50ミリ秒ごとに聞き、-45dBを超えたら音楽を9dB下げ、250ミリ秒静かになれば戻す。
聞くのは音量のあとなので、自分で消した種類の音では音楽は下がらない。
ダッキングは、部屋の設定で入っていてジュークボックスが再生している間だけ動く。

### 音量

各チャンネルの音量は、個人の音量（消していれば0）、部屋の全体の音量、部屋の種類ごとの音量の積で、`PersonalVolumeService.applyToChannels`が書く。
個人の音量を変えたときは`PersonalVolumeService`が、部屋の音量が変わったときは`MixEventHandlerService`が書き直す。値の持ち方は[メディアと音楽](../features/media.md)にある。

### 操作を待って鳴らし始める

ブラウザは、ページが操作されるまで音を出させない。
`AudioOutput.resumeOnGesture()`は起動時から`touchend`・`mousedown`・`keydown`（`USER_GESTURE_EVENTS`）を聞き、AudioContextを再開する。iOSは触れ始めたばかりのタッチからは鳴らさないので、指を離したときに再開する。
動き出したら聞くのをやめ、iOSがページを裏に回したときや電話で止めると、また聞き始める。

ジュークボックスの`AudioPlayer`と環境音の`LoopPlayer`は、再生を断られると`isAwaitingGesture`を立てる。
`JukeboxEngine`と`BackgroundSound`は`onFirstUserInteraction`で操作を聞き、部屋が鳴らしているのに操作待ちなら鳴らし直す。
パンやドラッグの終わりの`touchend`のように、ブラウザが鳴らす許しと数えない操作もある。そのため鳴り始めても聞くのをやめず、`JukeboxEngine`は`dispose`まで、`BackgroundSound`は部屋から消えるまで聞く。

### 新しい音を足すとき

- 組み込みの効果音は、`PresetSound`に欄を足し、`AppInitializationService.initializeAudioPresets`の`soundMap`にファイルを書く。操作音か通知音なら`preset-sound-kinds`の`HANDLING_KEYS`か`NOTIFICATION_KEYS`に足し、どちらでもなければ`EFFECT`になる
- 部屋の全員に鳴らすなら`SoundEffect.play`、この席だけなら`SoundEffect.playLocal`を使う。後者はチャンネルを渡せ、省けば`kindOf`で決まる
- 合成した音は、手番のチャイムのように`AudioOutput.channelInput(VolumeType.…)`へつなぐ
- 長い音や止める必要のある音は`AudioPlayer`に`volumeType`を設定して鳴らす。回し続ける音は`LoopPlayer`で鳴らし、`BACKGROUND`を通る
- カットインの動画は音声のチャンネルが届かない別のフレームで鳴るので、音量を換算して渡す（[メディアと音楽](../features/media.md)）
