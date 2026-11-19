import angular from '@analogjs/vite-plugin-angular';
import { createHash } from 'crypto';
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'path';
import { defineConfig } from 'vitest/config';
import { parseCLI } from 'vitest/node';

import base from './vitest-base.config.mjs';

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
 * The specs a single `vitest run` handed files can reach, or null for a run that may reach any.
 *
 * A run that may pick up a spec outside the files it was handed - watch mode, `related`,
 * `--changed`, coverage, or anything not started from the command line - is one that may reach any.
 */
function specsHandedToTheRun(): string[] | null {
  if (!basename(process.argv[1] ?? '').startsWith('vitest')) return null;
  let cli: ReturnType<typeof parseCLI>;
  try {
    cli = parseCLI(['vitest', ...process.argv.slice(2)]);
  } catch {
    return null;
  }
  const { filter, options } = cli;
  if (!options.run || options.related || options.changed || options.coverage || filter.length === 0) return null;
  const specs = specFilesUnder(resolve(ROOT, 'src')).filter((spec) => filter.some((f) => filterReaches(f, spec)));
  return specs.length === 0 ? null : specs;
}

/**
 * The tsconfig the Angular compiler starts from on this run, written beside the cache.
 *
 * Before the first test, the compiler analyses and emits everything reachable from the tsconfig,
 * which from every spec is the whole app. A single `vitest run` handed files needs only what those
 * specs reach, so it is given a tsconfig listing just them.
 *
 * TypeScript checks the types of a file in full before it emits it, and of the forty seconds the
 * whole app took, that was half. This path reports no type errors, only errors of syntax, so the
 * check is switched off with `noCheck`; `ng test` and the build are where the types are checked.
 */
function specTsconfig(): string {
  const specs = specsHandedToTheRun();
  const fromCache = (path: string) => toPosix(relative(SPEC_TSCONFIG_CACHE, path));
  const tsconfig = JSON.stringify(
    {
      extends: fromCache(SPEC_TSCONFIG),
      compilerOptions: { noCheck: true, isolatedModules: true },
      ...(specs === null
        ? {}
        : {
            include: [
              ...specs.map(fromCache),
              fromCache(resolve(ROOT, 'src')) + '/**/*.d.ts',
              fromCache(resolve(ROOT, 'src/app/testing/test-setup.ts')),
            ],
          }),
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
