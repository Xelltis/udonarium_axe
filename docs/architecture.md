# Udonarium Axe — アーキテクチャ設計

このドキュメントは**7層構造の設計思想と、各層の詳細な役割・パターン**をまとめたもの。
日々の開発で守るべき「規範ルール」は[CLAUDE.md](../CLAUDE.md)を参照。

## 仕組みごとの文書

層をまたぐ仕組みは、[architecture/](architecture/)の下のファイルに分けてある。機能ごとの設計は[features.md](features.md)から引く。

| ファイル                                                     | 扱う仕組み                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [同期と通信](architecture/sync-and-network.md)               | 同期オブジェクトの版、カタログの交換、送り方、部屋のサーバー、再描画と起動の順   |
| [保存と素材](architecture/save-and-assets.md)                | 保存データの形、旧データとの互換、素材の識別と共有、新しい種類のファイルの足し方 |
| [役割・公開範囲・言語](architecture/permissions-and-i18n.md) | 役割、公開範囲と秘匿、新しい機能で決めること、i18n                               |
| [卓の描画・入力・音](architecture/rendering-and-input.md)    | 床に敷く絵、画質、canvasの卓の押下、重ね順、別ウィンドウ、音の経路               |

## 全体像

```
composition → features → ui → application → infrastructure → domain → core
```

※ infrastructureは薄いため、applicationはdomainも直接importする

| レイヤー                | 一行サマリ                                                     |
| ----------------------- | -------------------------------------------------------------- |
| `@axe/core/*`           | 純粋インフラ。Angular非依存、Web APIラッパ                     |
| `@axe/domain/*`         | 純粋ドメインモデル。Angular / DOM非依存                        |
| `@axe/infrastructure/*` | domain ↔ DOM/Webのアダプタ層                                   |
| `@axe/application/*`    | Angular DIラップ層（@Injectableサービス群）                    |
| `@axe/ui/*`             | feature非依存の汎用UI部品                                      |
| `@axe/features/*`       | ユーザ向け1機能 = 1サブフォルダ                                |
| `@axe/composition/*`    | composition rootの合成コード。すべての層に依存可能             |
| `src/app/*.ts`          | composition root（`app.component.ts`等）。すべての層に依存可能 |

依存方向はESLintの`no-restricted-imports`で自動検査される（[eslint.config.ts](../eslint.config.ts)）。
`core`から`ui`までの各層の設定は、自分より左の層（`features`まで）へのimportをerrorにする。
`composition`はどの層の禁止にも入っていないので、下の層から`composition`へのimportは検査で止まらない。
`core`のspecは統合テストでdomainのインスタンスを使うためどの層もimportでき、featureのspecは台帳（`FEATURE_DEPENDENCIES`）の検査から外れる。
`core`・`domain`・`infrastructure`がAngularに依存しないことは検査していない。
`pre-commit`フック(staged分の`eslint`)で必ず検出されるため、新規ファイル追加時は層を意識する。

## 各レイヤー詳細

### `@axe/core/*`

純粋インフラ層。Angular非依存、Web APIラッパに徹する。

