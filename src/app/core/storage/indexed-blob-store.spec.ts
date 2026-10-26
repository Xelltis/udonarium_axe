import { StartRoomStore } from '@axe/core/storage/start-room-store';

/** An open the spec answers by hand. */
interface PendingOpen {
  result?: unknown;
  error?: unknown;
  onupgradeneeded?: () => void;
  onsuccess?: () => void;
  onerror?: () => void;
}

/** A database handle that answers every count with nothing found and notes whether it was closed. */
function handle(): { db: IDBDatabase; closed: () => boolean } {
  let closed = false;
  const db = {
    objectStoreNames: { contains: () => true },
    close: () => {
      closed = true;
    },
    transaction: () => {
      const transaction: { oncomplete?: () => void; error: null; objectStore: () => unknown } = {
        error: null,
        objectStore: () => ({
          count: () => {
            queueMicrotask(() => transaction.oncomplete?.());
            return { result: 0 };
          },
        }),
      };
      return transaction;
    },
  } as unknown as IDBDatabase;
  return { db, closed: () => closed };
}

describe('where a browser store keeps its files', () => {
  const store = StartRoomStore.instance;
  let opens: PendingOpen[];
  let refuseNext: boolean;

  beforeEach(() => {
    opens = [];
    refuseNext = false;
    store.reset();
    vi.stubGlobal('indexedDB', {
      open: () => {
        if (refuseNext) {
          refuseNext = false;
          throw new DOMException('refused', 'SecurityError');
        }
        const request: PendingOpen = {};
        opens.push(request);
        return request;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    store.reset();
  });

  it('cannot say what it holds where the browser refuses it outright, and asks afresh on the next use', async () => {
    refuseNext = true;

    expect(await store.has(StartRoomStore.KEY)).toBeNull();

    const asking = store.has(StartRoomStore.KEY);
    const { db } = handle();
    opens[0].result = db;
    opens[0].onsuccess?.();
    expect(await asking).toBe(false);
  });

  it('gives up on an open left unanswered, and opens afresh on the next use', async () => {
    vi.useFakeTimers();
    const asking = store.has(StartRoomStore.KEY);
    await vi.advanceTimersByTimeAsync(5000);

    expect(await asking).toBeNull();
    void store.has(StartRoomStore.KEY);
    expect(opens).toHaveLength(2);
  });

  it('leaves the open made since alone when the one given up on fails at last, and closes one that comes at last', async () => {
    vi.useFakeTimers();
    void store.has(StartRoomStore.KEY);
    await vi.advanceTimersByTimeAsync(5000);
    void store.has(StartRoomStore.KEY);
    expect(opens).toHaveLength(2);

    opens[0].onerror?.();
    void store.has(StartRoomStore.KEY);
    expect(opens).toHaveLength(2);

    const late = handle();
    opens[0].result = late.db;
    opens[0].onsuccess?.();
    expect(late.closed()).toBe(true);
  });
});
