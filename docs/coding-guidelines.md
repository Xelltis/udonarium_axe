# Udonarium Axe — コーディングガイドライン

実装時の規範ルール（強制事項）と整形ルールをまとめる。
レイヤー設計や同期基盤の詳細は[architecture.md](architecture.md)、
日々の規範ハイライトは[../CLAUDE.md](../CLAUDE.md)を参照。

## コーディング規範

### コンポーネント

- `ChangeDetectionStrategy.OnPush`必須。`@Component`には常に明示する
- `templateUrl`で外部分離。インラインテンプレートは使わない
- `styleUrls` / `styles`は使わない。Tailwind utility classをテンプレートに直接書く
  - どうしてもTailwindで表現できない場合に限り`styleUrls`を許容するが、
    現状`.component.css`を持つコンポーネントは存在しない（例外なし）
  - SCSSは使わない
- **selector**: 原則prefixなし（`game-character`, `chat-window`, `range`等）。
  ただし汎用UI directiveは`app` prefixを付ける（`appDraggable`, `appTooltip`, `appResizable`等）。
  既存の`app-` prefix component（`alarm-menu`等）は過去との互換のため残している

### 変更検知 / Signals

- Signals + `versionOf()` / `collectionOf()`で配線する
- `markForCheck()`禁止
- `detectChanges()`はDOM計測用途のみ
  （プロダクションコードでは使わず、テストヘルパー
  [../src/app/testing/panel-drag-recovery.ts](../src/app/testing/panel-drag-recovery.ts)と各specでのみ使用）
- `@SyncObject`由来の値をtemplateでリアクティブに使うときは必ず
  `versionOf(identifier)()` / `collectionOf(aliasName)()`を読んで依存配線する
- `input.required<T>()`の値をテンプレート以外で読むときは`_initialized`フラグ等で
  ガードしてNG0950を避ける

### イベント購読

- `ObjectChangeService.onObjectChangedFor()` / `onObjectChangedForAlias()`を使う
- 生の`objectChanged$.subscribe()` + 個別identifierフィルタは段階的に置き換え
- 詳細な使用例は[architecture.md#イベント購読パターン](architecture.md#イベント購読パターン)を参照

### feature副作用

- 各featureの`*-event-handler.service.ts`を`providedIn: 'root'`で書き、
  `AppComponent`から`inject()`で自動起動する
- 個別feature専用サービスを`app.component`に直書きしない（composition rootは束ねる役のみ）

### context-menu

- 各feature配下に`*-context-menu.ts`を純関数で置き、specで挙動を固定する
- コンポーネント本体は短く保つ
- 例:
  ```typescript
  export function buildXxxContextMenu(
    target: XxxModel,
    callbacks: { onShowDetail: () => void; ... }
  ): ContextMenuAction[] { ... }
  ```

### DI / ドメインモデル

- ドメインモデル（`@SyncObject`クラス）からDIサービスを呼ぶ箇所を**新規で増やさない**
- サービス側からモデルを操作する向きを保つ
- やむを得ない場合は`ServiceLocator.get<T>(token)`
  （[../src/app/core/di/service-locator.ts](../src/app/core/di/service-locator.ts)）を使うが、現状1箇所のみ

## コメント・テスト名の言語

- **コードコメントは英語**で書く（`src/`配下の`//` `/* */` `/** */`）
- **テスト名も英語**で書く（`describe()` / `it()`に渡す文字列）
- 対象外: i18nの翻訳文字列（`src/assets/i18n/*.json`）、`docs/` `website/` `README.md`の本文。
  ドキュメントの日本語は[contribution.md](contribution.md)の規範に従う
- コミットメッセージは従来どおり英語（[contribution.md](contribution.md)）

## コードスタイル

### TypeScript

- `strict: true`、ただし`strictPropertyInitialization: false`（`tsconfig.json`）
- `target: ES2022` / `module: es2020`
- `experimentalDecorators: true` / `useDefineForClassFields: false`

### フォーマット(Prettier)

- インデント: スペース2、シングルクォート、`printWidth: 120`、`trailingComma: 'es5'`
- 設定: [../.prettierrc](../.prettierrc) / [../.editorconfig](../.editorconfig)
- 整形: `npm run format` / チェック: `npm run format:check`

### ESLint

- **import順序**: `simple-import-sort`で自動整列（`npm run lint -- --fix`）
- **未使用import / vars**: `unused-imports`プラグイン（`_`始まりは無視）
- **相対パスimport禁止**: `no-restricted-imports`で`^\.`を拒否。
  必ずパスエイリアス(`@axe/*` / `@env/*`)を使う
- **層境界の自動検査**: `no-restricted-imports`で各レイヤーの逆流importをerror化
- **feature間のimportは台帳制**: `eslint.config.ts`の`FEATURE_DEPENDENCIES`に載っている辺と`panels`だけ許す（台帳にない`mobile`と`button-guide`からのimportは制限しない）。新しい辺を足すときは台帳に書く（減らす方向で）
  - 詳細: [architecture.md#@axe/core/\*](architecture.md#axecore)以降の各層 / [../eslint.config.ts](../eslint.config.ts)
- **Tailwind class整列**: `eslint-plugin-better-tailwindcss`でcanonical変換 / 並び替え / 改行整形

設定: [../eslint.config.ts](../eslint.config.ts)
