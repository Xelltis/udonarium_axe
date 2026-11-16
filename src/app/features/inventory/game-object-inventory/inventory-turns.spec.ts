import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { buildInventoryRow } from '@axe/features/inventory/game-object-inventory/inventory-list';
import { InventoryTableRow } from '@axe/features/inventory/game-object-inventory/inventory-table';
import { InventoryTurns, InventoryTurnsHost } from '@axe/features/inventory/game-object-inventory/inventory-turns';
import { InventoryRoundService, InventoryRoundSide } from '@axe/features/inventory/inventory-round.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('InventoryTurns', () => {
  let hero: GameCharacter;
  let goblin: GameCharacter;
  let bystander: GameCharacter;
  let round: InventoryRoundService;
  const sides = signal<InventoryRoundSide[]>([]);
  const progress = signal({ round: 0, currentIdentifier: '' });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    hero = GameCharacter.create('勇者', 1, '');
    goblin = GameCharacter.create('ゴブリン', 1, '');
    bystander = GameCharacter.create('村人', 1, '');
    round = TestBed.inject(InventoryRoundService);
    sides.set([
      { side: 'ally', name: '味方', color: '#00f', members: [hero] },
      { side: 'enemy', name: '敵', color: '#f00', members: [goblin] },
    ]);
    progress.set({ round: 0, currentIdentifier: '' });
    Object.defineProperty(round, 'sides', { value: sides, configurable: true });
    Object.defineProperty(round, 'progress', { value: progress, configurable: true });
  });

  afterEach(() => {
    for (const piece of [hero, goblin, bystander]) piece.destroy();
    vi.restoreAllMocks();
  });

  function setup(over: Partial<InventoryTurnsHost> = {}) {
    const pieces = [goblin, bystander, hero];
    const host: InventoryTurnsHost = {
      selectTab: () => 'table',
      showsTree: () => false,
      hasQuery: () => false,
      rows: () => pieces.map((piece) => buildInventoryRow(piece, '')),
      tableRows: (): InventoryTableRow[] => pieces.map((piece) => ({ object: piece, order: 0, cells: [] })),
      stripWaitsForRound: () => true,
      ...over,
    };
    return TestBed.runInInjectionContext(() => new InventoryTurns(host));
  }

  it('gathers the rows of the table under their sides, the pieces of no side last', () => {
    const bands = setup().sideBands()!;

    expect(bands.map((band) => band.rows.map((row) => row.object.name))).toEqual([['勇者'], ['ゴブリン'], ['村人']]);
    expect(bands.slice(0, 2).map((band) => band.name)).toEqual(['味方', '敵']);
  });

  it('gathers the rows of the table view the same way', () => {
    const bands = setup().tableSideBands()!;

    expect(bands.map((band) => band.rows.map((row) => row.object.name))).toEqual([['勇者'], ['ゴブリン'], ['村人']]);
  });

  it('gathers nothing on another tab, under a search, or while the round is not taken side by side', () => {
    expect(setup({ selectTab: () => 'common' }).sideBands()).toBeNull();
    expect(setup({ selectTab: () => 'common' }).tableSideBands()).toBeNull();
    expect(setup({ hasQuery: () => true }).sideBands()).toBeNull();
    expect(setup({ hasQuery: () => true }).tableSideBands()).toBeNull();

    sides.set([]);
    expect(setup().sideBands()).toBeNull();
    expect(setup().tableSideBands()).toBeNull();
  });

  it('leaves the list to its folders where it is gathered into them, but not the table view', () => {
    const turns = setup({ showsTree: () => true });

    expect(turns.sideBands()).toBeNull();
    expect(turns.tableSideBands()).not.toBeNull();
  });

  it('puts the strip away only until a round begins, and only where the reader asks for that', () => {
    expect(setup().waitsForPlay()).toBe(true);
    expect(setup({ stripWaitsForRound: () => false }).waitsForPlay()).toBe(false);

    progress.set({ round: 1, currentIdentifier: hero.identifier });
    expect(setup().waitsForPlay()).toBe(false);
  });

  it('gives the turn to the piece of a row without the press selecting the row', () => {
    const give = vi.spyOn(round, 'giveTurnTo').mockImplementation(() => undefined);
    const event = new Event('click');
    const stopped = vi.spyOn(event, 'stopPropagation');

    setup().give(event, goblin);

    expect(stopped).toHaveBeenCalledTimes(1);
    expect(give).toHaveBeenCalledWith(goblin.identifier);
  });

  it('tells the menu of a row what it may do with the turn, and does it', () => {
    const turnOrder = TestBed.inject(TurnOrderService);
    vi.spyOn(turnOrder, 'mayHold').mockReturnValue(true);
    vi.spyOn(turnOrder, 'mayInterrupt').mockReturnValue(false);
    const hold = vi.spyOn(turnOrder, 'hold').mockImplementation(() => undefined);
    const interrupt = vi.spyOn(turnOrder, 'interrupt').mockImplementation(() => undefined);
    const turns = setup();

    expect(turns.menuStateOf(hero)).toEqual({ mayHold: true, mayInterrupt: false });
    turns.hold(hero);
    turns.interrupt(goblin);

    expect(hold).toHaveBeenCalledWith(hero.identifier);
    expect(interrupt).toHaveBeenCalledWith(goblin.identifier);
  });
});
