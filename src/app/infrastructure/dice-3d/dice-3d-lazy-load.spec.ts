import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'src/app';
const FOLDER = 'src/app/infrastructure/dice-3d';
const LIBRARY = /^(three|three\/.*|cannon-es)$/;
const IMPORT = /^(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'/gms;

/**
 * The modules of the folder the page may load straight away. None of them loads the libraries, which
 * reach the page only through `import(`, so the first screen never waits for them.
 */
const ENTRIES = new Set(['dice-physics-client', 'dice-physics-message', 'dice-geometry']);

function sources(dir: string): string[] {
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

describe('the 3D dice libraries', () => {
  it('are loaded by nothing outside the dice folder', () => {
    const offending = sources(APP)
      .filter((file) => !file.startsWith(FOLDER))
      .flatMap((file) =>
        loadedBy(file)
          .filter((path) => LIBRARY.test(path))
          .map((path) => `${file} loads ${path}`)
      );

    expect(offending).toEqual([]);
  });

  it('reach the page only through the folder’s entries, which load neither library', () => {
    const offending = sources(APP)
      .filter((file) => !file.startsWith(FOLDER))
      .flatMap((file) =>
        loadedBy(file)
          .filter((path) => path.startsWith('@axe/infrastructure/dice-3d/'))
          .filter((path) => !ENTRIES.has(path.replace('@axe/infrastructure/dice-3d/', '')))
          .map((path) => `${file} loads ${path}`)
      );
    const entryLoadsLibrary = [...ENTRIES].flatMap((entry) =>
      loadedBy(`${FOLDER}/${entry}.ts`)
        .filter(
          (path) =>
            LIBRARY.test(path) ||
            (path.startsWith('@axe/infrastructure/dice-3d/') && !ENTRIES.has(path.split('/').pop()!))
        )
        .map((path) => `${entry} loads ${path}`)
    );

    expect(offending).toEqual([]);
    expect(entryLoadsLibrary).toEqual([]);
  });
});
