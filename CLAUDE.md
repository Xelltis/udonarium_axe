# Udonarium Axe — Claude Code 向け開発指示

Udonarium Axe はブラウザベースの TRPG オンラインセッション支援ツール。
WebRTC (SkyWay SDK) による P2P 通信でサーバレスにオブジェクトを同期する。

本ファイルは **日々の開発で守るべき最小限の規範** のみを記す。詳細は以下を参照:

- 設計思想・各層の役割・実装パターン → [docs/architecture.md](docs/architecture.md)
- コーディング規範・コードスタイル → [docs/coding-guidelines.md](docs/coding-guidelines.md)
- コミット規約・lefthook・ドキュメントの日本語 → [docs/contribution.md](docs/contribution.md)

## アーキテクチャ規範

依存方向（各層は右側の層を import 可。逆流は ESLint で禁止、`pre-commit` で検出）:

```
composition → features → ui → application → infrastructure → domain → core
```

※ infrastructure は薄いため、application は domain も直接 import する

| レイヤー                              | 一行サマリ                                      |
| ------------------------------------- | ----------------------------------------------- |
| `@axe/core/*`                         | 純粋インフラ。Angular 非依存、Web API ラッパ    |
| `@axe/domain/*`                       | 純粋ドメインモデル。Angular / DOM 非依存        |
| `@axe/infrastructure/*`               | domain ↔ DOM/Web のアダプタ層（Canvas 描画等）  |
| `@axe/application/*`                  | Angular DI ラップ層（`@Injectable` サービス群） |
| `@axe/ui/*`                           | feature 非依存の汎用 UI 部品                    |
| `@axe/features/*`                     | ユーザ向け 1 機能 = 1 サブフォルダ              |
| `@axe/composition/*` + `src/app/*.ts` | composition root。すべての層に依存可能          |

各層の詳細・「入れる / 入れない」基準・composition root の使い方は
[docs/architecture.md](docs/architecture.md) を参照。

## 規範ハイライト

実装中に最低限意識すべき強制事項（詳細は [docs/coding-guidelines.md](docs/coding-guidelines.md)）:

- **コンポーネント**: `OnPush` 必須、`templateUrl` 外部分離、`styleUrls` / `styles` 禁止
  （Tailwind utility class を inline）
- **Signals**: `versionOf()` / `collectionOf()` で配線。`markForCheck()` 禁止
- **イベント購読**: `ObjectChangeService.onObjectChangedFor()` / `onObjectChangedForAlias()` を使う
- **feature 副作用**: 各 feature 配下の `*-event-handler.service.ts` を `providedIn: 'root'` で書く
- **context-menu**: 各 feature 配下に `*-context-menu.ts` を純関数で置き、spec で固定
- **ドメインモデルから DI サービスを呼ばない** — サービス側からモデルを操作する向きを保つ
- **import**: 相対パス禁止（`@axe/*` / `@env/*`）、層境界は ESLint で error 化

## パスエイリアス

`tsconfig.json` と `vitest.config.ts` の双方で定義済み（変更時は両方を揃える）。

- `@axe/*` → `src/app/*`
- `@env/*` → `src/environments/*`
- `@pkg` → `package.json`

## 技術スタック

- **Angular 22** — Zoneless (`provideZonelessChangeDetection()`)、OnPush
- **スタイル** — Tailwind v4。`src/styles.css` で `@import 'tailwindcss';` グローバル適用
- **テスト** — Vitest + happy-dom。`ng test`（`@angular/build:unit-test`）と
  `npx vitest run`（`vitest.config.ts`）の 2 経路があり共に通す必要あり。
  共通 setup は [src/app/testing/test-setup.ts](src/app/testing/test-setup.ts)
- **E2E** — Playwright (`npm run e2e` / `npm run e2e:ui`)
- **P2P / シリアライズ** — `@skyway-sdk/core` v2 + `@msgpack/msgpack` v3
- **ダイス** — `bcdice` v4 / **UI セレクト** — `@ng-select/ng-select`
- **i18n** — `@jsverse/transloco`（言語切替 UI は `features/seat-display`）

## 開発コマンド

| コマンド                               | 用途                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm start`                            | 開発サーバー（`ng serve`）                                                         |
| `npm run build`                        | プロダクションビルド（`ng build` + 既定設定コピー + zip 生成）                     |
| `npm test`                             | ユニットテスト（Angular builder + Vitest）                                         |
| `npx vitest run`                       | ユニットテスト（直接 Vitest、上記とは別経路）                                      |
| `npm run e2e`                          | Playwright E2E                                                                     |
| `npm run e2e:ui`                       | Playwright UI モード                                                               |
| `npx playwright test --project=visual` | 演出のスクリーンショット比較（手元のみ・基準画像は `e2e/visual/__screenshots__/`） |
| `npm run lint`                         | ESLint                                                                             |
| `npm run format`                       | Prettier 整形                                                                      |
| `npm run format:check`                 | Prettier チェックのみ                                                              |

## コミット・フック規約（要点）

詳細は [docs/contribution.md](docs/contribution.md)。要点のみ:

- **コミットメッセージは必ず英語**。形式は `type(scope): subject`（Conventional Commits）
  - 例: `feat(tabletop): expand table area to 6000px and adjust zoom range`
- 複数の論理的変更を 1 コミットに混ぜない
- **lefthook 迂回は絶対禁止**（`--no-verify` / `LEFTHOOK=0` / `core.hooksPath` 変更等）。
  フックが落ちたら原因を直してから再コミットする
  - `commit-msg`: `commitlint` / `pre-commit`: staged 分の `eslint` + `vitest related` / `pre-push`: `npx vitest run` + `npm run build`
- main への PR では [.github/workflows/ci.yml](.github/workflows/ci.yml) が
  format / lint / **両テスト経路** / build / website ビルドを回す（E2E は所要時間の都合で手元のみ）

## コメント・テスト名は英語

`src/` 配下のコードコメントと、`describe()` / `it()` のテスト名は英語で書く。
i18n の翻訳文字列とドキュメント本文は対象外（詳細は
[docs/coding-guidelines.md](docs/coding-guidelines.md)）。

## ドキュメントの日本語

README・`docs/`・`website/` のまとまった日本語は `natural-japanese` スキルを通して書く
（[.claude/settings.json](.claude/settings.json) の `enabledPlugins` で有効化済み）。詳細は
[docs/contribution.md](docs/contribution.md)。要点のみ:

- 対象は新規執筆と書き直し。1〜2 行の追記や表のセル修正はそのまま書いてよい
- 禁止語・翻訳調・リズムの均質さはスキル同梱の lint が機械的に拾う。
  出るのは疑いなので、直すか残すかは文脈で決める
- **コミットメッセージと CHANGELOG は対象外** — 前者は英語、後者は semantic-release の生成物

## 留意事項

- `package.json` の `version` がリリース番号。更新は `chore(release): ...` で
- `ng build` の予算は initial 3.1MB 警告 / 3.5MB エラー（[angular.json](angular.json) の `budgets`）
