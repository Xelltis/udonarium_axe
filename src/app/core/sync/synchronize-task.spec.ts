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

    it('can be created with requests', () => {
      const requests: SynchronizeRequest[] = [{ identifier: 'obj1', version: 1, holderIds: ['peer1'], ttl: 3 }];
      const task = SynchronizeTask.create('test-peer', requests);
      expect(task).toBeTruthy();
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
