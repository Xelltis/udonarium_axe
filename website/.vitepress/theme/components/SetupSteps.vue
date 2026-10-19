<script setup lang="ts">
import { withBase } from 'vitepress';

/**
 * The four steps of putting up Axe, each leading to its page. `here` names the step the page it
 * stands on is, which is marked and not linked; with none given, every step is a link.
 */
const props = defineProps<{ here?: 'choose' | 'server' | 'axe' | 'connect' }>();

const steps = [
  {
    key: 'choose',
    title: '方式を選ぶ',
    body: 'SkyWay版かサーバー版かを決める',
    note: 'あとから変えられる',
    link: '/guide/choose',
  },
  {
    key: 'server',
    title: 'サーバーを置く',
    body: 'トークン発行サーバーか部屋のサーバーを置く',
    note: '30分〜1時間',
    link: '/guide/backend',
  },
  {
    key: 'axe',
    title: 'Axeを置く',
    body: 'リリースのzipを静的ホスティングに置く',
    note: 'ビルド不要',
    link: '/guide/quickstart',
  },
  {
    key: 'connect',
    title: 'つないで確かめる',
    body: 'config.jsonにサーバーのURLを書き、部屋を作る',
    note: '2行だけ',
    link: '/guide/configuration',
  },
];
</script>

<template>
  <ol class="steps">
    <li
      v-for="(step, index) in steps"
      :key="step.key"
      :class="{ 'steps__item--here': props.here === step.key }"
      :aria-current="props.here === step.key ? 'step' : undefined"
    >
      <div class="steps__head">
        <span class="steps__no">{{ index + 1 }}</span>
        <span v-if="index < steps.length - 1" class="steps__rule" aria-hidden="true"></span>
      </div>
      <strong v-if="props.here === step.key">{{ step.title }}（このページ）</strong>
      <a v-else class="steps__link" :href="withBase(step.link)">{{ step.title }}</a>
      <span class="steps__body">{{ step.body }}</span>
      <span class="steps__note">{{ step.note }}</span>
    </li>
  </ol>
</template>

<style scoped>
.steps {
  display: grid;
  padding: 0;
  margin: 28px 0 20px;
  gap: 28px 24px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  list-style: none;
}

.steps li {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.steps__head {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
  gap: 10px;
}

.steps__no {
  display: flex;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

/* the rule bridges the column gap so the four steps read as one route */
.steps__rule {
  height: 2px;
  flex: 1;
  margin-right: -24px;
  background: var(--vp-c-divider);
}

.steps strong,
.steps__link {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
}

.steps__link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.steps__link:hover {
  text-decoration: underline;
}

/* The step the page stands on keeps its number in the brand colour; the others are muted. */
.steps:has(.steps__item--here) li:not(.steps__item--here) .steps__no {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
}

.steps__body {
  margin-top: 6px;
  margin-bottom: 14px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.7;
}

/* pushed to the bottom so every badge lands on the same baseline */
.steps__note {
  padding: 3px 10px;
  border-radius: 999px;
  margin-top: auto;
  align-self: flex-start;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 11.5px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .steps {
    gap: 22px;
  }

  .steps__rule {
    display: none;
  }

  .steps__note {
    margin-top: 10px;
  }
}
</style>
