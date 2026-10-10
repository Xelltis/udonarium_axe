#!/usr/bin/env node
// `src/assets/config.json.example`を`dist/assets/config.json`として配置する。
// 配布物がそのまま動くことと、エンドユーザーが設置先で書き換えられることを両立するための、デフォルトconfigの生成。
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'src/assets/config.json.example');
const dst = resolve(root, 'dist/assets/config.json');

if (!existsSync(src)) {
  console.error(`[copy-default-config] source not found: ${src}`);
  process.exit(1);
}

mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`[copy-default-config] ${src} -> ${dst}`);
