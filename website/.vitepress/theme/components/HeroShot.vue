<script setup lang="ts">
import { withBase } from 'vitepress';

/** Phones get the phone layout; a shrunk desktop capture would be unreadable there. */
const wide = withBase('/images/screenshots/overview.webp');
const narrow = withBase('/images/screenshots/mobile.webp');
</script>

<template>
  <figure class="heroshot">
    <img
      class="heroshot__wide"
      :src="wide"
      alt="Udonarium Axeの画面。森を俯瞰したテーブルにコマが並び、左にチャットウィンドウが開いている"
      fetchpriority="high"
      decoding="async"
    />
    <img
      class="heroshot__narrow"
      :src="narrow"
      alt="スマートフォンでのUdonarium Axe。上半分がテーブル、下半分がチャット"
      decoding="async"
    />
    <figcaption>コマもチャットもダイスも、この1画面で。スマートフォンでは専用のレイアウトに切り替わります</figcaption>
  </figure>
</template>

<style scoped>
.heroshot {
  margin: 0 0 8px;
}

.heroshot img {
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.06),
    0 12px 32px rgb(0 0 0 / 0.1);
}

/* `display` stays on the two class selectors so neither loses to `.heroshot img` */
.heroshot img.heroshot__wide {
  display: block;
}

.heroshot img.heroshot__narrow {
  display: none;
  max-width: 300px;
  margin-inline: auto;
}

.dark .heroshot img {
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.3),
    0 12px 32px rgb(0 0 0 / 0.4);
}

.heroshot figcaption {
  margin-top: 12px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
}

@media (max-width: 640px) {
  .heroshot img.heroshot__wide {
    display: none;
  }

  .heroshot img.heroshot__narrow {
    display: block;
  }
}
</style>
