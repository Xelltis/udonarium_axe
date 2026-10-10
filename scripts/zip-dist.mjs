#!/usr/bin/env node
// dist/の中身をaxe_{version}.zipとしてまとめる。
// fflateはfile-archiverで既に使っているので、追加の依存はない。
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;
const distDir = resolve(root, 'dist');
const outFile = resolve(distDir, `axe_${version}.zip`);

function collect(dir, files = {}) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collect(full, files);
    } else if (stat.isFile()) {
      // 自分自身と過去版のzipは含めない（再帰を避け、差分が膨らむのを防ぐ）
      if (entry.startsWith('axe_') && entry.endsWith('.zip')) continue;
      const rel = relative(distDir, full).split(sep).join('/');
      files[rel] = readFileSync(full);
    }
  }
  return files;
}

try {
  statSync(distDir);
} catch {
  console.error(`[zip-dist] distが存在しません: ${distDir}`);
  process.exit(1);
}

const entries = collect(distDir);
if (Object.keys(entries).length === 0) {
  console.error('[zip-dist] distが空です');
  process.exit(1);
}

const archive = zipSync(entries, { level: 6 });
writeFileSync(outFile, archive);
console.log(
  `[zip-dist] ${outFile} (${(archive.length / 1024 / 1024).toFixed(2)} MB, ${Object.keys(entries).length} files)`
);
