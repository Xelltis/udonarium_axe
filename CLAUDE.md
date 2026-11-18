# Udonarium Axe — Claude Code向け開発指示

Udonarium AxeはブラウザベースのTRPGオンラインセッション支援ツール。
WebRTC (SkyWay SDK)によるP2P通信でサーバレスにオブジェクトを同期する。

本ファイルは**日々の開発で守るべき最小限の規範**のみを記す。詳細は以下を参照。

- 設計思想・各層の役割・実装パターン → [docs/architecture.md](docs/architecture.md)
- コーディング規範・コードスタイル → [docs/coding-guidelines.md](docs/coding-guidelines.md)
- コミット規約・lefthook・ドキュメントの日本語 → [docs/contribution.md](docs/contribution.md)

## アーキテクチャ規範

依存方向は次のとおり。各層は右側の層をimportできる。逆流はESLintで禁止し、`pre-commit`で検出する。

```
composition → features → ui → application → infrastructure → domain → core
```

※ infrastructureは薄いため、applicationはdomainも直接importする

| レイヤー                              | 一行サマリ                                    |
| ------------------------------------- | --------------------------------------------- |
| `@axe/core/*`                         | 純粋インフラ。Angular非依存、Web APIラッパ    |
| `@axe/domain/*`                       | 純粋ドメインモデル。Angular / DOM非依存       |
| `@axe/infrastructure/*`               | domain ↔ DOM/Webのアダプタ層（Canvas描画等）  |
| `@axe/application/*`                  | Angular DIラップ層（`@Injectable`サービス群） |
| `@axe/ui/*`                           | feature非依存の汎用UI部品                     |
| `@axe/features/*`                     | ユーザ向け1機能 = 1サブフォルダ               |
| `@axe/composition/*` + `src/app/*.ts` | composition root。すべての層に依存可能        |

各層の詳細・「入れる / 入れない」基準・composition rootの使い方は
[docs/architecture.md](docs/architecture.md)を参照。

## 規範ハイライト

実装中に最低限意識すべき強制事項は次のとおり（詳細は[docs/coding-guidelines.md](docs/coding-guidelines.md)）。

- **コンポーネント**: `OnPush`必須、`templateUrl`外部分離、`styleUrls` / `styles`禁止
  （Tailwind utility classをinline）
