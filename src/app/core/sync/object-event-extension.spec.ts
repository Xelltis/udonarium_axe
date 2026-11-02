import { Network } from '@axe/core/network/network';
import {
  childrenChanged$,
  markForChanged,
  markForChildrenChanged,
  objectAdded$,
  objectChanged$,
  objectRemoved$,
} from '@axe/core/sync/object-event-extension';
import { ObjectNode } from '@axe/core/sync/object-node';

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

  describe('objectAdded$', () => {
    it('is exposed as a subject', () => {
      expect(objectAdded$).toBeTruthy();
      expect(typeof objectAdded$.subscribe).toBe('function');
    });
  });

  describe('objectRemoved$', () => {
    it('is exposed as a subject', () => {
      expect(objectRemoved$).toBeTruthy();
      expect(typeof objectRemoved$.subscribe).toBe('function');
    });
  });
});
