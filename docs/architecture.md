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

- **配下**: `network`, `storage`, `sync`（同期エンジン）, `input`, `event`（`event-channel`, `domain-events`）, `transform`, `logging`, `util`, `di`（`service-locator`）
- **依存可能**: なし
- **入れる**: 純粋インフラ、I/Oラッパ、msgpack/XML serialization、event channel、`@SyncObject`のシリアライゼーション基盤
- **入れない**: ドメインモデルへの直接依存（spec内テストフィクスチャを除く）、featuresへのcallback登録
- **設計上の注意**: `core/storage/file-archiver.ts`等はdomainのSyncObjectに依存したいケースがある。
  その場合も必ず**構造的interface（`LoadGuard`等）をcore内に定義し、ObjectStoreのalias文字列でランタイム取得**することで、
  cross-layer型importを回避する

### `@axe/domain/*`

純粋ドメインモデル層。Angular / DOM非依存。

- **配下**: `character`, `chat`, `tabletop`, `card`, `dice`, `vote`, `alarm`, `media`, `peer`, `data`
- **依存可能**: `core`
- **入れる**: `@SyncObject`クラス、純粋計算(hex-geometry, table-layout, skill-judgement)、`domain-events.ts`（イベントバス定義）
- **入れない**: DOM API直接呼び出し（`document.*` / `window.confirm` / `addEventListener`）、Angularの`@Injectable` / `inject`、`infrastructure`以上のレイヤー
- **仕様**: シリアライズに耐えP2P同期できること。コンストラクタの副作用ゼロ

### `@axe/infrastructure/*`

domain ↔ DOM/Webを橋渡しするアダプタ層。

- **依存可能**: `core`, `domain`
- **入れる**: domain ↔ 外部世界（Canvas, Audio, IndexedDB, localStorage, MediaSession等）のアダプタ
- **入れない**: `application` / `ui` / `features`への参照、Angularの`@Injectable` / `inject`
- **例**: `replay/replay-frame-painter`はdomainの絵コンテをCanvas 2Dに描く。描く内容（配置・折返し）はdomainの純関数、描く手段だけがここ

### `@axe/application/*`

Angular DIで`domain` / `infrastructure`をラップしたユースケース / 状態サービス層。

- **配下**: `sync`（`ObjectChangeService`）, `ui`（`PanelService` / `ModalService` / `ContextMenuService` / `ThemeService`等）, `chat`, `inventory`, `tabletop`, `file`, `i18n`, `media`, `storage`
- **依存可能**: `core`, `domain`, `infrastructure`
- **入れる**: `@Injectable`サービス。複数featureが共有する状態管理（PanelService, ContextMenuService, ObjectChangeService等）。core/domainのAngular DI化レイヤー
- **入れない**: `ui`パーツや`features`の参照、特定feature専用UI開閉ロジック
- **命名**: `*.service.ts`を中心とする。サービスのヘルパ純関数は同フォルダの`*-helpers.ts`

### `@axe/ui/*`

featureに紐付かない汎用UI部品。

- **配下**: `components`（ui-panel, modal, context-menu, file-selecter…）, `directives`（draggable, resizable, rotable, movable, tooltip…）, `pipes`, `tabletop`（z-offset等のUI定数）, `text-decoration`
- **依存可能**: `core`, `domain`, `infrastructure`, `application`
- **入れる**: featureに紐付かない汎用directive / component / pipe。`TabletopObject`等のdomain型をプロパティに取るのはOK（型はdomain）
- **入れない**: 特定featureのcomponent名（`OverviewPanelComponent` / `ChatTab`等）をimportする構造。`features`に対する逆流
- 例: `MovableDirective`は`TabletopObject`型をinputにするが、`features/character/game-character`等の具体コンポーネントは知らない

### `@axe/features/*`

ユーザ向け1機能 = 1サブフォルダ。

