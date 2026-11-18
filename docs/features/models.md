# 3Dモデル

## コマと地形のモデル

- **モデルで描く** — `GameCharacter`と`Terrain`は`modelIdentifier`・`modelScale`・`modelTurn`・`modelIdle`・`modelWalk`（SyncVar、どれも文字列で既定`''`）を持ち、`modelIdentifier`があれば卓では絵や面の代わりにそのモデルで描く。5つは`pieceModelOf`（`domain/tabletop/piece-model`）を通して読む。モデルを知らない古いピアはこの5つを送らないので、空の大きさは足元の箱の1倍、空の向きは0°として読み、0倍とは読まない。大きさは0.1〜10倍（`MIN_MODEL_SCALE` / `MAX_MODEL_SCALE`）
- **動き** — `modelIdle`と`modelWalk`は、立っているときと歩くときに流す動きの名前。空か、モデルにその名前の動きがなければ、名前が`idle` / `stand` / `wait`と`walk` / `run` / `move`に合う動きを使い、立っているときの動きはそれも無ければ最初の動きにする（`chooseMotions`、`infrastructure/table-3d/model-layer`）
- **モデルの実体** — モデルは1つの`.glb`（binary glTF）のバイト列だけで、識別子はそのSHA-256（`ModelFile`、`core/storage/model-file`）。URLでは持たない。描くときの`HeldModelReader`（`infrastructure/three-kit/held-model-reader`）は手元のバイト（`blob:`と`data:`のURL）だけを読み、モデルの中に外のURLが書いてあっても取りに行かない。DracoとKTX2の展開器は、それを要るモデルが来たときだけアプリの同梱物から読む
- **配り方** — `ModelStorage`と`ModelSharingSystem`（`core/storage/model-storage`、`core/storage/model-sharing-system`）が、音と同じ方式でモデルを扱う。全部そろったモデルをピアへのカタログに載せ、頼まれたら送り、部屋のサーバーに資産置き場があればそこへ上げ、GMが部屋から削除したモデルは手放す
- **大きさの上限** — 1つのモデルが描く三角形は20万まで（`MAX_MODEL_TRIANGLES`、`core/storage/gltf-facts`）。1つのファイルで、そのモデルを描く全員の画面を止めないため。ファイルは10MBまで（`MAX_LOADED_MODEL_BYTES`）。読み込むときは`FileArchiver`がJSONだけを読んで三角形を数え、超えたファイルを大きすぎる物として外す。描くときも`HeldModelReader`が同じ数え方で確かめ、超えたモデルは描かない
- **glbのextras** — 地形をモデルで描くとき、`model-layer`はglTFのシーンのextrasの`fit`で置き方を変える。指定がなければ、形を保ったまま地形の箱に収める。`"stretch"`は箱に合わせて縦・横・高さを別々に伸ばす（扉・塔・見張り塔）。`"facade"`は建物の部品一式で、ノードのextrasの`part`（`wall` / `roof` / `cap`）で壁・屋根・パラペットを見分け、1マス幅の部品を箱いっぱいに繰り返す（町の建物）。`"tile"`は1マス四方・高さ1の部品を箱のマスごとに並べて箱の高さに伸ばし（丸太の柵・石垣）、`"height": "made"`を添えると作った高さのまま立てる（作物）。`"joined"`はマスの中心に立つ`hub`（`part`が`hub`のノード）と、中心から東の辺まで伸びる腕の2部品で、[つながる壁](map-generator.md#つながる壁)になる
- **排水口** — モデルのノードがextrasに`{ "spout": [x, y, z] }`を持てば、その点を水が落ちる口として読む（同梱の排水管）。口はモデルを作ったときの南（+z）を向くものとし、位置と向きはモデルの置き方と回転に合わせて卓の座標へ直す。`fit`が`facade`・`tile`・`joined`のモデルでは読まない。落ちる水の描き方は[水域と地面](water-ground.md#水域)にある
- **回る部品** — モデルのノードがextrasに`{ "spin": [x, y, z, 度毎秒], "spinAt": [x, y, z] }`を持てば、そのノードのメッシュは、`spin`の軸の周りを毎秒その角度で回り続ける（同梱の風車の羽根と水車の輪）。`spinAt`は軸の通る点で、省けばノードの原点を通る。どちらもノードを作ったときの座標で書く。角度は描く時刻だけから決め、水と同じ間隔で描き直す（`ModelLayer.advance`が`'slowly'`を返す）。演出を減らす設定では、作ったときの姿勢で止める。回る部品は、モデルの大きさと足元を決める箱に数えない（`standingBoxOf`）ので、本体の外へ張り出してよく、足元より下へ出てもよい。影は落とさない。影は部品が回るたびには描き直さないため。回るのは、まとめて描く地形のモデルだけ。自分の複製を持つモデル（動きを持つモデルと、面を切ったコマのモデル）と、`fit`が`facade`・`tile`・`joined`のモデルでは回らない
- **扉の蝶番** — 扉のモデルの葉のノードがextrasに`{ "hinge": [x, y, z], "swing": 度 }`を持てば、開いた扉の葉はその蝶番を軸に回る（同梱のサルーンの扉）。そういう葉を持たないモデルの扉は、開くとモデル全体が地形の面と同じように動く

## 同梱のモデル

- **コマのモデル** — `BUNDLED_PIECE_MODELS`（`core/storage/bundled-models`）の9体（archer・dragon・goblin・golem・knight・orc・thief・warrior・wizard）は、各席が自分のページの隣（`assets/models/pieces/`）から読む（`BundledModelsService`、`application/tabletop/bundled-models.service`）。ピアと交換せず、部屋のサーバーにも上げず（`ModelStorage`の`keptHome`）、部屋の保存にも入れない。読んだバイトのSHA-256が識別子と違えば取り込まない。読めなかったモデルは30秒（`BUNDLED_MODEL_RETRY_MS`）たってから読み直す。見本の部屋のコマ（魔法使い・ドラゴンなど）がこれで描かれる（`application/tabletop/tabletop-default-setup`）
- **地形のモデル** — 自然・家具と扉・村と砦・町のモデル（`assets/models/nature`・`props`・`settlement`・`town`）は、マップエディターとマップ生成が使うときに部屋のモデルへ読み込む（`BundledModelIntakeService`、`application/tabletop/bundled-model-intake.service`）。読み込んだあとは、ほかのモデルと同じく交換し、保存する。`BUNDLED_MAP_MODELS`は名前ごとに、いま同梱しているファイルのハッシュと、前に同梱していたファイルのハッシュを並べて持つ。前に同梱していたファイルを持つ保存済みの部屋でも、そのモデルを同梱物と見分ける（`isBundledMapModel`）
- **部屋から消せない** — 同梱のモデルは、コマ用も地形用もアプリのもので、部屋から削除できない（`isAppModel`、`application/file/asset-removal.service`）
- **使う所** — マップ生成は、3Dモデルで置く設定のとき木・岩・家具・建物・村と砦の壁をモデルで描き（[マップ生成](map-generator.md#フィールド)）、マップエディターの[3Dオブジェクト塗り](map-editor.md#機能塗りマップエディター)が同梱の`PLACEABLE_MODELS`（`domain/tabletop/placeable-models`）と部屋のモデルを塗ったマスに並べる

## モデル一覧

- **パネル「3Dモデル」** — 部屋のモデルを絵つきで並べ、タグで絞り込み、選んだ1つを回して見せる（`features/media/model-library`。見せる部品は`infrastructure/model-viewer`を遅延で読む）。卓を変えられる席は`.glb`を読み込み（ドロップかクリックで選ぶ。1ファイル10MBまで）、タグを付け、卓で選んでいるコマと地形にモデルを付けられる。固定した地形には付けない
- **卓へのドラッグ** — 一覧のモデルを卓へドラッグすると、落とした先がコマか固定していない地形ならそのモデルで描き、何もない所か固定した地形ならそのモデルのコマを作る（`ModelDropEventHandlerService`）
- **削除** — 部屋から削除できるのは、GMならどのモデルも、PLなら自分が加えたモデル（`AssetRemovalService`）。同梱のモデルは削除できない
- **タグ** — `ModelTag`（`@SyncObject('model-tag')`、`domain/media/model-tag`）が`modelIdentifier`と`tag`を持ち、識別子は`modeltag_<モデルの識別子>`。モデルとは別の同期の種類なので、旧版は知らない種類として読み飛ばす
- **保存** — 部屋の保存は、部屋のXMLが`modelIdentifier`で名指すモデルのうち手元に全部あるものを`.glb`で入れる（`SaveDataService`）。すべてを入れる保存では、手元のモデルを全部入れる。どちらも同梱のコマのモデルは入れない。ファイル名は加えたときの名前で、重なれば番号を付ける。タグは`modeltag.xml`に書き、読み込むと`ModelTag`がそのモデルのタグへ写す
