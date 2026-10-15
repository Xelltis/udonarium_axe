# バックエンドの選択肢

Udonarium AxeはP2P接続のためにSkyWayの認証トークンを必要とし、その発行用に小さなバックエンドを1つ使います。
下記のいずれもAxeが呼び出すAPI（`GET /v1/status`・`POST /v1/skyway2023/token`）に対応しており、そのまま利用できます。
必要な環境変数（`SKYWAY_APP_ID` / `SKYWAY_SECRET` / `ACCESS_CONTROL_ALLOW_ORIGIN`）も共通です。

<div class="choice">

**[udonarium-backend-vercel](https://github.com/Xelltis/udonarium-backend-vercel)** <span class="choice__tag">いちばん手軽</span>

TypeScript (Hono)を**Vercel Edge**で動かします。READMEの**Deploy with Vercel**ボタンを押すだけで
配置でき、サーバーを自分で用意する必要がありません。まず動かしてみたいならこれです。

</div>

<div class="choice">

**[udonarium_axe_backend](https://github.com/Xelltis/udonarium_axe_backend)** <span class="choice__tag">レンタルサーバー向け</span>

**PHP 8.3 / Apache**で動きます。Releasesのzipを展開し、`.env`を設定してdocrootに置くだけです。
すでに借りているサーバーがあるなら、契約を増やさずに済みます。

</div>

<div class="choice">

**[udonarium-backend（本家）](https://github.com/TK11235/udonarium-backend)** <span class="choice__tag">自前で運用</span>

TypeScript (Hono)をCloudflare Workers・AWS Lambda・Node.jsのいずれかへCLIでデプロイします。
動かす場所を自分で決めたいときに向きます。

</div>

## 本家バックエンドについて

本家[TK11235/udonarium-backend](https://github.com/TK11235/udonarium-backend)も**そのまま利用できます**。
Axeが呼び出すAPI（`GET /v1/status`・`POST /v1/skyway2023/token`、レスポンス`{ "token": ... }`）と
完全に同一の仕様です。Cloudflare Workers・AWS Lambda・Node.jsのいずれかにデプロイしてください。

## 動作確認

デプロイ後、`https://<バックエンドのURL>/v1/status`を開いて`OK`が返れば、トークン発行が機能しています。
あとは[クイックスタート](/guide/quickstart)の手順3以降でフロントエンドを接続先に向けるだけです。

## 部屋のサーバー（ベータ） {#room-server}

SkyWayを使わずに遊ぶ方法も用意しています。
[udonarium_axe_backend](https://github.com/Xelltis/udonarium_axe_backend)のCloudflare版（`apps/cloudflare`）は、部屋ごとにサーバーを立てて、卓のやりとりをすべてそこで中継します。
SkyWayのアプリもトークンも要りません。

SkyWay版とは、次の点が変わります。

| 項目         | SkyWay版                          | 部屋のサーバー                                                        |
| ------------ | --------------------------------- | --------------------------------------------------------------------- |
| 卓のやりとり | ブラウザ同士で直接                | 部屋のサーバーを通る                                                  |
| 卓の保管     | 参加者が0人になると部屋ごと消える | 最後の1人が抜けてから24時間はサーバーに残る                           |
| 役割         | 各自が選ぶ                        | サーバーが決める。GMとPLはDiscordでログインし、ログインしない人は見学 |
| ダイス       | 振った人のブラウザで振る          | チャットのダイスはサーバーが振る                                      |
| 見えない情報 | 全員のブラウザに届き、画面で隠す  | 見てよい人にしか届けない                                              |
| 画像と音声   | ブラウザ同士で送る（既定）        | サーバーに置き、置いてから30日で消す                                  |

Workerの置きかたと、Discordのアプリの用意は、バックエンドの[ドキュメント](https://xelltis.github.io/udonarium_axe_backend/cloudflare/)にあります。
Axeの側は、`assets/config.json`で`transport`を`"server"`にし、`backend.url`をWorkerのURLにするだけです。

```json
{
  "transport": "server",
  "backend": {
    "url": "https://<WorkerのURL>"
  }
}
```

`transport`を書かないか`"skyway"`にすれば、これまでどおりSkyWayでつながります。
1つの配置先で使えるのはどちらか片方です。部屋ごとには選べません。

::: warning ベータです
部屋のサーバーは、まだ試験中です。
SkyWay版にある機能はすべて動くように作っていますが、実際の卓で使った数はまだ多くありません。
不具合を見つけたら、[Issue](https://github.com/Xelltis/udonarium_axe/issues)で知らせてください。
:::
