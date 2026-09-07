import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import {
  buildTableAmbienceContextMenu,
  buildTableAmbienceContextMenuModel,
} from '@axe/features/tabletop/table-ambience/table-ambience-context-menu';

const t = ((key: string) => key) as Parameters<typeof buildTableAmbienceContextMenu>[3];

type Menu = ReturnType<typeof buildTableAmbienceContextMenu>;
type SubMenu = { subActions: { name: string; action: () => void }[] };

function findByName(menu: Menu, fragment: string) {
  return menu.find((item) => 'name' in item && item.name.includes(fragment));
}

describe('buildTableAmbienceContextMenu', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeAmbience(): TableAmbience {
    return TableAmbience.create('毒沼', 'swamp', 4, 4);
  }

  it('hangs a copy on the table the original hangs on', () => {
    // The copy itself is built by going out to xml and back, which happy-dom will not do: its
    // parser turns away an attribute with a dot in its name, and every object on the table
    // carries location.name. What is under test here is where the copy is hung, not how it is made.
    const table = new GameTable();
    table.initialize();
    store.add(table);
    const ambience = makeAmbience();
    table.appendChild(ambience);
    const made = TableAmbience.create('毒沼', 'swamp', 4, 4);
    made.isLock = true;
    vi.spyOn(ambience, 'clone').mockReturnValue(made);

    const copy = findByName(
      buildTableAmbienceContextMenu(ambience, 50, () => undefined, t),
      'copy'
    );
    (copy as { action: () => void }).action();

    expect(table.ambiences).toContain(made);
    expect(made.location.x).toBe(ambience.location.x + 50);
    expect(made.isLock).toBe(false);
  });

  it('switches kind on a choice', () => {
    const ambience = makeAmbience();
    const kinds = findByName(
      buildTableAmbienceContextMenu(ambience, 50, () => undefined, t),
      'kind'
    ) as SubMenu;
    kinds.subActions.find((item) => item.name.includes('vent'))!.action();
    expect(ambience.kind).toBe('vent');
  });

  it('marks the kind in use', () => {
    const ambience = makeAmbience();
    const kinds = findByName(
      buildTableAmbienceContextMenu(ambience, 50, () => undefined, t),
      'kind'
    ) as SubMenu;
    expect(kinds.subActions.find((item) => item.name.includes('swamp'))!.name.startsWith('✔')).toBe(true);
  });

  it('takes a change of density', () => {
    const ambience = makeAmbience();
    const density = findByName(
      buildTableAmbienceContextMenu(ambience, 50, () => undefined, t),
      'density'
    ) as SubMenu;
    density.subActions.find((item) => item.name.includes('densityThick'))!.action();
    expect(ambience.density).toBe(1);
  });

  it('keeps the centre still as the area grows', () => {
    const ambience = makeAmbience();
    ambience.location.x = 200;
    ambience.location.y = 400;

    const size = findByName(
      buildTableAmbienceContextMenu(ambience, 50, () => undefined, t),
      'size'
    ) as SubMenu;
    size.subActions.find((item) => item.name.startsWith('6') || item.name.includes(' 6 '))!.action();

    expect(ambience.width).toBe(6);
    expect(ambience.location.x).toBe(150);
    expect(ambience.location.y).toBe(350);
  });

  it('passes the settings action through', () => {
    let opened = 0;
    const menu = buildTableAmbienceContextMenu(makeAmbience(), 50, () => (opened += 1), t);
    (findByName(menu, 'settings') as { action: () => void }).action();
    expect(opened).toBe(1);
  });

  it('groups every action for the rotating menu without changing the ordinary menu order', () => {
    const model = buildTableAmbienceContextMenuModel(makeAmbience(), 50, () => undefined, t);
    const ordinaryActions = model.actions.filter((action) => action.type !== 'separator');
    const radialActions = model.radialGroups.flatMap((group) => group.actions);

    expect(model.radialGroups.map((group) => group.name)).toEqual([
      'feature.ambience.contextMenu.radialAppearance',
      'feature.ambience.contextMenu.radialObject',
    ]);
    expect(radialActions).toEqual(expect.arrayContaining(ordinaryActions));
    expect(radialActions).toHaveLength(ordinaryActions.length);
    expect(model.actions.map((action) => action.name)).toEqual(
      buildTableAmbienceContextMenu(makeAmbience(), 50, () => undefined, t).map((action) => action.name)
    );
  });

  it('takes it out of the store on delete', () => {
    const ambience = makeAmbience();
    const menu = buildTableAmbienceContextMenu(ambience, 50, () => undefined, t);
    (findByName(menu, 'delete') as { action: () => void }).action();
    expect(store.get(ambience.identifier)).toBeNull();
  });
});
