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
  ほかはテストヘルパー（[../src/app/testing/panel-drag-recovery.ts](../src/app/testing/panel-drag-recovery.ts)・[../src/app/testing/panel-layer.ts](../src/app/testing/panel-layer.ts)）と各specでのみ使用
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
- 複数のfeatureが使う項目の組み立ては`application/ui/`に置く（`tabletop-context-menu-actions.ts`・`surface-switch-context-menu.ts`など）
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
  同期される`Config` / `ChatTabList` / `DataSummarySetting` / `StatusAilmentCatalog` / `TableSelecter` / `TurnState`は`.instance`のまま読み、`inject()`では受けない（DIに橋渡ししておらず、ESLintで検査）
- オーバーレイの部品（パネルの枠・モーダル・右クリックメニュー等）は`application/ui/overlay-components.ts`のトークンで受け取る

### 横断の部品

- localStorageは`readLocal` / `writeLocal`で読み書きし、キーは`STORAGE_KEYS`に足す。キーの文字列は変えない
- タイマーでまとめる処理は`debounce` / `coalesce`、待つ処理は`delay`を使う
- ほかの部品は[architecture.md#横断の部品](architecture.md#横断の部品)にある。同じ処理の写しを作らない

## 修正の進め方

不具合やレビューの指摘を直すときは、指摘された行だけを塞がない。同じ決まりを通る別の経路に同じ問題が残り、次の指摘になるためである。

### 直す前に書くこと

手を付ける前に、次の3つを書く。3つ目が1か所に定まらないうちは直し始めない。

1. 破れている決まり
2. その決まりを通る経路のすべて（grepで洗う）
3. 決まりを置く1か所

### 直し方の決まり

- 同じ領域で2度目の指摘が出たら、継ぎ足さずに作り直す
- 既存の仕組みを写して変形を作らない。変形が要るときは、共通の部分を先に部品にして両方に使わせる
- 例外を列挙しない。安全だと分かっているものだけを絞り込みの対象にし、それ以外には手間のかかる安全な扱い（全件を流すなど）を選ぶ
- テストは決まりに付ける。直した行に付けたテストは、別の経路に残った同じ問題を通してしまう。決まりを通る経路のすべてで成り立つ形にして、経路を足し忘れると落ちるようにする
- レベルの高い指摘から直す（Critical、High、Middle、Lowの順）。仕様の判断が要る指摘も後に回さず、その場で聞いてから順番どおりに直す
- 指摘は領域ごとに束ねてから直す。報告も領域ごとに、決まり・直した場所・残ったことを書く
- コミットの前に、直した内容に次のレビューが何と言うかを書き出す。同じ決まりを使う範囲外の機能も含める
- 見送るときと一部だけ直すときは、理由と残ったことを書く

### 指摘のレベル

レベルはCritical・High・Middle・Lowの4段で、影響の大きさと起きやすさで決める。

| 影響＼起きやすさ                                                         | ふつうの使い方で起きる           | 特定の条件で起きる | まれ・推測（再現なし） |
| ------------------------------------------------------------------------ | -------------------------------- | ------------------ | ---------------------- |
| 取り返しがつかない（データの消失・漏えい、権限の穴、課金、起動できない） | Critical                         | High               | Middle                 |
| 利用者に見える（誤動作、性能の退行、機能が使えない）                     | Middle（主な流れを塞ぐならHigh） | Middle             | Low（理由を書く）      |
| 利用者に見えない（重複、保守性、テストの弱さ、小さな見た目）             | Low                              | Low                | Low                    |

次の3つは表より優先する。

- テストやCIが気づけなくなる指摘（走るはずのテストが走らないなど）は、利用者に見えなくてもMiddleにする
- 自分が直した結果として生まれた指摘はMiddle以上にする
- 直した決まりに同じ指摘がまた出た（直しが効かなかった）ときだけ、1段上げる。同じ領域の別の新しい指摘は上げない。上げるのは1回で、回を重ねて上げない。Lowは上げない

### レビューの報告

レビューの結果は直し始める前に全件を日本語で示す。1件ずつ、場所と、どういう操作でどうなるかを省かずに書く。レビューの道具はレベルを付けないので、上の基準で付け、自分で付けたと書く。直したあとは、指摘ごとに「全部直した」「一部だけ直した（残ったこと）」「見送った（理由）」のどれかを書き、回ごとの件数を表にする。

### テストを流す時

e2eとvisualは1回に何分もかかるので、流す時を決めておく。

| いつ                                   | 流すもの                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------ |
| コミットのたび                         | フックが選ぶ関連の単体specとlintだけ                                     |
| 領域の修正が一区切りついたとき         | 型検査と、その領域の単体spec                                             |
| pushの前に1回                          | フックの単体specとビルド。e2eは`npm run e2e:related`で変更に届くspecだけ |
| 描画に関わる変更をしたpushの前に1回    | visualは`npm run e2e:related -- --visual`で届く場面だけ                  |
| PRを出す前、レビューを頼む前に1回      | e2eの一式。描画に触れたPRならvisualの一式も                              |
| レビューと改修を繰り返している間の各回 | e2eもvisualも流さない。繰り返しが終わってから「pushの前」の分を1回流す   |

描画に関わる変更とは卓の描画（`infrastructure/table-3d`と`three-kit`）、スタイルとテンプレートの見た目、同梱の絵とモデル、メニューの項目の増減を指す。

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
- **厳密な比較**: `eqeqeq`で`==` / `!=`をerror化。nullとundefinedをまとめて見る`== null` / `!= null`だけ許す
- **未使用import / vars**: `unused-imports`プラグイン（`_`始まりは無視）
- **相対パスimport禁止**: `no-restricted-imports`で`^\.`を拒否。
  必ずパスエイリアス(`@axe/*` / `@env/*` / `@pkg`)を使う
- **層境界の自動検査**: `no-restricted-imports`で各レイヤーの逆流importをerror化
- **feature間のimportは台帳制**: `eslint.config.ts`の`FEATURE_DEPENDENCIES`に載っている辺と`panels`だけ許す。`import()`による遅延importも同じ台帳で検査する（`panels`からの遅延importは除く）。新しい辺を足すときは台帳に書く（減らす方向で）。台帳が循環すると設定の読み込みで失敗する
  - 詳細: [architecture.md#@axe/core/\*](architecture.md#axecore)以降の各層 / [../eslint.config.ts](../eslint.config.ts)
- **Tailwind class整列**: `eslint-plugin-better-tailwindcss`でcanonical変換と、重複・非推奨のclassや余分な空白の除去をする。
  並び替えはPrettierの`prettier-plugin-tailwindcss`が受け持つ。両方で整えると互いに書き換え合うため、
  better-tailwindcssの`enforce-consistent-class-order`（並び替え）と`enforce-consistent-line-wrapping`（改行整形）は切ってある

設定: [../eslint.config.ts](../eslint.config.ts)
