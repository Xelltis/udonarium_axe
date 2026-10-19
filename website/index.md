---
layout: home
hero:
  name: Udonarium Axe
  text: ブラウザで遊べるTRPGのセッションツール
  tagline: コマ・カード・ダイス・チャットから、暗闇と視界、セッションの記録まで。インストールもアカウントの登録も要りません。
  image:
    src: /favicon.svg
    alt: Udonarium Axeのアイコン
  actions:
    - theme: brand
      text: はじめに
      link: /start/
    - theme: alt
      text: デモサイトを開く
      link: https://axe.xelltis.com
    - theme: alt
      text: 招待リンクで参加する
      link: /start/join
features:
  - icon: 🎲
    title: インストール不要
    details: ブラウザで開くだけで使えます。サンプルのコマが並んだテーブルで、すぐにダイスを振れます。
    link: /start/
    linkText: はじめに
  - icon: 🎭
    title: 招待リンクで参加
    details: GMが部屋を作ると、招待リンクが出ます。参加者はリンクを開くだけで、同じ部屋に入れます。
    link: /start/join
    linkText: 招待リンクで参加する
  - icon: 🗺️
    title: セッションに要る機能
    details: 地形・暗闇と視界・カード・立ち絵・カットイン・投票・セッションの記録など。
    link: /start/features
    linkText: Axeでできること
  - icon: 🛠️
    title: 自分の環境に設置
    details: 参加者をつなぐサーバーと静的ホスティングを用意すれば、自分のAxeを置けます。
    link: /guide/
    linkText: 設置ガイド
---

<HeroShot />

## まず試す

[デモサイト](https://axe.xelltis.com)を開くと、サンプルのコマが並んだテーブルが出ます。
コマをドラッグで動かし、左下のチャットに`2d6`と打つとダイスが振れます。
試しかたと、デモサイトで遊ぶときの注意は[はじめに](/start/)にあります。

## ほかの人と遊ぶ

GMが部屋を作り、接続パネルに出る招待リンクを参加者に送ります。
参加者は、リンクを開くだけで同じ部屋に入れます。
GMの側の流れは[はじめてのセッション（GM）](/start/first-session)に、参加する側の流れは[招待リンクで参加する](/start/join)にあります。

## ゲームデータの置き場所

SkyWay版では、テーブルの上の物は、参加者のブラウザどうしが直接やりとりします（WebRTCによるP2P通信）。
サーバーは接続の仲介と入室の許可証の発行だけを行い、卓の中身は保存しません。
残したい卓は、各自が[保存](/manual/save-load)で書き出します。

<NetworkDiagram />

[サーバー版（ベータ）](/guide/choose)では、卓は部屋のサーバーが預かり、最後の参加者が抜けてから一定の時間がたつと消えます。

## 自分の環境に置く

Axeを自分の環境に置くには、参加者をつなぐサーバーと、Axe本体を置く静的ホスティングを用意します。
次の4つの手順で置きます（→ [設置ガイド](/guide/)）。

<SetupSteps />

## ページの案内

<NextCards />
