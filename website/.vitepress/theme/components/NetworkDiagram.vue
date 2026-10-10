<template>
  <figure class="net">
    <div class="net__scroll">
      <svg viewBox="0 0 760 440" role="img" aria-labelledby="net-title net-desc">
        <title id="net-title">Udonarium Axeの通信構成</title>
        <desc id="net-desc">
          参加者のブラウザどうしがWebRTCで直接つながり、コマ・チャット・画像をやりとりします。
          SkyWayは接続の仲介、バックエンドは入室トークンの発行だけを担当し、ゲームデータは通りません。
        </desc>

        <!-- everything inside this zone stays between the participants -->
        <rect class="zone" x="14" y="14" width="732" height="270" rx="14" />
        <text class="zone-label" x="34" y="40">ブラウザどうしのP2P（WebRTC）</text>

        <g class="link">
          <line x1="330" y1="122" x2="204" y2="186" />
          <line x1="470" y1="122" x2="596" y2="186" />
          <line x1="238" y1="218" x2="562" y2="218" />
        </g>
        <text class="link-label" x="400" y="166">コマ・チャット・画像・ダイスは</text>
        <text class="link-label" x="400" y="184">ここだけを流れる</text>

        <g class="node">
          <rect x="312" y="58" width="176" height="64" rx="10" />
          <rect x="62" y="186" width="176" height="64" rx="10" />
          <rect x="562" y="186" width="176" height="64" rx="10" />
        </g>
        <g class="node-text">
          <text x="400" y="88">あなた</text>
          <text x="150" y="216">参加者B</text>
          <text x="650" y="216">参加者C</text>
        </g>
        <g class="node-sub">
          <text x="400" y="108">ブラウザ</text>
          <text x="150" y="236">ブラウザ</text>
          <text x="650" y="236">ブラウザ</text>
        </g>

        <!-- what the servers are for -->
        <text class="zone-label muted" x="14" y="316">サーバーが関わるのはここまで</text>
        <g class="aux-link">
          <path d="M 200 284 L 200 344" />
          <path d="M 560 284 L 560 344" />
        </g>
        <text class="aux-label" x="212" y="322">接続の確立</text>
        <text class="aux-label" x="572" y="322">入室トークン</text>

        <g class="aux">
          <rect x="60" y="344" width="280" height="76" rx="10" />
          <rect x="420" y="344" width="280" height="76" rx="10" />
        </g>
        <g class="aux-text">
          <text x="200" y="376">SkyWay</text>
          <text x="560" y="376">トークン発行バックエンド</text>
        </g>
        <g class="node-sub">
          <text x="200" y="398">相手を見つけて繋ぐだけ</text>
          <text x="560" y="398">自分で用意する小さなサーバー</text>
        </g>
      </svg>
    </div>
    <figcaption>ゲームデータは参加者のブラウザ間だけを流れ、中央サーバーには保存されません。</figcaption>
  </figure>
</template>

<style scoped>
.net {
  margin: 24px 0;
}

.net__scroll {
  overflow-x: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

svg {
  display: block;
  width: 100%;
  height: auto;
  /* below this the labels stop being readable, so scroll sideways instead */
  min-width: 620px;
}

.zone {
  fill: var(--vp-c-brand-soft);
  stroke: var(--vp-c-brand-1);
  stroke-dasharray: 5 5;
  stroke-width: 1.5;
}

.zone-label {
  fill: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 700;
}

.zone-label.muted {
  fill: var(--vp-c-text-2);
}

.node rect {
  fill: var(--vp-c-bg);
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
}

.node-text text {
  fill: var(--vp-c-text-1);
  font-size: 16px;
  font-weight: 700;
  text-anchor: middle;
}

.node-sub text {
  fill: var(--vp-c-text-2);
  font-size: 12px;
  text-anchor: middle;
}

.link line {
  stroke: var(--vp-c-brand-1);
  stroke-width: 2.5;
}

.link-label {
  fill: var(--vp-c-text-2);
  font-size: 12.5px;
  text-anchor: middle;
}

.aux rect {
  fill: var(--vp-c-bg);
  stroke: var(--vp-c-divider);
  stroke-width: 1.5;
}

.aux-text text {
  fill: var(--vp-c-text-1);
  font-size: 15px;
  font-weight: 600;
  text-anchor: middle;
}

.aux-link path {
  fill: none;
  stroke: var(--vp-c-text-2);
  stroke-dasharray: 4 5;
  stroke-width: 1.5;
}

.aux-label {
  fill: var(--vp-c-text-2);
  font-size: 12px;
}

figcaption {
  margin-top: 10px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}
</style>
