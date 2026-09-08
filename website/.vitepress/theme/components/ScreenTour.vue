<script setup lang="ts">
import { withBase } from 'vitepress';

/**
 * Numbered callouts pinned onto the startup screenshot. Coordinates are
 * percentages of the image, so they survive any rescaling; re-check them if
 * `startup.webp` is captured with a different layout.
 */
const spots = [
  { x: 2.8, y: 3.9, name: 'FAB メニュー', body: '各種パネルを開くメインメニュー。', link: '/manual/#fab-メニュー' },
  {
    x: 33.8,
    y: 3.4,
    name: 'ツールバー',
    body: 'ロールに応じて GM / PL のツールが並びます。',
    link: '/manual/pl-tools',
  },
  {
    x: 87,
    y: 7.2,
    name: 'ミニプレイヤー',
    body: 'BGM の再生状況。ツールバーから表示を切り替えます。',
    link: '/manual/jukebox',
  },
  { x: 16, y: 21, name: '接続パネル', body: 'ニックネーム・アイコン・ロール・ロビー。', link: '/manual/roles' },
  { x: 78, y: 30, name: 'テーブル', body: 'ドラッグで視点移動、ホイールでズーム。', link: '/manual/tabletop' },
  { x: 63.5, y: 68.5, name: 'コマ', body: '右クリックで詳細・バフ・公開範囲などの操作。', link: '/manual/objects' },
  { x: 21, y: 56, name: 'チャットウィンドウ', body: '発言・ダイス・各種設定への入口。', link: '/manual/chat' },
];

const src = withBase('/images/screenshots/startup.webp');
</script>

<template>
  <div class="tour">
    <div class="tour__stage">
      <img
        :src="src"
        alt="ルームを開いた直後の画面。左に接続パネルとチャットウィンドウ、中央から右にテーブルが表示されている"
      />
      <span
        v-for="(spot, index) in spots"
        :key="spot.name"
        class="tour__pin"
        :style="{ left: `${spot.x}%`, top: `${spot.y}%` }"
        aria-hidden="true"
        >{{ index + 1 }}</span
      >
    </div>
    <ol class="tour__legend">
      <li v-for="spot in spots" :key="spot.name">
        <a :href="withBase(spot.link)">{{ spot.name }}</a>
        <span>{{ spot.body }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.tour {
  margin: 24px 0;
}

.tour__stage {
  position: relative;
  line-height: 0;
}

.tour__stage img {
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.06),
    0 8px 24px rgb(0 0 0 / 0.08);
}

.tour__pin {
  position: absolute;
  display: flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  box-shadow:
    0 0 0 3px var(--vp-c-bg),
    0 2px 8px rgb(0 0 0 / 0.35);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  transform: translate(-50%, -50%);
}

.tour__legend {
  display: grid;
  padding: 0;
  margin: 18px 0 0;
  gap: 8px 24px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  list-style: none;
  counter-reset: tour;
}

.tour__legend li {
  padding-left: 34px;
  margin: 0;
  counter-increment: tour;
  font-size: 14px;
  line-height: 1.7;
  position: relative;
}

.tour__legend li::before {
  content: counter(tour);
  position: absolute;
  top: 3px;
  left: 0;
  display: flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 700;
}

.tour__legend a {
  font-weight: 600;
}

.tour__legend span {
  display: block;
  color: var(--vp-c-text-2);
}

@media (max-width: 640px) {
  .tour__pin {
    width: 20px;
    height: 20px;
    font-size: 11px;
  }
}
</style>
