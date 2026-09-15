# Udonarium Axe — コントリビューション規約

コミットメッセージ・Git フック・ドキュメントの書き方に関するルール。
コーディング規約は [coding-guidelines.md](coding-guidelines.md)、
アーキテクチャは [architecture.md](architecture.md) を参照。

## 基本方針

- **コミットメッセージは必ず英語** で書く
- **Conventional Commits + lefthook** で運用する
- **複数の論理的変更を 1 コミットに混ぜない**
  （バージョンバンプ・機能変更・ドキュメント整備は別コミット）

## Conventional Commits フォーマット

形式: `type(scope): subject`

### type

`feat` / `fix` / `docs` / `chore` / `style` / `refactor` / `test` / `perf` / `build` / `ci`

### scope

変更対象の領域名。よく使うもの:

| カテゴリ | scope                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| 機能     | `chat`, `tabletop`, `character`, `card`, `dice`, `lobby`, `media`, `controller`, `vote`, `inventory`, `alarm` |
| インフラ | `network`, `storage`, `sync`                                                                                  |
| レイヤー | `application`, `ui`, `domain`                                                                                 |
| その他   | `css`, `release`                                                                                              |

### subject

- 英語・命令形（`add` / `fix` / `update`）
- 冒頭小文字・末尾ピリオドなし
- 72 文字以内

### body（任意）

- 何より **「なぜ」** を書く
- 箇条書きは `- ` で始める

### footer（任意）

- `BREAKING CHANGE:` フッタは現状未使用だが、必要時はフッタとして追加

### 例

```
feat(tabletop): expand table area to 6000px and adjust zoom range
```

```
fix(chat): prevent duplicate logout message and invisible messages from late-timestamp peers

- chat tab がメッセージ受信時にローカルのみフィルタしていたため、
  P2P で受信した古いタイムスタンプメッセージが描画されない問題があった
- フィルタ判定を timestamp ではなく aliasName ベースに変更
```

```
chore(release): bump version to 1.2.2
```

## lefthook フック（迂回は手段を問わず絶対禁止）

`--no-verify` / `LEFTHOOK=0` / `core.hooksPath` の変更 / lefthook 設定の一時無効化、
**いずれも禁止**。フックが落ちたら原因を直してから再コミットする。

| フック       | 内容                                                                  |
| ------------ | --------------------------------------------------------------------- |
| `commit-msg` | `commitlint`（メッセージ形式検査）                                    |
| `pre-commit` | staged の `src/` に `eslint` + `vitest related`（関係する spec だけ） |
| `pre-push`   | `npx vitest run`（全量） + `npm run build`                            |

`pre-commit` の `vitest related` は staged ファイルから import を逆にたどって当たる spec だけを回す
（[scripts/vitest-related.mjs](../scripts/vitest-related.mjs)。テンプレートは隣の `.ts` に読み替える）。
ただし、テストのセットアップが読み込むファイル（間接的に読むものも含む）や、ランナーの設定
（`vitest.config.ts` など）を staged にしたときは、どの spec にも効くので全量を回す。
全量は `pre-push` と CI が見る。

設定: [../lefthook.yml](../lefthook.yml)

## CI（main への Pull Request）

フックはコミットする人の手元でしか走らない。main への Pull Request では
[GitHub Actions](../.github/workflows/ci.yml) が同じ関門を通したうえで、
フックの外にあるものまで見る。

| ジョブ           | 内容                                   |
| ---------------- | -------------------------------------- |
| `Format`         | `npm run format:check`                 |
| `Lint`           | `npm run lint`                         |
| `Test (ng test)` | `npm test`（Angular builder の設定）   |
| `Test (vitest)`  | `npx vitest run`（`vitest.config.ts`） |
| `Build`          | `npm run build`                        |
| `Website`        | `website/` の VitePress ビルド         |

ユニットテストの 2 経路は別ジョブに分けてある。片方だけ落ちることがあるので、
チェック名で落ちた経路が分かるようにしている。

E2E は載せていない。Playwright は CI だと 5 ブラウザぶん走る設定で、Pull Request
1 回に何十分もかかる。手元で `npm run e2e` を回す。

