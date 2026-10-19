# 設置の準備

このページは、Axeを置く作業に入る前に、用意するものと決めておくことをまとめたものです。
アカウントを作り、Axeを置くURL（Origin）を決めておくと、あとの手順で迷いません。
方式（SkyWay版かサーバー版か）は、先に[方式を選ぶ](/guide/choose)で決めておいてください。

## 用意するアカウント

方式と置き場所の組み合わせごとに、要るアカウントが変わります。

| 置くもの                          | 要るアカウント                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Axe本体（Cloudflare Pagesに置く） | [Cloudflare](https://dash.cloudflare.com/sign-up)（上げるのに、パソコンにNode.jsを入れます）         |
| Axe本体（レンタルサーバーに置く） | 借りているレンタルサーバー                                                                           |
| トークン発行サーバー（SkyWay版）  | [SkyWay](https://skyway.ntt.com/)と、置き場所（Vercel・Cloudflare・レンタルサーバー）のアカウント    |
| 部屋のサーバー（サーバー版）      | [Discord](https://discord.com/developers/applications)と、置き場所（Cloudflare・Vercel）のアカウント |

置き場所ごとに要るものは、バックエンドの文書の各手順の「0. 用意するもの」にあります。
GitHubのアカウントは、VercelやCloudflareのボタンで置くときに使います（→ [GitHubのアカウントを作る](https://xelltis.github.io/udonarium_axe_backend/guide/prepare#githubのアカウントを作る)）。

::: tip 同じ場所にまとめると楽です
Axe本体とサーバーを同じサービスに置くと、アカウントが1つで済みます。
たとえば、Axe本体をCloudflare Pagesに、部屋のサーバーをCloudflare Workersに置けば、使うのはCloudflareのアカウントだけです。
:::

## AxeのOriginを決める

Origin（オリジン）は、URLのうち`https://`からドメイン（とポート）までの部分です。
Axeを`https://axe.example.com/`で配るなら、Originは`https://axe.example.com`です。

サーバーは、決めたOriginから来たAxeだけを受け付けます。
ほかのサイトに置かれたAxeから、あなたのサーバーを使われないようにするためです。
そのため、サーバーを置くときに、AxeのOriginを書く欄（`ACCESS_CONTROL_ALLOW_ORIGIN`）があります。

| Axeを置く場所                    | Originの例                                             |
| -------------------------------- | ------------------------------------------------------ |
| Cloudflare Pages（そのまま）     | `https://<プロジェクトの名前>.pages.dev`               |
| Cloudflare Pages（独自ドメイン） | `https://axe.example.com`                              |
| レンタルサーバーのサブフォルダ   | `https://example.com`（`/axe/`のようなパスは含めない） |

Originは、サーバーを置く前に決めておきます。
Cloudflare Pagesのプロジェクトの名前を先に決めれば、URLも決まります。
あとで独自ドメインに変えたときは、サーバーの`ACCESS_CONTROL_ALLOW_ORIGIN`も書き換えます。

URLからOriginを取り出すくわしい例は、バックエンドの文書の[AxeのOriginを確かめる](https://xelltis.github.io/udonarium_axe_backend/guide/prepare#axeのoriginを確かめる)にあります。

## リリースのzip

Axe本体は、[GitHubのReleases](https://github.com/Xelltis/udonarium_axe/releases)にある`axe_x.y.z.zip`（`x.y.z`は版の番号）です。
展開すると、次のファイルが出てきます。

| ファイル・フォルダ        | 中身                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `index.html`              | Axeの入口。このファイルのあるフォルダを、そのまま配ります                               |
| `*.js`・`*.css`           | Axeのプログラムと見た目。名前に入っている英数字は版ごとに変わります                     |
| `assets/config.json`      | どの方式で、どのサーバーにつなぐかの設定（→ [config.jsonを書く](/guide/configuration)） |
| `assets/`のほかのフォルダ | 画像・音声・フォント・アイコン・画面の文言                                              |
| `3rdpartylicenses.txt`    | Axeが使っているライブラリのライセンス                                                   |

フォルダの構成は変えずに、展開したものをまるごと置きます。
`index.html`は相対パスでファイルを読むので、`https://example.com/axe/`のようなサブフォルダに置いても動きます。
ファイルの数は1,000未満です。

## なぜサーバーが要るのか

Axe本体は、HTMLとJavaScriptのファイルだけでできています。
ファイルを置けばブラウザで開けますが、参加者どうしをつなぐには、Axeの外にサーバーが要ります。

SkyWay版では、ゲームデータそのものはブラウザ同士のP2Pでやりとりしますが、P2Pの接続を張るにはSkyWayの認証トークンが要ります。
トークンはSkyWayのアプリのシークレットキーで署名して作るもので、シークレットキーをブラウザに置くわけにはいきません。
そのため、トークンを作って渡す小さなサーバー（トークン発行サーバー）を1つ置きます。

<NetworkDiagram />

SkyWay版では、卓の中身はトークン発行サーバーを通りません。
サーバーが渡すのは、入室の許可証だけです。

サーバー版では、部屋のサーバーが参加者のやりとりを中継し、卓と画像と音声を預かります。
SkyWayのアカウントは要りません。

## ファイルを書き換える道具

Axeを置くときは、`assets/config.json`を書き換えます。
メモ帳やテキストエディットのようなテキストエディターで開いて書き換え、文字コードはUTF-8のまま保存します。
くわしい手順は、バックエンドの文書の[テキストファイルを書く](https://xelltis.github.io/udonarium_axe_backend/guide/prepare#テキストファイルを書く)にあります。

## 次に読むもの

- [サーバーを置く](/guide/backend) — 方式に合ったサーバーを置き、動いているかを確かめる
- [Axeを置く](/guide/quickstart) — リリースのzipを静的ホスティングに置く
