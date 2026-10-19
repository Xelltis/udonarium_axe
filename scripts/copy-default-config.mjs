#!/usr/bin/env node
// Places `src/assets/config.json.example` as `dist/assets/config.json`.
// The default config is generated so that the distribution runs as it is, while the end user can still
// rewrite it wherever it is installed.
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
