# Udonarium Axe with Table-Top Display

> **おことわり** : このリポジトリ/ブランチは [Udonarium Axe](https://github.com/Xelltis/udonarium_axe) のフォークで、卓上ディスプレイに特化した機能を追加しています。このドキュメントはほぼフォーク元の内容なので、特化した追加機能の詳細は [2D多方向閲覧・回転メニュー・外周ティッカー](./docs/multi-angle.md) を参照してください。

[![Latest release](https://img.shields.io/github/v/release/okamichi/udonarium_axe?logo=github)](https://github.com/okamichi/udonarium_axe/releases/latest)
[![Docs](https://img.shields.io/badge/Docs-機能追加ガイド-5C73E7?logo=vitepress&logoColor=white)](https://github.com/okamichi/udonarium_axe/docs/multi-angle.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> **AXE** — Adventure. eXperience. Encore.
> 冒険を。経験に。もう一度。

Udonarium Axe は、ブラウザ上で動作する TRPG オンラインセッション支援ツールです。
テーブル上のオブジェクト（コマ・カード・ダイスなど）は WebRTC（SkyWay SDK v2）の P2P 通信で
ブラウザ間に直接同期され、ゲームデータが中央サーバーに保存されることはありません。

[Udonarium](https://github.com/TK11235/udonarium)（TK11235）を源流とし、その派生である
[Udonarium Lily](https://github.com/entyu/udonarium_lily)（entyu）の機能・コードを受け継いでいます。
そのうえで実装基盤を Angular 22 / Zoneless + Signals で作り直し、独自の機能を加えました。

> 動作推奨環境は **デスクトップ版 Chrome** です。スマートフォンからの操作は十分にサポートされていません。

## 必要なもの（バックエンドが要ります）

ゲームデータ自体はブラウザ同士の P2P でやり取りしますが、その P2P 接続を確立するには
SkyWay の **認証トークン** が要ります。トークンは SkyWay の App ID / Secret で署名して発行するもので、
Secret をブラウザに置くわけにはいきません。そのため、**トークンを発行する小さなバックエンドを 1 つ用意する** 必要があります。

```
ブラウザ (Udonarium Axe) ──┬─→ バックエンド（トークン発行のみ）──→ SkyWay
                           │
                           └────────── P2P (WebRTC) ──────────→ 他のプレイヤーのブラウザ
```

つまり遊ぶには次の 3 つが必要です。

1. **SkyWay アカウント**（App ID / Secret。無料枠あり）
2. **バックエンド**（トークン発行用。下記から 1 つ選んでデプロイ）
3. **フロントエンド本体**（この成果物を静的ホスティングに配置）

※ このフォーク版は、サーバ起動時のURLに '?local=1' のクエリを付けて起動すれば、ネットワークには接続できませんが、SkyWayやバックエンドなしに起動は可能です。

## クイックスタート

1. **SkyWay でアプリを作成**
   [SkyWay](https://skyway.ntt.com/) でアカウントを作成し、アプリケーションを 1 つ作成して
   **App ID** と **Secret** を控えます。

2. **バックエンドをデプロイ**
   下の [バックエンドの選択肢](#バックエンドの選択肢) から 1 つ選んでデプロイし、次の環境変数を設定します。
   - `SKYWAY_APP_ID` … 手順 1 の App ID
   - `SKYWAY_SECRET` … 手順 1 の Secret
   - `ACCESS_CONTROL_ALLOW_ORIGIN` … Axe を公開する URL（例: `https://your-axe.example.com`。`*` で全許可）

   ブラウザや `curl` で `https://<バックエンドのURL>/v1/status` を開き、`OK` が返れば成功です。

3. **フロントエンドを配置**
   [Releases](https://github.com/okamichi/udonarium_axe/releases) の `axe_x.y.z.zip` を展開し
   （または自分でビルドした `dist/` を使い）、中身を任意の静的ホスティング
   （Cloudflare Pages / Amazon S3 / レンタルサーバー など）に置きます。

4. **接続先を設定**
   配置したファイルの `assets/config.json` を開き、`backend.url` を手順 2 のバックエンド URL に書き換えます。

   ```json
   {
     "backend": {
       "url": "https://<バックエンドのURL>"
     }
   }
   ```

5. **Chrome で開く**
   配置先の URL をデスクトップ版 Chrome で開き、ルームを作成すればセッションを開始できます。
   同じ URL を共有された参加者が同じルームに入ると、テーブルが同期されます。

## バックエンドの選択肢

いずれも Axe が呼び出す API（`GET /v1/status`・`POST /v1/skyway2023/token`）に対応しており、そのまま利用できます。
必要な環境変数（`SKYWAY_APP_ID` / `SKYWAY_SECRET` / `ACCESS_CONTROL_ALLOW_ORIGIN`）も共通です。

| バックエンド                                                                    | 実装 / 配置先                                               | こんな人に                                   | デプロイ方法                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| [udonarium-backend-vercel](https://github.com/Xelltis/udonarium-backend-vercel) | TypeScript (Hono) / **Vercel Edge**                         | とにかく手軽に始めたい                       | ◎ README の **Deploy with Vercel** ボタンから               |
| [udonarium_axe_backend](https://github.com/Xelltis/udonarium_axe_backend)       | **PHP 8.3 / Apache**                                        | レンタルサーバーを持っている                 | ○ Releases の zip を展開し `.env` を設定して docroot に配置 |
| [udonarium-backend（本家）](https://github.com/TK11235/udonarium-backend)       | TypeScript (Hono) / Cloudflare Workers・AWS Lambda・Node.js | CF Workers / Lambda / 自前 Node で運用したい | ○ 各環境に自前でデプロイ（CLI）                             |

> 本家 [TK11235/udonarium-backend](https://github.com/TK11235/udonarium-backend) も **そのまま利用できます**。
> Axe が呼び出す API（`GET /v1/status`・`POST /v1/skyway2023/token`、レスポンス `{ "token": ... }`）と
> 完全に同一の仕様です。Cloudflare Workers・AWS Lambda・Node.js のいずれかにデプロイしてください。

## 主な機能

テーブル（地形・マップ）、キャラクターコマ、カード／山札、ダイス（[BCDice](https://github.com/bcdice/BCDice)）、
チャットとダイスボット、立ち絵差分、カットイン、投票、タイマー／アラーム、インベントリ などに加え、
壁面サーフェスや 2D 表示、複数選択・一括操作、カスタム射程シェイプ、ジュークボックス、チャットの引用 / 返信、
ココフォリア・キャラクター保管所などからのキャラ取り込み、ダーク / ライトテーマなど Axe 独自の機能を備えています。

### マップ演出（エフェクト）

盤面のコマに演出を再生できます。斬撃・打撃・射撃・炎・雷・氷・土・風・闇・時空・回復・状態異常・防御・強化・撃破の
90 プリセットを内蔵し、対象を選んで撃つと**全員の画面で同時に再生**されます（効果音つき）。

- **撃ち方は 4 通り** — エフェクト集パネルから選ぶ／チャットに `《演出名》` と書く／キャラクターシートの演出欄・コマの右クリックメニュー／
  HP の増減に割り当てて自動再生（個人設定・既定は切）
- **対象は選んだ順** — コマをクリックした順に積まれ、上限に届くと発動。`t:` によるチャットの対象指定とそのまま噛み合います。
  範囲を持つ演出は 1 クリックで巻き込む範囲をまとめて選べます
- **矢の連射・アローレイン・マイクロミサイル・誘導弾・弾道ミサイル・光の大剣（属性違いあり）・飛ぶ斬撃・光線銃・狙撃・レーザー照射**など、
  撃ち手と対象の位置関係を使う演出もあります
- **自分で作れます** — 種類・色・大きさ・尺・弾数・着弾演出・効果音を編集でき、試し撃ちは自分の画面だけで確認できます。
  エフェクト集だけを書き出して別の部屋へ持ち込めます
- 視界外のコマや、OS の「視差効果を減らす」設定では絵を出さず効果音だけ鳴らします

### 卓上ディスプレイ機能

- 共通ウィンドウを90度ずつ回転し、卓の四方から操作できます
- 2Dモードでコマや名前を回転させ、どの席からも読みやすく表示できます
- 固定の「ティッカー」タブへの投稿を画面の四辺に流し、新着投稿へすぐに切り替えます
- プルダウンメニューも４方向に表示できます
- プルダウンメニューを回転メニュー化も可能で、クリックした周回項目の向きにウィンドウが開きます（実験機能）

**→ 追加・拡張機能の一覧は [docs/features.md](docs/features.md) を参照してください。**

## 名前について

**A**dventure. e**X**perience. **E**ncore. — 冒険を、経験に、もう一度。

卓の一晩は終わりますが、記録から読み物や動画やまとめとして呼び戻せます。

## 系譜とクレジット

本プロジェクトは以下の MIT ライセンス作品の系譜にあります（詳細は [LICENSE](LICENSE)）。
Lily で追加された立ち絵差分・カットイン・バフ／デバフ管理・画像タグ等のコードを継承し、
実装基盤を現行 Angular で作り直したうえで独自機能を加えています。
Lycoris はコードの継承元ではなく、ホットバーの着想を得た作品として挙げています。

| 作品                  | 作者                      | リポジトリ                                      | 位置づけ                                     |
| --------------------- | ------------------------- | ----------------------------------------------- | -------------------------------------------- |
| **Udonarium**         | TK11235                   | <https://github.com/TK11235/udonarium>          | オリジナル                                   |
| **Udonarium Lily**    | entyu（円柱）             | <https://github.com/entyu/udonarium_lily>       | 派生・機能拡張版（画像タグ等のコードを継承） |
| **Udonarium Lycoris** | oron1208                  | <https://github.com/oron1208/udonarium-lycoris> | 着想元（ホットバー）。コードの継承はなし     |
| **Udonarium Axe**     | SavageChieftain / Xelltis | <https://github.com/Xelltis/udonarium_axe>      | 本リポジトリのフォーク元                     |

> 注: 上記の機能の切り分けは本リポジトリのフォーク元の LICENSE・コード・公開情報を根拠にした暫定整理です。

## 開発

```sh
npm install        # 依存インストール
npm start          # 開発サーバー（ng serve）
npm run build      # プロダクションビルド（dist/ と axe_x.y.z.zip を生成）
npm test           # ユニットテスト（Vitest）
npm run lint       # ESLint
npm run e2e        # Playwright E2E
```

盤面やUIだけをローカルで確認するときは、開発サーバーの起動後に
`http://localhost:4200/?local=1` を開いてください。ローカル確認モードではSkyWayへ接続しないため、
バックエンドを用意しなくても単独ブラウザ内で操作できます。通常どおり通信するときは `?local=1` を外します。

開発サーバーは既定で SkyWay バックエンドの URL を `assets/config.json`（`http://localhost:3000`）から読み込みます。
ローカルで動かす場合はバックエンドをローカル起動するか、`assets/config.json` を公開済みバックエンドに向けてください。

詳細な開発規範は以下を参照してください。

| ドキュメント                                           | 内容                               |
| ------------------------------------------------------ | ---------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                 | 開発規範の最小セット（まずはここ） |
| [docs/features.md](docs/features.md)                   | Axe で追加・拡張した機能の一覧     |
| [docs/multi-angle.md](docs/multi-angle.md)             | 2D 多方向閲覧と外周ティッカー      |
| [docs/architecture.md](docs/architecture.md)           | 7 層アーキテクチャと設計思想       |
| [docs/coding-guidelines.md](docs/coding-guidelines.md) | コーディング規範・コードスタイル   |
| [docs/contribution.md](docs/contribution.md)           | コミット規約・lefthook フック      |

## ライセンス

[MIT License](LICENSE) — 上記すべての先行作品の著作権表示を含みます。

同梱素材（画像・効果音）の帰属は [src/assets/copyright.txt](src/assets/copyright.txt) に
1 ファイルでまとめています。形式は Debian machine-readable copyright format 1.0（DEP-5）で、
ライセンス名には SPDX 短縮識別子を使っています。
