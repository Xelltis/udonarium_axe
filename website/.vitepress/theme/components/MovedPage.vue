<script setup lang="ts">
import { onMounted } from 'vue';
import { withBase } from 'vitepress';

/**
 * Stands where a page used to be and sends the reader on to where it lives now, keeping the
 * heading they were linked to. Links from outside the site still point at the old addresses.
 */
const props = defineProps<{ to: string; title: string }>();

onMounted(() => {
  window.location.replace(withBase(props.to) + window.location.hash);
});
</script>

<template>
  <p>
    このページは移動しました。自動で移らないときは、<a :href="withBase(props.to)">{{ props.title }}</a
    >を開いてください。
  </p>
</template>
