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
 * changed: a model or a source one of them checks is reached by no import.
 *
 * Specs are picked only for changes whose reach can be told, which `change-reach.mjs` decides for
 * this picker and the e2e one alike. A file it knows nothing of (a dictionary, a stylesheet of the
 * whole page, an agreement kept as JSON, what is installed, how the sources are compiled) runs every
 * spec; one it knows to reach none, as writing about the app does, runs none. What setup
 * imports only for a spec that builds a TestBed module, the providers every module is given, adds
 * every spec that names TestBed, as setup tells such a spec by that word.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

import { kindOfChange } from './change-reach.mjs';
import { importedFrom, resolveSpecifier, RuntimeImports, sourcesUnder } from './runtime-imports.mjs';
import { fitsCommandLine, specsReadingDisk } from './vitest-reach.mjs';

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

function run(specs) {
  let args = specs;
  if (!fitsCommandLine(specs, process.platform)) {
    console.log(`[vitest-related] ${specs.length} specs are more than the command line takes; running every spec`);
    args = [];
  }
  const result = spawnSync('npx', ['vitest', 'run', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

const { setupFiles, configs } = runnerInputs();
const withDiskSpecs = process.argv.includes('--disk-specs');
/**
 * Whether only what can be told is run, as before a commit: a file whose reach nobody can tell is
 * left for the push, where every spec runs for it, rather than running every spec on each commit.
 */
const toldOnly = process.argv.includes('--told-only');
const stagedPaths = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('--'))
  .map((f) => posix.normalize(f.replaceAll('\\', '/')));

const stagedConfig = stagedPaths.find((file) => configs.has(file));
if (stagedConfig !== undefined) {
  console.log(`[vitest-related] ${stagedConfig} configures every spec; running every spec`);
  run([]);
}

const staged = new Set();
for (const file of stagedPaths) {
  const change = kindOfChange(file);
  if (change.kind === 'source') staged.add(change.source);
  // A file whose reach nobody can tell may be read by any spec, through a helper, the setup or an
  // import of the file itself: nothing is picked for it, and every spec runs.
  if (change.kind === 'unknown') {
    if (toldOnly) {
      console.log(`[vitest-related] ${file} may reach any spec; left for the push, which runs every spec for it`);
      continue;
    }
    console.log(`[vitest-related] ${file} may reach any spec; running every spec`);
    run([]);
  }
}
if (staged.size === 0 && !(withDiskSpecs && stagedPaths.length > 0)) {
  console.log('[vitest-related] no changed sources touch a spec; nothing to run');
  process.exit(0);
}
if (setupFiles.size === 0) {
  console.log(`[vitest-related] no setup files found in ${VITEST_CONFIG} or ${ANGULAR_WORKSPACE}; running every spec`);
  run([]);
}

const files = new Set(sourcesUnder('src'));
const runtimeImports = new RuntimeImports();
const texts = new Map();
const imports = new Map();
const importers = new Map();
const setupWaitsOn = new Set();
const setupImportsForTestBed = new Set();
const testBedSpecs = [];
for (const file of files) {
  const source = readFileSync(file, 'utf-8');
  texts.set(file, source);
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
// With `--disk-specs`, the specs that read files off the disk run whatever was changed.
const ofSetup = new Set([...loadedBySetup, ...loadedForTestBed]);
const fromDisk = withDiskSpecs && stagedPaths.length > 0 ? specsReadingDisk(texts, importers, ofSetup) : [];
for (const spec of fromDisk) specs.add(spec);
if (specs.size === 0) {
  console.log('[vitest-related] no spec reaches the changed sources; nothing to run');
  process.exit(0);
}
console.log(
  `[vitest-related] ${specs.size} spec(s) reach the changed sources` +
    (fromDisk.length > 0 ? `, the ${fromDisk.length} that read files among them` : '')
);
run([...specs].sort());
