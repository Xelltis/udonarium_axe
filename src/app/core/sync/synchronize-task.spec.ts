import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import { SynchronizeRequest, SynchronizeTask } from '@axe/core/sync/synchronize-task';

describe('SynchronizeTask', () => {
  describe('create', () => {
    it('finishes at once when created with nothing to ask for', () => {
      return new Promise<void>((resolve) => {
        const task = SynchronizeTask.create('test-peer', []);
        task.onfinish = () => {
          resolve();
        };
      });
    });

    it('asks the peer for what it holds and the room for the rest, spending one ttl on each', () => {
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const requests: SynchronizeRequest[] = [
        { identifier: 'held', version: 1, holderIds: ['test-peer'], ttl: 3 },
        { identifier: 'elsewhere', version: 1, holderIds: ['peer1'], ttl: 3 },
      ];

      SynchronizeTask.create('test-peer', requests);

      expect(send.mock.calls.map(([context, sendTo]) => [...Object.values(context as object), sendTo])).toEqual([
        ['REQUEST_GAME_OBJECT', 'held', Network.peerId, 'test-peer'],
        ['REQUEST_GAME_OBJECT', 'elsewhere', Network.peerId, undefined],
      ]);
      expect(requests.map((request) => request.ttl)).toEqual([2, 2]);

      localDispatch('DISCONNECT_PEER', { peerId: 'test-peer' }, 'test-peer');
      vi.restoreAllMocks();
    });
  });

  describe('what is still to arrive', () => {
    afterEach(() => vi.restoreAllMocks());

    it('counts the objects asked for that have not arrived, down to none', () => {
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const task = SynchronizeTask.create('test-peer', [
        { identifier: 'first', version: 1, holderIds: ['test-peer'], ttl: 3 },
        { identifier: 'second', version: 1, holderIds: ['test-peer'], ttl: 3 },
      ]);
      expect(task.pendingCount).toBe(2);

      localDispatch('UPDATE_GAME_OBJECT', { identifier: 'first' }, 'test-peer');
      expect(task.pendingCount).toBe(1);

      localDispatch('UPDATE_GAME_OBJECT', { identifier: 'second' }, 'test-peer');
      expect(task.pendingCount).toBe(0);
    });
  });

  describe('running out of time', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('hands back what may be asked again apart from what has used up its ttl', () => {
      vi.useFakeTimers();
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const task = SynchronizeTask.create('test-peer', [
        { identifier: 'once-more', version: 1, holderIds: ['test-peer'], ttl: 1 },
        { identifier: 'used-up', version: 1, holderIds: ['test-peer'], ttl: 0 },
      ]);
      const timedOut: string[][] = [];
      task.ontimeout = (_task, remained, givenUp) =>
        timedOut.push(
          remained.map((request) => request.identifier),
          givenUp.map((request) => request.identifier)
        );

      vi.advanceTimersByTime(30_000);

      expect(timedOut).toEqual([['once-more'], ['used-up']]);
    });
  });

  describe('answers from a room server', () => {
    it('counts the server’s own word on an object, and its taking one away, as answers', () => {
      return new Promise<void>((resolve) => {
        const task = SynchronizeTask.create('@authority', [
          { identifier: 'shown', version: 1, holderIds: ['@authority'], ttl: 2 },
          { identifier: 'hidden', version: 1, holderIds: ['@authority'], ttl: 2 },
        ]);
        task.onfinish = () => resolve();

        localDispatch('AUTHORITATIVE_OBJECT', { identifier: 'shown' }, '@authority');
        localDispatch('WITHDRAW_GAME_OBJECT', { identifier: 'hidden' }, '@authority');
      });
    });
  });
});
