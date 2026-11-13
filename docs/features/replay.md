# セッションログと配信

## セッションログ（リプレイ基盤）

- **記録の始め方** — 開始のしかた（自動 / 手動）と記録の細かさをこのブラウザに覚えさせ、次の卓へ持ち越す。自動なら落ち着いてから8秒で開始し、手動なら時計脇のピルから始める（`application/replay/replay-preference.service`、`features/replay/replay-event-handler.service`）
- **部屋は要らない** — 同期メッセージは接続の有無に関わらず自分へも返るため、ひとりで開いた卓もそのまま記録できる。録画は始めた卓に紐づき、部屋を出入りして卓が変わったところで締めて録り直す（一覧では部屋名なしの記録を「ひとりの卓」として示す）
- **記録の作り方** — `networkMessage$`を購読し、自分と他人の操作を同じ経路で拾う。`UPDATE_GAME_OBJECT`はオブジェクト全体が飛ぶため、シャドウコピーとの差分から「移動」「リソース増減」等の意味を起こす（`domain/replay/replay-diff`、`domain/replay/replay-interpreter`）
- **記録される3層** — 読むための意味づけ済みイベント、巻き戻しと再生のための前後差分パッチ、復元の起点となるキーフレーム（画像・音声を含まないmsgpackのオブジェクト一覧。識別子を保つのでpatchが当たる）
- **初期同期の除外** — 開始時に現在の盤面をシャドウとして取り込み、同期由来の同値更新を差分ゼロで落とす。加えて開始直後5秒は未知オブジェクトを到着した状態として扱う
- **畳み込み** — ドラッグ中の毎フレーム更新を、同一の人・同一のコマ・1.5秒以内で1件にまとめ、始点と終点を残す（`domain/replay/replay-coalescer`）
- **秘匿の保存** — 内緒話・GM限定・非公開コマを当時の可視性ごと記録し、閲覧者のロールで絞り込む
- **保存** — イベントはmsgpackでチャンク化してIndexedDBへ。**既定では古い録画を消さない**（`DEFAULT_REPLAY_RETENTION`は本数・容量とも上限なし）。残す本数は録画ピルで選べ、選ばなければ消えない。開始時に`navigator.storage.persist()`で保持を頼み、空きが減ったときに録画ごと消される既定の扱いから外す（`core/storage/replay-log-store`、`core/storage/persistent-storage`）
- **録画インジケータ** — 時計脇のピル。録画中は経過時間と件数、章の見出し（目印）打ち、停止。待機中は開始と、細かさ / 始め方の設定（`features/replay/replay-indicator`）
- **卓を邪魔しない工夫** — シャドウ複写は素の再帰コピー（`structuredClone`の約4倍速）、表示用シグナルはドラッグ中250msに間引き、10分ごとのキーフレームはidleかつ非ドラッグまで待つ
- **持ち出し** — `.axe-replay.zip`（目録JSON + イベントmsgpack + キーフレーム + 任意で画像）で書き出し / 読み込み（`domain/replay/replay-archive`、`application/replay/replay-library.service`）
- **再生** — 読み物として送るだけなら卓に触れない。盤面再生は直近キーフレームを復元してpatchを前向きに積む（巻き戻しも作り直し）。再生中は`setNetworkIsolated()`で送信を止めて同卓者に漏らさず、抜けるときに元の卓へ戻して再同期を求める（`core/network/network-isolation`、`application/replay/replay-playback.service`）
- **ワークスペース** — 記録一覧・舞台・項目一覧を1枚のパネルに収め、選ぶところから編集して保存するまでを行き来なしで済ませる（`features/replay/replay-workspace`）
- **タイムライン** — 目盛りは経過時間。各時点のできごとの多さを山として描き、通り過ぎた分を色で示す。目印は章のしおりとして並び、押せばその1件へ飛ぶ（`features/replay/replay-timeline`）
- **非破壊編集** — 削除・並べ替え（つまんで移動、または矢印で1つずつ）・台詞の直し・任意のイベントの差し込みを行い、別の記録として保存する。移した項目は移した先の時刻を引き継ぐ。Ctrl+Zで1手ずつ戻せる。派生先には編集後の並びで計算し直したキーフレームを書く（`domain/replay/replay-edit`、`application/replay/replay-editor.service`）
- **捏造の収録** — 手で打つ代わりに、盤面を預かった状態で実際に操作し、その結果をイベントとして任意の位置へ差し込む（`application/replay/replay-staging.service`、`features/replay/replay-staging-banner`）
- **MP4書き出し** — 記録を絵コンテ（1発言 = 1カット、目印は章の扉、VNの場面転換が背景）に起こし、canvasに描いてWebCodecsで符号化する。**720p / 1080p / 1440p / 2160p**、**30 / 60fps**、読める速さ / 当日と同じ間、台詞と章だけ / 盤面の動きも（既定）、を選べる。**長さで打ち切らない**。記録した分は最後まで書き出す。盤面の動きは記録一覧と同じ言い回しで字幕にする。編集中なら編集後の並びが、秘匿は見る人のロールで絞られた結果が画になる（`domain/replay/replay-storyboard`、`domain/replay/replay-frame-layout`、`infrastructure/replay/replay-frame-painter`、`core/media/video-encoder`、`application/replay/replay-video.service`、`features/replay/replay-video-panel`）
- **動画に映る盤面** — カットごとに、その時点の卓をキーフレームからpatchを積んで組み直し、真上から描く。卓の絵・コマの絵と名前・大きさ（マス数）・重なり順を持ち、しまわれているコマは出さない。台詞窓はその下に敷く（`domain/replay/replay-board-view`）
- **動画の構図** — 盤面が画面のほぼ全面を占め、台詞窓はその上に重ねる。卓が広くて空白が多いと小さく見えるので、コマのある範囲に余白2マスを足した所へ寄せて映す。マス目の線と、移動の道筋・行き先の矢印を描く。立ち絵は話し手のコマがある側（左右）へ寄せる
- **コマの滑走** — 移動のカットでは記録したfrom / to（畳んだ移動は途中の道のりも）を経路として、カットの尺いっぱいを使ってeaseで滑らせる。滑り終わりは記録された置き場所にぴったり重なる（`domain/replay/replay-route`を再生と共有）
- **小さすぎるコマ** — 広い卓ではマス目が数ピクセルになるので、コマは見える下限まで底上げして中心を保ったまま描く
- **当日と同じ間** — 実際の間をそのまま尺にする（下限だけは読める速さに丸める）。上を丸めると、名前のとおりの間にならない
- **付随する音** — 効果音は移動や判定に付いて鳴るだけで、それ自体は出来事ではない。だから音としては残すが、動画の字幕にも記録一覧にも既定では出さない（一覧の「付随する音も出す」で編集用に出せる。`isIncidentalReplayEvent`）
- **動画に入る音** — 効果音は鳴った場面の時刻に、BGMは鳴り始めから止まる（または曲が変わる）までを区間として置き、`OfflineAudioContext`で1本に混ぜてAACで多重化する。BGMは区間ぶんループしフェードで出入りする（`domain/replay/replay-soundtrack`、`application/replay/replay-sound-mixer`）
- **読み物書き出し** — 記録をMarkdown（小説 / 台本）で書き出す（`domain/replay/replay-script`）。**動画と同じ絵コンテ**（`buildReplayStoryboard`）を使うので、章の切れ目も地の文の扱いも動画と揃う。動画のために読める長さへ割ったカットは、同じ`seq`を持つものだけ1つの発言へ戻す（話者で繋ぐと、続けて喋った別の発言まで繋がる）。見えるものは書き出す人のロールで決まる（動画と同じ`canViewReplayEvent`）。盤面の動きは既定で入れない。入れると読み物が操作ログになる
- **書き出し先** — `showSaveFilePicker`があれば保存先を先に尋ね、`FileSystemWritableFileStreamTarget`でディスクへ直接流す。長さを決めるのは空き容量だけになる。無い環境でも、見込みが大きければ`StreamTarget`で分割してBlobに積む（索引を先頭に置く`fastStart: 'in-memory'`は全体をメモリに載せるので、長い動画では使わず`'fragmented'`に切り替える）
- **符号化できない環境** — WebCodecsが無ければ`MediaRecorder`へ落とす（`core/media/media-recorder-encoder`）。canvasの絵と混ぜた音をそのまま流し込むので**尺と同じだけ実時間がかかる**（その旨をパネルに出す）。入れ物はMP4 → WebMの順に、そのブラウザが受け取れるものを選ぶ。音はAAC → Opusの順に`AudioEncoder.isConfigSupported()`で試すので、AACが無い環境でも無音にならない
- **動画の暗闇・視界・光源** — キーフレームから`VisionScene`を組み直し、判定は生きている卓と同じ`domain/tabletop/vision-scene`に任せる（`domain/replay/replay-vision-scene`）。見る人のロールで見え方が変わるのも同じで、GMは全部、PLは自分の持ちコマと同行者、見学者は卓に居るPLの視界を借りる。描くのはcanvasに切り抜きが無いので、暗幕を別の面へ描いてから灯りの形で削り、削り終えた面を盤面へ重ねる（`infrastructure/replay/replay-darkness-painter`）。面は長辺2048pxで頭打ちにする（卓の座標のまま作ると6000px四方になる）
- **動画の盤面の向き** — 真上から（既定）と、卓と同じ傾き（`REPLAY_BOARD_TABLE_VIEW`）を選べる。カメラの角度は同期しておらず記録に残らないので、当日の角度ではなく卓の既定の角度で映す。射影は回す → 倒す → 枠に合わせる、の順（`domain/replay/replay-board-camera`）。**遠近は付けない**。手前と奥で縮尺が変わらないぶん、コマの大小が距離ではなく実際の大きさとして読める。地面に貼り付くもの（卓の絵・マス目・移動の跡・暗闇）は卓の座標のまま描いて行列に傾けさせ、コマだけは倒さずに足元で立てる（倒すと板が潰れて何のコマか分からない）
- **書き出しの制約** — 動画のカットイン（YouTube等）は絵として入らない（音だけのカットインと同じく字幕で出る）。画像のカットインは盤面の上に重ねて映す
- **まとめ** — 記録を1枚に数え上げる（`domain/replay/replay-digest`、`features/replay/replay-digest-panel`）。数・今日の称号・ダイスの出方・受けた増減を出し、Markdownでも書き出せる。数えるのは記録に残っているものだけで、足りない欄は「出せません」と表示する。**与えた側は出さない**。記録に残るのは値を変えた人であって攻撃した人ではない（GMが敵のHPを減らせばGMの名前になる）。出目はv1.33.0以降の記録にしかない。見える範囲は読む人のロールに従う
- **記念写真** — 卓に出ていたコマの立ち絵を1枚に並べ、部屋名と日付を焼き込んだPNGを保存する（`application/replay/replay-photo.service`、`domain/replay/replay-cast`）。盤に出ているコマだけを並べ、入りきらなかった人数は、知らせないまま切り捨てずに画面へ出す。絵が手元に無いコマも枠と名前は残す

## 配信オーバーレイ

- **透過画面** — 招待リンクの「配信用（透過画面）」で開くと、盤面もパネルも出さず直近の発言と手番だけを透過の背景に出す（`features/streaming-overlay`、`application/ui/overlay-mode.service`）。OBSのブラウザソースに貼る用途
- **見せる範囲は狭いほうを優先する** — 密談・伏せたダイス・その役割で見えないタブは出さない。入室が終わるまで自分のロールは既定（PL）のままなので、リンクで頼んだロールとの狭いほうを採る（広いほうを採ると入室の途中だけ見えてはいけないタブが映る）
- **古い行は落とす** — 直近の数件だけを組み、10秒ごとの拍で古い行を落とす（`streaming-overlay-feed`）。卓が静かな間も貼り付いたままにしない
