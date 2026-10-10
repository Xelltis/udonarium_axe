<script setup lang="ts">
const steps = [
  { title: 'SkyWayでアプリを作成', body: 'App IDとSecretを控える', note: '無料枠あり' },
  {
    title: 'バックエンドをデプロイ',
    body: 'App ID / Secret / 許可オリジンを環境変数に',
    note: 'Workers・Vercel・PHPなど',
  },
  { title: 'フロントエンドを配置', body: 'リリースzipを静的ホスティングに置く', note: 'ビルド不要' },
  { title: '接続先を設定', body: 'assets/config.jsonのbackend.urlを書き換える', note: '1行だけ' },
];
</script>

<template>
  <ol class="steps">
    <li v-for="(step, index) in steps" :key="step.title">
      <div class="steps__head">
        <span class="steps__no">{{ index + 1 }}</span>
        <span v-if="index < steps.length - 1" class="steps__rule" aria-hidden="true"></span>
      </div>
      <strong>{{ step.title }}</strong>
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

.steps strong {
  font-size: 15px;
  line-height: 1.5;
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