- **配下**: `audio`, `event`（`event-channel`, `domain-events`）, `input`, `logging`, `media`, `network`, `storage`, `sync`（同期エンジン）, `transform`, `util`
- **依存可能**: なし
- **入れる**: 純粋インフラ、I/Oラッパ、msgpack/XML serialization、event channel、`@SyncObject`のシリアライゼーション基盤、localStorageの読み書き（`storage/local-preference`）、どの層でも使う小さな部品（[横断の部品](#横断の部品)）
- **入れない**: ドメインモデルへの直接依存（spec内テストフィクスチャを除く）、featuresへのcallback登録
- **設計上の注意**: `core/storage/file-archiver.ts`等はdomainのSyncObjectに依存したいケースがある。
  その場合も必ず**構造的interface（`LoadGuard`等）をcore内に定義し、ObjectStoreのalias文字列でランタイム取得**することで、
  cross-layer型importを回避する

### `@axe/domain/*`

純粋ドメインモデル層。Angular / DOM非依存。

- **配下**: `alarm`, `battle`, `card`, `character`, `chat`, `chat-syntax`, `coin`, `data`, `dice`, `disclosure`, `effect`, `folder`, `game-clock`, `hotbar`, `inventory`, `map-editor`, `media`, `party`, `peer`, `replay`, `scenario-text`, `scene`, `tabletop`, `ui`, `visual-novel`, `vote`
- **依存可能**: `core`
- **入れる**: `@SyncObject`クラス、純粋計算（hex-geometry, table-layout, skill-table-judgement, 交戦エリアの`tabletop/zone/zone-queries`, 視界の`tabletop/vision-scene/`と`tabletop/los/`, 移動範囲の`tabletop/move/reach-build`, 手番の`tabletop/turn-machine`等）
- **入れない**: DOM API直接呼び出し（`document.*` / `window.confirm` / `addEventListener`）、Angularの`@Injectable` / `inject`、`infrastructure`以上のレイヤー
- **仕様**: シリアライズに耐えP2P同期できること。コンストラクタの副作用ゼロ
- **外の世界に頼む処理**: domainにinterfaceを置き、infrastructureで実装する。domainは実装を知らない。
  例: `media/jukebox-playback`の`JukeboxPlayback`は`infrastructure/media/jukebox-engine`が実装し、
  `application/media/jukebox-engine.service`が部屋のジュークボックスに差し込む。差し込む前は何も鳴らさない`SILENT_PLAYBACK`が入っている

### `@axe/infrastructure/*`

domain ↔ DOM/Webを橋渡しするアダプタ層。

- **配下**: `dice-3d`, `first-person`, `image`, `map-editor`, `media`, `model-viewer`, `replay`, `table-3d`, `tabletop`, `three-kit`, `ui`（`index.html`の読み込み画面を進める`loading-screen`）
- **依存可能**: `core`, `domain`
- **入れる**: domain ↔ 外部世界（Canvas, Audio, IndexedDB, MediaSession等）のアダプタ、domainが宣言したinterfaceの実装
- **入れない**: `application` / `ui` / `features`への参照、Angularの`@Injectable` / `inject`
- **例**: `replay/video/replay-video-renderer`は、domainの`replay/video/replay-video-timeline`が組んだ時間割から、リプレイ動画の1コマをCanvas 2Dに描く。描く内容（配置・字幕の折返し・カメラ）はdomainの純関数、描く手段だけがここ
- **例**: `media/jukebox-engine`は部屋のジュークボックスを鳴らすプレイヤー一式（フェード・クロスフェード・小節待ち）を持つ。`tabletop`のCanvas描画は卓と一人称視点で共有する

### `@axe/application/*`

Angular DIで`domain` / `infrastructure`をラップしたユースケース / 状態サービス層。

- **配下**: `battle`, `card`, `character`, `chat`, `dice`, `effect`, `file`, `game-clock`, `hotbar`, `i18n`, `input`, `inventory`, `lobby`, `logging`, `media`, `moderation`, `party`, `permission`, `replay`, `storage`, `sync`（`ObjectChangeService`）, `tabletop`, `turn`, `ui`（`PanelService` / `ModalService` / `ContextMenuService` / `ThemeService`等）
- **依存可能**: `core`, `domain`, `infrastructure`
- **入れる**: `@Injectable`サービス。複数featureが共有する状態管理（PanelService, ContextMenuService, ObjectChangeService等）。core/domainのAngular DI化レイヤー
- **入れない**: `ui`パーツや`features`の参照、特定feature専用UI開閉ロジック、1つのfeatureだけが使うサービス（そのfeatureの中に置く）
- **命名**: `*.service.ts`を中心とする。サービスのヘルパ純関数は同フォルダの`*-helpers.ts`
- **オーバーレイの部品**: パネルの枠・モーダル・右クリックメニュー・確認ダイアログなどのコンポーネントは、
  `application/ui/overlay-components.ts`のInjectionTokenで受け取る。トークンの提供は`composition/overlay-providers.ts`にある。
  サービスの静的フィールドにコンポーネントの型を代入する書き方はしない

### `@axe/ui/*`

featureに紐付かない汎用UI部品。

- **配下**: `components`（ui-panel, modal, context-menu, file-selecter…）, `directives`（draggable, resizable, rotable, movable, tooltip…）, `dragging`, `folder-tree`, `pipes`, `tabletop`（z-offset等のUI定数、回転の枠`turn-frame`やHUDを置く`hud-place.directive`など複数のコマが共有する部品）, `text-decoration`, `turn`。
  `ui/`の直下には重ね順の定数`z-layers.ts`と、ポップオーバーやパネルを置く位置を決める部品（`anchored-popover`・`panel-spot`など）がある
- **依存可能**: `core`, `domain`, `infrastructure`, `application`
- **入れる**: featureに紐付かない汎用directive / component / pipe。`TabletopObject`等のdomain型をプロパティに取るのはOK（型はdomain）
- **入れない**: 特定featureのcomponent名（`OverviewPanelComponent` / `ChatTab`等）をimportする構造。`features`に対する逆流
- 例: `MovableDirective`は`TabletopObject`型をinputにするが、`features/character/game-character`等の具体コンポーネントは知らない

### `@axe/features/*`

ユーザ向け1機能 = 1サブフォルダ。

- **配下**: 1機能1フォルダ。一覧は[eslint.config.ts](../eslint.config.ts)の`FEATURE_DEPENDENCIES`（台帳）のキーと一致する
- **依存可能**: `core`, `domain`, `infrastructure`, `application`, `ui`
- **入れる**: 1機能のUI（component + html）、そのfeature専用のcontext-menu builder / event-handler.service / helpers / spec
- **入れない**: 他featureのcomponentを直接importするのは原則禁止（共通化したいなら`ui/` / `application/` / `domain/`のいずれかへ）
- feature間でモデル経由（`domain/*`）以外の結合が必要な場合は、`application/`の薄いサービス経由で橋渡しする
- feature同士のimportは台帳にある辺だけ通る。`import()`による遅延importも同じ台帳で検査する。
  `panels`はどのfeatureからもimportでき、`panels`からの遅延importは制限しない（各featureのパネルを遅延で開くため）
- 台帳は循環してはならない。循環するとESLintの設定の読み込みが失敗する。2つのfeatureが互いを要るなら、共有する物を下の層へ移す
- イベント駆動の副作用（パネル開閉、サウンド再生等）は各feature配下に`*-event-handler.service.ts`を置き、`providedIn: 'root'`でAppComponentが`inject()`するだけで自動起動する設計

### `@axe/composition/*` + `src/app/*.ts`（composition root）

`AppComponent`と、すべてのSyncObjectシングルトンをDI登録する合成コード。
すべての層に依存可能。

- **配下**（`composition/`）: `app-config.service.ts`（設定読み込み）, `app-initialization.service.ts`（SyncObjectインスタンス化）, `app-providers.ts`（`APP_PROVIDERS` / `APP_INITIALIZERS`）, `overlay-providers.ts`（オーバーレイの部品のトークン）, `class-provider.ts`（`CLASS_SINGLETON_PROVIDERS`）, `before-reload.provider.ts` / `before-board-mode.provider.ts`
- **依存可能**: すべて
- 各featureのevent-handler serviceを`inject()`するのみで起動する
- applicationの常駐するサービス（`DiceThrowService`・`CutInService`・`GravityService`・`TurnOrderService`・`SkinService`など）も、
  `AppComponent`が`inject()`するだけで起動する。どれも`providedIn: 'root'`で自分のコンストラクタから購読を始めるので、注入した参照をフィールドに持たなくてよい
- 個別feature専用サービスを`app.component`に直書きしないこと。composition rootはあくまで「束ねる」役
- 該当ファイル: [src/app/app.component.ts](../src/app/app.component.ts)、[src/main.ts](../src/main.ts)、[src/app/composition/](../src/app/composition/)

## 同期 / DI基盤

- ドメインモデルは`@SyncObject(alias)`クラス + `@SyncVar()`プロパティで宣言
  ([src/app/core/sync/decorator.ts](../src/app/core/sync/decorator.ts))
- `@SyncObject`クラス群は**Angular DI外**（`ObjectFactory`が`new`で生成）
- プロセスに1つの部品（`ObjectStore` / `ObjectFactory` / `ObjectSerializer` /
  `ObjectSynchronizer` / `ImageStorage` / `AudioStorage` / `FileArchiver` / `AssetHttpStore`等）は
  `CLASS_SINGLETON_PROVIDERS`でDIに橋渡しされている
  ([src/app/composition/class-provider.ts](../src/app/composition/class-provider.ts))。
  Angular側は`inject(ObjectStore)`等で取得する
- Angularが作るクラス（service / component / directive / pipe）は、プロセスに1つの部品
  （`ObjectStore` / `ImageStorage` / `AudioStorage` / `AssetHttpStore`等）を`.instance`で読まず`inject()`で受け取る。
  ESLintで検査する（対象の一覧は[eslint.config.ts](../eslint.config.ts)の`PROCESS_SINGLETONS`）
- 同期される`Config` / `ChatTabList` / `DataSummarySetting` / `StatusAilmentCatalog` / `TableSelecter` / `TurnState`は対象外で、`.instance`のまま読む。
  `.instance`は読むたびに部屋にある今の物を引き直す。注入した参照は、部屋の物が差し替わった後も古い物を指しうる。
  そのためこの6つはDIに橋渡ししない。`inject()`で受けるとESLintが止める（`eslint.config.ts`の`SYNCED_SINGLETONS`）
- **ドメインモデルからDIサービスを呼ばない**。サービス側からモデルを操作する向きを保つ。
  DIの外にある純関数がサービスの値を要るときは、呼び出し側が引数で渡す

## イベント購読パターン

`ObjectChangeService.onObjectChangedFor()` / `onObjectChangedForAlias()`を使う。

```typescript
this.objectChange.onObjectChangedFor(
  () => [this.range().identifier, this.currentTable.identifier],
  (event) => this.setRange(),
  this.destroyRef
);

this.objectChange.onObjectChangedForAlias(
  [ChatMessage.aliasName],
  (event) => this.handleMessage(event),
  this.destroyRef
);
```

生の`objectChanged$.subscribe()`で`if (e.identifier !== ...) return;`する書き方は上記ヘルパへ移行済み。
生の購読が残るのは、すべての変更を聞く必要がある3か所だけで、理由はそれぞれのJSDocにある
（部屋の保存の要否を見る`room-archive-event-handler`、卓のキャッシュを持つ`TabletopService`、
裏返したカードのカットインを待つ`card-flip-cut-in`）。

## コンポーネントパターン

```typescript
@Component({
  selector: 'app-xxx',
  templateUrl: './xxx.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

- **テンプレートは外部ファイル分離**（`templateUrl`）
- **スタイルは原則テンプレート内Tailwind utility class**。`styleUrls` / `styles`は使わない。
  どうしてもTailwindで表現できない場合に限り`styleUrls`を許容するが、
  現状`.component.css`を持つコンポーネントは存在しない（例外なし）。SCSSは使わない
- 変更検知は`OnPush` + Signalsで駆動
- `markForCheck()`は使わない。`detectChanges()`はプロダクションコードでは3か所だけで、
  どれも作った直後のコンポーネントをその場で描き、次の行で描いた中身を使う
  （`panel-window.service`、`stamp-picker.service`、`bottom-sheet.service`）。
  ほかはテストヘルパー（[src/app/testing/panel-drag-recovery.ts](../src/app/testing/panel-drag-recovery.ts)・[src/app/testing/panel-layer.ts](../src/app/testing/panel-layer.ts)）と各specでのみ使用
- `@SyncObject`由来の値をtemplateでリアクティブに使うときは
  `versionOf()` / `collectionOf()`でsignalを取り、依存配線する
- `input.required<T>()`の値をテンプレート以外で読むときは`_initialized`フラグ等で
  ガードしてNG0950を避ける
- signalから決まる値をeffectで別のsignalに書き込まない。`computed`で導くか、
  利用者が書き換えられる値なら`linkedSignal`にする。effectは外の状態に写すときだけ使う
- 描画を待つのに`setTimeout`を使わず`afterNextRender`を使う。
  `ngAfterViewInit` / `ngOnDestroy`や`@Output` + `EventEmitter`は使わず、`afterNextRender` / `DestroyRef` / `output()`で書く

大きくなったコンポーネントは、次のどれかの形で分ける。

- 子コンポーネント。親の配置を変えないよう、hostに`class: 'contents'`を付ける
- コンポーネントの外のクラス。必要な値はhostのinterfaceで受け取る（`InventoryFolders`、`PieceRightDrag`）
- パネルごとに提供するサービス。パネルの状態と同じ場所で提供する（`MapEditorState`、`MapEditorFilesService`）
- メニューの組み立ては純関数（[context-menu builderパターン](#context-menu-builderパターン)）

## context-menu builderパターン

各tabletopオブジェクトのコンテキストメニューは`features/<scope>/<name>-context-menu.ts`
として純関数で実装する。コンポーネント本体は短く保ち、メニュー構築はspecを書いて挙動を固定する。
複数のfeatureが使う項目の組み立ては`application/ui/`に置く。ロック・オンオフ・高さの項目（`tabletop-context-menu-actions.ts`）、
壁のある卓で別の面へ移す項目（`surface-switch-context-menu.ts`）、一覧の行の並べ替え（`reorder-context-menu.ts`）、
重なったコマ（`overlap-context-menu.ts`）、複数選択（`multi-selection-context-menu.ts`）がある。

```typescript
export function buildXxxContextMenu(
  target: XxxModel,
  callbacks: { onShowDetail: () => void; ... }
): ContextMenuAction[] { ... }
```

## 卓の描き方

卓はthree.jsで1枚のcanvasに描く。GPUのAPIはWebGPUを主にし、使えない端末では自動でWebGL2に切り替わる。どちらも作れないブラウザでは、卓の場所に描けない理由と設定の場所を出す。名札・ゲージ・吹き出しのように文字や押し所の要る物は、canvasの上のDOM（HUD）に置く。

| 置き場                                      | 受け持ち                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `domain/tabletop/world/`                    | 卓の場面の型（`TableWorld`）と、地形の面・コマの板・水・空などを組む純関数                                    |
| `domain/tabletop/camera/`                   | カメラの式。盤の点と画面の点を行き来する行列を出す                                                            |
| `domain/tabletop/pick/`                     | 当たり判定の形と、画面の点から伸びる視線との交わり                                                            |
| `infrastructure/table-3d/`                  | three.jsのengine。遅延で読むチャンクで、場面の差分を受けて描く                                                |
| `application/tabletop/table-3d.service`     | 場面を`computed`で組み、`effect`でengineに渡す                                                                |
| `application/tabletop/table-camera.service` | 描いた視点と、卓がページのどこにあるかを持つ。`CoordinateService`と`TablePickService`はこれと式で点を変換する |
| `features/tabletop/game-table`              | canvasと、コマごとのHUDの部品を並べる                                                                         |

- **three.jsの囲い**: `three`・`three/webgpu`・`three/tsl`・`three/addons/*`と物理の`cannon-es`を読めるのは、`infrastructure/table-3d`・`infrastructure/dice-3d`・`infrastructure/model-viewer`と、その3つが共有する`infrastructure/three-kit`だけにする。外からは型と、ライブラリを読まない入口（`table-3d-port`・`table-3d-quality`・`model-viewer-port`など）だけをimportする。engineは`import()`で読むので、最初の画面がライブラリを待たない。この決まりは`infrastructure/three-fence.spec.ts`で固定している
- **秘匿**: 場面を組む関数は、`VisionService`が通した物だけを受け取る。見えない物は、メッシュにも影にも当たり判定にも出ない
- **HUD**: コマのタグ名と`data-testid`は、CSSで描いていたころと同じにしてある。各部品は自分の箱をcanvasが描く位置に置き（`HudFrameService`）、押す・右クリック・ツールチップを本物のイベントで受ける
- **新しい種類の物**: engineは、場面に初めて入った種類の物の描き方を先に組み（`compileAsync`）、組み上がってから描く。そのフレームの中で組むと、ページが1秒近く止まるためである

## 横断の部品

どの層でも要る小さな処理は、写しを作らず次の部品を使う。

| 用途                           | 部品                                                                                                                | 決まり                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| localStorageの読み書き         | `core/storage/local-preference`の`readLocal` / `writeLocal`                                                         | 保存を拒むブラウザでも例外を投げない。キーは`core/storage/storage-keys`の`STORAGE_KEYS`に足す。利用者の設定が読めなくなるため、キーの文字列は変えない |
| 呼び出しをまとめる             | `core/util/debounce`の`debounce` / `coalesce`                                                                       | `debounce`は最後の呼び出しから待って1回呼ぶ。`coalesce`は最初の呼び出しから待ち、その間の呼び出しを1回にまとめる                                      |
| 待つ                           | `core/util/delay`の`delay`                                                                                          | 描画を待つときは`afterNextRender`を使う                                                                                                               |
| 値を範囲に収める               | `core/util/clamp`の`clamp` / `clamp01` / `clampOr`                                                                  |                                                                                                                                                       |
| 色の分解と透明度               | `core/util/hex-color`の`hexChannels` / `withAlpha`                                                                  |                                                                                                                                                       |
| 画像の読み込み                 | `core/util/load-image`の`loadImage` / `ImageCache`                                                                  |                                                                                                                                                       |
| 要素の大きさの監視             | `core/util/observe-size`の`observeSize`                                                                             |                                                                                                                                                       |
| UUID                           | `core/util/uuid`の`generateUuid`                                                                                    |                                                                                                                                                       |
| ポインタの捕捉とドラッグの判定 | `core/input/pointer-capture`の`capturePointer` / `releasePointer`、`core/input/drag-threshold`の`DRAG_THRESHOLD_PX` |                                                                                                                                                       |
| コマの中心                     | `domain/tabletop/move/piece-on-grid`の`pieceCentreOf`                                                               | サイズ0のコマは点として扱う                                                                                                                           |
| ヘクス卓かどうか               | `domain/tabletop/hex-geometry`の`isHexGrid` / `isFlatTopGrid`                                                       | `GridType`の値を直接比べない                                                                                                                          |
| 部屋のルール                   | `application/tabletop/room-rules.service`の`RoomRulesService`                                                       |                                                                                                                                                       |
| 役割による可否                 | `application/permission/role-permission.service`の`RolePermissionService`                                           |                                                                                                                                                       |