- **Signals**: `versionOf()` / `collectionOf()`で配線。`markForCheck()`禁止
- **イベント購読**: `ObjectChangeService.onObjectChangedFor()` / `onObjectChangedForAlias()`を使う
- **feature副作用**: 各feature配下の`*-event-handler.service.ts`を`providedIn: 'root'`で書く
- **context-menu**: 各feature配下に`*-context-menu.ts`を純関数で置き、specで固定
- **ドメインモデルからDIサービスを呼ばない**。サービス側からモデルを操作する向きを保つ
- **import**: 相対パス禁止（`@axe/*` / `@env/*`）、層境界はESLintでerror化
- **修正**: 指摘された行だけを塞がない。直す前に、破れている決まり・その決まりを通る経路・決まりを置く1か所を書く。同じ領域で2度指摘が出たら作り直す（[修正の進め方](docs/coding-guidelines.md#修正の進め方)。指摘のレベルの基準と、レビューの報告の形もそこにある）
- **テストを流す時**: e2eとvisualは毎回流さない。pushの前に`npm run e2e:related`を1回、visualは描画に関わる変更のときだけ。レビューと改修を繰り返している間の各回は流さない（[テストを流す時](docs/coding-guidelines.md#テストを流す時)）

## パスエイリアス

`tsconfig.json`と`vitest.config.mts`の双方で定義済み（変更時は両方を揃える）。

- `@axe/*` → `src/app/*`
- `@env/*` → `src/environments/*`
- `@pkg` → `package.json`

## 技術スタック

- **Angular 22** — Zoneless (`provideZonelessChangeDetection()`)、OnPush
- **スタイル** — Tailwind v4。`src/styles.css`で`@import 'tailwindcss';`グローバル適用
- **テスト** — Vitest + happy-dom。`ng test`（`@angular/build:unit-test`）と
  `npx vitest run`（`vitest.config.mts`）の2経路があり共に通す必要あり。
  共通setupは[src/app/testing/test-setup.ts](src/app/testing/test-setup.ts)
- **E2E** — Playwright (`npm run e2e` / `npm run e2e:ui`)
- **P2P / シリアライズ** — `@skyway-sdk/core` v2 + `@msgpack/msgpack` v3
- **ダイス** — `bcdice` v4 / **UIセレクト** — `@ng-select/ng-select`
- **i18n** — `@jsverse/transloco`（言語切替は`features/menu`のメニューコマンド）

## 開発コマンド

| コマンド                                      | 用途                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm start`                                   | 開発サーバー（`ng serve`）                                                                                                   |
| `npm run build`                               | プロダクションビルド（`ng build` + 既定設定コピー + zip生成）                                                                |
| `npm test`                                    | ユニットテスト（Angular builder + Vitest）                                                                                   |
| `npx vitest run`                              | ユニットテスト（直接Vitest、上記とは別経路）                                                                                 |
| `npm run e2e`                                 | Playwright E2E                                                                                                               |
| `npm run e2e:ui`                              | Playwright UIモード                                                                                                          |
| `npm run e2e:related`                         | 変えた所に届くE2Eだけ（`-- --visual`で演出の比較も。記録は`npm run e2e`を1回流すとできる）                                   |
| `npx playwright test --project=visual-webgl2` | 演出のスクリーンショット比較（手元のみ・基準画像は`e2e/visual/__screenshots__/webgl2/`。WebGPUは`visual-webgpu`と`webgpu/`） |
| `npx playwright test --project=server`        | 部屋のサーバーの結合（手元のみ・隣に`udonarium_axe_backend`とビルド済みの`dist`が要る）                                      |
| `npm run lint`                                | ESLint                                                                                                                       |
| `npm run format`                              | Prettier整形                                                                                                                 |
| `npm run format:check`                        | Prettierチェックのみ                                                                                                         |
| `npm run build:mcp`                           | AI連携のブリッジ（`tools/axe-mcp`）を1ファイル`tools/axe-mcp/dist/axe-mcp.mjs`に束ねる                                       |
| `npm run test:mcp`                            | ブリッジのテスト（Node。CIでは型検査・テスト・ビルドを別ジョブで回す）                                                       |

## コミット・フック規約（要点）

詳細は[docs/contribution.md](docs/contribution.md)を参照。以下は要点のみ。

- **コミットメッセージは必ず英語**。形式は`type(scope): subject`（Conventional Commits）
  - 例: `feat(tabletop): expand table area to 6000px and adjust zoom range`
- 複数の論理的変更を1コミットに混ぜない
- **lefthook迂回は絶対禁止**（`--no-verify` / `LEFTHOOK=0` / `core.hooksPath`変更等）。
  フックが落ちたら原因を直してから再コミットする
  - `commit-msg`: `commitlint` / `pre-commit`: staged分の`eslint` + `vitest related` / `pre-push`: push分の`vitest related` + `npm run build`
- mainへのPRでは[.github/workflows/ci.yml](.github/workflows/ci.yml)が
  format / lint / **両テスト経路** / build / websiteビルドを回す（E2Eは所要時間の都合で手元のみ）

## コメント・テスト名は英語

コードのコメント（`src/`・`e2e/`・`scripts/`・設定ファイル）と、テスト名（`describe()` / `it()`、e2eの`test()` / `test.describe()`）は英語で書く。
画面の文言や実際の出力を引くときは、元の日本語を引用として残してよい。
i18nの翻訳文字列、セレクタや期待値の文字列、ドキュメント本文は対象外（詳細は
[docs/coding-guidelines.md](docs/coding-guidelines.md)）。

## ドキュメントの日本語

README・`docs/`・`website/`のまとまった日本語は`yomiyasu`スキルを通して書く
（[.claude/settings.json](.claude/settings.json)の`enabledPlugins`で有効化済み。ほかの日本語校正スキルとは併用しない）。
詳細は[docs/contribution.md](docs/contribution.md)にあり、ここには要点だけを書く。

- 対象は新規執筆と書き直し。1〜2行の追記や表のセル修正はそのまま書いてよい
- 和文と英数字の間に半角空白を入れない（yomiyasuは直さないので書き手が詰める）。空けてある既存の文書は書き直すときにそろえる
- 比喩動詞・太字や箇条書きの多さ・文末コロンなどはスキル同梱のリンターが拾う。
  出るのは疑いなので、直すか残すかは文脈で決める
- **コミットメッセージとCHANGELOGは対象外**。前者は英語で書き、後者はsemantic-releaseが生成する

## 留意事項

- `package.json`の`version`がリリース番号。更新は`chore(release): ...`で
- `ng build`の予算はinitial 3.1MB警告 / 3.5MBエラー（[angular.json](angular.json)の`budgets`）
