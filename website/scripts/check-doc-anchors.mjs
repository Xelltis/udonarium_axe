/* global console, process */
// Checks that every link to a heading leads to a heading that exists. The VitePress build checks
// only that a linked page exists, so a renamed heading would otherwise leave its links landing at
// the top of the page without a word.
//
//   node scripts/check-doc-anchors.mjs   exits with 1 and lists the broken links if there are any
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugify } from '../.vitepress/slugify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The Markdown files of the site, leaving out its own folder, scripts and installed packages. */
const markdownUnder = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (['.vitepress', 'node_modules', 'scripts', 'public'].includes(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownUnder(path);
    return name.endsWith('.md') ? [path] : [];
  });

/**
 * The ids of a page's headings: the one written as `{#id}` at the end of a heading, or else the one
 * made from its text. A repeated heading gets -1, -2 and so on, as the site gives it.
 */
const anchorsOf = (text) => {
  const ids = new Set();
  const seen = new Map();
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const heading = !fenced && line.match(/^#{1,6}\s+(.*?)\s*$/);
    if (!heading) continue;
    const custom = heading[1].match(/\{#([^}\s]+)\}\s*$/);
    if (custom) {
      ids.add(custom[1]);
      continue;
    }
    const plain = heading[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '');
    const id = slugify(plain);
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    ids.add(count ? `${id}-${count}` : id);
  }
  return ids;
};

/** The site path a file is served at, as links write it (`guide/index.md` is `/guide/`). */
const pageOf = (file) =>
  '/' +
  relative(ROOT, file)
    .replace(/index\.md$/, '')
    .replace(/\.md$/, '');

const files = markdownUnder(ROOT);
const anchors = new Map(files.map((file) => [pageOf(file), anchorsOf(readFileSync(file, 'utf-8'))]));
const pageAt = (path) => anchors.get(path) ?? anchors.get(`${path}/`) ?? anchors.get(path.replace(/\/$/, ''));

const broken = [];
for (const file of files) {
  const from = relative(ROOT, file);
  for (const [, link] of readFileSync(file, 'utf-8').matchAll(/\]\((\/[^)\s]*|#[^)\s]*)\)/g)) {
    const [path, hash] = link.split('#');
    if (hash === undefined) {
      if (path && !pageAt(path)) broken.push(`${from}: no page ${path}`);
      continue;
    }
    const target = path || pageOf(file);
    const ids = pageAt(target);
    if (!ids) broken.push(`${from}: no page ${target} (${link})`);
    else if (!ids.has(decodeURIComponent(hash))) broken.push(`${from}: no heading #${hash} on ${target}`);
  }
}

if (broken.length) {
  console.error(broken.join('\n'));
  console.error(`${broken.length} link(s) lead to no page or heading.`);
  process.exit(1);
}
console.log('Every link to a page or a heading leads to one.');
