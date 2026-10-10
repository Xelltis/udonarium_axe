<script setup lang="ts">
type Sight = 'yes' | 'no';

const audiences = ['GM', 'オーナー', '選ばれたPL', 'ほかのPL', '見学'];

const scopes: { name: string; hint: string; sight: Sight[] }[] = [
  { name: '全員', hint: '既定。誰でも中身を見られる', sight: ['yes', 'yes', 'yes', 'yes', 'yes'] },
  { name: '特定PL', hint: 'ハンドアウト向け', sight: ['yes', 'yes', 'yes', 'no', 'no'] },
  { name: 'GMのみ', hint: 'GMが作ったものの初期値', sight: ['yes', 'yes', 'no', 'no', 'no'] },
];
</script>

<template>
  <div class="scope">
    <table>
      <thead>
        <tr>
          <th scope="col">公開範囲</th>
          <th v-for="who in audiences" :key="who" scope="col">{{ who }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in scopes" :key="row.name">
          <th scope="row">
            <strong>{{ row.name }}</strong>
            <span>{{ row.hint }}</span>
          </th>
          <td v-for="(state, index) in row.sight" :key="audiences[index]" :class="`scope--${state}`">
            <span aria-hidden="true">{{ state === 'yes' ? '●' : '—' }}</span>
            <span class="sr">{{ state === 'yes' ? '中身が見える' : '中身は見えない' }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="scope__note">
      公開範囲の外からもコマの存在と位置は見えます。見えなくなるのは詳細・チャットパレット・バフなどの中身です。
    </p>
  </div>
</template>

<style scoped>
.scope {
  margin: 24px 0;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  display: table;
}

th,
td {
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  text-align: center;
}

thead th {
  background: var(--vp-c-bg-soft);
  font-size: 13px;
  white-space: nowrap;
}

tbody th {
  text-align: left;
  background: var(--vp-c-bg-soft);
}

tbody th strong {
  display: block;
  font-size: 14px;
}

tbody th span {
  display: block;
  margin-top: 2px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 400;
}

.scope--yes {
  color: var(--vp-c-brand-1);
  font-size: 15px;
}

.scope--no {
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  opacity: 0.65;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.scope__note {
  margin: 10px 0 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.7;
}
</style>
