<script setup lang="ts">
import { withBase } from 'vitepress';

const cards = [
  { title: 'はじめに', body: 'Axeとは何か、試しかた、参加のしかた、はじめてのセッション', link: '/start/' },
  { title: '操作マニュアル', body: '機能ごとの操作と設定', link: '/manual/' },
  { title: '困ったとき', body: '症状から、読むところを探す', link: '/help/' },
  { title: '設置ガイド', body: '自分の環境にAxeを置く手順', link: '/guide/' },
];
</script>

<template>
  <div class="next">
    <a v-for="card in cards" :key="card.link" class="next__card" :href="withBase(card.link)">
      <strong>
        {{ card.title }}
        <span class="next__arrow" aria-hidden="true">→</span>
      </strong>
      <span>{{ card.body }}</span>
    </a>
  </div>
</template>

<style scoped>
.next {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  margin: 24px 0 8px;
}

.next__card {
  display: block;
  padding: 18px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  font-weight: 400;
  text-decoration: none;
  transition:
    border-color 0.25s,
    background-color 0.25s,
    transform 0.25s;
}

.next__card:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  transform: translateY(-2px);
}

.next__card strong {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--vp-c-brand-1);
  font-size: 15px;
}

.next__arrow {
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  font-size: 14px;
  transition:
    transform 0.25s,
    color 0.25s;
}

.next__card:hover .next__arrow {
  color: var(--vp-c-brand-1);
  transform: translateX(3px);
}

.next__card span:not(.next__arrow) {
  display: block;
  margin-top: 6px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.65;
}
</style>
