import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import {
  BufferSharingTask,
  TRANSFER_TIMEOUT_MAX_MS,
  TRANSFER_TIMEOUT_MIN_MS,
  transferTimeoutMs,
} from '@axe/core/storage/buffer-sharing-task';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
import type { MockInstance } from 'vitest';

describe('BufferSharingTask', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSendTask', () => {
    it('can start a send', () => {
      const task = BufferSharingTask.createSendTask('test-id', 'peer-1', { foo: 'bar' });
      expect(task).toBeDefined();
      expect(task.identifier).toBe('test-id');
      expect(task.sendTo).toBe('peer-1');
    });

    it('cuts a megabyte into sixteen chunks of 64KB', () => {
      const task = BufferSharingTask.createSendTask('megabyte', 'peer-1');
      task.start(new Uint8Array(1024 * 1024 - 16));
      const internal = task as unknown as { chunks: unknown[]; chunkSize: number };

      expect(internal.chunkSize).toBe(64 * 1024);
      expect(internal.chunks).toHaveLength(16);
      task.cancel();
    });
  });

  describe('createReceiveTask', () => {
    it('can start a receive', () => {
      const task = BufferSharingTask.createReceiveTask('recv-id');
      expect(task).toBeDefined();
      expect(task.identifier).toBe('recv-id');
    });

    it('starts with its optional fields empty', () => {
      const task = BufferSharingTask.createReceiveTask('recv-id');
      const internal = task as unknown as Record<string, unknown>;

      expect(internal['data']).toBeNull();
      expect(internal['uint8Array']).toBeNull();
      expect(internal['sendChunkTimer']).toBeNull();
      expect(internal['timeoutTimer']).toBeNull();
    });
  });

  describe('cancel', () => {
    it('finishes after being cancelled', () => {
      const task = BufferSharingTask.createSendTask('cancel-id', 'peer-2', { a: 1 });
      const finishFn = vi.fn();
      const cancelFn = vi.fn();
      task.onfinish = finishFn;
      task.oncancel = cancelFn;

      task.start({ a: 1 });
      task.cancel();

      expect(cancelFn).toHaveBeenCalled();
      expect(finishFn).toHaveBeenCalled();
    });

    it('survives being cancelled twice', () => {
      const task = BufferSharingTask.createSendTask('double-cancel', 'peer-3');
      task.onfinish = vi.fn();
      task.oncancel = vi.fn();
      task.start({});
      task.cancel();
      task.cancel(); // the second call
      expect(task.oncancel).toBeNull();
    });
  });

  describe('how long the next piece is waited for', () => {
    it('is ten seconds while pieces come quickly', () => {
      expect(transferTimeoutMs(null)).toBe(TRANSFER_TIMEOUT_MIN_MS);
      expect(transferTimeoutMs(200)).toBe(TRANSFER_TIMEOUT_MIN_MS);
      expect(TRANSFER_TIMEOUT_MIN_MS).toBe(10_000);
    });

    it('is four times what the last piece took on a slow line, up to a minute', () => {
      expect(transferTimeoutMs(5_000)).toBe(20_000);
      expect(transferTimeoutMs(8_000)).toBe(32_000);
      expect(transferTimeoutMs(40_000)).toBe(TRANSFER_TIMEOUT_MAX_MS);
      expect(TRANSFER_TIMEOUT_MAX_MS).toBe(60_000);
    });
  });

  describe('a transfer over the network', () => {
    let send: MockInstance<Network['send']>;

    const sentNames = () => send.mock.calls.map(([context]) => (context as { eventName: string }).eventName);
    const piece = (identifier: string, index: number, length: number) =>
      localDispatch(`FILE_SEND_CHUNK_${identifier}`, { index, length, chunk: new Uint8Array([index]) }, 'peer-1');
    const ack = (identifier: string, index: number) => localDispatch(`FILE_MORE_CHUNK_${identifier}`, index, 'peer-1');

    /** A send task that has sent as far ahead of the acks as it goes, and waits for one. */
    async function sendingTask(identifier: string) {
      const task = BufferSharingTask.createSendTask<Uint8Array>(identifier, 'peer-1');
      const timedOut = vi.fn();
      task.ontimeout = timedOut;
      task.start(new Uint8Array(10 * 64 * 1024));
      for (let n = 0; n < 8; n++) await waitZeroTimeout();
      return { task, timedOut };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('sends four pieces ahead of the acks and no further', async () => {
      const { task } = await sendingTask('ahead');

      expect(sentNames()).toEqual(Array.from({ length: 5 }, () => 'FILE_SEND_CHUNK_ahead'));
      task.cancel();
    });

    it('sends no piece once it is cancelled before its first has gone', async () => {
      const task = BufferSharingTask.createSendTask<Uint8Array>('called-off-early', 'peer-1');
      task.start(new Uint8Array(10 * 64 * 1024));
      task.cancel();
      for (let n = 0; n < 8; n++) await waitZeroTimeout();

      expect(sentNames()).toEqual(['CANCEL_TASK_called-off-early']);
    });

    describe('being received', () => {
      it('gives the transfer up when no piece comes for ten seconds', () => {
        const task = BufferSharingTask.createReceiveTask('silent');
        const timedOut = vi.fn();
        task.ontimeout = timedOut;
        task.start();

        vi.advanceTimersByTime(TRANSFER_TIMEOUT_MIN_MS - 1);
        expect(timedOut).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(timedOut).toHaveBeenCalledTimes(1);
      });

      it('waits afresh each time a piece comes', () => {
        const task = BufferSharingTask.createReceiveTask('steady');
        const timedOut = vi.fn();
        task.ontimeout = timedOut;
        task.start();

        for (let index = 0; index < 5; index++) {
          vi.advanceTimersByTime(2_000);
          piece('steady', index, 10);
        }
        vi.advanceTimersByTime(TRANSFER_TIMEOUT_MIN_MS - 1);

        expect(timedOut).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(timedOut).toHaveBeenCalledTimes(1);
      });

      it('waits four times as long as the last piece took when that is longer than ten seconds', () => {
        const task = BufferSharingTask.createReceiveTask('slow');
        const timedOut = vi.fn();
        task.ontimeout = timedOut;
        task.start();

        vi.advanceTimersByTime(8_000);
        piece('slow', 0, 10);
        vi.advanceTimersByTime(32_000 - 1);
        expect(timedOut).not.toHaveBeenCalled();

        piece('slow', 1, 10);
        vi.advanceTimersByTime(TRANSFER_TIMEOUT_MAX_MS - 1);
        expect(timedOut).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(timedOut).toHaveBeenCalledTimes(1);
      });

      it('goes back to ten seconds once pieces come quickly again', () => {
        const task = BufferSharingTask.createReceiveTask('recovered');
        const timedOut = vi.fn();
        task.ontimeout = timedOut;
        task.start();

        vi.advanceTimersByTime(8_000);
        piece('recovered', 0, 10);
        vi.advanceTimersByTime(100);
        piece('recovered', 1, 10);
        vi.advanceTimersByTime(TRANSFER_TIMEOUT_MIN_MS);

        expect(timedOut).toHaveBeenCalledTimes(1);
      });

      it('asks for more after each piece but the last', () => {
        const task = BufferSharingTask.createReceiveTask<number[]>('asking');
        task.start();

        piece('asking', 0, 3);
        piece('asking', 1, 3);

        expect(sentNames()).toEqual(['FILE_MORE_CHUNK_asking', 'FILE_MORE_CHUNK_asking']);
        task.cancel();
      });

      it('is called off by a cancellation that overtakes the pieces still to come, which are then let pass', () => {
        const task = BufferSharingTask.createReceiveTask('called-off');
        const finished = vi.fn();
        const cancelled = vi.fn();
        const timedOut = vi.fn();
        task.onfinish = finished;
        task.oncancel = cancelled;
        task.ontimeout = timedOut;
        task.start();
        piece('called-off', 0, 4);

        localDispatch('CANCEL_TASK_called-off', null, 'peer-1');
        send.mockClear();

        expect(() => {
          piece('called-off', 1, 4);
          piece('called-off', 2, 4);
          piece('called-off', 3, 4);
        }).not.toThrow();
        vi.advanceTimersByTime(TRANSFER_TIMEOUT_MAX_MS * 2);

        expect(cancelled).toHaveBeenCalledTimes(1);
        expect(finished).toHaveBeenCalledTimes(1);
        expect(timedOut).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
      });
    });

    describe('being sent', () => {
      it('gives the transfer up when no ack comes for ten seconds', async () => {
        const { timedOut } = await sendingTask('unheard');

        vi.advanceTimersByTime(TRANSFER_TIMEOUT_MIN_MS - 1);
        expect(timedOut).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(timedOut).toHaveBeenCalledTimes(1);
      });

      it('waits afresh each time an ack comes', async () => {
        const { task, timedOut } = await sendingTask('acked');

        for (let index = 0; index < 3; index++) {
          vi.advanceTimersByTime(2_000);
          ack('acked', index);
        }
        vi.advanceTimersByTime(TRANSFER_TIMEOUT_MIN_MS - 1);

        expect(timedOut).not.toHaveBeenCalled();
        task.cancel();
      });

      it('waits four times as long as the last ack took when that is longer than ten seconds', async () => {
        const { timedOut } = await sendingTask('slowly-acked');

        vi.advanceTimersByTime(8_000);
        ack('slowly-acked', 0);
        vi.advanceTimersByTime(32_000 - 1);
        expect(timedOut).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(timedOut).toHaveBeenCalledTimes(1);
      });
    });
  });
});
