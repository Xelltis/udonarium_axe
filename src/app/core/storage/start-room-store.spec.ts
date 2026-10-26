import { DiceImageStore } from '@axe/core/storage/dice-image-store';
import { StartRoomStore } from '@axe/core/storage/start-room-store';

describe('where the room this browser starts on is kept', () => {
  const store = StartRoomStore.instance;

  afterEach(() => {
    vi.restoreAllMocks();
    store.reset();
  });

  it('is one store, however many ask for it, and not the dice pictures’', () => {
    expect(StartRoomStore.instance).toBe(store);
    expect(store).not.toBe(DiceImageStore.instance as unknown);
  });

  it('keeps nothing where the browser has nowhere to put it', async () => {
    vi.spyOn(store, 'isAvailable').mockReturnValue(false);

    expect(await store.get(StartRoomStore.KEY)).toBeNull();
    expect(await store.put(StartRoomStore.KEY, new Blob(['zip']))).toBe(false);
    expect(await store.remove(StartRoomStore.KEY)).toBe(false);
  });
});
