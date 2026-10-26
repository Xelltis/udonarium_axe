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
- `detectChanges()`は、作った直後のコンポーネントをその場で描いて中身を使う3か所だけ
  （`panel-window.service`、`stamp-picker.service`、`bottom-sheet.service`）。
  ほかはテストヘルパー[../src/app/testing/panel-drag-recovery.ts](../src/app/testing/panel-drag-recovery.ts)と各specでのみ使用
- `@SyncObject`由来の値をtemplateでリアクティブに使うときは必ず
  `versionOf(identifier)()` / `collectionOf(aliasName)()`を読んで依存配線する
- `input.required<T>()`の値をテンプレート以外で読むときは`_initialized`フラグ等で
  ガードしてNG0950を避ける
- effectで別のsignalに書き込まない。導ける値は`computed`、利用者が書き換えられる値は`linkedSignal`にする
- 描画待ちは`setTimeout`でなく`afterNextRender`。`ngAfterViewInit` / `ngOnDestroy` / `@Output`は使わず、
  `afterNextRender` / `DestroyRef` / `output()`で書く

### イベント購読

- `ObjectChangeService.onObjectChangedFor()` / `onObjectChangedForAlias()`を使う
- 生の`objectChanged$.subscribe()`は書かない。すべての変更を聞く必要がある3か所だけが理由をJSDocに書いて残している
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

- ドメインモデル（`@SyncObject`クラス）からDIサービスを呼ばない
- サービス側からモデルを操作する向きを保つ。DIの外の純関数が要る値は、呼び出し側が引数で渡す
- Angularが作るクラスは、プロセスに1つの部品（`ObjectStore`、`ImageStorage`等）を`.instance`で読まず`inject()`で受け取る（ESLintで検査）。
  同期される`Config` / `ChatTabList` / `DataSummarySetting` / `TurnState`は`.instance`のまま読む
- オーバーレイの部品（パネルの枠・モーダル・右クリックメニュー等）は`application/ui/overlay-components.ts`のトークンで受け取る

### 横断の部品

- localStorageは`readLocal` / `writeLocal`で読み書きし、キーは`STORAGE_KEYS`に足す。キーの文字列は変えない
- タイマーでまとめる処理は`debounce` / `coalesce`、待つ処理は`delay`を使う
- ほかの部品は[architecture.md#横断の部品](architecture.md#横断の部品)にある。同じ処理の写しを作らない

## コメント・テスト名の言語

- **コードコメントは英語**で書く（`src/` `e2e/` `scripts/`と設定ファイルの`//` `/* */` `/** */`、HTMLとCSSのコメント、YAMLや`.gitignore`の`#`）
- **テスト名も英語**で書く（`describe()` / `it()`、e2eの`test()` / `test.describe()` / `test.step()`に渡す文字列）
- 画面の文言や実際の出力を引くときは、英語のコメントの中に元の日本語を引用として残してよい
- 対象外: i18nの翻訳文字列（`src/assets/i18n/*.json`）、セレクタや期待値・ログなどの文字列、`docs/` `website/` `README.md`の本文。
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
- **feature間のimportは台帳制**: `eslint.config.ts`の`FEATURE_DEPENDENCIES`に載っている辺と`panels`だけ許す。`import()`による遅延importも同じ台帳で検査する（`panels`からの遅延importは除く）。新しい辺を足すときは台帳に書く（減らす方向で）。台帳が循環すると設定の読み込みで失敗する
  - 詳細: [architecture.md#@axe/core/\*](architecture.md#axecore)以降の各層 / [../eslint.config.ts](../eslint.config.ts)
- **Tailwind class整列**: `eslint-plugin-better-tailwindcss`でcanonical変換 / 並び替え / 改行整形

設定: [../eslint.config.ts](../eslint.config.ts)
