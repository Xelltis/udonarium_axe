import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Network } from '@axe/core/network/network';
import {
  childrenChanged$,
  markForChanged,
  markForChildrenChanged,
  objectChanged$,
} from '@axe/core/sync/object-event-extension';
import { ObjectNode } from '@axe/core/sync/object-node';

/** The modules a module imports for what they run, read off its source: its `@axe/` imports, type-only ones left out. */
function runtimeImportsOf(module: string): string[] {
  const source = readFileSync(join(process.cwd(), 'src/app', `${module}.ts`), 'utf8');
  return [...source.matchAll(/^import (?:(?!type )[^;]*? from )?'@axe\/([^']+)';/gms)].map((match) => match[1]);
}

/** Every module a module reaches through what it imports for what it runs. */
function reachedFrom(module: string): Set<string> {
  const reached = new Set<string>();
  const waiting = [module];
  while (waiting.length > 0) {
    for (const next of runtimeImportsOf(waiting.pop()!)) {
      if (reached.has(next)) continue;
      reached.add(next);
      waiting.push(next);
    }
  }
  return reached;
}

describe('object-event-extension', () => {
  beforeEach(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('markForChanged', () => {
    it('fires a change in a batch', async () => {
      const obj = new ObjectNode();
      obj.initialize();

      const callback = vi.fn();
      const sub = objectChanged$.subscribe(callback);

      markForChanged(obj);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toEqual(expect.objectContaining({ identifier: obj.identifier }));
      sub();
    });

    it('tells a change this seat made as its own, though the seat’s peer changes before the notice goes out', async () => {
      const obj = new ObjectNode();
      obj.initialize();
      const peer = vi.spyOn(Network, 'peerId', 'get').mockReturnValue('this-seat');
      const callback = vi.fn();
      const sub = objectChanged$.subscribe(callback);

      markForChanged(obj);
      markForChanged(new ObjectNode(), 'another-seat');
      peer.mockReturnValue('???');

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(callback.mock.calls.map(([event]) => event.isSendFromSelf)).toEqual([true, false]);
      sub();
    });
  });

  describe('markForChildrenChanged', () => {
    it('fires a children change in a batch', async () => {
      const parent = new ObjectNode();
      parent.initialize();
      const child = new ObjectNode();
      child.initialize();
      parent.appendChild(child);

      const callback = vi.fn();
      const sub = childrenChanged$.subscribe(callback);

      markForChildrenChanged(parent);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toEqual(expect.objectContaining({ identifier: parent.identifier }));
      sub();
    });
  });

  it('is reached from neither of the classes it hooks, so whichever loads first, it hooks a class already made', () => {
    for (const hooked of ['core/sync/game-object', 'core/sync/object-node']) {
      expect([...reachedFrom(hooked)]).not.toContain('core/sync/object-event-extension');
    }
  });
});