演出の見た目は `e2e/visual/` のスクリーンショット比較で守る。
`npx playwright test --project=visual` が `e2e/visual/__screenshots__/` の基準画像と
突き合わせる。時計を止め、アニメーションを終端まで送ってから撮るので、同じ機械なら同じ絵になる。
基準画像は手元の Chromium で作ってコミットし、CI では回さない。
見た目を変えるつもりの変更で差分が出たら `--update-snapshots` で撮り直し、何がどう変わったかを
コミット本文に書く。差分の理由が言えないなら、それは退行として直す。

## リリース

- `package.json` の `version` がリリース番号
- 更新は `chore(release): bump version to X.Y.Z` で 1 コミットに切り出す
- 機能変更・バージョンバンプ・ドキュメント整備を同じコミットに混ぜない

## ドキュメントの日本語

まとまった日本語（[README.md](../README.md)・`docs/`・`website/` の本文）は
`natural-japanese` スキルを通して書く。プラグインは
[.claude/settings.json](../.claude/settings.json) の `enabledPlugins` で有効化してあり、
配布元は [coji/natural-japanese](https://github.com/coji/natural-japanese)。

| 呼び方                               | 用途                                       |
| ------------------------------------ | ------------------------------------------ |
| `/natural-japanese <対象>`           | 新規執筆・書き直し（既定はクイックモード） |
| `/natural-japanese full <対象>`      | 公開ページなど、直しの効きが読者に届く文書 |
| `/natural-japanese score <ファイル>` | 書き換えずに診断だけ                       |

- 技術文書として検査する（スキル側で lint の `--genre tech` を指定）。
  指摘は疑いの提示であって修正指示ではないので、直すか残すかは文脈で決める。
  箇条書き主体の一覧で出る「文のリズムが単調」などは残してよい
- 既存文書の書き直しでは、同じ直し方を全項目へ一律に当てない。
  元の濃淡が潰れると、かえって機械が書いたような文章になる
- 一覧表・コマンド表・API 表など、圧縮された情報が本体の箇所は無理に地の文へ戻さない
- **対象外**: コミットメッセージ（英語で書く）、[CHANGELOG.md](../CHANGELOG.md)（semantic-release
  が Conventional Commits から生成する）、コード内のコメントと識別子

## 依存の更新

- 範囲内の更新は `npm update`。範囲を跨ぐものは [dependabot.yml](../.github/dependabot.yml) の方針に従う
  （`typescript` / `@types/node` / `conventional-changelog-conventionalcommits` のメジャーは意図的に無視）
- **`typescript` は Angular の peer に縛られる**（22.1 系は `>=6.0 <6.1`）
- **`conventional-changelog-conventionalcommits` は 9 系に留める** — 10 系にすると
  `@semantic-release/release-notes-generator` が節を 1 つも出さず、リリースノートが見出しだけになる
  （壊れるのはリリース時だけなので、上げる前に commit-analyzer / release-notes-generator を直接叩いて確かめる）
- **`bcdice` を上げたら `node scripts/generate-bcdice-importers.mjs` を実行する** — ゲームシステムと翻訳は
  この一覧から 1 つずつ読み込む。新しいシステムが一覧に無いと、そのシステムを選んでも DiceBot で振られる

## 依存の脆弱性（`npm audit`）

- **`npm audit` は 0 件を保つ**（`website/` も同じ）
- 直せるものは `overrides` に固定版を書いて上げる（`npm audit fix` に任せると別の依存まで動く）
- **`npm` は `tools/npm-stub` に差し替えてある** — `@semantic-release/npm` が同梱する npm CLI の
  `bundleDependencies`（`tar` / `undici` / `ip-address` / `brace-expansion`）は `overrides` が届かず、
  修正済みの同梱物を持つ npm もまだ出ていないため。差し替えても動く理由と戻し方は
  [tools/npm-stub/README.md](../tools/npm-stub/README.md) を参照
- **`semantic-release` を devDependencies から外さないこと** — `npx semantic-release` はローカルの解決を
  使うので、外すと `overrides` の `undici` が効かなくなり、リリース時の zip アップロードが落ちる
