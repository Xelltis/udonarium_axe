#!/usr/bin/env node
// dist/ の js と css を gzip した .gz を同じ場所に置く。
// 自前の Apache に置いた場合は assets/.htaccess が .gz を見つけて返すので、転送量が 4 分の 1 ほどになる。
// ハッシュ付きで中身が変わらない js と css だけを対象にする。設置先で書き換えうる index.html や
// config.json に .gz を付けると、書き換えた後も古い .gz が返ってしまう。
// S3 + CloudFront には載せない（deploy.yml で除外し、圧縮は CloudFront に任せる）。
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');
const COMPRESSIBLE = /\.(js|css)$/;
const MIN_BYTES = 1024;

function collect(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collect(full, files);
    } else if (stat.isFile() && COMPRESSIBLE.test(entry) && stat.size >= MIN_BYTES) {
      files.push(full);
    }
  }
  return files;
}

try {
  statSync(distDir);
} catch {
  console.error(`[precompress-dist] dist が存在しません: ${distDir}`);
  process.exit(1);
}

let count = 0;
let rawBytes = 0;
let packedBytes = 0;
for (const file of collect(distDir)) {
  const body = readFileSync(file);
  const packed = gzipSync(body, { level: constants.Z_BEST_COMPRESSION });
  if (packed.length >= body.length) continue;
  writeFileSync(`${file}.gz`, packed);
  count++;
  rawBytes += body.length;
  packedBytes += packed.length;
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log(`[precompress-dist] ${count} files, ${mb(rawBytes)} MB -> ${mb(packedBytes)} MB`);
