import { APP_DATABASES } from '@axe/core/storage/app-database-names';
import {
  requestBrowserDataWipe,
  wipeBrowserData,
  wipeBrowserDataIfRequested,
} from '@axe/core/storage/browser-data-wipe';

interface FakeDeleteRequest {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  error: unknown;
}

/** An IndexedDB that holds the named databases and lets each be deleted, or not, as the test says. */
function fakeIndexedDb(held: string[], options: { lists?: boolean; blocked?: string[] } = {}) {
  const deleted: string[] = [];
  const factory = {
    deleteDatabase: vi.fn((name: string) => {
      const request: FakeDeleteRequest = { onsuccess: null, onerror: null, error: null };
      if (!options.blocked?.includes(name)) {
        queueMicrotask(() => {
          deleted.push(name);
          request.onsuccess?.();
        });
      }
      return request;
    }),
    ...(options.lists === false ? {} : { databases: vi.fn(async () => held.map((name) => ({ name, version: 1 }))) }),
  };
  vi.stubGlobal('indexedDB', factory);
  return { factory, deleted };
}

describe('wiping this browser’s data', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does nothing on a load nobody asked to wipe', async () => {
    const { factory } = fakeIndexedDb(['axe-room-snapshots']);
    localStorage.setItem('ui-theme', 'dark');

    expect(await wipeBrowserDataIfRequested()).toBe(false);

    expect(localStorage.getItem('ui-theme')).toBe('dark');
    expect(factory.deleteDatabase).not.toHaveBeenCalled();
  });

  it('throws everything away on the load after it was asked for, and only once', async () => {
    const { deleted } = fakeIndexedDb(['axe-room-snapshots', 'axe-replay-logs', 'someone-else']);
    localStorage.setItem('ui-theme', 'dark');
    sessionStorage.setItem('identity', 'x');

    expect(requestBrowserDataWipe()).toBe(true);
    expect(await wipeBrowserDataIfRequested()).toBe(true);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(deleted).toEqual(expect.arrayContaining([...APP_DATABASES, 'someone-else']));
    expect(await wipeBrowserDataIfRequested()).toBe(false);
  });

  it('still deletes the app’s own databases where the browser cannot list them', async () => {
    const { deleted } = fakeIndexedDb([], { lists: false });

    await wipeBrowserData();

    expect(deleted.sort()).toEqual([...APP_DATABASES].sort());
  });

  it('goes on without a database another tab holds open', async () => {
    vi.useFakeTimers();
    const { deleted } = fakeIndexedDb(APP_DATABASES, { blocked: ['axe-replay-logs'] });

    const wiping = wipeBrowserData();
    await vi.advanceTimersByTimeAsync(5000);
    await wiping;

    expect(deleted).not.toContain('axe-replay-logs');
    expect(deleted).toContain('axe-room-snapshots');
  });

  it('clears the storage even where there is no IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    localStorage.setItem('ui-theme', 'dark');

    await wipeBrowserData();

    expect(localStorage.length).toBe(0);
  });
});
