# Udonarium Axe — アーキテクチャ設計

このドキュメントは**7層構造の設計思想と、各層の詳細な役割・パターン**をまとめたもの。
日々の開発で守るべき「規範ルール」は[CLAUDE.md](../CLAUDE.md)を参照。

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

- **配下**: `alarm`, `battle`, `card`, `character`, `chat`, `coin`, `data`, `dice`, `disclosure`, `effect`, `hotbar`, `inventory`, `map-editor`, `media`, `party`, `peer`, `replay`, `tabletop`, `ui`, `visual-novel`, `vote`
- **依存可能**: `core`
- **入れる**: `@SyncObject`クラス、純粋計算（hex-geometry, table-layout, skill-judgement, 交戦エリアの`tabletop/zone/zone-queries`, 視界の`tabletop/vision/`, 移動範囲の`tabletop/move/reach-build`, 手番の`tabletop/turn-machine`等）
- **入れない**: DOM API直接呼び出し（`document.*` / `window.confirm` / `addEventListener`）、Angularの`@Injectable` / `inject`、`infrastructure`以上のレイヤー
- **仕様**: シリアライズに耐えP2P同期できること。コンストラクタの副作用ゼロ
- **外の世界に頼む処理**: domainにinterfaceを置き、infrastructureで実装する。domainは実装を知らない。
  例: `media/jukebox-playback`の`JukeboxPlayback`は`infrastructure/media/jukebox-engine`が実装し、
  `application/media/jukebox-engine.service`が部屋のジュークボックスに差し込む。差し込む前は何も鳴らさない`SILENT_PLAYBACK`が入っている

### `@axe/infrastructure/*`

domain ↔ DOM/Webを橋渡しするアダプタ層。

- **配下**: `dice-3d`, `first-person`, `image`, `map-editor`, `media`, `replay`, `tabletop`
- **依存可能**: `core`, `domain`
- **入れる**: domain ↔ 外部世界（Canvas, Audio, IndexedDB, MediaSession等）のアダプタ、domainが宣言したinterfaceの実装
- **入れない**: `application` / `ui` / `features`への参照、Angularの`@Injectable` / `inject`
- **例**: `replay/replay-frame-painter`はdomainの絵コンテをCanvas 2Dに描く。描く内容（配置・折返し）はdomainの純関数、描く手段だけがここ
- **例**: `media/jukebox-engine`は部屋のジュークボックスを鳴らすプレイヤー一式（フェード・クロスフェード・小節待ち）を持つ。`tabletop`のCanvas描画は卓と一人称視点で共有する

### `@axe/application/*`

Angular DIで`domain` / `infrastructure`をラップしたユースケース / 状態サービス層。

- **配下**: `battle`, `card`, `character`, `chat`, `coin`, `dice`, `effect`, `file`, `hotbar`, `i18n`, `input`, `inventory`, `lobby`, `logging`, `media`, `moderation`, `party`, `permission`, `replay`, `storage`, `sync`（`ObjectChangeService`）, `tabletop`, `turn`, `ui`（`PanelService` / `ModalService` / `ContextMenuService` / `ThemeService`等）
- **依存可能**: `core`, `domain`, `infrastructure`
- **入れる**: `@Injectable`サービス。複数featureが共有する状態管理（PanelService, ContextMenuService, ObjectChangeService等）。core/domainのAngular DI化レイヤー
- **入れない**: `ui`パーツや`features`の参照、特定feature専用UI開閉ロジック、1つのfeatureだけが使うサービス（そのfeatureの中に置く）
- **命名**: `*.service.ts`を中心とする。サービスのヘルパ純関数は同フォルダの`*-helpers.ts`
- **オーバーレイの部品**: パネルの枠・モーダル・右クリックメニュー・確認ダイアログなどのコンポーネントは、
  `ui/overlay-components.ts`のInjectionTokenで受け取る。トークンの提供は`composition/overlay-providers.ts`にある。
  サービスの静的フィールドにコンポーネントの型を代入する書き方はしない

### `@axe/ui/*`

featureに紐付かない汎用UI部品。

- **配下**: `components`（ui-panel, modal, context-menu, file-selecter…）, `directives`（draggable, resizable, rotable, movable, tooltip…）, `dragging`, `pipes`, `tabletop`（z-offset等のUI定数、`piece-label-facings`や`hex-pedestal-style`など複数のコマが共有する見た目）, `text-decoration`, `turn`
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
- 個別feature専用サービスを`app.component`に直書きしないこと。composition rootはあくまで「束ねる」役
- 該当ファイル: [src/app/app.component.ts](../src/app/app.component.ts)、[src/main.ts](../src/main.ts)、[src/app/composition/](../src/app/composition/)

## 同期 / DI基盤

- ドメインモデルは`@SyncObject(alias)`クラス + `@SyncVar()`プロパティで宣言
  ([src/app/core/sync/decorator.ts](../src/app/core/sync/decorator.ts))
- `@SyncObject`クラス群は**Angular DI外**（`ObjectFactory`が`new`で生成）
- それらシングルトン（`ObjectStore` / `ObjectFactory` / `ObjectSerializer` /
  `ObjectSynchronizer` / `ImageStorage` / `AudioStorage` / `FileArchiver` / `AssetHttpStore` /
  `ChatTabList` / `Config` / `DataSummarySetting` / `TableSelecter`等）は
  `CLASS_SINGLETON_PROVIDERS`でDIに橋渡しされている
  ([src/app/composition/class-provider.ts](../src/app/composition/class-provider.ts))。
  Angular側は`inject(ObjectStore)`等で取得する
- Angularが作るクラス（service / component / directive / pipe）は、プロセスに1つの部品
  （`ObjectStore` / `ImageStorage` / `AudioStorage` / `AssetHttpStore`等）を`.instance`で読まず`inject()`で受け取る。
  ESLintで検査する（対象の一覧は[eslint.config.ts](../eslint.config.ts)の`PROCESS_SINGLETONS`）
- 同期される`Config` / `ChatTabList` / `DataSummarySetting` / `TurnState`は対象外で、`.instance`のまま読む。
  `.instance`は読むたびに部屋にある今の物を引き直す。注入した参照は、部屋の物が差し替わった後も古い物を指しうる
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
  ほかはテストヘルパー[src/app/testing/panel-drag-recovery.ts](../src/app/testing/panel-drag-recovery.ts)と各specでのみ使用
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

```typescript
export function buildXxxContextMenu(
  target: XxxModel,
  callbacks: { onShowDetail: () => void; ... }
): ContextMenuAction[] { ... }
```

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
