/**
 * How the sources import one another when they run, read off the files themselves: what
 * `vitest-related.mjs` and `e2e-related.mjs` both find their way through.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';

const ALIASES = [
  ['@axe/', 'src/app/'],
  ['@env/', 'src/environments/'],
];
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bvi\.(?:mock|doMock)\(\s*)['"]([^'"\n]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g;
const ANGULAR_DECORATOR = /@(?:Component|Directive|Injectable|NgModule|Pipe)\s*\(/;
const IMPORT_CACHE = 'node_modules/.cache/axe-vitest/related-imports.json';
/** Raised whenever what is kept for a file changes shape, so that no run reads an older one. */
const IMPORT_CACHE_FORMAT = 1;

export function sourcesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

export function resolveSpecifier(specifier, fromFile, files) {
  const bare = specifier.replace(/\?.*$/, '');
  let base = null;
  if (bare.startsWith('.')) base = posix.join(posix.dirname(fromFile), bare);
  for (const [alias, dir] of ALIASES) if (bare.startsWith(alias)) base = dir + bare.slice(alias.length);
  if (base === null) return null;
  return [base, `${base}.ts`, posix.join(base, 'index.ts')].find((candidate) => files.has(candidate)) ?? null;
}

/**
 * Reads the imports each file still holds once TypeScript has transpiled it, the ones it waits on
 * apart from the ones it imports as it goes, through what was kept for the same contents last time
 * where there is one. The options are the build's own, with the decorators' metadata written out
 * only for a file that Angular may inject into.
 */
export class RuntimeImports {
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
export function importedFrom(roots, imports) {
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
