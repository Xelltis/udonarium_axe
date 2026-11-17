# Udonarium Axe

[![Latest release](https://img.shields.io/github/v/release/Xelltis/udonarium_axe?logo=github)](https://github.com/Xelltis/udonarium_axe/releases/latest)
[![Release](https://github.com/Xelltis/udonarium_axe/actions/workflows/release.yml/badge.svg)](https://github.com/Xelltis/udonarium_axe/actions/workflows/release.yml)
[![Docs](https://img.shields.io/badge/Docs-利用ガイド-5C73E7?logo=vitepress&logoColor=white)](https://xelltis.github.io/udonarium_axe/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> **A**dventure. e**X**perience. **E**ncore. — 冒険を、経験に、もう一度。
>
> 卓の一晩は終わりますが、記録から読み物や動画やまとめとして呼び戻せます。

Udonarium Axeはブラウザで遊べるTRPGのセッションツールです。
インストールは要らず、GMが作った部屋の招待リンクを開けば、参加者が同じテーブルを囲めます。

[Udonarium](https://github.com/TK11235/udonarium)（TK11235）を源流とし、その派生である
[Udonarium Lily](https://github.com/entyu/udonarium_lily)（entyu）の機能とコードを受け継いでいます。
そのうえで実装をAngular 22（Zoneless＋Signals）で作り直し、独自の機能を加えました。

- [デモサイト](https://axe.xelltis.com) — サンプルのコマが並んだテーブルで、すぐに試せます
- [利用ガイド](https://xelltis.github.io/udonarium_axe/) — 遊びかた・操作マニュアル・設置ガイド

## 推奨環境

デスクトップ版Chromeの最新版をおすすめします。Edgeでも同じように描けます。
テーブルを3Dで描くので、ブラウザのグラフィックアクセラレーションを有効にしてください。
幅が768px未満の画面では、スマートフォン向けの画面になります。
くわしくは利用ガイドの[推奨環境](https://xelltis.github.io/udonarium_axe/start/requirements)にあります。

## できること

テーブル（地形・マップ）、キャラクターコマ、カードと山札、ダイス（[BCDice](https://github.com/bcdice/BCDice)）、
チャットとダイスボット、立ち絵の差分、カットイン、投票、タイマーとアラーム、インベントリといった
Udonariumの基本は、そのまま使えます。

Axeで加えた主なものは次のとおりです。

- 3Dのテーブルと真上から見る2D表示、壁の面、高さのあるコマ、四角とヘクスのマス
- 暗闇と視界、光源、霧
- テーブルに組んだダンジョンをコマの目線で歩くダンジョンドリィマスターモード
- 移動範囲・ZOC・交戦エリア、乗り物、射程範囲と物差し
- 陣営ごとにも回せる行動順と、バフ／デバフ
- マップエディターとマップ生成、マップ演出、水域
- キャラクター保管所・ゆとシート・ココフォリアなどからのキャラクターの取り込み
- セッションの記録（リプレイ）と自動保存
- 卓上ディスプレイ向けの表示と、スマートフォン向けの画面
- AIに部屋を読ませて操作させるAI連携と、ClaudeにGMを任せるAI GM

場面ごとの説明は利用ガイドの[Axeでできること](https://xelltis.github.io/udonarium_axe/start/features)に、
UdonariumとLilyから加えた機能の一覧と設計の理由は[docs/features.md](docs/features.md)にあります。

## 自分の環境に置く

Axe本体は静的なファイルなので、ビルドしなくても置けます。
参加者どうしをつなぐには、Axeの外にサーバーを1つ置きます。方式は次の2つです。

| 方式                 | 置くサーバー                                        | 卓の中身                                                                   |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| SkyWay版             | トークン発行サーバー（SkyWayのアカウントが要る）    | ブラウザどうしがP2P（WebRTC）で直接やりとりし、サーバーには残らない        |
| サーバー版（ベータ） | 部屋のサーバー（GMとPLはDiscordのアカウントが要る） | 部屋のサーバーが預かり、最後の参加者が抜けてから既定では24時間たつと消える |

置く手順は次の4つで、それぞれ利用ガイドの設置ガイドにくわしく書いてあります。

1. [方式を選ぶ](https://xelltis.github.io/udonarium_axe/guide/choose)
2. [サーバーを置く](https://xelltis.github.io/udonarium_axe/guide/backend)。置き場所ごとの手順は[バックエンドの文書](https://xelltis.github.io/udonarium_axe_backend/)にあります
3. [Axeを置く](https://xelltis.github.io/udonarium_axe/guide/quickstart)。[Releases](https://github.com/Xelltis/udonarium_axe/releases)の`axe_x.y.z.zip`を展開し、静的ホスティングに置きます
4. [つないで確かめる](https://xelltis.github.io/udonarium_axe/guide/configuration)。`assets/config.json`にサーバーのURLを書き、部屋を作ります

接続情報パネルで「オフライン」を選ぶと、サーバーを使わずに1つのブラウザの中で動きます。ほかの人とはつながりません。

## 開発

```sh
npm install        # 依存のインストール
npm start          # 開発サーバー（ng serve）
npm run build      # プロダクションビルド（dist/とaxe_x.y.z.zipを作る）
npm test           # ユニットテスト（Angularのビルダー経由のVitest）
npx vitest run     # ユニットテスト（Vitestを直接。CIは両方を流す）
npm run lint       # ESLint
npm run e2e        # PlaywrightのE2E
npm run build:mcp  # AI連携のブリッジ（tools/axe-mcp）を1ファイルにまとめる
```

開発サーバーはサーバーのURLを`assets/config.json`から読みます（手元のバックエンドなら`http://localhost:3000`）。
盤面や画面だけを見るときは、接続情報パネルで「オフライン」を選べば、サーバーを立てずに操作できます。

開発の決まりは次の文書にあります。

| 文書                                                   | 内容                                        |
| ------------------------------------------------------ | ------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                 | 開発で守る決まりの最小限（まずはここ）      |
| [docs/architecture.md](docs/architecture.md)           | 7層のアーキテクチャと設計の考え方           |
| [docs/architecture/](docs/architecture/)               | 同期・保存・権限・描画の仕組み              |
| [docs/features.md](docs/features.md)                   | Axeで加えた機能の一覧と、機能ごとの設計文書 |
| [docs/coding-guidelines.md](docs/coding-guidelines.md) | コーディングの決まりとコードスタイル        |
| [docs/contribution.md](docs/contribution.md)           | コミットの決まりとlefthookのフック          |

## 系譜とクレジット

本プロジェクトは次のMITライセンスの作品の系譜にあります（詳細は[LICENSE](LICENSE)）。
Lilyで加えられた立ち絵の差分・カットイン・バフ／デバフの管理・画像タグなどのコードを受け継ぎ、
実装を現行のAngularで作り直したうえで、独自の機能を加えています。
Lycorisはコードの継承元ではなく、ホットバーの着想を得た作品として挙げています。

| 作品                  | 作者                      | リポジトリ                                      | 位置づけ                                     |
| --------------------- | ------------------------- | ----------------------------------------------- | -------------------------------------------- |
| **Udonarium**         | TK11235                   | <https://github.com/TK11235/udonarium>          | オリジナル                                   |
| **Udonarium Lily**    | entyu（円柱）             | <https://github.com/entyu/udonarium_lily>       | 派生・機能拡張版（画像タグ等のコードを継承） |
| **Udonarium Lycoris** | oron1208                  | <https://github.com/oron1208/udonarium-lycoris> | 着想元（ホットバー）。コードの継承はなし     |
| **Udonarium Axe**     | SavageChieftain / Xelltis | <https://github.com/Xelltis/udonarium_axe>      | 本リポジトリ                                 |

### 取り込ませていただいた仕事

系譜とは別に、フォークや提案として作られた機能を本リポジトリへ取り込んでいます。
コミットは著者名もハッシュもそのまま残しています。

| 機能                                                                                                                                     | 作者        | 出どころ                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| **卓上ディスプレイ**（2D多方向閲覧・回転メニュー・外周ティッカー・多方向カットイン・実寸表示）、**レイヤー**（盤面の下と上を流れる背景） | okamichi    | <https://github.com/okamichi/udonarium_axe/tree/2d-multi-view>             |
| **カード文章**（カードの面に文字を重ねる）                                                                                               | synchro4351 | <https://github.com/synchro4351/udonarium_axe/tree/feature/card-face-text> |

設定の置き場や保存先は取り込みにあたって変えたものがありますが、機能そのものは各作者の設計と実装によります。

## ライセンス

[MIT License](LICENSE) — 上記すべての先行作品の著作権表示を含みます。

同梱素材（画像・効果音）の帰属は[src/assets/copyright.txt](src/assets/copyright.txt)に
1ファイルでまとめています。形式はDebian machine-readable copyright format 1.0（DEP-5）で、
ライセンス名にはSPDX短縮識別子を使っています。
