# キャラクター

## キャラクターシート / コマ

- **シート再設計** — シートと設定をタブで分離。ポートレートギャラリー＋コマ画像セクション、ダークテーマ統合レイアウト
- **構造化シートビルダー** — セクション / カード単位の編集、ドラッグ並べ替え、per-card編集トグル、colspanトグル、セクションアイコン
- **アイコンピッカー** — テキスト入力をアイコン選択ポップアップに置換、コマ選択＋チャットスロットUI
- **ポップアップデータタグ選択** — キャラ単位で表示するデータタグを選択（インベントリタグ付き要素はロック）
- **範囲エリア設定パネル**と高度（altitude）コントロール
- **スキルテーブル** — GAP判定モード、判定候補ロジック
- **端数サイズ対応** — マルチヘクスの頂点スナップ、端数サイズ向けの頂点クラスタ台座

## キャラクターの取り込み

- **取り込みパイプライン** — ココフォリア コマJSON / キャラクター保管所 / キャラクターシート倉庫 / CharaXivからキャラコマを生成（`domain/character/import`、`application/character/character-import.service`、`features/character/import-character`）
- **取得経路** — 保管所は直fetch（`Access-Control-Allow-Origin: *`）、倉庫はJSONP（CORS不可のためscriptタグ注入）。CharaXivはココフォリア形式の貼り付け
- **正規化モデル** — `ImportedCharacter`（statuses / params / system固有sections）へ正規化し、`ImportedCharacterFactory`がdata-elementツリーを構築。保管所CoCは`NA1..NA14`を能力値・SANへ写像、倉庫は`base` / 配列（技能・コンボ・武器）をセクションへ展開

## データ要素（ゲームデータ）

- **`RANGE_SHAPE`フィールド型** — 射程シェイプをサムネイル付きで保持
- **min/maxの分割** — 基準値＋補正に分離し、実効上下限を算出
- **表示項目の既定はサンプル語彙から切り離した** — `DataSummarySetting`の`dataTag` / `tableDataTag` / `sortTag`の既定は**空**。空のあいだは卓のコマから推定する（`application/inventory/summary-items`の`derivedItemNames`：`cs-piece-gauge`付きを先に、次に多くのコマが共有するリソース、上限8件。表は推定結果の後ろに登録済み状態異常を足すが、推定が空なら表も空＝「表示項目が空です」の案内が出る）。サンプル部屋を作ったときだけ`makeSampleSummaryItems()`がHP/MP＋6能力値と`敏捷度`降順を書き込む。既存の部屋は保存値をそのまま尊重し、推定で上書きしない
- **表示項目は引用符でパス参照・空白入りの名前を書ける** — `domain/data/summary-tag-list`の`splitSummaryTags`が引用符付きトークンを1項目として切り出し、**引用を外して下流へ渡す**ので`DataElement.findElementByReference`のパス解決がそのまま効く（`"リソース/正気度"` / `"所持金 合計"`）。裸の`/`は従来どおり改行マーカー。改名追従の発火条件は`tagLeafNames`でパス末尾の名前と照合する（途中のグループを改名するとパスは切れる。名前で参照している以上の制約）
- **リソースの棚卸しは1か所** — 「何がリソースか」「コマの集合で何を名前で操作できるか」は`domain/character/resource-catalog`（`isResourceElement` / `isResourceField` / `resourceElementsOf` / `resourceNamesOf` / `resourceCatalogOf`）。リモコン・PLツールのインライン編集・コマのバーの増減演出・マップエディターの項目名一覧が同じ判定を使い、ICON/POS（シート内部のUI状態）の除外もここだけに書いてある。画面ごとに判定が違っていたのを揃えたもの
- **リソースのスロットは1つの語彙** — 現在値・最大値・上下限のベースと補正値を`domain/data/resource-slot`の`ResourceSlot`に統一。`StatusAccessor`・チャットの`:`記法・バフの`&!`修整・リモコンが同じ語彙を使い、`HP^` / `HP_MAX` / `HP_MAX_BUFF` / `HP_MIN` / `HP_MIN_BUFF`の読み取りも`readNamedResourceSlot`の1か所。知らないスロット名は現在値として読むので、古いピアが書いたバフもそのまま動く
- **チェック表（check-table）型** — 旧Markdownレンダラを置換
- 要素単位の原寸表示オプション（ポップアップ画像）
- 型ピッカーを`ng-select`化
- **消した行・グループ・セクションを元に戻す** — 削除ボタンは確認なしで即座に消し、画面下に「「名前」を削除しました」と「元に戻す」を6秒出す（`DataElementDeletionService`、`SnackbarService`）。消す前にXML・親・直後の兄弟・位置を控える（`domain/data/data-element-restore`）。戻すときは新しい識別子のコピーを同じ場所に読み込む。破棄した識別子は二度と使えないためで、そのあいだに同名の兄弟ができていれば名前をずらす。通知は1度に1つで、この席にしか出ず、新しい通知が出ると前の取り消しはできなくなる。`role="status"`でフォーカスを奪わずに読み上げ、ボトムシートより手前に出る
