import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  buildMultiSelectionContextMenu,
  tryBuildMultiSelectionContextMenu,
} from '@axe/application/ui/multi-selection-context-menu';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

const t = ((key: string, params?: Record<string, unknown>) => {
  if (params?.count != null) return `${key}(${params.count})`;
  return key;
}) as Parameters<typeof buildMultiSelectionContextMenu>[1]['t'];

function makeObj(id: string, opts: { isLock?: boolean } = {}): TabletopObject {
  const cloneCalls = { x: 0, y: 0 };
  const obj: Record<string, unknown> = {
    identifier: id,
    aliasName: 'character',
    isLock: opts.isLock ?? false,
    location: { name: 'table', x: 100, y: 100 },
    setLocation(_n: string) {
      this.lastSetLocation = _n;
    },
    update() {
      this.updateCalls = ((this.updateCalls as number | undefined) ?? 0) + 1;
    },
    clone(): unknown {
      const newId = `${id}-clone`;
      cloneCalls.x += 1;
      const inner: Record<string, unknown> = {
        identifier: newId,
        aliasName: 'character',
        location: { name: 'table', x: (obj.location as { x: number }).x, y: (obj.location as { y: number }).y },
      };
      inner.update = () => {
        inner.updateCalls = ((inner.updateCalls as number | undefined) ?? 0) + 1;
      };
      return inner;
    },
  };
  return obj as unknown as TabletopObject;
}

describe('buildMultiSelectionContextMenu', () => {
  it('offers list, copy all, graveyard and clear', () => {
    const selection = new SelectionSignalService();
    const objs = [makeObj('a'), makeObj('b'), makeObj('c')];
    selection.replaceSelection(['a', 'b', 'c']);
    const menu = buildMultiSelectionContextMenu(objs, { t, selectionSignalService: selection, gridSize: 50 });

    expect(menu[0].name).toContain('countLabel(3)');
    expect(menu[1]).toBe(ContextMenuSeparator);
    expect((menu[2] as ContextMenuAction).name).toContain('copyAll');
    expect((menu[3] as ContextMenuAction).name).toContain('moveAllGraveyard');
    expect((menu[5] as ContextMenuAction).name).toContain('clear');
  });

  it('clears the selection from the clear action', () => {
    const selection = new SelectionSignalService();
    selection.replaceSelection(['a', 'b']);
    const menu = buildMultiSelectionContextMenu([makeObj('a'), makeObj('b')], {
      t,
      selectionSignalService: selection,
      gridSize: 50,
    });
    const clearAction = menu[5] as ContextMenuAction;
    clearAction.action?.();
    expect(selection.selectionSize()).toBe(0);
  });

  it('hangs every copy on whatever the original hung from', () => {
    const table = { appendChild: vi.fn() };
    const one = makeObj('a');
    (one as unknown as { parent: unknown }).parent = table;
    const selection = new SelectionSignalService();
    selection.replaceSelection(['a']);
    const menu = buildMultiSelectionContextMenu([one], { t, selectionSignalService: selection, gridSize: 50 });

    (menu[2] as ContextMenuAction).action?.();

    expect(table.appendChild).toHaveBeenCalledTimes(1);
    expect((table.appendChild.mock.calls[0][0] as { identifier: string }).identifier).toBe('a-clone');
  });

  it('leaves locked objects out of copy all and move all', () => {
    const selection = new SelectionSignalService();
    const a = makeObj('a');
    const b = makeObj('b', { isLock: true });
    selection.replaceSelection(['a', 'b']);
    const menu = buildMultiSelectionContextMenu([a, b], { t, selectionSignalService: selection, gridSize: 50 });
    const moveAll = menu[3] as ContextMenuAction;
    moveAll.action?.();
    expect((a as unknown as { lastSetLocation?: string }).lastSetLocation).toBe('graveyard');
    expect((b as unknown as { lastSetLocation?: string }).lastSetLocation).toBeUndefined();
  });
});

