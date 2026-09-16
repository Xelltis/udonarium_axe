# Udonarium Axe — アーキテクチャ設計

このドキュメントは **7 層構造の設計思想と、各層の詳細な役割・パターン** をまとめたものです。
日々の開発で守るべき "規範ルール" は [CLAUDE.md](../CLAUDE.md) を参照してください。

## 全体像

```
composition → features → ui → application → infrastructure → domain → core
```

※ infrastructure は薄いため、application は domain も直接 import する

| レイヤー                | 一行サマリ                                                      |
| ----------------------- | --------------------------------------------------------------- |
| `@axe/core/*`           | 純粋インフラ。Angular 非依存、Web API ラッパ                    |
| `@axe/domain/*`         | 純粋ドメインモデル。Angular / DOM 非依存                        |
| `@axe/infrastructure/*` | domain ↔ DOM/Web のアダプタ層                                   |
| `@axe/application/*`    | Angular DI ラップ層（@Injectable サービス群）                   |
| `@axe/ui/*`             | feature 非依存の汎用 UI 部品                                    |
| `@axe/features/*`       | ユーザ向け 1 機能 = 1 サブフォルダ                              |
| `@axe/composition/*`    | composition root の合成コード。すべての層に依存可能             |
| `src/app/*.ts`          | composition root（`app.component.ts` 等）。すべての層に依存可能 |

依存方向は ESLint の `no-restricted-imports` で自動検査される（[eslint.config.ts](../eslint.config.ts)）。
`pre-commit` フック (`ng lint`) で必ず検出されるため、新規ファイル追加時は層を意識する。

## 各レイヤー詳細

### `@axe/core/*`

純粋インフラ層。Angular 非依存、Web API ラッパに徹する。

- **配下**: `network`, `storage`, `sync`（同期エンジン）, `input`, `event`（`event-channel`, `domain-events`）, `transform`, `logging`, `util`, `di`（`service-locator`）
- **依存可能**: なし
- **入れる**: 純粋インフラ、I/O ラッパ、msgpack/XML serialization、event channel、`@SyncObject` のシリアライゼーション基盤
- **入れない**: ドメインモデルへの直接依存（spec 内テストフィクスチャを除く）、features への callback 登録
- **設計上の注意**: `core/storage/file-archiver.ts` 等は domain の SyncObject に依存したいケースがあるが、
  必ず **構造的 interface (`LoadGuard` 等) を core 内に定義し、ObjectStore の alias 文字列でランタイム取得** することで
  cross-layer 型 import を回避する

### `@axe/domain/*`

純粋ドメインモデル層。Angular / DOM 非依存。

- **配下**: `character`, `chat`, `tabletop`, `card`, `dice`, `vote`, `alarm`, `media`, `peer`, `data`
- **依存可能**: `core`
- **入れる**: `@SyncObject` クラス、純粋計算 (hex-geometry, table-layout, skill-judgement)、`domain-events.ts`（イベントバス定義）
- **入れない**: DOM API 直接呼び出し（`document.*` / `window.confirm` / `addEventListener`）、Angular の `@Injectable` / `inject`、`infrastructure` 以上のレイヤー
- **仕様**: シリアライズに耐え P2P 同期できること。コンストラクタの副作用ゼロ

### `@axe/infrastructure/*`

domain ↔ DOM/Web を橋渡しするアダプタ層。

- **依存可能**: `core`, `domain`
- **入れる**: domain ↔ 外部世界（Canvas, Audio, IndexedDB, localStorage, MediaSession 等）のアダプタ
- **入れない**: `application` / `ui` / `features` への参照、Angular の `@Injectable` / `inject`
- **例**: `replay/replay-frame-painter` — domain の絵コンテを Canvas 2D に描く。描く内容（配置・折返し）は domain の純関数、描く手段だけがここ

### `@axe/application/*`

Angular DI で `domain` / `infrastructure` をラップしたユースケース / 状態サービス層。

- **配下**: `sync`（`ObjectChangeService`）, `ui`（`PanelService` / `ModalService` / `ContextMenuService` / `ThemeService` 等）, `chat`, `inventory`, `tabletop`, `file`, `i18n`, `media`, `storage`
- **依存可能**: `core`, `domain`, `infrastructure`
- **入れる**: `@Injectable` サービス。複数 feature が共有する状態管理（PanelService, ContextMenuService, ObjectChangeService 等）。core/domain の Angular DI 化レイヤー
- **入れない**: `ui` パーツや `features` の参照、特定 feature 専用 UI 開閉ロジック
- **命名**: `*.service.ts` を中心とする。サービスのヘルパ純関数は同フォルダの `*-helpers.ts`

### `@axe/ui/*`

feature に紐付かない汎用 UI 部品。

- **配下**: `components`（ui-panel, modal, context-menu, file-selecter…）, `directives`（draggable, resizable, rotable, movable, tooltip…）, `pipes`, `tabletop`（z-offset 等の UI 定数）, `text-decoration`
- **依存可能**: `core`, `domain`, `infrastructure`, `application`
- **入れる**: feature に紐付かない汎用 directive / component / pipe。`TabletopObject` 等の domain 型をプロパティに取るのは OK（型は domain）
- **入れない**: 特定 feature の component 名（`OverviewPanelComponent` / `ChatTab` 等）を import する構造。`features` に対する逆流
- 例: `MovableDirective` は `TabletopObject` 型を input にするが、`features/character/game-character` 等の具体コンポーネントは知らない

