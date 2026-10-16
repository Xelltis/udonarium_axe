# 自分で設置するときの質問

自分の環境に置いて運用する側の質問をまとめています。
遊ぶ最中のつまずきは[遊ぶときの困りごと](/play/faq)にあります。

## なぜバックエンドが要るのですか {#why-backend}

SkyWayのSecretをブラウザに置けないので、署名する場所が外に1つ要ります。
やり取りするのは接続の許可だけで、卓の中身はここを通りません。
→ [なぜバックエンドが要るのか](/guide/requirements)

## どのバックエンドを選べばよいですか {#which-backend}

- とにかく手軽に始めたい → **Vercel Edge**（[udonarium-backend-vercel](https://github.com/Xelltis/udonarium-backend-vercel)）
- レンタルサーバーを持っている → **PHP 8.3 / Apache**（[udonarium_axe_backend](https://github.com/Xelltis/udonarium_axe_backend)）
- Cloudflare Workers / AWS Lambda / 自前Nodeで運用したい → **本家バックエンド**

3つとも同じAPIに対応しているので、あとから乗り換えられます。
→ [バックエンドの選択肢](/guide/backend)

## 本家Udonariumのバックエンドは使えますか {#upstream-backend}

使えます。
[TK11235/udonarium-backend](https://github.com/TK11235/udonarium-backend)が持つAPI（`GET /v1/status`・`POST /v1/skyway2023/token`）と、Axeが呼ぶものは同一です。
すでに本家用に立てているなら、`assets/config.json`の`backend.url`をそこへ向けるだけで済みます。

## 接続できません {#cannot-connect}

上から順に確かめてください。

1. `https://<バックエンドのURL>/v1/status`を開いて`OK`が返るか
2. バックエンドの`ACCESS_CONTROL_ALLOW_ORIGIN`が、Axeを公開しているURLを許可しているか
3. フロントエンドの`assets/config.json`の`backend.url`が、そのバックエンドを指しているか

部屋のサーバー（Cloudflare版）には`/v1/status`がありません。1の代わりに、次のように`/v1/auth/config`を尋ねて、`{"providers":["discord"]}`が返るかを見てください。`Origin`には、`ACCESS_CONTROL_ALLOW_ORIGIN`に書いたURLを付けます。

```sh
curl -H "Origin: https://axe.example.com" https://<バックエンドのURL>/v1/auth/config
```

`{"providers":[]}`が返るなら、Workerにログインの設定が入っていないので、部屋を使えません。
3では、`backend.url`に加えて、`transport`が`"server"`になっているかも確かめてください。2はSkyWay版と同じですが、部屋のサーバーでは`*`にするとログインが通らず、部屋も作れません。ログインから戻れるのは、名前で書いたOriginのページだけだからです。AxeのURLを書いてください。

3つとも通っているのにつながらないなら、[Issue](https://github.com/Xelltis/udonarium_axe/issues)で報告してください。

## ゲームデータはサーバーに保存されますか {#storage}

SkyWay版では、されません。テーブル上のオブジェクトはWebRTC（SkyWay SDK v2）のP2P通信でブラウザ間を直接行き来し、バックエンドはトークン発行だけを担います。

運用する側から見ると、預かるものが無い代わりに、参加者のデータを復旧してあげることもできません。
卓を残すのは各自の[保存](/manual/save-load)です。

[部屋のサーバー（ベータ）](/guide/backend#room-server)を使う場合は、保存されます。
卓と、部屋に置いた画像と音声は、最後の1人が抜けてから24時間、Workerに残ります。GMが部屋を削除すれば、その場で消えます。
ログインした人のDiscordの名前とアバターも、アカウントを消すまで残ります。部屋に残る発言に載った名前とアバターは、アカウントを消したあとも、その部屋が消えるまで残ります。
期間は設置する人の設定しだいです。

## 更新はどうすればよいですか {#update}

[Releases](https://github.com/Xelltis/udonarium_axe/releases)の`axe_x.y.z.zip`を展開して置き換えます。
zipに入っている`assets/config.json`で上書きされるので、`backend.url`を入れ直してください。
部屋のサーバーで配信しているときは、`transport`の`"server"`も入れ直します。zipに入っているものは`"skyway"`です。

バックエンドはAPIが変わらないかぎり、そのままで動きます。

Cloudflare Pagesでは、書き換えたフォルダをダッシュボードか[Wrangler](#cloudflare-pages)で上げ直します。

## Cloudflare Pagesにドラッグ＆ドロップで置けません {#cloudflare-pages}

ダッシュボードのドラッグ＆ドロップで上げられるのは1,000ファイルまでで、版によってはAxeのファイルがこれを超えるためです。Cloudflare Pages自体は20,000ファイルまで置けるので、Wranglerで上げてください。手順は[クイックスタート](/guide/quickstart#cloudflare-pagesに置くとき)にあります。ダッシュボードで作ったプロジェクトのまま上げられるので、URLは変わりません。

## 部屋のデータはどこに残りますか {#room-data}

SkyWay版では、参加者のブラウザの中だけです。サーバーには残りません。

部屋そのものも、参加者が0人になった時点で解散します。
運用側で卓を保管する仕組みはありません。参加者に保存を促してください（→ [部屋とロビー](/manual/rooms#gone)）。

部屋のサーバーでは、卓はWorkerに残り、最後の1人が抜けてから24時間たつと部屋ごと消えます。
それより長く残したい卓は、SkyWay版と同じく各自で保存してください。