describe('the dice among a selection', () => {
  const created: DiceSymbol[] = [];

  function makeDie(name: string): TabletopObject {
    const die = DiceSymbol.create(name, DiceType.D6, 1);
    die.location.name = 'table';
    created.push(die);
    return die as unknown as TabletopObject;
  }

  afterEach(() => {
    for (const die of created.splice(0)) die.destroy();
  });

  const owners = [{ identifier: 'goblin', name: 'ゴブリンA' }];

  it('offers to throw them together', () => {
    const selection = new SelectionSignalService();
    const menu = buildMultiSelectionContextMenu([makeDie('a'), makeDie('b')], {
      t,
      selectionSignalService: selection,
      gridSize: 50,
      rollDice: () => undefined,
    });

    expect(menu.map((entry) => (entry as ContextMenuAction).name)).toContain(
      'feature.tabletop.selection.rollAllDice(2)'
    );
  });

  it('offers to put them away into a piece', () => {
    const selection = new SelectionSignalService();
    const menu = buildMultiSelectionContextMenu([makeDie('a'), makeDie('b')], {
      t,
      selectionSignalService: selection,
      gridSize: 50,
      diceOwners: owners,
      storeDice: () => undefined,
    });
    const away = menu.find(
      (entry) => (entry as ContextMenuAction).name === 'feature.tabletop.selection.storeAllDice(2)'
    ) as ContextMenuAction;

    expect(away.subActions?.map((entry) => entry.name)).toEqual(['ゴブリンA']);
  });

  it('puts every one of them away into the piece that was chosen', () => {
    const selection = new SelectionSignalService();
    const stored: { count: number; owner: string }[] = [];
    const menu = buildMultiSelectionContextMenu([makeDie('a'), makeDie('b')], {
      t,
      selectionSignalService: selection,
      gridSize: 50,
      diceOwners: owners,
      storeDice: (dice, owner) => stored.push({ count: dice.length, owner }),
    });

    const away = menu.find(
      (entry) => (entry as ContextMenuAction).name === 'feature.tabletop.selection.storeAllDice(2)'
    ) as ContextMenuAction;
    away.subActions?.[0].action?.();

    expect(stored).toEqual([{ count: 2, owner: 'goblin' }]);
  });

  it('offers neither where the selection holds no dice', () => {
    const selection = new SelectionSignalService();
    const menu = buildMultiSelectionContextMenu([makeObj('a')], {
      t,
      selectionSignalService: selection,
      gridSize: 50,
      rollDice: () => undefined,
      diceOwners: owners,
      storeDice: () => undefined,
    });
    const names = menu.map((entry) => (entry as ContextMenuAction).name);

    expect(names).not.toContain('feature.tabletop.selection.rollAllDice(1)');
    expect(names).not.toContain('feature.tabletop.selection.storeAllDice(1)');
  });

  it('offers no destination with no pieces to put them into', () => {
    const selection = new SelectionSignalService();
    const menu = buildMultiSelectionContextMenu([makeDie('a')], {
      t,
      selectionSignalService: selection,
      gridSize: 50,
      storeDice: () => undefined,
    });

    expect(menu.map((entry) => (entry as ContextMenuAction).name)).not.toContain(
      'feature.tabletop.selection.storeAllDice(1)'
    );
  });
});

describe('tryBuildMultiSelectionContextMenu', () => {
  it('offers nothing for a selection of one', () => {
    const selection = new SelectionSignalService();
    selection.addSelection('a');
    const objectStore = ObjectStore.instance;
    const obj = makeObj('a');
    expect(
      tryBuildMultiSelectionContextMenu({ self: obj, selectionSignalService: selection, objectStore, t, gridSize: 50 })
    ).toBeNull();
  });

  it('offers nothing when the object is outside the selection', () => {
    const selection = new SelectionSignalService();
    selection.replaceSelection(['a', 'b']);
    const objectStore = ObjectStore.instance;
    const other = makeObj('c');
    expect(
      tryBuildMultiSelectionContextMenu({
        self: other,
        selectionSignalService: selection,
        objectStore,
        t,
        gridSize: 50,
      })
    ).toBeNull();
  });
});
