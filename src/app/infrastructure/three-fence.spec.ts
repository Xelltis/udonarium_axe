import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'src/app';
const LIBRARY = /^(three|three\/.*|cannon-es)$/;
const IMPORT = /^(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'/gms;

/**
 * The folders that may load three.js, each with the modules of it the rest of the page may load
 * straight away. None of those loads a library, which reaches the page only through `import(`, so
 * the first screen never waits for one.
 */
const FENCED: Readonly<Record<string, ReadonlySet<string>>> = {
  'infrastructure/dice-3d': new Set(['dice-physics-client', 'dice-physics-message', 'dice-geometry']),
  'infrastructure/table-3d': new Set(['table-3d-port', 'table-3d-quality']),
};

/** What the fenced folders share among themselves, reached from nowhere else. */
const KIT = 'infrastructure/three-kit';

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** What a file loads when it runs, leaving out what it imports for its types alone. */
function loadedBy(file: string): string[] {
  const loaded: string[] = [];
  for (const [, typeOnly, clause, path] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    if (typeOnly) continue;
    const named = clause.match(/\{([^}]*)\}/)?.[1];
    const bare = clause.replace(/\{[^}]*\}/, '').replace(/[,\s]/g, '');
    const values = (named ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0 && !name.startsWith('type '));
    if (named !== undefined && !bare && values.length === 0) continue;
    loaded.push(path);
  }
  return loaded;
}

/** The fenced folder a file lies in, or a module path names, or null for neither. */
function fenceOf(pathOrFile: string): string | null {
  const relative = pathOrFile.replace(/^@axe\//, '').replace(`${APP}/`, '');
  return [...Object.keys(FENCED), KIT].find((folder) => relative.startsWith(`${folder}/`)) ?? null;
}

function moduleName(path: string): string {
  return path.split('/').pop()!.replace(/\.ts$/, '');
}

describe('the three.js fence', () => {
  it('lets nothing outside the fenced folders load three.js or the physics', () => {
    const offending = sources(APP)
      .filter((file) => fenceOf(file) === null)
      .flatMap((file) =>
        loadedBy(file)
          .filter((path) => LIBRARY.test(path))
          .map((path) => `${file} loads ${path}`)
      );

    expect(offending).toEqual([]);
  });

  it('lets the rest of the page into a fenced folder only through its entries', () => {
    const offending = sources(APP)
      .filter((file) => fenceOf(file) === null)
      .flatMap((file) =>
        loadedBy(file)
          .filter((path) => {
            const fence = fenceOf(path);
            return fence !== null && (fence === KIT || !FENCED[fence].has(moduleName(path)));
          })
          .map((path) => `${file} loads ${path}`)
      );

    expect(offending).toEqual([]);
  });

  it('keeps the entries free of the libraries and of the rest of their folders', () => {
    const offending = Object.entries(FENCED).flatMap(([folder, entries]) =>
      [...entries]
        .map((entry) => `${APP}/${folder}/${entry}.ts`)
        .filter((file) => existsSync(file))
        .flatMap((file) =>
          loadedBy(file)
            .filter((path) => {
              if (LIBRARY.test(path)) return true;
              const fence = fenceOf(path);
              return fence !== null && (fence === KIT || !FENCED[fence].has(moduleName(path)));
            })
            .map((path) => `${file} loads ${path}`)
        )
    );

    expect(offending).toEqual([]);
  });

  it('gives every entry it names a module to stand for', () => {
    const missing = Object.entries(FENCED).flatMap(([folder, entries]) =>
      existsSync(`${APP}/${folder}`)
        ? [...entries].map((entry) => `${APP}/${folder}/${entry}.ts`).filter((file) => !existsSync(file))
        : []
    );

    expect(missing).toEqual([]);
  });
});
