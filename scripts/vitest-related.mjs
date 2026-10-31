#!/usr/bin/env node
/**
 * Runs the specs that can reach the staged sources.
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
 * Every spec runs when the staged files include a runner config, a setup file, or anything a setup
 * file imports at any depth without waiting, since setup loads those into every spec. What setup
 * imports only for a spec that builds a TestBed module, the providers every module is given, adds
 * every spec that names TestBed, as setup tells such a spec by that word.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';

const VITEST_CONFIG = 'vitest.config.mts';
const ANGULAR_WORKSPACE = 'angular.json';
const UNIT_TEST_BUILDER = '@angular/build:unit-test';
const ALIASES = [
  ['@axe/', 'src/app/'],
  ['@env/', 'src/environments/'],
];
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bvi\.(?:mock|doMock)\(\s*)['"]([^'"\n]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g;
const ANGULAR_DECORATOR = /@(?:Component|Directive|Injectable|NgModule|Pipe)\s*\(/;
/** The word setup looks for in a spec before it loads the providers every TestBed module is given. */
const TEST_BED_WORD = 'TestBed';
const IMPORT_CACHE = 'node_modules/.cache/axe-vitest/related-imports.json';
/** Raised whenever what is kept for a file changes shape, so that no run reads an older one. */
const IMPORT_CACHE_FORMAT = 1;

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

/**
 * Reads the imports each file still holds once TypeScript has transpiled it, the ones it waits on
 * apart from the ones it imports as it goes, through what was kept for the same contents last time
 * where there is one. The options are the build's own, with the decorators' metadata written out
 * only for a file that Angular may inject into.
 */
class RuntimeImports {
  #require = createRequire(import.meta.url);
  #typescriptVersion = JSON.parse(readFileSync(this.#require.resolve('typescript/package.json'), 'utf-8')).version;
  #typescript = null;
  #kept = this.#readCache();
  #used = {};
  #changed = false;

  /** The specifiers a file imports when it runs: the ones it waits on, and the ones it imports as it goes. */
  of(source) {
    const key = createHash('sha1').update(source).digest('hex');
    let found = this.#kept[key];
    if (!found) {
      const output = this.#transpile(source);
      const specifiers = (text, pattern) => [...new Set([...text.matchAll(pattern)].map((match) => match[1]))];
      found = {
        waited: specifiers(output.replace(DYNAMIC_IMPORT, ''), SPECIFIER),
        dynamic: specifiers(output, DYNAMIC_IMPORT),
      };
      this.#changed = true;
    }
    this.#used[key] = found;
    return found;
  }

  /** Keeps what was read for the files as they stand now, dropping what was kept for any other. */
  save() {
    if (!this.#changed && Object.keys(this.#used).length === Object.keys(this.#kept).length) return;
    const cache = { format: IMPORT_CACHE_FORMAT, typescript: this.#typescriptVersion, files: this.#used };
    mkdirSync(posix.dirname(IMPORT_CACHE), { recursive: true });
    const partial = `${IMPORT_CACHE}.${process.pid}`;
    writeFileSync(partial, JSON.stringify(cache));
    renameSync(partial, IMPORT_CACHE);
  }

  #transpile(source) {
    this.#typescript ??= this.#require('typescript');
    const ts = this.#typescript;
    return ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2020,
        experimentalDecorators: true,
        emitDecoratorMetadata: ANGULAR_DECORATOR.test(source),
        useDefineForClassFields: false,
      },
    }).outputText;
  }

  #readCache() {
    let cache;
    try {
      cache = JSON.parse(readFileSync(IMPORT_CACHE, 'utf-8'));
    } catch {
      return {};
    }
    return cache.format === IMPORT_CACHE_FORMAT && cache.typescript === this.#typescriptVersion ? cache.files : {};
  }
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
if (specs.size === 0) {
  console.log('[vitest-related] no spec reaches the staged sources; nothing to run');
  process.exit(0);
}
console.log(`[vitest-related] ${specs.size} spec(s) reach the staged sources`);
run([...specs].sort());
