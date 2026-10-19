#!/usr/bin/env node
// Writes the app's version into `dist/index.html` where it says `__APP_VERSION__`: the page asks
// ahead for the translation file under the same address the app does, which carries the version.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
const index = resolve(root, 'dist/index.html');
const html = readFileSync(index, 'utf-8');

if (!html.includes('__APP_VERSION__')) {
  console.error(`[stamp-app-version] no __APP_VERSION__ in ${index}`);
  process.exit(1);
}

writeFileSync(index, html.replaceAll('__APP_VERSION__', encodeURIComponent(version)));
console.log(`[stamp-app-version] ${index} <- ${version}`);
