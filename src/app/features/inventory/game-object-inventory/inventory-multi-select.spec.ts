import { GameCharacter } from '@axe/domain/character/game-character';
import { SoundEffect } from '@axe/domain/media/sound-effect';
import {
  InventoryMultiSelect,
  InventoryMultiSelectHost,
} from '@axe/features/inventory/game-object-inventory/inventory-multi-select';

describe('InventoryMultiSelect', () => {
  let goblin: GameCharacter;
  let orc: GameCharacter;
  let host: { [K in keyof InventoryMultiSelectHost]: ReturnType<typeof vi.fn> };
  let multi: InventoryMultiSelect;

  beforeEach(() => {
    vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);
    goblin = GameCharacter.create('ゴブリン', 1, '');
    orc = GameCharacter.create('オーク', 1, '');
    goblin.setLocation('graveyard');
    orc.setLocation('common');
    const pieces = new Map([
      [goblin.identifier, goblin],
      [orc.identifier, orc],
    ]);
    host = {
      canEdit: vi.fn(() => true),
      listedIdentifiers: vi.fn(() => [goblin.identifier, orc.identifier]),
      objectOf: vi.fn((identifier: string) => pieces.get(identifier)),
      setResourceSliders: vi.fn(),
      notifyInventoryUpdate: vi.fn(),
      confirmDelete: vi.fn(async () => true),
      delete: vi.fn(),
    };
    multi = new InventoryMultiSelect(host as unknown as InventoryMultiSelectHost);
  });

  afterEach(() => {
    goblin.destroy();
    orc.destroy();
    vi.restoreAllMocks();
  });

  function checkbox(checked: boolean): Event {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    const event = new Event('change');
    Object.defineProperty(event, 'target', { value: input });
    return event;
  }

  it('drops every pick on the way out', () => {
    multi.toggle();
    multi.pick([goblin.identifier]);
    expect(multi.active()).toBe(true);

    multi.toggle();

    expect(multi.active()).toBe(false);
    expect(multi.targets().size).toBe(0);
  });

  it('picks and unpicks a piece from its checkbox, and flips one from its row', () => {
    multi.setPickedFrom(checkbox(true), goblin);
    expect([...multi.targets()]).toEqual([goblin.identifier]);

    multi.setPickedFrom(checkbox(false), goblin);
    expect(multi.targets().size).toBe(0);

    multi.flip(orc.identifier);
    expect(multi.targets().has(orc.identifier)).toBe(true);
    multi.flip(orc.identifier);
    expect(multi.targets().has(orc.identifier)).toBe(false);
  });

  it('picks every listed row when none is picked, and unpicks them all when any is', () => {
    multi.pick(['elsewhere']);

    multi.flipListed();
    expect(multi.anyListedPicked()).toBe(true);
    expect([...multi.targets()].sort()).toEqual(['elsewhere', goblin.identifier, orc.identifier].sort());

    multi.flipListed();
    expect(multi.anyListedPicked()).toBe(false);
    expect([...multi.targets()]).toEqual(['elsewhere']);
  });

  it('moves the picked characters and leaves multi-select, but moves nothing for a seat that may not edit', () => {
    multi.toggle();
    multi.pick([goblin.identifier, 'not-a-piece']);
    host.canEdit.mockReturnValue(false);
    multi.move('table');
    expect(goblin.location.name).toBe('graveyard');

    host.canEdit.mockReturnValue(true);
    multi.moveAndClose('table');

    expect(goblin.location.name).toBe('table');
    expect(orc.location.name).toBe('common');
    expect(multi.active()).toBe(false);
  });

  it('hides the picked pieces from the inventory and tells it so', () => {
    multi.toggle();
    multi.pick([orc.identifier]);

    multi.setHideInventory(true);

    expect(orc.hideInventory).toBe(true);
    expect(goblin.hideInventory).toBe(false);
    expect(host.notifyInventoryUpdate).toHaveBeenCalledTimes(1);
    expect(multi.active()).toBe(false);
  });

  it('gives the picked pieces their sliders', () => {
    multi.toggle();
    multi.pick([orc.identifier]);

    multi.setResourceSliders(true);

    expect(host.setResourceSliders).toHaveBeenCalledWith(orc, true);
    expect(multi.active()).toBe(false);
  });

  it('deletes only the picks in the graveyard, once confirmed, and stays in multi-select otherwise', async () => {
    multi.toggle();
    multi.pick([orc.identifier]);
    await multi.deleteAndClose();
    expect(host.confirmDelete).not.toHaveBeenCalled();
    expect(multi.active()).toBe(true);

    multi.pick([goblin.identifier]);
    host.confirmDelete.mockResolvedValueOnce(false);
    await multi.deleteAndClose();
    expect(host.delete).not.toHaveBeenCalled();
    expect(multi.active()).toBe(true);

    await multi.deleteAndClose();
    expect(host.confirmDelete).toHaveBeenLastCalledWith(1);
    expect(host.delete.mock.calls).toEqual([[goblin]]);
    expect(multi.active()).toBe(false);
  });

  it('takes pieces moved away out of the picks', () => {
    multi.pick([goblin.identifier, orc.identifier]);

    multi.drop(new Set([goblin.identifier]));

    expect([...multi.targets()]).toEqual([orc.identifier]);
  });
});
