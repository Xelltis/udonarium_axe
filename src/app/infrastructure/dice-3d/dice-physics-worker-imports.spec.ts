import { existsSync } from 'node:fs';

import { loadedBy } from '@axe/testing/module-imports';

const WORKER = 'src/app/infrastructure/dice-3d/dice-physics.worker.ts';
/**
 * Modules that set up the synchronised objects or the network as they load, which a worker has no use
 * for, and the drawing library, which only the page draws with.
 */
const PAGE_ONLY = /^(@axe\/core\/(sync|network)\/|@angular\/|three)/;

function fileOf(path: string): string {
  const base = path.replace('@axe/', 'src/app/');
  return existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`;
}

/**
 * The dice physics worker runs apart from the page, so it must load nothing that expects the page's
 * world: the synchronised objects wire themselves to one another as they load and fail in a worker's
 * bundle, and the drawing library would only make the worker heavy for nothing.
 */
describe('the dice physics worker', () => {
  it('loads nothing of the synchronised objects, the network, Angular or the drawing library', () => {
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
    expect(via.size).toBeGreaterThan(5);
  });
});
