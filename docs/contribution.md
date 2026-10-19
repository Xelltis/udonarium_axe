# Udonarium Axe — コントリビューション規約

コミットメッセージ・Gitフック・ドキュメントの書き方に関するルール。
コーディング規約は[coding-guidelines.md](coding-guidelines.md)、
アーキテクチャは[architecture.md](architecture.md)を参照。

## 基本方針

- **コミットメッセージは必ず英語**で書く
- **Conventional Commits + lefthook**で運用する
- **複数の論理的変更を1コミットに混ぜない**
  （バージョンバンプ・機能変更・ドキュメント整備は別コミット）

## Conventional Commitsフォーマット

形式: `type(scope): subject`

### type

`feat` / `fix` / `docs` / `chore` / `style` / `refactor` / `test` / `perf` / `build` / `ci`

### scope

変更対象の領域名。よく使うものは次のとおり。

| カテゴリ | scope                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| 機能     | `chat`, `tabletop`, `character`, `card`, `dice`, `lobby`, `media`, `controller`, `vote`, `inventory`, `alarm` |
| インフラ | `network`, `storage`, `sync`                                                                                  |
| レイヤー | `application`, `ui`, `domain`                                                                                 |
| その他   | `css`, `release`                                                                                              |

### subject

- 英語・命令形（`add` / `fix` / `update`）
- 冒頭小文字・末尾ピリオドなし
- 72文字以内

### body（任意）

- 何より **「なぜ」** を書く
- 箇条書きは`- `で始める

### footer（任意）

- `BREAKING CHANGE:`フッタは現状未使用だが、必要なときは追加する

### 例

```
feat(tabletop): expand table area to 6000px and adjust zoom range
```

```
fix(chat): prevent duplicate logout message and invisible messages from late-timestamp peers

- the chat tab filtered incoming messages locally, so messages that
  arrived over P2P with an older timestamp were never drawn
- filter by aliasName instead of timestamp
```

```
chore(release): bump version to 1.2.2
```

## lefthookフック（迂回は手段を問わず絶対禁止）

`--no-verify` / `LEFTHOOK=0` / `core.hooksPath`の変更 / lefthook設定の一時無効化、
**いずれも禁止**。フックが落ちたら原因を直してから再コミットする。

| フック       | 内容                                                            |
| ------------ | --------------------------------------------------------------- |
| `commit-msg` | `commitlint`（メッセージ形式検査）                              |
| `pre-commit` | stagedの`src/`に`eslint` + `vitest related`（関係するspecだけ） |
| `pre-push`   | `npx vitest run`（全量） + `npm run build`                      |

`pre-commit`の`vitest related`はstagedファイルからimportを逆にたどって当たるspecだけを回す
（[scripts/vitest-related.mjs](../scripts/vitest-related.mjs)。テンプレートは隣の`.ts`に読み替える）。
ただし、テストのセットアップが読み込むファイル（間接的に読むものも含む）や、ランナーの設定
（`vitest.config.ts`など）をstagedにしたときは、どのspecにも影響するので全量を回す。
全量は`pre-push`とCIが見る。

設定: [../lefthook.yml](../lefthook.yml)

## CI（mainへのPull Request）

フックはコミットする人の手元でしか走らない。mainへのPull Requestでは
[GitHub Actions](../.github/workflows/ci.yml)が同じ関門を通したうえで、
フックの外にあるものまで見る。

| ジョブ           | 内容                                   |
| ---------------- | -------------------------------------- |
| `Format`         | `npm run format:check`                 |
| `Lint`           | `npm run lint`                         |
| `Test (ng test)` | `npm test`（Angular builderの設定）    |
| `Test (vitest)`  | `npx vitest run`（`vitest.config.ts`） |
| `Build`          | `npm run build`                        |
| `Website`        | `website/`のVitePressビルド            |

ユニットテストの2経路は別ジョブに分けてある。片方だけ落ちることがあるので、
チェック名で落ちた経路が分かるようにしている。

E2Eは載せていない。PlaywrightはCIだと5ブラウザぶん走る設定で、Pull Request
1回に何十分もかかる。手元で`npm run e2e`を回す。

