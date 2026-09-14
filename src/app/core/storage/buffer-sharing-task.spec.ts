import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';

const mocks = vi.hoisted(() => {
  return {
    networkSend: vi.fn(),
    networkMessage$: { subscribe: () => () => {} },
  };
});

vi.mock('@axe/core/network/network-messaging', () => ({
  networkSend: mocks.networkSend,
  networkMessage$: mocks.networkMessage$,
}));

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
      task.cancel(); // 二重呼出
      expect(task.oncancel).toBeNull();
    });
  });
});
