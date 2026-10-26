import { readPersonalFolders, writePersonalFolders } from '@axe/application/inventory/personal-folders';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  } as unknown as Storage;
}

describe('readPersonalFolders()', () => {
  it('finds none where nothing is stored', () => {
    expect(readPersonalFolders(fakeStorage(), 'room')).toEqual([]);
  });

  it('finds none where there is nowhere to store them', () => {
    expect(readPersonalFolders(null, 'room')).toEqual([]);
  });

  it('reads back what was written', () => {
    const storage = fakeStorage();

    writePersonalFolders(storage, 'room', ['第1話', '第1話/洞窟']);

    expect(readPersonalFolders(storage, 'room')).toEqual(['第1話', '第1話/洞窟']);
  });

  it('keeps one room out of another', () => {
    const storage = fakeStorage();

    writePersonalFolders(storage, 'room-a', ['第1話']);

    expect(readPersonalFolders(storage, 'room-b')).toEqual([]);
    expect(readPersonalFolders(storage, 'room-a')).toEqual(['第1話']);
  });

  it('ignores stored rubbish rather than throwing', () => {
    expect(readPersonalFolders(fakeStorage({ 'axe.inventory.personal-folders.room': '{oops' }), 'room')).toEqual([]);
  });

  it('ignores anything stored that is not a folder', () => {
    const storage = fakeStorage({ 'axe.inventory.personal-folders.room': '["第1話", 3, "", null]' });

    expect(readPersonalFolders(storage, 'room')).toEqual(['第1話']);
  });
});

describe('writePersonalFolders()', () => {
  it('has nowhere to write and carries on', () => {
    expect(() => writePersonalFolders(null, 'room', ['第1話'])).not.toThrow();
  });

  it('carries on when the browser refuses to store', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage;

    expect(() => writePersonalFolders(storage, 'room', ['第1話'])).not.toThrow();
  });
});
