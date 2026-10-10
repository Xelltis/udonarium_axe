import { existsSync, readFileSync } from 'node:fs';

const WORKER = 'src/app/application/replay/replay-video.worker.ts';
const IMPORT = /^(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'/gms;
/** Modules that set up the synchronised objects or the network as they load, which a worker has no use for. */
const PAGE_ONLY = /^(@axe\/core\/(sync|network)\/|@angular\/)/;

/** The modules a file loads when it runs: every import not marked as bringing in types alone. */
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

function fileOf(path: string): string {
  const base = path.replace('@axe/', 'src/app/');
  return existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`;
}

/**
 * The replay video worker runs apart from the page, so it must load nothing that expects the page's
 * world. The synchronised objects wire themselves to one another as they load, and in a worker's
 * bundle they load in an order where that fails, so the worker dies before drawing a frame and the
 * export quietly falls back to the page.
 */
describe('the replay video worker', () => {
  it('loads nothing of the synchronised objects, the network or Angular', () => {
    const via = new Map<string, string>([[WORKER, '']]);
    const queue = [WORKER];
    const offending: string[] = [];
    while (queue.length > 0) {
      const file = queue.shift()!;
      for (const path of loadedBy(file)) {
        if (PAGE_ONLY.test(path)) {
          offending.push(`${file} loads ${path}`);
          continue;
        }
        if (!path.startsWith('@axe/')) continue;
        const next = fileOf(path);
        if (via.has(next)) continue;
        via.set(next, file);
        queue.push(next);
      }
    }

    expect(offending).toEqual([]);
    expect(via.size).toBeGreaterThan(20);
  });
});
