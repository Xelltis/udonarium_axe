# 保存と素材

部屋の保存データ（zip）の形と読み書きの順、古いデータとの互換の守り方、画像・音声・3Dモデルの持ち方と配り方を書く。
`alias`・`@SyncVar`のキー・既定値・識別子の決まりは[同期する物を足すとき](sync-and-network.md#同期する物を足すとき)にあり、ここでは保存に固有のことだけを扱う。
画像と音声の削除・持ち主・タグの鍵と自動保存の機能としての決まりは[画像・ストレージ](../features/storage.md)に、モデルの機能は[3Dモデル](../features/models.md)にある。

## 保存データの形

### zipの中身

部屋の保存は`SaveDataService`（`application/file/save-data.service`）がファイルを並べ、`FileArchiver`（`core/storage/file-archiver`）がzipに詰める。

| ファイル                                       | 中身                           | 書く物                                                 |
| ---------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `data.xml`                                     | 卓とその上の物（`<room>`）     | `Room`（`domain/peer/room`）                           |
| `chat.xml`                                     | チャットのタブと発言           | `ChatTabList`                                          |
| `config.xml`・`summary.xml`・`ailment.xml`     | 部屋の設定と状態異常の一覧     | `Config`・`DataSummarySetting`・`StatusAilmentCatalog` |
| `<SHA-256>.<拡張子>`                           | 部屋が指す画像のバイト         | `createImageArchiveFile`                               |
| `<名前>.glb`                                   | 部屋が指す3Dモデル             | `modelArchiveFiles`                                    |
| `imagetag.xml`・`audiotag.xml`・`modeltag.xml` | タグ                           | `ImageTagList`・`AudioTagList`・`ModelTagList`         |
| `imagelink.xml`                                | 同梱の画像へのリンク           | `ImageLinkList`                                        |
| `playlist.xml`                                 | ジュークボックスのプレイリスト | `PlaylistList`                                         |
| `assetowner.xml`・`imagelock.xml`              | 素材を加えた人、鍵をかけたタグ | `AssetOwnerList`・`ImageTagLockList`                   |

入れる物は保存の種類で変わる。

| 保存                                                                | 入れる物                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 部屋の保存（`saveRoomAsync`）と自動保存（`createRoomArchiveAsync`） | 上の表の全部。画像とモデルは部屋が指す物だけで、音声はバイトを入れない |
| 開始時の部屋（`createWholeRoomArchiveAsync`）                       | 上に加えて、手元にバイトのある画像・音声・モデルの全部                 |
| 1つの物の保存（`saveGameObjectAsync`）                              | `data.xml`とその物が指す画像、`imagetag.xml`・`imagelink.xml`          |
| リプレイの素材（`buildAssetFiles`）                                 | 画像と音声、`imagetag.xml`・`audiotag.xml`                             |

`assetowner.xml`と`imagelock.xml`を部屋の保存にだけ入れるのは、1つの物の保存が別の部屋へ持ち込まれ、その部屋の持ち主と鍵を上書きするためである。

部屋が指す画像は部屋とチャットのXMLを歩いて拾う（`searchImageFiles`）。
拾うのは`type="image"`の要素の中身、名前が`/ImageIdentifier$|^imageIdentifier$/`に合う属性、`attachmentImageIdentifiers`、`stamp`・`stamps`が指すスタンプの画像である。
属性の名前で決めるので、画像の欄を足すときは名前を`…ImageIdentifier`にすれば保存に入る。
1つの文字列に画像を詰めた物はXMLを歩いても見つからないので、`carriedImageIdentifiers`（`domain/media/carried-images`）で自分から名乗る（`WhiteBoard`・`Config`）。
モデルは`modelIdentifier="…"`が指す物を入れ、同梱のコマのモデルは入れない。

### zipの作り方と読み方

読み込む上限は、画像2MB（`MAX_LOADED_IMAGE_BYTES`）、音声10MB（`MAX_LOADED_AUDIO_BYTES`）、モデル10MBと描く三角形20万（`MAX_LOADED_MODEL_BYTES`・`MAX_MODEL_TRIANGLES`）。
超えたファイルはzipの中の物も含めて、読み込みの終わりに`emitFilesTooLarge`で1回知らせる。

zipはfflateで、workerの`core/storage/zip-archive.worker`が詰めて開き、workerが使えなければメインスレッドで扱う。
画像・音声・動画・`.glb`・zipのような圧縮済みのファイルは格納だけにし、ほかは圧縮レベル6にする（`core/storage/zip-compression`）。
リリースをまたいで開いたタブがfflateを読めないときは`ZipCodeUnavailableError`になり、再読み込みを促す。

`FileArchiver.load`は1つのファイルを画像・音声・モデル・XML・zipの順に試す。
画像は`convertBlobToWebP`でWebP（書けないブラウザではPNG）に変え、小さくなったときだけ変えた方を持つ。GIF・APNG・WebP・SVGは変えない。
ただし`<64桁の16進>.<拡張子>`の名前の画像は、名前のハッシュを識別子にしてバイトを変えないので、読み込んだ部屋のコマがそのまま画像を見つける。
zipの中のほかの名前の画像は先に取り込み、変換で識別子が元のバイトのハッシュと変われば控えて、XMLの中のその識別子を置き換えてから読む（`withImagesRenamed`）。
`__data.json`を持つzipはほかのツールの部屋として取り込みへ回す。

XMLをどのクラスで読むかは、ファイル名ではなく根の要素のタグで決まる（`ObjectFactory.create`）。
`handleText`は名前の一覧（`config.xml`・`imagetag.xml`など）にあるXMLを、部屋を読む前の確認で断られたときは読まない。保存するファイルを足したら、この一覧にも足す。

### XMLへの変換

`ObjectSerializer`（`core/sync/object-serializer`）の`toXml`はタグ名を`alias`にし、属性を`toAttributes`か`syncData`から、中身を`innerXml`から書く。識別子と版、`null`と`undefined`の欄は書かない。
入れ子の物と配列は`location.x`のような点つきの名前になる。読み戻せるが、コードのコメントは頼らないよう書いている。

`parseXml`は新しい識別子で物を作り、属性を読んでからストアに入れ、そのあと`parseInnerXml`で中身を読む。
既定値が文字列でない欄はJSONとして読み、空の属性のように読めなければ既定値のまま残す。文字列の欄は字のまま入る。

`Room`・`AudioTagList`・`ImageLinkList`のようなファイル1つの入れ物は、`onStoreAdded`で自分をストアから外すので、部屋と同期しない。
読んだXMLは`xmlLoaded$`で`TabletopService`に届き、卓の物なら落とした所に置く。
`Room.parseInnerXml`は今の部屋の物を消してから読み、保存にエフェクト・カットイン・リアクションが無ければ今の物を残す。

### 読み込む前の確認

coreはdomainを知らないので、`FileArchiver`は確認の相手を構造的な`LoadGuard`として、ストアの`ReloadCheck`（`domain/peer/reload-check`）から引く。
確認は`FileArchiver.load`が読み込みのたびに始め直し、読み込みが終わったら空に戻す（`reset`）。入口は自分で確認を始めず、どう同意を得た読み込みかだけを`check`で言う。`ask`はふつうの読み込み、`agreed`はAIやスナップショットの戻しで先に同意を得た読み込み（どちらの確認も出さない）、`quiet`は開始時の部屋で、聞かない。こうしてあるので、前の読み込みの答えをほかの読み込みが引き継ぐことはない。部屋を上書きしてよいかは、部屋にいれば1回だけ聞き、部屋の外では聞かない。伏せた形のままの保存かどうかは、部屋の内外を問わず聞く。
zipでは画像を取り込む前に、`data.xml`の頭4096バイトから`<room>`を探して聞く（`roomLoadAgreed`）。断った読み込みの画像が部屋のサーバーへ上がらないように、この順にしてある。
`withheld="true"`は部屋のサーバーでGMでない席の保存などに付く（`isRoomWithheld`）。ファイルを落とせるのは卓を変えられる席だけである（`mayLoadDrops`）。

### 自動保存と開始時の部屋

自動保存は部屋の保存と同じzipを`IndexedDbRoomSnapshotStore`に書き、間隔は`features/room-archive/room-snapshot-schedule`にある。
開始時の部屋は`createWholeRoomArchiveAsync`のzipを`StartRoomStore`に1つだけ持ち、`StartRoomService.prepare()`が起動時に1500ミリ秒まで待って確かめる。
どちらも落としたzipと同じく`FileArchiver.load`で読み戻す。

## 互換を守る決まり

保存データと同期する物は版の違うAxeの間を行き来する。経路ごとに今のコードは次のように動く。

| 経路                          | 起きること                                                     | 守り方                                                           |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| 古い保存データを今のAxeで読む | 無い属性と、数や真偽の欄で読めない属性は既定値のまま           | 既定値を「その欄が無い」と同じ意味にする                         |
| 今の保存データを古いAxeで読む | 知らないタグは`ObjectFactory.create`が`null`を返し、読み飛ばす | 新しい物は新しい`alias`にし、今ある値の意味を変えない            |
| 古い席から物が届く            | `syncData`が丸ごと置き換わり、無い欄は`undefined`になる        | [同期する物を足すとき](sync-and-network.md#同期する物を足すとき) |
| 版の混ざった卓で古い席が書く  | 古い席は知っている欄だけを読んで書き換える                     | 古い席が読む欄も一緒に書く                                       |

保存して読み戻す往復と「…より前に保存した部屋」を読む場合は、`testing/save-load-roundtrip.spec.ts`で固定している。
本家のUdonariumの保存データを読むspecやフィクスチャは無い。
属性名は保存データの一部なので、`@SyncVar('followingCharctorIdentifier')`・`@SyncVar('imageCharactorName')`のように綴りの違うキーも残す。

`DataElement`の属性には、無いことに意味があるものがある。
バフの区分の`cs-buff-kind`は、無い・空文字・知らない値を「印なし」と読み、部屋の状態異常の一覧で区分を決める。
項目の既定値の`cs-default`・`cs-default-max`・`cs-default-max-correction`・`cs-default-min-correction`は、無い・空文字・空白・数として読めない値を「既定値なし」と読み、0とは読まない。0を既定値にするときは`"0"`を書く（`domain/character/default-value`の`readDefault`）。
新しい部屋のコマと見本の部屋のコマには、この5つを書かない。これらの属性ができる前の保存は、区分を一覧だけで決め、リセットで値を1つも変えない。
属性を知らない版のAxeは、`ObjectNode`の属性としてそのまま持ち、保存にも書き出す。新しい物も新しいSyncVarも足していないので、部屋のサーバーの封筒の形は変わらない。

今のコードにある読み替えは次のとおり。

| 古い形                        | 今の読み方                                                                                       | 場所                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `table-scratch-mask`          | 卓を変えられる席が`GameTableMask`に替える。識別子は`table-mask-from_<元の識別子>`                | `application/tabletop/legacy-scratch-mask-migration.service` |
| 範囲の`DIAMOND`               | `RHOMBUS`。ダイヤが戻る前のAxeは`DIAMOND`を45°回した正方形と読んで書き戻すので、名前を分けた     | `domain/tabletop/range`                                      |
| 地形の`slopeDirection`        | `slopeSideNames`が空なら1つの側として読む。書くときは古い席のために`slopeDirection`も書く        | `domain/tabletop/terrain-slope`                              |
| マップエディターの`moveBlock` | `moveCost`の通れない地面                                                                         | `domain/tabletop/function-paint`                             |
| 卓の表示の欄                  | 部屋が答える前の保存のために卓に残す。`radialMenuEnabled`は`tabletopMenuStyle`が無いときだけ読む | `domain/tabletop/game-table`                                 |
| 古いキャラクターシート        | 読んだあと階層を整え、古いチェック表を変える。足りない要素は`addExtendData`が足す                | `domain/character/game-character`                            |
| `Blob`のままのIndexedDBの記録 | `blobFromStored`がバイトの記録と同じく読む                                                       | `core/storage/stored-bytes`                                  |

## 素材の保存と共有

### 識別子

画像・音声・モデルはバイトのSHA-256（64桁の16進）を識別子にする。
画像と音声はURLでも持て、そのときはURLが識別子になる（`ImageState.URL`・`AudioState.URL`）。モデルはURLで持たない。
識別子で取り寄せたバイトは、変換し直すとハッシュが変わるので、そのまま持つ（`ImageFile.contextFromBytesAsync`）。
XMLを読んだとき、画像の欄の値が手元に無く画像の拡張子で終わるなら、URLの画像として足す（`convertUrlImage`、`core/storage/image-sharing-system`）。
部屋の画像・音声・モデルの置き場（`ImageStorage`など）は各席のメモリにあり、ページを開くたびに空から始まる。

### ピアの間の交換

| 種類   | カタログ                 | 頼む                    | 届く                   | 部品                                 |
| ------ | ------------------------ | ----------------------- | ---------------------- | ------------------------------------ |
| 画像   | `SYNCHRONIZE_FILE_LIST`  | `REQUEST_FILE_RESOURE`  | `UPDATE_FILE_RESOURE`  | `ImageStorage`・`ImageSharingSystem` |
| 音声   | `SYNCHRONIZE_AUDIO_LIST` | `REQUEST_AUDIO_RESOURE` | `UPDATE_AUDIO_RESOURE` | `AudioStorage`・`AudioSharingSystem` |
| モデル | `SYNCHRONIZE_MODEL_LIST` | `REQUEST_MODEL_RESOURE` | `UPDATE_MODEL_RESOURE` | `ModelStorage`・`ModelSharingSystem` |

席がつながると、相手にカタログを送る。載せるのは全部そろった物とURLの物で、部屋のサーバーへ上げている途中の物と運営者が禁じた物は載せない。
受けた側は知らない物の空の入れ物を作り、部屋のサーバーの置き場があればまずそこから取り、取れなければ送り主に頼む。
ピアの間で頼み始める時機と転送の時間切れは[素材を頼む時機](sync-and-network.md#素材を頼む時機)にある。
1つの席が同時に送るのは2つ、受けるのは4つまでで、バイトは64KBずつ`FILE_SEND_CHUNK_<識別子>`で送る（`BufferSharingTask`）。
画像は128pxのサムネイルを先に送り、1回に0.5MBまで詰める。音声とモデルは1回に1ファイルで、部屋が鳴らしている音声を先に取る（`preferredIdentifiers`）。

### 部屋のサーバーの置き場

`transport`が`"server"`の配備では、`AssetHttpStore`（`core/storage/asset-http-store`）が`backend.url`の`/v1/rooms/<部屋のキー>/assets/<識別子>`に素材を置く。置き場は部屋ごとに分かれ、64桁の16進の識別子の物だけを上げる。
部屋に入るとGMとPLは手元の物をすべて上げる（`uploadAllToAssetStore`）。`HEAD`で確かめ、置き場に無いときだけバイトを送る。見学は上げずにカタログだけを送る。
入ったときに部屋の一覧（`listRoomAssets`）を読み、型で画像・音声・モデルに分けて、足りない物を置き場から取る。
上がるまではカタログに載せないので、ほかの席はピアではなく置き場から取る。取ったバイトのハッシュが識別子と違えば、無かった物として扱う。

| 結果      | サーバーの答え             | その後                                                       |
| --------- | -------------------------- | ------------------------------------------------------------ |
| `stored`  | 201                        | 運営者の止めで待たせていた物を上げ直す                       |
| `exists`  | 置き場にある               | `stored`と同じく上がった物として扱う                         |
| `refused` | 400・403・413・415         | 置き場は受け取らないので、ピアの間で配る                     |
| `full`    | 413（`room-storage-full`） | 部屋の置き場がいっぱい。`refused`と同じくピアの間で配る      |
| `failed`  | そのほか                   | 10秒から倍に延ばして3回試し、尽きたら120秒後に1回試す        |
| `paused`  | 503（`paused`）            | 運営者が上げるのを止めている。ピアに名乗らず、60秒ごとに試す |
| `blocked` | 451                        | 運営者がすべての部屋で禁じた。ピアにも名乗らない             |

### 手元のIndexedDB

| データベース         | 中身                   | 部品                          |
| -------------------- | ---------------------- | ----------------------------- |
| `axe-room-snapshots` | 自動保存のzip          | `IndexedDbRoomSnapshotStore`  |
| `axe-replay-logs`    | 録ったリプレイ         | `indexed-db-replay-log-store` |
| `axe-skin-images`    | スキンの背景の画像     | `SkinImageStore`              |
| `axe-dice-images`    | 席が選んだダイスの画像 | `DiceImageStore`              |
| `axe-start-room`     | 開始時の部屋のzip      | `StartRoomStore`              |

名前は`core/storage/app-database-names`の`APP_DATABASES`にまとめ、ブラウザのデータの消去（`browser-data-wipe`）はデータベースを並べられないブラウザでもこの名前で消す。データベースを足したらここに足す。
値は、WebKitのプライベートウィンドウが`Blob`を保存しないので、バイトと型（`storedBytesOf`）で書く。

### 同梱の素材

サンプルのコマの画像のような同梱の画像は、`assets/`の下へのURLで持つので、保存にバイトが入らない。
`imagelink.xml`（`domain/media/image-link-list`）は、識別子が64桁の16進でなく`assets/`の下を指す画像だけについて、識別子とURLの組を書き、読むときも同じ条件の物だけを足す。
サンプルを置かずに始めたブラウザでも、部屋が指す画像を描けるようにするためである。
同梱のコマのモデルは`keptHome`で交換も保存もせず、地形のモデルはほかのモデルと同じく交換して保存する（[同梱のモデル](../features/models.md#同梱のモデル)）。

## 新しい種類のファイルを足すとき

音声と3Dモデルは、共通の`SharedAssetStorage`と`SharedAssetSharingSystem`（`core/storage/shared-asset-*`）を継ぎ、種類ごとの違いだけを渡す。新しい種類もこれを継ぐ。
画像はサムネイルを先に送るので、別の`ImageStorage`・`ImageSharingSystem`を持ち、この2つを継いでいない。

| 置き場                                                     | すること                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `core/storage/<種類>-file`                                 | `SharedAssetFile`を実装する。識別子はバイトのSHA-256                                          |
| `core/storage/<種類>-storage`                              | `SharedAssetStorage`を継ぎ、カタログのイベント名と`readAsync`、交換しない物の`keptHome`を渡す |
| `core/storage/<種類>-sharing-system`                       | `SharedAssetSharingSystem`を継ぎ、頼む・届く・送り始めのイベント名を渡す                      |
| `composition/class-provider`・`app-initialization.service` | DIへの橋渡しと`initialize()`。`eslint.config.ts`の`PROCESS_SINGLETONS`にも足す                |
| `core/storage/mime-type`・`zip-compression`                | 拡張子と型、圧縮済みとして扱う拡張子                                                          |
| `FileArchiver`                                             | 読み込みの`handle…`と上限の定数、`FileTooLarge`の`kind`                                       |
| `SaveDataService`                                          | zipに入れるファイルとタグの`.xml`。`handleText`の名前の一覧にも足す                           |
| `features/lobby/room-asset-sync.service`                   | 部屋に入ったときに上げる所と、部屋の一覧を型で分ける所                                        |
| `application/lobby/leaving-loss`                           | 上げ終わっていない物があるか（`hasUploadsPending`）                                           |
| `domain/media/asset-removal`                               | 削除の`AssetRemovalKind`と、`features/file/asset-removal-event-handler.service`               |

部屋のサーバーがその型を受け付けなければ、上げると415で`refused`になり、その種類はピアの間だけで配られる。
