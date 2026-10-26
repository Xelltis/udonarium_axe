import { ObjectStore } from '@axe/core/sync/object-store';
import { restoreStore, snapshotStore } from '@axe/core/sync/store-snapshot';
import { DataElement } from '@axe/domain/data/data-element';

describe('putting the store back as a snapshot found it', () => {
  const store = ObjectStore.instance;
  const made: DataElement[] = [];
  const element = (name: string, value: string, identifier: string) => {
    const created = DataElement.create(name, value, {}, identifier);
    made.push(created);
    return created;
  };

  afterEach(() => {
    for (const created of made.splice(0)) store.get(created.identifier)?.destroy();
    store.clearDeleteHistory();
  });

  it('takes out what was added since, without a word to the room', () => {
    const snapshot = snapshotStore();
    const added = element('HP', '10', 'added-since');
    const parent = element('能力', '', 'added-parent');
    const child = element('DEX', '3', 'added-child');
    parent.appendChild(child);

    restoreStore(snapshot, () => false);

    expect(store.get(added.identifier)).toBeNull();
    expect(store.get(parent.identifier)).toBeNull();
    expect(store.get(child.identifier)).toBeNull();
  });

  it('puts back what changed since, version and all', () => {
    const kept = element('HP', '10', 'changed-since');
    const snapshot = snapshotStore();
    const version = kept.version;

    kept.value = '99';
    restoreStore(snapshot, () => false);

    expect(kept.value).toBe('10');
    expect(kept.version).toBe(version);
  });

  it('makes again what was taken out since, under its name and version', () => {
    const gone = element('HP', '10', 'taken-out-since');
    const snapshot = snapshotStore();
    const version = gone.version;

    gone.destroy();
    restoreStore(snapshot, () => false);

    const back = store.get<DataElement>('taken-out-since');
    expect(back?.value).toBe('10');
    expect(back?.version).toBe(version);
  });

  it('leaves what is to be kept, and what sits under it, as it is now', () => {
    const snapshot = snapshotStore();
    const seat = element('bar', '', 'kept-parent');
    const slot = element('slot', '1', 'kept-child');
    seat.appendChild(slot);

    restoreStore(snapshot, (object) => object.identifier === 'kept-parent');

    expect(store.get(seat.identifier)).toBe(seat);
    expect(store.get(slot.identifier)).toBe(slot);
  });
});
