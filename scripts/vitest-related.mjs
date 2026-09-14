#!/usr/bin/env node
/**
 * Runs the specs that can reach the staged sources.
 *
 * `vitest related` works this out by transforming every spec and everything it imports, which
 * means compiling the whole app before a single test runs. Here the imports are read straight
 * off the files instead, and Vitest is handed the specs by name, so it compiles only what they
 * reach. The reading errs towards more specs: a type-only import or a mocked module still counts.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

const SETUP_FILES = new Set(['src/app/testing/test-setup.ts']);
const ALIASES = [
  ['@axe/', 'src/app/'],
  ['@env/', 'src/environments/'],
];
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bvi\.(?:mock|doMock)\(\s*)['"]([^'"\n]+)['"]/g;

function sourcesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function resolveSpecifier(specifier, fromFile, files) {
  const bare = specifier.replace(/\?.*$/, '');
  let base = null;
  if (bare.startsWith('.')) base = posix.join(posix.dirname(fromFile), bare);
  for (const [alias, dir] of ALIASES) if (bare.startsWith(alias)) base = dir + bare.slice(alias.length);
  if (base === null) return null;
  return [base, `${base}.ts`, posix.join(base, 'index.ts')].find((candidate) => files.has(candidate)) ?? null;
}

function run(args) {
  const result = spawnSync('npx', ['vitest', 'run', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

const staged = new Set();
for (const file of process.argv.slice(2).map((f) => f.replaceAll('\\', '/'))) {
  if (!file.startsWith('src/')) continue;
  if (file.endsWith('.ts')) {
    staged.add(file);
    continue;
  }
  if (file.endsWith('.html') || file.endsWith('.css')) {
    const sibling = file.replace(/\.(html|css)$/, '.ts');
    if (existsSync(sibling)) staged.add(sibling);
  }
}
if (staged.size === 0) {
  console.log('[vitest-related] no staged sources touch a spec; nothing to run');
  process.exit(0);
}
if ([...staged].some((file) => SETUP_FILES.has(file))) {
  console.log('[vitest-related] the test setup is staged; running every spec');
  run([]);
}

const files = new Set(sourcesUnder('src'));
const importers = new Map();
for (const file of files) {
  for (const [, specifier] of readFileSync(file, 'utf-8').matchAll(SPECIFIER)) {
    const dependency = resolveSpecifier(specifier, file, files);
    if (dependency === null || dependency === file) continue;
    if (!importers.has(dependency)) importers.set(dependency, new Set());
    importers.get(dependency).add(file);
  }
}

const reached = new Set(staged);
const queue = [...staged];
while (queue.length > 0) {
  for (const importer of importers.get(queue.pop()) ?? []) {
    if (reached.has(importer)) continue;
    reached.add(importer);
    queue.push(importer);
  }
}
const specs = [...reached].filter((file) => file.endsWith('.spec.ts') && files.has(file)).sort();
if (specs.length === 0) {
  console.log('[vitest-related] no spec reaches the staged sources; nothing to run');
  process.exit(0);
}
console.log(`[vitest-related] ${specs.length} spec(s) reach the staged sources`);
run(specs);
