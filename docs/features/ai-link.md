# AI連携（MCP）

AIに部屋を読ませ、操作させる仕組み。AxeのタブはMCPの接続を待ち受けられないので、手元で動くブリッジ（`tools/axe-mcp`）がMCPを受け、WebSocketでタブへ中継する。
道具の中身はすべてAxe側にあり、ブリッジはダイスやシートの処理を持たない。

## 構成

```
AI（Claude Code・Claude Desktop・自作のエージェント）
   │ MCP（stdio、または127.0.0.1のStreamable HTTP）
ブリッジ（tools/axe-mcp、1ファイルのaxe-mcp.mjs）
   │ WebSocket（ws://127.0.0.1:47610/axe、JSON）
Axeのタブ（つないだ席の権限で実行する）
```

- **定義** — `core/agent`。道具の一覧（`agent-tools`の`AGENT_TOOLS`）、入力の形とその検査（`agent-schema`。JSON Schemaの一部だけを使い、ライブラリに頼らない）、やりとりの型（`agent-protocol`）、AIへの案内（`agent-guide`）。Angularに依存せず、ブリッジもエイリアス`@axe/*`で同じファイルを読む
- **操作の層** — `application/agent`。`AgentToolRunner`が入力の検査→許可の確認→実行→結果の順に道具を走らせ、書く道具の呼び出しを履歴に残す。`AgentViews`が部屋をAI向けの形（マス・シートの木・チャットの行）に写し、`AgentEventLog`が起きたことを溜める。MCPを知らないので、内蔵のAI GMやWebMCPは同じ層に別の出口を足して作る
- **道具の実装** — `features/agent-tools`。読む道具・チャットとダイス・コマとシート・GMの道具の4つのサービスと、それらを初めてのリンクで登録する`AgentToolsSetup`。音やカットインのサービスを呼ぶのでfeaturesに置く（`FEATURE_DEPENDENCIES`は`chat`と`media`）
- **接続とパネル** — `features/ai-link`。`AiLinkService`がブリッジとの接続（`core/agent`の`AgentBridgeClient`）・許可の範囲・通知を持ち、パネルを閉じても接続は続く。パネルは遅延読み込みで、初期バンドルに入らない
- **もう1つの出口** — `axe-mcp.mjs gm`は、MCPの代わりにブリッジ自身がClaude APIを呼んでGMをする（[AI GM](ai-gm.md)）。`hello`の`mode`が`gm`になる
- **案内** — MCPのプロンプト`run_session`と、同じ文のリソース`axe://guide/run-session`（プロンプトを開けないクライアント向け）、チャットの記法のリソース`axe://guide/chat-syntax`
- **ブリッジ** — `tools/axe-mcp`（npm workspaces）。`@modelcontextprotocol/sdk`の低水準の`Server`に定義をそのまま渡し、呼び出しをタブへ中継する。`npm run build:mcp`がesbuildで1ファイルに束ね、同梱したパッケージのLICENSEを末尾に付ける。リリースには`axe-mcp.mjs`として添付し、`dist/`（サイトへ配信する物）には入れない

## つなぐときの取り決め

- ブリッジが`hello`（`protocol`・道具の定義の指紋`tools`・自分の版・`mode`）を送り、タブが`welcome`（同じ2つと席）で答える。`protocol`か`tools`が食い違えば、どちらの側も相手を断る（`refuse`の`protocol`、close 4002）。指紋は`agentToolsDigest()`で、定義を1文字変えても変わるので、版の番号の上げ忘れで食い違う定義のまま道具を走らせることがない。読めない挨拶も断る
- つなげるタブは1つ。2つ目は`refuse`の`busy`（close 4001）。20秒ごとのpingに答えないタブは切る
- 呼び出しは`call`（id・道具・引数）と`result`（idと値、または`code`と`message`）の対。AIが呼び出しを取り消すとブリッジが`cancel`を送り、タブは道具に渡した`AbortSignal`で止める。待つ道具（`wait_for_events`）は頼まれた秒数に10秒を足して、ほかは30秒で諦める
- ブリッジは`127.0.0.1`だけで待ち、`Host`が`127.0.0.1`か`localhost`でない接続と、`Origin`が許可の一覧（`AGENT_TRUSTED_ORIGINS`と`--allow-origin`・`AXE_MCP_ALLOW_ORIGINS`）にないタブを断る。HTTPでMCPを受けるときも同じく確かめ、`AXE_MCP_TOKEN`があればBearerを求める。ポートが使われていれば落ちずに、その理由を道具の答えにする。タブがつながっていないときの呼び出しは、8秒までタブを待ってから断る（［つなぐ］を押したタブは3秒ごとにブリッジを探すので、AIが起動直後に呼んでも間に合う）
- stdioのブリッジは標準入力が閉じたら止まる。SDKの`StdioServerTransport`は入力の終わりを見ないので、AIのアプリが閉じずに終わると、タブを待つWebSocketのサーバーが残ってポートを塞ぐため

## 許可