### `@axe/features/*`

ユーザ向け 1 機能 = 1 サブフォルダ。

- **配下**: `chat`, `tabletop`, `character`, `card`, `controller`, `data-element`, `dice`, `file`, `inventory`, `lobby`, `media`, `vote`, `alarm`
- **依存可能**: `core`, `domain`, `infrastructure`, `application`, `ui`
- **入れる**: 1 機能の UI（component + html）、その feature 専用の context-menu builder / event-handler.service / helpers / spec
- **入れない**: 他 feature の component を直接 import するのは原則禁止（共通化したいなら `ui/` / `application/` / `domain/` のいずれかへ）
- feature 間でモデル経由（`domain/*`）以外の結合が必要な場合は、`application/` の薄いサービス経由で橋渡しする
- feature 同士の直接 import は [eslint.config.ts](../eslint.config.ts) の `FEATURE_DEPENDENCIES` にある辺だけ通る（`panels` と `mobile` は例外）
- イベント駆動の副作用（パネル開閉、サウンド再生等）は各 feature 配下に `*-event-handler.service.ts` を置き、`providedIn: 'root'` で AppComponent が `inject()` するだけで自動起動する設計

### `@axe/composition/*` + `src/app/*.ts`（composition root）

`AppComponent` と、すべての SyncObject シングルトンを DI 登録する合成コード。
すべての層に依存可能。

- **配下** (`composition/`): `app-config.service.ts`（設定読み込み）, `app-initialization.service.ts`（SyncObject インスタンス化）, `class-provider.ts`（`CLASS_SINGLETON_PROVIDERS`）
- **依存可能**: すべて
- 各 feature の event-handler service を `inject()` するのみで起動する
- 個別 feature 専用サービスを `app.component` に直書きしないこと。composition root はあくまで「束ねる」役
- 該当ファイル: [src/app/app.component.ts](../src/app/app.component.ts)、[src/main.ts](../src/main.ts)、[src/app/composition/](../src/app/composition/)

## 同期 / DI 基盤

- ドメインモデルは `@SyncObject(alias)` クラス + `@SyncVar()` プロパティで宣言
  ([src/app/core/sync/decorator.ts](../src/app/core/sync/decorator.ts))
- `@SyncObject` クラス群は **Angular DI 外**（`ObjectFactory` が `new` で生成）
- それらシングルトン（`ObjectStore` / `ObjectFactory` / `ObjectSerializer` /
  `ObjectSynchronizer` / `ImageStorage` / `AudioStorage` / `FileArchiver` /
  `ChatTabList` / `Config` / `DataSummarySetting` / `TableSelecter` 等）は
  `CLASS_SINGLETON_PROVIDERS` で DI に橋渡しされている
  ([src/app/composition/class-provider.ts](../src/app/composition/class-provider.ts))。
  Angular 側は `inject(ObjectStore)` 等で取得する
- DI 管理外のクラスから DI サービスに触る必要があるときだけ
  `ServiceLocator.get<T>(token)` を使う
  ([src/app/core/di/service-locator.ts](../src/app/core/di/service-locator.ts))。
  **新規でドメインモデルから DI サービスを呼ぶ箇所を増やさないこと** —
  サービス側からモデルを操作する向きを保つ

## イベント購読パターン

`ObjectChangeService.onObjectChangedFor()` / `onObjectChangedForAlias()` を使う:

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

生の `objectChanged$.subscribe()` で `if (e.identifier !== ...) return;` する書き方は
段階的に上記ヘルパへ移行する。

## コンポーネントパターン

```typescript
@Component({
  selector: 'app-xxx',
  templateUrl: './xxx.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

- **テンプレートは外部ファイル分離** (`templateUrl`)
- **スタイルは原則テンプレート内 Tailwind utility class**。`styleUrls` / `styles` は使わない。
  どうしても Tailwind で表現できない場合に限り `styleUrls` を許容するが、
  現状 `.component.css` を持つコンポーネントは存在しない（例外なし）。SCSS は使わない
- 変更検知は `OnPush` + Signals で駆動
- `markForCheck()` は使わない。`detectChanges()` は DOM 計測用途のみ
  （プロダクションコードでは使わず、テストヘルパー
  [src/app/testing/panel-drag-recovery.ts](../src/app/testing/panel-drag-recovery.ts) と各 spec でのみ使用）
- `@SyncObject` 由来の値を template でリアクティブに使うときは
  `versionOf()` / `collectionOf()` で signal を取り、依存配線する
- `input.required<T>()` の値をテンプレート以外で読むときは `_initialized` フラグ等で
  ガードして NG0950 を避ける

## context-menu builder パターン

各 tabletop オブジェクトのコンテキストメニューは `features/<scope>/<name>-context-menu.ts`
として純関数で実装する。コンポーネント本体は短く保ち、メニュー構築は spec を書いて挙動を固定する:

```typescript
export function buildXxxContextMenu(
  target: XxxModel,
  callbacks: { onShowDetail: () => void; ... }
): ContextMenuAction[] { ... }
```
