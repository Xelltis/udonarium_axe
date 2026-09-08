# 自分で設置するときの質問

自分の環境に置いて運用する側の質問をまとめています。
遊ぶ最中のつまずきは [遊ぶときの困りごと](/play/faq) にあります。

## なぜバックエンドが要るのですか {#why-backend}

SkyWay の Secret をブラウザに置けないので、署名する場所が外に 1 つ要ります。
やり取りするのは接続の許可だけで、卓の中身はここを通りません。
→ [なぜバックエンドが要るのか](/guide/requirements)

## どのバックエンドを選べばよいですか {#which-backend}

- とにかく手軽に始めたい → **Vercel Edge**（[udonarium-backend-vercel](https://github.com/Xelltis/udonarium-backend-vercel)）
- レンタルサーバーを持っている → **PHP 8.3 / Apache**（[udonarium_axe_backend](https://github.com/Xelltis/udonarium_axe_backend)）
- Cloudflare Workers / AWS Lambda / 自前 Node で運用したい → **本家バックエンド**

3 つとも同じ API に対応しているので、あとから乗り換えられます。
→ [バックエンドの選択肢](/guide/backend)

## 本家 Udonarium のバックエンドは使えますか {#upstream-backend}

使えます。
[TK11235/udonarium-backend](https://github.com/TK11235/udonarium-backend) が持つ API（`GET /v1/status`・`POST /v1/skyway2023/token`）と、Axe が呼ぶものは同一です。
すでに本家用に立てているなら、`assets/config.json` の `backend.url` をそこへ向けるだけで済みます。

## 接続できません {#cannot-connect}

上から順に潰してください。

1. `https://<バックエンドのURL>/v1/status` を開いて `OK` が返るか
2. バックエンドの `ACCESS_CONTROL_ALLOW_ORIGIN` が、Axe を公開している URL を許可しているか
3. フロントエンドの `assets/config.json` の `backend.url` が、そのバックエンドを指しているか

3 つとも通っているのにつながらないなら、[Issue](https://github.com/Xelltis/udonarium_axe/issues) で報告してください。

## ゲームデータはサーバーに保存されますか {#storage}

されません。テーブル上のオブジェクトは WebRTC（SkyWay SDK v2）の P2P 通信でブラウザ間を直接行き来し、バックエンドはトークン発行だけを担います。

運用する側から見ると、預かるものが無い代わりに、参加者のデータを復旧してあげることもできません。
卓を残すのは各自の [保存](/manual/save-load) です。

## 更新はどうすればよいですか {#update}

[Releases](https://github.com/Xelltis/udonarium_axe/releases) の `axe_x.y.z.zip` を展開して置き換えます。
zip に入っている `assets/config.json` で上書きされるので、`backend.url` を入れ直してください。

バックエンドは API が変わらないかぎり、そのままで動きます。

## 部屋のデータはどこに残りますか {#room-data}

参加者のブラウザの中だけです。サーバーには残りません。

部屋そのものも、参加者が 0 人になった時点で解散します。
運用側で卓を保管する仕組みはありません。参加者に保存を促してください（→ [部屋とロビー](/manual/rooms#gone)）。
