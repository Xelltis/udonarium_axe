#!/usr/bin/env node
// Bundles the bridge into one file, dist/axe-mcp.mjs, that runs on Node 22 or later with nothing installed,
// and puts the license of every package bundled into it at its end.
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outfile = resolve(here, 'dist/axe-mcp.mjs');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const result = await build({
  absWorkingDir: here,
  entryPoints: [resolve(here, 'src/main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: resolve(here, 'tsconfig.json'),
  define: { __AXE_VERSION__: JSON.stringify(version) },
  // ws looks for two optional native helpers with require(); a bundled ES module has no require of
  // its own, so it is given one, and the helpers are left to be found, or not, at run time.
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: [
      '#!/usr/bin/env node',
      `// Udonarium Axe MCP bridge ${version}. The licenses of Udonarium Axe and of the packages bundled in are at the end.`,
      "import { createRequire as __axeCreateRequire } from 'node:module';",
      'const require = __axeCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});

/** The folder of each package a bundled file came from, the last node_modules in its path deciding. */
function packageDirsOf(inputs) {
  const dirs = new Set();
  for (const input of inputs) {
    const parts = resolve(here, input).split(sep);
    const at = parts.lastIndexOf('node_modules');
    if (at < 0) continue;
    const take = parts[at + 1]?.startsWith('@') ? 3 : 2;
    dirs.add(parts.slice(0, at + take).join(sep));
  }
  return [...dirs].sort();
}

/**
 * The license a package ships, or, for one published without it, the text kept in licenses/ as its
 * source repository has it.
 */
function licenseTextIn(dir, name) {
  // Every license file a package ships, as one that changed its license keeps the old beside the new.
  const files = readdirSync(dir)
    .filter((each) => /^(license|licence|copying)([.-]|$)/i.test(each))
    .sort();
  if (files.length > 0) return files.map((file) => readFileSync(resolve(dir, file), 'utf8').trim()).join('\n\n');
  const kept = resolve(here, 'licenses', `${name.replace('/', '__')}.txt`);
  return existsSync(kept) ? readFileSync(kept, 'utf8').trim() : null;
}

const notices = [`Udonarium Axe\n\n${readFileSync(resolve(root, 'LICENSE'), 'utf8').trim()}`];
const missing = [];
for (const dir of packageDirsOf(Object.keys(result.metafile.inputs))) {
  const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
  const text = existsSync(dir) ? licenseTextIn(dir, pkg.name) : null;
  if (!text) missing.push(`${pkg.name}@${pkg.version}`);
  notices.push(`${pkg.name}@${pkg.version} (${pkg.license})\n\n${text ?? `Licensed under ${pkg.license}.`}`);
}
const comment = notices.map((notice) => notice.replaceAll('*/', '* /')).join('\n\n----------------\n\n');
appendFileSync(outfile, `\n/*\n${comment}\n*/\n`);

if (missing.length > 0) console.warn(`No license file found for: ${missing.join(', ')}`);
console.log(`Built tools/axe-mcp/dist/axe-mcp.mjs (${version}) with ${notices.length - 1} bundled packages`);
