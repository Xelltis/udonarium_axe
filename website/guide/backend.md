# サーバーを置く

このページは、選んだ方式に合ったサーバーを置き、動いているかを確かめるためのものです。
置く手順そのものは、[udonarium_axe_backend](https://xelltis.github.io/udonarium_axe_backend/)の文書にあります。
ここでは、どの手順を読めばよいか、Axeの側に持ち帰る値、置いたあとの確かめかたを説明します。

<SetupSteps here="server" />

## Axeに持ち帰る値

どちらの方式でも、置き終えたら次の値をAxeの設定に使います。

| 値            | どこで手に入るか                                                  | 使う場所                                                                                |
| ------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| サーバーのURL | 置いたサーバーの画面（各手順の最後に出る）                        | Axeの`assets/config.json`の`backend.url`（→ [config.jsonを書く](/guide/configuration)） |
| AxeのOrigin   | [設置の準備](/guide/requirements#axeのoriginを決める)で決めたもの | サーバーの`ACCESS_CONTROL_ALLOW_ORIGIN`                                                 |

AxeはサーバーのURLを知り、サーバーはAxeのOriginを知っている、という組み合わせで初めてつながります。
どちらか片方が違っていると、つながりません。

## SkyWay版：トークン発行サーバー

### 1. SkyWayのアプリを作る

[SkyWayのアプリを作る](https://xelltis.github.io/udonarium_axe_backend/skyway/app)の手順で、アプリを作り、アプリケーションIDとシークレットキーを控えます。
シークレットキーは、ほかの人に見せないでください。

### 2. トークン発行サーバーを置く

置き場所を1つ選び、その手順で置きます。

| 置き場所                   | かかる時間  | 手順                                                                                              |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Vercel（いちばん手軽）     | 30分ほど    | [Vercelに置く](https://xelltis.github.io/udonarium_axe_backend/skyway/vercel)                     |
| 借りているレンタルサーバー | 30分〜1時間 | [レンタルサーバーに置く](https://xelltis.github.io/udonarium_axe_backend/skyway/php)              |
| Cloudflare Workers         | 30分ほど    | [Cloudflareに置く（SkyWay版）](https://xelltis.github.io/udonarium_axe_backend/skyway/cloudflare) |

どれも、サーバーに次の3つの値を入れます。

| 名前                          | 入れる値                                     |
| ----------------------------- | -------------------------------------------- |
| `SKYWAY_APP_ID`               | 手順1のアプリケーションID                    |
| `SKYWAY_SECRET`               | 手順1のシークレットキー                      |
| `ACCESS_CONTROL_ALLOW_ORIGIN` | AxeのOrigin（例：`https://axe.example.com`） |

ほかの値と、くわしい意味は、バックエンドの文書の[設定項目（SkyWay版）](https://xelltis.github.io/udonarium_axe_backend/skyway/configuration)にあります。

本家ユドナリウムのトークン発行サーバー（[TK11235/udonarium-backend](https://github.com/TK11235/udonarium-backend)）を置いても構いません。
Axeが使うAPI（`GET /v1/status`と`POST /v1/skyway2023/token`）は、本家と同じです。

### 3. 動いているかを確かめる

ブラウザで`https://<サーバーのURL>/v1/status`を開きます。
レンタルサーバーのサブフォルダに置いたときは、そのパスも入れます（例：`https://example.com/backend/v1/status`）。

| 見えるもの                                 | 意味                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `OK`                                       | 動いています（PHP版・本家）                                                                            |
| `{"error":{"code":"ORIGIN_REQUIRED",...}}` | 動いています（Vercel版・Cloudflare版）。ブラウザでじかに開くとOriginが付かないので、断っているだけです |
| `{"error":{"code":"CONFIG_INVALID",...}}`  | `SKYWAY_APP_ID`か`SKYWAY_SECRET`が入っていないか、正しくありません                                     |
| ページが開けない、`404`                    | URLが違うか、置く作業が終わっていません                                                                |

`ACCESS_CONTROL_ALLOW_ORIGIN`が正しいかは、ここでは確かめられません。
Axeを置いてから、部屋を作って確かめます（→ [config.jsonを書く](/guide/configuration#確かめる)）。

## サーバー版：部屋のサーバー {#room-server}

### 1. Discordのアプリを作る

部屋のサーバーは、GMとPLにDiscordでログインしてもらいます。
[Discordのアプリを作る](https://xelltis.github.io/udonarium_axe_backend/server/discord)の手順で、アプリを作り、Client IDとClient Secretを控えます。

### 2. 部屋のサーバーを置く

| 置き場所                     | かかる時間 | 手順                                                                                  |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| Cloudflare（迷ったらこちら） | 1時間ほど  | [Cloudflareに置く](https://xelltis.github.io/udonarium_axe_backend/server/cloudflare) |
| Vercel                       | 1時間ほど  | [Vercelに置く](https://xelltis.github.io/udonarium_axe_backend/server/vercel)         |

置くときに入れる値（Discordの2つ、`SESSION_SECRET`、`ACCESS_CONTROL_ALLOW_ORIGIN`など）は、バックエンドの文書の[設定項目（サーバー版）](https://xelltis.github.io/udonarium_axe_backend/server/configuration)にあります。

::: warning `ACCESS_CONTROL_ALLOW_ORIGIN`を`*`にしないでください
サーバー版では、`*`（すべて許可）にするとログインが通らず、部屋も作れません。
ログインのあとで戻れるのは、名前で書いたOriginのページだけだからです。
AxeのOriginを、`https://axe.example.com`のように書いてください。
:::

### 3. 動いているかを確かめる

部屋のサーバーは、ブラウザでじかに開いても確かめられません。
Originを付けて尋ねる必要があるので、ターミナルで次のコマンドを打ちます（`Origin`には、`ACCESS_CONTROL_ALLOW_ORIGIN`に書いたURLを入れます）。

```sh
curl -H "Origin: https://axe.example.com" https://<部屋のサーバーのURL>/v1/auth/config
```

| 見えるもの                       | 意味                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `{"providers":["discord"]}`      | 動いています                                                                                                     |
| `{"providers":[]}`               | ログインの設定（Discordの2つと`SESSION_SECRET`）が入っていません。部屋を使えません                               |
| `{"error":"origin-not-allowed"}` | `Origin`に付けたURLが、`ACCESS_CONTROL_ALLOW_ORIGIN`と合っていません。`Origin`を付け忘れたときも、これになります |

ターミナルを使わない確かめかたと、ほかの表示の意味は、バックエンドの文書の[困ったとき（サーバー版）](https://xelltis.github.io/udonarium_axe_backend/server/troubleshooting)にあります。

## 次に読むもの

- [Axeを置く](/guide/quickstart) — リリースのzipを静的ホスティングに置く
- [config.jsonを書く](/guide/configuration) — Axeとサーバーをつなぐ