演出の見た目は`e2e/visual/`のスクリーンショット比較で守る。
`npx playwright test --project=visual`が`e2e/visual/__screenshots__/`の基準画像と
比べる。時計を止め、アニメーションを終端まで送ってから撮るので、同じ機械なら同じ絵になる。
基準画像は手元のChromiumで作ってコミットし、CIでは回さない。
見た目を変えるつもりの変更で差分が出たら`--update-snapshots`で撮り直し、何がどう変わったかを
コミット本文に書く。差分の理由が言えないなら、それは退行として直す。

## リリース

- `package.json`の`version`がリリース番号
- 更新は`chore(release): bump version to X.Y.Z`で1コミットに切り出す
- 機能変更・バージョンバンプ・ドキュメント整備を同じコミットに混ぜない

## ドキュメントの日本語

まとまった日本語（[README.md](../README.md)・`docs/`・`website/`の本文）は、`yomiyasu`スキルを通して書く。
プラグインは[.claude/settings.json](../.claude/settings.json)の`enabledPlugins`で有効にしてあり、
配布元は[nanaism/yomiyasu](https://github.com/nanaism/yomiyasu)。
ほかの日本語校正スキル（以前使っていた`natural-japanese`など）と同時に有効にすると指示が干渉するので、併用しない。

| 頼み方                                             | 用途                                                      |
| -------------------------------------------------- | --------------------------------------------------------- |
| `/yomiyasu:yomiyasu <対象>`                        | 新規執筆・書き直し                                        |
| 依頼に「技術記事向けに」「業務仕様向けに」と添える | 文書の種類の指定（省略すると本文から判定する）            |
| 依頼に「チームの運用ルールとして」と添える         | `docs/`の規約のように、決まりを伝える文書で文末をそろえる |

- 和文と英数字の間に半角空白を入れない。インラインコードの前後も詰める。
  yomiyasuの書き方に合わせた決まりで、空けてある既存の文書は書き直すときにそろえる
- リンター（`yomiyasu_lint.py`）と書き直し前後の差分の点検（`yomiyasu_diff.py`）はスキルが走らせる。
  Python 3の標準ライブラリだけで動くので、追加で入れるものはない
- 指摘は疑いの提示であって修正指示ではないので、直すか残すかは文脈で決める。
  規約集のように箇条書きと太字が本体の文書では、「箇条書きの比率」「太字の頻度」の警告は残してよい
- 既存文書の書き直しでは、同じ直し方を全項目へ一律に当てない。
  元の濃淡が潰れると、かえって機械が書いたような文章になる
- 一覧表・コマンド表・API表など、圧縮された情報が本体の箇所は無理に地の文へ戻さない
- **対象外**: コミットメッセージ（英語で書く）、[CHANGELOG.md](../CHANGELOG.md)（semantic-releaseが
  Conventional Commitsから生成する）、コード内のコメントと識別子

## websiteの書き方

`website/`は、遊ぶ人・調べる人・設置する人に向けたサイトで、[udonarium_axe_backend](https://github.com/Xelltis/udonarium_axe_backend)の文書（`docs/`と`development/docs.md`）と同じ書き方にそろえる。

### 読む人と読む順でセクションを分ける

上のナビは、はじめての人が読む順に並べる。
各セクションのサイドバーには、そのセクションのページだけを置く（ほかのセクションへの行き来は上のナビに任せる）。

| セクション        | 読む人                         | 置くもの                                                                        |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `/start/`         | はじめてAxeを使う人（誰でも）  | Axeとは、できること、試しかた、招待リンクでの参加、はじめてのセッション、用語集 |
| `/manual/`        | 遊びながら調べる人（PL・GM）   | 機能ごとの操作と設定。群は、必要になる順に並べる                                |
| `/help/`          | うまく動かない人               | 症状から読むところを引く表と、よくある困りごと                                  |
| `/guide/`         | 自分で設置する人               | 方式の選びかた、置く手順、設定、更新、設置で困ったとき                          |
| `/release-notes/` | 更新で何が変わったか知りたい人 | 版ごとの変更（CHANGELOGとは別に、遊ぶ人向けに書く）                             |

- 同じ名前の入口（「はじめに」など）を、ほかのセクションの中に作らない。設置ガイドの最初のページは「設置の流れ」とする
- ページを別のセクションへ動かしたら、元のURLに転送用のページ（`<MovedPage>`）を残す。外のサイトやバックエンドの文書からのリンクが切れないようにするため

### ページの決まり

- 冒頭の2〜4文で、何のページか、誰が使えるか（ロール）、いつ読むかを書く。設置の手順なら、かかる時間も書く
- 見出しは、その節が何を扱うかを表す短い言葉にする（例: 「部屋が消えるとき」「単位の換算」）。「部屋がなくてもテーブルは動く」のような主張の文や、宣伝文句にしない。FAQの問いの形はそのままでよい
- ナビ・サイドバー・カードの文言は、行き先が分かる名詞にする（例: 「設置ガイド」「関連ページ」）。「遊ぶほうへ」「そのあと」のような、どこへ行くのか分からない言葉は使わない
- 手順は番号付きにする。設置の手順は「## 0. 用意するもの」から始め、見出しを「## N. 動詞句」にする（番号の印で描かれる）
- 画面の文言は太字で書き、`src/assets/i18n/ja.json`の文言と一致させる。確かめられないときは、ボタンの名前ではなく働きで書く
- 設定や項目は「項目・既定値・内容」の表にし、既定値はコードで確かめる
- 失敗しうる操作には「うまくいかないとき」の節を置き、「見えるもの」と「原因と直しかた」を表にする
- 注記は`:::`の容器にそろえ、題に中身を書く（例: `::: warning 保存し忘れると消えます`）。`>`の引用は注記に使わない
- 用語は[用語集](../website/start/glossary.md)に従う。コマ（駒とは書かない）、テーブル（地図）と卓（セッション）、部屋（ルーム）
- 1つの事実は1ページにだけ書き、ほかのページからはリンクする。バックエンドの置きかたはバックエンドの文書へリンクし、書き写さない
- 作品名や製品固有の用語は書かない。汎用の機能として説明する
- 実在の鍵やトークンは、例でも書かない
- スクリーンショットは`Shot`の部品で載せる。手元の本番ビルドを1440×900で撮り、ロビーは撮らない

### 見出しとリンク

- 見出しのidはサイトの`slugify`（`website/.vitepress/slugify.mjs`）で決まる。長い見出しや変わりやすい見出しには`{#id}`でidを付ける
- 見出しを変えたら、`website/`で`npm run check`を流す。見出しへのリンクがどれも見出しに届くかを確かめ、届かないものを並べる。CIでも流れる
- ページを足したら、`website/.vitepress/config.ts`のサイドバーにも足す

## 依存の更新

- 範囲内の更新は`npm update`。範囲を跨ぐものは[dependabot.yml](../.github/dependabot.yml)の方針に従う
  （`typescript` / `@types/node` / `conventional-changelog-conventionalcommits`のメジャーは意図的に無視）
- **`typescript`はAngularのpeerに縛られる**（22.1系は`>=6.0 <6.1`）
- **`conventional-changelog-conventionalcommits`は9系に留める**。10系にすると
  `@semantic-release/release-notes-generator`が節を1つも出さず、リリースノートが見出しだけになる
  （おかしくなるのはリリース時だけなので、上げる前にcommit-analyzer / release-notes-generatorを直接叩いて確かめる）
- **`bcdice`を上げたら`node scripts/generate-bcdice-importers.mjs`を実行する**。ゲームシステムと翻訳は
  生成される`src/app/domain/dice/bcdice/bcdice-importers.generated.ts`の一覧から読み込む。システムは継承の系統ごとに
  約300KBずつ`groups/`のチャンクにまとめ、翻訳はその手前の別チャンクに分ける（ビルドを1,000ファイル未満に保つため）。
  新しいシステムが一覧に無いと、そのシステムを選んでもDiceBotで振られる

## 依存の脆弱性（`npm audit`）

- **`npm audit`は0件を保つ**（`website/`も同じ）
- 直せるものは`overrides`に固定版を書いて上げる（`npm audit fix`に任せると別の依存まで動く）
- **`npm`は`tools/npm-stub`に差し替えてある**。`@semantic-release/npm`が同梱するnpm CLIの
  `bundleDependencies`（`tar` / `undici` / `ip-address` / `brace-expansion`）は`overrides`が届かず、
  修正済みの同梱物を持つnpmもまだ出ていないため。差し替えても動く理由と戻し方は
  [tools/npm-stub/README.md](../tools/npm-stub/README.md)を参照
- **`semantic-release`をdevDependenciesから外さないこと**。`npx semantic-release`はローカルの解決を
  使うので、外すと`overrides`の`undici`が効かなくなり、リリース時のzipアップロードが落ちる