- パネルで選ぶ範囲（`read`・`write`。localStorageの`axe.ai-link`に番号と一緒に覚える。AI GMに`write`を貸している間は、貸す前の範囲も`lentFrom`に覚える）と席の役割で決める（`refusalOf`）。見学は常に`read`。`access`が`write`の道具は`write`の範囲で見学でない席、`gm`の道具はさらにGMの席でだけ走る。断ったときは`not_allowed`と理由を返し、道具は走らせない
- 読む道具はその席の画面と同じものだけを返す。コマは`VisionService.isTokenVisible`、名前は`PieceNameService.shown`、シートは`DisclosureService.canView`、秘話は`ChatMessage.isShownInChat`で絞り、他人のシークレットダイスは開示まで本文を`null`にする
- ページを開き直したら自動ではつながない。［つなぐ］を押したあとは、ブリッジが見つからなければ3秒ごとに探し続ける（AIをあとから起動しても、起動し直してもつながる）

## 誰がしたか分かる形

- 席がつながった・終えた・範囲を変えた・切れたときは、システム通知の`room`の種類で全員向けの行を出す（`feature.aiLink.notice.*`）
- AIが送った行は`ChatMessage.via`が`ai`になり、全員の画面で名前の横に印（`smart_toy`）が出る。`ChatMessageService.asAiWords`の中で送った行に付く（`asMastersWords`と同じ数え方）。初期値を持たないSyncVarなので、ほかの行と古い版の行は空で読み、保存にも書かれない
- 書く道具の呼び出しは、つないだ席のパネルの履歴（新しい順に100件。その画面だけ）に残る

## 道具

`AGENT_TOOLS`の29個。名前は英語のsnake_case、説明は英語（AIが読む）。マスは`col`・`row`を1から数え、東と南へ増える（`moveGridOf`の格子。まとめマスとヘクスもその格子の列と行）。コマは識別子か、その席に見える名前で指す（2つ以上に当たれば候補のidを並べて断る）。

- **読む** — `get_room`・`list_pieces`・`get_piece`（シートの木とチャットパレット）・`get_turn_order`・`read_chat`・`list_assets`・`read_scenario_text`・`wait_for_events`。シナリオテキストはどのピアにも届き、画面だけがGMに限っているので、`list_assets`のシナリオテキストと`read_scenario_text`もGMの席でだけ答える
- **チャットとダイス** — `send_chat`は入力欄と同じ`ChatSendService.send`を通るので、チャットの特殊記法がそのまま効く。ダイスの式なら`diceRolled$`で行ごとの答えを3秒まで待って一緒に返し、間に合わなければ振り直さないよう添え書きを付ける（遅れた答えは`wait_for_events`に届く）。コマとして話す行はそのコマのシートを参照し、リソースも変えるので、`as`に渡せるのは席がシートを開けるコマだけ。`to`にコマの名前を渡すと、そのコマのオーナーの席への秘話になり、ほかの席がオーナーでないコマは断る。手番のコマンドに本文を続けた行は断る（本文は手番が動いたあとに非同期で送られ、AIの印が付かないため）。`roll_dice`は、ダイスボットが振れない式なら送る前に断る。シークレットは、ダイスボットがすでにシークレットと読む式でなければ頭に`S`を付ける
- **コマとシート** — `move_piece`は`PieceStepService.step`（ドラッグと同じ着地）。`change_resource`は`:HP-5`のような行をそのコマとして送り、値が変わるのを待って前と後を返す（`ResourceEditProcessor`の記録と秘匿にそのまま乗る）。シートの値を読み書きする道具（`change_resource`・`set_sheet_value`）は、その席がシートを開けるコマ（`AgentViews.sheetOpen`）にだけ効き、`add_buff`・`remove_buff`は、バフを隠したコマにはGMの席でだけ効く。`advance_turn`の`next_round`は`TurnOrderService.advanceRound({ ask: false })`で、未行動のコマがいても確認を出さずに進める（画面の前に人がいないため）
- **GMの道具** — `fire_effect`はエフェクトの対象数の上限（`targetLimit`）までのコマに撃ち、残りを`not_hit`で返す。マス撃ちは`EffectCastService.fireAt`（コマのいない的）。`switch_table`はGMの切り替えと同じく卓のBGMとカットインも出す。`place_range`の`facing`は北から時計回りの角度で、射程の`rotate`は`facing - 90`（`rotate`の0は東向き）

## 起きたこと

`AgentEventLog`はリンクを始めた時点から500件まで溜め、`wait_for_events`は前回の`cursor`より後を返す（何もなければ頼まれた秒数まで待つ）。`cursor`は記録を始めたときの印と番号の組（`印.番号`）で、ページを開き直す前の`cursor`は、今の記録の初めからとして読む。

- チャットの行（`messageAdded$`。その席が読める行だけ）
- 手番とラウンド（`TurnOrderService.progress`の変化。その席から見えないコマの手番は、コマを伏せて伝える）、見ている卓の切り替え
- コマの出入りと移動。コマの変化から600ミリ秒止まってから1回だけ、止まったマスで伝える（ドラッグの途中を流さない）
- 席の出入り

## テスト

- 定義・やりとり・タブの側の接続は`core/agent`の単体テスト、操作の層と道具は`application/agent`・`features/agent-tools`の単体テスト
- ブリッジは`npm run test:mcp`（`tools/axe-mcp/vitest.config.mts`。Nodeで本物のWebSocketとSDKのクライアントを使う）。CIは`Test (MCP bridge)`のジョブで型検査・テスト・ビルドを回す
