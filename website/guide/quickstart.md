# クイックスタート

自分の場所を持つときの手順です。
遊ぶだけなら要りません（→ [遊びはじめる](/play/)）。

[なぜバックエンドが要るのか](/guide/requirements)で挙げた3つを、次の順で用意します。

<SetupSteps />

## 1. SkyWayでアプリを作成

[SkyWay](https://skyway.ntt.com/)でアカウントを作成し、アプリケーションを1つ作成して
**App ID**と**Secret**を控えます。

## 2. バックエンドをデプロイ

[バックエンドの選択肢](/guide/backend)から1つ選んでデプロイし、次の環境変数を設定します。

| 環境変数                      | 内容                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| `SKYWAY_APP_ID`               | 手順1のApp ID                                                       |
| `SKYWAY_SECRET`               | 手順1のSecret                                                       |
| `ACCESS_CONTROL_ALLOW_ORIGIN` | Axeを公開するURL（例: `https://your-axe.example.com`。`*`で全許可） |

ブラウザや`curl`で`https://<バックエンドのURL>/v1/status`を開き、`OK`が返れば成功です。

## 3. フロントエンドを配置

[Releases](https://github.com/Xelltis/udonarium_axe/releases)の`axe_x.y.z.zip`を展開し
（または自分でビルドした`dist/`を使い）、中身を任意の静的ホスティング
（Cloudflare Pages / Amazon S3 / レンタルサーバーなど）に置きます。

## 4. 接続先を設定

配置したファイルの`assets/config.json`を開き、`backend.url`を手順2のバックエンドURLに書き換えます。

```json
{
  "backend": {
    "url": "https://<バックエンドのURL>"
  }
}
```

## 5. Chromeで開く

配置先のURLをデスクトップ版Chromeで開き、ルームを作成すればセッションを開始できます。

参加者を招くときは、接続パネルの**招待リンク**をコピーして渡すのが簡単です。
リンクを開くだけでその部屋に入室でき、ロールもリンク側で指定できます
（[ロール — 招待リンクで参加者を招く](/manual/roles#招待リンクで参加者を招く)参照）。

---

うまく動かないときは[設置するときの質問](/guide/faq)を確認してください。
