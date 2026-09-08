---
layout: home
hero:
  name: Udonarium Axe
  text: Adventure. eXperience. Encore.
  tagline: 開けば、もう卓がある。コマもカードもダイスもチャットも、サーバーを通さずブラウザだけで。
  image:
    src: /favicon.svg
    alt: Udonarium Axe のアイコン
  actions:
    - theme: brand
      text: いますぐ遊んでみる
      link: https://axe.xelltis.com
    - theme: alt
      text: はじめてのセッション
      link: /play/first-session
    - theme: alt
      text: 招待リンクをもらった
      link: /play/join
features:
  - icon: 🎲
    title: 開いた瞬間から卓がある
    details: インストールもアカウント登録も要りません。サンプルのコマが並んだ状態で始まり、その場でダイスが振れます。
    link: /play/
    linkText: 遊びはじめる
  - icon: 🎭
    title: 部屋は人を呼ぶときだけ
    details: 部屋を作ると招待リンクが出ます。渡された人はリンクを開くだけで、同じ卓に着きます。
    link: /play/first-session
    linkText: 卓の立てかた
  - icon: 🗺️
    title: 卓に要るものが一通り
    details: 地形・暗闇と視界・カード・立ち絵・カットイン・投票、そして一晩の記録まで。
    link: /guide/features
    linkText: できること
  - icon: 🛠️
    title: 自分の場所も持てる
    details: 続けて遊ぶなら、SkyWay の無料枠と静的ホスティングで一式そろえられます。
    link: /guide/quickstart
    linkText: クイックスタート
---

<HeroShot />

## デモを開けば、その場で触れる

**[デモサイト](https://axe.xelltis.com)** を開けば、キャラクターとモンスターが並んだ卓が出ます。
コマはドラッグで動き、左下のチャットに `2d6` と打てばダイスが振れます。
部屋を作らなくても、ここまでは 1 人でできます。

短いセッションなら、そのまま遊んでかまいません。
ただし前提が 3 つあります。ロビーは他の人と共用です。部屋は参加者が 0 人になると消えます。
動作確認の場所なので、予告なく止まることもあります。
毎週の卓を預けるなら、自分の場所を用意してください（→ [クイックスタート](/guide/quickstart)）。

## 部屋は、人を呼ぶときに作る

部屋を作った人が GM になり、接続パネルに **招待リンク** が出ます。
それを配れば、参加者はロビーを探すことも合言葉を打つこともなく卓に着きます。
リンクにはプレイヤーか見学かの役割まで載せられます。

一晩の流れは [はじめてのセッション](/play/first-session) にまとめました。
リンクを渡された側は [招待リンクをもらったら](/play/join) の 1 ページで足ります。

## ゲームデータはサーバーを通らない

テーブルの上のものは、参加者のブラウザ同士が直接やり取りします（WebRTC による P2P 通信。SkyWay SDK v2 を使っています）。
サーバーがするのは接続の仲介と入室トークンの発行だけで、卓の中身が中央に保存されることはありません。

<NetworkDiagram />

裏を返せば、卓のデータはどこにも預けられていません。
残したい卓は [保存](/manual/save-load) で書き出してください。

## 続けて遊ぶなら、自分で立てられる

用意するのは SkyWay のアプリ（無料枠あり）と、トークンを発行する小さなバックエンドと、置き場所になる静的ホスティング。
この 3 つを、次の 4 段でつなぎます。

<SetupSteps />

理由は [なぜバックエンドが要るのか](/guide/requirements) に、手順は [クイックスタート](/guide/quickstart) にあります。

> 動作確認がもっとも厚いのは **デスクトップ版 Chrome** です。
> スマートフォン・タブレットでも遊べます（[専用のレイアウト](/manual/mobile)に切り替わります）。

## 次に読む

<NextCards />

Axe の成り立ちと、フォークや提案から取り込ませていただいた仕事のクレジットは
[Udonarium Axe とは](/guide/getting-started) にまとめています。
