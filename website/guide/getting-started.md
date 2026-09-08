# Udonarium Axe とは

> **AXE** — Adventure. eXperience. Encore.
> 冒険を。経験に。もう一度。

Udonarium Axe は、ブラウザ上で動作する TRPG オンラインセッション支援ツールです。
テーブル上のオブジェクト（コマ・カード・ダイスなど）は WebRTC（SkyWay SDK v2）の P2P 通信で
ブラウザ間に直接同期され、ゲームデータが中央サーバーに保存されることはありません。

<NetworkDiagram />

[Udonarium](https://github.com/TK11235/udonarium)（TK11235）を源流とし、その派生である
[Udonarium Lily](https://github.com/entyu/udonarium_lily)（entyu）の機能・コードを受け継いでいます。
そのうえで実装基盤を Angular 22 / Zoneless + Signals で作り直し、独自の機能を加えました。

> 動作確認がもっとも厚いのは **デスクトップ版 Chrome** です。
> スマートフォン・タブレットでも遊べます（画面に合わせて[専用のレイアウト](/manual/mobile)に切り替わります）。

## 次のステップ

遊ぶだけなら、設置は要りません。[デモサイト](https://axe.xelltis.com)を開けばその場で卓が動きます。

- [遊びはじめる](/play/) — どの入口から来ても、まずここ
- [できること](/guide/features) — 盤面・暗闇・記録まで、場面ごとに
- [なぜバックエンドが要るのか](/guide/requirements) — 自分の場所を持つときの全体像
- [クイックスタート](/guide/quickstart) — 最短の設置手順

## 名前について

**A**dventure. e**X**perience. **E**ncore. — 冒険を、経験に、もう一度。

卓の一晩は終わりますが、記録から読み物や動画やまとめとして呼び戻せます。

## 系譜とクレジット

本プロジェクトは以下の MIT ライセンス作品の系譜にあります。
Lily で追加された立ち絵差分・カットイン・バフ／デバフ管理・画像タグ等のコードを継承し、
実装基盤を現行 Angular で作り直したうえで独自機能を加えています。

| 作品               | 作者                      | リポジトリ                                                        |
| ------------------ | ------------------------- | ----------------------------------------------------------------- |
| **Udonarium**      | TK11235                   | [TK11235/udonarium](https://github.com/TK11235/udonarium)         |
| **Udonarium Lily** | entyu（円柱）             | [entyu/udonarium_lily](https://github.com/entyu/udonarium_lily)   |
| **Udonarium Axe**  | SavageChieftain / Xelltis | [Xelltis/udonarium_axe](https://github.com/Xelltis/udonarium_axe) |

> 上記の機能の切り分けは、各リポジトリの LICENSE・コード・公開情報を根拠にした暫定整理です。

### 取り込ませていただいた仕事

系譜とは別に、フォークや提案として作られた機能を本家へ取り込んでいます。

| 機能                                                                                                          | 作者                                          | 出どころ                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **卓上ディスプレイ**（2D 多方向閲覧・回転メニュー・外周ティッカー・多方向カットイン・実寸表示）と**レイヤー** | [okamichi](https://github.com/okamichi)       | [okamichi/udonarium_axe](https://github.com/okamichi/udonarium_axe/tree/2d-multi-view)                |
| **カード文章**（カードの面に文字を重ねる）                                                                    | [synchro4351](https://github.com/synchro4351) | [synchro4351/udonarium_axe](https://github.com/synchro4351/udonarium_axe/tree/feature/card-face-text) |

取り込みにあたって設定の置き場や保存先を変えたものはありますが、機能そのものは各作者の設計と実装によります。コミットは著者名もハッシュもそのまま残しています。
