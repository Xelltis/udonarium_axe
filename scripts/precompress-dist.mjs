#!/usr/bin/env node
/**
 * Writes a gzip copy beside each hashed script and stylesheet in dist/, and a dist/.htaccess that has
 * Apache answer a request for one of those files with its copy.
 *
 * The copies are for the release zip, which people unpack onto a server of their own. Apache applies an
 * .htaccess to its own directory and everything below it, so the rules sit at the dist root beside the
 * bundles. Only scripts and stylesheets get a copy, since their names change with their content:
 * index.html and assets/config.json may be edited where the app is installed, and a copy made at build
 * time would go on being served over the edit.
 *
 * The S3 deploy leaves the copies out; CloudFront compresses on its own.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');
const MIN_BYTES = 1024;

/** The extensions that get a gzip copy, each with the Content-Type its copy is served as. */
const CONTENT_TYPES = {
  js: 'text/javascript',
  css: 'text/css',
};
const EXTENSIONS = Object.keys(CONTENT_TYPES).join('|');
const COMPRESSIBLE = new RegExp(`\\.(${EXTENSIONS})$`);

/**
 * Apache rules that serve `name.js.gz` for `name.js` to a browser that accepts gzip.
 *
 * The rewrite goes to `%{REQUEST_URI}` rather than a path relative to this directory, so it holds at
 * the site root, in a subdirectory and behind an Alias alike. `RewriteOptions Inherit` keeps the rewrite
 * rules of a parent directory, such as a redirect to HTTPS, applying to an install in a subdirectory.
 * A copy is labelled with the Content-Type of the file it stands for and a gzip Content-Encoding, which
 * also keeps mod_deflate from compressing it again. Both forms carry `Vary: Accept-Encoding`, so a cache
 * does not hand either one to a client that asked for the other.
 */
const HTACCESS = [
  '# Written by scripts/precompress-dist.mjs: serves the .gz copy of a script or stylesheet when the browser accepts gzip.',
  '<IfModule mod_rewrite.c>',
  '  RewriteEngine On',
  '  RewriteOptions Inherit',
  '  RewriteCond %{HTTP:Accept-Encoding} gzip [NC]',
  '  RewriteCond %{REQUEST_FILENAME}.gz -s',
  `  RewriteRule \\.(${EXTENSIONS})$ %{REQUEST_URI}.gz [L]`,
  '</IfModule>',
  ...Object.entries(CONTENT_TYPES).flatMap(([extension, type]) => [
    `<FilesMatch "\\.${extension}\\.gz$">`,
    `  ForceType ${type}`,
    '  AddEncoding gzip .gz',
    '</FilesMatch>',
  ]),
  '<IfModule mod_headers.c>',
  `  <FilesMatch "\\.(${EXTENSIONS})(\\.gz)?$">`,
  '    Header merge Vary Accept-Encoding',
  '  </FilesMatch>',
  '</IfModule>',
  '',
].join('\n');

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
  console.error(`[precompress-dist] no build at ${distDir}`);
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
writeFileSync(join(distDir, '.htaccess'), HTACCESS);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log(`[precompress-dist] ${count} files, ${mb(rawBytes)} MB -> ${mb(packedBytes)} MB`);