- **配下**: `chat`, `tabletop`, `character`, `card`, `controller`, `data-element`, `dice`, `file`, `inventory`, `lobby`, `media`, `vote`, `alarm`
- **依存可能**: `core`, `domain`, `infrastructure`, `application`, `ui`
- **入れる**: 1機能のUI（component + html）、そのfeature専用のcontext-menu builder / event-handler.service / helpers / spec
- **入れない**: 他featureのcomponentを直接importするのは原則禁止（共通化したいなら`ui/` / `application/` / `domain/`のいずれかへ）
- feature間でモデル経由（`domain/*`）以外の結合が必要な場合は、`application/`の薄いサービス経由で橋渡しする
- feature同士の直接importは[eslint.config.ts](../eslint.config.ts)の`FEATURE_DEPENDENCIES`にある辺だけ通る（`panels`はどのfeatureからもimportでき、台帳にない`mobile`と`button-guide`からのimportは制限しない）
- イベント駆動の副作用（パネル開閉、サウンド再生等）は各feature配下に`*-event-handler.service.ts`を置き、`providedIn: 'root'`でAppComponentが`inject()`するだけで自動起動する設計

### `@axe/composition/*` + `src/app/*.ts`（composition root）

`AppComponent`と、すべてのSyncObjectシングルトンをDI登録する合成コード。
すべての層に依存可能。

- **配下**（`composition/`）: `app-config.service.ts`（設定読み込み）, `app-initialization.service.ts`（SyncObjectインスタンス化）, `class-provider.ts`（`CLASS_SINGLETON_PROVIDERS`）
- **依存可能**: すべて
- 各featureのevent-handler serviceを`inject()`するのみで起動する
- 個別feature専用サービスを`app.component`に直書きしないこと。composition rootはあくまで「束ねる」役
- 該当ファイル: [src/app/app.component.ts](../src/app/app.component.ts)、[src/main.ts](../src/main.ts)、[src/app/composition/](../src/app/composition/)

## 同期 / DI基盤

- ドメインモデルは`@SyncObject(alias)`クラス + `@SyncVar()`プロパティで宣言
  ([src/app/core/sync/decorator.ts](../src/app/core/sync/decorator.ts))
- `@SyncObject`クラス群は**Angular DI外**（`ObjectFactory`が`new`で生成）
- それらシングルトン（`ObjectStore` / `ObjectFactory` / `ObjectSerializer` /
  `ObjectSynchronizer` / `ImageStorage` / `AudioStorage` / `FileArchiver` /
  `ChatTabList` / `Config` / `DataSummarySetting` / `TableSelecter`等）は
  `CLASS_SINGLETON_PROVIDERS`でDIに橋渡しされている
  ([src/app/composition/class-provider.ts](../src/app/composition/class-provider.ts))。
  Angular側は`inject(ObjectStore)`等で取得する
- DI管理外のクラスからDIサービスに触る必要があるときだけ
  `ServiceLocator.get<T>(token)`を使う
  ([src/app/core/di/service-locator.ts](../src/app/core/di/service-locator.ts))。
  **新規でドメインモデルからDIサービスを呼ぶ箇所を増やさないこと**。
  サービス側からモデルを操作する向きを保つ

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

生の`objectChanged$.subscribe()`で`if (e.identifier !== ...) return;`する書き方は
段階的に上記ヘルパへ移行する。

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
- `markForCheck()`は使わない。`detectChanges()`はDOM計測用途のみ
  （プロダクションコードでは使わず、テストヘルパー
  [src/app/testing/panel-drag-recovery.ts](../src/app/testing/panel-drag-recovery.ts)と各specでのみ使用）
- `@SyncObject`由来の値をtemplateでリアクティブに使うときは
  `versionOf()` / `collectionOf()`でsignalを取り、依存配線する
- `input.required<T>()`の値をテンプレート以外で読むときは`_initialized`フラグ等で
  ガードしてNG0950を避ける

## context-menu builderパターン

各tabletopオブジェクトのコンテキストメニューは`features/<scope>/<name>-context-menu.ts`
として純関数で実装する。コンポーネント本体は短く保ち、メニュー構築はspecを書いて挙動を固定する。

```typescript
export function buildXxxContextMenu(
  target: XxxModel,
  callbacks: { onShowDetail: () => void; ... }
): ContextMenuAction[] { ... }
```
