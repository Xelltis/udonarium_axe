import { TestBed } from '@angular/core/testing';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PieceContextMenuService', () => {
  let service: PieceContextMenuService;
  let contextMenu: ContextMenuService;
  let selection: SelectionSignalService;

  const position = { x: 10, y: 20, z: 0 };

  function character(name: string): GameCharacter {
    return GameCharacter.create(name, 1, '');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(PieceContextMenuService);
    contextMenu = TestBed.inject(ContextMenuService);
    selection = TestBed.inject(SelectionSignalService);
  });

  afterEach(() => {
    selection.clearSelection();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('offers nothing when only one thing is selected', () => {
    const open = vi.spyOn(contextMenu, 'open').mockReturnValue(undefined as never);
    const alone = character('斥候');
    selection.addSelection(alone.identifier, alone.aliasName);

    expect(service.openForSelection(alone, 50, position)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('offers the bulk actions for a group selection', () => {
    const open = vi.spyOn(contextMenu, 'open').mockReturnValue(undefined as never);
    const first = character('斥候');
    const second = character('斥候の相棒');
    selection.addSelection(first.identifier, first.aliasName);
    selection.addSelection(second.identifier, second.aliasName);

    expect(service.openForSelection(first, 50, position)).toBe(true);
    expect(open).toHaveBeenCalledOnce();
  });

  it('does not go bulk for an object outside the selection', () => {
    // A right-click outside the selection asks about that object, not the group.
    const open = vi.spyOn(contextMenu, 'open').mockReturnValue(undefined as never);
    const first = character('斥候');
    const second = character('斥候の相棒');
    const outsider = character('通りすがり');
    selection.addSelection(first.identifier, first.aliasName);
    selection.addSelection(second.identifier, second.aliasName);

    expect(service.openForSelection(outsider, 50, position)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  describe('openPieceMenu', () => {
    const menu = { actions: [{ name: 'one', action: () => undefined }], radialGroups: [] };
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.initialize();
    });

    it('opens the plain list on a table that is not laid flat', () => {
      table.mode2d = false;
      table.tabletopMenuStyle = 'radial';
      const open = vi.spyOn(contextMenu, 'open').mockReturnValue(undefined as never);
      const openRadial = vi.spyOn(contextMenu, 'openRadial').mockReturnValue(undefined as never);

      service.openPieceMenu(position, menu, '斥候');

      expect(open).toHaveBeenCalledWith(position, menu.actions, '斥候');
      expect(openRadial).not.toHaveBeenCalled();
    });

    it('opens the rotating menu the seat asked for on a flat table, with its speed and the font scale', () => {
      table.mode2d = true;
      table.tabletopMenuStyle = 'radial';
      table.radialMenuRotationSpeed = 8;
      const open = vi.spyOn(contextMenu, 'open').mockReturnValue(undefined as never);
      const openRadial = vi.spyOn(contextMenu, 'openRadial').mockReturnValue(undefined as never);

      service.openPieceMenu(position, menu, '斥候');

      expect(openRadial).toHaveBeenCalledWith(position, menu.actions, menu.radialGroups, '斥候', true, 8, 1);
      expect(open).not.toHaveBeenCalled();
    });

    it('opens the four-way launcher as the rotating menu switched off', () => {
      table.mode2d = true;
      table.tabletopMenuStyle = 'four-way';
      table.radialMenuRotationSpeed = 6;
      const openRadial = vi.spyOn(contextMenu, 'openRadial').mockReturnValue(undefined as never);

      service.openPieceMenu(position, menu, '斥候');

      expect(openRadial).toHaveBeenCalledWith(position, menu.actions, menu.radialGroups, '斥候', false, 6, 1);
    });

    it('opens the plain list on a flat table whose seat wants it plain', () => {
      table.mode2d = true;
      table.tabletopMenuStyle = 'standard';
      const open = vi.spyOn(contextMenu, 'open').mockReturnValue(undefined as never);
      const openRadial = vi.spyOn(contextMenu, 'openRadial').mockReturnValue(undefined as never);

      service.openPieceMenu(position, menu, '斥候');

      expect(open).toHaveBeenCalledWith(position, menu.actions, '斥候');
      expect(openRadial).not.toHaveBeenCalled();
    });
  });
});
