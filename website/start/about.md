# Udonarium Axeについて

> **AXE** — Adventure. eXperience. Encore.
> 冒険を。経験に。もう一度。

このページは、Udonarium Axeの成り立ち（名前と系譜）と、取り込ませていただいた仕事のクレジットをまとめたものです。

Udonarium Axeは、ブラウザ上で動作するTRPGオンラインセッション支援ツールです。
SkyWay版では、テーブル上のオブジェクト（コマ・カード・ダイスなど）はブラウザ同士のP2P通信で直接同期され、ゲームデータが中央のサーバーに保存されることはありません。
設置する人が[サーバー版（ベータ）](/guide/choose)を選んだ配置先では、卓のやりとりが部屋のサーバーを通り、卓は最後の1人が抜けてからしばらく（既定では24時間）サーバーに残ります。

<NetworkDiagram />

[Udonarium](https://github.com/TK11235/udonarium)（TK11235）を源流とし、その派生である
[Udonarium Lily](https://github.com/entyu/udonarium_lily)（entyu）の機能・コードを受け継いでいます。
そのうえで実装の土台を新しく作り直し、独自の機能を加えました。

::: tip 動作確認しているブラウザ
もっとも多く動作確認しているのは**デスクトップ版Chrome**です。
スマートフォン・タブレットでも遊べます（画面に合わせて[専用のレイアウト](/manual/mobile)に切り替わります）。
:::

## 名前について

**A**dventure. e**X**perience. **E**ncore. — 冒険を、経験に、もう一度。

卓の一晩は終わりますが、記録から読み物や動画やまとめとして呼び戻せます。

## 系譜とクレジット

本プロジェクトは以下のMITライセンス作品の系譜にあります。
Lilyで追加された立ち絵差分・カットイン・バフ／デバフ管理・画像タグ等のコードを継承し、
実装基盤を現行Angularで作り直したうえで独自機能を加えています。

| 作品               | 作者                      | リポジトリ                                                        |
| ------------------ | ------------------------- | ----------------------------------------------------------------- |
| **Udonarium**      | TK11235                   | [TK11235/udonarium](https://github.com/TK11235/udonarium)         |
| **Udonarium Lily** | entyu（円柱）             | [entyu/udonarium_lily](https://github.com/entyu/udonarium_lily)   |
| **Udonarium Axe**  | SavageChieftain / Xelltis | [Xelltis/udonarium_axe](https://github.com/Xelltis/udonarium_axe) |

::: info 機能の切り分けについて
上記の機能の切り分けは、各リポジトリのLICENSE・コード・公開情報を根拠にした暫定整理です。
:::

### 取り込ませていただいた仕事

系譜とは別に、フォークや提案として作られた機能を本家へ取り込んでいます。

| 機能                                                                                                         | 作者                                          | 出どころ                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **卓上ディスプレイ**（2D多方向閲覧・回転メニュー・外周ティッカー・多方向カットイン・実寸表示）と**レイヤー** | [okamichi](https://github.com/okamichi)       | [okamichi/udonarium_axe](https://github.com/okamichi/udonarium_axe/tree/2d-multi-view)                |
| **カード文章**（カードの面に文字を重ねる）                                                                   | [synchro4351](https://github.com/synchro4351) | [synchro4351/udonarium_axe](https://github.com/synchro4351/udonarium_axe/tree/feature/card-face-text) |

取り込みにあたって設定の置き場や保存先を変えたものはありますが、機能そのものは各作者の設計と実装によります。コミットは著者名もハッシュもそのまま残しています。
