#!/usr/bin/env node
/**
 * Runs the specs that can reach the sources it is handed: the staged files before a commit, the
 * files of the commits not yet pushed before a push.
 *
 * `vitest related` works this out by transforming every spec and everything it imports, which
 * means compiling the whole app before a single test runs. Here the imports are read off the files
 * instead, and Vitest is handed the specs by name, so it compiles only what they reach.
 *
 * Only the imports a file still holds when it runs count. Each file goes through TypeScript's own
 * transpile, which drops an import used only as a type, and the imports are read off what comes
 * out; a module a spec mocks stays among them, as the call naming it does. Vitest checks no types,
 * so a change a spec reaches only through types cannot change how it runs. A file with an Angular
 * decorator keeps the imports its constructor's parameters are typed with, since Angular injects
 * by those types. What comes out is kept in node_modules/.cache under the file's contents, so a
 * run reads again only the files changed since the last.
 *
 * Every spec runs when the files handed include a runner config, a setup file, or anything a setup
 * file imports at any depth without waiting, since setup loads those into every spec. With
 * `--disk-specs`, as before a push, the specs that read files off the disk run as well whatever was
 * changed: a dictionary, a model or a source one of them checks is reached by no import. A changed
 * dictionary adds every spec that names TestBed as well, for the words those draw. What setup
 * imports only for a spec that builds a TestBed module, the providers every module is given, adds
 * every spec that names TestBed, as setup tells such a spec by that word.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

import { importedFrom, resolveSpecifier, RuntimeImports, sourcesUnder } from './runtime-imports.mjs';

const VITEST_CONFIG = 'vitest.config.mts';
const ANGULAR_WORKSPACE = 'angular.json';
const UNIT_TEST_BUILDER = '@angular/build:unit-test';
/** The word setup looks for in a spec before it loads the providers every TestBed module is given. */
const TEST_BED_WORD = 'TestBed';

/**
 * The files both test paths load before any spec: the setup files and the configs the runners
 * are pointed at, as `vitest.config.mts` and the unit-test targets in `angular.json` name them.
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

function run(args) {
  const result = spawnSync('npx', ['vitest', 'run', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

/**
 * How a spec is told to read files off the disk rather than import them: the dictionaries, the models
 * and their hashes, the sources it checks the layout or the wording of. What such a spec reaches no
 * import tells of.
 */
const READS_DISK = /from 'node:fs'|from 'fs'|\breadFileSync\b|\breaddirSync\b|import\.meta\.glob/;

const { setupFiles, configs } = runnerInputs();
const withDiskSpecs = process.argv.includes('--disk-specs');
const stagedPaths = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('--'))
  .map((f) => posix.normalize(f.replaceAll('\\', '/')));

/** A dictionary, which the test setup gives every TestBed module: a spec that names TestBed may check its words. */
const DICTIONARY = /^src\/assets\/i18n\/[^/]+\.json$/;

/**
 * The specs run with `--disk-specs` whatever sources were changed: those that read files off the
 * disk, and, where a dictionary was changed, every spec that names TestBed, since the words a
 * component draws come out of the dictionaries the setup hands it.
 */
function diskSpecs() {
  if (!withDiskSpecs || stagedPaths.length === 0) return [];
  const dictionaryChanged = stagedPaths.some((file) => DICTIONARY.test(file));
  return sourcesUnder('src').filter((file) => {
    if (!file.endsWith('.spec.ts')) return false;
    const source = readFileSync(file, 'utf-8');
    return READS_DISK.test(source) || (dictionaryChanged && source.includes(TEST_BED_WORD));
  });
}

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
  const fromDisk = diskSpecs();
  if (fromDisk.length === 0) {
    console.log('[vitest-related] no changed sources touch a spec; nothing to run');
    process.exit(0);
  }
  console.log(
    `[vitest-related] no changed source is imported by a spec; running the ${fromDisk.length} that read files or draw a changed dictionary's words`
  );
  run(fromDisk.sort());
}
if (setupFiles.size === 0) {
  console.log(`[vitest-related] no setup files found in ${VITEST_CONFIG} or ${ANGULAR_WORKSPACE}; running every spec`);
  run([]);
}

const files = new Set(sourcesUnder('src'));
const runtimeImports = new RuntimeImports();
const imports = new Map();
const importers = new Map();
const setupWaitsOn = new Set();
const setupImportsForTestBed = new Set();
const testBedSpecs = [];
for (const file of files) {
  const source = readFileSync(file, 'utf-8');
  if (file.endsWith('.spec.ts') && source.includes(TEST_BED_WORD)) testBedSpecs.push(file);
  const { waited, dynamic } = runtimeImports.of(source);
  const dependencies = new Set();
  for (const [specifiers, fromSetup] of [
    [waited, setupWaitsOn],
    [dynamic, setupImportsForTestBed],
  ]) {
    for (const specifier of specifiers) {
      const dependency = resolveSpecifier(specifier, file, files);
      if (dependency === null || dependency === file) continue;
      dependencies.add(dependency);
      if (!importers.has(dependency)) importers.set(dependency, new Set());
      importers.get(dependency).add(file);
      if (setupFiles.has(file)) fromSetup.add(dependency);
    }
  }
  imports.set(file, dependencies);
}
runtimeImports.save();

const loadedBySetup = new Set([...setupFiles, ...importedFrom(setupWaitsOn, imports)]);
const stagedSetup = [...staged].find((file) => loadedBySetup.has(file));
if (stagedSetup !== undefined) {
  const reason = setupFiles.has(stagedSetup) ? 'is a test setup file' : 'is loaded by the test setup';
  console.log(`[vitest-related] ${stagedSetup} ${reason}; running every spec`);
  run([]);
}

const reached = importedFrom(staged, importers);
const specs = new Set([...reached].filter((file) => file.endsWith('.spec.ts') && files.has(file)));
const loadedForTestBed = importedFrom(setupImportsForTestBed, imports);
const stagedProvider = [...staged].find((file) => loadedForTestBed.has(file));
if (stagedProvider !== undefined) {
  console.log(`[vitest-related] ${stagedProvider} is loaded with the providers every TestBed module is given`);
  for (const spec of testBedSpecs) specs.add(spec);
}
for (const spec of diskSpecs()) specs.add(spec);
if (specs.size === 0) {
  console.log('[vitest-related] no spec reaches the changed sources; nothing to run');
  process.exit(0);
}
console.log(`[vitest-related] ${specs.size} spec(s) reach the changed sources`);
run([...specs].sort());
