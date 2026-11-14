import { TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { StatusAilment } from '@axe/domain/character/status-ailment';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { buildInventoryRow } from '@axe/features/inventory/game-object-inventory/inventory-list';
import { InventoryTableColumn } from '@axe/features/inventory/game-object-inventory/inventory-table';
import { InventoryTableView } from '@axe/features/inventory/game-object-inventory/inventory-table-view';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('InventoryTableView', () => {
  let hero: GameCharacter;
  let goblin: GameCharacter;
  let ailments: StatusAilmentService;
  const poison = { name: '毒', color: '#00aa00', icon: '' } as StatusAilment;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    hero = GameCharacter.create('勇者', 1, '');
    goblin = GameCharacter.create('ゴブリン', 1, '');
    ailments = TestBed.inject(StatusAilmentService);
    Object.defineProperty(ailments, 'ailments', { value: () => [poison], configurable: true });
  });

  afterEach(() => {
    hero.destroy();
    goblin.destroy();
    vi.restoreAllMocks();
  });

  function setup(pieces: GameCharacter[] = [hero, goblin]) {
    const rows = pieces.map((piece) => buildInventoryRow(piece, ''));
    return TestBed.runInInjectionContext(() => new InventoryTableView({ rows: () => rows }));
  }

  it('lays the listed pieces out one row apiece, with a column for each display item and each status', () => {
    vi.spyOn(TestBed.inject(GameObjectInventoryService), 'tableDataTags', 'get').mockReturnValue(['HP', '毒']);

    const table = setup().table();

    expect(table.rows.map((row) => row.object)).toEqual([hero, goblin]);
    expect(table.columns.map((column) => column.name)).toEqual(['HP', '毒']);
    expect(table.columns.find((column) => column.name === '毒')?.ailment).toBe(poison);
    const hp = table.columns.findIndex((column) => column.name === 'HP');
    expect(table.rows[0].cells[hp].element?.name).toBe('HP');
  });

  it('colours the heading of a status column, and no other', () => {
    const view = setup();

    expect(view.ailmentSwatch({ name: '毒', ailment: poison } as InventoryTableColumn)).not.toBe('transparent');
    expect(view.ailmentSwatch({ name: 'HP', ailment: null } as InventoryTableColumn)).toBe('transparent');
    expect(view.ailmentIconUrl({ name: 'HP', ailment: null } as InventoryTableColumn)).toBe('');
  });

  it('says whether a status is on a character, and never on anything else', () => {
    const isOn = vi.spyOn(ailments, 'isOn').mockReturnValue(true);
    const note = TextNote.create('メモ', '');
    const view = setup();

    try {
      expect(view.isAilmentOn(hero, poison)).toBe(true);
      expect(isOn).toHaveBeenCalledWith(hero, '毒');
      expect(view.isAilmentOn(note, poison)).toBe(false);
    } finally {
      note.destroy();
    }
  });

  it('puts a status on a character or takes it off from its box, without the press reaching the row', () => {
    const toggle = vi.spyOn(ailments, 'toggle').mockImplementation(() => undefined);
    const view = setup();
    const press = (checked: boolean) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = checked;
      const event = new Event('change');
      Object.defineProperty(event, 'target', { value: box });
      const stopped = vi.spyOn(event, 'stopPropagation');
      return { event, stopped };
    };
    const on = press(true);
    const off = press(false);
    const note = TextNote.create('メモ', '');

    try {
      view.toggleAilment(on.event, hero, poison);
      view.toggleAilment(off.event, hero, poison);
      view.toggleAilment(press(true).event, note, poison);

      expect(toggle.mock.calls).toEqual([
        [hero, poison, true],
        [hero, poison, false],
      ]);
      expect(on.stopped).toHaveBeenCalledTimes(1);
    } finally {
      note.destroy();
    }
  });
});
