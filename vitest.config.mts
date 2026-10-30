import angular from '@analogjs/vite-plugin-angular';
import { createHash } from 'crypto';
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'path';
import { defineConfig } from 'vitest/config';
import { parseCLI } from 'vitest/node';

import base from './vitest-base.config.mts';

const ROOT = import.meta.dirname;
const SPEC_TSCONFIG = resolve(ROOT, 'tsconfig.spec.json');
const SPEC_TSCONFIG_CACHE = resolve(ROOT, 'node_modules/.cache/axe-vitest');

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function specFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return specFilesUnder(path);
    return entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/**
 * Whether a CLI filter picks out a spec file, erring towards yes.
 *
 * Vitest matches a filter as a piece of the file's path, with an optional `:line` on the end.
 * Anything this lets through that Vitest would not only makes the compilation a little larger.
 */
function filterReaches(filter: string, specFile: string): boolean {
  const bare = filter.replace(/:\d+$/, '');
  if (isAbsolute(bare) && specFile.startsWith(bare)) return true;
  const path = toPosix(relative(ROOT, specFile)).toLowerCase();
  return path.includes(toPosix(bare).toLowerCase()) || path.includes(toPosix(relative(ROOT, bare)).toLowerCase());
}

/**
 * The tsconfig the Angular compiler starts from on this run.
 *
 * Before the first test, the compiler analyses everything reachable from the tsconfig, which from
 * every spec is the whole app and some twenty seconds. A single `vitest run` handed files needs
 * only what those specs reach, so it is given a tsconfig listing just them. A run that may pick up
 * a spec outside that set - watch mode, `related`, `--changed`, coverage, or anything not started
 * from the command line - keeps the full one.
 */
function specTsconfig(): string {
  if (!basename(process.argv[1] ?? '').startsWith('vitest')) return SPEC_TSCONFIG;
  let cli: ReturnType<typeof parseCLI>;
  try {
    cli = parseCLI(['vitest', ...process.argv.slice(2)]);
  } catch {
    return SPEC_TSCONFIG;
  }
  const { filter, options } = cli;
  if (!options.run || options.related || options.changed || options.coverage || filter.length === 0) {
    return SPEC_TSCONFIG;
  }
  const specs = specFilesUnder(resolve(ROOT, 'src')).filter((spec) => filter.some((f) => filterReaches(f, spec)));
  if (specs.length === 0) return SPEC_TSCONFIG;

  const fromCache = (path: string) => toPosix(relative(SPEC_TSCONFIG_CACHE, path));
  const tsconfig = JSON.stringify(
    {
      extends: fromCache(SPEC_TSCONFIG),
      include: [
        ...specs.map(fromCache),
        fromCache(resolve(ROOT, 'src')) + '/**/*.d.ts',
        fromCache(resolve(ROOT, 'src/app/testing/test-setup.ts')),
        fromCache(resolve(ROOT, 'src/polyfills.ts')),
      ],
    },
    null,
    2
  );
  const path = join(SPEC_TSCONFIG_CACHE, `tsconfig.spec.${createHash('sha1').update(tsconfig).digest('hex')}.json`);
  mkdirSync(SPEC_TSCONFIG_CACHE, { recursive: true });
  const partial = `${path}.${process.pid}`;
  writeFileSync(partial, tsconfig);
  renameSync(partial, path);
  return path;
}

export default defineConfig({
  plugins: [angular({ jit: false, tsconfig: specTsconfig() })],
  resolve: {
    alias: {
      '@axe': resolve(ROOT, 'src/app'),
      '@env': resolve(ROOT, 'src/environments'),
      '@pkg': resolve(ROOT, 'package.json'),
    },
  },
  test: {
    ...base.test,
    globals: true,
    environment: 'happy-dom',
    pool: 'threads',
    // A component compiled with its templateUrl is cached by its .ts alone, so with the module cache
    // on, a change to the template only ran the specs against the template as it was before.
    fsModuleCache: false,
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/app/testing/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/app/**/*.ts'],
      exclude: ['src/app/**/*.spec.ts', 'src/app/**/*.d.ts', 'src/environments/**'],
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
