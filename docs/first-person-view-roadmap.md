# 一人称視点は一通り動く。残りは描き足しと実機確認

卓を一人称の視界へ置き換える表示モードは、4 種類の格子すべてで歩けて、暗闇も卓の視界規則をそのまま引き継ぐところまで来ている。作り直しが要る場所は今のところ見当たらない。残るのは描いていないものの描き足しと、実機での一巡。

この文書は `feat/first-person-view`（2026-09-11〜12）の途中経過をまとめたもので、次に手を付ける人へ「どこまで動くか」「何が決まっているか」「何が残っているか」を渡すために書いた。

## どこまで動くか

WebGL は使わず CSS 3D で組んである。正方・平頂ヘクス・尖頂ヘクス・グリッドなしの 4 格子が同じ操作で動き、格子ごとの違いは
[src/app/domain/tabletop/first-person/](../src/app/domain/tabletop/first-person/) の lattice・world・clip・scene・wall・target・free-step・minimap-view が吸収する。

操作は歩行（W/S/A/D、ヘクスでは Z/C も）、旋回（Q/E）、扉（Space）、松明（F）、ターゲット（T と Shift+T）、エフェクトの発動（Enter、取り消しは Esc）。1 歩進むたびに部屋の移動ルールと罠を見る。

見え方は席ごとに持ち、localStorage へ書く。GM は自分の視界を共有でき、配った先は `GameTable.sharedViewPiece` が指す。共有中に歩けるのは、そのコマの所有者と GM だけ。

入口は 4 つ。コマの右クリック、PL ツールバーのボタン、ホットバーのスロット種別 `firstPerson`、GM ツールバーの共有メニュー。共有中のコマには卓上で琥珀色の輪が付く。

描いているものは地形の壁・床・天井・扉、ほかのコマ（HP ゲージ、バフバッジ、ターゲット輪、順番）、光源と灯り、カード・山札・ダイス・コイン・メモ・マスク・発見済みの罠・ホワイトボード・環境の床、壁に掛かった物、天候、揺れと閃光。エフェクトは
[src/app/features/effect/table-effect-overlay/](../src/app/features/effect/table-effect-overlay/) を eye 入力で流用している。

暗闇は卓の規則そのまま。記憶済みで今は見えないマスは、霧と同じ濃さ（[first-person-style.ts](../src/app/features/first-person/first-person-style.ts) の `FOG_VEIL_ALPHA`）で薄く残す。GM には全部見える（GM に何も見えなくなる不具合は直してある）。

隣のマスに立つコマは、画面高の 0.7 で頭打ちにする。投影は `projectedHeight = h·P/d`（P は画面幅の半分）、文字は 28px を上限にした。

HUD は、操作クラスターを左下に置いてホットバーを避け、モバイルシェルでは左端へ寄せる。方位盤とミニマップは右下で、スマホでは右上に小さく出す。

検証は lint・tsc・`npx vitest run`（11124 件）・`npm test`・build、それと正方とヘクスの基準画像による視覚回帰まで通してある。

## 何が決まっているか（2026-09-12）

| 論点               | 決定                                                  |
| ------------------ | ----------------------------------------------------- |
| 入口               | PL ツールとホットバー                                 |
| 暗闇               | 卓の規則に従い、光源を使えるようにする                |
| 共有ビューの操作権 | 所有者と GM                                           |
| 戦闘情報           | 卓と同じ                                              |
| GM 側              | ツールバーで選び、卓上に印を出す                      |
| ホットバーの衝突   | パッドを左下へ                                        |
| 足音               | 音源が揃うまで、既存の `piecePut` / `blockPut` を流用 |
| スマホ             | 方位盤とミニマップを小さくして残す                    |
| 近接コマ           | はみ出さないよう上限を掛ける                          |

## 何が残っているか

### 次に手を付ける小さいもの

いちばん目に付くのは「+n」チップで、`feature.character.buff.count`（「バフ n 個」）を流用しているため「あと n 個」と読めない。専用のキー `feature.character.buff.more` を足す。

近接コマの上限は高さにしか効いていないので、横に長いコマ（size 4 以上）には幅の上限も要る。卓側のバッジ格子も、
[game-character.component.html](../src/app/features/character/game-character/game-character.component.html) が `grid-cols-5` をクラスに直書きしていて、共有定数
[BUFF_BADGES_PER_ROW](../src/app/domain/character/buff-badge.ts) は TS 側しか読んでいない。

ターゲットの順番バッジ（[effect-target-overlay](../src/app/features/effect/effect-target-overlay/)）は卓のカメラを基準にするので、一人称では向きが狂う。ビルボード側の琥珀色の番号で用が足りているため、これは保留にしてある。

### まだ描いていないもの

- 範囲エリア（[range-render\*.ts](../src/app/features/tabletop/range/) のキャンバス描画を床へ流用する）
- 暗闇と霧の濃淡そのもの（今は見える・薄い・見えないの 3 段階しかない）
- 光の帯（[table-beam-overlay](../src/app/features/tabletop/table-beam-overlay/)）、背景のドリフト層、霧の空気層

### 体験として足りないもの

足音と衝突音は、流用をやめて専用の素材を用意したい。隣のマスのコマは足元が画面下で切れるが、これは足元を固定した代償なので、上へ寄せるかどうかは判断が要る。共有ビューで複数人が同時に歩いたときのロックは無く、後勝ちになる。

### 確認待ち

実機で一巡する。2 ピアでの共有ビュー、Safari、実際のダンジョン。そのうえで PR を出し、マージ後にマニュアル（`website/manual`）を main へ足す。

別件として、[game-table.component.html](../src/app/features/tabletop/game-table/game-table.component.html) で `peer-cursor` が 2 回描かれているように見える箇所がある。

## 後で触る人への注意

同期オブジェクト（table や piece）を返す computed は、`equal: () => false` を付けないと下流が更新されない。

vitest は型を見ない。シンボルを動かしたり signature を変えたりしたときは、`npm run build` と builder 経路の `npm test` で確かめる。

lefthook は、部分ステージの未ステージ分を隠す。ファイル単位でステージする。

`features/first-person` は effect / tabletop / visual-novel に依存してよい（[eslint.config.ts](../eslint.config.ts) の `FEATURE_DEPENDENCIES`）。

壁は格子の境界にあるので、壁に掛かった物の視界判定は、1/4 マスだけ部屋側に寄せた点で行う。
