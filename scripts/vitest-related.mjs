#!/usr/bin/env node
/**
 * Runs the specs that can reach the staged sources.
 *
 * `vitest related` works this out by transforming every spec and everything it imports, which
 * means compiling the whole app before a single test runs. Here the imports are read straight
 * off the files instead, and Vitest is handed the specs by name, so it compiles only what they
 * reach. The reading errs towards more specs: a type-only import or a mocked module still counts.
 *
 * Every spec runs when the staged files include a runner config, a setup file, or anything a
 * setup file imports at any depth, since setup loads those into every spec without the spec
 * importing them.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

const VITEST_CONFIG = 'vitest.config.ts';
const ANGULAR_WORKSPACE = 'angular.json';
const UNIT_TEST_BUILDER = '@angular/build:unit-test';
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

/**
 * The files both test paths load before any spec: the setup files and the configs the runners
 * are pointed at, as `vitest.config.ts` and the unit-test targets in `angular.json` name them.
 */
function runnerInputs() {
  const setupFiles = new Set();
  const configs = new Set([VITEST_CONFIG]);
  const vitestConfig = readFileSync(VITEST_CONFIG, 'utf-8');
  for (const [, list] of vitestConfig.matchAll(/\bsetupFiles:\s*\[([^\]]*)\]/g)) {
    for (const [, file] of list.matchAll(/['"]([^'"]+)['"]/g)) setupFiles.add(posix.normalize(file));
  }
  const workspace = JSON.parse(readFileSync(ANGULAR_WORKSPACE, 'utf-8'));
  for (const project of Object.values(workspace.projects ?? {})) {
    for (const target of Object.values(project.architect ?? {})) {
      if (target.builder !== UNIT_TEST_BUILDER) continue;
      for (const options of [target.options, ...Object.values(target.configurations ?? {})]) {
        for (const file of options?.setupFiles ?? []) setupFiles.add(posix.normalize(file));
        for (const key of ['runnerConfig', 'tsConfig']) {
          if (typeof options?.[key] === 'string') configs.add(posix.normalize(options[key]));
        }
      }
    }
  }
  return { setupFiles, configs };
}

/** Everything the given files import, directly or through other project sources. */
function importedFrom(roots, imports) {
  const reached = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    for (const dependency of imports.get(queue.pop()) ?? []) {
      if (reached.has(dependency)) continue;
      reached.add(dependency);
      queue.push(dependency);
    }
  }
  return reached;
}

function run(args) {
  const result = spawnSync('npx', ['vitest', 'run', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

const { setupFiles, configs } = runnerInputs();
const stagedPaths = process.argv.slice(2).map((f) => posix.normalize(f.replaceAll('\\', '/')));

const stagedConfig = stagedPaths.find((file) => configs.has(file));
if (stagedConfig !== undefined) {
  console.log(`[vitest-related] ${stagedConfig} configures every spec; running every spec`);
  run([]);
}

const staged = new Set();
for (const file of stagedPaths) {
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
if (setupFiles.size === 0) {
  console.log(`[vitest-related] no setup files found in ${VITEST_CONFIG} or ${ANGULAR_WORKSPACE}; running every spec`);
  run([]);
}

const files = new Set(sourcesUnder('src'));
const imports = new Map();
const importers = new Map();
for (const file of files) {
  const dependencies = new Set();
  for (const [, specifier] of readFileSync(file, 'utf-8').matchAll(SPECIFIER)) {
    const dependency = resolveSpecifier(specifier, file, files);
    if (dependency === null || dependency === file) continue;
    dependencies.add(dependency);
    if (!importers.has(dependency)) importers.set(dependency, new Set());
    importers.get(dependency).add(file);
  }
  imports.set(file, dependencies);
}

const loadedBySetup = importedFrom(setupFiles, imports);
const stagedSetup = [...staged].find((file) => loadedBySetup.has(file));
if (stagedSetup !== undefined) {
  const reason = setupFiles.has(stagedSetup) ? 'is a test setup file' : 'is loaded by the test setup';
  console.log(`[vitest-related] ${stagedSetup} ${reason}; running every spec`);
  run([]);
}

const reached = importedFrom(staged, importers);
const specs = [...reached].filter((file) => file.endsWith('.spec.ts') && files.has(file)).sort();
if (specs.length === 0) {
  console.log('[vitest-related] no spec reaches the staged sources; nothing to run');
  process.exit(0);
}
console.log(`[vitest-related] ${specs.length} spec(s) reach the staged sources`);
run(specs);
