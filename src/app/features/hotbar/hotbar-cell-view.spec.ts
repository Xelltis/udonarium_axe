import { GameCharacter } from '@axe/domain/character/game-character';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import {
  bindsCharacter,
  emptyCellView,
  HotbarCellContext,
  hotbarCellView,
  namedCharacter,
} from '@axe/features/hotbar/hotbar-cell-view';

describe('hotbar cell view', () => {
  let scout: GameCharacter;
  let speaker: GameCharacter;

  function slotFor(fields: Record<string, unknown>): HotbarSlot {
    const slot = new HotbarSlot();
    slot.initialize();
    Object.assign(slot, { kind: 'chat', payload: '', label: '', icon: '', color: '', valueName: '' }, fields);
    return slot;
  }

  function context(overrides: Partial<HotbarCellContext> = {}): HotbarCellContext {
    return {
      controllable: [scout],
      speaker,
      referencedName: () => '',
      keyOf: (index) => `${(index + 1) % 10}`,
      ...overrides,
    };
  }

  beforeEach(() => {
    scout = GameCharacter.create('斥候', 1, '');
    speaker = GameCharacter.create('語り手', 1, '');
  });

  it('describes an empty slot as an empty cell that still knows its key', () => {
    expect(emptyCellView(3, '4')).toEqual({
      slotIndex: 3,
      slot: null,
      label: '',
      icon: '',
      color: '',
      needsCharacter: false,
      key: '4',
      actor: null,
      actorName: '',
    });
    expect(hotbarCellView(null, 9, context())).toEqual(emptyCellView(9, '0'));
  });

  it('knows a slot that names a piece from one that speaks as whoever is speaking', () => {
    expect(bindsCharacter(slotFor({ characterIdentifier: '', characterName: '  ' }))).toBe(false);
    expect(bindsCharacter(slotFor({ characterName: '斥候' }))).toBe(true);
    expect(bindsCharacter(slotFor({ characterIdentifier: scout.identifier }))).toBe(true);
  });

  it('acts as the piece it names', () => {
    const slot = slotFor({ characterIdentifier: scout.identifier, characterName: '斥候' });

    const cell = hotbarCellView(slot, 0, context());

    expect(cell.actor).toBe(scout);
    expect(cell.actorName).toBe('斥候');
    expect(cell.key).toBe('1');
  });

  it('names the piece it acts as by the name the reader is shown', () => {
    const slot = slotFor({ characterIdentifier: scout.identifier, characterName: '斥候' });

    const cell = hotbarCellView(slot, 0, context({ nameOf: () => '？？？' }));

    expect(cell.actor).toBe(scout);
    expect(cell.actorName).toBe('？？？');
  });

  it('acts as nobody when the piece it names is not one this reader may work', () => {
    const slot = slotFor({ characterIdentifier: 'gone', characterName: '居ない人' });

    const cell = hotbarCellView(slot, 0, context());

    expect(cell.actor).toBeNull();
    expect(cell.actorName).toBe('居ない人');
  });

  it('acts as whoever is speaking when it names nobody', () => {
    const cell = hotbarCellView(slotFor({}), 0, context());

    expect(cell.actor).toBe(speaker);
    expect(cell.actorName).toBe('');
  });

  it('finds the piece a slot names again by its name', () => {
    const slot = slotFor({ characterIdentifier: 'stale', characterName: '斥候' });

    expect(namedCharacter(slot, [scout])).toBe(scout);
    expect(namedCharacter(slotFor({}), [scout])).toBeNull();
  });

  it('labels a slot from what it points at when it has no label of its own', () => {
    const slot = slotFor({ kind: 'cutIn', payload: 'cut-9', valueName: '旧い名' });

    const cell = hotbarCellView(slot, 1, context({ referencedName: () => '新しい名' }));

    expect(cell.label).toBe('新しい名');
  });
});
